const MANILA='Asia/Manila';
let selected=-1, manualSelection=false, observedDate='', dutyOverride='auto', overrideDate='';
let managedDutyDays=null,managedDutyProfiles=[],publishedDutyHours=null;
let publicDutyContacts=[],publicDutyContactsAvailable=false;
async function refreshDutyOverride(){try{const r=await fetch('./api/duty-status',{cache:'no-store'});if(!r.ok)throw Error('status unavailable');const data=await r.json();dutyOverride=data.mode==='closed'?'closed':'auto';overrideDate=data.date||'';}catch{dutyOverride='unknown';overrideDate='';}updateSchedule();}
function manilaNow(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:MANILA,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return {short:parts.weekday.toUpperCase(),date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),minute:Number(parts.minute)};
}
// Match saved account details to the selected duty assignment by both name and
// SK position, never by weekday alone or by a hardcoded officer profile.
function dutyContactName(value){
 return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
}
function dutyContactPosition(role){
 const text=dutyContactName(role);
 if(text.includes('chairman')||text.includes('chairperson'))return 'chairman';
 if(text.includes('treasurer'))return 'treasurer';
 if(text.includes('secretary'))return 'secretary';
 if(text.includes('kagawad'))return 'kagawad';
 return '';
}
function dutyContactRows(){
 const host=$('#duty-contact-list');
 if(!host||selected<0)return;
 if(!publicDutyContactsAvailable){
  host.innerHTML='<p class="duty-contact-empty">Hindi pa available ang public officer contact details. Maaari pa ring makipag-ugnay sa SK Vasra Office.</p>';
  return;
 }
 const day=managedDutyDays?managedDutyDays[selected]:days[selected];
 const items=managedDutyDays
  ? managedDutyProfiles
    .filter(profile=>Array.isArray(profile.duty_days)&&profile.duty_days.includes(selected+1))
    .map(profile=>publicDutyContacts.find(c=>c.official_id===profile.id&&c.position===profile.position))
    .filter(Boolean)
  : (day.names||[]).map((name,index)=>{
     const position=dutyContactPosition(day.roles[index]);
     return publicDutyContacts.find(c=>dutyContactName(c.name)===dutyContactName(name)&&c.position===position);
    }).filter(Boolean);
 const icon=path=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+path+'</svg>';
 const pin=icon('<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>');
 const mail=icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>');
 const phone=icon('<path d="M7 3H4a2 2 0 0 0-2 2c0 9.4 7.6 17 17 17a2 2 0 0 0 2-2v-3l-6-2-2 3a16 16 0 0 1-7-7l3-2-2-6Z"/>');
 const web=icon('<path d="M13 4h7v7m0-7-9 9"/><path d="M20 13v6H4V4h6"/>');
 const names={chairman:'SK Chairperson',kagawad:'SK Kagawad',treasurer:'SK Treasurer',secretary:'SK Secretary'};
 const row=(svg,body)=>'<div class="duty-contact-detail">'+svg+'<span>'+body+'</span></div>';
 host.innerHTML=items.length?items.map(c=>{
  const parts=[];
  if(c.address)parts.push(row(pin,esc(c.address)));
  if(c.email)parts.push(row(mail,'<a href="mailto:'+encodeURIComponent(c.email)+'">'+esc(c.email)+'</a>'));
  if(c.phone)parts.push(row(phone,'<a href="tel:'+esc(c.phone.replace(/[^+0-9]/g,''))+'">'+esc(c.phone)+'</a>'));
  if(c.facebook_url){
   try{
    const link=new URL(c.facebook_url);
    if(link.protocol==='https:'&&['facebook.com','www.facebook.com','m.facebook.com'].includes(link.hostname)&&!link.username&&!link.password)
     parts.push(row(web,'<a href="'+esc(link.href)+'" target="_blank" rel="noopener noreferrer">Facebook profile / page ↗</a>'));
   }catch{/* hide malformed legacy URL */}
  }
  return '<article class="duty-contact-card"><h3>'+esc(c.name)+'</h3><small>'+esc(names[c.position]||'SK Officer')+'</small><div class="duty-contact-details">'+parts.join('')+'</div></article>';
 }).join(''):'<p class="duty-contact-empty">Wala pang naka-publish na contact details para sa napiling SK officer. Available pa rin ang SK Vasra Office para sa inyong mga katanungan.</p>';
}
async function loadPublicDutyContacts(){
 try{
  const result=await api('./api/officer-contacts');
  if(!Array.isArray(result.contacts))throw Error('Invalid contact directory');
  publicDutyContacts=result.contacts;
  publicDutyContactsAvailable=true;
 }catch{
  publicDutyContacts=[];publicDutyContactsAvailable=false;
 }
 dutyContactRows();
}
function selectDay(index){
  selected=index;
  const d=managedDutyDays?managedDutyDays[index]:days[index];
  document.querySelectorAll('[data-day]').forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-pressed',String(i===index))});
  $('#day-kicker').textContent=d.day.toUpperCase()+' / OFFICER'+(d.names.length>1?'S':'')+' OF THE DAY';
  $('#officer-name').innerHTML=d.names.map((name,i)=>`<span>${esc(name)}<small>${esc(d.roles[i])}</small></span>`).join('')||'Walang naka-assign';
  const times=publishedDutyHours?.find(h=>h.weekday===index+1);
  const fmt=clock=>{const [h,m]=String(clock).split(':').map(Number);return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+(h<12?' AM':' PM');};
  $('#officer-role').textContent='Office hours · '+fmt(times?.open_time||'09:00')+'–'+fmt(times?.close_time||'18:00')+' (PHT)';
  dutyContactRows();
  const poster=$('#poster-link'),photos=$('#duty-officer-portraits');
  poster.hidden=!!managedDutyDays;photos.hidden=!managedDutyDays;
  if(managedDutyDays){
   const list=managedDutyProfiles.filter(p=>Array.isArray(p.duty_days)&&p.duty_days.includes(index+1));
   photos.dataset.layout=list.length===1?'single':list.length>1?'group':'empty';
   photos.dataset.photoState=list.length===1&&!list[0].duty_photo_id?'missing':'ready';
   photos.innerHTML=list.length?list.map(p=>{
    const initials=String(p.name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
    const picture=p.duty_photo_id?'<img class="duty-photo-primary" src="./api/duty-images/'+encodeURIComponent(p.duty_photo_id)+'" alt="SK Duty photo ni '+esc(p.name)+'" loading="eager">'+
     '<img class="duty-photo-backdrop" src="./api/duty-images/'+encodeURIComponent(p.duty_photo_id)+'" alt="" aria-hidden="true" loading="eager">':'';
    const photoNotice='<span class="duty-photo-notice"'+(p.duty_photo_id?' hidden':'')+'>'+(p.duty_photo_id?'Hindi ma-load ang SK Duty photo.':'Wala pang naka-upload na SK Duty photo.')+'</span>';
    return '<article class="duty-profile"><span class="duty-profile-frame">'+
     '<span class="duty-profile-fallback" aria-hidden="true">'+esc(initials||'SK')+'</span>'+picture+
     '</span><strong>'+esc(p.name)+'</strong><small>'+esc(({
      chairman:'SK Chairperson',kagawad:'SK Kagawad',secretary:'SK Secretary',treasurer:'SK Treasurer'
     })[p.position]||'SK Officer')+'</small>'+photoNotice+'</article>';
   }).join(''):'<p class="duty-profile-empty">Walang naka-assign na officer sa araw na ito. Makipag-ugnay sa SK Office.</p>';
   photos.querySelectorAll('img').forEach(img=>{
    img.addEventListener('error',()=>{
     img.hidden=true;
     if(img.classList.contains('duty-photo-primary')){
      img.closest('.duty-profile')?.querySelector('.duty-photo-notice')?.removeAttribute('hidden');
      if(list.length===1)photos.dataset.photoState='missing';
     }
    },{once:true});
   });
  }else{
   const src='./duty/'+d.file+'.jpg';
   $('#day-poster').src=src;
   $('#day-poster').alt=d.day+': '+d.names.join(' at ');
   $('#poster-full').src=src;
   $('#poster-full').alt=$('#day-poster').alt;
  }
}
$('.day-switch').innerHTML=days.map((d,i)=>`<button type="button" data-day="${i}" aria-pressed="false"><small>${d.short}</small><span>${d.day}</span><i hidden aria-label="Ngayong araw"></i></button>`).join('');
$('.day-switch').onclick=e=>{
  const b=e.target.closest('[data-day]');
  if(b){manualSelection=true;selectDay(Number(b.dataset.day));}
};
const viewer=$('#poster-viewer');
$('#poster-link').onclick=()=>viewer.showModal();
$('#poster-close').onclick=()=>viewer.close();
viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close()});
function updateSchedule(){
  const now=manilaNow(),today=days.findIndex(d=>d.short===now.short);
  if(now.date!==observedDate){manualSelection=false;observedDate=now.date;}
  if((!manualSelection || selected<0) && today>=0 && selected!==today)selectDay(today);
  document.querySelectorAll('[data-day]').forEach((el,i)=>{
    const marker=el.querySelector('i');
    marker.hidden=i!==today;
    el.classList.toggle('today',i===today);
  });
  const configured=(typeof publishedDutyHours!=='undefined'&&Array.isArray(publishedDutyHours))?
   publishedDutyHours.find(h=>h.weekday===today):null;
  const opens=configured?.open_time||'09:00',closes=configured?.close_time||'18:00';
  const minute=now.hour*60+now.minute;
  const toMinutes=t=>{const p=String(t).split(':').map(Number);return p[0]*60+p[1];};
  const hoursOpen=minute>=toMinutes(opens)&&minute<toMinutes(closes);
  const fmt=t=>{const p=String(t).split(':').map(Number);return (p[0]%12||12)+(p[1]?':'+String(p[1]).padStart(2,'0'):'')+(p[0]<12?' AM':' PM');};
  const labelHours=fmt(opens)+'–'+fmt(closes);
  const manualClosed=overrideDate===now.date&&dutyOverride==='closed';
  const open=hoursOpen&&!manualClosed;
  const label=$('#office-status-label'),pill=$('#office-status');
  label.textContent=manualClosed?'Closed by SK on duty':open?(dutyOverride==='unknown'?'Scheduled open · '+labelHours:'Open · '+labelHours):
    (minute>=toMinutes(closes)?'Closed · Office hours ended':'Closed · Opens '+fmt(opens));
  pill.classList.toggle('is-open',open);
  pill.classList.toggle('is-closed',!open);
  pill.title=dutyOverride==='unknown'?'Schedule only · '+labelHours+' Philippine Time. Live closure updates are temporarily unavailable.':'Philippine Time · '+labelHours+'. SK staff manual closure takes priority.';
}
async function loadManagedDutyRoster(){
 try{
  const result=await api('./api/officer-profiles');
  if(result?.managed!==true||!Array.isArray(result.profiles))return;
  const valid=result.profiles.filter(p=>p&&Array.isArray(p.duty_days)&&
    p.duty_days.every(v=>Number.isInteger(v)&&v>=1&&v<=7));
  managedDutyProfiles=valid;
  managedDutyDays=days.map((d,i)=>{
    const assigned=valid.filter(p=>p.duty_days.includes(i+1));
    const names=assigned.map(p=>p.name),roles=assigned.map(p=>({
      chairman:'SK Chairperson',secretary:'SK Secretary',treasurer:'SK Treasurer',kagawad:'SK Kagawad'
    })[p.position]||'SK Officer');
    return {...d,names,roles};
  });
  if(selected>=0)selectDay(selected);
  else updateSchedule();
 }catch{
  // Migration not installed or temporarily unavailable: keep historical
  // poster schedule. Do not invent the existence of new published officers.
 }
}
async function loadPublishedDutyHours(){
 try{
  const result=await api('./api/duty-schedule');
  if(!Array.isArray(result.days)||result.days.length!==7)return;
  publishedDutyHours=result.days;
  const today=days.findIndex(d=>d.short===manilaNow().short);
  const time=publishedDutyHours.find(d=>d.weekday===today+1);
  const fm=t=>{const [h,m]=String(t).split(':').map(Number);return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+(h<12?' AM':' PM');};
  const el=document.getElementById('duty-schedule-time-label');
  if(el&&time)el.textContent='Philippine Time · '+fm(time.open_time)+'–'+fm(time.close_time)+' today';
  if(selected>=0)selectDay(selected);
  updateSchedule();
 }catch{ /* Before migration use the existing verified 9 AM–6 PM schedule. */ }
}
updateSchedule();
setInterval(updateSchedule,30000);
loadPublishedDutyHours();setInterval(loadPublishedDutyHours,120000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateSchedule()});

refreshDutyOverride();setInterval(refreshDutyOverride,30000);
loadManagedDutyRoster();setInterval(loadManagedDutyRoster,20000);
loadPublicDutyContacts();setInterval(loadPublicDutyContacts,60000);
