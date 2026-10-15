const MANILA='Asia/Manila';
let selected=-1, manualSelection=false, observedDate='', dutyOverride='auto', overrideDate='';
async function refreshDutyOverride(){try{const r=await fetch('./api/duty-status',{cache:'no-store'});if(!r.ok)throw Error('status unavailable');const data=await r.json();dutyOverride=data.mode==='closed'?'closed':'auto';overrideDate=data.date||'';}catch{dutyOverride='unknown';overrideDate='';}updateSchedule();}
function manilaNow(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:MANILA,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return {short:parts.weekday.toUpperCase(),date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),minute:Number(parts.minute)};
}
function selectDay(index){
  selected=index;
  const d=days[index];
  document.querySelectorAll('[data-day]').forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-pressed',String(i===index))});
  $('#day-kicker').textContent=d.day.toUpperCase()+' / OFFICER'+(d.names.length>1?'S':'')+' OF THE DAY';
  $('#officer-name').innerHTML=d.names.map((name,i)=>`<span>${esc(name)}<small>${esc(d.roles[i])}</small></span>`).join('');
  const src='./duty/'+d.file+'.jpg';
  $('#day-poster').src=src;
  $('#day-poster').alt=d.day+': '+d.names.join(' at ');
  $('#poster-full').src=src;
  $('#poster-full').alt=$('#day-poster').alt;
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
  label.textContent=manualClosed&&hoursOpen?'Closed by SK on duty':open?(dutyOverride==='unknown'?'Scheduled open · Status unverified':'Open · 9 AM–6 PM'):(now.hour>=18?'Closed · Office hours ended':'Closed · Opens 9 AM');
  pill.classList.toggle('is-open',open);
  pill.classList.toggle('is-closed',!open);
  pill.title='Philippine Time · 9 AM–6 PM. Manual SK closure takes priority during opening hours.';
}
updateSchedule();
setInterval(updateSchedule,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateSchedule()});

refreshDutyOverride();setInterval(refreshDutyOverride,30000);
