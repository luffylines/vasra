const { randomUUID } = require('node:crypto');
const S = require('./security.cjs');
const { getConfig, SupabaseBackend } = require('./supabase.cjs');
const Google = require('./google-auth.cjs');
const FBImport = require('./facebook-import.cjs');
const KKExport = require('./kk-export.cjs');
const Mail = require('./vasra-email-template.cjs');
const CHUNK = 1024 * 1024, MAX_IMAGE = 5 * CHUNK;
/** Canonical Philippine mobile: +63 followed by 10 digits, starting with 9.
 * Accept 09..., 9..., or +639... on legacy requests; never truncate extras. */
const phMobile=value=>{
 const input=String(value||'').trim();
 const match=input.match(/^(?:\+63|0)?(9[0-9]{9})$/);
 if(!match)S.fail(400,'Mobile number must be +63 followed by 10 digits beginning with 9.');
 return '+63'+match[1];
};

// Fixed lifetime, counted from login (not extended on every page visit).
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

async function sendAccountEmail(to,link,kind) {
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS;
 const displayName=(process.env.MAIL_FROM_NAME||'SK Vasra').replace(/[\r\n\"<>]/g,'').trim().slice(0,80);
 const sender=displayName?displayName+' <'+from+'>':from;
 if(!apiKey || !/^.{1,100}@[^\s@]+\.[^\s@]+$/.test(from||'')) S.fail(503,'Email recovery is not configured on this deployment.');
 const change=kind==='email',kkReset=kind==='kk_reset';
 const subject=change?'Verify your new SK Vasra email':kkReset?'Reset your SK VASRA KK password':'Reset your SK Vasra password';
 const intro=change?'Confirm your new email address for your SK Vasra account.':
   kkReset?'Use this secure, one-time link to reset the password for your SK VASRA KK member account.':
   'Use the secure link below to reset your SK Vasra password.';
 const expires=change?'15 minutes':'30 minutes';
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from:sender,to:[to],subject,text:intro+'\n\n'+link+'\n\nExpires in '+expires+'. If you did not request this, ignore the email.',
 html:Mail.renderEmail({subject,eyebrow:change?'ACCOUNT SECURITY · EMAIL VERIFICATION':
   kkReset?'KK MEMBERSHIP · ACCOUNT RECOVERY':'STAFF ACCOUNT · SECURITY',
   heading:subject,body:intro,actionLabel:change?'Verify Email Address':'Reset Password',
   actionUrl:link,details:[{label:'Link validity',value:expires}],
   notice:'This is a one-time security link. If you did not request it, ignore this email. Never share this link.'})}),signal:AbortSignal.timeout(10000)}).catch(()=>null);
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

// Only the reviewing SK officer can start this flow. Addresses and reward details
// are obtained from the approval-transaction outbox, never from the client.
// Resend accepting an email does NOT confirm inbox delivery.
async function sendRewardApprovalNotification({id,recipient,reward_title,points_cost}) {
 const apiKey=process.env.RESEND_API_KEY;
 const from=process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS;
 if(!apiKey||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from||''))
  throw Error('mailer_unconfigured');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient||''))
  throw Error('recipient_unavailable');
 const name=(process.env.MAIL_FROM_NAME||'SK Vasra').replace(/[\r\n"<>]/g,'').trim().slice(0,70);
 const sender=name?name+' <'+from+'>':from;
 const subject='Approved ang SK VASRA Reward Mo — Ready for Claiming';
 const url='https://vasra.vercel.app/kk-dashboard#rewards';
 const body='Naaprubahan na ang iyong SK reward redemption request. Maaari mo nang kunin ang reward mo sa SK VASRA Office, 40 Forestry Street, Barangay Vasra, Quezon City. Dalhin ang iyong verified KK ID at ipakita ang approved redemption sa KK Dashboard sa oras ng opisina (9:00 AM – 6:00 PM).';
 let response;
 try{
  response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',
    'Idempotency-Key':'kk-reward-approved/'+id},
   body:JSON.stringify({from:sender,to:[recipient],subject,
    text:body+'\n\nReward: '+reward_title+'\nPoints: '+points_cost+'\nView your KK Dashboard: '+url,
    html:Mail.renderEmail({subject,heading:'Approved! Handa Nang I-claim ang Reward Mo',
     eyebrow:'SK VASRA · KK REWARDS APPROVAL',body,
     actionLabel:'View My Approved Reward',actionUrl:url,
     details:[{label:'Reward',value:reward_title},{label:'Points spent',value:String(points_cost)},
      {label:'Status',value:'APPROVED — READY FOR CLAIMING'},
      {label:'Claiming location',value:'SK VASRA Office · 40 Forestry Street, Barangay Vasra, Quezon City'}],
     notice:'Dalhin ang iyong verified KK ID. Ipakita ang approved redemption record sa SK VASRA office staff. Para lamang ito sa approved requests.',
     footer:'This notice confirms SK reward approval. Contact the SK VASRA office if you need assistance.'})}),
   signal:AbortSignal.timeout(10000)
  });
 }catch{throw Error('provider_unreachable');}
 if(!response.ok){
  console.warn('SK VASRA reward approval email not accepted',{providerStatus:response.status});
  throw Error('provider_not_accepted');
 }
 const data=await response.json().catch(()=>({}));
 return {status:'provider_accepted',providerId:String(data.id||'').slice(0,128)};
}
async function notifyApprovedReward(db,staffSession,redemptionId){
 let ticket;
 try{ticket=await db.rpc('kk_reward_email_claim',{id:redemptionId},staffSession);}
 catch{console.warn('SK VASRA reward mail queue unavailable');return {status:'unavailable'};}
 if(ticket?.error)return {status:'unavailable'};
 if(ticket?.status==='accepted')return {status:'provider_accepted'};
 if(ticket?.status!=='claimed')return {status:ticket?.status||'pending'};
 try{
  const receipt=await sendRewardApprovalNotification(ticket);
  const acknowledged=await db.rpc('kk_reward_email_accept',{
   id:redemptionId,nonce:ticket.nonce,provider_id:receipt.providerId},staffSession);
  if(!acknowledged?.ok)throw Error('receipt_not_recorded');
  return {status:'provider_accepted'};
 }catch(error){
  console.warn('SK VASRA reward email pending retry',{reason:(
   ['mailer_unconfigured','recipient_unavailable','provider_unreachable','provider_not_accepted','receipt_not_recorded']
     .includes(error?.message)?error.message:'other')});
  await db.rpc('kk_reward_email_release',{id:redemptionId,nonce:ticket.nonce},staffSession)
   .catch(()=>{});
  return {status:'pending'};
 }
}


async function deliverKKCardReviewEmail(ticket, pdf) {
 const key=process.env.RESEND_API_KEY;
 const from=process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS;
 if(!key||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from||''))
  throw Error('mailer_unconfigured');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ticket.email||''))
  throw Error('recipient_unavailable');
 const approved=ticket.decision==='approved';
 if(approved&&(!Buffer.isBuffer(pdf)||pdf.length<250))throw Error('attachment_missing');
 const sender=(process.env.MAIL_FROM_NAME||'SK Vasra').replace(/[\r\n"<>]/g,'').trim().slice(0,70);
 const subject=approved?'Approved na ang SK VASRA Identification Card Mo':
  'KK ID Photo Rejected — Kailangan ng Bagong 2×2 Picture';
 const url='https://vasra.vercel.app/kk-dashboard#kk-id';
 const message=approved?
  'Na-approve na ng SK VASRA ang iyong 2×2 portrait. Naka-attach ang iyong front-and-back SK VASRA Identification Card PDF. Maaari mo rin itong i-download sa KK Dashboard kapag naka-login ka.':
  'Hindi na-approve ang iyong KK ID picture. Mag-login sa KK Dashboard, pumili ng bago at malinaw na 2×2 portrait, at pindutin ang Submit Photo for SK Approval para sa panibagong review.';
 const details=[{label:'KK ID',value:ticket.kk_id},
   {label:'Review status',value:approved?'Approved':'Rejected'}];
 if(!approved)details.push({label:'Reason from SK officer',value:ticket.reason||'Photo requirements not met'});
 const email={
  from:(sender?sender+' <'+from+'>':from),to:[ticket.email],subject,
  text:message+'\n'+(approved?'PDF attached.':'Rejection reason: '+(ticket.reason||'Photo requirements not met'))+
       '\nOpen your private KK Dashboard: '+url,
  html:Mail.renderEmail({subject,heading:approved?'Your KK Identification Card Is Ready':
   'Please Upload a New KK ID Photo',eyebrow:'SK VASRA · KK ID PHOTO REVIEW',
   body:message,actionLabel:approved?'Open My ID & Download PDF':'Upload a New Photo',
   actionUrl:url,details,variant:approved?'standard':'alert',
   notice:approved?'Keep your KK ID PDF private. Your official print status remains separate.':
     'Your KK membership remains verified. Only the submitted portrait was rejected.'})
 };
 if(approved)email.attachments=[{
  filename:ticket.kk_id.replace(/[^A-Z0-9-]/gi,'')+'-front-back-CR80.pdf',
  content:pdf.toString('base64')
 }];
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
   'Idempotency-Key':'kk-id-photo-review-'+ticket.event_id},
  body:JSON.stringify(email),signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('provider_not_accepted_'+response.status);
 const receipt=await response.json().catch(()=>({}));
 return String(receipt.id||'').slice(0,128);
}
async function notifyKKCardReview(db,staffSession,id){
 let ticket;
 try{ticket=await db.rpc('kk_card_mail_claim',{id},staffSession);}
 catch{return {status:'unavailable'};}
 if(ticket?.error)return {status:'unavailable'};
 if(ticket?.status!=='claimed')return {status:ticket?.status||'pending'};
 try{
  // PDFs are never exposed via public URLs, only accessed after SK review authorization.
  const pdf=ticket.decision==='approved'?await db.getPrivate(ticket.pdf_path):null;
  const receipt=await deliverKKCardReviewEmail(ticket,pdf);
  const recorded=await db.rpc('kk_card_mail_accept',{id,nonce:ticket.nonce,provider_id:receipt},staffSession);
  if(recorded?.ok!==true)throw Error('receipt_not_recorded');
  return {status:'provider_accepted'};
 }catch(error){
  console.warn('KK ID review email queued for retry',{
   reason:/^(mailer_unconfigured|recipient_unavailable|attachment_missing|receipt_not_recorded)$/.test(error?.message)
    ?error.message:'provider_error'});
  await db.rpc('kk_card_mail_release',{id,nonce:ticket.nonce},staffSession).catch(()=>{});
  return {status:'pending'};
 }
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
      '\n\nThis link expires in 15 minutes. Ignore this message if you did not request it.',
    html:Mail.renderEmail({subject:'Confirm your new SK Vasra KK email',heading:'Confirm Your New Email',
      eyebrow:'KK MEMBERSHIP · EMAIL VERIFICATION',
      body:'You requested a new email address for your SK Vasra KK account. Sign in on the same device, then use the secure link to verify the new address.',
      actionLabel:'Verify New Email',actionUrl:url,details:[{label:'Link validity',value:'15 minutes'}],
      notice:'If you did not request this change, ignore this email. Never share your secure verification link.'})}),
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
     text:body+'\n\nKK Login: '+url+'\n\nKung hindi ikaw ang gumawa ng KK account, makipag-ugnay sa SK Vasra.',
     html:Mail.renderEmail({subject,heading:approved?'Your KK Profile Is Verified':'Your KK Profile Needs Updates',
       eyebrow:'KK MEMBERSHIP · PROFILE REVIEW',body,actionLabel:'Open KK Account',actionUrl:url,
       details:[{label:'Review result',value:approved?'Verified':'Corrections required'}],
       variant:approved?'standard':'alert',
       footer:'If you did not register a KK account, please contact SK Vasra directly.'})}),
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
    text:body,
    html:Mail.renderEmail({subject:'SK Vasra Inquiry - '+titles[topic],
      heading:'New Community Inquiry',eyebrow:'SK VASRA · PUBLIC CONTACT FORM',
      body:'A community member submitted a message through the official SK VASRA contact form.',
      details:[{label:'From',value:name},{label:'Reply to',value:email},
        {label:'Topic',value:titles[topic]},{label:'Message',value:message}],
      notice:'Please reply to the original sender address shown above. Submitted content has not been verified.',
      footer:'SK VASRA official contact form notification. Reply-To is set to the visitor’s provided email.'})
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
          S.fail(result.error, result.reason === 'exact_duplicate' ? 'May naka-save nang resolution na kapareho ng number, year at title. I-edit ang existing record sa halip na i-duplicate.' : result.reason === 'password_change_required' ? 'Palitan muna ang pansamantalang password.' : messages[result.error] || 'Hindi natuloy ang request.');
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
      // Server-side gate: only the Chairperson and the Secretary may inspect,
      // approve/reject, edit, export or delete KK Profiling records.
      async function kkProfilingAdmin() {
        const actor=await user(['sk','chairman']);
        if(actor.role!=='chairman' && !(actor.role==='sk' && actor.position==='secretary'))
          S.fail(403,'KK Profiling ay para lamang sa SK Chairperson at SK Secretary.');
        return actor;
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
      // Public SK Resolutions list publishes only officer-approved Drive links.
      if(path==='/api/sk-resolutions'&&method==='GET'){
        const list=await db.rpc('resolutions_public_list');
        if(list?.error)S.fail(list.error,'Unable to load published SK Resolutions.');
        return json(list,200,{'Cache-Control':'public,max-age=60'});
      }
      if(path==='/api/sk-resolutions/manage'&&method==='GET'){
        await user(['sk','chairman']);
        return json(await rpc('resolutions_staff_list'));
      }
      if(path==='/api/sk-resolutions/manage'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('sk-resolutions-edit-ip',context.ip||'unknown',100);
        const b=await body();
        const number=String(b.number||'').trim(),title=String(b.title||'').trim(),
         description=String(b.description||'').trim(),author=String(b.author||'').trim(),year=Number(b.year),
         approved_on=String(b.approved_on||'').trim(),published=b.published,
         value=String(b.url||'').trim();
        if(number.length<2||number.length>80||title.length<3||title.length>180||
           description.length>600||author.length>600||!Number.isInteger(year)||year<2000||year>2100||
           typeof published!=='boolean'||value.length>1500||
           (approved_on&&!/^20\d{2}-\d{2}-\d{2}$/.test(approved_on)))
          S.fail(400,'Check resolution number, title, year, date and publication state.');
        let link;
        try{link=new URL(value)}catch{S.fail(400,'Enter a valid Google Drive document URL.');}
        const allowed=(link.hostname==='drive.google.com'&&(
         /^\/(drive\/folders|file\/d)\/[A-Za-z0-9_-]+/.test(link.pathname)||
         (link.pathname==='/open'&&/^[A-Za-z0-9_-]+$/.test(link.searchParams.get('id')||''))))||
         (link.hostname==='docs.google.com'&&
          /^\/(document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]+/.test(link.pathname));
        if(link.protocol!=='https:'||link.username||link.password||!allowed)
          S.fail(400,'Only Google Drive or Google Docs HTTPS links are permitted.');
        const params={id:b.id?S.uuid(b.id):null,number,title,year,approved_on,
          description,author,url:value,published};
        return json(await rpc('resolutions_save',params));
      }
      // Signed-in SK staff may bulk-import pasted Google Sheets rows as draft records.
      if(path==='/api/sk-resolutions/import'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('sk-resolutions-import-ip',context.ip||'unknown',20);
        const b=await body(),rows=b.rows;
        if(!Array.isArray(rows)||rows.length<1||rows.length>150)
          S.fail(400,'Import between 1 and 150 rows per batch.');
        const clean=rows.map(row=>{
          if(!row||typeof row!=='object'||Array.isArray(row))S.fail(400,'Invalid spreadsheet row.');
          const x={};
          for(const k of ['number','title','description','approved_on','url','author']){
            const v=String(row[k]||'').trim();
            if(v.length>1800)S.fail(400,'Spreadsheet cell exceeds the allowed size.');
            x[k]=v;
          }
          x.year=Number(row.year);
          x.published=false; // Bulk imports require explicit later review before public publication.
          return x;
        });
        const result=await db.rpc('resolutions_import_bulk_import',{rows:clean},session);
        if(result?.error)S.fail(result.error,'Unable to import these SK Resolutions.');
        return json(result);
      }
      // SK FDP Board: five publication categories, Google Drive documents only.
      if(path==='/api/disclosure'&&method==='GET'){
        return json(await db.rpc('disclosure_public'));
      }
      if(path==='/api/disclosure/manage'&&method==='GET'){
        await user(['sk','chairman']);
        return json(await rpc('disclosure_manage'));
      }
      if(path==='/api/disclosure/manage'&&method==='POST'){
        await user(['sk','chairman']);
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
        const phoneInput=field(b.phone,35),phone=phoneInput?phMobile(phoneInput):'',
              facebook_url=field(b.facebook_url,450);
        if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
          S.fail(400,'Invalid public contact email.');

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
        if(weekday===7&&(b.open_time!=='09:00'||b.close_time!=='18:00'))S.fail(400,'Sunday office hours are fixed at 9 AM–6 PM.');
        return json(await rpc('duty_management_save_hours',{
         weekday,open_time:b.open_time,close_time:b.close_time
        }));
      }
      if (path === '/api/officer-profiles/duty' && method === 'POST') {
        await user(['chairman']);
        const b=await body();
        if(!Object.prototype.hasOwnProperty.call(b,'duty_day')&&!Object.prototype.hasOwnProperty.call(b,'duty_photo_id')&&!Object.prototype.hasOwnProperty.call(b,'duty_sunday'))S.fail(400,'Missing duty update.');
        const patch={id:S.uuid(b.id)};
        if(Object.prototype.hasOwnProperty.call(b,'duty_day')){
          if(b.duty_day!==null&&(!Number.isInteger(b.duty_day)||b.duty_day<1||b.duty_day>7))S.fail(400,'Select one duty weekday.');
          if(b.duty_day===7)S.fail(400,'Sunday is selected separately from regular weekday duties.');
          patch.duty_day=b.duty_day;
        }
        if(Object.prototype.hasOwnProperty.call(b,'duty_sunday')){
          if(typeof b.duty_sunday!=='boolean')S.fail(400,'Sunday attendance must be true or false.');
          patch.duty_sunday=b.duty_sunday;
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
      async function kkCard(action,payload={},staff=false){
        const result=await db.rpc('kk_card_'+action,payload,staff?session:kkSession);
        if(result?.error)S.fail(result.error,({400:'Invalid KK ID photo details.',401:'Login required.',403:'Access denied.',404:'No ID photo uploaded yet.',409:'This ID photo has already been reviewed or is not ready.'})[result.error]||'KK ID request failed.');
        return result;
      }
      const kkGoogleSettings=()=>{
        // Prefer isolated youth credentials, but safely reuse an existing
        // configured Google OAuth client through the *already authorized*
        // staff callback. The two identities/sessions remain fully separate.
        const clientId=process.env.KK_GOOGLE_CLIENT_ID,clientSecret=process.env.KK_GOOGLE_CLIENT_SECRET;
        const redirectUri=process.env.KK_GOOGLE_REDIRECT_URI;
        const dedicated={clientId,clientSecret,redirectUri,
         enabled:!!(clientId&&clientSecret&&redirectUri&&redirectUri===cfg.origin+'/api/kk/google/callback'&&
           redirectUri?.startsWith('https://')),mode:'dedicated'};
        if(dedicated.enabled)return dedicated;
        const shared=Google.googleConfig(cfg);
        if(shared.enabled)return {...shared,mode:'shared'};
        return {...dedicated,mode:'unavailable'};
      };
      if(path==='/api/kk/google/status'&&method==='GET'){
        const settings=kkGoogleSettings();
        return json({enabled:settings.enabled,reason:settings.enabled?'ready':
          process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET
            ?'callback_domain_mismatch':'kk_google_not_configured'});
      }
      if(path==='/api/kk/google/start'&&method==='GET'){
        const settings=kkGoogleSettings();
        if(!settings.enabled)S.fail(503,'Google sign-in para sa KK ay hindi pa configured.');
        await limit('kk-google-ip',context.ip||'unknown',12);
        const flow=Google.createFlow(settings);
        const transient='vasra_kk_oauth='+flow.cookie+'; HttpOnly; SameSite=Lax; Path='+
          (settings.mode==='shared'?'/api/auth/google':'/api/kk/google')+'; Max-Age=600'+(cfg.secure?'; Secure':'');
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
        await kkProfilingAdmin();
        return json(await kkRpc('sitio_list',{},true));
      }
      if(path==='/api/kk/staff/sitios'&&method==='POST'){
        await kkProfilingAdmin();
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
        const middle_name=String(b.middle_name||'').trim(),phone=phMobile(b.phone);
        if(first_name.length<2||last_name.length<2||middle_name.length>80 ||
          [first_name,middle_name,last_name].some(x=>/[\x00-\x1f<>]/.test(x))||
          !/^\+639\d{9}$/.test(phone))
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
      // KK password recovery: separate tokens, sessions and account type from staff resets.
      if(path==='/api/kk/reset/request'&&method==='POST'){
        await limit('kk-reset-ip',context.ip||'unknown',8);
        const b=await body(),email=S.email(b.email);
        if(email.length>160)S.fail(400,'Invalid KK email.');
        await limit('kk-reset-email',email,4);
        if(!process.env.RESEND_API_KEY||!(process.env.RESEND_FROM_EMAIL||process.env.MAIL_FROM_ADDRESS))
          S.fail(503,'KK password recovery email is not configured.');
        if(!cfg.origin||!cfg.origin.startsWith('https://'))S.fail(503,'Configure PUBLIC_ORIGIN for secure KK email links.');
        const token=S.randomToken(),token_hash=S.hash(token);
        const result=await db.rpc('kk_password_reset_request',{email,token_hash});
        if(result?.error)S.fail(result.error,'Unable to request a KK password reset.');
        if(result?.delivery_email){
          const link=cfg.origin+'/kk-reset#token='+encodeURIComponent(token);
          try{await sendAccountEmail(result.delivery_email,link,'kk_reset');}
          catch{
            await db.rpc('kk_password_reset_cancel',{token_hash}).catch(()=>{});
            console.warn('SK VASRA KK reset email delivery failed');
          }
        }
        // Same response for existing and unknown addresses (account enumeration protection).
        return json({ok:true,message:'If a KK account exists with this email, a reset link will be sent.'});
      }
      if(path==='/api/kk/reset/confirm'&&method==='POST'){
        await limit('kk-reset-confirm-ip',context.ip||'unknown',15);
        const b=await body(),token=String(b.token||'');
        if(!/^[A-Za-z0-9_-]{40,128}$/.test(token))S.fail(400,'Invalid KK password reset link.');
        S.password(b.password);
        const result=await db.rpc('kk_password_reset_confirm',{
          token_hash:S.hash(token),password_hash:await S.passwordHash(b.password)});
        if(result?.error)S.fail(400,'Invalid, expired or already-used KK password reset link.');
        return json({ok:true},200,kkCookie(''));
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
          else if(typeof v==='string'&&v.length<=300)
           profile[k]=k==='emergency_phone'&&v.trim()?phMobile(v):v.trim();
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
        if(identity.phone)identity.phone=phMobile(identity.phone);
        return json(await kkRpc('profile_save',{profile,step,...identity}));
      }
      // KK member ID card photograph (separate from the enrollment Valid ID).
      // All bytes live in private Supabase Storage; public file access is forbidden.
      if(path==='/api/kk/id-card'&&method==='GET'){
        if(!kkSession)S.fail(401,'Sign in to your KK account.');
        return json(await kkCard('my_card',{},false));
      }
      if(path==='/api/kk/id-card/photo'&&method==='POST'){
        if(!kkSession)S.fail(401,'Sign in to your KK account.');
        await limit('kk-id-card-upload-ip',context.ip||'unknown',10);
        const b=await body(),mime=String(b.mime||'');
        const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[mime];
        const name=String(b.name||'').slice(0,120).replace(/[\x00-\x1f<>/\\]/g,'_');
        if(!ext||name.length<3||typeof b.data!=='string'||b.data.length>2900000)
          S.fail(400,'JPG, PNG o WEBP only; maximum 2 MB.');
        const bytes=S.base64(b.data);
        if(bytes.length<100||bytes.length>2000000||
          (mime==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))||
          (mime==='image/png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
          (mime==='image/webp'&&!(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')))
          S.fail(400,'Uploaded photo is not a valid image or exceeds 2 MB.');
        const mine=await kkRpc('mine');
        if(mine.profile?.status!=='verified')S.fail(403,'SK verification required.');
        const filePath='cards/'+S.uuid(mine.member.id)+'/'+randomUUID()+'.'+ext;
        await db.putPrivate(filePath,bytes,mime);
        return json(await kkCard('photo_save',{path:filePath,name,mime},false));
      }
      if(path==='/api/kk/id-card/photo'&&method==='GET'){
        if(!kkSession)S.fail(401,'Sign in to your KK account.');
        const item=await kkCard('my_photo_access',{},false);
        const bytes=await db.getPrivate(item.path);
        return new Response(bytes,{headers:{...securityHeaders,'Content-Type':item.mime,
          'Content-Disposition':'inline','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});
      }
      if(path==='/api/kk/staff/id-cards'&&method==='GET'){
        await user(['sk','chairman']);
        const catalog=await kkCard('staff_list',{},true);
        try{
          const queue=await db.rpc('kk_card_mail_list',{},session);
          const states=new Map((queue.messages||[]).map(x=>[x.member_id,x]));
          catalog.members=(catalog.members||[]).map(x=>({...x,
            email_state:states.get(x.member_id)?.delivery_state||'not_queued',
            email_pdf_ready:states.get(x.member_id)?.has_pdf===true}));
        }catch{catalog.members=(catalog.members||[]).map(x=>({...x,email_state:'unavailable'}));}
        return json(catalog);
      }
      if(path==='/api/kk/staff/id-cards/review'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-id-cards-review-ip',context.ip||'unknown',100);
        const b=await body(),status=String(b.status||'');
        if(!['approved','rejected'].includes(status))S.fail(400,'Invalid photo approval status.');
        const id=S.uuid(b.id);
        const result=await kkCard('staff_review',{id,status,note:String(b.note||'').slice(0,400)},true);
        if(status==='rejected')return json({...result,email_notification:await notifyKKCardReview(db,session,id)});
        // For approval the authorized staff browser now generates the exact
        // existing front/back PDF, uploads it privately, then queues the email.
        return json({...result,email_notification:{status:'awaiting_pdf'}});
      }
      if(path==='/api/kk/staff/id-cards/notify'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-id-card-email-ip',context.ip||'unknown',15);
        const b=await body(),id=S.uuid(b.id),action=String(b.action||'');
        if(action==='attach_and_send'){
          const source=await kkCard('staff_list',{},true);
          const member=(source.members||[]).find(x=>x.member_id===id);
          if(!member||member.status!=='approved'||!member.photo_exists)
            S.fail(409,'Card photo must be approved before a PDF may be emailed.');
          if(typeof b.pdf_data!=='string'||b.pdf_data.length>3800000)
            S.fail(413,'KK ID PDF must be smaller than 2.7 MB.');
          const bytes=S.base64(b.pdf_data);
          if(bytes.length<300||bytes.length>2700000||
             bytes.subarray(0,8).toString('ascii')!=='%PDF-1.4'||
             !bytes.subarray(-128).toString('ascii').includes('%%EOF')||
             !bytes.includes(Buffer.from('/Count 2 '))||
             !bytes.includes(Buffer.from('/MediaBox [0 0 ')))
            S.fail(400,'The attachment is not a valid two-sided CR80 KK ID PDF.');
          const pdfPath='card-pdfs/'+id+'/'+randomUUID()+'.pdf';
          await db.putPrivate(pdfPath,bytes,'application/pdf');
          const attached=await db.rpc('kk_card_mail_attach',{id,path:pdfPath},session);
          if(attached?.ok!==true){
            // A repeat request may occur after the first upload already saved the PDF.
            const current=await db.rpc('kk_card_mail_list',{},session).catch(()=>({}));
            if(!(current.messages||[]).some(x=>x.member_id===id&&x.has_pdf))
              S.fail(409,'Photo approval email queue is unavailable or already processed.');
          }
          return json({ok:true,email_notification:await notifyKKCardReview(db,session,id)});
        }
        if(action==='retry')return json({ok:true,email_notification:await notifyKKCardReview(db,session,id)});
        S.fail(400,'Invalid KK ID email action.');
      }
      // Printing is an explicitly confirmed physical handoff. Generating or
      // downloading a PDF must never mark a card as printed automatically.
      if(path==='/api/kk/staff/id-cards/printed'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-id-cards-print-ip',context.ip||'unknown',60);
        const b=await body();
        if(b.confirmed!==true)S.fail(400,'Confirm that the physical ID was printed.');
        return json(await kkCard('staff_print',{id:S.uuid(b.id)},true));
      }
      if(/^\/api\/kk\/staff\/id-cards\/[0-9a-f-]{36}\/photo$/i.test(path)&&method==='GET'){
        await user(['sk','chairman']);
        const id=S.uuid(path.split('/')[5]);
        const item=await kkCard('staff_photo_access',{id},true);
        const bytes=await db.getPrivate(item.path);
        return new Response(bytes,{headers:{...securityHeaders,'Content-Type':item.mime,
          'Content-Disposition':'inline','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});
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
      // Staff-only private ID viewer. Inline preview uses SAMEORIGIN and never caches.
      // Original download route remains available separately.
      const staffDocumentMatch=path.match(/^\/api\/kk\/staff\/id\/([0-9a-f-]{36})(\/preview)?$/i);
      if(staffDocumentMatch&&method==='GET'){
        await kkProfilingAdmin();
        const id=S.uuid(staffDocumentMatch[1]),inline=!!staffDocumentMatch[2];
        const info=await kkRpc('staff_id_access',{id},true);
        if(!['image/png','image/jpeg','application/pdf'].includes(info.mime))S.fail(415,'Unsupported document format.');
        const bytes=await db.getPrivate(info.path);
        const extension=info.mime==='application/pdf'?'pdf':info.mime==='image/png'?'png':'jpg';
        return new Response(bytes,{headers:{...securityHeaders,'Content-Type':info.mime,
          'Content-Disposition':(inline?'inline':'attachment')+'; filename="KK-Valid-ID.'+extension+'"',
          'X-Frame-Options':inline?'SAMEORIGIN':'DENY',
          'Content-Security-Policy':"frame-ancestors 'self'"}});
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
      // Event-specific QR attendance: server clocks, fixed ten points and authenticated officer audit.
      // Only the authenticated SK officer can distinguish verified membership
      // from an approved and uploaded 2×2 ID card (QR scanning).
      const scanIdentity=async(kkId,mode)=>{
        const row=await db.rpc('kk_scan_identity_lookup',{kk_id:kkId,mode},session);
        if(row?.error)S.fail(row.error,({
          member_not_verified:'KK member is not verified or KK ID was not found.',
          card_not_verified:"This user's Member ID/Card is not verified yet. Enter the verified KK ID manually until the 2×2 photo and SK card approval are complete.",
          invalid_scan_request:'Enter a valid VASRA-KK ID and choose Manual or QR.'
        })[row.reason]||'Unable to verify the KK member or card.');
        return row;
      };
      const eventRpc=async(action,payload={},staff=false)=>{
        const result=await db.rpc('kk_event_'+action,payload,staff?session:kkSession);
        if(result?.error)S.fail(result.error,({
          already_checked_in:'This KK member has already checked in to this event. Points were not added again.',
          event_not_in_progress:'Event is not currently Isinasagawa or has not been published.',
          member_not_verified:'No verified member with that KK ID.',
          invalid_kk_id:'Enter a valid VASRA-KK ID.'
        })[result.reason]||({
          400:'Invalid event or KK ID.',401:'Please log in.',
          403:'SK Officer authorization required.',404:'Event or KK member not found.',
          409:'Attendance already recorded or event is not open.'
        })[result.error]||'Unable to record event participation.');
        return result;
      };
      if(path==='/api/kk/event-history'&&method==='GET'){
        if(!kkSession)S.fail(401,'Please sign in to your KK account.');
        return json(await eventRpc('history'));
      }
      if(path==='/api/kk/staff/events'&&method==='GET'){
        await user(['sk','chairman']);
        const data=await eventRpc('events',{},true);
        if(Array.isArray(data.finished_events)){
          data.finished_events=[...data.finished_events].sort((a,b)=>
            (Date.parse(b.last_checkin_at||b.created_at||0)||0)-
            (Date.parse(a.last_checkin_at||a.created_at||0)||0));
        }
        return json(data);
      }
      if(path==='/api/kk/staff/events/roster'&&method==='GET'){
        await user(['sk','chairman']);
        return json(await eventRpc('roster',{project_id:S.uuid(url.searchParams.get('project_id'))},true));
      }
      if(path==='/api/kk/staff/events/checkin'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-event-checkin-ip',context.ip||'unknown',240);
        const b=await body(),kkId=String(b.kk_id||'').trim().toUpperCase();
        if(!/^VASRA-KK-[0-9]{1,10}$/.test(kkId))S.fail(400,'Enter a valid VASRA-KK member ID.');
        const mode=b.mode===undefined?'manual':String(b.mode);
        if(!['manual','qr'].includes(mode))S.fail(400,'Invalid attendance entry mode.');
        const identity=await scanIdentity(kkId,mode);
        const recorded=await eventRpc('checkin',{project_id:S.uuid(b.project_id),kk_id:kkId},true);
        return json({...recorded,card_verified:identity.card_verified,
          card_status:identity.card_status,entry_mode:mode});
      }
      if(path==='/api/kk/staff/events/export'&&method==='GET'){
        await user(['sk','chairman']);
        const projectId=S.uuid(url.searchParams.get('project_id'));
        const data=await eventRpc('roster',{project_id:projectId},true);
        if(data.event?.status!=='Natapos')S.fail(409,'Mark the event Natapos to download its final Excel attendance log.');
        const eventTitle=String(data.event?.title||'SK Event');
        const datePht={format:KKExport.dateMMDDYYYY};
        const timePht=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',
          hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
        const rows=[
          ['SK VASRA - OFFICIAL EVENT ATTENDANCE LOG'],
          ['Event Title',eventTitle],['Event Status','Natapos'],
          ['Timezone','Asia/Manila (PHT)'],[],
          ['KK ID','Full Name','Date (PHT)','Time (PHT)','Points','Checked In By']
        ];
        for(const r of (data.participants||[])){
          const when=new Date(r.checked_in_at);
          if(!Number.isFinite(when.getTime()))continue;
          rows.push([String(r.kk_id||''),String(r.name||''),datePht.format(when),
            timePht.format(when),Number(r.points||0),String(r.officer||'')]);
        }
        return new Response(KKExport.workbook(rows),{status:200,headers:{...securityHeaders,
          'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':'attachment; filename="SK-Vasra-Event-Attendance.xlsx"',
          'Cache-Control':'private,no-store'}});
      }
      // New inventory-safe KK Rewards service. Staff and youth sessions are never interchangeable.
      const rewardRpc=async(action,payload={},staff=false)=>{
        const result=await db.rpc('kk_rewards_'+action,payload,staff?session:kkSession);
        if(result?.error)S.fail(result.error,({
          sold_out:'Wala nang available stock para sa reward.',
          insufficient_points:'Kulang ang available KK points.',
          already_requested:'May pending redemption ka na para sa reward na ito.',
          already_awarded:'Na-award na ang project participation points para sa member na ito.',
          insufficient_inventory_for_existing_claims:'Hindi puwedeng ibaba ang stock sa reserved at claimed quantity.'
        })[result.reason]||({
          400:'Suriin ang reward, inventory at points details.',
          401:'Mag-login muna.',
          403:'Walang pahintulot sa reward action.',
          404:'Hindi makita ang reward o member.',
          409:'May pending request o na-process na ang action.'
        })[result.error]||'Hindi natuloy ang reward request.');
        return result;
      };
      if(path==='/api/kk/rewards'&&method==='GET'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK.');
        return json(await rewardRpc('catalog'));
      }
      if(path==='/api/kk/rewards'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna sa KK.');
        await limit('kk-reward-request-ip',context.ip||'unknown',25);
        const b=await body();
        return json(await rewardRpc('request',{id:S.uuid(b.id)}));
      }
      if(path==='/api/kk/staff/rewards'&&method==='GET'){
        await user(['sk','chairman']);
        const catalog=await rewardRpc('staff_list',{},true);
        try{
          const notices=await db.rpc('kk_reward_email_list',{},session);
          const statuses=new Map((notices.notifications||[]).map(row=>[row.id,row.status]));
          catalog.claims=(catalog.claims||[]).map(item=>({
            ...item,email_status:item.status==='approved'?(statuses.get(item.id)||'not_queued'):null
          }));
        }catch{
          // Show the catalog even when approval mail migration is not yet applied.
          catalog.claims=(catalog.claims||[]).map(item=>({...item,email_status:null}));
        }
        return json(catalog);
      }
      if(path==='/api/kk/staff/rewards'&&method==='POST'){
        const actor=await user(['sk','chairman']);
        const b=await body();
        const action=String(b.action||'');
        if(action==='save'){
          if(actor.role!=='chairman')S.fail(403,'Chairman approval required to manage rewards.');
          const title=S.text(b.title,120,'Reward title'),description=String(b.description||'').trim();
          const cost=Number(b.cost),quantity=Number(b.quantity);
          if(title.length<3||description.length>500||!Number.isInteger(cost)||cost<1||cost>10000||
             !Number.isInteger(quantity)||quantity<0||quantity>100000)
            S.fail(400,'Enter a valid title, points and available quantity.');
          return json(await rewardRpc('save',{id:b.id?S.uuid(b.id):null,title,description,
            cost,quantity},true));
        }
        if(action==='toggle'){
          if(actor.role!=='chairman')S.fail(403,'Chairman approval required.');
          return json(await rewardRpc('toggle',{id:S.uuid(b.id),active:b.active===true},true));
        }
        if(action==='review'){
          await limit('kk-staff-redeem-ip',context.ip||'unknown',70);
          const decision=String(b.decision||'');
          if(!['approved','rejected'].includes(decision))S.fail(400,'Choose approve or reject.');
          const claimId=S.uuid(b.id);
          const reviewed=await rewardRpc('review',{id:claimId,decision,
            note:String(b.note||'').trim().slice(0,500)},true);
          // Review and point deduction commit first. Only approved transitions
          // enqueue mail inside that same DB transaction; rejection sends nothing.
          if(decision==='approved')
            return json({...reviewed,approval_email:await notifyApprovedReward(db,session,claimId)});
          return json({...reviewed,approval_email:{status:'not_applicable'}});
        }
        if(action==='retry_approval_email'){
          await limit('kk-reward-email-retry-ip',context.ip||'unknown',12);
          const result=await notifyApprovedReward(db,session,S.uuid(b.id));
          return json({ok:true,approval_email:result});
        }
        if(action==='delete'){
          if(actor.role!=='chairman')S.fail(403,'Only the SK Chairman can delete rewards.');
          const result=await db.rpc('kk_reward_delete_delete',{id:S.uuid(b.id)},session);
          if(result?.error)S.fail(result.error,result.reason==='reward_has_redemptions_disable_instead'? 'This reward has redemption history. Disable it instead of deleting.':'Unable to delete reward.');
          return json(result);
        }
        if(action==='attendance_award'){
          S.fail(409,'Use SK Event Attendance to scan an official KK ID and automatically award 10 points.');
        }
        S.fail(400,'Unknown SK rewards action.');
      }
      if(path==='/api/kk/staff/rewards/image'&&method==='POST'){
        const actor=await user(['chairman']);
        await limit('kk-reward-image-ip',context.ip||'unknown',15);
        const b=await body();
        const id=S.uuid(b.id),mime=String(b.mime||'');
        const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[mime];
        if(!ext||typeof b.data!=='string'||b.data.length>2900000)S.fail(400,'Select JPG, PNG or WEBP under 2MB.');
        // Confirm reward ownership/role before storing image bytes.
        const catalog=await rewardRpc('staff_list',{},true);
        if(!catalog.rewards?.some(x=>x.id===id))S.fail(404,'Reward not found.');
        const bytes=S.base64(b.data);
        if(bytes.length<100||bytes.length>2000000||
          (mime==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))||
          (mime==='image/png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
          (mime==='image/webp'&&!(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')))
         S.fail(400,'Invalid image bytes.');
        const filePath='rewards/'+id+'/'+randomUUID()+'.'+ext;
        // Reward art belongs in the private WEBP-capable project-images bucket,
        // never in the government-ID-only identity bucket.
        await db.putReward(filePath,bytes,mime);
        return json(await rewardRpc('set_image',{id,path:filePath,mime},true));
      }
      if(/^\/api\/kk\/rewards\/image\/[0-9a-f-]{36}$/.test(path)&&method==='GET'){
        if(!session&&!kkSession)S.fail(401,'Please sign in.');
        const id=S.uuid(path.split('/').at(-1));
        const image=await rewardRpc('image_access',{id},!!session);
        const bytes=await db.getReward(image.path);
        return new Response(bytes,{status:200,headers:{...securityHeaders,'Content-Type':image.mime,
          'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});
      }
      if(path==='/api/kk/redeem'&&method==='POST'){
        if(!kkSession)S.fail(401,'Mag-login muna.');
        const b=await body();
        return json(await rewardRpc('request',{id:S.uuid(b.id)}));
      }
      // Every authenticated active SK officer can review community service requests.
      // The staff cookie is distinct from the youth KK login cookie.
      if(path==='/api/kk/staff/profile-delete'&&method==='POST'){
        // Irreversible action for an authenticated SK officer only. Require a
        // member-name match and a unique challenge retyped from the modal.
        await kkProfilingAdmin();
        await limit('kk-profile-delete-ip',context.ip||'unknown',8);
        const b=await body(),name=String(b.confirm_name||'').trim();
        const memberId=S.uuid(b.id),challenge=String(b.confirm_code||'').trim();
        if(name.length<3||name.length>200||
           challenge!=='DELETE KK '+memberId.slice(0,8).toUpperCase())
          S.fail(400,'Kumpirmahin ang pangalan at eksaktong deletion code.');
        const result=await db.rpc('kk_profile_delete_delete',
          {id:memberId,confirm_name:name,confirm_code:challenge},session);
        if(result?.error)S.fail(result.error,result.error===409?'Hindi tugma ang buong pangalan. Walang nabura.':
          result.error===404?'Hindi na makita ang KK profile.':'Walang pahintulot na mag-delete ng KK profile.');
        // No public storage path is returned to the caller.
        let storage_cleanup_pending=false;
        if(result?.storage_path){
          try{await db.deletePrivate(result.storage_path);}
          catch(error){
            storage_cleanup_pending=true;
            console.warn('KK private storage deletion requires manual cleanup',{memberDeleted:true});
          }
        }
        return json({ok:result?.ok===true,storage_cleanup_pending});
      }
      if(path==='/api/kk/staff/profile-edit'&&method==='POST'){
        await kkProfilingAdmin();
        await limit('kk-profile-staff-edit-ip',context.ip||'unknown',80);
        const b=await body(),sections=['personal','address','education','additional','emergency'];
        if(!sections.includes(b.section)||!b.changes||Array.isArray(b.changes)||
           typeof b.changes!=='object'||Object.keys(b.changes).length<1||
           Object.keys(b.changes).length>10)S.fail(400,'Invalid profile edit.');
        if(Object.prototype.hasOwnProperty.call(b.changes,'emergency_phone')){
          b.changes.emergency_phone=phMobile(b.changes.emergency_phone);
        }
        const outcome=await db.rpc('kk_profile_editor_update',
          {id:S.uuid(b.id),section:b.section,changes:b.changes},session);
        if(outcome?.error)S.fail(outcome.error,outcome.error===403
         ?'Hindi ka awtorisadong mag-edit ng KK profile.':'Invalid KK profile changes.');
        return json(outcome);
      }
      if(path==='/api/kk/staff/services/scan'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-staff-scan-ip',context.ip||'unknown',65);
        const b=await body();
        const id=String(b.kk_id||'').trim().toUpperCase();
        if(!/^VASRA-KK-[0-9]{1,10}$/.test(id))
          S.fail(400,'Hindi valid ang KK ID QR. Scan the official back of the KK ID.');
        const action=String(b.action||'');
        const mode=b.mode===undefined?'manual':String(b.mode);
        if(!['manual','qr'].includes(mode))S.fail(400,'Invalid KK ID entry mode.');
        const identity=await scanIdentity(id,mode);
        if(action==='lookup'){
          const result=await kkRpc('service_scan_lookup',{kk_id:id},true);
          if(result?.error)S.fail(result.error,
            result.error===404?'Hindi makita ang verified KK ID.':'KK QR lookup unavailable.');
          return json({...result,card_verified:identity.card_verified,
            card_status:identity.card_status,member_verified:true,entry_mode:mode});
        }
        if(action==='complete_pending'){
          const note=String(b.note||'').trim();
          if(note.length>500)S.fail(400,'Officer note must be 500 characters or fewer.');
          const result=await kkRpc('service_scan_complete_pending',{
            kk_id:id,request_id:S.uuid(b.request_id),
            details:b.details,note},true);
          if(result?.error)S.fail(result.error,'Pending service could not be completed.');
          return json({...result,card_verified:identity.card_verified,entry_mode:mode});
        }
        if(action!=='walkin_complete')S.fail(400,'Invalid scan action.');
        const type=String(b.service_type||''),d=b.details;
        if(!['printing','computer','retabox'].includes(type)||!d||
           typeof d!=='object'||Array.isArray(d))
          S.fail(400,'Choose Printing, Computer Use, or RetaBox and provide details.');
        const details={};
        const integer=(value,min,max)=>Number.isInteger(Number(value)) &&
          Number(value)>=min&&Number(value)<=max&&/^\d+$/.test(String(value));
        if(type==='printing'){
          if(!['short','long'].includes(d.paper_size)||!['bw','colored'].includes(d.color)||
             !integer(d.pages,1,100)||!integer(d.copies,1,100))
            S.fail(400,'Select valid paper, color, pages, and copies.');
          Object.assign(details,{paper_size:d.paper_size,color:d.color,
            pages:Number(d.pages),copies:Number(d.copies)});
        }else if(type==='computer'){
          if(!integer(d.hours,1,8))S.fail(400,'Computer hours must be between 1 and 8.');
          details.hours=Number(d.hours);
        }else{
          if(!integer(d.grams,1,100000))S.fail(400,'RetaBox weight must be 1–100,000 grams.');
          details.grams=Number(d.grams);
        }
        const note=String(b.note||'').trim();
        if(note.length>500)S.fail(400,'Officer note must be 500 characters or fewer.');
        const result=await kkRpc('service_scan_walkin_complete',{
          kk_id:id,entry_key:S.uuid(b.entry_key),service_type:type,details,note},true);
        if(result?.error)S.fail(result.error,
          result.reason==='points_rate_not_configured'?'Set the official RetaBox points rate first.':
          'Walk-in service could not be completed.');
        return json({...result,card_verified:identity.card_verified,entry_mode:mode});
      }
      if(path==='/api/kk/staff/services'&&method==='GET'){
        await user(['sk','chairman']);
        const data=await kkRpc('service_workflow_staff_list',{},true);
        if(data?.error)S.fail(data.error,'Hindi ma-load ang SK Services.');
        return json(data);
      }
      if(path==='/api/kk/staff/services'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-service-review-ip',context.ip||'unknown',80);
        const b=await body(),decision=String(b.status||''),note=String(b.note||'').trim();
        if(!['approved','rejected'].includes(decision)||note.length>500||
           (decision==='rejected'&&note.length<5))S.fail(400,'Invalid service review.');
        const data={id:S.uuid(b.id),status:decision,note};
        if(decision==='approved'&&b.approved_details){
          if(typeof b.approved_details!=='object'||Array.isArray(b.approved_details))
            S.fail(400,'Invalid approved service details.');
          const d=b.approved_details;
          if(d.paper_size!==undefined){
            const pages=Number(d.pages),copies=Number(d.copies);
            if(!['short','long'].includes(d.paper_size)||!['bw','colored'].includes(d.color)||
               !Number.isInteger(pages)||pages<1||pages>100||
               !Number.isInteger(copies)||copies<1||copies>100)
              S.fail(400,'Suriin ang paper size, print type, pages at copies.');
            data.approved_details={paper_size:d.paper_size,color:d.color,pages,copies};
          }else if(d.hours!==undefined){
            const hours=Number(d.hours);
            if(!Number.isInteger(hours)||hours<1||hours>8)S.fail(400,'Approved hours must be 1–8.');
            data.approved_details={hours};
          }else S.fail(400,'Missing service details.');
        }
        if(decision==='approved'&&b.verified_grams!==undefined){
          const grams=Number(b.verified_grams);
          if(!Number.isInteger(grams)||grams<1||grams>100000)S.fail(400,'Invalid verified RetaBox weight.');
          data.verified_grams=grams;
        }
        const result=await kkRpc('service_workflow_review',data,true);
        if(result?.error)S.fail(result.error,'Hindi na-approve ang request. Refresh bago subukang muli.');
        return json(result);
      }
      if(path==='/api/kk/staff/services/complete'&&method==='POST'){
        await user(['sk','chairman']);
        await limit('kk-service-complete-ip',context.ip||'unknown',80);
        const b=await body(),note=String(b.note||'').trim();
        if(note.length>500)S.fail(400,'Completion note is too long.');
        const result=await kkRpc('service_workflow_complete',{id:S.uuid(b.id),note},true);
        if(result?.error)S.fail(result.error,'Approved requests lang ang puwedeng i-complete.');
        return json(result);
      }
      if(path==='/api/kk/staff/services/history'&&method==='GET'){
        await user(['sk','chairman']);
        const page=Math.max(1,Number(url.searchParams.get('page')||1));
        const search=String(url.searchParams.get('search')||'').trim().slice(0,120);
        const date=String(url.searchParams.get('date')||'').trim();
        if(!Number.isSafeInteger(page)||page>200000||search.length>120||
          (date&&!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(date)))
          S.fail(400,'Invalid history page or Philippine date.');
        const data=await kkRpc('service_archive_list',{limit:25,offset:(page-1)*25,search,date},true);
        if(data?.error)S.fail(data.error,'Hindi ma-load ang SK Service History.');
        return json(data);
      }
      if(path==='/api/kk/staff/services/export'&&method==='GET'){
        await user(['sk','chairman']);
        // Export the complete archived history, independent of on-screen date/search filters.
        // Loop through server-authorized pages rather than truncating at the newest 3000 requests.
        const all=[];
        const pageSize=500,maxRows=50000;
        for(let offset=0;offset<maxRows;offset+=pageSize){
          const page=await kkRpc('service_archive_list',{limit:pageSize,offset},true);
          if(page?.error||!Array.isArray(page?.requests))S.fail(503,'Unable to export all SK Service History.');
          all.push(...page.requests);
          if(all.length>=maxRows&&Number(page.total)>maxRows)
            S.fail(413,'Service history exceeds Excel export limit. Please contact the SK administrator for an archive.');
          if(all.length>=Number(page.total)||page.requests.length<pageSize)break;
        }
        const str=value=>String(value??'');
        const safe=value=>{const x=str(value);return (['=','+','@','-'].includes(x[0])||
          x.charCodeAt(0)===9||x.charCodeAt(0)===13)?"'"+x:x;};
        const phtParts=value=>{
          if(!value)return ['',''];
          const date=new Date(value);
          if(!Number.isFinite(date.getTime()))return ['',''];
          const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',
            month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
            hour12:true}).formatToParts(date);
          const get=key=>parts.find(p=>p.type===key)?.value||'';
          return [get('month')+'/'+get('day')+'/'+get('year'),
            get('hour')+':'+get('minute')+':'+get('second')+' '+get('dayPeriod')];
        };
        const header=['Request ID','Name','KK ID','Email','Service','Status',
          'Submitted Date (PHT)','Submitted Time (PHT)',
          'Processed Date (PHT)','Processed Time (PHT)',
          'Paper Size','Color','Pages','Copies','Hours','Estimated Grams','Verified Grams','Points',
          'Reviewed By','Reviewed Date (PHT)','Reviewed Time (PHT)',
          'Completed By','Completed Date (PHT)','Completed Time (PHT)',
          'Review Note','Completion Note'];
        const rows=[header,...all.map(r=>{
          const d=r.effective_details||r.details||{},origin=r.details||{};
          const [submittedDate,submittedTime]=phtParts(r.requested_at);
          const [reviewedDate,reviewedTime]=phtParts(r.reviewed_at);
          const [completedDate,completedTime]=phtParts(r.completed_at);
          const [processedDate,processedTime]=phtParts(r.status==='completed'?
            (r.completed_at||r.reviewed_at||r.requested_at):(r.reviewed_at||r.requested_at));
          return [safe(r.id),safe(r.name),safe(r.kk_id),safe(r.email),safe(r.service_type),safe(r.status),
            submittedDate,submittedTime,processedDate,processedTime,
            safe(d.paper_size),safe(d.color),Number(d.pages||0),Number(d.copies||0),Number(d.hours||0),
            Number(origin.grams||0),Number(r.verified_grams||0),Number(r.points_awarded||0),
            safe(r.reviewed_by),reviewedDate,reviewedTime,safe(r.completed_by),
            completedDate,completedTime,safe(r.review_note),safe(r.completed_note)];
        })];
        return new Response(KKExport.workbook(rows,{sheetName:'Service History'}),{status:200,headers:{...securityHeaders,
          'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':'attachment; filename="SK-Vasra-Service-History-All.xlsx"',
          'Cache-Control':'private, no-store'}});
      }
      if(path==='/api/kk/staff/services/config'&&method==='POST'){
        await user(['chairman']);
        const b=await body(),rate=Number(b.points_per_kg);
        if(!Number.isInteger(rate)||rate<0||rate>5000)
          S.fail(400,'Ang RetaBox points per kilogram ay dapat 0–5000.');
        return json(await kkRpc('services_configure',{points_per_kg:rate},true));
      }
      if(path==='/api/kk/staff'&&method==='GET'){
        await kkProfilingAdmin();
        const result=await kkRpc('staff_list',{},true);
        const docData=await kkRpc('staff_documents',{},true);
        const docs=new Map((docData.documents||[]).map(x=>[x.member_id,x]));
        return json({...result,members:(result.members||[]).map(x=>({...x,document:docs.get(x.id)||null}))});
      }
      if(path==='/api/kk/staff/export'&&method==='GET'){
        await kkProfilingAdmin();
        const [data,sitios]=await Promise.all([kkRpc('staff_export',{},true),kkRpc('sitio_list',{},true)]);
        if(data?.error||sitios?.error)S.fail(503,'Unable to load verified KK members or official sitio names for Excel.');
        const sitioNames=new Map((sitios.sitios||[]).map(s=>[String(s.id).toLowerCase(),String(s.name||'')]));
        const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',
          year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
        const part=type=>Number(parts.find(p=>p.type===type)?.value);
        const todayYear=part('year'),todayMonth=part('month'),todayDay=part('day');
        const ageAtExport=date=>{
          const match=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
          if(!match)return '';
          const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
          const d=new Date(Date.UTC(year,month-1,day));
          if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day)return '';
          const age=todayYear-year-(todayMonth<month||(todayMonth===month&&todayDay<day)?1:0);
          return age>=0&&age<=120?age:'';
        };
        const answer=value=>{
          const v=String(value??'').trim().toLowerCase();
          return v==='yes'||v==='true'?'Yes':v==='no'||v==='false'?'No':'';
        };
        const validProvince=v=>{
          const s=String(v||'').trim();
          return s&&!/^n\/?a(?:\s*\(ncr\))?$/i.test(s)?s:'';
        };
        const columns=['KK ID','First Name','Middle Name','Last Name','Age','Birthdate','Email','Phone',
          'Region','Province','City','Barangay','Sitio / Purok','Street / House No.','Education',
          'Registered SK Voter?','Registered National Voter?','Voted Last Election?','Attended KK Assembly?',
          'Status','Points'];
        const rows=[columns,...(data.members||[]).filter(m=>m.status==='verified').map(m=>{
          const p=m.profile||{};
          return [m.kk_id||'',m.first_name||'',m.middle_name||'',m.last_name||'',ageAtExport(m.birthdate),
            KKExport.dateMMDDYYYY(m.birthdate),m.email||'',m.phone||'',p.residence_region||p.region||'',
            validProvince(p.residence_province)||validProvince(p.province),
            p.residence_city||p.city||'',p.residence_barangay||p.barangay||'',
            sitioNames.get(String(p.sitio_id||'').toLowerCase())||'',p.street||'',p.education||'',
            answer(p.sk_voter),answer(p.national_voter),answer(p.voted_last_election),
            answer(p.kk_assembly),m.status,Number(m.points||0)];
        })];
        const bytes=KKExport.workbook(rows);
        return new Response(bytes,{status:200,headers:{...securityHeaders,
          'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':'attachment; filename="SK-Vasra-Verified-KK.xlsx"'}});
      }
      if(path==='/api/kk/staff/review'&&method==='POST'){
        await kkProfilingAdmin();
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
      // Old embedded KK-profiling endpoints intentionally cannot bypass reward inventory.
      if((path==='/api/kk/staff/perks'||path==='/api/kk/staff/redemption')&&method==='POST'){
        await user(['sk','chairman']);
        S.fail(409,'Use the dedicated KK Rewards page for inventory-safe approvals and changes.');
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
        // The shared callback must route KK and SK flows by a signed, state-bound
        // youth cookie. Never turn a KK token into an SK session or vice versa.
        const kkSettings=kkGoogleSettings();
        const sharedFlow=kkSettings.enabled&&kkSettings.mode==='shared';
        const youthCookie=cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('vasra_kk_oauth='))?.slice(15);
        let youthFlow=null;
        if(sharedFlow&&youthCookie){
          try{youthFlow=Google.readFlow(youthCookie,url.searchParams.get('state'),kkSettings);}
          catch{/* An invalid youth state cannot override a valid SK Google flow. */}
        }
        if(youthFlow){
          const clear='vasra_kk_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0'+(cfg.secure?'; Secure':'');
          let success=false,blocked=false,sessionValue=null;
          try{
            if(url.searchParams.get('error'))throw Error('Youth Google OAuth cancelled');
            await limit('kk-google-callback-ip',context.ip||'unknown',12);
            const identity=await Google.exchangeCode(url.searchParams.get('code'),youthFlow,kkSettings);
            const tokenValue=S.randomToken();
            const outcome=await db.rpc('kk_google',{email:identity.email,sub:identity.sub,token_hash:S.hash(tokenValue)});
            if(outcome?.error)blocked=outcome.reason==='account_link_required';
            else if(outcome?.ok){success=true;sessionValue=tokenValue;}
          }catch(error){console.warn('KK Google authorization failed',{kind:error.name});}
          const target=cfg.origin+(success?'/kk-profile?google=1':
            '/kk-login?google_error='+(blocked?'link_required':'unavailable'));
          const headers=new Headers({...securityHeaders,Location:target});
          headers.append('Set-Cookie',clear);
          if(sessionValue)headers.append('Set-Cookie',kkCookie(sessionValue,true)['Set-Cookie']);
          return new Response(null,{status:303,headers});
        }
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
      // Three public SK service projects. Content is distinct from normal project posts.
      if(path==='/api/current-projects'&&method==='GET'){
        return json(await rpc('current_service_public'),200,{'Cache-Control':'public, max-age=30'});
      }
      if(path==='/api/current-projects/manage'&&method==='GET'){
        await user(['chairman']);
        return json(await rpc('current_service_manage'),200,{'Cache-Control':'private, no-store'});
      }
      const currentPhoto=path.match(/^\/api\/current-projects\/(printing|computer|retabox)\/image$/);
      if(currentPhoto&&method==='GET'){
        const image=await rpc('current_service_image',{slug:currentPhoto[1]});
        if(!image?.path||!['image/jpeg','image/png','image/webp'].includes(image.mime))
          S.fail(404,'Wala pang uploaded image para sa serbisyong ito.');
        const bytes=await db.get(image.path);
        return new Response(bytes,{headers:{...securityHeaders,
          'Content-Type':image.mime,'X-Content-Type-Options':'nosniff',
          'Cache-Control':'public, max-age=300'}});
      }
      if(path==='/api/current-projects/save'&&method==='POST'){
        await user(['chairman']);
        await limit('current-project-summary',context.ip||'unknown',40);
        const b=await body(),slug=String(b.slug||''),summary=String(b.summary||'').trim();
        if(!['printing','computer','retabox'].includes(slug)||
           summary.length<20||summary.length>1800||/[<>\\x00-\\x1f]/.test(summary))
          S.fail(400,'Summary must be 20–1800 characters, without HTML.');
        return json(await rpc('current_service_save',{slug,summary}));
      }
      if(path==='/api/current-projects/image'&&method==='POST'){
        await user(['chairman']);
        await limit('current-project-photo',context.ip||'unknown',24);
        const b=await body(),slug=String(b.slug||''),mime=String(b.mime||'');
        const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[mime];
        if(!['printing','computer','retabox'].includes(slug)||!ext||
           typeof b.data!=='string'||b.data.length>2800000)
          S.fail(400,'JPG, PNG or WEBP image up to 2 MB only.');
        const bytes=S.base64(b.data);
        const valid=bytes.length>=100&&bytes.length<=2000000&&(
          mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
          mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
          bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP');
        if(!valid)S.fail(400,'Invalid image file or size.');
        const storage='current-projects/'+slug+'/'+randomUUID()+'.'+ext;
        await db.put(storage,bytes,mime);
        try{
          const response=await rpc('current_service_photo',{slug,path:storage,mime});
          return json(response);
        }catch(error){
          try{await db.remove([storage])}catch{}
          throw error;
        }
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
      // SK Duty public photos are persisted in Supabase Storage. Resolve only
      // images linked to an actively published, non-archived official.
      // Avoid the generic image fallback chain, where protected gallery RPCs can
      // return 403 before the public officer-photo lookup is attempted.
      if (/^\/api\/duty-images\/[0-9a-f-]{36}$/i.test(path) && method==='GET') {
        const id=S.uuid(path.split('/').pop());
        const image=await rpc('officer_profile_photo',{id});
        if(!image || image.error || typeof image.storage_path!=='string' ||
           !/^[0-9a-f-]{36}$/i.test(image.storage_path) ||
           !['image/jpeg','image/png','image/webp'].includes(image.mime))
          S.fail(404,'Hindi makita ang published SK Duty photo.');
        const bytes=await db.get(image.storage_path);
        const stream=new ReadableStream({start(controller){
         for(let i=0;i<bytes.length;i+=65536)controller.enqueue(bytes.subarray(i,i+65536));
         controller.close();
        }});
        return new Response(stream,{headers:{...securityHeaders,'Content-Type':image.mime,
          'Cache-Control':'public, max-age=300, stale-while-revalidate=3600'}});
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
