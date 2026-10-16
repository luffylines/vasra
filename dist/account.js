let user=null,managed=[],editing=null,auditOffset=0,auditTotal=0,recoveryMode=null,recoveryToken=null;
const message=(text,error=false)=>{$('#message').textContent=text;$('#message').className=error?'message error':'message'};
function syncWorkspaceMode(){
 const signedIn=!!user;
 document.body.dataset.staffMode=signedIn?'staff':'public';
 $('#staff-sidebar-footer').hidden=!signedIn;
 $('#staff-sidebar-name').textContent=signedIn?user.name||'SK Officer':'';
 $('#staff-sidebar-role').textContent=signedIn?(user.role==='chairman'?'SK CHAIRMAN':({kagawad:'SK KAGAWAD',treasurer:'SK TREASURER',secretary:'SK SECRETARY'})[user.position]||'SK OFFICER'):'';
 $('#account-breadcrumb').textContent=signedIn?'Staff Dashboard':'Aking account';
 const href=signedIn?'./account':'./';
 $('.site-header .brand').setAttribute('href',href);
 const mobileBrand=document.querySelector('.mobile-brand');
 if(mobileBrand)mobileBrand.setAttribute('href',href);
}
async function busy(form,fn){const b=form.querySelector('button[type="submit"],button.primary');if(b)b.disabled=true;try{await fn()}catch(e){message(e.message,true)}finally{if(b)b.disabled=false}}
let googleReady=false;
async function checkGoogleLogin(){
 const button=$('#google-sign-in'),note=$('#google-login-note');
 if(!button||!note)return false;
 try {
  const status=await api('./api/auth/google/status');
  googleReady=status.enabled===true;
 }catch {googleReady=false;}
 button.setAttribute('aria-describedby','google-login-note');
 note.textContent=googleReady
  ? 'Use the Google account matching your authorized SK staff email.'
  : 'Google login is not yet activated for this deployment. Email and password login remains available.';
 return googleReady;
}
$('#google-sign-in').addEventListener('click',async e=>{
 const button=e.currentTarget;
 if(button.disabled)return;
 button.disabled=true;
 try {
  if(await checkGoogleLogin())location.assign('./api/auth/google/start');
  else {
   $('#google-login-note').textContent='Google Sign-In needs activation by the SK administrator. This preview may use a different redirect URL from vasra.vercel.app.';
   $('#google-login-note').focus?.();
  }
 }finally {button.disabled=false;}
});
const googleError=new URLSearchParams(location.search).get('google_error');
if(googleError){
 history.replaceState(null,'',location.pathname+location.hash);
 message(googleError==='not_authorized'?'This Google account is not registered as SK staff. Contact your Chairman.':'Hindi natuloy ang Google login. Try again or use your password.',true);
}
checkGoogleLogin();
$('#auth-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const f=new FormData(e.target),b=await api('./api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});user=b.user;e.target.reset();message('');await showDashboard()})};
$('#logout').onclick=async()=>{try{await api('./api/logout',{method:'POST',body:'{}'});user=null;managed=[];editing=null;$('#managed-projects').replaceChildren();$('#users-list').replaceChildren();$('#new-credentials').replaceChildren();$('#new-credentials').hidden=true;$('#audit-list').replaceChildren();$('#project-form').reset();$('#editor').close();$('#password-form').reset();message('Naka-logout ka na.');await showDashboard()}catch(e){message(e.message,true)}};
$('#change-password').onclick=()=>{selectTab('settings');$('#panel-settings').scrollIntoView({behavior:'smooth',block:'start'});};
async function savePassword(form){
 const f=Object.fromEntries(new FormData(form));
 if(f.password!==f.confirm)throw Error('Hindi magkatugma ang bagong password.');
 user=(await api('./api/password',{method:'POST',body:JSON.stringify(f)})).user;
 form.reset();await showDashboard();
}
$('#password-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{await savePassword(e.target);message('Password updated successfully.');});};
$('#settings-password-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{await savePassword(e.target);await selectTab('settings');$('#settings-message').textContent='Password updated. Your session has been secured.';});};
$('#change-email-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 const payload=Object.fromEntries(new FormData(e.target));
 await api('./api/account/email/request',{method:'POST',body:JSON.stringify(payload)});
 e.target.reset();$('#settings-message').textContent='Verification link requested. Check your new email inbox (and spam folder) within 15 minutes.';
});};
let recoveryReady=false;
async function checkRecoveryAvailability(){
 try{recoveryReady=(await api('./api/account/capabilities')).ready===true;}catch{recoveryReady=false;}
 $('#forgot-password-link').disabled=false;
 $('#forgot-password-link').textContent='Forgot password?';
 $('#recovery-request-form').querySelector('button[type="submit"]').disabled=!recoveryReady;
 $('#change-email-form').querySelector('button[type="submit"]').disabled=!recoveryReady;
 $('#email-setup-note').textContent=recoveryReady
  ? 'Verification links expire after 15 minutes.'
  : 'Email verification and password recovery are awaiting secure server setup. Please contact the SK administrator.';
}
$('#forgot-password-link').onclick=()=>showRecovery('request');
$('#recovery-back').onclick=()=>{recoveryMode=null;recoveryToken=null;$('#recovery-message').textContent='';history.replaceState(null,'',location.pathname+location.search);showDashboard();};
function showRecovery(mode,token=null){
 recoveryMode=mode;recoveryToken=token;
 $('#recovery-section').hidden=false;$('#auth').hidden=true;$('#dashboard').hidden=true;$('#staff-nav').hidden=true;
 $('#recovery-request-form').hidden=mode==='reset';
 $('#recovery-reset-form').hidden=mode!=='reset';
 $('#recovery-heading').textContent=mode==='reset'?'Create a new password':'Reset your password';
 $('#recovery-description').textContent=mode==='reset'?'This secure reset link works only once and expires after 30 minutes.':'Ilagay ang account email para makatanggap ng reset link.';
 $('#recovery-message').textContent=mode==='request'&&!recoveryReady
  ? 'Password recovery by email is temporarily unavailable. Please contact the SK Chairman to recover your account.'
  : '';
 $('#recovery-section').scrollIntoView({block:'start'});
}
$('#recovery-request-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 await api('./api/account/reset/request',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
 $('#recovery-message').textContent='Kung may SK account sa email na iyon, ipapadala ang recovery instructions. Check inbox at spam.';
 e.target.reset();
});};
$('#recovery-reset-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 const data=Object.fromEntries(new FormData(e.target));
 if(data.password!==data.confirm)throw Error('Hindi magkatugma ang bagong password.');
 await api('./api/account/reset/confirm',{method:'POST',body:JSON.stringify({token:recoveryToken,password:data.password})});
 user=null;recoveryMode=null;recoveryToken=null;history.replaceState(null,'',location.pathname+location.search);
 await showDashboard();message('Password reset successful. Mag-login gamit ang iyong bagong password.');
});};
async function verifyEmailFromLink(token){
 try{
  await api('./api/account/email/confirm',{method:'POST',body:JSON.stringify({token})});
  user=null;await showDashboard();message('Verified ang bagong email. Mag-login muli gamit ang bagong address.');
 }catch(e){user=null;await showDashboard();message('Hindi ma-verify ang email. '+e.message,true);}
}
async function showDashboard(){syncWorkspaceMode();const forced=user?.mustChange;$('#recovery-section').hidden=!recoveryMode||!!user;$('#auth').hidden=!!user||!!recoveryMode;$('#logout').hidden=!user;$('#dashboard').hidden=!user||forced;$('#staff-nav').hidden=!user||forced;$('#password-section').hidden=!forced;if(!user)return;$('#current-email-label').textContent=user.email||'—';if(forced){$('#password-note').textContent='Palitan muna ang pansamantalang password bago gamitin ang dashboard.';return;}const positionLabels={kagawad:'SK KAGAWAD',treasurer:'SK TREASURER',secretary:'SK SECRETARY'};const designation=user.role==='chairman'?'SK CHAIRMAN':positionLabels[user.position]||'SK OFFICER';$('#role-label').textContent=designation+' DASHBOARD';$('#welcome').textContent='Kumusta, '+user.name+'.';$('#dashboard-description').textContent=user.role==='chairman'?'Pamamahala ng mga proyekto, SK officials, at mga ulat sa isang workspace.':user.position==='treasurer'?'Finance and project monitoring workspace.':user.position==='secretary'?'Documentation and project records workspace.':'Manage assigned SK projects and community updates.';$('#chairman-overview').hidden=true;$('#officer-overview').hidden=true;document.querySelectorAll('.chair-only').forEach(x=>x.hidden=user.role!=='chairman');document.querySelectorAll('.finance-only').forEach(x=>x.hidden=!(user.role==='chairman'||user.position==='treasurer'));const info=$('#position-info');info.hidden=user.role==='chairman';if(!info.hidden)info.textContent=user.position==='treasurer'?'Treasurer workspace: monitor project updates and documentation. Budget reports are not yet enabled.':user.position==='secretary'?'Secretary workspace: organize project records and updates. Meeting minutes are not yet enabled.':'Kagawad workspace: manage project updates. Duty status controls are coming next.';await selectTab('overview');await updateDutyControls();}
async function selectTab(name){const tabs=['overview','projects','monthly','budget','roster','users','audit','settings'];if(!tabs.includes(name))return;if(['roster','users','audit'].includes(name)&&user?.role!=='chairman')return;if(name==='budget'&&!(user?.role==='chairman'||user?.position==='treasurer'))return;for(const n of tabs){if(n!=='overview')$('#panel-'+n).hidden=n!==name;}$('#chairman-overview').hidden=!(name==='overview'&&user?.role==='chairman');$('#officer-overview').hidden=!(name==='overview'&&user?.role!=='chairman');document.querySelectorAll('#staff-nav [data-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===name);b.setAttribute('aria-current',b.dataset.tab===name?'page':'false')});try{if(name==='overview'||name==='projects')await loadProjects();if(name==='users')await loadUsers();if(name==='audit'){auditOffset=0;await loadAudit()}if(['monthly','budget','roster'].includes(name))await loadTransparencyEditor(name)}catch(e){message(e.message,true)}}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
document.querySelectorAll('[data-admin-open]').forEach(b=>b.onclick=()=>{selectTab(b.dataset.adminOpen);$('#staff-content').scrollIntoView({block:'start',behavior:'smooth'});});
async function loadProjects(){managed=(await api('./api/manage/projects')).projects;updateChairmanMetrics();$('#managed-projects').innerHTML=managed.map(p=>`<article class="manage-row"><div><span class="badge-inline">${p.published?'Published':'Draft'} · ${esc(p.status)}</span><h3>${esc(p.title)}</h3><p>Gumawa: <b>${esc(p.creator_name)}</b> · ${dateText(p.created)}</p><p>Huling edit: <b>${esc(p.editor_name)}</b> · ${dateText(p.updated)}</p></div><button class="secondary" data-edit="${esc(p.id)}">I-edit ↗</button></article>`).join('')||'<div class="empty">Wala pang proyekto. Pindutin ang “Bagong proyekto” para magsimula.</div>'}
function updateChairmanMetrics(){if(!user||user.role!=='chairman')return;$('#admin-total').textContent=String(managed.length);$('#admin-published').textContent=String(managed.filter(p=>p.published).length);$('#admin-active').textContent=String(managed.filter(p=>p.status==='Isinasagawa').length)}
function openEditor(p=null){editing=p;const f=$('#project-form');f.reset();$('#editor-message').textContent='';$('#editor-heading').textContent=p?'I-edit ang proyekto':'Bagong proyekto';if(p){for(const n of ['title','category','description','scope','status','progress'])f.elements[n].value=p[n];f.elements.published.checked=!!p.published;}$('#current-image').innerHTML=p?.image_id?`<img class="detail-photo" src="./api/images/${encodeURIComponent(p.image_id)}" alt="Kasalukuyang larawan">`:'';$('#editor').showModal()}
$('#new-project').onclick=()=>openEditor();$('#managed-projects').onclick=e=>{const b=e.target.closest('[data-edit]');if(b)openEditor(managed.find(p=>p.id===b.dataset.edit))};$('.close').onclick=()=>$('#editor').close();
$('#project-form').elements.status.onchange=e=>{if(e.target.value==='Natapos')$('#project-form').elements.progress.value=100};
$('#project-form').onsubmit=async e=>{e.preventDefault();const f=e.target;$('#save-project').disabled=true;$('#editor-message').textContent='Sine-save…';try{const b=Object.fromEntries(new FormData(f));b.progress=Number(b.progress);b.published=f.elements.published.checked;b.version=editing?.version;b.image_id=f.elements.remove_image.checked?null:editing?.image_id||null;const file=f.elements.image.files[0];if(file){if(file.size>5242880)throw Error('Hanggang 5 MB lamang ang larawan.');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('JPG, PNG, o WebP lamang.');const upload=await api('./api/uploads',{method:'POST',body:JSON.stringify({action:'begin',size:file.size,mime:file.type})});for(let index=0,start=0;start<file.size;index++,start+=upload.chunkSize){const piece=file.slice(start,start+upload.chunkSize);const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(Error('Hindi mabasa ang larawan.'));r.readAsDataURL(piece)});await api('./api/uploads',{method:'POST',body:JSON.stringify({action:'chunk',id:upload.id,index,data})});}b.image_id=(await api('./api/uploads',{method:'POST',body:JSON.stringify({action:'complete',id:upload.id})})).id;}delete b.image;delete b.remove_image;await api('./api/manage/projects'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',body:JSON.stringify(b)});$('#editor').close();message('Na-save ang proyekto at naitala sa activity log.');await loadProjects()}catch(error){$('#editor-message').textContent=error.message}finally{$('#save-project').disabled=false}};
async function loadUsers(){const b=await api('./api/users');$('#users-list').innerHTML=b.users.map(u=>`<article class="manage-row"><div><h3>${esc(u.name)}</h3><p>${esc(u.email)}</p><span>${roleText[u.role]}${u.role==='sk'?' · '+esc(({kagawad:'SK Kagawad',treasurer:'SK Treasurer',secretary:'SK Secretary'})[u.position]||'SK Kagawad'):''}</span></div>${u.role==='chairman'?'<span class="badge-inline">Chairman</span>':`<form class="role-form" data-user="${esc(u.id)}"><label>Role para kay ${esc(u.name)}<select name="role"><option value="youth" ${u.role==='youth'?'selected':''}>Walang SK access</option><option value="sk" ${u.role==='sk'?'selected':''}>SK Officer</option></select></label><button class="secondary">Save Access</button><label>Designation<select name="position"><option value="kagawad" ${u.position==='kagawad'?'selected':''}>SK Kagawad</option><option value="treasurer" ${u.position==='treasurer'?'selected':''}>SK Treasurer</option><option value="secretary" ${u.position==='secretary'?'selected':''}>SK Secretary</option></select></label><button type="button" data-save-position="${esc(u.id)}" class="secondary">Save Position</button></form>`}</article>`).join('')}
$('#users-list').onclick=async e=>{const btn=e.target.closest('[data-save-position]');if(!btn)return;const form=btn.closest('form');btn.disabled=true;try{await api('./api/users/'+btn.dataset.savePosition+'/position',{method:'PUT',body:JSON.stringify({position:form.elements.position.value})});message('SK position updated.');await loadUsers()}catch(error){message(error.message,true)}finally{btn.disabled=false}};
$('#users-list').onsubmit=async e=>{e.preventDefault();const form=e.target,b=form.querySelector('button');b.disabled=true;try{await api('./api/users/'+form.dataset.user+'/role',{method:'PUT',body:JSON.stringify({role:form.elements.role.value})});message('Na-update ang account access.');await loadUsers()}catch(error){message(error.message,true)}finally{b.disabled=false}};
const actions={account_registered:'Gumawa ng account',account_created:'Gumawa ng SK account',password_changed:'Nagpalit ng password',image_uploaded:'Nag-upload ng larawan',project_created:'Gumawa ng proyekto',project_updated:'Nag-edit ng proyekto',role_changed:'Nagbago ng account role'};
async function loadAudit(){const b=await api('./api/audit?offset='+auditOffset);auditTotal=b.total;$('#audit-list').innerHTML=b.events.map(e=>{const d=JSON.parse(e.details);const fields=['title','category','description','scope','status','progress','published','image_id'];const changes=d.after&&typeof d.after==='object'?fields.filter(k=>!d.before||d.before[k]!==d.after[k]).map(k=>`${k}: ${d.before?String(d.before[k]??'wala')+' → ':''}${String(d.after[k]??'wala')}`).join('\n'):e.action==='role_changed'?`${d.name}: ${d.before} → ${d.after}`:JSON.stringify(d);return `<article class="audit-row"><div><b>${esc(e.actor_name)}</b> · ${esc(actions[e.action]||e.action)}</div><small>${dateText(e.created)} · Record #${e.id}</small><details><summary>Tingnan ang detalye</summary><pre>${esc(changes)}</pre></details></article>`}).join('')||'<p>Wala pang activity.</p>';$('#audit-page').textContent=`${auditTotal?auditOffset+1:0}–${Math.min(auditOffset+50,auditTotal)} / ${auditTotal}`;$('#audit-prev').disabled=auditOffset===0;$('#audit-next').disabled=auditOffset+50>=auditTotal;}
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
 if(emailVerifyToken)await verifyEmailFromLink(emailVerifyToken);
}).catch(e=>{
 user=null;syncWorkspaceMode();
 if(!recoveryMode)$('#auth').hidden=false;
 if(emailVerifyToken)verifyEmailFromLink(emailVerifyToken);
 else if(!recoveryMode)message(e.message,true);
});

$('#create-officer').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const b=await api('./api/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});const note=$('#new-credentials');note.hidden=false;note.innerHTML='<b>Na-create ang SK account.</b><p>Email: '+esc(b.user.email)+'</p><p>Temporary password: <code>'+esc(b.temporaryPassword)+'</code></p><small>Ibigay nang pribado. Isang beses lang ipinapakita rito ang password.</small><button type="button" class="secondary" id="dismiss-credentials">Itago ang password</button>';$('#dismiss-credentials').onclick=()=>{note.replaceChildren();note.hidden=true};e.target.reset();await loadUsers()})};

const dutyNames=[['gel bergonio'],['ernest bragais','kristine de ocampo'],['sherwin estanislao'],['rembert natividad'],['arvin capiral'],['kath irag'],['roland reyes']];
function manilaDutyDay(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return {index:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday),date:parts.year+'-'+parts.month+'-'+parts.day};}
async function updateDutyControls(){const box=$('#duty-controls');if(!user||user.mustChange){box.hidden=true;return;}const d=manilaDutyDay(),permitted=user.role==='chairman'||(user.role==='sk'&&dutyNames[d.index]?.includes(user.name.trim().toLowerCase()));box.hidden=!permitted;if(!permitted)return;const info=$('#duty-control-info');try{const r=await api('./api/duty-status');info.textContent='Ngayong araw ('+d.date+'): '+(r.mode==='closed'?'Manually closed':'Automatic schedule · 9 AM–6 PM')+'. Ipinapakita rin ito sa public SK Duty page.';if(user.role==='chairman')$('#admin-office').textContent=r.mode==='closed'?'Manually closed':'Auto schedule';$('#duty-retry').hidden=true;$('#duty-set-closed').disabled=false;$('#duty-set-auto').disabled=false;}catch(e){info.textContent='Hindi ma-load ang kasalukuyang SK Duty status: '+e.message;$('#duty-set-closed').disabled=true;$('#duty-set-auto').disabled=true;$('#duty-retry').hidden=false;if(user.role==='chairman')$('#admin-office').textContent='Hindi ma-load';}}
async function setDutyMode(mode){const buttons=['#duty-set-closed','#duty-set-auto'].map(s=>$(s));buttons.forEach(b=>b.disabled=true);try{await api('./api/duty-status',{method:'POST',body:JSON.stringify({mode})});message(mode==='closed'?'Office marked Closed for today.':'Automatic schedule restored.');await updateDutyControls();}catch(e){message(e.message,true)}finally{buttons.forEach(b=>b.disabled=false)}}
$('#duty-retry').onclick=updateDutyControls;
$('#duty-set-closed').onclick=()=>setDutyMode('closed');
$('#duty-set-auto').onclick=()=>setDutyMode('auto');
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)updateDutyControls()});


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
  $('#roster-list').innerHTML=d.officials.length?d.officials.map(o=>'<article class="trans-report trans-spending admin-roster-row"><div><strong>'+esc(o.name)+'</strong><small>'+esc(({chairman:'SK Chairperson',treasurer:'SK Treasurer',secretary:'SK Secretary',kagawad:'SK Kagawad'})[o.position]||o.position)+'</small><span class="admin-roster-state '+(o.published?'is-live':'')+'">'+(o.published?'Published':'Draft')+'</span></div><div class="admin-roster-actions"><button class="secondary" type="button" data-official-id="'+esc(o.id)+'">Edit</button><button class="secondary admin-remove" type="button" data-official-remove="'+esc(o.id)+'" '+(d.directory_management_v2===true?'':'disabled title="Requires approved database migration"')+' aria-label="Alisin si '+esc(o.name)+' sa SK directory">Remove</button></div></article>').join(''):'<div class="trans-empty">Wala pang managed SK officials. Maaaring kumuha ng pangalan mula sa duty schedule at i-confirm bago i-publish.</div>';
  renderDutySuggestions();
 }
}
$('#budget-form').elements.year.onchange=()=>{if(!$('#panel-budget').hidden)loadTransparencyEditor('budget').catch(e=>message(e.message,true))};
$('#monthly-form').elements.month.onchange=()=>{if(!$('#panel-monthly').hidden)loadTransparencyEditor('monthly').catch(e=>message(e.message,true))};
$('#budget-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 if(!canEditFinance())throw Error('Only the SK Chairman or Treasurer can manage finances.');
 const f=e.target.elements;
 await api('./api/transparency/budget',{method:'POST',body:JSON.stringify({year:Number(f.year.value),amount:f.amount.value,reference:f.reference.value,published:f.published.checked})});
 message('Annual SK budget saved.');await loadTransparencyEditor('budget');
})};
$('#monthly-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 const f=e.target.elements;
 if(!f.project_id.value)throw Error('Create a project before adding monthly updates.');
 await api('./api/transparency/month',{method:'POST',body:JSON.stringify({project_id:f.project_id.value,month:f.month.value+'-01',summary:f.summary.value,expense:canEditFinance()?(f.expense.value||null):null,published:canEditFinance()&&f.published.checked})});
 message('Monthly accomplishment saved.');await loadTransparencyEditor('monthly');
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
 $('#roster-form-title').textContent='Review SK Duty officer';
 $('#roster-form').scrollIntoView({behavior:'smooth',block:'center'});f.name.focus();
};
$('#roster-form').onreset=()=>{$('#roster-form-title').textContent='Add SK official'};
$('#roster-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 if(user?.role!=='chairman')throw Error('Only the Chairman can manage the official directory.');
 const f=e.target.elements;
 await api('./api/transparency/official',{method:'POST',body:JSON.stringify({id:f.id.value||null,name:f.name.value,position:f.position.value,sort:Number(f.sort.value),published:f.published.checked})});
 message('SK official saved. Published records will appear in Youth Leaders.');e.target.reset();$('#roster-form-title').textContent='Add SK official';await loadTransparencyEditor('roster');
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
   message('Inalis sa public SK directory. Naitala ang pagbabago.');
   $('#roster-form').reset();await loadTransparencyEditor('roster');
  }catch(err){message(err.message,true)}finally{remove.disabled=false}
  return;
 }
 const btn=e.target.closest('[data-official-id]');if(!btn||!transparencyCache)return;
 const item=transparencyCache.officials.find(o=>o.id===btn.dataset.officialId);if(!item)return;
 const f=$('#roster-form').elements;f.id.value=item.id;f.name.value=item.name;f.position.value=item.position;f.sort.value=item.display_order;f.published.checked=!!item.published;
 $('#roster-form-title').textContent='Edit SK official';
 $('#roster-form').scrollIntoView({behavior:'smooth',block:'center'});
};
