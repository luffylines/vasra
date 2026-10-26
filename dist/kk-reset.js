'use strict';
(()=>{
 const $=sel=>document.querySelector(sel);
 const request=$('#kk-reset-request-form'),confirmForm=$('#kk-reset-confirm-form');
 if(!request||!confirmForm)return;
 const token=new URLSearchParams(location.hash.replace(/^#/,'')).get('token');
 const validToken=token&&/^[A-Za-z0-9_-]{40,128}$/.test(token);
 const status=(message,type='info')=>{
   const el=$('#kk-reset-feedback');if(el){el.textContent=message;el.hidden=!message;}
   window.showVasraToast?.(message,type);
 };
 const send=async(path,payload)=>api('./api/kk/reset/'+path,{
   method:'POST',body:JSON.stringify(payload)
 });
 const busy=(form,value)=>{
   const button=form.querySelector('button[type=submit]');
   button.disabled=value;button.setAttribute('aria-busy',String(value));
 };
 if(token){
   request.hidden=true;
   confirmForm.hidden=!validToken;
   $('#kk-reset-title').textContent=validToken?'Choose a new password':'Invalid reset link';
   $('#kk-reset-subtitle').textContent=validToken?
     'Enter a new password for your KK account. The link works only once and expires after 30 minutes.':
     'The reset link is invalid. Request a new link from your KK account email.';
   if(!validToken)status('Invalid password reset link. Please request a new one.','error');
 }
 request.addEventListener('submit',async event=>{
   event.preventDefault();if(!request.reportValidity())return;
   busy(request,true);
   try{
     await send('request',{email:request.elements.email.value.trim().toLowerCase()});
     status('Kung may KK account ang email na ito, magpapadala kami ng secure reset link. Tingnan din ang Spam folder.','success');
   }catch(error){status(error.message||'Password reset request unavailable.','error');}
   finally{busy(request,false);}
 });
 confirmForm.addEventListener('submit',async event=>{
   event.preventDefault();if(!validToken||!confirmForm.reportValidity())return;
   const password=confirmForm.elements.password.value;
   if(password!==confirmForm.elements.confirm.value){
     status('Hindi magkapareho ang dalawang password.','error');return;
   }
   if(password.length<10||password.length>128){
     status('Gumamit ng password na may 10 hanggang 128 characters.','error');return;
   }
   busy(confirmForm,true);
   try{
     await send('confirm',{token,password});
     // Drop the one-time token from browser history as soon as it is used.
     history.replaceState(null,'',location.pathname);
     confirmForm.reset();confirmForm.hidden=true;
     $('#kk-reset-title').textContent='Password successfully updated';
     $('#kk-reset-subtitle').textContent='Napalitan na ang password ng iyong KK account. Mag-login gamit ang bagong password.';
     status('KK password updated. Your previous sessions have been signed out.','success');
   }catch(error){status(error.message||'Invalid or expired password reset link.','error');}
   finally{busy(confirmForm,false);}
 });
})();