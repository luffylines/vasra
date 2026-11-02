'use strict';
// Staged KK review notification transport. No database mutations or points logic.
const {createHash}=require('node:crypto');
const {renderEmail}=require('./vasra-email-template.cjs');
const validEmail=v=>typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const enabled=env=>env.N8N_KK_NOTIFICATIONS_ENABLED==='true';
async function forwardKKReview({memberId,recipient,decision,origin,revision,env=process.env,fetchImpl=fetch}){
 if(!enabled(env))return {status:'disabled'};
 const url=env.N8N_KK_WEBHOOK_URL,secret=env.N8N_KK_WEBHOOK_SECRET;
 if(!url||!secret||secret.length<24)return {status:'unavailable',reason:'webhook_unconfigured'};
 let target;try{target=new URL(url);}catch{return {status:'unavailable',reason:'webhook_invalid_url'};}
 if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash)
  return {status:'unavailable',reason:'webhook_invalid_url'};
 if(!validEmail(recipient)||!['verified','rejected'].includes(decision))
  return {status:'unavailable',reason:'invalid_event'};
 // Same member/status/revision produces one stable event ID for downstream deduplication.
 // A persistent outbox/unique constraint is still necessary for end-to-end exactly-once delivery.
 const eventId=createHash('sha256').update(['kk-review-v1',memberId,decision,String(revision||'')].join(':')).digest('hex');
 const approved=decision==='verified';
 const subject=approved?'SK Vasra KK Profile — Verified':'SK Vasra KK Profile — Corrections Required';
 const login=/^https:\/\//.test(origin||'')?origin+'/kk-login':'https://vasra.vercel.app/kk-login';
 const body=approved?
  'Na-verify na ng SK Vasra ang iyong KK profiling application. Mag-login upang makita ang iyong status, KK ID at welcome points.':
  'Na-review ng SK Vasra ang iyong KK profiling application at may mga kailangang itama. Mag-login, basahin ang review note, i-edit ang iyong profile, at i-submit muli para sa panibagong review.';
 const html=renderEmail({subject,heading:approved?'Your KK Profile Is Verified':'Your KK Profile Needs Updates',
   eyebrow:'KK MEMBERSHIP · PROFILE REVIEW',body,actionLabel:'Open KK Account',actionUrl:login,
   details:[{label:'Review result',value:approved?'Verified':'Corrections required'}],
   variant:approved?'standard':'alert',
   footer:'If you did not register a KK account, please contact SK Vasra directly.'});
 const payload={event_id:eventId,event_type:'kk.verification.updated',member_id:memberId,
   status:approved?'approved':'rejected',recipient_email:recipient,subject,html};
 try{
  const response=await fetchImpl(target.href,{method:'POST',headers:{
    'Content-Type':'application/json','X-SK-VASRA-Webhook-Secret':secret,
    'Idempotency-Key':eventId},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});
  if(!response.ok)return {status:'unavailable',reason:'webhook_rejected'};
  return {status:'accepted',via:'n8n'};
 }catch{return {status:'unavailable',reason:'webhook_unreachable'};}
}
module.exports={forwardKKReview,enabled};
