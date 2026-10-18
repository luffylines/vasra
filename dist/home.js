const homeNow=()=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const homePeriod=homeNow();
document.querySelectorAll('.home-year').forEach(el=>el.textContent=homePeriod.year);
$('#home-month').textContent=new Intl.DateTimeFormat('fil-PH',{month:'long',timeZone:'Asia/Manila'}).format(new Date());
const homeMoney=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v));
let homeProjects=null,homeReports=null;
function renderHomeHighlights(){
 if(!homeProjects)return;
 const monthlyIds=new Set((homeReports||[]).filter(r=>String(r.month).slice(0,7)===homePeriod.year+'-'+homePeriod.month).map(r=>r.project_id));
 const list=[...homeProjects].sort((a,b)=>Number(monthlyIds.has(b.id))-Number(monthlyIds.has(a.id))||String(b.updated).localeCompare(String(a.updated))).slice(0,3);
 $('#home-highlights').innerHTML=list.length?list.map(p=>'<article class="home-project"><span class="badge-inline">'+esc(p.status)+'</span><h3>'+esc(p.title)+'</h3><p>'+esc(p.description)+'</p><small>'+esc(p.category)+' · '+esc(p.progress)+'% progreso</small><a href="./projects.html">Tingnan sa mga proyekto <svg class="ui-action-icon" data-direction="right" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a></article>').join(''):'<div class="trans-empty">Wala pang inilathalang proyekto. Abangan ang mga bagong programa ng SK Vasra.</div>';
}
api('./api/projects').then(data=>{
 homeProjects=Array.isArray(data.projects)?data.projects:[];
 $('#home-active').textContent=homeProjects.filter(p=>p.status==='Isinasagawa').length;
 renderHomeHighlights();
}).catch(()=>{$('#home-active').textContent='Subukan muli';$('#home-active').className='summary-empty';$('#home-highlights').innerHTML='<div class="trans-empty">Hindi ma-load ang mga proyekto. Subukan muli sa Projects page.</div>'});
api('./api/transparency?year='+homePeriod.year).then(data=>{
 homeReports=(Array.isArray(data.updates)?data.updates:[]).filter(r=>String(r.month).slice(0,4)===homePeriod.year);
 const monthCount=new Set(homeReports.filter(r=>String(r.month).slice(5,7)===homePeriod.month).map(r=>r.project_id)).size;
 $('#home-month-count').textContent=monthCount||'Wala pang nai-publish na monthly update.';
 $('#home-month-count').className=monthCount?'':'summary-empty';
 const yearCount=new Set(homeReports.map(r=>r.project_id)).size;
 $('#home-year-count').textContent=yearCount||'Wala pang nai-publish na monthly update.';
 $('#home-year-count').className=yearCount?'':'summary-empty';
 $('#home-budget').textContent=data.budget?homeMoney(data.budget.amount):'Wala pang published budget figures.';
 $('#home-budget-reference').textContent=data.budget?(data.budget.reference||'Published annual budget · Walang reference na ibinigay'):'Hinihintay ang published annual budget.';
 const expenses=homeReports.filter(r=>r.expense!==null&&r.expense!==undefined);
 $('#home-expense').textContent=expenses.length?homeMoney(expenses.reduce((sum,r)=>sum+Number(r.expense),0)):'Wala pang nai-publish na gastos.';
 $('#home-officials').innerHTML=officerDirectory(data.officials,false,data.directory_managed===true,false);
 renderHomeHighlights();
}).catch(()=>{
 ['#home-month-count','#home-year-count','#home-budget','#home-expense'].forEach(id=>{$(id).textContent='Hindi ma-load sa ngayon';$(id).className='summary-empty'});
 $('#home-budget-reference').textContent='Hindi ma-load ang transparency report. Subukan muli mamaya.';
 $('#home-officials').innerHTML='<div class="trans-empty">Hindi ma-check ang official SK directory sa ngayon. Subukan muli mamaya.</div>';
});
let homeDutyMode='unknown',homeDutyDate='',homeDutyOpen='09:00',homeDutyClose='18:00',homeManagedProfiles=null;
function renderHomeDuty(){
 const now=homeNow(),date=now.year+'-'+now.month+'-'+now.day;
 const d=days.find(d=>d.short===now.weekday.toUpperCase());
 $('#home-duty-date').textContent=new Intl.DateTimeFormat('fil-PH',{month:'short',day:'numeric',timeZone:'Asia/Manila'}).format(new Date());
 const current=Array.isArray(homeManagedProfiles)?homeManagedProfiles.filter(p=>p.duty_days?.includes(['MON','TUE','WED','THU','FRI','SAT','SUN'].indexOf(now.weekday.toUpperCase())+1)):null;
 const role={chairman:'SK Chairperson',kagawad:'SK Kagawad',secretary:'SK Secretary',treasurer:'SK Treasurer'};
 const photos=current?current.map(p=>'<article class="home-officer">'+officerPortrait(p.name,p.position,p.photo_id,true)+'<div><h3>'+esc(p.name)+'</h3><p>'+esc(role[p.position]||'SK Officer')+'</p></div></article>').join(''):
  d?.names.map((name,i)=>'<article class="home-officer">'+officerPortrait(name)+'<div><h3>'+esc(name)+'</h3><p>'+esc(d.roles[i])+'</p></div></article>').join('');
 $('#home-duty-officers').innerHTML=d?'<span class="eyebrow">'+esc(d.day.toUpperCase())+' · NAKATAKDA NGAYON</span>'+(photos||'<p>Walang naka-assign na SK officer sa araw na ito.</p>'):'Hindi available ang schedule.';
 const min=t=>{const [h,m]=String(t).split(':').map(Number);return h*60+m;};
 const fm=t=>{const [h,m]=String(t).split(':').map(Number);return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+(h<12?' AM':' PM');};
 const minutes=Number(now.hour)*60+Number(now.minute||0);
 const inHours=minutes>=min(homeDutyOpen)&&minutes<min(homeDutyClose),closed=homeDutyMode==='closed'&&homeDutyDate===date;
 const status=$('#home-duty-status'),label=fm(homeDutyOpen)+'–'+fm(homeDutyClose);
 status.textContent=closed&&inHours?'Closed by SK on duty':inHours?(homeDutyMode==='unknown'?'Scheduled open · Status unverified':'Open · '+label):'Closed · Office hours '+label;
 status.className='home-status '+(inHours&&!closed&&homeDutyMode!=='unknown'?'is-open':'');
}
async function refreshHomeDuty(){
 try{const data=await api('./api/duty-status',{cache:'no-store'});homeDutyMode=data.mode==='closed'?'closed':'auto';homeDutyDate=data.date||'';homeDutyOpen=data.open_time||'09:00';homeDutyClose=data.close_time||'18:00';}catch{homeDutyMode='unknown';homeDutyDate='';}
 renderHomeDuty();
}
async function refreshHomeOfficerRoster(){
 try{
  const result=await api('./api/officer-profiles');
  homeManagedProfiles=result?.managed===true&&Array.isArray(result.profiles)?result.profiles:null;
  renderHomeDuty();
 }catch{ /* legacy duty roster fallback while migration is pending */ }
}
renderHomeDuty();refreshHomeDuty();setInterval(refreshHomeDuty,30000);
refreshHomeOfficerRoster();setInterval(refreshHomeOfficerRoster,120000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHomeDuty()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
