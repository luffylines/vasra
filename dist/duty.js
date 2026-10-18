const MANILA='Asia/Manila';
let selected=-1, manualSelection=false, observedDate='', dutyOverride='auto', overrideDate='';
let managedDutyDays=null,managedDutyProfiles=[];
async function refreshDutyOverride(){try{const r=await fetch('./api/duty-status',{cache:'no-store'});if(!r.ok)throw Error('status unavailable');const data=await r.json();dutyOverride=data.mode==='closed'?'closed':'auto';overrideDate=data.date||'';}catch{dutyOverride='unknown';overrideDate='';}updateSchedule();}
function manilaNow(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:MANILA,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return {short:parts.weekday.toUpperCase(),date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),minute:Number(parts.minute)};
}
function selectDay(index){
  selected=index;
  const d=managedDutyDays?managedDutyDays[index]:days[index];
  document.querySelectorAll('[data-day]').forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-pressed',String(i===index))});
  $('#day-kicker').textContent=d.day.toUpperCase()+' / OFFICER'+(d.names.length>1?'S':'')+' OF THE DAY';
  $('#officer-name').innerHTML=d.names.map((name,i)=>`<span>${esc(name)}<small>${esc(d.roles[i])}</small></span>`).join('');
  const poster=$('#poster-link'),photos=$('#duty-officer-portraits');
  poster.hidden=!!managedDutyDays;photos.hidden=!managedDutyDays;
  if(managedDutyDays){
   const list=managedDutyProfiles.filter(p=>Array.isArray(p.duty_days)&&p.duty_days.includes(index+1));
   photos.innerHTML=list.length?list.map(p=>{
    const initials=String(p.name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
    const picture=p.photo_id?'<img src="./api/images/'+encodeURIComponent(p.photo_id)+'" alt="Larawan ni '+esc(p.name)+'" loading="eager" onerror="this.hidden=true">':'';
    return '<article class="duty-profile"><span class="duty-profile-frame">'+
     '<span class="duty-profile-fallback" aria-hidden="true">'+esc(initials||'SK')+'</span>'+picture+
     '</span><strong>'+esc(p.name)+'</strong><small>'+esc(({
      chairman:'SK Chairperson',kagawad:'SK Kagawad',secretary:'SK Secretary',treasurer:'SK Treasurer'
     })[p.position]||'SK Officer')+'</small></article>';
   }).join(''):'<p class="duty-profile-empty">Walang naka-assign na officer sa araw na ito. Makipag-ugnay sa SK Office.</p>';
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
  const hoursOpen=now.hour>=9 && now.hour<18;
  const manualClosed=overrideDate===now.date&&dutyOverride==='closed';
  const open=hoursOpen&&!manualClosed;
  const label=$('#office-status-label'),pill=$('#office-status');
  label.textContent=manualClosed?'Closed by SK on duty':open?(dutyOverride==='unknown'?'Scheduled open · 9 AM–6 PM':'Open · 9 AM–6 PM'):(now.hour>=18?'Closed · Office hours ended':'Closed · Opens 9 AM');
  pill.classList.toggle('is-open',open);
  pill.classList.toggle('is-closed',!open);
  pill.title=dutyOverride==='unknown'?'Schedule only · 9 AM–6 PM Philippine Time. Live closure updates are temporarily unavailable.':'Philippine Time · 9 AM–6 PM. SK staff manual closure takes priority.';
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
updateSchedule();
setInterval(updateSchedule,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateSchedule()});

refreshDutyOverride();setInterval(refreshDutyOverride,30000);
loadManagedDutyRoster();setInterval(loadManagedDutyRoster,120000);
