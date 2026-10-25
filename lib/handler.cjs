const { randomUUID } = require('node:crypto');
const S = require('./security.cjs');
const { getConfig, SupabaseBackend } = require('./supabase.cjs');
const Google = require('./google-auth.cjs');
const FBImport = require('./facebook-import.cjs');
const KKExport = require('./kk-export.cjs');
const CHUNK = 1024 * 1024, MAX_IMAGE = 5 * CHUNK;
// Fixed lifetime, counted from login (not extended on every page visit).
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

async function sendAccountEmail(to,link,kind) {
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS;
 const displayName=(process.env.MAIL_FROM_NAME||'SK Vasra').replace(/[\r\n\"<>]/g,'').trim().slice(0,80);
 const sender=displayName?displayName+' <'+from+'>':from;
 if(!apiKey || !/^.{1,100}@[^\s@]+\.[^\s@]+$/.test(from||'')) S.fail(503,'Email recovery is not configured on this deployment.');
 const change=kind==='email';
 const subject=change?'Verify your new SK Vasra email':'Reset your SK Vasra password';
 const intro=change?'Confirm your new email address for your SK Vasra account.':'Use the secure link below to reset your SK Vasra password.';
 const expires=change?'15 minutes':'30 minutes';
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from:sender,to:[to],subject,text:intro+'\n\n'+link+'\n\nExpires in '+expires+'. If you did not request this, ignore the email.'}),signal:AbortSignal.timeout(10000)}).catch(()=>null);
 if(!response?.ok){
   // Never log the recipient address, email contents, API key or URL token.
   console.warn('SK Vasra mail dispatch failure',JSON.stringify({kind:change?'email_change':'password_reset',providerStatus:response?.status||'network_timeout'}));
   if(response?.status===401)S.fail(503,'Resend authentication error. Contact the SK administrator to check the email API configuration.');
   if(response?.status===403||response?.status===422)S.fail(503,'Hindi tinanggap ng Resend ang sender o email configuration. Kailangang verified ang sending domain at tama ang FROM address.');
   if(response?.status===429)S.fail(429,'Masyadong maraming email requests. Subukan muli pagkalipas ng ilang minuto.');
   S.fail(503,'Hindi tinanggap ng email provider ang request. Subukan muli mamaya.');
 }
 // Resend 2xx means accepted for delivery, not necessarily delivered to inbox.
}
function accountLink(config,kind,token) {
 if(!config.origin || !config.origin.startsWith('https://')) S.fail(503,'Configure PUBLIC_ORIGIN before enabling email links.');
 return config.origin+'/account#'+(kind==='email'?'verify_email':'reset')+'='+encodeURIComponent(token);
}

// Public inquiries use the SK office's existing verified Resend sender.
// Only the fixed published SK email receives form submissions.
async function sendKKEmailChangeLink(recipient,token,origin){
 const key=process.env.RESEND_API_KEY;
 const from=process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS;
 if(!key||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from||''))S.fail(503,'KK email sender is not configured.');
 const name=(process.env.MAIL_FROM_NAME||'SK Vasra').replace(/[\r\n"<>]/g,'').slice(0,70);
 const url=origin+'/kk-dashboard#confirm-email='+encodeURIComponent(token);
 let res;
 try{
  res=await fetch('https://api.resend.com/emails',{method:'POST',
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({from:name+' <'+from+'>',to:[recipient],
    subject:'Confirm your new SK Vasra KK email',
    text:'You requested a new email address for your SK Vasra KK account. Sign in on the same device and open this link to verify it:\n'+url+
      '\n\nThis link expires in 15 minutes. Ignore this message if you did not request it.'}),
   signal:AbortSignal.timeout(10000)
  });
 }catch{S.fail(503,'Email provider is currently unreachable.');}
 if(!res.ok){console.warn('KK email confirmation not accepted',{providerStatus:res.status});
  S.fail(503,'Email provider did not accept the verification email. Please retry.');}
 return {accepted:true}; // Only provider acceptance, not inbox delivery.
}

async function sendKKReviewEmail({recipient,decision,origin}) {
 // A reviewed applicant's email is fetched from the staff-authorized database,
 // never provided by the browser. Do not disclose profile details in mail.
 const apiKey=process.env.RESEND_API_KEY;
 const from=process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS;
 if(!apiKey||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from||''))
  return {status:'unavailable',reason:'mailer_unconfigured'};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient||''))
  return {status:'unavailable',reason:'recipient_missing'};
 const displayName=(process.env.MAIL_FROM_NAME||'SK Vasra').replace(/[\r\n"<>]/g,'').trim().slice(0,80);
 const sender=displayName?displayName+' <'+from+'>':from;
 const approved=decision==='verified';
 const subject=approved?'SK Vasra KK Profile — Verified':'SK Vasra KK Profile — Corrections Required';
 const url=/^https:\/\//.test(origin||'')?origin+'/kk-login':'https://vasra.vercel.app/kk-login';
 const body=approved?
  'Na-verify na ng SK Vasra ang iyong KK profiling application. Mag-login upang makita ang iyong status, KK ID at welcome points.':
  'Na-review ng SK Vasra ang iyong KK profiling application at may mga kailangang itama. Mag-login, basahin ang review note, i-edit ang iyong profile, at i-submit muli para sa panibagong review.';
 let response;
 try{
  response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({from:sender,to:[recipient],subject,
     text:body+'\n\nKK Login: '+url+'\n\nKung hindi ikaw ang gumawa ng KK account, makipag-ugnay sa SK Vasra.'}),
   signal:AbortSignal.timeout(10000)
  });
 }catch{return {status:'unavailable',reason:'network_error'};}
 if(!response.ok){
  console.warn('SK Vasra KK decision notification unavailable',{providerStatus:response.status});
  return {status:'unavailable',reason:'provider_rejected'};
 }
 const receipt=await response.json().catch(()=>null);
 const id=typeof receipt?.id==='string'&&/^[0-9a-f-]{36}$/i.test(receipt.id)?receipt.id:null;
 return {status:'provider_accepted',reference:id}; // Never claim inbox delivery.
}

async function sendPublicContactEmail({name,email,topic,message}) {
 const key=process.env.RESEND_API_KEY;
 const senderEmail=process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS;
 if(!key||!senderEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail))
   S.fail(503,'Hindi pa configured ang SK Vasra contact email service.');
 const displayName=(process.env.MAIL_FROM_NAME||'SK Vasra').replace(/[\r\n"<>]/g,'').trim().slice(0,80);
 const sender=displayName?displayName+' <'+senderEmail+'>':senderEmail;
 const titles={
  general:'Pangkalahatang katanungan',
  projects:'Mga proyekto at programa',
  duty:'SK Duty at serbisyo',
  assistance:'Tulong at suhestiyon',
  feedback:'Feedback o concern'
 };
 const body=[
  'SK VASRA CONTACT INQUIRY',
  '',
  'Pangalan: '+name,
  'Email: '+email,
  'Paksa: '+titles[topic],
  '',
  'Mensahe:',
  message,
  '',
  'Sent through the public SK Vasra contact page. Reply directly to the sender email.'
 ].join('\n');
 let response;
 try{
  response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({
    from:sender,
    to:['skbrgyvasraqc@gmail.com'],
    reply_to:email,
    subject:'SK Vasra Inquiry - '+titles[topic],
    text:body
   }),
   signal:AbortSignal.timeout(12000)
  });
 }catch{S.fail(503,'Hindi makonekta ang email provider. Subukan muli mamaya.');}
 if(!response.ok){
  // Never log names, sender addresses, message contents, Resend keys or provider body.
  console.warn('SK Vasra public contact delivery unavailable',{providerStatus:response.status});
  if(response.status===429)S.fail(429,'Busy ang email service. Subukan muli mamaya.');
  if([401,403,422].includes(response.status))
   S.fail(503,'Hindi pa handa ang verified sender ng SK Vasra. Gamitin muna ang official email link.');
  S.fail(503,'Hindi tinanggap ng email provider ang request. Subukan muli mamaya.');
 }
 // Accepted by the provider is not confirmation of inbox delivery.
 const receipt=await response.json().catch(()=>null);
 const emailId=typeof receipt?.id==='string' && /^[0-9a-f-]{36}$/i.test(receipt.id)?receipt.id:null;
 // Only this non-sensitive provider receipt goes to server logs for troubleshooting.
 console.info('SK Vasra contact accepted by Resend',{emailId:emailId||'missing',providerStatus:response.status});
 return {emailId};
}

const securityHeaders = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' };
function createHandler({ backend, config } = {}) {
  return async function handle(request, context = {}) {
    let cfg;
    const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...securityHeaders, ...headers } });
    try {
      cfg = config || getConfig();
      const db = backend || new SupabaseBackend(cfg,fetch,context.ip);
      const url = new URL(request.url);
      let path = url.pathname;
      if (path === '/api/index' || path === '/api/index.mjs') path = '/api/' + (url.searchParams.get('__path') || '');
      const method = request.method;
      if(path==='/api/time'&&method==='GET')return json({now:new Date().toISOString()});
      if (!['GET','POST','PUT','DELETE'].includes(method)) S.fail(405, 'Method not allowed.');
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
      const sessionCookie = (value,oauth=false) => ({ 'Set-Cookie': `vasra_session=${value}; HttpOnly; SameSite=${oauth?'Lax':'Strict'}; Path=/; Max-Age=${value ? SESSION_TTL_SECONDS : 0}${cfg.secure ? '; Secure' : ''}` });
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
      // SK officers can submit award drafts; only the chairman can publish.
      if (path === '/api/achievements' && method === 'GET')
        return json(await rpc('awards_public'));
      if (path === '/api/manage/achievements' && method === 'GET') {
        await user(['sk','chairman']);
        return json(await rpc('awards_manage'));
      }
      if (path === '/api/manage/achievements' && method === 'POST') {
        const actor=await user(['sk','chairman']);
        const b=await body();
        const category=['Award','Recognition','Milestone'].includes(b.category)?b.category:null;
        const date=String(b.award_date||'');
        if(!category||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z')))
          S.fail(400,'Kailangan ang valid award category at petsa.');
        const images=Array.isArray(b.image_ids)?b.image_ids.map(S.uuid):[];
        if(images.length>12||new Set(images).size!==images.length)
          S.fail(400,'Maximum 12 photos per award; bawal ang duplicate images.');
        const published=actor.role==='chairman'&&b.published===true;
        if(b.published===true&&actor.role!=='chairman')
          S.fail(403,'Chairman approval is required before publishing.');
        let link=null;
        if(b.reference_url){
          try{const u=new URL(b.reference_url);if(u.protocol!=='https:'||u.username||u.password)throw Error('protocol');link=u.toString().slice(0,500);}
          catch{S.fail(400,'Use a valid HTTPS award reference URL.');}
        }
        const result=await rpc('awards_save',{
          id:b.id?S.uuid(b.id):null,
          title:S.text(b.title,180,'award title'),
          issuer:S.text(b.issuer,180,'awarding organization'),
          description:String(b.description||'').slice(0,3000),
          award_date:date,category,reference_url:link,image_ids:images,published
        });
        return json(result);
      }
      if (path === '/api/manage/achievements/archive' && method === 'POST') {
        await user(['chairman']);
        const b=await body();
        return json(await rpc('awards_archive',{id:S.uuid(b.id)}));
      }
      // SK FDP Board: five publication categories, Google Drive documents only.
      if(path==='/api/disclosure'&&method==='GET'){
        return json(await db.rpc('disclosure_public'));
      }
      if(path==='/api/disclosure/manage'&&method==='GET'){
        await user(['chairman']);
        return json(await rpc('disclosure_manage'));
      }
      if(path==='/api/disclosure/manage'&&method==='POST'){
        await user(['chairman']);
        const b=await body();
        const category=String(b.category||'');
        const year=String(b.year||'').trim();
        const published=b.published===true;
        const value=String(b.url||'').trim();
        if(!['cbydp','abyip','budget','rcb','purchase_requests'].includes(category)||
           !/^20\d{2}(?:-20\d{2})?$/.test(year)||value.length>1500||typeof b.published!=='boolean')
          S.fail(400,'Invalid disclosure category, year or publish state.');
        if(published&&!value)S.fail(400,'Add a public Google Drive document or folder link before publishing.');
        if(value){
          let link;
          try{link=new URL(value)}catch{S.fail(400,'Use a valid Google Drive or Docs HTTPS link.');}
          const allowed=(link.hostname==='drive.google.com'&&
           (/^\/(drive\/folders|file\/d)\/[A-Za-z0-9_-]+/.test(link.pathname)||
            (link.pathname==='/open'&&/^[A-Za-z0-9_-]+$/.test(link.searchParams.get('id')||''))))||
           (link.hostname==='docs.google.com'&&
            /^\/(document|spreadsheets|presentation|forms)\/d\/[A-Za-z0-9_-]+/.test(link.pathname));
          if(link.protocol!=='https:'||link.username||link.password||!allowed)
            S.fail(400,'Only official Google Drive or Google Docs HTTPS document/folder links are accepted.');
        }
        return json(await rpc('disclosure_save',{category,year,url:value,published}));
      }
      if (path === '/api/transparency' && method === 'GET') {
        const year = Number(url.searchParams.get('year') || new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric'}).format(new Date()));
        if (!Number.isInteger(year) || year<2000 || year>2100) S.fail(400,'Invalid fiscal year.');
        const result=await db.rpc('transparency_public',{year});
        // After activating the roster migration, use published profiles with
        // photos. Older deployments retain their existing published directory.
        try{
          const profiles=await rpc('officer_profile_public');
          result.officials=profiles.profiles.map(({id,name,position,photo_id,duty_days})=>({id,name,position,photo_id,duty_days}));
        }catch(error){
          // Safe compatibility before migration; do not make public pages fail.
          if(error.status!==503&&error.status!==404)throw error;
        }
        return json(result);
      }
      // Published profiles only. Never send archived/draft portraits to public.
      if (path === '/api/officer-profiles' && method === 'GET') {
        return json(await rpc('officer_profile_public'));
      }
      // Public contact inquiries have no account requirement but do have
      // strict origin checks above, validation, honeypot and per-identity quotas.
      if(path==='/api/contact-message' && method==='POST'){
        const b=await body();
        if(b.website || b.consent!==true)S.fail(400,'Suriin ang contact form at pahintulot.');
        const name=S.text(b.name,100,'pangalan');
        const email=S.email(b.email);
        const message=S.text(b.message,2000,'mensahe');
        const topic=String(b.topic||'');
        if(name.length<2 || email.length>160 || message.length<10
           || !['general','projects','duty','assistance','feedback'].includes(topic)
           || /[\x00-\x1F\x7F]/.test(name)
           || /[\x00-\x1F\x7F]/.test(email)
           || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(message))
          S.fail(400,'Pakisuri ang pangalan, email, paksa at mensahe.');
        await limit('public-contact-ip',context.ip||'unknown',6);
        await limit('public-contact-email',email,4);
        const receipt=await sendPublicContactEmail({name,email,topic,message});
        return json({accepted:true,delivery:'provider_accepted',reference:receipt.emailId},202);
      }
      // Staff-owned SK Duty contacts: public returns only explicitly published fields.
      // The private route is session-checked and cannot target another account.
      if (path === '/api/officer-contacts' && method === 'GET') {
        return json(await rpc('officer_contacts_public'));
      }
      if (path === '/api/officer-contacts/me' && method === 'GET') {
        await user(['sk','chairman']);
        return json(await rpc('officer_contacts_mine'));
      }
      if (path === '/api/officer-contacts/me' && method === 'POST') {
        await user(['sk','chairman']);
        const b=await body();
        const field=(v,max)=>{
          if(typeof v!=='string')S.fail(400,'Invalid SK contact details.');
          const value=v.trim();
          if(value.length>max||/[\u0000-\u001f\u007f]/.test(value))S.fail(400,'Invalid SK contact details.');
          return value;
        };
        const address=field(b.address,200),email=field(b.email,160).toLowerCase();
        const phone=field(b.phone,35),facebook_url=field(b.facebook_url,450);
        if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
          S.fail(400,'Invalid public contact email.');
        if(phone&&!/^[+0-9(). \-]+$/.test(phone))S.fail(400,'Invalid public contact phone.');
        if(facebook_url){
          let parsed;try{parsed=new URL(facebook_url)}catch{S.fail(400,'Use a valid HTTPS Facebook link.');}
          if(parsed.protocol!=='https:'||!['facebook.com','www.facebook.com','m.facebook.com'].includes(parsed.hostname)
            ||parsed.username||parsed.password||!parsed.pathname||parsed.pathname==='/')
            S.fail(400,'Use a valid HTTPS Facebook profile or page link.');
        }
        if(typeof b.is_public!=='boolean')S.fail(400,'Confirm the public sharing preference.');
        if(b.is_public&&![address,email,phone,facebook_url].some(Boolean))
          S.fail(400,'Add at least one public contact detail to enable sharing.');
        return json(await rpc('officer_contacts_save',{address,email,phone,facebook_url,is_public:b.is_public}));
      }
      if (path === '/api/duty-schedule' && method === 'GET') {
        return json(await rpc('duty_management_public'));
      }
      if (path === '/api/duty-schedule/manage' && method === 'GET') {
        await user(['chairman']);
        return json(await rpc('duty_management_manage'));
      }
      if (path === '/api/duty-schedule' && method === 'POST') {
        await user(['chairman']);
        const b=await body();
        const weekday=Number(b.weekday);
        const clock=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
        if(!Number.isInteger(weekday)||weekday<1||weekday>7||!clock.test(b.open_time)||!clock.test(b.close_time)||b.open_time>=b.close_time)
          S.fail(400,'Invalid office schedule. Must have opening time before closing time.');
        return json(await rpc('duty_management_save_hours',{
         weekday,open_time:b.open_time,close_time:b.close_time
        }));
      }
      if (path === '/api/officer-profiles/duty' && method === 'POST') {
        await user(['chairman']);
        const b=await body();
        if(!Object.prototype.hasOwnProperty.call(b,'duty_day')&&!Object.prototype.hasOwnProperty.call(b,'duty_photo_id'))S.fail(400,'Missing duty update.');
        const patch={id:S.uuid(b.id)};
        if(Object.prototype.hasOwnProperty.call(b,'duty_day')){
          if(b.duty_day!==null&&(!Number.isInteger(b.duty_day)||b.duty_day<1||b.duty_day>7))S.fail(400,'Select one duty weekday.');
          patch.duty_day=b.duty_day;
        }
        if(Object.prototype.hasOwnProperty.call(b,'duty_photo_id'))patch.duty_photo_id=b.duty_photo_id?S.uuid(b.duty_photo_id):null;
        return json(await rpc('officer_profile_duty',patch));
      }
      if (path === '/api/officer-profiles/manage' && method === 'GET') {
        await user(['chairman']);
        return json(await rpc('officer_profile_manage'));
      }
      if (path === '/api/officer-profiles' && method === 'POST') {
        await user(['chairman']); const b=await body();
        if(Object.prototype.hasOwnProperty.call(b,'duty_days'))S.fail(400,'Change duty assignments through SK Duty Management.');
        return json(await rpc('officer_profile_update',{
          id:S.uuid(b.id),photo_id:b.photo_id?S.uuid(b.photo_id):null
        }));
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

      // KK youth accounts have their own HttpOnly session cookie and private tables.
      // /api/login and /api/register remain staff-only, intentionally.
      const kkRaw=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('vasra_kk='))?.slice(9);
      const kkSession=kkRaw&&/^[A-Za-z0-9_-]{32,128}$/.test(kkRaw)?S.hash(kkRaw):null;
      const kkCookie=(value,lax=false)=>({'Set-Cookie':
        'vasra_kk='+value+'; HttpOnly; SameSite='+(lax?'Lax':'Strict')+'; Path=/; Max-Age='+(value?SESSION_TTL_SECONDS:0)+(cfg.secure?'; Secure':'')
      });
      async function kkRpc(action,payload={},staffSession=false){
        const result=await db.rpc('kk_'+action,payload,staffSession?session:kkSession);
        if(result?.error===409&&action==='register')S.fail(409,'May existing KK account. Mag-login upang ituloy ang 5-step profiling.');
        if(result?.error)S.fail(result.error,({400:'Suriin ang KK profile fields.',401:'Mag-login muna sa KK account.',403:'Walang pahintulot.',404:'Hindi makita ang record.',409:'May existing na record o kailangang i-review muna.',429:'Masyadong maraming requests.'})[result.error]||'Hindi natuloy ang KK request.');
        return result;
      }
      const kkGoogleSettings=()=>{
        const clientId=process.env.KK_GOOGLE_CLIENT_ID,clientSecret=process.env.KK_GOOGLE_CLIENT_SECRET;
        const redirectUri=process.env.KK_GOOGLE_REDIRECT_URI;
        return {clientId,clientSecret,redirectUri,
         enabled:!!(clientId&&clientSecret&&redirectUri&&redirectUri===cfg.origin+'/api/kk/google/callback')};
      };
      if(path==='/api/kk/google/status'&&method==='GET'){
        const settings=kkGoogleSettings();
        return json({enabled:settings.enabled,reason:settings.enabled?'ready':'kk_google_not_configured'});
      }
      if(path==='/api/kk/google/start'&&method==='GET'){
        const settings=kkGoogleSettings();
        if(!settings.enabled)S.fail(503,'Google sign-in para sa KK ay hindi pa configured.');
        await limit('kk-google-ip',context.ip||'unknown',12);
        const flow=Google.createFlow(settings);
        const transient='vasra_kk_oauth='+flow.cookie+'; HttpOnly; SameSite=Lax; Path=/api/kk/google; Max-Age=600'+(cfg.secure?'; Secure':'');
        return new Response(null,{status:302,headers:{...securityHeaders,Location:flow.url,'Set-Cookie':transient}});
      }
      if(path==='/api/kk/google/callback'&&method==='GET'){
        const settings=kkGoogleSettings();
        const transient=cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('vasra_kk_oauth='))?.slice(15);
        const clear='vasra_kk_oauth=; HttpOnly; SameSite=Lax; Path=/api/kk/google; Max-Age=0'+(cfg.secure?'; Secure':'');
        let success=false,blocked=false,sessionValue=null;
        try{
          if(!settings.enabled||url.searchParams.get('error'))throw Error('Google OAuth unavailable');
          const flow=Google.readFlow(transient,url.searchParams.get('state'),settings);
          await limit('kk-google-callback-ip',context.ip||'unknown',12);
          const identity=await Google.exchangeCode(url.searchParams.get('code'),flow,settings);
          const tokenValue=S.randomToken();
          const outcome=await db.rpc('kk_google',{email:identity.email,sub:identity.sub,token_hash:S.hash(tokenValue)});
          if(outcome?.error)blocked=outcome.reason==='account_link_required';
          else if(outcome?.ok){success=true;sessionValue=tokenValue;}
        }catch(error){console.warn('KK Google authorization failed',{kind:error.name});}
        const target=cfg.origin+(success?'/kk-profile?google=1':'/kk-login?google_error='+(blocked?'link_required':'unavailable'));
        const headers=new Headers({...securityHeaders,Location:target});
        headers.append('Set-Cookie',clear);
        if(sessionValue)headers.append('Set-Cookie',kkCookie(sessionValue,true)['Set-Cookie']);
        return new Response(null,{status:303,headers});
      }

      if(path==='/api/kk/sitios'&&method==='GET'){
        // Public list has only active Sitio names and IDs; no private resident records.
        return json(await kkRpc('sitios'));
      }
      if(path==='/api/kk/staff/sitios'&&method==='GET'){
        await user(['sk','chairman']);
        return json(await kkRpc('sitio_list',{},true));
      }
      if(path==='/api/kk/staff/sitios'&&method==='POST'){
        await user(['sk','chairman']);
        const b=await body();
        if(!['save','disable'].includes(b.intent))S.fail(400,'Invalid Sitio management action.');
        const name=b.intent==='save'?S.text(b.name,100,'Sitio/Purok'):'';
        if(name&&(/[<>\x00-\x1f]/.test(name)||name.length<2))S.fail(400,'Invalid Sitio name.');
        const sort_order=Number(b.sort_order??100);
        if(!Number.isInteger(sort_order)||sort_order<0||sort_order>10000)S.fail(400,'Invalid display order.');
        return json(await kkRpc('sitio_manage',{intent:b.intent,id:b.id?S.uuid(b.id):null,
          name,sort_order,active:b.active!==false},true));
      }
      if(path==='/api/kk/staff/catalog'&&method==='GET'){
        await user(['sk','chairman']);
        return json(await kkRpc('staff_catalog',{},true));
      }
      if(path==='/api/kk/register'&&method==='POST'){
        await limit('kk-registration-ip',context.ip||'unknown',8);
        const b=await body();
        const email=S.email(b.email);
        if(email.length>160 || b.confirm_email!==email || b.agree!==true || b.confirm_email_correct!==true)
          S.fail(400,'Kumpirmahin ang email at Terms/Privacy.');
        const first_name=S.text(b.first_name,80,'first name'),last_name=S.text(b.last_name,80,'last name');
        const middle_name=String(b.middle_name||'').trim(),phone=String(b.phone||'').trim();
        if(first_name.length<2||last_name.length<2||middle_name.length>80 ||
          [first_name,middle_name,last_name].some(x=>/[\x00-\x1f<>]/.test(x))||
          !/^(?:\+63|0)9\d{9}$/.test(phone))
          S.fail(400,'Suriin ang pangalan at Philippine phone number.');
        const birthdate=String(b.birthdate||'');
        const exactDate=new Date(birthdate+'T00:00:00Z');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)||!Number.isFinite(exactDate.getTime())
          || exactDate.toISOString().slice(0,10)!==birthdate)
          S.fail(400,'Kailangan ang valid birthdate.');
        const segments=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'})
          .formatToParts(new Date());
        const date=Object.fromEntries(segments.map(x=>[x.type,x.value]));
        let years=Number(date.year)-Number(birthdate.slice(0,4));
        if((Number(date.month)*100+Number(date.day))<(Number(birthdate.slice(5,7))*100+Number(birthdate.slice(8,10))))years--;
        if(years<15||years>30)S.fail(400,'Ang KK registration ay para sa edad 15–30.');
        S.password(b.password);
        if(b.password!==b.confirm_password)S.fail(400,'Hindi magkatugma ang passwords.');
        await limit('kk-registration-email',email,4);
        const refCode=String(b.referral_code||'').trim();
        if(refCode&&!/^[A-Za-z0-9_-]{1,40}$/.test(refCode))S.fail(400,'Invalid referral code.');
        const tokenValue=S.randomToken();
        await kkRpc('register',{first_name,middle_name,last_name,birthdate,phone,email,
          password_hash:await S.passwordHash(b.password),referral_code:refCode,token_hash:S.hash(tokenValue)});
        return json({ok:true,next:'/kk-profile'},201,kkCookie(tokenValue));
      }
      if(path==='/api/kk/login'&&method==='POST'){
        await limit('kk-login-ip',context.ip||'unknown',30);
        const b=await body(),email=S.email(b.email);
        if(typeof b.password!=='string'||b.password.length>200)S.fail(400,'Invalid password.');
        await limit('kk-login-email',email,12);
        const row=await kkRpc('lookup',{email});
        const valid=await S.passwordMatch(b.password,row?.password_hash);
        if(!row||!valid)S.fail(401,'Mali ang KK email o password.');
        const tokenValue=S.randomToken();
        await kkRpc('login',{id:row.id,password_hash:row.password_hash,token_hash:S.hash(tokenValue)});
        return json({ok:true,next:'/kk-profile'},200,kkCookie(tokenValue));
      }
      if(path==='/api/kk/logout'&&method==='POST'){
        if(kkSession)await kkRpc('logout');
        return json({ok:true},200,kkCookie(''));
      }
      if(path==='/api/kk/me'&&method==='GET'){
        if(!kkSession)return json({member:null});
        const result=await db.rpc('kk_mine',{},kkSession);
        if(result?.error===401)return json({member:null});
        if(result?.error)S.fail(result.error,'Hindi ma-load ang KK account.');
        return json(result);
      }
      if(path==='/api/kk/profile'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK account.');
        const b=await body();
        if(!b.profile||typeof b.profile!=='object'||Array.isArray(b.profile))S.fail(400,'Invalid KK profile.');
        if(JSON.stringify(b.profile).length>12000)S.fail(400,'Masyadong mahaba ang profile.');
        const fields=['religion','civil_status','gender','solo_parent','family_count','siblings',
         'region','province','city','barangay','sitio_id','street','education','education_status','course_program','school_name','year_level',
         'employment','voter','sk_voter','national_voter','voted_last_election','kk_assembly','interests','residence_region','residence_province','residence_city','residence_barangay','address_line_2','emergency_name','emergency_phone','emergency_relation',
         'consent','guardian_consent'];
        const profile={};
        for(const k of fields){
          const v=b.profile[k];
          if(typeof v==='boolean')profile[k]=v;
          else if(typeof v==='string'&&v.length<=300)profile[k]=v.trim();
          else if(v!==undefined&&v!==null)S.fail(400,'Invalid KK profile field.');
        }
        // Address jurisdiction is fixed by the server: not user-editable.
        profile.region='NCR';profile.province='N/A (NCR)';
        profile.city='Quezon City';profile.barangay='Vasra';
        // A member's actual residence may differ from official Vasra jurisdiction.
        // These fields are required for Step 1 but never grant KK verification rights.
        const ncrCities=new Set(['Caloocan','Las Piñas','Makati','Malabon','Mandaluyong',
          'Manila','Marikina','Muntinlupa','Navotas','Parañaque','Pasay','Pasig','Pateros',
          'Quezon City','San Juan','Taguig','Valenzuela']);
        if(Number(b.step)===1){
          if(!['NCR'].includes(profile.residence_region)||profile.residence_province!=='Metro Manila'
             ||!ncrCities.has(profile.residence_city))
            S.fail(400,'Pumili ng wastong NCR, Metro Manila at City / Municipality.');
          if(!profile.residence_barangay||profile.residence_barangay.length>150
             ||/[<>\x00-\x1f]/.test(profile.residence_barangay))
            S.fail(400,'Pumili ng wastong Barangay sa listahan.');
          if(!profile.religion||!profile.civil_status||!profile.gender||
             !['yes','no'].includes(profile.solo_parent)||!String(profile.street||'').trim()||
             !/^\d+$/.test(String(profile.family_count||''))||Number(profile.family_count)<1||
             !/^\d+$/.test(String(profile.siblings||''))||Number(profile.siblings)<0)
            S.fail(400,'Kumpletuhin ang lahat ng required Personal Information at address fields.');
        }
        if(profile.residence_barangay && (profile.residence_barangay.length>150
           ||/[<>\x00-\x1f]/.test(profile.residence_barangay)))
          S.fail(400,'Invalid residential barangay.');
        if(profile.address_line_2&&/[<>\x00-\x1f]/.test(profile.address_line_2))
          S.fail(400,'Invalid address line 2.');
        if(Number(b.step)===2){
          if(!profile.education||!profile.education_status||!profile.year_level||
             (!['no-formal','out-of-school'].includes(profile.education)&&
              profile.education_status!=='osy'&&!String(profile.school_name||'').trim())||
             (['senior-high','vocational','college','graduate'].includes(profile.education)&&
              profile.education_status!=='osy'&&!String(profile.course_program||'').trim()))
            S.fail(400,'Kumpletuhin ang Educational Level, Year Level at school details.');
        }

        if(Number(b.step)===3&&['sk_voter','national_voter','voted_last_election','kk_assembly'].some(key=>!['yes','no'].includes(profile[key])))
          S.fail(400,'Piliin ang Yes o No sa lahat ng required additional questions.');
        if(profile.sitio_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.sitio_id))
          S.fail(400,'Pumili ng valid Sitio / Purok.');
        const step=Number(b.step);
        if(!Number.isInteger(step)||step<1||step>5)S.fail(400,'Invalid profile step.');
        const identity={};
        for(const k of ['first_name','middle_name','last_name','birthdate','phone'])
          identity[k]=String(b[k]||'').trim().slice(0,100);
        return json(await kkRpc('profile_save',{profile,step,...identity}));
      }
      if(path==='/api/kk/id/upload'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna.');
        await limit('kk-valid-id-ip',context.ip||'unknown',12);
        const mine=await kkRpc('mine');
        if(!['draft','rejected'].includes(mine.profile?.status))S.fail(409,'Hindi na puwedeng baguhin ang submitted ID.');
        const b=await body();
        const name=String(b.name||'').slice(0,120).replace(/[\x00-\x1f<>/\\]/g,'_');
        const mime=String(b.mime||'');
        const ext=({'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'})[mime];
        if(!ext||name.length<3||typeof b.data!=='string'||b.data.length>3400000)
          S.fail(400,'JPG, PNG o PDF lamang, hanggang 2.5 MB.');
        const bytes=S.base64(b.data);
        if(bytes.length<100||bytes.length>2500000)S.fail(413,'Maximum 2.5 MB ang Valid ID.');
        if((mime==='image/jpeg' && !(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))
         ||(mime==='image/png' && !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
         ||(mime==='application/pdf' && bytes.subarray(0,5).toString('ascii')!=='%PDF-'))
          S.fail(400,'Hindi tugma ang file type at content.');
        const filePath='ids/'+S.uuid(mine.member.id)+'/'+randomUUID()+'.'+ext;
        await db.putPrivate(filePath,bytes,mime);
        return json(await kkRpc('id_attach',{path:filePath,name,mime,size:bytes.length}));
      }
      if(path==='/api/kk/id/mine'&&method==='GET'){
        if(!kkSession)S.fail(401,'Mag-login muna.');
        return json(await kkRpc('id_mine'));
      }
      if(path==='/api/kk/id/view'&&method==='GET'){
        if(!kkSession)S.fail(401,'Mag-login muna.');
        const info=await kkRpc('id_access');
        const bytes=await db.getPrivate(info.path);
        return new Response(bytes,{headers:{...securityHeaders,'Content-Type':info.mime,
          'Content-Disposition':'attachment; filename="KK-Valid-ID.'+(info.mime==='application/pdf'?'pdf':info.mime==='image/png'?'png':'jpg')+'"'}});
      }
      if(/^\/api\/kk\/staff\/id\/[0-9a-f-]{36}$/i.test(path)&&method==='GET'){
        await user(['sk','chairman']);
        const id=S.uuid(path.split('/').pop()),info=await kkRpc('staff_id_access',{id},true);
        const bytes=await db.getPrivate(info.path);
        return new Response(bytes,{headers:{...securityHeaders,'Content-Type':info.mime,
          'Content-Disposition':'attachment; filename="KK-Valid-ID.'+(info.mime==='application/pdf'?'pdf':info.mime==='image/png'?'png':'jpg')+'"'}});
      }
      if(path==='/api/kk/submit'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna.');
        return json(await kkRpc('submit'));
      }
      // Verified KK member services: private server-only RPC and same-host session.
      if(path==='/api/kk/services'&&method==='GET'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK account.');
        return json(await kkRpc('services_mine'));
      }
      if(path==='/api/kk/services'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK account.');
        await limit('kk-service-submit-ip',context.ip||'unknown',25);
        const b=await body(),type=String(b.service_type||'');
        let details;
        if(type==='printing'){
          const copies=Number(b.copies),pages=Number(b.pages);
          if(!['short','long'].includes(b.paper_size)||!['bw','colored'].includes(b.color)||
             !Number.isInteger(copies)||copies<1||copies>100||
             !Number.isInteger(pages)||pages<1||pages>100)
            S.fail(400,'Piliin ang paper size, color, pages at copies.');
          details={paper_size:b.paper_size,color:b.color,copies,pages};
        }else if(type==='computer'){
          const hours=Number(b.hours);
          if(!Number.isInteger(hours)||hours<1||hours>8)S.fail(400,'1–8 hours lang ang puwedeng i-request.');
          details={hours};
        }else if(type==='retabox'){
          const grams=Number(b.grams),description=String(b.description||'').trim();
          if(!Number.isInteger(grams)||grams<1||grams>100000||description.length>180)
            S.fail(400,'Ilagay ang tinatayang grams (1–100000).');
          details={grams,description};
        }else S.fail(400,'Invalid SK service.');
        return json(await kkRpc('services_request',{service_type:type,details}));
      }
      if(path==='/api/kk/dashboard'&&method==='GET'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK account.');
        return json(await kkRpc('youth_dashboard'));
      }
      if(path==='/api/kk/join'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK account.');
        await limit('kk-join-ip',context.ip||'unknown',35);
        const b=await body();
        return json(await kkRpc('project_join',{project_id:S.uuid(b.project_id)}));
      }
      if(path==='/api/kk/settings/password'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK account.');
        await limit('kk-password-ip',context.ip||'unknown',12);
        const b=await body(),old=String(b.current||''),next=String(b.password||'');
        if(next.length<10||next.length>128||next===old)S.fail(400,'New password must be 10–128 characters and different from the old password.');
        const current=await kkRpc('mine');
        const lookup=await kkRpc('lookup',{email:current.member.email});
        if(!lookup?.password_hash||!await S.passwordMatch(old,lookup.password_hash))
          S.fail(403,'Current password is incorrect or this is a Google-only account.');
        return json(await kkRpc('password_change',{old_hash:lookup.password_hash,new_hash:await S.passwordHash(next)}));
      }
      if(path==='/api/kk/settings/email/request'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK account.');
        await limit('kk-email-ip',context.ip||'unknown',5);
        const b=await body(),next=String(b.email||'').trim().toLowerCase(),password=String(b.current||'');
        if(next.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next))S.fail(400,'Invalid new email address.');
        const member=(await kkRpc('mine')).member;
        if(next===member.email)S.fail(400,'This is already your account email.');
        const lookup=await kkRpc('lookup',{email:member.email});
        if(!lookup?.password_hash||!await S.passwordMatch(password,lookup.password_hash))
          S.fail(403,'Current password is incorrect or this is a Google-only account.');
        if(!cfg.origin||!cfg.origin.startsWith('https://'))S.fail(503,'KK verification origin is not configured.');
        const tokenValue=randomUUID()+randomUUID();
        await kkRpc('email_request',{email:next,old_hash:lookup.password_hash,token_hash:S.hash(tokenValue)});
        // Confirmation must open on the deployment where the KK session cookie exists.
        // Vercel preview hosts are tightly allowlisted, never arbitrary Host values.
        const confirmOrigin=/^vasra-[a-z0-9]+-vasra\.vercel\.app$/i.test(url.hostname)
          ?url.origin:cfg.origin;
        const receipt=await sendKKEmailChangeLink(next,tokenValue,confirmOrigin);
        return json({ok:true,delivery:receipt.accepted?'provider_accepted':'unavailable'});
      }
      if(path==='/api/kk/settings/email/confirm'&&method==='POST'){
        if(!kkSession)S.fail(401,'Sign in to confirm your KK email change.');
        await limit('kk-email-confirm-ip',context.ip||'unknown',12);
        const b=await body(),token=String(b.token||'');
        if(!/^[0-9a-f-]{60,90}$/i.test(token))S.fail(400,'Invalid verification link.');
        return json(await kkRpc('email_confirm',{token_hash:S.hash(token)}));
      }
      if(path==='/api/kk/redeem'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna.');
        const b=await body();
        return json(await kkRpc('redeem',{id:S.uuid(b.id)}));
      }
      // Every authenticated active SK officer can review community service requests.
      // The staff cookie is distinct from the youth KK login cookie.
      if(path==='/api/kk/staff/profile-edit'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-profile-staff-edit-ip',context.ip||'unknown',80);
        const b=await body(),sections=['personal','address','education','additional','emergency'];
        if(!sections.includes(b.section)||!b.changes||Array.isArray(b.changes)||
           typeof b.changes!=='object'||Object.keys(b.changes).length<1||
           Object.keys(b.changes).length>10)S.fail(400,'Invalid profile edit.');
        return json(await db.rpc('kk_profile_editor_update',
          {id:S.uuid(b.id),section:b.section,changes:b.changes},session));
      }
      if(path==='/api/kk/staff/services'&&method==='GET'){
        await user(['sk','chairman']);
        return json(await kkRpc('services_staff_list',{},true));
      }
      if(path==='/api/kk/staff/services'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-service-review-ip',context.ip||'unknown',100);
        const b=await body(),review=String(b.status||''),note=String(b.note||'').trim();
        if(!['approved','rejected'].includes(review)||note.length>500||
           (review==='rejected'&&note.length<5))
          S.fail(400,'Invalid decision or review note.');
        const args={id:S.uuid(b.id),status:review,note};
        if(b.verified_grams!==undefined&&b.verified_grams!==null&&b.verified_grams!==''){
          const grams=Number(b.verified_grams);
          if(!Number.isInteger(grams)||grams<1||grams>100000)S.fail(400,'Ilagay ang aktuwal na timbang (grams).');
          args.verified_grams=grams;
        }
        return json(await kkRpc('services_review',args,true));
      }
      if(path==='/api/kk/staff/services/config'&&method==='POST'){
        await user(['chairman']);
        const b=await body(),rate=Number(b.points_per_kg);
        if(!Number.isInteger(rate)||rate<0||rate>5000)
          S.fail(400,'Ang RetaBox points per kilogram ay dapat 0–5000.');
        return json(await kkRpc('services_configure',{points_per_kg:rate},true));
      }
      if(path==='/api/kk/staff'&&method==='GET'){
        await user(['sk','chairman']);
        const result=await kkRpc('staff_list',{},true);
        const docData=await kkRpc('staff_documents',{},true);
        const docs=new Map((docData.documents||[]).map(x=>[x.member_id,x]));
        return json({...result,members:(result.members||[]).map(x=>({...x,document:docs.get(x.id)||null}))});
      }
      if(path==='/api/kk/staff/export'&&method==='GET'){
        await user(['sk','chairman']);
        const data=await kkRpc('staff_export',{},true);
        const columns=['KK ID','First Name','Middle Name','Last Name','Birthdate','Email','Phone',
          'Region','Province','City','Barangay','Sitio / Purok ID','Current NCR City','Current NCR Barangay','Street / House No.','Education','Status','Points'];
        const rows=[columns,...(data.members||[]).filter(m=>m.status==='verified').map(m=>[m.kk_id||'',m.first_name,m.middle_name,
          m.last_name,m.birthdate||'',m.email,m.phone,m.profile?.region||'',m.profile?.province||'',
          m.profile?.city||'',m.profile?.barangay||'',m.profile?.sitio_id||'',
          m.profile?.residence_city||'',m.profile?.residence_barangay||'',m.profile?.street||'',
          m.profile?.education||'',m.status,Number(m.points||0)])];
        const bytes=KKExport.workbook(rows);
        return new Response(bytes,{status:200,headers:{...securityHeaders,
          'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':'attachment; filename="SK-Vasra-Verified-KK.xlsx"'}});
      }
      if(path==='/api/kk/staff/review'&&method==='POST'){
        await user(['sk','chairman']);
        const b=await body();
        if(!['verified','rejected'].includes(b.status))S.fail(400,'Invalid review decision.');
        const note=String(b.note||'').trim();
        if(note.length>500||(b.status==='rejected'&&note.length<5))S.fail(400,'Maglagay ng dahilan ng rejection.');
        const memberId=S.uuid(b.id);
        const decision=await kkRpc('staff_review',{id:memberId,status:b.status,note},true);
        if(!decision?.ok)return json(decision);
        // Review must remain committed even when email infrastructure is unavailable.
        let notification={status:'unavailable',reason:'member_lookup_failed'};
        try{
          const directory=await kkRpc('staff_list',{},true);
          const applicant=(directory.members||[]).find(entry=>entry.id===memberId);
          if(applicant?.email)
            notification=await sendKKReviewEmail({recipient:applicant.email,decision:b.status,
              origin:new URL(request.url).origin});
        }catch(err){console.warn('SK Vasra KK notification lookup failed',{code:'member_lookup'});}
        return json({...decision,notification});
      }
      if(path==='/api/kk/staff/points'&&method==='POST'){
        S.fail(403,'Points & Perks are temporarily unavailable. Verified accounts receive the automatic 50-point welcome balance.');
        await user(['sk','chairman']);
        const b=await body(),points=Number(b.points),reason=S.text(b.reason,200,'points reason');
        if(!Number.isInteger(points)||points<1||points>500||reason.length<5)S.fail(400,'Invalid points.');
        return json(await kkRpc('staff_award',{id:S.uuid(b.id),points,reason},true));
      }
      if(path==='/api/kk/staff/perks'&&method==='POST'){
        await user(['chairman']);
        const b=await body();
        const title=S.text(b.title,120,'perk'),cost=Number(b.cost);
        if(title.length<3||!Number.isInteger(cost)||cost<1||cost>10000)S.fail(400,'Invalid perk.');
        return json(await kkRpc('perk_save',{title,cost,description:String(b.description||'').slice(0,500),
         active:b.active!==false,id:b.id?S.uuid(b.id):null},true));
      }
      if(path==='/api/kk/staff/redemption'&&method==='POST'){
        await user(['sk','chairman']);
        const b=await body();
        if(!['approved','rejected'].includes(b.status))S.fail(400,'Invalid redemption decision.');
        return json(await kkRpc('perk_review',{id:S.uuid(b.id),status:b.status,
         note:String(b.note||'').slice(0,500)},true));
      }

      // Google OAuth 2.0 + OpenID Connect. Existing SK accounts only, no public registration.
      if (path === '/api/auth/google/status' && method === 'GET') {
        const settings=Google.googleConfig(cfg);
        // Safe, actionable readiness status. Never expose IDs, client secrets or provider responses.
        if(!settings.clientId||!settings.clientSecret||!settings.redirectUri)
          return json({enabled:false,reason:'oauth_not_configured'});
        if(!settings.enabled)
          return json({enabled:false,reason:'redirect_mismatch'});
        try{
          const health=await db.rpc('google_health');
          if(health?.ready===true)return json({enabled:true});
          return json({enabled:false,reason:'database_setup'});
        }catch{
          return json({enabled:false,reason:'database_check_failed'});
        }
      }
      if (path === '/api/auth/google/start' && method === 'GET') {
        const settings=Google.googleConfig(cfg);
        if(!settings.enabled)S.fail(503,'Google sign-in is not yet configured.');
        if((await db.rpc('google_health'))?.ready!==true)S.fail(503,'Google sign-in database setup is pending.');
        await limit('google-start-ip',context.ip||'unknown',20);
        const flow=Google.createFlow(settings);
        const transient='vasra_google='+flow.cookie+'; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600'+(cfg.secure?'; Secure':'');
        return new Response(null,{status:302,headers:{...securityHeaders,Location:flow.url,'Set-Cookie':transient}});
      }
      if (path === '/api/auth/google/callback' && method === 'GET') {
        const settings=Google.googleConfig(cfg);
        const flowCookie=cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('vasra_google='))?.slice(13);
        const clear='vasra_google=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0'+(cfg.secure?'; Secure':'');
        let outcome='failed',sessionValue=null;
        try {
          if(!settings.enabled||url.searchParams.get('error'))throw Error('Google OAuth unavailable or denied');
          const flow=Google.readFlow(flowCookie,url.searchParams.get('state'),settings);
          await limit('google-callback-ip',context.ip||'unknown',20);
          const identity=await Google.exchangeCode(url.searchParams.get('code'),flow,settings);
          const t=S.randomToken();
          const result=await db.rpc('google_login',{email:S.email(identity.email),sub:identity.sub,token_hash:S.hash(t)});
          if(result?.error){outcome=result.error===401||result.error===403?'not_authorized':'failed';}
          else if(result?.id){sessionValue=t;outcome='success';}
        } catch(e) {
          // Do not expose OAuth codes, Google identities, internal errors, or tokens.
          console.warn('Google login failed',{kind:e.name});
        }
        const destination=cfg.origin+'/account'+(outcome==='success'?'?google_success=1':'?google_error='+outcome);
        const headers=new Headers({...securityHeaders,Location:destination});
        headers.append('Set-Cookie',clear);
        if(sessionValue)headers.append('Set-Cookie',sessionCookie(sessionValue,true)['Set-Cookie']);
        return new Response(null,{status:303,headers});
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
        // The password hash check above also runs for missing users to reduce timing signals.
        if (!u || !['sk','chairman'].includes(u.role)) S.fail(401, 'Walang SK account na naka-register sa email na ito.');
        if (!valid) S.fail(401, 'Mali ang password. Subukan muli.');
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
        if(process.env.RESEND_API_KEY&&(process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS)&&cfg.origin?.startsWith('https://')){
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
        if(!process.env.RESEND_API_KEY||!(process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS))S.fail(503,'Email verification is not configured.');
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
        if(!process.env.RESEND_API_KEY||!(process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS))S.fail(503,'Password recovery is not yet configured.');
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
      if (path === '/api/projects' && method === 'GET') {
        const projects=await rpc('public_projects'),gallery=await rpc('gallery_public');
        return json({projects:projects.map(p=>({...p,image_ids:Array.isArray(gallery?.[p.id])&&gallery[p.id].length?gallery[p.id]:(p.image_id?[p.image_id]:[])}))});
      }
      if (path === '/api/manage/projects/import-facebook' && method === 'POST') {
        const actor=await user(['sk','chairman']);
        await limit('facebook-import',actor.id,30);
        const b=await body();
        if(typeof b.caption!=='string')
          S.fail(400,'Kailangan ang Facebook caption.');
        let result;
        try{
          result=await FBImport.importFacebookPost({caption:b.caption});
        }catch(error){
          if(error?.message==='Maximum 12,000 characters ang caption.')
            S.fail(400,error.message);
          throw error;
        }
        return json(result);
      }
      if (path === '/api/manage/projects' && method === 'GET') {
        await user();const projects=await rpc('manage_projects'),gallery=await rpc('gallery_manage');
        return json({projects:projects.map(p=>({...p,image_ids:Array.isArray(gallery?.[p.id])&&gallery[p.id].length?gallery[p.id]:(p.image_id?[p.image_id]:[])}))});
      }
      if ((path === '/api/manage/projects' && method === 'POST') || (/^\/api\/manage\/projects\/[^/]+$/.test(path) && method === 'PUT')) {
        await user(); const b = await body();
        const p = { title:S.text(b.title,150,'pamagat'), category:S.text(b.category,60,'kategorya'), description:S.text(b.description,1000,'buod'), scope:S.text(b.scope,5000,'detalye'), status:b.status, progress:b.progress, image_id:b.image_id ? S.uuid(b.image_id) : null };
        const mode=b.publication_mode;
        if(!['draft','now','schedule','keep'].includes(mode))S.fail(400,'Pumili ng publication mode.');
        if(mode==='keep'&&method!=='PUT')S.fail(400,'Hindi pa published ang bagong project.');
        let publishAt=null;
        if(mode==='schedule'){
          if(typeof b.publish_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(b.publish_at)) S.fail(400,'Valid Philippine publication date at time ang kailangan.');
          const date=new Date(b.publish_at);
          if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now()+30000)S.fail(400,'Pumili ng petsa at oras sa hinaharap (PH time).');
          publishAt=date.toISOString();
        }else if(mode==='now')publishAt=new Date().toISOString();
        p.publication_mode=mode;
        p.published=mode!=='draft';
        p.publish_at=publishAt;
        if (!['Pinaplano','Isinasagawa','Natapos'].includes(p.status) || !Number.isInteger(p.progress) || p.progress < 0 || p.progress > 100 || (p.status === 'Natapos' && p.progress !== 100)) S.fail(400, 'Suriin ang status at progreso.');
        if (method === 'PUT') { p.id = S.uuid(path.split('/').pop()); if (!Number.isInteger(b.version) || b.version < 1) S.fail(400, 'Invalid project version.'); p.version=b.version; }
        const ids=Array.isArray(b.image_ids)?b.image_ids.map(S.uuid):(p.image_id?[p.image_id]:[]);
        if(ids.length>12||new Set(ids).size!==ids.length||(ids[0]||null)!==p.image_id)S.fail(400,'Maximum 12 photos. First image must be the cover.');
        const checked=await rpc('gallery_verify',{project_id:p.id||null,image_ids:ids});
        if(checked?.error)S.fail(checked.error===403?403:400,'Hindi available ang isa sa mga larawan.');
        const project=await rpc('save_project',p);
        const gallery=await rpc('gallery_set',{project_id:project.id,image_ids:ids});
        if(gallery?.error)S.fail(gallery.error===409?409:400,'Na-save ang project pero hindi ang gallery. I-refresh at subukang muli.');
        return json({project:{...project,image_ids:ids}},method==='POST'?201:200);
      }
      if (/^\/api\/manage\/projects\/[^/]+\/progress$/.test(path) && method === 'POST') {
        await user(['sk','chairman']);
        const b=await body();
        if(!Number.isInteger(b.progress)||b.progress<0||b.progress>100)S.fail(400,'Progreso ay dapat 0–100%.');
        if(!Number.isInteger(b.version)||b.version<1)S.fail(400,'Invalid project version.');
        const id=S.uuid(path.split('/')[4]);
        const result=await rpc('project_progress',{id,progress:b.progress,version:b.version});
        if(result?.ok!==true||!result.project)S.fail(503,'Hindi nakumpirma ang pag-update ng progreso.');
        return json({ok:true,project:result.project,unchanged:result.unchanged===true});
      }
      if (/^\/api\/manage\/projects\/[^/]+$/.test(path) && method === 'DELETE') {
        await user(['sk','chairman']);
        const id=S.uuid(path.split('/').pop());
        const b=await body();
        if(!Number.isInteger(b.version)||b.version<1)S.fail(400,'Invalid project version.');
        const result=await db.rpc('project_delete',{id,version:b.version},session);
        if(result?.error===409&&result.reason==='monthly_reports')
          S.fail(409,'Hindi puwedeng i-delete ang proyektong may monthly reports o financial records. Panatilihin ang mga ulat.');
        if(result?.error)S.fail(result.error,result.error===409?'May bagong pagbabago sa proyekto. I-refresh muna bago mag-delete.':'Hindi natuloy ang pag-delete.');
        return json({ok:true,id:result.id});
      }
      if (path === '/api/users' && method === 'GET') {
        await user(['chairman']);
        const result=await rpc('accounts_list');
        return json({users:Array.isArray(result?.users)?result.users:[]});
      }
      if (path === '/api/users' && method === 'POST') {
        const u = await user(['chairman']); await limit('create-user', u.id, 20); const b = await body(), temporaryPassword = S.randomToken();
        const created = await rpc('create_user', { name:S.text(b.name,100,'pangalan'),email:S.email(b.email),position:['kagawad','treasurer','secretary'].includes(b.position)?b.position:'kagawad',password:await S.passwordHash(temporaryPassword) });
        return json({ user:S.safeUser(created), temporaryPassword }, 201);
      }
      if (path.startsWith('/api/users/') && path.split('/').length===4 && method==='PUT') {
        await user(['chairman']);
        const id=S.uuid(path.split('/')[3]),b=await body();
        const name=S.text(b.name,100,'officer name'),email=S.email(b.email);
        if(name.length<2||email.length>254||!['sk','youth'].includes(b.role)||
          !['kagawad','treasurer','secretary'].includes(b.position))
          S.fail(400,'Invalid SK account details.');
        return json(await rpc('accounts_update',{id,name,email,role:b.role,position:b.position}));
      }
      if (path.startsWith('/api/users/') && path.split('/').length===4 && method==='DELETE') {
        await user(['chairman']);
        const id=S.uuid(path.split('/')[3]),b=await body();
        const confirm_name=S.text(b.confirm_name,100,'confirmation name');
        return json(await rpc('accounts_deactivate',{id,confirm_name}));
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
        await user(['chairman']);
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
      if (/^\/api\/officer-images\/[^/]+$/.test(path) && method==='GET') {
        await user(['chairman']);
        const id=S.uuid(path.split('/').pop());
        const img=await rpc('officer_profile_photo_manage',{id});
        const bytes=await db.get(img.storage_path);
        return new Response(new ReadableStream({start(controller){
         for(let i=0;i<bytes.length;i+=65536)controller.enqueue(bytes.subarray(i,i+65536));
         controller.close();
        }}),{headers:{...securityHeaders,'Content-Type':img.mime,'Cache-Control':'private, no-store'}});
      }
      if (/^\/api\/images\/[^/]+$/.test(path) && method==='GET') {
        const id=S.uuid(path.split('/').pop());
        // RPC functions can return {error:404} as a successful JSON response
        // instead of throwing. Do not pass that object to Storage as an image.
        // All fallbacks perform their own public/session access checks.
        let img=null;
        for(const action of ['image','gallery_image','awards_image','awards_image_manage','officer_profile_photo']){
          try{
            const found=await rpc(action,{id});
            if(found && !found.error && typeof found.storage_path==='string' && found.storage_path && typeof found.mime==='string'){
              img=found;break;
            }
          }catch(error){
            // Missing migration on older deployments: try the next supported
            // image source. Unexpected Storage/database errors still propagate.
            if(error.status!==404&&error.status!==503)throw error;
          }
        }
        if(!img)S.fail(404,'Hindi makita ang larawan o walang pahintulot sa image.');
        const bytes=await db.get(img.storage_path);
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
