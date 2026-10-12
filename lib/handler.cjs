const { randomUUID } = require('node:crypto');
const S = require('./security.cjs');
const { getConfig, SupabaseBackend } = require('./supabase.cjs');
const CHUNK = 1024 * 1024, MAX_IMAGE = 5 * CHUNK;
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
