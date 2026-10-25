'use strict';
(async()=>{
 const $=selector=>document.querySelector(selector);
 const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[ch]));
 const request=(path,data)=>api('./api/kk/'+path,data===undefined?{}:{method:'POST',body:JSON.stringify(data)});
 const message=(id,text,type='info')=>{const el=$(id);if(!el)return;el.textContent=text;el.dataset.kind=type;el.hidden=!text;};
 const loading=$('#kk-dash-loading'),content=$('#kk-dash-content');
 let member=null,projects=[],registrations=[];
 const tab=which=>{
  for(const button of document.querySelectorAll('[data-tab]')){
   if(button.dataset.tab===which)button.setAttribute('aria-current','page');
   else button.removeAttribute('aria-current');
  }
  for(const section of document.querySelectorAll('[data-section]'))
   section.hidden=section.dataset.section!==which;
 };
 document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>tab(button.dataset.tab)));
 $('#kk-dashboard-logout').onclick=async()=>{
  try{await request('logout',{});}finally{location.replace('./kk-login');}
 };
 const renderProjects=()=>{
  const el=$('#kk-upcoming-projects');
  el.innerHTML=projects.length?projects.map(p=>
   '<article class="kk-activity-card"><small>'+safe(p.category||'SK PROGRAM')+' · '+safe(p.status)+'</small>'+
   '<h3>'+safe(p.title)+'</h3><p>'+safe(p.description||'Makilahok sa programang ito ng SK Vasra.')+'</p>'+
   '<button class="kk-btn" type="button" data-join="'+safe(p.id)+'"'+(p.joined?' disabled':'')+'>'+
   (p.joined?'✓ Registered':'Register to Join')+'</button></article>').join(''):
   '<div class="kk-dash-empty">Wala pang upcoming projects na bukas para sa KK registration. Ang completed projects ay hindi puwedeng salihan. Magkakaroon ng bagong choices kapag may published Pinaplano o Isinasagawa na project ang SK.</div>';
  $('#kk-joined-list').innerHTML=registrations.length?registrations.map(p=>
   '<div class="kk-dashboard-list"><strong>'+safe(p.title)+'</strong><span>✓ Registered · '+safe(new Date(p.registered_at).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}))+'</span></div>').join(''):
   '<div class="kk-dash-empty">Wala ka pang project registrations.</div>';
 };
 const renderRewards=()=>{
  const list=Array.isArray(member.perks)?member.perks:[];
  $('#kk-reward-list').innerHTML=list.length?list.map(perk=>
   '<article class="kk-activity-card"><small>SK-APPROVED REWARD</small><h3>'+safe(perk.title)+'</h3>'+
   '<p>'+safe(perk.description||'')+'</p><p><strong>'+safe(perk.cost)+' points</strong></p>'+
   '<button class="kk-btn" type="button" data-redeem="'+safe(perk.id)+'"'+(Number(member.points||0)<Number(perk.cost)?' disabled':'')+'>'+
   (Number(member.points||0)<Number(perk.cost)?'Insufficient points':'Request Redemption')+'</button></article>').join(''):
   '<div class="kk-dash-empty">Wala pang reward na inilathala ng SK Chairman. Magpapakita lang dito ng tunay na SK-approved rewards.</div>';
  const redemptions=Array.isArray(member.redemptions)?member.redemptions:[];
  $('#kk-redemption-list').innerHTML=redemptions.length?redemptions.map(r=>
   '<div class="kk-dashboard-list"><strong>'+safe(r.perk)+'</strong><span>'+safe(r.cost)+' pts · '+safe(r.status)+'</span></div>').join(''):
   '<div class="kk-dash-empty">Wala pang redemption requests.</div>';
 };
 async function reload(){
  const data=await request('me');
  if(!data?.member){location.replace('./kk-login');return false;}
  if(data.profile?.status!=='verified'){location.replace('./kk-profile');return false;}
  member=data;
  const dashboard=await request('dashboard');
  projects=Array.isArray(dashboard.projects)?dashboard.projects:[];
  registrations=Array.isArray(dashboard.registrations)?dashboard.registrations:[];
  $('#kk-welcome').textContent='Welcome, '+[data.member.first_name,data.member.last_name].filter(Boolean).join(' ')+'! Tuklasin ang mga proyekto at reward programs ng SK Vasra.';
  $('#kk-dash-status').textContent='VERIFIED';
  $('#kk-dash-id').textContent=data.profile.kk_id||'For issuance';
  $('#kk-dash-points').textContent=String(data.points||0);
  $('#kk-current-email').textContent=data.member.email||'—';
  renderProjects();renderRewards();
  loading.hidden=true;content.hidden=false;return true;
 }
 document.addEventListener('click',async event=>{
  const join=event.target.closest('button[data-join]');
  const redeem=event.target.closest('button[data-redeem]');
  if(!join&&!redeem)return;
  const action=join?'join':'redeem',button=join||redeem;
  const project=join?projects.find(p=>p.id===button.dataset.join):null;
  if(join&&!project)return;
  if(!confirm(join?'Register for '+project.title+'?':'Send this SK reward redemption request for staff review?'))return;
  button.disabled=true;
  try{
   if(join){
    await request('join',{project_id:button.dataset.join});
    message('#kk-project-message','Successfully registered for this project.','success');
   }else{
    await request('redeem',{id:button.dataset.redeem});
    message('#kk-redeem-message','Redemption request sent for SK review. Points are deducted only when the SK approves.','success');
   }
   await reload();
  }catch(e){message(join?'#kk-project-message':'#kk-redeem-message',e.message,'error');button.disabled=false;}
 });
 $('#kk-dash-password').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  if(data.password!==data.confirm){message('#kk-password-message','New passwords do not match.','error');return;}
  const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   await request('settings/password',{current:data.current,password:data.password});
   form.reset();message('#kk-password-message','Password updated. Other active sessions were signed out.','success');
  }catch(error){message('#kk-password-message',error.message,'error');}finally{button.disabled=false;}
 });
 $('#kk-dash-email').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const receipt=await request('settings/email/request',data);
   form.reset();message('#kk-email-message',receipt.delivery==='provider_accepted'
    ?'Tinanggap ng email provider ang verification message. Buksan ang inbox ng bagong email at i-confirm ang link. Hindi pa ito kumpirmadong delivered.':
    'Verification request submitted. Check the email service status.','success');
  }catch(error){message('#kk-email-message',error.message,'error');}finally{button.disabled=false;}
 });
 try{
  const ready=await reload();if(!ready)return;
  if(location.hash.startsWith('#confirm-email=')){
   const token=decodeURIComponent(location.hash.slice('#confirm-email='.length));
   tab('settings');
   try{
    await request('settings/email/confirm',{token});
    history.replaceState(null,'',location.pathname);
    message('#kk-email-message','New email verified and saved successfully.','success');
    await reload();
   }catch(error){message('#kk-email-message','Could not confirm the new email: '+error.message,'error');}
  }
 }catch(error){
  loading.innerHTML='<div class="kk-feedback" data-kind="error">Hindi ma-load ang KK dashboard: '+safe(error.message)+
   '. <a href="./kk-login">Sign in again</a></div>';
 }
})();
