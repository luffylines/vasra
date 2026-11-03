/* SK VASRA email-based 2FA UI: no OTPs/passwords stored in browser storage. */
(function(){
 'use strict';
 const $=(s,root=document)=>root.querySelector(s);
 const isKK=Boolean($('#kk-login-form')||$('#kk-dash-password'));
 const kind=isKK?'kk':'staff';
 const prefix=isKK?'./api/kk/security/2fa':'./api/security/2fa';
 async function request(url,data){
  const result=await fetch(url,{method:data===undefined?'GET':'POST',
   credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},
   body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
  const body=await result.json().catch(()=>({}));
  if(!result.ok)throw Error(body.message||body.error_message||'Verification request failed. Please try again.');
  return body;
 }
 function feedback(target,text,ok){
  target.textContent=text;target.style.color=ok?'#17865f':'#b13e46';target.setAttribute('role','status');
 }
 window.VasraEmail2FA={
  async beginLogin(type,challenge,after){
   if(type!==kind||!challenge?.challenge_id)return;
   const original=$(isKK?'#kk-login-form':'#auth-form');
   if(!original)return;
   original.hidden=true;
   let panel=$('#email-mfa-login-challenge');
   if(!panel){
    panel=document.createElement('div');panel.id='email-mfa-login-challenge';panel.className='vasra-mfa-panel';
    panel.innerHTML='<h3>Verify your email</h3><p>We sent a six-digit verification code to your registered email. Expires in 5 minutes.</p>'+
      '<form id="email-mfa-login-form"><label>Verification code<input id="email-mfa-login-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="000000"></label>'+
      '<button type="submit">Verify & Sign In</button> <button type="button" id="email-mfa-back" class="vasra-mfa-secondary">Back to sign in</button></form><p id="email-mfa-login-status" role="status"></p>';
    original.after(panel);
   }
   panel.hidden=false;
   const status=$('#email-mfa-login-status'),field=$('#email-mfa-login-code');
   field.value='';field.focus();
   $('#email-mfa-back').onclick=()=>{panel.hidden=true;original.hidden=false;original.reset();};
   $('#email-mfa-login-form').onsubmit=async event=>{
    event.preventDefault();if(!field.reportValidity())return;
    const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;
    feedback(status,'Checking your code…',true);
    try{
     const receipt=await request(prefix+'/login/verify',{
      challenge_id:challenge.challenge_id,code:field.value.trim()
     });
     panel.hidden=true;await after(receipt);
    }catch(error){feedback(status,error.message,false);}
    finally{button.disabled=false;}
   };
  }
 };
 function resumeGoogleChallenge(){
  const challenge=new URLSearchParams(location.search).get('mfa_challenge');
  if(!challenge||!$((isKK?'#kk-login-form':'#auth-form'))||!/^[a-f0-9-]{36}$/i.test(challenge))return;
  history.replaceState(null,'',location.pathname);
  window.VasraEmail2FA.beginLogin(kind,{challenge_id:challenge},async receipt=>{
   if(isKK){
    location.replace('./kk-profile');
   }else{
    location.replace('./account');
   }
  });
 }
 function attachSettings(){
  const target=$(isKK?'[data-section="settings"] .kk-settings-grid':'#panel-settings .settings-layout');
  if(!target)return;
  const box=document.createElement('article');
  box.className=isKK?'kk-form kk-settings-card vasra-mfa-panel':'settings-card vasra-mfa-panel';
  box.innerHTML='<h3>Email Two-Factor Authentication (2FA)</h3>'+
   '<p>Require a six-digit code sent to your registered email every time you sign in with your password.</p>'+
   '<label class="vasra-mfa-toggle"><input id="vasra-mfa-switch" type="checkbox" disabled> Enable email verification</label>'+
   '<p id="vasra-mfa-setting-status" role="status">Checking security settings…</p>'+
   '<form id="vasra-mfa-setting-form" hidden><p>Enter the six-digit code sent to your account email (valid for 5 minutes).</p>'+
   '<label>Verification code<input id="vasra-mfa-setting-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label>'+
   '<button type="submit">Confirm change</button> <button type="button" id="vasra-mfa-setting-cancel" class="vasra-mfa-secondary">Cancel</button></form>';
  target.append(box);
  const control=$('#vasra-mfa-switch'),status=$('#vasra-mfa-setting-status');
  const form=$('#vasra-mfa-setting-form'),code=$('#vasra-mfa-setting-code');
  let enabled=false,pending=null;
  async function refresh(){
   try{
    const s=await request(prefix+'/status');
    enabled=Boolean(s.enabled);control.checked=enabled;control.disabled=!s.available;
    feedback(status,s.available
     ?(enabled?'2FA is ON. Email code is required at password sign-in.':'2FA is OFF. You can turn it on anytime.')
     :'Email 2FA needs server email configuration before it can be enabled.',s.available);
   }catch(error){control.disabled=true;feedback(status,'Unable to load 2FA settings. Sign in and try again.',false);}
  }
  control.onchange=async()=>{
   const next=control.checked;control.checked=enabled;control.disabled=true;
   feedback(status,'Sending confirmation code…',true);
   try{
    pending=await request(prefix+'/start',{enabled:next});
    form.hidden=false;code.value='';code.focus();
    feedback(status,'Code accepted by the email provider. Check your inbox; delivery may take a moment.',true);
   }catch(error){pending=null;feedback(status,error.message,false);}
   finally{control.disabled=false;}
  };
  $('#vasra-mfa-setting-cancel').onclick=()=>{pending=null;form.hidden=true;code.value='';feedback(status,'Change cancelled. Your 2FA setting was not changed.',true);};
  form.onsubmit=async event=>{
   event.preventDefault();if(!pending)return;
   const btn=form.querySelector('[type=submit]');btn.disabled=true;
   try{
    await request(prefix+'/verify',{challenge_id:pending.challenge_id,code:code.value.trim()});
    pending=null;form.hidden=true;code.value='';
    await refresh();feedback(status,enabled?'Email 2FA enabled successfully.':'Email 2FA disabled successfully.',true);
   }catch(error){feedback(status,error.message,false);}
   finally{btn.disabled=false;}
  };
  if(isKK)refresh();
  else {
   const observed=$('#panel-settings');
   if(observed){
    const monitor=new MutationObserver(()=>{if(!observed.hidden)refresh();});
    monitor.observe(observed,{attributes:true,attributeFilter:['hidden']});
    document.addEventListener('click',event=>{
     if(event.target.closest('#header-settings,[data-tab="settings"]'))setTimeout(refresh,100);
    });
   }
  }
 }
 function initialize(){attachSettings();resumeGoogleChallenge();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
 else initialize();
})();
