'use strict';
// SK Duty records use a separate duty_photo_id and exactly one duty day.
// Organizational Structure photos and positions remain in SK Officials.
const dutyManageWeekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const dutyManageShort=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let dutyManageDay=1,dutyManageHours=[],dutyManageProfiles=[],dutyManagerReady=false,dutyManagerLoading=false;
const dutyManageSaving=new Set();
const dutyManageRole={chairman:'SK Chairperson',kagawad:'SK Kagawad',secretary:'SK Secretary',treasurer:'SK Treasurer'};
function dutyManagePhoto(profile){
 const legacy=typeof legacyOfficerPortrait==='function'?legacyOfficerPortrait(profile.name,profile.position):null;
 const image=profile.duty_photo_id?'./api/officer-images/'+encodeURIComponent(profile.duty_photo_id):
  legacy?'./duty/'+encodeURIComponent(legacy.file)+'.jpg':null;
 const cls=legacy&&!profile.duty_photo_id?' duty-manager-legacy '+legacy.crop:'';
 const initials=String(profile.name||'').trim().split(/\s+/).slice(0,2).map(n=>n[0]||'').join('').toUpperCase()||'SK';
 return '<span class="duty-manager-avatar'+cls+'"><span aria-hidden="true">'+esc(initials)+'</span>'+
  (image?'<img loading="eager" src="'+esc(image)+'" alt="SK Duty photo ni '+esc(profile.name)+'">':'')+'</span>';
}
function dutyManageFormat(time){
 const [h,m]=String(time||'09:00').split(':').map(Number);
 return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM');
}
function renderDutyManageDay(){
 const d=dutyManageHours.find(x=>x.weekday===dutyManageDay)||{};
 $('#duty-manage-day-label').textContent=dutyManageWeekdays[dutyManageDay-1]+' office hours';
 $('#duty-manage-opens').value=d.open_time||'09:00';
 $('#duty-manage-closes').value=d.close_time||'18:00';
 $('#duty-manage-week').querySelectorAll('[data-duty-day]').forEach(b=>{
  b.classList.toggle('selected',Number(b.dataset.dutyDay)===dutyManageDay);
  b.setAttribute('aria-pressed',String(Number(b.dataset.dutyDay)===dutyManageDay));
 });
}
function renderDutyManageWeek(){
 $('#duty-manage-week').innerHTML=dutyManageWeekdays.map((d,i)=>{
  const weekday=i+1,h=dutyManageHours.find(x=>x.weekday===weekday)||{};
  const count=dutyManageProfiles.filter(p=>p.published&&p.duty_days?.includes(weekday)).length;
  return '<button type="button" data-duty-day="'+weekday+'" aria-pressed="'+(weekday===dutyManageDay)+'" class="duty-manager-weekday">'+
   '<strong>'+dutyManageShort[i]+'</strong><small>'+dutyManageFormat(h.open_time||'09:00')+'–'+dutyManageFormat(h.close_time||'18:00')+
   '</small><small>'+count+' assigned</small></button>';
 }).join('');
 renderDutyManageDay();
}
function renderDutyManageOfficers(){
 const people=dutyManageProfiles.filter(p=>p.published);
 $('#duty-manage-officers').innerHTML=people.length?people.map(p=>{
  const day=p.duty_days?.[0]||0;
  const choices='<option value="0"'+(day===0?' selected':'')+'>Not assigned</option>'+
   dutyManageWeekdays.map((n,i)=>'<option value="'+(i+1)+'"'+(day===i+1?' selected':'')+'>'+n+'</option>').join('');
  return '<article class="duty-manager-officer-card" data-duty-profile="'+esc(p.id)+'">'+
   dutyManagePhoto(p)+'<div class="duty-manager-person"><strong>'+esc(p.name)+'</strong>'+
   '<small>'+esc(dutyManageRole[p.position]||'SK Officer')+'</small>'+
   '<label>Duty day (one only)<select data-duty-day-for="'+esc(p.id)+'" aria-label="Assigned day of '+esc(p.name)+'">'+choices+'</select></label>'+
   '<label class="duty-manager-photo-label">Replace SK Duty photo<input type="file" accept="image/png,image/jpeg,image/webp" data-duty-photo-for="'+esc(p.id)+'"></label>'+
   '<button type="button" class="secondary duty-photo-remove" data-duty-photo-remove="'+esc(p.id)+'" '+(p.duty_photo_id?'':'disabled')+'>Remove duty photo</button>'+
   '<small class="duty-manager-update-status" role="status" aria-live="polite">Duty picture will not alter organizational photo.</small></div></article>';
 }).join(''):'<p class="muted">Wala pang published SK Officials. Unahin ang Chairman review at publish sa SK Officials. Walang pangalan na awtomatikong ipo-publish.</p>';
 $('#duty-manage-officers').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true},{once:true}));
 $('#duty-manage-edit-official').disabled=!people.length;
}
async function loadDutyManagement(){
 if(user?.role!=='chairman'||dutyManagerLoading)return;
 dutyManagerLoading=true;
 $('#duty-manage-form').querySelector('button[type="submit"]').disabled=true;
 const status=$('#duty-manage-status');
 try{
  const [hours,profiles]=await Promise.all([api('./api/duty-schedule/manage'),api('./api/officer-profiles/manage')]);
  dutyManageHours=Array.isArray(hours.days)?hours.days:[];
  dutyManageProfiles=Array.isArray(profiles.profiles)?profiles.profiles:[];
  dutyManagerReady=dutyManageHours.length===7;
  status.textContent=dutyManagerReady?'Ready. Selecting a duty day or changing a duty photo saves the confirmed update automatically.':'Duty-hours configuration is incomplete.';
  renderDutyManageWeek();renderDutyManageOfficers();
  $('#duty-manage-form').querySelector('button[type="submit"]').disabled=!dutyManagerReady;
 }catch(error){
  dutyManagerReady=false;
  status.textContent='Database setup pending: '+(error?.message||'Cannot load roster.')+
   ' Apply the approved official-directory and duty migrations first.';
  $('#duty-manage-week').textContent='';$('#duty-manage-officers').textContent='No verified duty data available yet.';
 }finally{dutyManagerLoading=false;}
}
async function saveDutyOfficer(id,data,control){
 if(user?.role!=='chairman'||!dutyManagerReady||dutyManageSaving.has(id))throw Error('Duty update not ready.');
 dutyManageSaving.add(id);
 control.disabled=true;
 const card=control.closest('[data-duty-profile]'),note=card?.querySelector('.duty-manager-update-status');
 if(note)note.textContent='Saving changes…';
 try{
  const result=await api('./api/officer-profiles/duty',{method:'POST',body:JSON.stringify({id,...data})});
  if(!result?.ok)throw Error('Could not verify saved duty change.');
  const officer=dutyManageProfiles.find(p=>p.id===id);
  if(officer){
   if(Object.hasOwn(data,'duty_day'))officer.duty_days=data.duty_day?[data.duty_day]:[];
   if(Object.hasOwn(data,'duty_photo_id'))officer.duty_photo_id=data.duty_photo_id;
  }
  renderDutyManageWeek();renderDutyManageOfficers();
  success('Saved SK Duty update. The public duty roster will reflect this approved record.');
 }catch(error){
  if(note)note.textContent='Save failed: '+error.message;
  message(error.message,true);
  throw error;
 }finally{dutyManageSaving.delete(id);control.disabled=false;}
}
$('#duty-manage-week').addEventListener('click',e=>{
 const b=e.target.closest('[data-duty-day]');if(!b||!dutyManagerReady)return;
 dutyManageDay=Number(b.dataset.dutyDay);renderDutyManageDay();
});
$('#duty-manage-officers').addEventListener('change',async e=>{
 const day=e.target.closest('[data-duty-day-for]');
 if(day){
  const id=day.dataset.dutyDayFor,old=dutyManageProfiles.find(p=>p.id===id)?.duty_days?.[0]||0;
  try{await saveDutyOfficer(id,{duty_day:Number(day.value)||null},day)}
  catch{day.value=String(old)}
  return;
 }
 const input=e.target.closest('[data-duty-photo-for]');if(!input)return;
 const file=input.files?.[0];if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||file.size<1){
  input.value='';message('JPG, PNG, WebP lamang at maximum 5 MB.',true);return;
 }
 const id=input.dataset.dutyPhotoFor;
 input.disabled=true;
 try{
  const idOfPhoto=await uploadProjectPhoto(file);
  input.disabled=false;
  await saveDutyOfficer(id,{duty_photo_id:idOfPhoto},input);
 }catch(error){message(error.message,true)}
 finally{input.disabled=false;input.value='';}
});
$('#duty-manage-officers').addEventListener('click',async e=>{
 const remove=e.target.closest('[data-duty-photo-remove]');if(!remove)return;
 try{await saveDutyOfficer(remove.dataset.dutyPhotoRemove,{duty_photo_id:null},remove)}catch{}
});
$('#duty-manage-edit-official').addEventListener('click',()=>selectTab('roster'));
$('#duty-manage-form').addEventListener('submit',e=>{
 e.preventDefault();busy(e.target,async()=>{
  if(user?.role!=='chairman'||!dutyManagerReady)throw Error('Chairman approval and database setup required.');
  const opens=$('#duty-manage-opens').value,closes=$('#duty-manage-closes').value;
  if(!opens||!closes||opens>=closes)throw Error('Set valid opening and closing hours.');
  await api('./api/duty-schedule',{method:'POST',body:JSON.stringify({
   weekday:dutyManageDay,open_time:opens,close_time:closes
  })});
  success('Office hours saved.');await loadDutyManagement();
 });
});
