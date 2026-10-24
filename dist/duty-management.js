'use strict';
// SK Duty Management is a single-person editor.
// Officer identity/position comes from SK Council; duty photo/day are separate.
const dutyManageWeekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const dutyManageShort=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const dutyManageRole={chairman:'SK Chairperson',kagawad:'SK Kagawad',treasurer:'SK Treasurer',secretary:'SK Secretary'};
const dutyManageLegacyRole={'SK Chairman':'chairman','SK Treasurer':'treasurer','SK Secretary':'secretary','SK Kagawad':'kagawad'};
let dutyManageDay=1,dutyManageHours=[],dutyManageOfficers=[],dutyManageSelectedId='',dutyManagerReady=false,dutyManagerLoading=false,dutyManagerSaving=false,dutyManagePhotoURL=null;
const dutyManageOfficer=()=>dutyManageOfficers.find(o=>o.key===dutyManageSelectedId)||null;
const dutyManageNormal=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
function dutyManageTime(time){
 const [h,m]=String(time||'09:00').split(':').map(Number);
 return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM');
}
function dutyManageCollect(roster,directory){
 const entries=new Map();
 const add=(p,priority)=>{
  if(!p||!p.name||!dutyManageRole[p.position])return;
  const normalized=dutyManageNormal(p.name),key=normalized+'|'+p.position;
  const prev=entries.get(key);
  if(prev&&prev.priority>priority)return;
  const item={...prev,...p,key,priority,published:!!p.published};
  if(!Array.isArray(item.duty_days))item.duty_days=[];
  item.canSave=priority===3&&!!item.published&&!!item.id;
  entries.set(key,item);
 };
 // Legacy names are a read-only fallback ONLY if the managed SK Council directory is empty.
 // This prevents departed/archived SK members reappearing beside an active roster.
 const hasManagedNames=(directory?.officials?.length||0)>0||(roster?.profiles?.length||0)>0;
 if(!hasManagedNames&&typeof days!=='undefined'&&Array.isArray(days)){
  for(const day of days)day.names.forEach((name,i)=>{
   const role=dutyManageLegacyRole[day.roles[i]];
   if(role)add({name,position:role,published:false,duty_days:[]},1);
  });
 }
 // SK Council Management is the authoritative directory, including unpublished drafts.
 for(const item of directory?.officials||[])add(item,2);
 // The protected profile RPC supplies the persistent duty photo and assigned weekday.
 for(const item of roster?.profiles||[])add(item,3);
 return [...entries.values()].sort((a,b)=>{
  const roleOrder={chairman:0,kagawad:1,secretary:2,treasurer:3};
  return (roleOrder[a.position]-roleOrder[b.position])||a.name.localeCompare(b.name);
 });
}
function dutyManageRenderOptions(){
 const select=$('#duty-officer-select');
 const selected=dutyManageSelectedId;
 select.innerHTML='<option value="">Pumili ng SK officer…</option>'+dutyManageOfficers.map(o=>
  '<option value="'+esc(o.key)+'">'+esc(o.name)+' — '+esc(dutyManageRole[o.position])+
  (o.priority===1?' (SK Duty reference)':o.published?'':' (Not published)')+'</option>').join('');
 select.value=dutyManageOfficers.some(o=>o.key===selected)?selected:'';
 dutyManageSelectedId=select.value;
 dutyManageRenderSelected();
}
function dutyManageRenderSelected(){
 const officer=dutyManageOfficer(),box=$('#duty-manage-selected'),pick=$('#duty-officer-select');
 if(!officer){
  box.hidden=true;$('#duty-manage-day-fieldset').disabled=true;
  $('#duty-manage-selection-message').textContent='Pumili ng SK officer mula sa dropdown upang makita ang current duty photo at assigned day.';
  return;
 }
 box.hidden=false;
 $('#duty-manage-selected-name').textContent=officer.name;
 $('#duty-manage-selected-role').textContent=dutyManageRole[officer.position]||'SK Official';
 const canUpdate=dutyManagerReady&&officer.canSave&&!dutyManagerSaving;
 $('#duty-manage-day-fieldset').disabled=!canUpdate;
 $('#duty-photo-file').disabled=!canUpdate;
 $('#duty-photo-remove').disabled=!canUpdate||!officer.duty_photo_id;
 const preview=$('#duty-manage-photo-preview');
 if(dutyManagePhotoURL){URL.revokeObjectURL(dutyManagePhotoURL);dutyManagePhotoURL=null;}
 const legacy=typeof legacyOfficerPortrait==='function'?legacyOfficerPortrait(officer.name,officer.position):null;
 const source=officer.duty_photo_id?'./api/officer-images/'+encodeURIComponent(officer.duty_photo_id):
  legacy?'./duty/'+encodeURIComponent(legacy.file)+'.jpg':'';
 const initials=officer.name.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
 preview.className='duty-manager-photo-preview'+(legacy&&!officer.duty_photo_id?' duty-manager-legacy '+legacy.crop:'');
 preview.innerHTML='<span class="duty-manager-photo-initials" aria-hidden="true">'+esc(initials||'SK')+'</span>'+
  (source?'<img src="'+esc(source)+'" alt="Current SK Duty photo ni '+esc(officer.name)+'">':'');
 const img=preview.querySelector('img');
 if(img)img.addEventListener('error',()=>{img.hidden=true},{once:true});
 $('#duty-manage-photo-note').textContent=officer.duty_photo_id?
  'Saved SK Duty picture. Hiwalay ito sa Organizational Structure image.':
  legacy?'Current photo from the original SK Duty poster (reference only). Upload a duty photo to replace it.':
  'Wala pang duty photo. Upload JPG, PNG o WebP, maximum 5 MB.';
 const chosen=officer.duty_days?.[0]||0;
 $('#duty-manage-day-choices').innerHTML=dutyManageWeekdays.map((day,i)=>{
  const weekday=i+1;
  return '<label class="duty-manager-day-chip"><input type="radio" name="sk-duty-day" value="'+weekday+'"'+(chosen===weekday?' checked':'')+'><span>'+dutyManageShort[i]+'</span></label>';
 }).join('')+'<label class="duty-manager-day-chip duty-manager-day-clear"><input type="radio" name="sk-duty-day" value="0"'+(chosen===0?' checked':'')+'><span>None</span></label>';
 $('#duty-manage-selection-message').textContent=!dutyManagerReady?
  'Preview lamang. Hindi pa active ang duty-photo database migration, kaya disabled ang saving.':
  !officer.canSave?'Reference name pa lamang ito. I-save at i-publish muna ang officer sa SK Officials bago ma-enable ang duty photo at duty day.':
  'Ready. Ang pagbabago sa duty day o picture ay automatic na mase-save kapag kinumpirma ng server.';
}
function dutyManageRenderHours(){
 $('#duty-manage-week').innerHTML=dutyManageWeekdays.map((name,i)=>{
  const d=i+1,h=dutyManageHours.find(x=>x.weekday===d)||{};
  return '<button type="button" data-duty-day="'+d+'" class="duty-manager-weekday" aria-pressed="'+(d===dutyManageDay)+'"><strong>'+
   dutyManageShort[i]+'</strong><small>'+dutyManageTime(h.open_time||'09:00')+'–'+dutyManageTime(h.close_time||'18:00')+'</small></button>';
 }).join('');
 const h=dutyManageHours.find(x=>x.weekday===dutyManageDay)||{};
 $('#duty-manage-day-label').textContent=dutyManageWeekdays[dutyManageDay-1]+' office hours';
 $('#duty-manage-opens').value=h.open_time||'09:00';
 $('#duty-manage-closes').value=h.close_time||'18:00';
 $('#duty-manage-form').querySelector('button[type="submit"]').disabled=!dutyManagerReady;
}
async function loadDutyManagement(){
 if(user?.role!=='chairman'||dutyManagerLoading)return;
 dutyManagerLoading=true;
 const status=$('#duty-manage-status');
 const result=await Promise.allSettled([
  api('./api/duty-schedule/manage'),
  api('./api/officer-profiles/manage'),
  api('./api/transparency/manage?year='+transYearNow())
 ]);
 const [h,r,d]=result.map(x=>x.status==='fulfilled'?x.value:null);
 // Keep the existing selectable SK Council reference even before SQL migrations are applied.
 dutyManageHours=Array.isArray(h?.days)?h.days:[];
 dutyManagerReady=dutyManageHours.length===7&&Array.isArray(r?.profiles);
 dutyManageOfficers=dutyManageCollect(r,d);
 status.textContent=dutyManagerReady?
  'Pumili ng officer. Ang duty day at larawan ay mase-save nang hiwalay sa Organizational Structure.':
  'Hindi pa available ang saving. Kailangang i-apply ang officer-photo at office-hours migrations sa Supabase database.';
 dutyManageRenderOptions();dutyManageRenderHours();
 dutyManagerLoading=false;
}
async function dutyManageSave(payload,control){
 const officer=dutyManageOfficer();
 if(!officer||!officer.canSave||!dutyManagerReady||dutyManagerSaving)throw Error('The selected officer does not yet have an active, published duty profile.');
 dutyManagerSaving=true;control.disabled=true;
 $('#duty-manage-selection-message').textContent='Saving SK Duty update…';
 try{
  const response=await api('./api/officer-profiles/duty',{method:'POST',body:JSON.stringify({id:officer.id,...payload})});
  if(response?.ok!==true)throw Error('The server did not confirm the duty update.');
  if(Object.hasOwn(payload,'duty_day'))officer.duty_days=payload.duty_day?[payload.duty_day]:[];
  if(Object.hasOwn(payload,'duty_photo_id'))officer.duty_photo_id=payload.duty_photo_id;
  success('SK Duty saved: '+officer.name+'. Updated on the public duty roster.');
  dutyManageRenderSelected();
 }catch(error){
  message('Hindi na-save: '+error.message,true);
  dutyManageRenderSelected();
  throw error;
 }finally{dutyManagerSaving=false;control.disabled=false;dutyManageRenderSelected();}
}
$('#duty-officer-select').addEventListener('change',e=>{
 dutyManageSelectedId=e.target.value;dutyManageRenderSelected();
});
$('#duty-manage-day-choices').addEventListener('change',async e=>{
 const input=e.target.closest('input[name="sk-duty-day"]');if(!input)return;
 const officer=dutyManageOfficer(),before=officer?.duty_days?.[0]||0;
 try{await dutyManageSave({duty_day:Number(input.value)||null},input)}
 catch{const old=document.querySelector('#duty-manage-day-choices input[value="'+before+'"]');if(old)old.checked=true;}
});
$('#duty-photo-file').addEventListener('change',async e=>{
 const input=e.target,file=input.files?.[0];
 if(!file)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>5*1024*1024){
  message('Pumili ng JPG, PNG o WebP na maximum 5 MB.',true);input.value='';return;
 }
 const officer=dutyManageOfficer();if(!officer?.canSave||!dutyManagerReady){message('Publish and activate the duty profile first.',true);input.value='';return;}
 input.disabled=true;
 const preview=$('#duty-manage-photo-preview'),oldHTML=preview.innerHTML;
 preview.className='duty-manager-photo-preview';
 preview.innerHTML='<img src="'+URL.createObjectURL(file)+'" alt="New duty photo preview">';
 const photo=preview.querySelector('img'),objectURL=photo.src;
 $('#duty-manage-selection-message').textContent='Uploading photo. Please keep this page open until saved…';
 try{
  const uploadedId=await uploadProjectPhoto(file);
  input.disabled=false;
  await dutyManageSave({duty_photo_id:uploadedId},input);
 }catch(error){preview.innerHTML=oldHTML;message('Upload/save failed: '+error.message,true);}
 finally{URL.revokeObjectURL(objectURL);input.value='';input.disabled=false;dutyManageRenderSelected();}
});
$('#duty-photo-remove').addEventListener('click',async e=>{
 const officer=dutyManageOfficer();
 if(!officer?.duty_photo_id)return;
 try{await dutyManageSave({duty_photo_id:null},e.currentTarget)}catch{}
});
$('#duty-manage-week').addEventListener('click',e=>{
 const btn=e.target.closest('[data-duty-day]');
 if(!btn||!dutyManagerReady)return;
 dutyManageDay=Number(btn.dataset.dutyDay);dutyManageRenderHours();
});
$('#duty-manage-form').addEventListener('submit',e=>{
 e.preventDefault();busy(e.target,async()=>{
  if(!dutyManagerReady||user?.role!=='chairman')throw Error('Activate the approved duty database migration first.');
  const opens=$('#duty-manage-opens').value,closes=$('#duty-manage-closes').value;
  if(!opens||!closes||opens>=closes)throw Error('Office closing time must be later than opening time.');
  const response=await api('./api/duty-schedule',{method:'POST',body:JSON.stringify({
   weekday:dutyManageDay,open_time:opens,close_time:closes
  })});
  if(response?.ok!==true)throw Error('The server did not confirm the hours.');
  success('Office hours updated.');await loadDutyManagement();
 });
});
