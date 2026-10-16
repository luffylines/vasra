const { randomUUID } = require('node:crypto');
const S = require('./security.cjs');
const { getConfig, SupabaseBackend } = require('./supabase.cjs');
const CHUNK = 1024 * 1024, MAX_IMAGE = 5 * CHUNK;

async function sendAccountEmail(to,link,kind) {
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
 if(!apiKey || !/^.{1,100}@[^\s@]+\.[^\s@]+$/.test(from||'')) S.fail(503,'Email recovery is not configured on this deployment.');
 const change=kind==='email';
 const subject=change?'Verify your new SK Vasra email':'Reset your SK Vasra password';
 const intro=change?'Confirm your new email address for your SK Vasra account.':'Use the secure link below to reset your SK Vasra password.';
 const expires=change?'15 minutes':'30 minutes';
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,text:intro+'\n\n'+link+'\n\nExpires in '+expires+'. If you did not request this, ignore the email.'}),signal:AbortSignal.timeout(10000)}).catch(()=>null);
 if(!response?.ok)S.fail(503,'Hindi maipadala ang verification email. Subukan muli mamaya.');
}
function accountLink(config,kind,token) {
 if(!config.origin || !config.origin.startsWith('https://')) S.fail(503,'Configure PUBLIC_ORIGIN before enabling email links.');
 return config.origin+'/account#'+(kind==='email'?'verify_email':'reset')+'='+encodeURIComponent(token);
}

const securityHeaders = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' };
function createHandler({ backend, config } = {}) {
  return async function handle(request, context = {}) {
    let cfg;
    const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...securityHeaders, ...headers } });
    try {
      cfg = config || getConfig();
      const db = backend || new SupabaseBackend(cfg);
      const url = new URL(request.url);
      let path = url.pathname;
      if (path === '/api/index' || path === '/api/index.mjs') path = '/api/' + (url.searchParams.get('__path') || '');
      const method = request.method;
      if (!['GET','POST','PUT'].includes(method)) S.fail(405, 'Method not allowed.');
      if (method !== 'GET') {
        const origin = cfg.origin || (!cfg.secure && context.local ? url.origin : null);
        if (!origin || request.headers.get('origin') !== origin) S.fail(403, 'Hindi pinapayagang request origin.');
      }
      const cookie = request.headers.get('cookie') || '';
      const token = cookie.split(';').map(v => v.trim()).find(v => v.startsWith('vasra_session='))?.slice(14);
      const session = token && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? S.hash(token) : null;
      async function rpc(action, payload = {}) {
        const result = await db.rpc(action, payload, session);
        if (result?.error) {
          const messages = {400:'Suriin ang ipinadalang detalye.',401:'Mag-login muna.',403:'Wala kang pahintulot para rito.',404:'Hindi makita ang record.',409:'May existing o mas bagong record. I-refresh at subukan muli.',429:'Maraming upload. Subukan muli mamaya.'};
          S.fail(result.error, result.reason === 'password_change_required' ? 'Palitan muna ang pansamantalang password.' : messages[result.error] || 'Hindi natuloy ang request.');
        }
        return result;
      }
      const sessionCookie = value => ({ 'Set-Cookie': `vasra_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? 28800 : 0}${cfg.secure ? '; Secure' : ''}` });
      async function body() {
        if (!request.headers.get('content-type')?.startsWith('application/json')) S.fail(415, 'JSON ang kailangan.');
        if (Number(request.headers.get('content-length')) > 4200000) S.fail(413, 'Gamitin ang chunked upload para sa malaking larawan.');
        const reader = request.body?.getReader(); if (!reader) S.fail(400, 'Invalid request.');
        let length = 0; const chunks = [];
        while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 4200000) { await reader.cancel(); S.fail(413, 'Masyadong malaki ang request.'); } chunks.push(value); }
        let b; try { b = JSON.parse(Buffer.concat(chunks).toString()); } catch { S.fail(400, 'Invalid JSON.'); }
        if (!b || Array.isArray(b) || typeof b !== 'object') S.fail(400, 'Invalid request.'); return b;
      }
      async function user(roles = ['sk','chairman'], allowPasswordChange = false) {
        const u = await rpc('me'); if (!u) S.fail(401, 'Mag-login muna.');
        if ((!allowPasswordChange && u.must_change) || !roles.includes(u.role)) S.fail(403, 'Wala kang pahintulot o kailangan munang magpalit ng password.'); return u;
      }
      async function limit(kind, identity, limit) {
        const key = S.hash(kind + ':' + identity);
        if (!(await db.rpc('rate_limit', { key, limit })).allowed) S.fail(429, 'Maraming pagtatangka. Subukan muli pagkalipas ng 15 minuto.');
      }
      if (path === '/api/transparency' && method === 'GET') {
        const year = Number(url.searchParams.get('year') || new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric'}).format(new Date()));
        if (!Number.isInteger(year) || year<2000 || year>2100) S.fail(400,'Invalid fiscal year.');
        const result=await db.rpc('transparency_public',{year});
        return json(result);
      }
      if (path === '/api/transparency/manage' && method === 'GET') {
        await user();
        const year=Number(url.searchParams.get('year')||new Date().getFullYear());
        if (!Number.isInteger(year)||year<2000||year>2100) S.fail(400,'Invalid fiscal year.');
        return json(await rpc('transparency_manage',{year}));
      }
      if (path === '/api/transparency/budget' && method === 'POST') {
        await user();
        const b=await body();
        const year=Number(b.year),amount=Number(b.amount);
        if (!Number.isInteger(year)||year<2000||year>2100||!Number.isFinite(amount)||amount<0||amount>999999999999||Math.abs(Math.round(amount*100)-amount*100)>0.00001) S.fail(400,'Invalid annual budget.');
        const result=await rpc('transparency_budget',{year,amount,reference:String(b.reference||'').slice(0,300),published:b.published===true});
        return json(result);
      }
      if (path === '/api/transparency/month' && method === 'POST') {
        await user();
        const b=await body();
        const month=String(b.month||''), summary=S.text(b.summary,2000,'monthly update');
        if (!/^20\d\d-(0[1-9]|1[0-2])-01$/.test(month)) S.fail(400,'Month must use YYYY-MM-01.');
        let expense=null;
        if(b.expense!==null && b.expense!==undefined && String(b.expense).trim()!==''){
          expense=Number(b.expense);
          if(!Number.isFinite(expense)||expense<0||expense>999999999999||Math.abs(Math.round(expense*100)-expense*100)>0.00001) S.fail(400,'Invalid amount spent.');
        }
        return json(await rpc('transparency_month',{project_id:S.uuid(b.project_id),month,summary,expense,published:b.published===true}));
      }
      if (path === '/api/transparency/official/remove' && method === 'POST') {
        await user(['chairman']);
        const b=await body();
        return json(await rpc('transparency_official_remove',{id:S.uuid(b.id)}));
      }
      if (path === '/api/transparency/official' && method === 'POST') {
        await user(['chairman']);
        const b=await body();
        if (!['chairman','kagawad','treasurer','secretary'].includes(b.position)) S.fail(400,'Invalid position.');
        const sort=Number(b.sort||10);
        if (!Number.isInteger(sort)||sort<0||sort>1000) S.fail(400,'Invalid display order.');
        return json(await rpc('transparency_official',{id:b.id?S.uuid(b.id):null,name:S.text(b.name,100,'officer name'),position:b.position,sort,published:b.published===true}));
      }
      if (path === '/api/duty-status' && method === 'GET') {
        const result = await db.rpc('duty_status');
        return json(result);
      }
      if (path === '/api/duty-status' && method === 'POST') {
        await user(['chairman','sk']);
        const b = await body();
        if (!['closed','auto'].includes(b.mode)) S.fail(400,'Invalid duty status.');
        const result = await db.rpc('duty_set',{mode:b.mode},session);
        if (result?.error) S.fail(result.error===403?403:400,result.reason==='not_assigned_today'?'Only today’s assigned SK officer can update duty status.':'Cannot update duty status.');
        return json(result);
      }
      if (path === '/api/register' && method === 'POST') S.fail(403, 'Walang public registration. Makipag-ugnay sa SK chairman.');
      if (path === '/api/me' && method === 'GET') return json({ user: S.safeUser(await rpc('me')) });
      if (path === '/api/login' && method === 'POST') {
        await limit('login-ip', context.ip || 'unknown', 40);
        const b = await body(), email = S.email(b.email);
        if (typeof b.password !== 'string' || b.password.length > 200) S.fail(400, 'Invalid password.');
        await limit('login-account', email, 15);
        const u = await db.rpc('login_lookup', { email });
        const valid = await S.passwordMatch(b.password, u?.password);
        if (!u || !valid || !['sk','chairman'].includes(u.role)) S.fail(401, 'Mali ang email, password, o walang SK access.');
        const t = S.randomToken();
        const result = await rpc('login_commit', { id: u.id, expected_password: u.password, token: S.hash(t) });
        return json({ user: S.safeUser(result) }, 200, sessionCookie(t));
      }
      if (path === '/api/logout' && method === 'POST') { await rpc('logout'); return json({ ok: true }, 200, sessionCookie('')); }
      if (path === '/api/password' && method === 'POST') {
        const u = await user(['sk','chairman'], true); await limit('password', u.id, 15); const b = await body(); S.password(b.password);
        if (typeof b.current !== 'string' || b.current.length > 200 || !await S.passwordMatch(b.current, u.password)) S.fail(400, 'Mali ang kasalukuyang password.');
        if (b.current === b.password) S.fail(400, 'Gumamit ng bagong password.');
        const t = S.randomToken(); const updated = await rpc('password', { expected_password: u.password, password: await S.passwordHash(b.password), token: S.hash(t) });
        return json({ user: S.safeUser(updated) }, 200, sessionCookie(t));
      }

      if (path === '/api/account/capabilities' && method === 'GET') {
        let ready=false;
        if(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL&&cfg.origin?.startsWith('https://')){
          try{ready=(await db.rpc('account_health'))?.ready===true;}catch{ready=false;}
        }
        return json({ready});
      }
      // One-time account links are sent only from the server. Hashes, never raw tokens, are stored.
      if (path === '/api/account/email/request' && method === 'POST') {
        const u=await user(); await limit('email-change',u.id,4);
        const b=await body(),next=S.email(b.email);
        if (typeof b.current!=='string'||b.current.length>200||!await S.passwordMatch(b.current,u.password)) S.fail(400,'Mali ang kasalukuyang password.');
        if(next===u.email)S.fail(400,'Ilagay ang iyong bagong email address.');
        const t=S.randomToken(),link=accountLink(cfg,'email',t);
        // Check delivery configuration before generating a token.
        if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)S.fail(503,'Email verification is not configured.');
        await rpc('account_email_prepare',{email:next,token_hash:S.hash(t)});
        try { await sendAccountEmail(next,link,'email'); }
        catch(e){ await db.rpc('account_cancel_token',{token_hash:S.hash(t)},session).catch(()=>{});throw e; }
        return json({ok:true});
      }
      if (path === '/api/account/email/confirm' && method === 'POST') {
        await limit('email-confirm-ip',context.ip||'unknown',20);
        const b=await body();
        if(typeof b.token!=='string'||!/^[A-Za-z0-9_-]{40,128}$/.test(b.token)) S.fail(400,'Invalid verification link.');
        await rpc('account_email_confirm',{token_hash:S.hash(b.token)});
        return json({ok:true},200,sessionCookie(''));
      }
      if (path === '/api/account/reset/request' && method === 'POST') {
        await limit('reset-ip',context.ip||'unknown',8);
        const b=await body(),email=S.email(b.email);
        await limit('reset-email',email,4);
        if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)S.fail(503,'Password recovery is not yet configured.');
        const t=S.randomToken(),link=accountLink(cfg,'reset',t);
        const result=await rpc('account_reset_prepare',{email,token_hash:S.hash(t)});
        if(result?.delivery_email){
          try { await sendAccountEmail(result.delivery_email,link,'reset'); }
          catch { await db.rpc('account_cancel_token',{token_hash:S.hash(t)}).catch(()=>{}); console.warn('SK Vasra reset email delivery failed'); }
        }
        // Same response for known and unknown accounts to avoid user enumeration.
        return json({ok:true});
      }
      if (path === '/api/account/reset/confirm' && method === 'POST') {
        await limit('reset-confirm-ip',context.ip||'unknown',15);
        const b=await body();
        if(typeof b.token!=='string'||!/^[A-Za-z0-9_-]{40,128}$/.test(b.token))S.fail(400,'Invalid reset link.');
        S.password(b.password);
        const result=await db.rpc('account_reset_confirm',{token_hash:S.hash(b.token),password:await S.passwordHash(b.password)});
        if(result?.error)S.fail(400,'Invalid or expired password reset link.');
        return json({ok:true},200,sessionCookie(''));
      }
      if (path === '/api/projects' && method === 'GET') return json({ projects: await rpc('public_projects') });
      if (path === '/api/manage/projects' && method === 'GET') return json({ projects: await rpc('manage_projects') });
      if ((path === '/api/manage/projects' && method === 'POST') || (/^\/api\/manage\/projects\/[^/]+$/.test(path) && method === 'PUT')) {
        await user(); const b = await body();
        const p = { title:S.text(b.title,150,'pamagat'), category:S.text(b.category,60,'kategorya'), description:S.text(b.description,1000,'buod'), scope:S.text(b.scope,5000,'detalye'), status:b.status, progress:b.progress, published:b.published, image_id:b.image_id ? S.uuid(b.image_id) : null };
        if (!['Pinaplano','Isinasagawa','Natapos'].includes(p.status) || !Number.isInteger(p.progress) || p.progress < 0 || p.progress > 100 || typeof p.published !== 'boolean' || (p.status === 'Natapos' && p.progress !== 100)) S.fail(400, 'Suriin ang status at progreso.');
        if (method === 'PUT') { p.id = S.uuid(path.split('/').pop()); if (!Number.isInteger(b.version) || b.version < 1) S.fail(400, 'Invalid project version.'); p.version=b.version; }
        return json({ project: await rpc('save_project', p) }, method === 'POST' ? 201 : 200);
      }
      if (path === '/api/users' && method === 'GET') return json({ users: await rpc('users') });
      if (path === '/api/users' && method === 'POST') {
        const u = await user(['chairman']); await limit('create-user', u.id, 20); const b = await body(), temporaryPassword = S.randomToken();
        const created = await rpc('create_user', { name:S.text(b.name,100,'pangalan'),email:S.email(b.email),position:['kagawad','treasurer','secretary'].includes(b.position)?b.position:'kagawad',password:await S.passwordHash(temporaryPassword) });
        return json({ user:S.safeUser(created), temporaryPassword }, 201);
      }
      if (/^\/api\/users\/[^/]+\/role$/.test(path) && method === 'PUT') {
        await user(['chairman']); const b = await body(); if (!['sk','youth'].includes(b.role)) S.fail(400,'Invalid role.');
        return json(await rpc('role', { id:S.uuid(path.split('/')[3]),role:b.role }));
      }
      if (/^\/api\/users\/[^/]+\/position$/.test(path) && method === 'PUT') {
        await user(['chairman']); const b = await body();
        if (!['kagawad','treasurer','secretary'].includes(b.position)) S.fail(400,'Invalid SK designation.');
        return json(await rpc('position',{id:S.uuid(path.split('/')[3]),position:b.position}));
      }
      if (path === '/api/audit' && method === 'GET') {
        const offset = Number(url.searchParams.get('offset') || 0); if (!Number.isInteger(offset) || offset<0 || offset>100000) S.fail(400,'Invalid offset.');
        const result = await rpc('audit',{offset});
        // The existing browser expects the legacy SQLite JSON-string details shape.
        return json({ ...result, events: result.events.map(e => ({ ...e, details:JSON.stringify(e.details) })) });
      }
      if (path === '/api/uploads' && method === 'POST') {
        const u = await user(); await limit('upload',u.id,300); const b = await body();
        const begin = async (size,mime) => { if (!Number.isInteger(size) || size<1 || size>MAX_IMAGE || !['image/png','image/jpeg','image/webp'].includes(mime)) S.fail(400,'PNG, JPG, o WebP lamang, hanggang 5 MB.'); return rpc('upload_begin',{bytes:size,mime,path:randomUUID()}); };
        if (b.action === 'begin') { const img = await begin(b.size,b.mime); return json({id:img.id,chunkSize:CHUNK},201); }
        if (b.action === 'chunk') {
          const img = await rpc('upload_get',{id:S.uuid(b.id)}), index=b.index, bytes=S.base64(b.data);
          const count=Math.ceil(img.bytes/CHUNK), expected=index===count-1?img.bytes-CHUNK*index:CHUNK;
          if (img.ready || !Number.isInteger(index) || index<0 || index>=count || bytes.length!==expected) S.fail(400,'Invalid upload chunk.');
          const digest=S.hash(bytes); if (img.chunks[String(index)] && img.chunks[String(index)]!==digest) S.fail(409,'Upload conflict.');
          await db.put(`pending/${img.id}/${index}`,bytes,'application/octet-stream');
          await rpc('upload_chunk',{id:img.id,index,digest}); return json({ok:true});
        }
        if (b.action === 'complete') {
          const img=await rpc('upload_get',{id:S.uuid(b.id)}); if (img.ready) return json({id:img.id},201);
          const chunks=[],paths=[];
          for(let i=0;i<Math.ceil(img.bytes/CHUNK);i++){if(!img.chunks[String(i)])S.fail(409,'Hindi pa kumpleto ang upload.');const p=`pending/${img.id}/${i}`,bytes=await db.get(p);if(S.hash(bytes)!==img.chunks[String(i)])S.fail(409,'Upload integrity check failed.');chunks.push(bytes);paths.push(p);}
          const bytes=Buffer.concat(chunks);if(bytes.length!==img.bytes)S.fail(400,'Invalid image size.');S.imageValid(bytes,img.mime);
          await db.put(img.storage_path,bytes,img.mime);await rpc('upload_finish',{id:img.id});
          try{await db.remove(paths)}catch{console.warn('Temporary upload cleanup deferred');}
          return json({id:img.id},201);
        }
        if(b.action)S.fail(400,'Invalid upload action.');
        // Compatibility with existing callers below the Vercel body limit.
        const bytes=S.base64(b.data);S.imageValid(bytes,b.mime);const img=await begin(bytes.length,b.mime);
        await db.put(img.storage_path,bytes,b.mime);await rpc('upload_finish',{id:img.id});return json({id:img.id},201);
      }
      if (/^\/api\/images\/[^/]+$/.test(path) && method==='GET') {
        const img=await rpc('image',{id:S.uuid(path.split('/').pop())});const bytes=await db.get(img.storage_path);
        // Stream bodies instead of buffering a >4.5 MB serverless response.
        const stream=new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=65536)controller.enqueue(bytes.subarray(i,i+65536));controller.close();}});
        return new Response(stream,{headers:{...securityHeaders,'Content-Type':img.mime}});
      }
      S.fail(404,'Hindi makita ang endpoint.');
    } catch(error) {
      if (!error.status) console.error('VASRA request failed', { type:error.name });
      return json({error:error.status ? error.message : 'May error sa server. Subukan muli.'},error.status||500);
    }
  };
}
module.exports={createHandler,CHUNK,MAX_IMAGE,securityHeaders};
