'use strict';
(async()=>{
 const $=selector=>document.querySelector(selector);
 const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[ch]));
 const request=(path,data)=>api('./api/kk/'+path,data===undefined?{}:{method:'POST',body:JSON.stringify(data)});
 const message=(id,text,type='info')=>{const el=$(id);if(el){el.textContent='';el.hidden=true;}if(text)window.showVasraToast(text,type==='error'?'error':'success');};
 const loading=$('#kk-dash-loading'),content=$('#kk-dash-content');
 let member=null,projects=[],registrations=[];
 const sidebar=$('#kk-sidebar'),menuToggle=$('#kk-menu-toggle'),backdrop=$('#kk-sidebar-backdrop');
 const smallScreen=window.matchMedia('(max-width:900px)');
 let menuOpen=false;
 const setMenu=open=>{
  menuOpen=!!open&&smallScreen.matches;
  document.body.classList.toggle('kk-menu-open',menuOpen);
  menuToggle.setAttribute('aria-expanded',String(menuOpen));
  menuToggle.setAttribute('aria-label',menuOpen?'Close KK navigation':'Open KK navigation');
  if(smallScreen.matches){sidebar.inert=!menuOpen;sidebar.setAttribute('aria-hidden',String(!menuOpen));}
  else{sidebar.inert=false;sidebar.removeAttribute('aria-hidden');}
 };
 menuToggle.addEventListener('click',()=>{setMenu(!menuOpen);if(menuOpen)sidebar.querySelector('[data-tab]')?.focus();});
 backdrop.addEventListener('click',()=>{setMenu(false);menuToggle.focus();});
 smallScreen.addEventListener('change',()=>setMenu(false));
 document.addEventListener('keydown',event=>{
  if(!menuOpen)return;
  if(event.key==='Escape'){event.preventDefault();setMenu(false);menuToggle.focus();}
  if(event.key==='Tab'){
   const focusable=[...sidebar.querySelectorAll('a[href],button:not([disabled])')].filter(el=>el.getClientRects().length);
   if(!focusable.length)return;
   if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable.at(-1).focus();}
   else if(!event.shiftKey&&document.activeElement===focusable.at(-1)){event.preventDefault();focusable[0].focus();}
  }
 });
 setMenu(false);
 const sections=new Set(['overview','projects','rewards','printing','computer','retabox','settings','kk-id']);
 const tab=(which,updateHash=true)=>{
  if(which==='activities')which='projects'; // Old saved bookmarks lead to the active Projects tab.
  if(!sections.has(which))which='overview';
  for(const button of document.querySelectorAll('.kk-sidebar-nav [data-tab]')){
   if(button.dataset.tab===which)button.setAttribute('aria-current','page');
   else button.removeAttribute('aria-current');
  }
  for(const section of document.querySelectorAll('[data-section]'))
   section.hidden=section.dataset.section!==which;
  const summary=document.querySelector('.kk-summary');if(summary)summary.hidden=!['overview','settings'].includes(which);
  // Keep exactly one main heading regardless of the open KK workspace tab.
  const headings={overview:'My KK Dashboard',projects:'Upcoming Projects',
   rewards:'Points & Rewards',printing:'Free Printing',computer:'Computer Use',
   retabox:'RetaBox Donations',settings:'Account Settings','kk-id':'My KK ID Card'};
  const title=$('#kk-current-section-title'),eyebrow=$('#kk-current-section-eyebrow'),welcome=$('#kk-welcome');
  if(title)title.textContent=headings[which]||headings.overview;
  if(eyebrow)eyebrow.textContent=which==='kk-id'?'OFFICIAL KATIPUNAN NG KABATAAN IDENTIFICATION':
   which==='overview'?'VERIFIED KATIPUNAN NG KABATAAN MEMBER':'SK VASRA · KK MEMBER PORTAL';
  if(welcome){
   if(which==='kk-id')welcome.textContent='View your KK ID and download its PDF after SK photo approval.';
   else if(which==='overview')welcome.textContent=welcome.dataset.overviewText||welcome.textContent;
   else welcome.textContent='Manage your '+(headings[which]||'KK account').toLowerCase()+' in one secure place.';
  }
  document.title=(headings[which]||'KK Dashboard')+' — SK Vasra';
  if(updateHash&&location.hash!=='#confirm-email'&&!location.hash.startsWith('#confirm-email='))
   history.replaceState(null,'',location.pathname+location.search+'#'+which);
  setMenu(false);
  if(['printing','computer','retabox'].includes(which))window.loadKKServices?.();
  if(which==='projects'){refreshProjects();refreshParticipation();}
  if(which==='rewards'&&member)refreshRewards();
  if(which==='overview'&&member)refreshParticipation();
  if(which==='kk-id')window.loadKKIDCard?.();
 };
 document.querySelectorAll('button[data-tab]').forEach(button=>button.addEventListener('click',()=>tab(button.dataset.tab)));
 $('#kk-dashboard-settings').addEventListener('click',()=>tab('settings'));
 $('#kk-copy-id')?.addEventListener('click',async()=>{
  const value=$('#kk-dash-id').textContent.trim();
  if(!/^VASRA-KK-[0-9]+$/.test(value))return;
  try{await navigator.clipboard.writeText(value);window.showVasraToast('KK ID copied.','success');}
  catch{window.showVasraToast('Select your KK ID and copy manually.','error');}
 });
 const signOut=async()=>{
  const buttons=[$('#kk-dashboard-logout'),$('#kk-sidebar-logout')];
  buttons.forEach(button=>{button.disabled=true;});
  try{
   const result=await request('logout',{});
   if(result?.ok!==true)throw Error('Could not sign out.');
   location.replace('./');
  }catch(error){
   buttons.forEach(button=>{button.disabled=false;});
   window.showVasraToast('Hindi natuloy ang KK logout: '+String(error.message||'Subukang muli.'),'error');
  }
 };
 $('#kk-dashboard-logout').addEventListener('click',signOut);
 $('#kk-sidebar-logout').addEventListener('click',signOut);
 const renderProjects=()=>{
  const el=$('#kk-upcoming-projects');
  el.innerHTML=projects.length?projects.map(p=>{
   const attended=p.attended===true,registered=p.joined===true;
   // Online signup is not attendance. Only the officer's verified QR/manual check-in awards points.
   const action=attended?'<span class="kk-project-attended" role="status">'+
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>'+
      'Attended · +'+Number(p.attendance_points||10)+' Points</span>':
      registered?'<span class="kk-project-registered" role="status">Registered · Awaiting SK Attendance Check-in</span>':
      '<button class="kk-btn kk-project-join" type="button" data-join="'+safe(p.id)+'">Request to Join</button>';
   return '<article class="kk-activity-card kk-upcoming-event"><small>'+safe(p.category||'SK PROGRAM')+' · '+safe(p.status)+'</small>'+
    '<h3>'+safe(p.title)+'</h3><p>'+safe(p.description||'Makilahok sa programang ito ng SK Vasra.')+'</p>'+
    '<div class="kk-event-registration-action">'+action+'</div></article>';
  }).join(''):
   '<div class="kk-dash-empty">Wala pang upcoming projects na bukas para sa KK registration. Ang completed projects ay hindi puwedeng salihan. Magkakaroon ng bagong choices kapag may published Pinaplano o Isinasagawa na project ang SK.</div>';
 };
 const applyProjectResponse=response=>{
  if(!Array.isArray(response?.projects))throw Error('Invalid SK projects response.');
  // A second client-side guard against displaying completed projects in Upcoming.
  projects=response.projects.filter(p=>['Pinaplano','Isinasagawa'].includes(p.status));
  registrations=Array.isArray(response.registrations)?response.registrations:[];
  $('#kk-dash-projects-count').textContent=String(projects.length);
  renderProjects();
 };
 const refreshProjects=async()=>{
  try{applyProjectResponse(await request('dashboard?updated='+Date.now()));}
  catch(error){window.showVasraToast('Hindi ma-refresh ang upcoming projects: '+error.message,'error');}
 };
 const phtAttendance=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',
  year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
 const refreshParticipation=async()=>{
  const target=$('#kk-my-participation-history');if(!target)return;
  try{
   const data=await request('event-history');
   const list=Array.isArray(data.history)?data.history:[];
   // Attendance may have been recorded on a different device while the member dashboard stayed open.
   // Keep the upcoming-event status in sync without requiring the user to sign out and in again.
   const ids=new Set(list.map(a=>String(a.project_id||'')));
   let changed=false;
   projects=projects.map(p=>{
    if(!ids.has(String(p.id))||p.attended)return p;
    changed=true;
    const entry=list.find(a=>String(a.project_id)===String(p.id));
    return {...p,attended:true,attendance_points:Number(entry?.points||10)};
   });
   if(changed)renderProjects();
   $('#kk-participation-count').textContent=list.length+' attended';
   target.innerHTML=list.length?list.map(a=>'<article class="kk-attended-event">'+
    '<div><strong>'+safe(a.title)+'</strong><small>'+
    safe(phtAttendance.format(new Date(a.checked_in_at)))+' · Philippine Time</small></div>'+
    '<span>+'+Number(a.points||0)+' points</span></article>').join(''):
    '<p class="kk-dash-empty">Wala pang recorded event attendance. Kapag na-scan na ng SK Officer ang iyong KK ID sa event, dito makikita ang activity at points na nakuha mo.</p>';
  }catch(error){target.innerHTML='<p class="kk-dash-empty">Unable to load event attendance right now. Please refresh your Dashboard.</p>';}
 };
 const renderRewardSpotlight=()=>{
  const root=$('#kk-featured-rewards');if(!root||!member)return;
  const list=Array.isArray(member.perks)?member.perks.slice(0,3):[];
  const points=Number(member.available_points??member.points??0);
  $('#kk-spotlight-points').textContent=String(points);
  root.innerHTML=list.length?list.map(perk=>{
   const stock=Number(perk.available||0);
   return '<article class="kk-featured-reward"><div class="kk-featured-image">'+
    (perk.image?'<img src="./api/kk/rewards/image/'+encodeURIComponent(perk.id)+'" alt="Larawan ng '+safe(perk.title)+'" loading="lazy">':
     '<span class="kk-reward-preview-no-photo">Larawan ng reward</span>')+'</div>'+
    '<div class="kk-featured-body"><span class="kk-featured-label">SK VASRA REWARD</span>'+
    '<h4>'+safe(perk.title)+'</h4><p>'+safe(perk.description||'Makilahok sa SK activities para makakuha ng reward points.')+'</p>'+
    '<div class="kk-featured-facts"><strong>'+safe(perk.cost)+' points</strong><span>'+stock+' available</span></div>'+
    '<button class="kk-featured-open" type="button" data-open-rewards>'+
    (stock<1?'Tingnan ang reward':'Tingnan at i-redeem')+' <span aria-hidden="true">→</span></button></div></article>';
  }).join(''):'<div class="kk-rewards-preview-empty">Wala pang published SK rewards. Mag-participate sa mga programa ng SK at abangan ang mga bagong reward.</div>';
 };
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-open-rewards]'))tab('rewards');
 });
 document.addEventListener('error',event=>{
  const image=event.target;
  if(!(image instanceof HTMLImageElement)||!image.matches('.kk-member-reward-art img, .kk-featured-image img'))return;
  const fallback=document.createElement('span');
  fallback.className='kk-reward-preview-no-photo';
  fallback.textContent='Hindi ma-load ang larawan sa ngayon';
  image.replaceWith(fallback);
 },true);
 const renderRewards=()=>{
  const list=Array.isArray(member.perks)?member.perks:[];
  const available=Number(member.available_points??member.points??0);
  $('#kk-reward-list').innerHTML=list.length?list.map(perk=>{
   const stocked=Number(perk.available||0)>0,can=stocked&&available>=Number(perk.cost);
   const pending=(member.redemptions||[]).some(r=>r.status==='pending'&&r.title===perk.title);
   return '<article class="kk-activity-card kk-member-reward">'+
    '<div class="kk-member-reward-art">'+(perk.image?
     '<img src="./api/kk/rewards/image/'+encodeURIComponent(perk.id)+'" alt="Reward photo: '+safe(perk.title)+'" loading="lazy">':
     '<div class="kk-member-reward-no-photo">Reward photo</div>')+'</div>'+
    '<div class="kk-member-reward-details"><small>SK-APPROVED REWARD</small><h3>'+safe(perk.title)+'</h3>'+
    '<p>'+safe(perk.description||'')+'</p>'+
    '<div class="kk-member-reward-summary"><strong>'+safe(perk.cost)+' points</strong>'+
    '<span>'+safe(perk.available)+' available · '+safe(perk.claimed)+' claimed</span></div>'+
    '<button class="kk-btn" type="button" data-redeem="'+safe(perk.id)+'" '+(!can||pending?'disabled':'')+'>'+
    (!stocked?'Out of Stock':pending?'Redemption Pending':!can?'Insufficient Points':'Request Redemption')+'</button></div></article>';
  }).join(''):
   '<div class="kk-dash-empty">Wala pang available SK rewards. Lalabas dito ang published rewards kasama ang larawan at stock.</div>';
  const redemptions=Array.isArray(member.redemptions)?member.redemptions:[];
  const messageFor={pending:'Hinihintay ang approval ng SK. Naka-reserve ang points mo.',
   approved:'Approved! Maaari mo nang i-claim ito sa SK VASRA Office. Dalhin ang verified KK ID.',
   rejected:'Hindi naaprubahan. Available ulit ang naka-reserve na points.'};
  const labelFor={pending:'Pending',approved:'Approved',rejected:'Rejected'};
  $('#kk-redemption-list').innerHTML=redemptions.length?redemptions.map(r=>{
   const status=['pending','approved','rejected'].includes(r.status)?r.status:'unknown';
   return '<article class="kk-dashboard-list kk-redemption-entry is-'+status+'">'+
     '<div class="kk-redemption-info"><strong>'+safe(r.title||r.perk)+'</strong>'+
     '<small>'+safe(r.cost)+' points</small>'+
     '<p>'+safe(messageFor[status]||'Sinusuri ang status ng request.')+'</p>'+
     (r.note?'<p class="kk-redemption-note">SK note: '+safe(r.note)+'</p>':'')+
     '</div><span class="kk-redemption-status is-'+status+'">'+
     safe(labelFor[status]||'Update Pending')+'</span></article>';
  }).join(''):
   '<div class="kk-dash-empty">Wala pang redemption requests.</div>';
 };
 const refreshRewards=async()=>{
  const rewards=await request('rewards');
  if(!Array.isArray(rewards?.rewards))throw Error('Invalid KK rewards response.');
  member.perks=rewards.rewards;member.redemptions=rewards.claims||[];
  member.points=rewards.balance;member.available_points=rewards.available_points;
  $('#kk-dash-points').textContent=String(Math.max(0,Number(rewards.available_points??rewards.balance??0)));
  $('#kk-dash-rewards-count').textContent=String(rewards.rewards.length);
  renderRewards();
  renderRewardSpotlight();
 };
 window.addEventListener('focus',()=>{
  if(!member)return;
  if(location.hash==='#projects')refreshProjects();
  refreshParticipation();
  refreshRewards();
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden||!member)return;
  if(location.hash==='#projects')refreshProjects();
  refreshParticipation();
  refreshRewards();
 });
 async function reload(){
  const data=await request('me');
  if(!data?.member){
   const requested=['printing','computer','retabox'].includes(location.hash.slice(1))?location.hash.slice(1):'';
   location.replace('./kk-login'+(requested?'?service='+requested:''));
   return false;
  }
  if(data.profile?.status!=='verified'){location.replace('./kk-profile');return false;}
  member=data;
  const dashboard=await request('dashboard');
  applyProjectResponse(dashboard);
  $('#kk-welcome').textContent='Welcome, '+[data.member.first_name,data.member.last_name].filter(Boolean).join(' ')+'! Tingnan ang SK projects, serbisyo, at mga reward mo.';
  $('#kk-welcome').dataset.overviewText=$('#kk-welcome').textContent;
  $('#kk-dash-status').textContent='VERIFIED';
  $('#kk-dash-id').textContent=data.profile.kk_id||'For issuance';
  window.kkCardMember=data.member;window.kkCardNumber=data.profile.kk_id;
  $('#kk-dash-points').textContent=String(data.points||0);
  $('#kk-current-email').textContent=data.member.email||'—';
  $('#kk-sidebar-name').textContent=[data.member.first_name,data.member.last_name].filter(Boolean).join(' ')||'Verified KK Member';
  await refreshRewards();
  await refreshParticipation();
  window.loadKKServices?.(); // Also populate the overview counts immediately, not only inside service tabs.
  loading.hidden=true;content.hidden=false;return true;
 }
 document.addEventListener('click',async event=>{
  const join=event.target.closest('button[data-join]');
  const redeem=event.target.closest('button[data-redeem]');
  if(!join&&!redeem)return;
  const action=join?'join':'rewards',button=join||redeem;
  const project=join?projects.find(p=>p.id===button.dataset.join):null;
  if(join&&!project)return;
  if(!confirm(join?'Register for '+project.title+'?':'Send this SK reward redemption request for staff review?'))return;
  button.disabled=true;
  try{
   if(join){
    await request('join',{project_id:button.dataset.join});
    message('#kk-project-message','Successfully registered for this project.','success');
   }else{
    await request('rewards',{id:button.dataset.redeem});
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
  // OAuth sign-in also returns here: restore only a whitelisted requested service.
  let remembered='';
  try{remembered=sessionStorage.getItem('vasra-kk-requested-service')||'';sessionStorage.removeItem('vasra-kk-requested-service')}catch{}
  if(!['printing','computer','retabox'].includes(remembered))remembered='';
  if(sections.has(location.hash.slice(1))||location.hash==='#activities')tab(location.hash.slice(1),false);
  else if(remembered)tab(remembered,true);
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
