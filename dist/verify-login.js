/* SK VASRA standalone login verification for staff, KK, and Google OAuth.
 * A challenge ID is not an authenticated session. No OTP, password or token
 * is stored in localStorage/sessionStorage. The one-time URL is scrubbed. */
(() => {
 'use strict';
 const $=selector=>document.querySelector(selector);
 const query=new URLSearchParams(location.search);
 const kind=query.get('kind');
 const challenge=query.get('challenge');
 const service=query.get('service');
 const requestedService=['printing','computer','retabox'].includes(service)?service:null;
 // Remove the bearer-like challenge locator from address/history/referrers.
 // Reloading the page intentionally requires a fresh login challenge.
 history.replaceState(null,'',location.pathname);
 const form=$('#verify-login-form');
 const input=$('#verify-login-code');
 const group=$('#verify-otp-group');
 const slots=Array.from(group.querySelectorAll('.verify-otp-digit'));
 const status=$('#verify-feedback');
 const submit=$('#verify-submit');
 const back=$('#verify-back');
 const isKK=kind==='kk';
 const loginUrl=isKK?'./kk-login'+(requestedService?'?service='+encodeURIComponent(requestedService):''):'./account';
 back.href=loginUrl;
 const endpoint=isKK?'/api/kk/security/2fa/login/verify':'/api/security/2fa/login/verify';
 const valid=(kind==='kk'||kind==='staff') && /^[a-f0-9-]{36}$/i.test(String(challenge||''));
 const themeKey='vasra-staff-theme-v1';
 const root=document.documentElement;
 try{root.dataset.theme=localStorage.getItem(themeKey)==='dark'?'dark':'light';}
 catch{root.dataset.theme='light';}
 $('#verify-theme').addEventListener('click',()=>{
  root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';
  try{localStorage.setItem(themeKey,root.dataset.theme);}catch{}
 });
 function notice(message,state='info'){
  status.textContent=message||'';
  status.dataset.state=state;
  status.hidden=!message;
  status.setAttribute('role',state==='error'?'alert':'status');
  status.setAttribute('aria-live',state==='error'?'assertive':'polite');
 }
 function draw(state='idle'){
  const value=input.value.replace(/[^0-9]/g,'').slice(0,6);
  if(input.value!==value)input.value=value;
  slots.forEach((slot,i)=>{
   slot.textContent=value[i]||'';
   slot.classList.toggle('is-filled',i<value.length);
   slot.classList.toggle('is-current',document.activeElement===input && i===Math.min(5,value.length) && state!=='error' && state!=='success');
  });
  group.dataset.state=state;
  input.setAttribute('aria-invalid',state==='error'?'true':'false');
 }
 group.addEventListener('click',()=>input.focus());
 input.addEventListener('input',()=>{if(status.dataset.state==='error')notice('');draw();});
 input.addEventListener('focus',()=>draw(group.dataset.state==='error'?'error':'idle'));
 input.addEventListener('blur',()=>draw(group.dataset.state==='error'?'error':'idle'));
 if(!valid){
  form.hidden=true;
  $('#verify-expiry').hidden=true;
  notice('This verification link is missing or has expired. Return to sign in to request a new code.','error');
  $('#verify-title').textContent='Start a new sign-in';
  return;
 }
 input.focus();
 draw();
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(submit.disabled || !form.reportValidity())return;
  submit.disabled=true;
  submit.textContent='Verifying…';
  draw('checking');
  notice('Checking your security code…');
  try{
   const response=await fetch(endpoint,{
    method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({challenge_id:challenge,code:input.value})
   });
   const body=await response.json().catch(()=>({}));
   if(!response.ok || body.ok!==true){
    throw new Error(typeof body.error==='string'?body.error:
      'Incorrect or expired code. Please check the email and try again.');
   }
   // The authenticated HttpOnly cookie is issued only by the API after
   // the database validates the OTP; this page never issues a session.
   draw('success');
   notice('Code verified! Signing you in securely…','success');
   if(isKK){
    let destination='./kk-profile';
    try{
     const result=await fetch('/api/kk/me',{credentials:'same-origin',cache:'no-store'});
     if(result.ok){
      const active=await result.json();
      if(active?.profile?.status==='verified')
       destination='./kk-dashboard'+(requestedService?'#'+requestedService:'');
     }
    }catch{/* Profile route will use the server-side session to continue. */}
    location.replace(destination);
   }else{
    location.replace('./account');
   }
  }catch(error){
   draw('error');
   const message=error?.message||'Unable to verify code. Please try again.';
   notice(message==='Failed to fetch'?'Unable to contact the verification server. Try again.':message,'error');
   input.focus();
   input.select();
   submit.disabled=false;
   submit.textContent='Verify & Sign In';
  }
 });
})();
