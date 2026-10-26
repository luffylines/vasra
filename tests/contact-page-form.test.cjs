'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {createHandler}=require('../lib/handler.cjs');
const valid={
 name:'Test Resident',email:'resident@example.com',topic:'general',
 message:'Magandang araw, may katanungan ako tungkol sa ating mga programa.',
 website:'',consent:true
};
const origin='https://vasra.vercel.app';
function req(data=valid,requestOrigin=origin){
 return new Request(origin+'/api/contact-message',{
  method:'POST',headers:{origin:requestOrigin,'content-type':'application/json'},
  body:JSON.stringify(data)
 });
}
function backend(allow=true){
 const calls=[];
 return {calls,rpc:async(action,payload)=>{
  calls.push({action,payload});
  if(action==='rate_limit')return {allowed:allow};
  throw Error('Unexpected RPC '+action);
 }};
}
const config={origin,secure:true};
test('Contacts displays four SK-specific methods, real form, embedded map and responsive stylesheet',()=>{
 const html=read('dist/contacts.html'),css=read('dist/contacts-page.css');
 for(const token of ['contacts-overview','contacts-connect','contacts-form-panel','contacts-location-panel',
  'id="sk-contact-form"','name="name"','name="email"','name="topic"','name="message"','name="consent"',
  'name="website"','id="contact-form-feedback"','contacts-page.js',
  'maps?q=40%20Forestry%20St','Arang Kada-Kabataang Vasra'])
  assert.ok(html.includes(token),'Missing '+token);
 assert.match(html,/mailto:skbrgyvasraqc@gmail.com/);
 assert.match(html,/facebook.com\/skbrgyvasra/);
 assert.doesNotMatch(html,/fax number|toll.free|1-234-567-8900|hello@theme.com/i);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/\.contacts-connect\{display:grid/);
 const client=read('dist/contacts-page.js');
 assert.match(client,/api\('\.\/api\/contact-message'/);
 assert.match(client,/result\?\.accepted!==true/);
 assert.match(client,/form\.reset\(\)/);
 assert.match(client,/Email tracking ID/);
 assert.match(client,/hindi pa kumpirmadong dumating/);
});
test('Contact endpoint rejects wrong origin and malformed public form before sending',async()=>{
 const db=backend();
 const handle=createHandler({backend:db,config});
 const original=global.fetch;
 let sent=0;
 global.fetch=async()=>{sent++;throw Error('Should not send');};
 try{
  for(const [data,requestOrigin,expected] of [
   [valid,'https://untrusted.example',403],
   [{...valid,consent:false},origin,400],
   [{...valid,website:'spam.example'},origin,400],
   [{...valid,topic:'random'},origin,400],
   [{...valid,name:'x'},origin,400],
   [{...valid,message:'short'},origin,400],
   [{...valid,email:'not-an-email'},origin,400]
  ]){
   const r=await handle(req(data,requestOrigin),{ip:'192.0.2.7'});
   assert.equal(r.status,expected);
  }
  assert.equal(sent,0);
  assert.equal(db.calls.length,0);
 }finally{global.fetch=original;}
});
test('Valid inquiry is sent through Resend to SK office with reply-to, subject and safe plaintext',async()=>{
 const db=backend();
 const handle=createHandler({backend:db,config});
 const previous={key:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL};
 const original=global.fetch;
 let outbound;
 process.env.RESEND_API_KEY='resend_test_placeholder';
 process.env.RESEND_FROM_EMAIL='office@verified-domain.example';
 global.fetch=async(url,opts)=>{outbound={url,opts};return Response.json({id:'accepted-test'},{status:200});};
 try{
  const response=await handle(req(),{ip:'192.0.2.15'});
  assert.equal(response.status,202);
  assert.deepEqual(await response.json(),{accepted:true,delivery:'provider_accepted',reference:null});
  assert.equal(outbound.url,'https://api.resend.com/emails');
  const sent=JSON.parse(outbound.opts.body);
  assert.deepEqual(sent.to,['skbrgyvasraqc@gmail.com']);
  assert.equal(sent.reply_to,valid.email);
  assert.match(sent.subject,/SK Vasra Inquiry/);
  assert.match(sent.text,/Test Resident/);
  assert.match(sent.text,/Magandang araw/);
  assert.match(sent.html,/SK VASRA/);
  assert.match(sent.html,/sk%20logo\.jpg/);
  assert.match(sent.html,/New Community Inquiry/);
  assert.match(sent.html,/Magandang araw/);
  assert.equal(db.calls.filter(c=>c.action==='rate_limit').length,2);
 }finally{
  global.fetch=original;
  if(previous.key===undefined)delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY=previous.key;
  if(previous.from===undefined)delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL=previous.from;
 }
});
test('Unavailable sender or rate-limited request fails closed and never claims sent',async()=>{
 const db=backend(false);
 const handle=createHandler({backend:db,config});
 const old=global.fetch;
 let called=0;
 global.fetch=async()=>{called++;throw Error('no');};
 try{
  const response=await handle(req(),{ip:'192.0.2.50'});
  assert.equal(response.status,429);
  assert.equal(called,0);
  assert.equal((await response.json()).accepted,undefined);
 }finally{global.fetch=old;}
});
test('No account session is needed for public message, but signed-in account data is never sent',()=>{
 const handler=read('lib/handler.cjs');
 assert.match(handler,/if\(path==='\/api\/contact-message' && method==='POST'\)/);
 assert.match(handler,/await limit\('public-contact-ip'/);
 assert.match(handler,/await limit\('public-contact-email'/);
 assert.match(handler,/reply_to:email/);
 assert.match(handler,/to:\['skbrgyvasraqc@gmail.com'\]/);
 assert.match(handler,/return json\(\{accepted:true,delivery:'provider_accepted',reference:receipt.emailId\},202\)/);
 assert.match(handler,/Hindi pa configured ang SK Vasra contact email service/);
});
