'use strict';
// Chairman-only schedule editor; names, positions and photos originate in SK Officials.
const dutyManageWeekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const dutyManageShort=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let dutyManageDay=1,dutyManageHours=[],dutyManageProfiles=[],dutyManagerReady=false,dutyManagerLoading=false;
const dutyManageRole={chairman:'SK Chairperson',kagawad:'SK Kagawad',secretary:'SK Secretary',treasurer:'SK Treasurer'};
function dutyManagePhoto(profile){
 const legacy=typeof legacyOfficerPortrait==='function'?legacyOfficerPortrait(profile.name,profile.position):null;
 const image=profile.photo_id?'./api/officer-images/'+encodeURIComponent(profile.photo_id):
  legacy?'./duty/'+encodeURIComponent(legacy.file)+'.jpg':null;
 const cls=legacy&&!profile.photo_id?' duty-manager-legacy '+legacy.crop:'';
 const initials=String(profile.name||'').trim().split(/\s+/).slice(0,2).map(n=>n[0]||'').join('').toUpperCase()||'SK';
 return '<span class="duty-manager-avatar'+cls+'"><span aria-hidden="true">'+esc(initials)+'</span>'+
  (image?'<img loading="lazy" src="'+esc(image)+'" alt="Larawan ni '+esc(profile.name)+'">':'')+'</span>';
}
function renderDutyManageDay(){
 const day=dutyManageDay;
 $('#duty-manage-day-label').textContent=dutyManageWeekdays[day-1]+' duty';
 const record=dutyManageHours.find(d=>d.weekday===day)||{};
 $('#duty-manage-opens').value=record.open_time||'09:00';
 $('#duty-manage-closes').value=record.close_time||'18:00';
 const target=$('#duty-manage-officers');
 const available=dutyManageProfiles.filter(p=>p.published);
 target.innerHTML=available.length?available.map(p=>
  '<label class="duty-manager-officer"><input type="checkbox" data-duty-officer="'+esc(p.id)+'" '+
   (Array.isArray(p.duty_days)&&p.duty_days.includes(day)?'checked':'')+'>'+
   dutyManagePhoto(p)+'<span><strong>'+esc(p.name)+'</strong><small>'+esc(dutyManageRole[p.position]||'SK Officer')+
   '</small></span></label>'
 ).join(''):'<p class="muted">No published officials yet. Add and publish officers under SK Officials first.</p>';
 // Missing photos must retain a readable initials fallback.
 target.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true},{once:true}));
 $('#duty-manage-week').querySelectorAll('[data-duty-day]').forEach(b=>{
  b.classList.toggle('selected',Number(b.dataset.dutyDay)===day);
  b.setAttribute('aria-pressed',String(Number(b.dataset.dutyDay)===day));
 });
 $('#duty-manage-edit-official').disabled=!available.length;
}
function renderDutyManageWeek(){
 $('#duty-manage-week').innerHTML=dutyManageWeekdays.map((name,i)=>{
  const day=i+1,record=dutyManageHours.find(d=>d.weekday===day)||{};
  const count=dutyManageProfiles.filter(p=>p.published&&p.duty_days?.includes(day)).length;
  return '<button type="button" data-duty-day="'+day+'" aria-pressed="false" class="duty-manager-weekday">'+
   '<strong>'+dutyManageShort[i]+'</strong><small>'+esc(record.open_time||'09:00')+'–'+esc(record.close_time||'18:00')+
   '</small><small>'+count+' assigned</small></button>';
 }).join('');
 renderDutyManageDay();
}
async function loadDutyManagement(){
 if(user?.role!=='chairman'||dutyManagerLoading)return;
 dutyManagerLoading=true;
 const state=$('#duty-manage-status'),form=$('#duty-manage-form');
 form.querySelector('button[type="submit"]').disabled=true;
 try{
  state.textContent='Checking saved SK duty roster and approved office hours…';
  const [sched,roster]=await Promise.all([
   api('./api/duty-schedule/manage'),
   api('./api/officer-profiles/manage')
  ]);
  dutyManageHours=Array.isArray(sched.days)?sched.days:[];
  dutyManageProfiles=Array.isArray(roster.profiles)?roster.profiles:[];
  dutyManagerReady=dutyManageHours.length===7;
  state.textContent=dutyManagerReady?'Schedule loaded. All changes are logged; save only officially approved duty hours.':
   'Duty hours database setup is incomplete. Check staged Supabase migrations.';
  renderDutyManageWeek();
  form.querySelector('button[type="submit"]').disabled=!dutyManagerReady;
 }catch(err){
  dutyManagerReady=false;dutyManageProfiles=[];dutyManageHours=[];
  state.textContent='SK Duty Management is waiting for the approved database migrations. '+(err?.message||'');
  $('#duty-manage-week').innerHTML='<p class="muted">Existing public duty posters remain unchanged until activation.</p>';
  $('#duty-manage-officers').innerHTML='<p class="muted">No saved profile data is available in this preview yet.</p>';
 }finally{dutyManagerLoading=false;}
}
$('#duty-manage-week').addEventListener('click',e=>{
 const button=e.target.closest('[data-duty-day]');if(!button||!dutyManagerReady)return;
 dutyManageDay=Number(button.dataset.dutyDay);renderDutyManageDay();
});
$('#duty-manage-edit-official').addEventListener('click',async()=>{
 const checked=[...document.querySelectorAll('#duty-manage-officers [data-duty-officer]:checked')];
 const id=checked[0]?.dataset.dutyOfficer;
 await selectTab('roster');
 if(id){
  const button=[...document.querySelectorAll('#roster-list [data-official-id]')].find(b=>b.dataset.officialId===id);
  if(button){button.click();return;}
 }
 $('#roster-form').scrollIntoView({behavior:'smooth',block:'center'});
});
$('#duty-manage-form').addEventListener('submit',e=>{
 e.preventDefault();busy(e.target,async()=>{
  if(user?.role!=='chairman'||!dutyManagerReady)throw Error('Chairman approval and roster migration required.');
  const open=$('#duty-manage-opens').value,close=$('#duty-manage-closes').value;
  if(!open||!close||open>=close)throw Error('Set a valid office opening time before closing time.');
  const ids=[...document.querySelectorAll('#duty-manage-officers input:checked')].map(i=>i.dataset.dutyOfficer);
  const day=dutyManageDay;
  await api('./api/duty-schedule',{method:'POST',body:JSON.stringify({weekday:day,open_time:open,close_time:close,official_ids:ids})});
  success('Saved '+dutyManageWeekdays[day-1]+' duty hours and assigned officers. Changes will reflect on the public SK Duty page.');
  await loadDutyManagement();
 });
});
