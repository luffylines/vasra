let user=null,managed=[],editing=null,auditOffset=0,auditTotal=0,recoveryMode=null,recoveryToken=null;
// Notifications display as accessible toasts; each new message restarts the 10s timer.
let messageTimer=null;
const message=(text,error=false)=>{
 const toast=$('#message');
 if(messageTimer!==null){clearTimeout(messageTimer);messageTimer=null;}
 toast.textContent=String(text||'');
 toast.className=error?'message error':'message';
 toast.setAttribute('role',error?'alert':'status');
 toast.setAttribute('aria-live',error?'assertive':'polite');
 if(!text)return;
 messageTimer=setTimeout(()=>{
  toast.textContent='';
  toast.className='message';
  toast.setAttribute('role','status');
  toast.setAttribute('aria-live','polite');
  messageTimer=null;
 },10000);
};
// A fixed, persistent side toast remains visible while photos are uploading.
// Success/error toast resumes its normal 10-second timeout only on completion.
let uploadToastTimer=null;
function projectUploadStatus(text,state='uploading'){
 const toast=$('#project-upload-progress');
 if(uploadToastTimer){clearTimeout(uploadToastTimer);uploadToastTimer=null;}
 toast.dataset.state=state;toast.hidden=!text;
 $('#project-upload-progress-text').textContent=String(text||'');
 if(!text){if(toast.matches?.(':popover-open'))toast.hidePopover();return;}
 if(typeof toast.showPopover==='function'&&!toast.matches?.(':popover-open')){
  try{toast.showPopover()}catch{/* fallback when unsupported */}
 }
 if(state!=='uploading')uploadToastTimer=setTimeout(()=>projectUploadStatus(''),14000);
}
// All confirmed staff mutations use the same 10-second green confirmation toast.
const success=(text)=>message(text,false);
// Light theme is the default; a manually selected dark theme is remembered locally.
const themeStorageKey='vasra-staff-theme-v1';
function setStaffTheme(theme,persist=false){
 const dark=theme==='dark';
 document.body.dataset.theme=dark?'dark':'light';
 const button=$('#theme-toggle');
 button.setAttribute('aria-pressed',String(dark));
 button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
 button.title=dark?'Dark mode — switch to light':'Light mode — switch to dark';
 if(persist){try{localStorage.setItem(themeStorageKey,dark?'dark':'light')}catch{}}
}
let savedStaffTheme='light';
try{if(localStorage.getItem(themeStorageKey)==='dark')savedStaffTheme='dark'}catch{}
setStaffTheme(savedStaffTheme);
$('#theme-toggle').onclick=()=>setStaffTheme(document.body.dataset.theme==='dark'?'light':'dark',true);
function syncWorkspaceMode(){
 const signedIn=!!user;
 document.body.dataset.staffMode=signedIn?'staff':'public';
 $('#staff-sidebar-footer').hidden=!signedIn;
 $('#staff-sidebar-name').textContent=signedIn?user.name||'SK Officer':'';
 $('#staff-sidebar-role').textContent=signedIn?(user.role==='chairman'?'SK CHAIRMAN':({kagawad:'SK KAGAWAD',treasurer:'SK TREASURER',secretary:'SK SECRETARY'})[user.position]||'SK OFFICER'):'';
 $('#account-breadcrumb').textContent=signedIn?'Dashboard':'Aking account';
 $('#theme-toggle').hidden=!signedIn;
 $('#header-settings').hidden=!signedIn;
 const href=signedIn?'./account':'./';
 $('.site-header .brand').setAttribute('href',href);
 const mobileBrand=document.querySelector('.mobile-brand');
 if(mobileBrand)mobileBrand.setAttribute('href',href);
}
async function busy(form,fn){const b=form.querySelector('button[type="submit"],button.primary');if(b)b.disabled=true;try{await fn()}catch(e){message(e.message,true)}finally{if(b)b.disabled=false}}
let googleReady=false;
let googleUnavailableMessage='Google login is unavailable. Email/password login is still available.';
const googleStatusMessage={
 oauth_not_configured:'Google Sign-In is not configured for this deployment. Ask the administrator to set the OAuth credentials in Vercel.',
 redirect_mismatch:'Google OAuth callback URL does not match this domain. For now, use https://vasra.vercel.app/account or email/password login.',
 database_setup:'Google Sign-In database migration is pending. The administrator must complete the approved database setup.',
 database_check_failed:'Google Sign-In database readiness could not be verified. Check the database migration and connection.',
 status_unavailable:'Could not check Google Sign-In status right now. Try again later or use email/password.'
};
async function checkGoogleLogin(){
 const button=$('#google-sign-in'),note=$('#google-login-note');
 if(!button||!note)return false;
 let reason='status_unavailable';
 try {
  const status=await api('./api/auth/google/status');
  googleReady=status.enabled===true;
  reason=status.reason||'oauth_not_configured';
 }catch {googleReady=false;}
 googleUnavailableMessage=googleStatusMessage[reason]||googleStatusMessage.status_unavailable;
 button.setAttribute('aria-describedby','google-login-note');
 button.setAttribute('aria-disabled',String(!googleReady));
 note.textContent=googleReady
  ? 'Use the Google account matching your authorized SK staff email.'
  : googleUnavailableMessage;
 return googleReady;
}
$('#google-sign-in').addEventListener('click',async e=>{
 const button=e.currentTarget;
 if(button.disabled)return;
 button.disabled=true;
 try {
  if(await checkGoogleLogin())location.assign('./api/auth/google/start');
  else message(googleUnavailableMessage,true);
 }finally {button.disabled=false;}
});
const googleSuccess=new URLSearchParams(location.search).get('google_success')==='1';
const googleError=new URLSearchParams(location.search).get('google_error');
if(googleError){
 history.replaceState(null,'',location.pathname+location.hash);
 message(googleError==='not_authorized'?'This Google account is not registered as SK staff. Contact your Chairman.':'Hindi natuloy ang Google login. Try again or use your password.',true);
}
checkGoogleLogin();
$('#auth-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const f=new FormData(e.target),b=await api('./api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});user=b.user;e.target.reset();message('');await showDashboard();success('Matagumpay ang pag-login. Welcome back, '+(user?.name||'SK Officer')+'!');})};
$('#logout').onclick=async()=>{try{await api('./api/logout',{method:'POST',body:'{}'});user=null;managed=[];editing=null;$('#managed-projects').replaceChildren();$('#users-list').replaceChildren();$('#new-credentials').replaceChildren();$('#new-credentials').hidden=true;$('#audit-list').replaceChildren();$('#project-form').reset();$('#editor').close();$('#password-form').reset();await showDashboard();success('Matagumpay kang naka-logout.')}catch(e){message(e.message,true)}};
$('#header-settings').onclick=async()=>{if(!user||user.mustChange)return;await selectTab('settings');$('#panel-settings').scrollIntoView({behavior:'smooth',block:'start'});};
async function savePassword(form){
 const f=Object.fromEntries(new FormData(form));
 if(f.password!==f.confirm)throw Error('Hindi magkatugma ang bagong password.');
 user=(await api('./api/password',{method:'POST',body:JSON.stringify(f)})).user;
 form.reset();await showDashboard();
}
$('#password-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{await savePassword(e.target);success('Matagumpay na napalitan ang iyong password.');});};
$('#settings-password-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{await savePassword(e.target);await selectTab('settings');$('#settings-message').textContent='Password updated. Your session has been secured.';success('Matagumpay na na-update ang iyong password.');});};
// A readiness probe is only advisory. Submitting an authenticated email
// request must remain possible even if the capabilities check times out.
function emailChangeFeedback(text='',kind='info'){
 const box=$('#email-change-message');
 box.textContent=String(text||'');box.dataset.kind=kind;box.hidden=!text;
}
$('#change-email-form').onsubmit=async e=>{
 e.preventDefault();
 const form=e.target,button=form.querySelector('button[type="submit"]');
 if(button.disabled||!form.reportValidity())return;
 const data=Object.fromEntries(new FormData(form));
 const next=String(data.email||'').trim().toLowerCase();
 if(next===String(user?.email||'').toLowerCase()){
  emailChangeFeedback('Ilagay ang ibang email address kaysa sa kasalukuyan.','error');return;
 }
 button.disabled=true;button.setAttribute('aria-busy','true');
 emailChangeFeedback('Sending a secure verification link to the new email…','info');
 try{
  await api('./api/account/email/request',{method:'POST',
   body:JSON.stringify({email:next,current:data.current})});
  form.reset();
  emailChangeFeedback('Tinanggap ng email provider ang verification request. Tingnan ang inbox at Spam/Junk ng bagong email; valid ang link sa loob ng 15 minuto.','success');
  $('#settings-message').textContent='Pending verification: hindi pa binabago ang account email.';
  success('Verification request submitted. Verify from your new email address.');
 }catch(error){
  const detail=error?.message||'Hindi maipadala ang verification request.';
  emailChangeFeedback(detail,'error');
  message(detail,true);
 }finally{button.disabled=false;button.setAttribute('aria-busy','false');}
};
let recoveryReady=false;
function recoveryFeedback(text='',kind='info'){
 const box=$('#recovery-message');
 box.textContent=String(text);
 box.hidden=!text;
 box.dataset.kind=kind;
}
async function checkRecoveryAvailability(){
 try{recoveryReady=(await api('./api/account/capabilities')).ready===true;}catch{recoveryReady=false;}
 $('#forgot-password-link').disabled=false;
 $('#forgot-password-link').textContent='Forgot password?';
 // Keep recovery actionable: the server validates configuration and returns safe errors.
 // A failed network readiness probe must not leave Send reset link permanently disabled.
 const submit=$('#recovery-send');
 if(submit.getAttribute('aria-busy')!=='true')submit.disabled=false;
 // Do not lock Change Email solely because a health probe fails. The API
 // still enforces identity, password, verified sender and rate limits.
 const emailButton=$('#change-email-form').querySelector('button[type="submit"]');
 if(emailButton.getAttribute('aria-busy')!=='true')emailButton.disabled=false;
 $('#email-setup-note').textContent=recoveryReady
  ? 'Email setup detected. Delivery depends on a valid Resend key and verified sender domain. Links expire after 15 minutes.'
  : 'Hindi makumpirma ang email service ngayon. Maaari pa ring subukan ang verification request; ipapakita ang server error kung hindi ito available.';
 if(recoveryMode==='request'&&!recoveryReady)
  recoveryFeedback('Hindi pa makumpirma ang email service. Maaari mong subukan ang Send reset link; ipapakita ang status kung may problema.','info');
 return recoveryReady;
}
$('#forgot-password-link').onclick=()=>showRecovery('request');
$('#recovery-back').onclick=()=>{
 recoveryMode=null;recoveryToken=null;recoveryFeedback();
 history.replaceState(null,'',location.pathname+location.search);
 showDashboard();
};
function showRecovery(mode,token=null){
 recoveryMode=mode;recoveryToken=token;
 $('#recovery-section').hidden=false;$('#auth').hidden=true;$('#dashboard').hidden=true;$('#staff-nav').hidden=true;
 $('#recovery-request-form').hidden=mode==='reset';
 $('#recovery-reset-form').hidden=mode!=='reset';
 $('#recovery-heading').textContent=mode==='reset'?'Create a new password':'Reset your password';
 $('#recovery-description').textContent=mode==='reset'
  ? 'Gumawa ng bagong password (12 characters pataas). Ang link na ito ay one-time at valid sa loob ng 30 minuto.'
  : 'Ilagay ang email ng iyong SK account. Magpapadala kami ng one-time password reset link.';
 recoveryFeedback();
 if(mode==='request')checkRecoveryAvailability().then(()=>{});
 $('#recovery-section').scrollIntoView({block:'center'});
}
$('#recovery-request-form').onsubmit=async e=>{
 e.preventDefault();
 const form=e.currentTarget,button=$('#recovery-send');
 if(button.disabled||!form.reportValidity())return;
 const email=new FormData(form).get('email');
 button.disabled=true;button.setAttribute('aria-busy','true');
 button.querySelector('.recovery-submit-label').textContent='Sending secure link…';
 recoveryFeedback('Preparing your secure reset request…','info');
 try{
  await api('./api/account/reset/request',{method:'POST',body:JSON.stringify({email})});
  recoveryFeedback('Kung may authorized SK account sa email na iyon, ipapadala ang reset link. Tingnan ang inbox at spam folder. Valid ang link sa loob ng 30 minuto.','success');
  success('Natanggap ang reset request. Tingnan ang inbox at spam folder kung nakarehistro ang email.');
 }catch(err){
  recoveryFeedback(err.message||'Hindi maipadala ang reset request. Subukan muli mamaya.','error');
  message(err.message||'Hindi maipadala ang reset request.',true);
 }finally{
  button.disabled=false;button.setAttribute('aria-busy','false');
  button.querySelector('.recovery-submit-label').textContent='Send reset link';
 }
};
$('#recovery-reset-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 const data=Object.fromEntries(new FormData(e.target));
 if(data.password!==data.confirm)throw Error('Hindi magkatugma ang bagong password.');
 await api('./api/account/reset/confirm',{method:'POST',body:JSON.stringify({token:recoveryToken,password:data.password})});
 user=null;recoveryMode=null;recoveryToken=null;history.replaceState(null,'',location.pathname+location.search);
 recoveryFeedback();
 await showDashboard();success('Matagumpay ang password reset. Mag-login gamit ang bagong password.');
});};
async function verifyEmailFromLink(token){
 try{
  await api('./api/account/email/confirm',{method:'POST',body:JSON.stringify({token})});
  user=null;await showDashboard();success('Verified na ang bagong email. Mag-login muli gamit ang bagong address.');
 }catch(e){user=null;await showDashboard();message('Hindi ma-verify ang email. '+e.message,true);}
}
async function showDashboard(){syncWorkspaceMode();const forced=user?.mustChange;$('#recovery-section').hidden=!recoveryMode||!!user;$('#auth').hidden=!!user||!!recoveryMode;$('#logout').hidden=!user;$('#dashboard').hidden=!user||forced;$('#staff-nav').hidden=!user||forced;$('#password-section').hidden=!forced;if(!user)return;$('#current-email-label').textContent=user.email||'—';if(forced){$('#password-note').textContent='Palitan muna ang pansamantalang password bago gamitin ang dashboard.';return;}const positionLabels={kagawad:'SK KAGAWAD',treasurer:'SK TREASURER',secretary:'SK SECRETARY'};const designation=user.role==='chairman'?'SK CHAIRMAN':positionLabels[user.position]||'SK OFFICER';$('#role-label').textContent=designation+' DASHBOARD';$('#welcome').textContent='Kumusta, '+user.name+'.';$('#dashboard-description').textContent=user.role==='chairman'?'Pamamahala ng mga proyekto, SK officials, at mga ulat sa isang workspace.':user.position==='treasurer'?'Budget oversight, project expenses at verified financial reports.':user.position==='secretary'?'Meeting documentation, attendance, resolutions at SK project records.':'Manage assigned SK projects and community updates.';$('#chairman-overview').hidden=true;$('#officer-overview').hidden=true;$('#secretary-overview').hidden=true;$('#treasurer-overview').hidden=true;document.querySelectorAll('.chair-only').forEach(x=>x.hidden=user.role!=='chairman');document.querySelectorAll('.finance-only').forEach(x=>x.hidden=!(user.role==='chairman'||user.position==='treasurer'));const info=$('#position-info');info.hidden=user.role==='chairman';if(!info.hidden)info.textContent=user.position==='treasurer'?'Treasurer workspace: Annual Finance at monthly expense reports ay available. I-base lang sa mga official financial document.':user.position==='secretary'?'Secretary workspace: i-review ang project records at monthly reports. Ang hiwalay na minutes/attendance registry ay hindi pa enabled.':'Kagawad workspace: manage project updates.';await selectTab('overview');}
let activeStaffTab='overview';
async function selectTab(name){const tabs=['overview','projects','monthly','budget','roster','duty-manage','users','audit','settings'];if(!tabs.includes(name))return;if(['roster','duty-manage','users','audit'].includes(name)&&user?.role!=='chairman')return;if(name==='budget'&&!(user?.role==='chairman'||user?.position==='treasurer'))return;activeStaffTab=name;$('#duty-controls').hidden=true;dutyReadSequence++;for(const n of tabs){if(n!=='overview')$('#panel-'+n).hidden=n!==name;}$('#chairman-overview').hidden=!(name==='overview'&&user?.role==='chairman');const secretaryDashboard=name==='overview'&&user?.role==='sk'&&user?.position==='secretary';
 const treasurerDashboard=name==='overview'&&user?.role==='sk'&&user?.position==='treasurer';
 $('#secretary-overview').hidden=!secretaryDashboard;
 $('#treasurer-overview').hidden=!treasurerDashboard;
 $('#officer-overview').hidden=!(name==='overview'&&user?.role==='sk'&&!secretaryDashboard&&!treasurerDashboard);
 $('#dashboard-welcome').hidden=name!=='overview';
 const tabLabels={overview:'Dashboard',projects:'Manage Projects',monthly:'Monthly Updates',budget:'Annual Finance',roster:'SK Officials','duty-manage':'SK Duty Management',users:'SK Accounts',audit:'Activity Log',settings:'Account Settings'};
 $('#account-breadcrumb').textContent=tabLabels[name];
 $('#header-settings').classList.toggle('active',name==='settings');
 $('#header-settings').setAttribute('aria-current',name==='settings'?'page':'false');
 document.querySelectorAll('#staff-nav [data-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===name);b.setAttribute('aria-current',b.dataset.tab===name?'page':'false')});try{if(name==='overview'||name==='projects')await loadProjects();if(name==='overview')await loadRoleOverview();if(name==='users')await loadUsers();if(name==='audit'){auditOffset=0;await loadAudit()}if(['monthly','budget','roster'].includes(name))await loadTransparencyEditor(name);if(name==='duty-manage')await loadDutyManagement()}catch(e){message(e.message,true)}if(name==='overview')await updateDutyControls();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
document.querySelectorAll('[data-admin-open]').forEach(b=>b.onclick=()=>{selectTab(b.dataset.adminOpen);$('#staff-content').scrollIntoView({block:'start',behavior:'smooth'});});
// The gallery's first image is authoritative when an older record has no image_id.
const managedGalleryIds=p=>Array.isArray(p.image_ids)&&p.image_ids.length?p.image_ids:(p.image_id?[p.image_id]:[]);
const managedPhotoUrl=id=>'./api/images/'+encodeURIComponent(id);
async function loadProjects(){
 managed=(await api('./api/manage/projects')).projects;
 updateChairmanMetrics();
 $('#managed-projects').innerHTML=managed.map(p=>{
  const ids=managedGalleryIds(p),photoCount=ids.length;
  const thumbnail=photoCount
   ?'<button type="button" class="project-manage-thumbnail" data-view-gallery="'+esc(p.id)+'" aria-label="Tingnan ang '+photoCount+' larawan ng '+esc(p.title)+'"><span class="project-thumb-fallback" aria-hidden="true">SK</span><img src="'+esc(managedPhotoUrl(ids[0]))+'" alt="" loading="lazy" decoding="async"></button>'
   :'<span class="project-manage-thumbnail is-empty" aria-label="Wala pang larawan"><span class="project-thumb-fallback" aria-hidden="true">SK</span></span>';
  return `<article class="manage-row project-manage-row">
   <div class="project-manage-media">${thumbnail}<span class="project-manage-photo-count">${photoCount?photoCount+' '+(photoCount===1?'photo':'photos'):'No photos'}</span></div>
   <div class="project-manage-info"><span class="badge-inline">${esc(projectPublishStatus(p))} · ${esc(p.status)}</span><h3>${esc(p.title)}</h3><p>Gumawa: <b>${esc(p.creator_name)}</b> · ${dateText(p.created)}</p><p>Huling edit: <b>${esc(p.editor_name)}</b> · ${dateText(p.updated)}</p>
   <div class="project-quick-progress"><div class="project-progress-caption"><span>Project completion</span><strong>${p.progress}%</strong></div><div class="project-progress-bar" role="progressbar" aria-label="Project completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.progress}"><span style="width:${p.progress}%"></span></div></div></div>
   <div class="project-row-actions">${!p.published&&['sk','chairman'].includes(user?.role)?'<button type="button" class="project-publish-trigger" data-publish="'+esc(p.id)+'" aria-label="Publish now ang '+esc(p.title)+'">'+managementActionIcon('globe')+' Publish Now</button>':''}${photoCount?'<button type="button" class="secondary project-view-photos" data-view-gallery="'+esc(p.id)+'" aria-label="View photos of '+esc(p.title)+'">'+managementActionIcon('photos')+' Photos ('+photoCount+')</button>':''}${['sk','chairman'].includes(user?.role)?'<button type="button" class="project-progress-trigger" data-progress="'+esc(p.id)+'" aria-label="Update progress ng '+esc(p.title)+'">'+managementActionIcon('progress')+' Update Progress</button>':''}<button type="button" class="secondary" data-edit="${esc(p.id)}" aria-label="I-edit ang ${esc(p.title)}">'+managementActionIcon('edit')+' Edit</button>${['sk','chairman'].includes(user?.role)?'<button type="button" class="project-delete-trigger" data-delete="'+esc(p.id)+'" aria-label="I-delete ang '+esc(p.title)+'">'+managementActionIcon('delete')+' Delete</button>':''}</div>
  </article>`;
 }).join('')||'<div class="empty">Wala pang proyekto. Pindutin ang “Bagong proyekto” para magsimula.</div>';
}

/* Unified Lucide-style action icons for dynamically created staff buttons. */
function managementActionIcon(type){
 const paths={
  right:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  photos:'<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5 17 4-4 3 3 3-4 4 5"/>',
  progress:'<path d="M4 17h4l3-9 4 12 3-7h3"/>',
  edit:'<path d="m4 20 4.5-1 10.9-10.9a2 2 0 0 0-2.8-2.8L5.7 16.2 4 20Z"/>',
  delete:'<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>'
 };
 return '<svg class="ui-action-icon" data-direction="right" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(paths[type]||paths.right)+'</svg>';
}

/* Role dashboards show real existing database records. No invented minutes,
   attendance, financial balance, or unsigned certification statistics. */
let roleDashboardRequest=0;
function cleanRoleOverview(){
 const recordIds=['secretary-overview-records','treasurer-overview-records'];
 for(const id of recordIds){const el=$('#'+id);if(el)el.textContent='Loading latest records…';}
}
function renderRoleRecords(records,role){
 const target=$('#'+role+'-overview-records');
 if(!target)return;
 if(!records.length){
  target.innerHTML='<div class="role-record-empty">Wala pang na-save na monthly report para sa napiling fiscal year.</div>';
  return;
 }
 target.innerHTML=records.slice(0,5).map(item=>{
  const amount=role==='treasurer'
   ?'<span class="role-record-value">'+(item.expense==null?'Expense not reported':transMoney(item.expense))+'</span>'
   :'<span class="role-record-value">'+(item.published?'Published':'Draft')+'</span>';
  return '<div class="role-record-item"><div><strong>'+esc(String(item.title||'Project'))+
   '</strong><small>'+esc(String(item.month||'').slice(0,7))+' · '+
   esc(String(item.summary||'').slice(0,100))+'</small></div>'+amount+'</div>';
 }).join('');
}
async function loadRoleOverview(){
 const role=user?.role==='sk'?user.position:null;
 if(role!=='secretary'&&role!=='treasurer')return;
 const ticket=++roleDashboardRequest,year=transYearNow(),idPrefix=role;
 const data=await api('./api/transparency/manage?year='+year);
 if(ticket!==roleDashboardRequest||activeStaffTab!=='overview'||user?.position!==role)return;
 if(data?.error)throw Error('Hindi ma-load ang report records para sa '+year+'.');
 const reports=Array.isArray(data?.updates)?data.updates:[];
 if(role==='secretary'){
  $('#secretary-monthly-count').textContent=String(reports.length);
  $('#secretary-draft-count').textContent=String(managed.filter(p=>!p.published).length);
  $('#secretary-done-count').textContent=String(managed.filter(p=>p.status==='Natapos').length);
 }else{
  const amount=data?.budget?.amount;
  $('#treasurer-budget-amount').textContent=amount===undefined||amount===null?'Not recorded':transMoney(amount);
  const recorded=reports.filter(x=>x.expense!==null&&x.expense!==undefined&&Number.isFinite(Number(x.expense)));
  $('#treasurer-reported-total').textContent=transMoney(recorded.reduce((sum,x)=>sum+Number(x.expense),0));
  $('#treasurer-missing-count').textContent=String(reports.filter(x=>x.expense===null||x.expense===undefined).length);
 }
 renderRoleRecords(reports,role);
}
function updateChairmanMetrics(){if(!user||user.role!=='chairman')return;$('#admin-total').textContent=String(managed.length);$('#admin-published').textContent=String(managed.filter(p=>p.published&&(!p.publish_at||Date.parse(p.publish_at)<=Date.now())).length);$('#admin-active').textContent=String(managed.filter(p=>p.status==='Isinasagawa').length)}


const phPublicationDate=iso=>{
 const date=new Date(iso);
 return Number.isFinite(date.getTime())
  ?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(date)
  :'Petsa hindi naitala';
};
const projectPublishStatus=p=>{
 if(!p.published)return 'Draft · Hindi pa published';
 if(!p.publish_at)return 'Published · Petsa hindi naitala';
 return (new Date(p.publish_at).getTime()>Date.now()?'Scheduled · ':'Published · ')+phPublicationDate(p.publish_at)+' PHT';
};
const phtLocalInput=iso=>{
 const d=new Date(iso);
 if(!Number.isFinite(d.getTime()))return '';
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d).replace(' ','T');
};
function scheduledDateIso(raw){
 if(typeof raw!=='string'||!(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).test(raw))return null;
 const parsed=new Date(raw+':00+08:00');
 if(!Number.isFinite(parsed.getTime())||phtLocalInput(parsed.toISOString())!==raw)return null;
 return parsed.toISOString();
}
// datetime-local has no timezone: all displayed values are explicitly in Philippine Time.
function nextSchedulePHInput(){
 const fiveMinutes=5*60*1000;
 return phtLocalInput(new Date(Math.ceil((Date.now()+15*60*1000)/fiveMinutes)*fiveMinutes));
}
function updatePublicationFields(){
 const mode=$('#project-publication-mode').value,wrap=$('#project-publish-datetime-wrap'),info=$('#project-publish-preview');
 const input=$('#project-publish-datetime');
 // A hidden datetime-local is STILL a constraint-validated form control.
 // Disable it completely unless scheduling; otherwise an old date from an
 // existing project blocks Publish Now, Save Draft, or Keep Current.
 const scheduling=mode==='schedule';
 wrap.hidden=!scheduling;
 input.disabled=!scheduling;
 input.required=scheduling;
 input.min=scheduling
  ?phtLocalInput(new Date(Math.ceil((Date.now()+60*1000)/(60*1000))*(60*1000)))
  :'';
 if(!scheduling&&typeof input.setCustomValidity==='function')input.setCustomValidity('');
 info.classList.remove('publication-time-error');
 // The main save action always reflects whether this change stays private or goes public.
 const save=$('#save-project'),note=$('#project-save-note');
 if(save){
  save.textContent=mode==='draft'?'Save as Draft':mode==='now'?'Publish Project':mode==='schedule'?'Schedule Project':'Save Changes';
  save.insertAdjacentHTML('beforeend',managementActionIcon('right'));
 }
 if(note)note.textContent=mode==='draft'?'Draft lamang — sa SK accounts lang makikita.':
  mode==='now'?'Magiging public ang project at mga larawan pagkatapos ma-save.':
  mode==='schedule'?'Mananatiling nakatago hanggang sa napiling oras sa Pilipinas.':
  'Mananatili ang kasalukuyang publication settings.';
 // Mirror the value of the native select into the accessible option cards.
 const choices=$('#project-publication-choices');
 if(choices)for(const button of choices.querySelectorAll('[data-publication-option]')){
  const active=button.dataset.publicationOption===mode;
  button.classList.toggle('selected',active);
  button.setAttribute('aria-pressed',String(active));
 }
 if(mode==='draft')info.textContent='Draft — sa dashboard lang muna makikita.';
 else if(mode==='now')info.textContent='Publish Now — makikita agad sa public website pagkatapos ma-save.';
 else if(mode==='keep')info.textContent=editing?projectPublishStatus(editing)+' · Mananatili ang kasalukuyang publication schedule/petsa.':'';
 else{
  const iso=scheduledDateIso(input.value);
  if(!iso)info.textContent='Pumili ng valid na petsa at oras sa Philippine Time.';
  else if(Date.parse(iso)<=Date.now()+30000){
    info.textContent='Lumipas na ang napiling oras. Pumili ng oras sa hinaharap (PH time), o gamitin ang Publish Now.';
    info.classList.add('publication-time-error');
  }else info.textContent='Scheduled for '+phPublicationDate(iso)+' PHT · Lalabas sa public site sa oras na ito.';
 }
}
$('#project-publication-mode').addEventListener('change',()=>{
 if($('#project-publication-mode').value==='schedule'){
   const input=$('#project-publish-datetime');
   const iso=scheduledDateIso(input.value);
   if(!iso||Date.parse(iso)<=Date.now()+30000)input.value=nextSchedulePHInput();
 }
 updatePublicationFields();
});
const publicationChoices=$('#project-publication-choices');
if(publicationChoices)publicationChoices.addEventListener('click',event=>{
 const card=event.target.closest('[data-publication-option]');
 if(!card||card.hidden)return;
 $('#project-publication-mode').value=card.dataset.publicationOption;
 $('#project-publication-mode').dispatchEvent(new Event('change',{bubbles:true}));
});
$('#project-publish-datetime').addEventListener('input',updatePublicationFields);
$('#project-publish-datetime').addEventListener('focus',updatePublicationFields);

let editorPhotos=[],editorBaseline='',projectSaveJob=null;
function clearProjectPreviews(){for(const p of editorPhotos)if(p.url)URL.revokeObjectURL(p.url);editorPhotos=[];}
function renderProjectPreviews(){
 const region=$('#current-image');
 region.innerHTML=editorPhotos.map((p,i)=>{
   const src=p.id?'./api/images/'+encodeURIComponent(p.id):p.url;
   return '<article class="editor-photo"><img src="'+esc(src)+'" alt="Project photo '+(i+1)+'">'+
     (i===0?'<span class="editor-photo-cover">Cover photo</span>':'<button type="button" class="editor-set-cover" data-photo-cover="'+i+'">Set cover</button>')+
     '<button type="button" class="editor-photo-remove" data-photo-remove="'+i+'" aria-label="Alisin ang larawan '+(i+1)+'">×</button></article>';
 }).join('');
 region.hidden=editorPhotos.length===0;
}
// In Facebook mode, start with caption text only and reveal the editable form
// only when an analyzed caption has a draft ready for Chairman review.
let facebookDraftReady=false;
function setProjectEntryMode(mode){
 const facebook=mode==='facebook'&&!editing&&['sk','chairman'].includes(user?.role);
 const visible=!editing&&['sk','chairman'].includes(user?.role);
 $('#project-entry-mode').hidden=!visible;
 $('#manual-entry-help').hidden=!visible||facebook;
 const panel=$('#fb-import-panel');
 panel.hidden=!facebook;
 panel.open=facebook;
 $('#project-review-fields').hidden=facebook&&!facebookDraftReady;
 $('#fb-review-hint').hidden=!facebook||!facebookDraftReady;
 $('#project-form').querySelector('.editor-footer').hidden=facebook&&!facebookDraftReady;
 for(const button of document.querySelectorAll('#project-entry-mode [data-entry-mode]')){
  const active=button.dataset.entryMode===(facebook?'facebook':'manual');
  button.setAttribute('aria-pressed',String(active));
  button.classList.toggle('selected',active);
 }
}
$('#project-entry-mode').addEventListener('click',e=>{
 const button=e.target.closest('[data-entry-mode]');
 if(!button)return;
 setProjectEntryMode(button.dataset.entryMode);
});
function openEditor(project=null){
 if(projectSaveJob){message('May project upload pang tumatakbo. Hintaying matapos bago mag-edit muli.',true);return;}
 clearProjectPreviews();editing=project;facebookDraftReady=false;
 const form=$('#project-form');form.reset();
 const publishMode=$('#project-publication-mode');
 publishMode.querySelector('[value="keep"]')?.remove();
 form.elements.publication_mode.value='draft';
 $('#publication-keep').hidden=!project?.published;
 $('#project-publish-datetime').value='';
 setProjectEntryMode('manual');
 $('#fb-import-result').hidden=true;$('#fb-import-result').textContent='';
 $('#fb-import-status').textContent='';
 pendingImportedActivity=null;
 $('#fb-use-activity-as-project').hidden=true;
 $('#editor-message').textContent='';
 $('#editor-message').classList.remove('error');
 projectSaveFeedback();
 $('#editor-heading').textContent=project?'I-edit ang proyekto':'Bagong proyekto';
 if(project){
   for(const key of ['title','category','description','scope','status','progress'])form.elements[key].value=project[key];
   if(project.published){
     const keep=document.createElement('option');keep.value='keep';
     keep.textContent=project.publish_at&&Date.parse(project.publish_at)>Date.now()?'Keep current publication schedule':'Keep existing publication date';
     publishMode.prepend(keep);
     publishMode.value='keep';
   }
   if(project.publish_at)$('#project-publish-datetime').value=phtLocalInput(project.publish_at);
   const ids=Array.isArray(project.image_ids)&&project.image_ids.length?project.image_ids:(project.image_id?[project.image_id]:[]);
   editorPhotos=ids.map(id=>({id}));
 }
 renderProjectPreviews();
 updatePublicationFields();
 editorBaseline=editorFormSignature();
 $('#editor').showModal();
 $('#project-editor-scroll').scrollTop=0;
}
$('#new-project').onclick=()=>openEditor();
let activeProgressProject=null;
const projectProgressStatus=value=>value===0?'Pinaplano':value===100?'Natapos':'Isinasagawa';
function updateProgressPreview(value){
 const n=Number(value);
 if(!Number.isInteger(n)||n<0||n>100)return;
 $('#progress-range').value=n;
 $('#progress-number').value=n;
 $('#progress-percent').textContent=n+'%';
 $('#progress-status').textContent=projectProgressStatus(n);
 $('#progress-preview-bar').style.width=n+'%';
 document.querySelectorAll('#progress-dialog [data-progress-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.progressPreset)===n)));
}
function openProgressDialog(p){
 if(!p||!['sk','chairman'].includes(user?.role))return;
 activeProgressProject={id:p.id,version:p.version,title:p.title};
 $('#progress-project-title').textContent=p.title+(p.published?'':' · Draft — progress updates do not publish the project.');
 $('#progress-error').textContent='';
 updateProgressPreview(p.progress);
 $('#progress-dialog').showModal();
}
$('#progress-range').addEventListener('input',e=>updateProgressPreview(e.target.value));
$('#progress-number').addEventListener('input',e=>{
 const n=Number(e.target.value);
 if(e.target.value!==''&&Number.isInteger(n)&&n>=0&&n<=100)updateProgressPreview(n);
});
$('#progress-dialog').addEventListener('click',e=>{
 const preset=e.target.closest('[data-progress-preset]');
 if(preset)updateProgressPreview(Number(preset.dataset.progressPreset));
});
$('#progress-cancel').onclick=()=>$('#progress-dialog').close();
$('#progress-dialog').addEventListener('close',()=>{activeProgressProject=null;});
$('#progress-form').onsubmit=async e=>{
 e.preventDefault();
 const p=activeProgressProject;
 const n=Number($('#progress-number').value);
 if(!p||!['sk','chairman'].includes(user?.role)||!Number.isInteger(n)||n<0||n>100){
  $('#progress-error').textContent='Maglagay ng valid na porsiyento mula 0 hanggang 100.';
  return;
 }
 const save=$('#progress-save');
 save.disabled=true;$('#progress-error').textContent='Sine-save ang progress…';
 try{
  const result=await api('./api/manage/projects/'+encodeURIComponent(p.id)+'/progress',{
    method:'POST',body:JSON.stringify({progress:n,version:p.version})
  });
  if(!result?.ok)throw Error('Hindi natuloy ang pag-save.');
  $('#progress-dialog').close();
  success(result.unchanged===true?'Walang binago sa progress ng '+p.title+'.':'Na-update ang '+p.title+': '+n+'% · '+projectProgressStatus(n)+'.');
  await loadProjects();
 }catch(err){
  $('#progress-error').textContent=err.message;
  message(err.message,true);
 }finally{save.disabled=false;}
};
let pendingDeleteProject=null;
function openDeleteProject(p){
 if(!p||!['sk','chairman'].includes(user?.role))return;
 pendingDeleteProject={id:p.id,version:p.version,title:p.title};
 $('#delete-project-title').textContent=p.title;
 $('#delete-project-confirm-name').textContent=p.title;
 $('#delete-project-input').value='';
 $('#delete-project-copy-status').hidden=true;
 $('#delete-project-copy-status').textContent='';
 $('#delete-project-button').disabled=true;
 $('#delete-project-error').textContent='';
 $('#delete-project-dialog').showModal();
}
let staffGalleryImages=[],staffGalleryIndex=0,staffGalleryTitle='';
function renderStaffGallery(){
 if(!staffGalleryImages.length)return;
 const image=$('#staff-gallery-image');
 image.hidden=false;
 $('#staff-gallery-error').hidden=true;
 image.src=managedPhotoUrl(staffGalleryImages[staffGalleryIndex]);
 image.alt=staffGalleryTitle+' — photo '+(staffGalleryIndex+1)+' of '+staffGalleryImages.length;
 $('#staff-gallery-count').textContent=(staffGalleryIndex+1)+' / '+staffGalleryImages.length;
 $('#staff-gallery-prev').disabled=staffGalleryImages.length<2;
 $('#staff-gallery-next').disabled=staffGalleryImages.length<2;
}
function openStaffGallery(p){
 if(!p||!['sk','chairman'].includes(user?.role))return;
 const ids=managedGalleryIds(p);if(!ids.length)return;
 staffGalleryImages=ids.slice();
 staffGalleryIndex=0;
 staffGalleryTitle=p.title;
 $('#staff-gallery-title').textContent=p.title;
 renderStaffGallery();
 $('#staff-project-gallery').showModal();
}
function moveStaffGallery(step){
 if(!staffGalleryImages.length)return;
 staffGalleryIndex=(staffGalleryIndex+step+staffGalleryImages.length)%staffGalleryImages.length;
 renderStaffGallery();
}
$('#staff-gallery-prev').onclick=()=>moveStaffGallery(-1);
$('#staff-gallery-next').onclick=()=>moveStaffGallery(1);
$('#staff-gallery-close').onclick=()=>$('#staff-project-gallery').close();
$('#staff-project-gallery').addEventListener('click',e=>{if(e.target.id==='staff-project-gallery')e.target.close();});
$('#staff-project-gallery').addEventListener('close',()=>{staffGalleryImages=[];$('#staff-gallery-image').removeAttribute('src');});
$('#staff-gallery-image').addEventListener('error',()=>{$('#staff-gallery-image').hidden=true;$('#staff-gallery-error').hidden=false;});
$('#staff-gallery-image').addEventListener('load',()=>{$('#staff-gallery-image').hidden=false;$('#staff-gallery-error').hidden=true;});
document.addEventListener('keydown',e=>{
 if(!$('#staff-project-gallery').open)return;
 if(e.key==='ArrowLeft'){e.preventDefault();moveStaffGallery(-1);}
 if(e.key==='ArrowRight'){e.preventDefault();moveStaffGallery(1);}
});
// Preserve the placeholder if an uploaded image is unavailable.
$('#managed-projects').addEventListener('error',e=>{
 if(e.target.matches?.('.project-manage-thumbnail img'))e.target.hidden=true;
},true);

// Publish a saved Draft without removing project details, cover, or gallery photos.
// The existing secure PUT endpoint performs authorization and version checks.
function draftPublishPayload(p){
 const ids=managedGalleryIds(p);
 return {title:p.title,category:p.category,description:p.description,scope:p.scope,
  status:p.status,progress:Number(p.progress),image_ids:ids,image_id:ids[0]||null,
  version:p.version,publication_mode:'now',published:true,publish_at:null};
}
let pendingPublishProject=null;
function openPublishProject(p){
 if(!p||p.published||!['sk','chairman'].includes(user?.role))return;
 pendingPublishProject=p;
 $('#publish-project-title').textContent=p.title;
 $('#publish-project-error').textContent='';
 $('#publish-project-confirm').disabled=false;
 $('#publish-project-dialog').showModal();
}
$('#publish-project-cancel').onclick=()=>$('#publish-project-dialog').close();
$('#publish-project-dialog').addEventListener('cancel',e=>{
 if($('#publish-project-confirm').disabled)e.preventDefault();
});
$('#publish-project-dialog').addEventListener('close',()=>{pendingPublishProject=null;});
$('#publish-project-confirm').onclick=async()=>{
 const p=pendingPublishProject;
 if(!p||p.published||!['sk','chairman'].includes(user?.role))return;
 const button=$('#publish-project-confirm');
 button.disabled=true;
 $('#publish-project-error').textContent='Pina-publish ang proyekto…';
 try{
  const result=await api('./api/manage/projects/'+encodeURIComponent(p.id),{
   method:'PUT',body:JSON.stringify(draftPublishPayload(p))
  });
  if(!result?.project?.id||result.project.published!==true)
   throw Error('Hindi nakumpirma ang publication ng proyekto.');
  $('#publish-project-dialog').close();
  success('Published na ang '+p.title+'. Makikita na ito sa public Mga proyekto.');
  await loadProjects();
 }catch(error){
  $('#publish-project-error').textContent=error.message||'Hindi na-publish. Subukan muli.';
  message(error.message||'Hindi na-publish ang proyekto.',true);
 }finally{button.disabled=false;}
};
$('#managed-projects').onclick=e=>{
 const publishButton=e.target.closest('[data-publish]');
 if(publishButton){openPublishProject(managed.find(p=>p.id===publishButton.dataset.publish));return;}
 const galleryButton=e.target.closest('[data-view-gallery]');
 if(galleryButton){openStaffGallery(managed.find(p=>p.id===galleryButton.dataset.viewGallery));return;}
 const progressButton=e.target.closest('[data-progress]');
 if(progressButton){openProgressDialog(managed.find(p=>p.id===progressButton.dataset.progress));return;}
 const deleteButton=e.target.closest('[data-delete]');
 if(deleteButton){openDeleteProject(managed.find(p=>p.id===deleteButton.dataset.delete));return;}
 const editButton=e.target.closest('[data-edit]');
 if(editButton)openEditor(managed.find(p=>p.id===editButton.dataset.edit));
};
$('#delete-project-copy-name').onclick=async()=>{
 const p=pendingDeleteProject;
 if(!p)return;
 const info=$('#delete-project-copy-status');
 info.hidden=false;info.classList.remove('error');
 try{
  if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
  await navigator.clipboard.writeText(p.title);
  info.textContent='Copied! I-paste ang pangalan sa confirmation field.';
  $('#delete-project-input').focus();
 }catch{
  // Copy operations require browser permission and a secure context.
  info.classList.add('error');
  info.textContent='Hindi makopya sa browser na ito. Piliin ang pangalan sa itaas at i-copy nang manual.';
 }
};
$('#delete-project-input').addEventListener('input',e=>{
 $('#delete-project-button').disabled=!pendingDeleteProject||
   e.target.value.trim()!==pendingDeleteProject.title;
});
$('#delete-project-cancel').onclick=()=>$('#delete-project-dialog').close();
$('#delete-project-dialog').addEventListener('close',()=>{pendingDeleteProject=null;});
$('#delete-project-button').onclick=async()=>{
 const p=pendingDeleteProject;
 if(!p||!['sk','chairman'].includes(user?.role)||$('#delete-project-input').value.trim()!==p.title)return;
 const button=$('#delete-project-button');
 button.disabled=true;$('#delete-project-error').textContent='Deleting project…';
 try{
  await api('./api/manage/projects/'+encodeURIComponent(p.id),{
    method:'DELETE',body:JSON.stringify({version:p.version})
  });
  $('#delete-project-dialog').close();
  success('Matagumpay na na-delete ang proyekto: '+p.title);
  await loadProjects();
 }catch(error){
  $('#delete-project-error').textContent=error.message;
  message(error.message,true);
  button.disabled=false;
 }
};
function editorFormSignature(){
 const form=$('#project-form'),fields={};
 for(const k of ['title','category','description','scope','status','progress','publication_mode'])fields[k]=form.elements[k]?.value||'';
 return JSON.stringify({fields,photos:editorPhotos.map(p=>p.id||(p.file?.name+':'+p.file?.size))});
}
function closeEditorSafely(){
 if(projectSaveJob){$('#editor').close();return;}
 if(editorFormSignature()===editorBaseline||$('#project-review-fields').hidden){$('#editor').close();return;}
 if(!$('#project-form').reportValidity()){
  projectSaveFeedback('Kumpletuhin ang required project details bago mag-auto-save.',true);return;
 }
 try{startProjectSave(captureProjectSave(true));$('#editor').close();}
 catch(error){projectSaveFeedback(error?.message||'Hindi pa nai-save.',true);}
}
$('.close').onclick=closeEditorSafely;
$('#editor-cancel').onclick=closeEditorSafely;
$('#editor').addEventListener('cancel',e=>{e.preventDefault();closeEditorSafely()});
$('#editor').addEventListener('close',clearProjectPreviews);
function appendProjectFiles(files){
 if(files.length+editorPhotos.length>12){message('Maximum 12 photos per project.',true);return false;}
 let accepted=0;
 for(const file of files){
   if(file.size<1||file.size>5242880||!['image/png','image/jpeg','image/webp'].includes(file.type)){
     message('JPG, PNG o WebP lamang, hanggang 5 MB bawat larawan.',true);continue;
   }
   editorPhotos.push({file,url:URL.createObjectURL(file)});accepted++;
 }
 renderProjectPreviews();
 return accepted===files.length;
}
$('#editor-files').addEventListener('change',e=>{
 const input=e.target,files=[...(input.files||[])];input.value='';
 appendProjectFiles(files);
});
let pendingImportedActivity=null;
function applyFacebookDraft(result){
 const draft=result.draft||{},form=$('#project-form');
 for(const field of ['title','category','description','scope']){
  if(typeof draft[field]==='string')form.elements[field].value=draft[field];
 }
 // Keep the event date in imported titles so public projects can be sorted
 // by activity date, even for existing DB tables without activity_date column.
 if(/^20\d{2}-\d{2}-\d{2}$/.test(String(draft.activity_date||''))){
  const title=form.elements.title.value;
  if(!/(?:20\d{2}[-/]\d{2}[-/]\d{2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+20\d{2})/i.test(title)){
   const date=new Date(draft.activity_date+'T12:00:00Z');
   const when=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date);
   form.elements.title.value=(when+' | '+title).slice(0,150);
  }
 }
 // Status/progress must always agree: completed=100, planned=0, active=1..99.
 const status=['Pinaplano','Natapos','Isinasagawa'].includes(draft.status)?draft.status:'Pinaplano';
 const raw=Number.isInteger(draft.progress)?draft.progress:0;
 const progress=status==='Natapos'?100:status==='Pinaplano'?0:Math.min(99,Math.max(1,raw));
 form.elements.status.value=status;
 form.elements.progress.value=String(progress);
 const review=$('#fb-review-hint');
 review.textContent=(draft.method==='ai'?'✓ Groq AI-assisted draft':'⚠ Basic rule-based draft (not AI). '+facebookAiStatus(result.ai))+
  ' · Category: '+(draft.category||'I-review')+
  ' · '+status+' / '+progress+'%. '+
  (draft.status_note||'I-review ang mga field bago i-save.')+
  (draft.progress_provisional?' Huwag ituring na actual percent ang provisional progress.':'');
 form.elements.publication_mode.value='draft';
 updatePublicationFields();
 facebookDraftReady=true;
 setProjectEntryMode('facebook');
 $('#editor-heading').textContent='Review Imported '+(draft.content_type==='meeting'?'SK Activity':'Project');
 $('#project-review-fields').scrollIntoView({block:'start',behavior:'smooth'});
 form.elements.title.focus();
}
function facebookAiStatus(info){
 if(!info||info.status==='success')return 'Groq AI analysis successful.';
 if(info.status==='missing_key')return 'Groq AI hindi naka-configure sa environment ng deployment na ito. Tingnan ang GROQ_API_KEY sa Preview at Production.';
 if(info.status==='provider_error'){
  const code=info.http_status;
  if(code===401||code===403)return 'Groq authentication failed (HTTP '+code+'). Suriin ang GROQ_API_KEY.';
  if(code===429)return 'Groq rate limit o credits exceeded (HTTP 429). Basic analysis ang ginamit.';
  if(code===404)return 'Groq model o endpoint unavailable (HTTP 404). Na-update na ang default sa GPT-OSS 20B; siguraduhing latest deployment ang binuksan. Basic draft lamang ito.';
  return 'Groq returned HTTP '+code+'. Suriin ang API/model configuration at deployment logs.';
 }
 if(info.status==='timeout')return 'Nag-timeout ang Groq request. Basic analysis ang ginamit.';
 if(info.status==='invalid_response')return 'Hindi valid ang AI response; basic analysis ang ginamit.';
 return 'Hindi maabot ang Groq ngayon; basic analysis ang ginamit.';
}
$('#fb-use-activity-as-project').addEventListener('click',()=>{
 if(!pendingImportedActivity)return;
 applyFacebookDraft(pendingImportedActivity);
 $('#fb-import-status').textContent='Na-transfer sa editable project form. I-review bago i-save.';
 $('#fb-use-activity-as-project').hidden=true;
 pendingImportedActivity=null;
});
$('#fb-analyze-post').addEventListener('click',async()=>{
 const button=$('#fb-analyze-post'),status=$('#fb-import-status'),resultBox=$('#fb-import-result');
 const caption=$('#fb-post-caption').value.trim();
 if(editing||!['sk','chairman'].includes(user?.role))return;
 if(caption.length<15){status.textContent='I-paste ang buong caption (at least 15 characters) bago mag-analyze.';$('#fb-post-caption').focus();return;}
 pendingImportedActivity=null;$('#fb-use-activity-as-project').hidden=true;
 button.disabled=true;status.textContent='Sinusuri ang caption gamit ang Groq AI…';resultBox.hidden=true;
 try{
  const result=await api('./api/manage/projects/import-facebook',{
   method:'POST',body:JSON.stringify({caption})
  });
  if(!result.ok){
   status.textContent='Kailangan ang mas kumpletong caption para sa tamang analysis.';
   resultBox.hidden=false;resultBox.textContent=result.message||'I-paste ang caption at subukang muli.';
   $('#fb-post-caption').focus();
   return;
  }
  const draft=result.draft||{};
  const kind=draft.content_type==='meeting'?'SK Regular Session / Meeting':draft.content_type==='announcement'?'Announcement':'SK Project';
  const details=[
   'Uri ng post: '+kind,
   draft.activity_date?'Petsa sa caption: '+draft.activity_date:'Petsa sa caption: Hindi matukoy',
   'AI status: '+facebookAiStatus(result.ai),
   'Title: '+(draft.title||''),
   'Category: '+(draft.category||''),
   'Status: '+(draft.status||'')+' · Progreso: '+(Number.isInteger(draft.progress)?draft.progress:0)+'%',
   'Status evidence: '+(draft.status_note||'I-review kung naganap na ang project.'),
   'Summary: '+(draft.description||''),
   'Details / Scope: '+(draft.scope||''),
   '',
   result.warning||'I-review ang lahat ng detalye.'
  ];
  resultBox.hidden=false;
  resultBox.textContent=details.join('\n');
  const isNonProject=draft.content_type==='meeting'||draft.content_type==='announcement';
  if(isNonProject){
   pendingImportedActivity=result;
   $('#fb-use-activity-as-project').hidden=false;
   status.textContent='Hindi ito regular na SK project; i-review muna bago ilipat sa project form.';
  }else{
   applyFacebookDraft(result);
   status.textContent=(draft.method==='ai'?'Groq AI analysis complete':'Basic draft lamang (Groq unavailable)')+' — basahin at i-review ang mga fields bago mag-save.';
  }
 }catch(err){
  resultBox.hidden=false;
  resultBox.textContent=err.message||'Hindi natuloy ang Facebook import.';
  status.textContent='Import failed.';
  message(err.message,true);
 }finally{button.disabled=false;}
});
$('#current-image').addEventListener('click',e=>{
 const remove=e.target.closest('[data-photo-remove]');
 const cover=e.target.closest('[data-photo-cover]');
 if(remove){
   const index=Number(remove.dataset.photoRemove);
   const photo=editorPhotos.splice(index,1)[0];
   if(photo?.url)URL.revokeObjectURL(photo.url);
 }else if(cover){
   const index=Number(cover.dataset.photoCover);
   if(index>0&&index<editorPhotos.length)editorPhotos.unshift(editorPhotos.splice(index,1)[0]);
 }else return;
 renderProjectPreviews();
});
$('#project-form').elements.status.onchange=e=>{
 const form=$('#project-form'),current=Number(form.elements.progress.value);
 if(e.target.value==='Natapos')form.elements.progress.value=100;
 else if(e.target.value==='Pinaplano')form.elements.progress.value=0;
 else if(e.target.value==='Isinasagawa'&&(!Number.isInteger(current)||current<=0||current>=100))
  form.elements.progress.value=1;
};
$('#project-form').elements.progress.addEventListener('change',e=>{
 const form=$('#project-form'),n=Number(e.target.value);
 if(!Number.isInteger(n)||n<0||n>100)return;
 form.elements.status.value=n===100?'Natapos':n===0?'Pinaplano':'Isinasagawa';
});
// Retry a transient upload API failure, preserving the same upload ID/chunk
// so a temporary network interruption does not force all photos to restart.
async function uploadPhotoRequest(data,stage){
 const maxTries=3;
 for(let attempt=1;attempt<=maxTries;attempt++){
  try{return await api('./api/uploads',{method:'POST',body:JSON.stringify(data)})}
  catch(error){
   const msg=String(error?.message||'');
   // Authentication, validation, integrity and missing images need a real fix,
   // not an automatic retry that could conceal or repeat invalid requests.
   const transient=/Hindi makonekta|Hindi natuloy ang pag-upload|server|timed?\s*out|network|fetch|temporar|try again|retry|502|503|504/i.test(msg);
   if(!transient||attempt===maxTries){
    throw Error(stage+': '+(msg||'Hindi natuloy ang pag-upload.')+
      ' Subukan muli kung stable na ang internet; hindi mabubura ang mga larawang na-save na.');
   }
   projectUploadStatus('May pansamantalang upload error. Retry '+(attempt+1)+'/'+maxTries+' · '+stage+'…');
   await new Promise(resolve=>setTimeout(resolve,450*attempt*attempt));
  }
 }
}
async function uploadProjectPhoto(file){
 if(!file||!Number.isFinite(file.size)||file.size<1||file.size>5242880||!['image/png','image/jpeg','image/webp'].includes(file.type))
  throw Error('Photo must be PNG, JPG or WebP and no larger than 5 MB.');
 const upload=await uploadPhotoRequest({action:'begin',size:file.size,mime:file.type},'Starting upload');
 if(!upload?.id||!Number.isInteger(upload.chunkSize)||upload.chunkSize<1)
  throw Error('Invalid upload session from server. Hindi pa na-upload ang larawan.');
 for(let index=0,start=0;start<file.size;index++,start+=upload.chunkSize){
  const piece=file.slice(start,start+upload.chunkSize);
  const encoded=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result).split(',')[1]);
   reader.onerror=()=>reject(Error('Hindi mabasa ang photo file sa device.'));
   reader.readAsDataURL(piece);
  });
  await uploadPhotoRequest({action:'chunk',id:upload.id,index,data:encoded},'Uploading photo part '+(index+1));
 }
 const completed=await uploadPhotoRequest({action:'complete',id:upload.id},'Finalizing image');
 if(!completed?.id)throw Error('Hindi nakumpirma ang photo upload sa database.');
 return completed.id;
}
function projectSaveFeedback(text='',error=false){
 const el=$('#project-save-feedback');
 el.textContent=String(text||'');
 el.hidden=!text;
 el.classList.toggle('error',error);
 el.setAttribute('role',error?'alert':'status');
 $('#editor-message').classList.toggle('error',error);
 $('#editor-message').textContent=String(text||'');
}
// Native HTML form validation normally prevents submit without any useful
// feedback when the invalid input is below the fold of our modal.
$('#project-form').addEventListener('invalid',e=>{
 const form=e.currentTarget;
 if(!form||!form.contains(e.target))return;
 const control=e.target;
 const names={title:'Project Title',category:'Category',description:'Summary',scope:'Details / Scope',
  status:'Status',progress:'Progreso (%)',publication_mode:'Publication'};
 const field=control.id==='project-publish-datetime'
  ?'Petsa at oras ng publication'
  :(names[control.name]||'required field');
 projectSaveFeedback('Hindi pa ma-save: pakisuri ang '+field+'. '+(control.validationMessage||''),true);
},true);
$('#project-form').addEventListener('input',e=>{
 if(!e.target.matches?.('input,select,textarea'))return;
 if($('#project-save-feedback').classList.contains('error'))projectSaveFeedback();
});
// Upload jobs own immutable input snapshots; closing a dialog cannot cancel them.
function captureProjectSave(automatic=false){
 const form=$('#project-form'),body=Object.fromEntries(new FormData(form));
 const record=editing?{id:editing.id,version:editing.version,published:!!editing.published}:null;
 body.progress=Number(body.progress);
 const mode=automatic?(record?.published?'keep':'draft'):form.elements.publication_mode.value;
 body.publication_mode=mode;body.published=mode!=='draft';body.publish_at=null;
 if(mode==='schedule'){
  const date=scheduledDateIso($('#project-publish-datetime').value);
  if(!date||Date.parse(date)<=Date.now()+30000)throw Error('Pumili ng valid future publication date sa Philippine Time.');
  body.publish_at=date;
 }
 if(record&&!Number.isInteger(record.version))throw Error('Invalid project version. Refresh Manage Projects.');
 body.version=record?.version;delete body.image;
 return {body,record,photos:editorPhotos.map(x=>({id:x.id||null,file:x.file||null,source:x})),automatic};
}
async function saveProjectStage(job,mode,ids){
 const data={...job.body,publication_mode:mode,published:mode!=='draft',
  publish_at:mode==='schedule'?job.body.publish_at:null,
  image_ids:ids,image_id:ids[0]||null,version:job.record?.version};
 const path='./api/manage/projects'+(job.record?'/'+encodeURIComponent(job.record.id):'');
 const res=await api(path,{method:job.record?'PUT':'POST',body:JSON.stringify(data)});
 if(!res.project?.id||!Number.isInteger(res.project.version))throw Error('Hindi nakumpirma ang database project version.');
 job.record={id:res.project.id,version:res.project.version,published:!!res.project.published};
 // Retry a partial upload against the saved record rather than creating a duplicate.
 if($('#editor').open){editing={...(editing||{}),...res.project};editorBaseline=editorFormSignature();}
 return res.project;
}
function startProjectSave(job){
 if(projectSaveJob)return projectSaveJob;
 $('#save-project').disabled=true;projectSaveFeedback();
 const running=(async()=>{
  const uploads=job.photos.filter(x=>x.file&&!x.id).length;
  const existingIds=job.photos.filter(x=>x.id).map(x=>x.id);
  // Never publish a brand-new project until all photos have been linked.
  const stage=uploads?(job.record?(job.record.published?'keep':'draft'):'draft'):job.body.publication_mode;
  let linked=0;
  projectUploadStatus(job.automatic?'Auto-saving project details…':'Saving project details…');
  try{
   await saveProjectStage(job,stage,existingIds);
   for(const x of job.photos){
    if(!x.file||x.id)continue;
    projectUploadStatus('Uploading photo '+(linked+1)+' of '+uploads+'…');
    x.id=await uploadProjectPhoto(x.file);
    if(x.source)x.source.id=x.id;
    projectUploadStatus('Saving photo '+(linked+1)+' of '+uploads+' to database…');
    await saveProjectStage(job,stage,job.photos.filter(p=>p.id).map(p=>p.id));
    linked++;
   }
   if(stage!==job.body.publication_mode){
    projectUploadStatus('Finalizing publication settings…');
    await saveProjectStage(job,job.body.publication_mode,job.photos.map(p=>p.id));
   }
   const notice=job.automatic?'Auto-saved project':job.body.publication_mode==='draft'?'Draft saved':'Project saved';
   projectUploadStatus(notice+' · '+job.photos.length+' photo(s) linked','success');
   success(notice+'.');
   if($('#editor').open)$('#editor').close();
   try{await loadProjects()}catch{message('Saved to database; refresh the project list to see changes.',true)}
  }catch(error){
   const detail=(error?.message||'Upload failed.')+
     (job.record?' Project saved; '+linked+' new photo(s) linked. Reopen to retry missing photos.':' No database save confirmed.');
   projectUploadStatus('Upload/save incomplete · '+detail,'error');
   if($('#editor').open)projectSaveFeedback(detail,true);
   message(detail,true);
  }finally{
   projectSaveJob=null;$('#save-project').disabled=false;
   if($('#editor').open)updatePublicationFields();
  }
 })();
 projectSaveJob=running;return running;
}
$('#project-form').onsubmit=e=>{
 e.preventDefault();if(projectSaveJob)return;
 try{startProjectSave(captureProjectSave(false))}
 catch(error){projectSaveFeedback(error?.message||'Hindi na-save ang project.',true)}
};
// A tab/browser exit cannot continue FileReader and fetch: warn the user.
window.addEventListener('beforeunload',e=>{
 if(!projectSaveJob)return;
 e.preventDefault();e.returnValue='';
});
async function loadUsers(){const b=await api('./api/users');$('#users-list').innerHTML=b.users.map(u=>`<article class="manage-row"><div><h3>${esc(u.name)}</h3><p>${esc(u.email)}</p><span>${roleText[u.role]}${u.role==='sk'?' · '+esc(({kagawad:'SK Kagawad',treasurer:'SK Treasurer',secretary:'SK Secretary'})[u.position]||'SK Kagawad'):''}</span></div>${u.role==='chairman'?'<span class="badge-inline">Chairman</span>':`<form class="role-form" data-user="${esc(u.id)}"><label>Role para kay ${esc(u.name)}<select name="role"><option value="youth" ${u.role==='youth'?'selected':''}>Walang SK access</option><option value="sk" ${u.role==='sk'?'selected':''}>SK Officer</option></select></label><button class="secondary">Save Access</button><label>Designation<select name="position"><option value="kagawad" ${u.position==='kagawad'?'selected':''}>SK Kagawad</option><option value="treasurer" ${u.position==='treasurer'?'selected':''}>SK Treasurer</option><option value="secretary" ${u.position==='secretary'?'selected':''}>SK Secretary</option></select></label><button type="button" data-save-position="${esc(u.id)}" class="secondary">Save Position</button></form>`}</article>`).join('')}
$('#users-list').onclick=async e=>{const btn=e.target.closest('[data-save-position]');if(!btn)return;const form=btn.closest('form');btn.disabled=true;try{await api('./api/users/'+btn.dataset.savePosition+'/position',{method:'PUT',body:JSON.stringify({position:form.elements.position.value})});success('Matagumpay na na-update ang posisyon ng SK officer.');await loadUsers()}catch(error){message(error.message,true)}finally{btn.disabled=false}};
$('#users-list').onsubmit=async e=>{e.preventDefault();const form=e.target,b=form.querySelector('button');b.disabled=true;try{await api('./api/users/'+form.dataset.user+'/role',{method:'PUT',body:JSON.stringify({role:form.elements.role.value})});success('Matagumpay na na-update ang SK account access.');await loadUsers()}catch(error){message(error.message,true)}finally{b.disabled=false}};
const actions={
 account_registered:'Nag-register ng account',chairman_provisioned:'Na-set up ang SK Chairman account',
 account_created:'Gumawa ng SK officer account',password_changed:'Nagpalit ng password',
 image_uploaded:'Nag-upload ng larawan',project_created:'Gumawa ng proyekto',
 project_updated:'Nag-edit ng proyekto',role_changed:'Nagbago ng account role',
 position_changed:'Binago ang posisyon ng SK officer',budget_updated:'Nag-update ng SK budget',
 monthly_update:'Nag-save ng monthly report',official_updated:'Nag-update ng SK directory',
 official_removed:'Nag-alis ng SK official',duty_status_changed:'Binago ang office status',
 google_login:'Nag-login gamit ang Google',google_account_linked:'Ikinonekta ang Google account',
 password_reset:'Nag-reset ng password',email_changed:'Nagpalit ng email',
 project_gallery_updated:'Nag-update ng mga larawan ng proyekto',
 project_progress_updated:'Nag-update ng progreso ng proyekto',
 project_deleted:'Nag-delete ng proyekto'
};
function auditDetails(event){
 let d=event.details;
 if(typeof d==='string'){try{d=JSON.parse(d)}catch{return 'Hindi available ang detalye ng lumang activity.';}}
 if(!d||typeof d!=='object'||Array.isArray(d))return 'Walang karagdagang detalye para sa activity na ito.';
 const name=v=>String(v??'').trim();
 const title=name(d.title);
 const progress=v=>Number.isFinite(Number(v))?Number(v)+'%':'hindi nakasaad';
 const number=v=>Number.isInteger(Number(v))&&Number(v)>=0?Number(v):null;
 if(event.action==='project_gallery_updated'){
  const count=number(d.image_count);
  return count===null?'Na-update ang mga larawan ng proyekto.':
    count===0?'Tinanggal ang lahat ng larawan sa project gallery.':
    count+' '+(count===1?'larawan':'larawan')+' ang naka-save sa project gallery. Ang unang larawan ang cover photo.';
 }
 if(event.action==='image_uploaded')return 'Matagumpay na na-upload ang larawan sa project storage.';
 if(event.action==='project_progress_updated')
  return (title?'Proyekto: '+title+'\n':'')+'Progreso: '+progress(d.before_progress)+' → '+progress(d.after_progress)+'\nStatus: '+name(d.before_status||'—')+' → '+name(d.after_status||'—');
 if(event.action==='project_deleted')
  return 'Na-delete ang proyekto'+(title?': '+title:'')+'.'+(number(d.gallery_count)!==null?'\nDating bilang ng naka-link na larawan: '+number(d.gallery_count):'');
 if(event.action==='password_changed'||event.action==='password_reset')
  return 'Naitala ang pagbabago sa password. Hindi inilalagay ang mismong password sa Activity Log.';
 if(event.action==='duty_status_changed')
  return d.mode==='closed'?'Manu-manong minarkahang sarado ang SK office.':'Ibinalik sa automatic office schedule ang status.';
 if(event.action==='role_changed')
  return 'Account: '+name(d.name||'SK officer')+'\nAccess: '+name(d.before||'—')+' → '+name(d.after||'—');
 if(event.action==='project_created'||event.action==='project_updated'){
  const lines=title?['Proyekto: '+title]:[];
  if(d.status)lines.push('Status: '+name(d.status));
  if(d.progress!==undefined)lines.push('Progreso: '+progress(d.progress));
  if(d.after&&typeof d.after==='object'){
   const before=d.before&&typeof d.before==='object'?d.before:{};
   for(const [key,label] of Object.entries({title:'Pamagat',category:'Kategorya',status:'Status',progress:'Progreso',published:'Public visibility'})){
    if(Object.hasOwn(d.after,key)&&d.after[key]!==before[key]){
     const formatted=x=>key==='progress'?progress(x):key==='published'?(x?'Published':'Draft'):name(x||'—');
     lines.push(label+': '+formatted(before[key])+' → '+formatted(d.after[key]));
    }
   }
  }
  if(lines.length)return lines.join('\n');
 }
 if(event.action==='account_created'){
  return d.name?'Nagawa ang SK officer account para kay '+name(d.name)+'.':'Naitala ang paglikha ng SK officer account.';
 }
 if(event.action==='email_changed')return 'Naitala ang pagbabago ng email address.';
 const labels={image_count:'Bilang ng larawan',gallery_count:'Bilang ng larawan',title:'Proyekto',name:'Pangalan',status:'Status',progress:'Progreso',position:'Posisyon',mode:'Office status',month:'Buwan',year:'Taon',published:'Public visibility'};
 const safe=Object.entries(d).filter(([k,v])=>Object.hasOwn(labels,k)&&v!==null&&typeof v!=='object')
  .map(([k,v])=>labels[k]+': '+(typeof v==='boolean'?(v?'Oo':'Hindi'):String(v)));
 return safe.length?safe.join('\n'):'Walang karagdagang detalye para sa activity na ito.';
}
async function loadAudit(){
 const data=await api('./api/audit?offset='+auditOffset);
 auditTotal=Number(data.total)||0;
 $('#audit-list').innerHTML=(data.events||[]).map(event=>{
  const actor=event.actor_name||'Unknown account';
  const action=actions[event.action]||String(event.action||'Unknown activity').replace(/_/g,' ');
  const ip=typeof event.ip_address==='string'&&event.ip_address?event.ip_address.replace(/\/(?:32|128)$/,''):'Hindi naitala';
  return '<article class="audit-row"><div><b>'+esc(actor)+'</b> · '+esc(action)+'</div>'+
   '<small>'+esc(dateText(event.created))+' PHT · Record #'+esc(event.id)+'</small>'+
   '<small class="audit-ip">IP address: '+esc(ip)+'</small>'+
   '<details class="audit-more"><summary>Tingnan ang detalye</summary><div class="audit-detail-text">'+esc(auditDetails(event))+'</div></details></article>';
 }).join('')||'<p>Wala pang activity.</p>';
 $('#audit-page').textContent=(auditTotal?auditOffset+1:0)+'–'+Math.min(auditOffset+50,auditTotal)+' / '+auditTotal;
 $('#audit-prev').disabled=auditOffset===0;
 $('#audit-next').disabled=auditOffset+50>=auditTotal;
}
$('#audit-prev').onclick=async()=>{auditOffset=Math.max(0,auditOffset-50);try{await loadAudit()}catch(e){message(e.message,true)}};$('#audit-next').onclick=async()=>{auditOffset+=50;try{await loadAudit()}catch(e){message(e.message,true)}};
const pendingHash=new URLSearchParams(location.hash.slice(1));
const emailVerifyToken=pendingHash.get('verify_email'),passwordResetToken=pendingHash.get('reset');
if(emailVerifyToken||passwordResetToken)history.replaceState(null,'',location.pathname+location.search);
checkRecoveryAvailability();
if(passwordResetToken)showRecovery('reset',passwordResetToken);
api('./api/me').then(async b=>{
 user=b.user;
 if(passwordResetToken){user=null;syncWorkspaceMode();return;}
 await showDashboard();
 if(googleSuccess&&user){history.replaceState(null,'',location.pathname+location.hash);success('Matagumpay ang pag-login gamit ang Google. Welcome back, '+(user.name||'SK Officer')+'!');}
 if(emailVerifyToken)await verifyEmailFromLink(emailVerifyToken);
}).catch(e=>{
 user=null;syncWorkspaceMode();
 if(!recoveryMode)$('#auth').hidden=false;
 if(emailVerifyToken)verifyEmailFromLink(emailVerifyToken);
 else if(!recoveryMode)message(e.message,true);
});

$('#create-officer').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const b=await api('./api/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});const note=$('#new-credentials');note.hidden=false;note.innerHTML='<b>Na-create ang SK account.</b><p>Email: '+esc(b.user.email)+'</p><p>Temporary password: <code>'+esc(b.temporaryPassword)+'</code></p><small>Ibigay nang pribado. Isang beses lang ipinapakita rito ang password.</small><button type="button" class="secondary" id="dismiss-credentials">Itago ang password</button>';$('#dismiss-credentials').onclick=()=>{note.replaceChildren();note.hidden=true};e.target.reset();success('Matagumpay na nagawa ang SK officer account. Ibigay nang pribado ang temporary password.');await loadUsers()})};


const dutyNames=[['gel bergonio'],['ernest bragais','kristine de ocampo'],['sherwin estanislao'],['rembert natividad'],['arvin capiral'],['kath irag'],['roland reyes']];
let dutyReadSequence=0,dutyMutationBusy=false,liveAssignedNames=null;
async function refreshStaffDutyRoster(){
 try{
  const res=await api('./api/officer-profiles');
  if(res?.managed===true&&Array.isArray(res.profiles)){
   liveAssignedNames=Array.from({length:7},(_,index)=>res.profiles
     .filter(p=>Array.isArray(p.duty_days)&&p.duty_days.includes(index+1))
     .map(p=>String(p.name||'').trim().toLocaleLowerCase()));
  }else liveAssignedNames=null;
 }catch{liveAssignedNames=null;}
}

function manilaDutyDay(){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Manila',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date()).map(p=>[p.type,p.value]));
 return {index:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday),
  date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),minute:Number(parts.minute)};
}
// UI visibility never grants privileges: the server RPC repeats the duty/role check.
function canManageDutyToday(actor,dayIndex){
 if(!actor||actor.mustChange)return false;
 if(actor.role==='chairman')return true; // Chairman retains emergency override.
 return actor.role==='sk'&&((typeof liveAssignedNames!=='undefined'&&liveAssignedNames)||dutyNames)[dayIndex]?.includes(
  String(actor.name||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()
 )===true;
}
function setDutyBadge(state,label){
 $('#duty-mode-badge').dataset.state=state;
 $('#duty-mode-text').textContent=label;
}
async function updateDutyControls(){
 const ticket=++dutyReadSequence;
 if(typeof refreshStaffDutyRoster==='function')await refreshStaffDutyRoster();
 if(ticket!==dutyReadSequence)return;
 const box=$('#duty-controls'),d=manilaDutyDay();
 const visible=activeStaffTab==='overview'&&canManageDutyToday(user,d.index);
 box.hidden=!visible;
 if(!visible)return;
 const info=$('#duty-control-info'),closed=$('#duty-set-closed'),
  auto=$('#duty-set-auto'),retry=$('#duty-retry');
 const roster=typeof days!=='undefined'&&Array.isArray(days)?days[d.index]:null;
 const names=typeof liveAssignedNames!=='undefined'&&liveAssignedNames?liveAssignedNames[d.index]:roster?.names||dutyNames[d.index];
 const assigned=names?.length?names.join(' · '):'Walang nakatalagang SK officer';
 $('#duty-assigned-name').textContent=assigned;
 $('#duty-control-date').textContent='Ngayong araw · '+new Intl.DateTimeFormat('fil-PH',{
  timeZone:'Asia/Manila',weekday:'long',month:'long',day:'numeric',year:'numeric'
 }).format(new Date());
 closed.disabled=true;auto.disabled=true;retry.hidden=true;
 setDutyBadge('checking','Checking…');
 info.textContent='Sinusuri ang live office status para sa '+d.date+'…';
 try{
  const result=await api('./api/duty-status');
  // Ignore older requests after navigation, user change or a Manila day rollover.
  if(ticket!==dutyReadSequence||activeStaffTab!=='overview'||!canManageDutyToday(user,manilaDutyDay().index)||manilaDutyDay().date!==d.date)return;
  if(!['auto','closed'].includes(result.mode)||(result.date&&result.date!==d.date))
   throw Error('Invalid SK Duty status response.');
  const opens=/^([01]\d|2[0-3]):[0-5]\d$/.test(result.open_time||'')?result.open_time:'09:00';
  const closes=/^([01]\d|2[0-3]):[0-5]\d$/.test(result.close_time||'')?result.close_time:'18:00';
  const minutes=t=>{const [hour,minute]=t.split(':').map(Number);return hour*60+minute;};
  const readable=t=>{const [hour,minute]=t.split(':').map(Number);return (hour%12||12)+':'+String(minute).padStart(2,'0')+' '+(hour<12?'AM':'PM');};
  const present=d.hour*60+d.minute;
  const hoursOpen=present>=minutes(opens)&&present<minutes(closes);
  const manualClosed=result.mode==='closed';
  const open=!manualClosed&&hoursOpen;
  setDutyBadge(open?'open':'closed',open?'Office Open':'Office Closed');
  info.textContent=manualClosed
   ?'Manually marked Closed for today. The public SK Duty page also reflects this status.'
   :hoursOpen
    ?'Automatic Schedule · Open ngayon mula '+readable(opens)+' hanggang '+readable(closes)+' (PHT).'
    :present<minutes(opens)
     ?'Automatic Schedule · Sarado pa ang opisina. Magbubukas ng '+readable(opens)+' (PHT).'
     :'Automatic Schedule · Tapos na ang office hours. Sarado mula '+readable(closes)+' (PHT).';
  if(user.role==='chairman')$('#admin-office').textContent=open?'Open':manualClosed?'Manually closed':'Closed · Auto';
  retry.hidden=true;
  closed.disabled=dutyMutationBusy||manualClosed;
  auto.disabled=dutyMutationBusy||result.mode==='auto';
 }catch(e){
  if(ticket!==dutyReadSequence||activeStaffTab!=='overview')return;
  // Failed status reads NEVER authorize a status change or claim verification.
  info.textContent='Hindi ma-verify ang live office status. Retry muna bago gumawa ng pagbabago.';
  setDutyBadge('unknown','Status unavailable');
  closed.disabled=true;auto.disabled=true;retry.hidden=false;
  if(user?.role==='chairman')$('#admin-office').textContent='Hindi ma-load';
 }
}
async function setDutyMode(mode){
 const buttons=['#duty-set-closed','#duty-set-auto'].map(s=>$(s));
 if(activeStaffTab!=='overview'||!canManageDutyToday(user,manilaDutyDay().index))return;
 if(!['closed','auto'].includes(mode))return;
 if(buttons.some(b=>!b)||buttons.find(b=>b.id==='duty-set-'+mode)?.disabled)return;
 if(dutyMutationBusy)return;
 dutyMutationBusy=true;
 buttons.forEach(b=>b.disabled=true);
 try{
  const result=await api('./api/duty-status',{method:'POST',body:JSON.stringify({mode})});
  if(result.mode!==mode||result.date&&result.date!==manilaDutyDay().date)
   throw Error('Hindi nakumpirma ang bagong SK Duty status.');
  success(mode==='closed'?'Matagumpay na na-set ang SK Office bilang Closed ngayong araw.':'Matagumpay na naibalik ang automatic SK Duty schedule.');
 }catch(e){message(e.message,true)}
 finally{dutyMutationBusy=false;await updateDutyControls()}
}
$('#duty-retry').onclick=updateDutyControls;
$('#duty-set-closed').onclick=()=>setDutyMode('closed');
$('#duty-set-auto').onclick=()=>setDutyMode('auto');
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user&&activeStaffTab==='overview')updateDutyControls()});
// Office opening, 6 PM closing and duty rotations update even without reload.
setInterval(()=>{if(!document.hidden&&user&&!user.mustChange&&activeStaffTab==='overview')updateDutyControls()},60000);


/* Annual finance, monthly accomplishments and official-directory editors */
let transparencyCache=null;
const transMoney=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v));
const transYearNow=()=>Number(new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date()));
const transMonthNow=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:'Asia/Manila'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return p.year+'-'+p.month};
const canEditFinance=()=>user&&(user.role==='chairman'||user.position==='treasurer');
function fillMonthlyProjects(){
 const select=$('#trans-month-project');
 const current=select.value;
 select.innerHTML=managed.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title)+(p.published?'':' (draft)')+'</option>').join('');
 if(managed.some(p=>p.id===current))select.value=current;
}
let rosterPhotoId=null,rosterPhotoFile=null,rosterPhotoPreviewURL=null,rosterProfilesReady=false;
let rosterProfiles=new Map();
function legacyOfficerPortrait(name,position){
 const legacyRoles={chairman:'SK Chairman',treasurer:'SK Treasurer',secretary:'SK Secretary',kagawad:'SK Kagawad'};
 if(typeof days==='undefined'||!Array.isArray(days)||!name)return null;
 const normal=str=>String(str||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 for(const day of days){
  const index=day.names.findIndex((candidate,i)=>normal(candidate)===normal(name)&&day.roles[i]===legacyRoles[position]);
  if(index<0)continue;
  return {file:day.file,crop:day.names.length>1?(index===0?'portrait-left':'portrait-right'):'portrait-single'};
 }
 return null;
}
function rosterPhotoPreview(){
 const target=$('#roster-photo-preview');
 if(rosterPhotoPreviewURL){URL.revokeObjectURL(rosterPhotoPreviewURL);rosterPhotoPreviewURL=null;}
 if(rosterPhotoFile)rosterPhotoPreviewURL=URL.createObjectURL(rosterPhotoFile);
 const form=$('#roster-form').elements;
 const legacy=(!rosterPhotoPreviewURL&&!rosterPhotoId)?legacyOfficerPortrait(form.name.value,form.position.value):null;
 const source=rosterPhotoPreviewURL||(rosterPhotoId?'./api/officer-images/'+encodeURIComponent(rosterPhotoId):null);
 target.className='roster-photo-preview'+(legacy?' roster-legacy-portrait '+legacy.crop:'');
 target.innerHTML=source?'<img src="'+esc(source)+'" alt="Profile photo ni '+esc(form.name.value)+'">':
  legacy?'<span class="roster-photo-placeholder" aria-hidden="true">SK</span><img src="./duty/'+encodeURIComponent(legacy.file)+'.jpg" alt="Existing poster portrait ni '+esc(form.name.value)+'">':
  '<span class="roster-photo-placeholder" aria-hidden="true">SK</span>';
 const note=$('#roster-photo-source');
 if(note)note.textContent=rosterPhotoFile?'New photo (preview before saving)':rosterPhotoId?'Saved profile photo':legacy?'Current photo from existing SK Duty poster (not yet an individual uploaded photo)':'No profile photo yet';
}
function resetRosterProfile(){
 rosterPhotoId=null;rosterPhotoFile=null;$('#roster-photo-file').value='';
 document.querySelectorAll('#roster-duty-days input').forEach(i=>{i.checked=false;});
 rosterPhotoPreview();
}
function loadRosterProfile(item){
 resetRosterProfile();
 rosterPhotoId=item.photo_id||null;
 const days=Array.isArray(item.duty_days)?item.duty_days:[];
 document.querySelectorAll('#roster-duty-days input').forEach(i=>{i.checked=days.includes(Number(i.value));});
 rosterPhotoPreview();
}
$('#roster-photo-file').addEventListener('change',e=>{
 const photo=e.target.files?.[0]||null;
 if(!photo)return;
 if(photo.size<1||photo.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(photo.type)){
  e.target.value='';message('JPEG, PNG o WebP lamang, maximum 5 MB.',true);return;
 }
 rosterPhotoFile=photo;rosterPhotoPreview();
});
$('#roster-photo-clear').onclick=()=>{rosterPhotoFile=null;rosterPhotoId=null;$('#roster-photo-file').value='';rosterPhotoPreview();};
$('#roster-form').elements.name.addEventListener('input',()=>{if(!rosterPhotoFile&&!rosterPhotoId)rosterPhotoPreview()});
$('#roster-form').elements.position.addEventListener('change',()=>{if(!rosterPhotoFile&&!rosterPhotoId)rosterPhotoPreview()});
async function refreshRosterProfiles(){
 try{
  const res=await api('./api/officer-profiles/manage');
  rosterProfiles=new Map((res.profiles||[]).map(p=>[p.id,p]));rosterProfilesReady=true;
  $('#roster-profile-message').textContent='Profile photos at weekly duty assignments are ready. Chairman approval is required to publish.';
 }catch(err){
  rosterProfiles=new Map();rosterProfilesReady=false;
  $('#roster-profile-message').textContent='Profile photo at duty editing ay unavailable hangga\'t hindi naka-apply ang database migration. Maaari pa ring mag-edit ng basic officer details.';
 }
}
async function loadTransparencyEditor(tab){
 const budget=$('#budget-form'),monthly=$('#monthly-form');
 if(!budget.elements.year.value)budget.elements.year.value=String(transYearNow());
 if(!monthly.elements.month.value)monthly.elements.month.value=transMonthNow();
 if(tab==='monthly'&&!managed.length)await loadProjects();
 fillMonthlyProjects();
 const year=tab==='budget'?Number(budget.elements.year.value):tab==='monthly'?Number(monthly.elements.month.value.slice(0,4)):transYearNow();
 const d=await api('./api/transparency/manage?year='+year);
 transparencyCache=d;
 if(tab==='budget'){
  budget.elements.amount.value=d.budget?.amount??'';
  budget.elements.reference.value=d.budget?.reference??'';
  budget.elements.published.checked=!!d.budget?.published;
  $('#budget-summary').textContent=d.budget?'Saved '+year+' annual budget: '+transMoney(d.budget.amount)+(d.budget.published?' · Published':' · Draft'):'No approved annual budget has been entered for '+year+'.';
 }
 if(tab==='monthly'){
  $('#monthly-manage-list').innerHTML=d.updates.length?d.updates.map(m=>'<article class="trans-report trans-spending"><div><strong>'+esc(m.title)+'</strong><small>'+esc(m.month)+' · '+(m.published?'Published':'Draft')+' · '+esc(m.summary)+'</small></div><div><strong>'+(m.expense===null?'Expense not reported':transMoney(m.expense))+'</strong><button type="button" class="secondary" data-month-id="'+esc(m.id)+'">Edit</button></div></article>').join(''):'<div class="trans-empty">No monthly updates saved for '+year+' yet.</div>';
 }
 if(tab==='roster'){
  await refreshRosterProfiles();
  d.officials=d.officials.map(o=>({...o,...(rosterProfiles.get(o.id)||{})}));
  $('#roster-list').innerHTML=d.officials.length?d.officials.map(o=>'<article class="trans-report trans-spending admin-roster-row"><div class="admin-roster-ident">'+(o.photo_id?'<img class="roster-list-photo" src="./api/images/'+esc(encodeURIComponent(o.photo_id))+'" alt="Larawan ni '+esc(o.name)+'">':'<span class="roster-list-photo roster-list-photo-fallback" aria-hidden="true">SK</span>')+'<span><strong>'+esc(o.name)+'</strong><small>'+esc(({chairman:'SK Chairperson',treasurer:'SK Treasurer',secretary:'SK Secretary',kagawad:'SK Kagawad'})[o.position]||o.position)+'</small><small>'+esc((Array.isArray(o.duty_days)&&o.duty_days.length?o.duty_days.map(d=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d-1]).join(', '):'No assigned duty days'))+'</small><span class="admin-roster-state '+(o.published?'is-live':'')+'">'+(o.published?'Published':'Draft')+'</span></span></div><div class="admin-roster-actions"><button class="secondary" type="button" data-official-id="'+esc(o.id)+'">Edit</button><button class="secondary admin-remove" type="button" data-official-remove="'+esc(o.id)+'" '+(d.directory_management_v2===true?'':'disabled title="Requires approved database migration"')+' aria-label="Alisin si '+esc(o.name)+' sa SK directory">Remove</button></div></article>').join(''):'<div class="trans-empty">Wala pang managed SK officials. Maaaring kumuha ng pangalan mula sa duty schedule at i-confirm bago i-publish.</div>';
  renderDutySuggestions();
 }
}
$('#budget-form').elements.year.onchange=()=>{if(!$('#panel-budget').hidden)loadTransparencyEditor('budget').catch(e=>message(e.message,true))};
$('#monthly-form').elements.month.onchange=()=>{if(!$('#panel-monthly').hidden)loadTransparencyEditor('monthly').catch(e=>message(e.message,true))};
$('#budget-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 if(!canEditFinance())throw Error('Only the SK Chairman or Treasurer can manage finances.');
 const f=e.target.elements;
 await api('./api/transparency/budget',{method:'POST',body:JSON.stringify({year:Number(f.year.value),amount:f.amount.value,reference:f.reference.value,published:f.published.checked})});
 success('Matagumpay na na-save ang annual SK budget.');await loadTransparencyEditor('budget');
})};
$('#monthly-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 const f=e.target.elements;
 if(!f.project_id.value)throw Error('Create a project before adding monthly updates.');
 await api('./api/transparency/month',{method:'POST',body:JSON.stringify({project_id:f.project_id.value,month:f.month.value+'-01',summary:f.summary.value,expense:canEditFinance()?(f.expense.value||null):null,published:canEditFinance()&&f.published.checked})});
 success('Matagumpay na na-save ang monthly accomplishment report.');await loadTransparencyEditor('monthly');
})};
$('#monthly-manage-list').onclick=e=>{
 const btn=e.target.closest('[data-month-id]');if(!btn||!transparencyCache)return;
 const item=transparencyCache.updates.find(m=>m.id===btn.dataset.monthId);if(!item)return;
 const f=$('#monthly-form').elements;f.project_id.value=item.project_id;f.month.value=String(item.month).slice(0,7);f.summary.value=item.summary;f.expense.value=item.expense??'';f.published.checked=!!item.published;
 $('#monthly-form').scrollIntoView({behavior:'smooth',block:'center'});
};
function renderDutySuggestions(){
 const target=$('#roster-suggestions');
 if(!target)return;
 const roles={'SK Chairman':'chairman','SK Treasurer':'treasurer','SK Secretary':'secretary','SK Kagawad':'kagawad'},seen=new Set();
 const roster=[];
 if(typeof days!=='undefined')for(const d of days)for(let i=0;i<d.names.length;i++){
  const name=String(d.names[i]||'').trim(),position=roles[d.roles[i]],key=name.toLocaleLowerCase();
  if(!name||!position||seen.has(key))continue;
  seen.add(key);roster.push({name,position});
 }
 const known=new Set((transparencyCache?.officials||[]).map(o=>o.name.trim().toLocaleLowerCase()));
 target.innerHTML=roster.map(o=>'<button type="button" data-roster-name="'+esc(o.name)+'" data-roster-position="'+esc(o.position)+'" '+(known.has(o.name.toLocaleLowerCase())?'disabled title="Already in managed directory"':'')+'><span>'+esc(o.name)+'</span><small>'+esc(({chairman:'SK Chairperson',secretary:'SK Secretary',treasurer:'SK Treasurer',kagawad:'SK Kagawad'})[o.position])+'</small></button>').join('')||'<p class="muted">Walang available na duty roster.</p>';
}
$('#roster-suggestions').onclick=e=>{
 const btn=e.target.closest('[data-roster-name]');if(!btn||btn.disabled)return;
 const f=$('#roster-form').elements;
 f.id.value='';f.name.value=btn.dataset.rosterName;f.position.value=btn.dataset.rosterPosition;f.sort.value='10';f.published.checked=false;
 resetRosterProfile();
 $('#roster-form-title').textContent='Review SK Duty officer';
 rosterPhotoPreview();
 $('#roster-form').scrollIntoView({behavior:'smooth',block:'center'});f.name.focus();
};
$('#roster-form').onreset=()=>{$('#roster-form-title').textContent='Add SK official';resetRosterProfile();};
$('#roster-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 if(user?.role!=='chairman')throw Error('Only the Chairman can manage the official directory.');
 const f=e.target.elements;
 const previous=transparencyCache?.officials?.find(o=>o.id===f.id.value);
 if(previous&&previous.name.trim().toLowerCase()!==f.name.value.trim().toLowerCase()){
  throw Error('Para sa kapalit na SK officer, i-archive muna ang dating record at gumawa ng bagong officer. Huwag gamitin ang lumang larawan/history ng dating opisyal.');
 }
 const dutyDays=[...document.querySelectorAll('#roster-duty-days input:checked')].map(x=>Number(x.value));
 if(!rosterProfilesReady&&(rosterPhotoFile||dutyDays.length))throw Error('Kailangang naka-apply muna ang roster database migration bago mag-upload ng profile photo o magtakda ng duty.');
 const saved=await api('./api/transparency/official',{method:'POST',body:JSON.stringify({
  id:f.id.value||null,name:f.name.value,position:f.position.value,
  sort:Number(f.sort.value),published:f.published.checked
 })});
 if(rosterProfilesReady){
  let imageId=rosterPhotoId;
  if(rosterPhotoFile)imageId=await uploadProjectPhoto(rosterPhotoFile);
  await api('./api/officer-profiles',{method:'POST',body:JSON.stringify({
   id:saved.id,photo_id:imageId||null,duty_days:dutyDays
  })});
 }
 success('Saved SK official'+(rosterProfilesReady?', portrait and duty schedule':'')+'. '+(f.published.checked?'Published to the public directory.':'Draft only.'));
 e.target.reset();await loadTransparencyEditor('roster');
})};
$('#roster-list').onclick=async e=>{
 const remove=e.target.closest('[data-official-remove]');
 if(remove){
  if(user?.role!=='chairman'||!transparencyCache||transparencyCache.directory_management_v2!==true)return;
  const item=transparencyCache.officials.find(o=>o.id===remove.dataset.officialRemove);
  if(!item||!window.confirm('Alisin si '+item.name+' sa managed SK directory? Hindi mababago ang original SK Duty poster.'))return;
  remove.disabled=true;
  try{
   await api('./api/transparency/official/remove',{method:'POST',body:JSON.stringify({id:item.id})});
   success('Matagumpay na inalis ang SK official sa directory. Naitala ang pagbabago.');
   $('#roster-form').reset();await loadTransparencyEditor('roster');
  }catch(err){message(err.message,true)}finally{remove.disabled=false}
  return;
 }
 const btn=e.target.closest('[data-official-id]');if(!btn||!transparencyCache)return;
 const item=transparencyCache.officials.find(o=>o.id===btn.dataset.officialId);if(!item)return;
 const f=$('#roster-form').elements;f.id.value=item.id;f.name.value=item.name;f.position.value=item.position;f.sort.value=item.display_order;f.published.checked=!!item.published;
 loadRosterProfile(item);
 $('#roster-form-title').textContent='Edit SK official';
 $('#roster-form').scrollIntoView({behavior:'smooth',block:'center'});
};
