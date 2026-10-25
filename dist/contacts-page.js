// SK VASRA public contact form. Uses existing site-origin API validation
// and server-side Resend delivery; never claim inbox delivery without acknowledgement.
(() => {
 'use strict';
 const form=document.getElementById('sk-contact-form');
 if(!form)return;
 const send=document.getElementById('contact-send');
 const feedback=document.getElementById('contact-form-feedback');
 const original=send.querySelector('span')?.textContent||'Send message';
 const status=(text,kind='info')=>{
  feedback.textContent=text;
  feedback.dataset.kind=kind;
  feedback.hidden=!text;
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(send.disabled||!form.reportValidity())return;
  const fields=new FormData(form);
  const payload={
   name:String(fields.get('name')||'').trim(),
   email:String(fields.get('email')||'').trim(),
   topic:String(fields.get('topic')||'').trim(),
   message:String(fields.get('message')||'').trim(),
   website:String(fields.get('website')||'').trim(),
   consent:fields.get('consent')==='on'
  };
  if(!payload.consent){status('Kailangan ang pahintulot bago maipadala ang mensahe.','error');return;}
  send.disabled=true;
  send.setAttribute('aria-busy','true');
  const label=send.querySelector('span');
  if(label)label.textContent='Sending…';
  status('Ipinapasa ang iyong mensahe sa SK Vasra email service…');
  try{
   const result=await api('./api/contact-message',{method:'POST',body:JSON.stringify(payload)});
   if(result?.accepted!==true)throw Error('Hindi pa naipasa ang mensahe. Subukan muli.');
   form.reset();
   const reference=typeof result.reference==='string'?result.reference:'';
   status('Naipasa sa Resend, ngunit hindi pa kumpirmadong dumating sa Gmail inbox ng SK Vasra.'+(reference?' Email tracking ID: '+reference+'.':'')+' Kung hindi natanggap, tingnan ang Delivery/Email Logs sa Resend dashboard at Spam/All Mail ng official Gmail.','info');
  }catch(error){
   status((error?.message||'Hindi naipadala ang mensahe.')+' Maaari ka ring direktang mag-email sa skbrgyvasraqc@gmail.com.','error');
  }finally{
   send.disabled=false;
   send.setAttribute('aria-busy','false');
   if(label)label.textContent=original;
  }
 });
})();
