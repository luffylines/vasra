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
 $('#home-highlights').innerHTML=list.length?list.map(p=>'<article class="home-project"><span class="badge-inline">'+esc(p.status)+'</span><h3>'+esc(p.title)+'</h3><p>'+esc(p.description)+'</p><small>'+esc(p.category)+' · '+esc(p.progress)+'% progreso</small><a href="./projects.html">Tingnan sa mga proyekto ↗</a></article>').join(''):'<div class="trans-empty">Wala pang inilathalang proyekto. Abangan ang mga bagong programa ng SK Vasra.</div>';
}
api('./api/projects').then(data=>{
 homeProjects=Array.isArray(data.projects)?data.projects:[];
 $('#home-active').textContent=homeProjects.filter(p=>p.status==='Isinasagawa').length;
 renderHomeHighlights();
}).catch(()=>{$('#home-active').textContent='Unavailable';$('#home-highlights').innerHTML='<div class="trans-empty">Hindi ma-load ang mga proyekto. Subukan muli sa Projects page.</div>'});
api('./api/transparency?year='+homePeriod.year).then(data=>{
 homeReports=(Array.isArray(data.updates)?data.updates:[]).filter(r=>String(r.month).slice(0,4)===homePeriod.year);
 $('#home-month-count').textContent=new Set(homeReports.filter(r=>String(r.month).slice(5,7)===homePeriod.month).map(r=>r.project_id)).size;
 $('#home-year-count').textContent=new Set(homeReports.map(r=>r.project_id)).size;
 $('#home-budget').textContent=data.budget?homeMoney(data.budget.amount):'Hindi pa naiulat';
 $('#home-budget-reference').textContent=data.budget?(data.budget.reference||'Published annual budget · Walang reference na ibinigay'):'Hinihintay ang published annual budget.';
 const expenses=homeReports.filter(r=>r.expense!==null&&r.expense!==undefined);
 $('#home-expense').textContent=expenses.length?homeMoney(expenses.reduce((sum,r)=>sum+Number(r.expense),0)):'Hindi pa naiulat';
 const labels={chairman:'SK Chairperson',kagawad:'SK Kagawad',treasurer:'SK Treasurer',secretary:'SK Secretary'};
 const positions=['chairman','treasurer','secretary','kagawad'];
 const roster=(Array.isArray(data.officials)?data.officials:[]).slice().sort((a,b)=>positions.indexOf(a.position)-positions.indexOf(b.position));
 $('#home-officials').innerHTML=roster.length?roster.map(o=>'<article class="trans-person"><span class="trans-avatar" aria-hidden="true">'+esc(String(o.name).trim().charAt(0).toUpperCase())+'</span><strong>'+esc(o.name)+'</strong><small>'+esc(labels[o.position]||'SK Officer')+'</small></article>').join(''):'<div class="trans-empty">Inihahanda ang official directory. Makikita rito ang mga pangalan kapag nailathala na ng SK.</div>';
 renderHomeHighlights();
}).catch(()=>{
 ['#home-month-count','#home-year-count','#home-budget','#home-expense'].forEach(id=>$(id).textContent='Unavailable');
 $('#home-budget-reference').textContent='Hindi ma-load ang transparency report. Subukan muli mamaya.';
 $('#home-officials').innerHTML='<div class="trans-empty">Pansamantalang hindi available ang official directory.</div>';
});
let homeDutyMode='unknown',homeDutyDate='';
function renderHomeDuty(){
 const now=homeNow(),date=now.year+'-'+now.month+'-'+now.day;
 const d=days.find(d=>d.short===now.weekday.toUpperCase());
 $('#home-duty-date').textContent=new Intl.DateTimeFormat('fil-PH',{month:'short',day:'numeric',timeZone:'Asia/Manila'}).format(new Date());
 $('#home-duty-officers').innerHTML=d?'<span class="eyebrow">'+esc(d.day.toUpperCase())+' · NAKATAKDA NGAYON</span>'+d.names.map((name,i)=>'<article class="home-officer"><span class="trans-avatar" aria-hidden="true">'+esc(name.charAt(0))+'</span><div><h3>'+esc(name)+'</h3><p>'+esc(d.roles[i])+'</p></div></article>').join(''):'Hindi available ang schedule.';
 const inHours=Number(now.hour)>=9&&Number(now.hour)<18,closed=homeDutyMode==='closed'&&homeDutyDate===date;
 const status=$('#home-duty-status');
 status.textContent=closed&&inHours?'Closed by SK on duty':inHours?(homeDutyMode==='unknown'?'Scheduled open · Status unverified':'Open · 9 AM–6 PM'):'Closed · Office hours 9 AM–6 PM';
 status.className='home-status '+(inHours&&!closed&&homeDutyMode!=='unknown'?'is-open':'');
}
async function refreshHomeDuty(){
 try{const data=await api('./api/duty-status',{cache:'no-store'});homeDutyMode=data.mode==='closed'?'closed':'auto';homeDutyDate=data.date||'';}catch{homeDutyMode='unknown';homeDutyDate='';}
 renderHomeDuty();
}
renderHomeDuty();refreshHomeDuty();setInterval(refreshHomeDuty,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHomeDuty()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
