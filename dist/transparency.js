const money=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v));
const monthLabel=v=>new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(String(v).slice(0,10)+'T12:00:00Z'));
const nowParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:'Asia/Manila'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const yearSelect=$('#trans-year'),monthSelect=$('#trans-month');
for(let y=Number(nowParts.year)+1;y>=2020;y--){const o=document.createElement('option');o.value=y;o.textContent=y;yearSelect.append(o)}
yearSelect.value=nowParts.year;
for(let m=1;m<=12;m++){const o=document.createElement('option');o.value=String(m).padStart(2,'0');o.textContent=new Intl.DateTimeFormat('en-PH',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2025,m-1,1)));monthSelect.append(o)}
let reports=[];
function renderMonths(){
 const chosen=monthSelect.value,list=reports.filter(r=>chosen==='all'||String(r.month).slice(5,7)===chosen);
 $('#monthly-reports').innerHTML=list.length?list.map(r=>'<article class="trans-report"><div class="trans-report-top"><strong>'+esc(r.title)+'</strong><span>'+esc(monthLabel(r.month))+'</span></div><p>'+esc(r.summary)+'</p><div class="trans-meta">Reported expense: <b>'+(r.expense===null?'Not reported':money(r.expense))+'</b></div></article>').join(''):'<div class="trans-empty">No published monthly updates for this period yet.</div>';
}
async function loadTransparency(){
 const year=Number(yearSelect.value);
 $('#finance-year').textContent=String(year);$('#annual-budget').textContent='Loading…';$('#annual-expense').textContent='Loading…';$('#annual-projects').textContent='…';
 try{
  const data=await api('./api/transparency?year='+year),b=data.budget;
  $('#annual-budget').textContent=b?money(b.amount):'Not yet reported';
  $('#annual-source').textContent=b?(b.reference||'SK-published budget · reference not provided'):'Awaiting approved annual budget records';
  reports=Array.isArray(data.updates)?data.updates:[];
  const amounts=reports.filter(r=>r.expense!==null);
  $('#annual-expense').textContent=amounts.length?money(amounts.reduce((sum,r)=>sum+Number(r.expense),0)):'Not yet reported';
  $('#annual-projects').textContent=amounts.length?String(new Set(amounts.map(r=>r.project_id)).size):'Not yet reported';
  const map=new Map();
  for(const r of reports){if(!map.has(r.project_id))map.set(r.project_id,{name:r.title,value:0,known:0,count:0});const x=map.get(r.project_id);x.count++;if(r.expense!==null){x.value+=Number(r.expense);x.known++}}
  $('#project-spending').innerHTML=map.size?Array.from(map.values()).map(p=>'<article class="trans-report trans-spending"><div><strong>'+esc(p.name)+'</strong><small>'+p.count+' monthly update(s)</small></div><strong>'+(p.known?money(p.value):'Expense not reported')+'</strong></article>').join(''):'<div class="trans-empty">No published project records for '+year+' yet.</div>';
  const labels={chairman:'SK Chairperson',kagawad:'SK Kagawad',treasurer:'SK Treasurer',secretary:'SK Secretary'};
  const roster=Array.isArray(data.officials)?data.officials:[];
  const groups=[['chairman','SK Chairperson'],['treasurer','SK Treasurer'],['secretary','SK Secretary'],['kagawad','SK Kagawad']];
  const card=o=>'<article class="trans-person"><span class="trans-avatar">'+esc(String(o.name).trim().charAt(0).toUpperCase())+'</span><strong>'+esc(o.name)+'</strong><small>'+esc(labels[o.position]||'SK Officer')+'</small></article>';
  $('#officials-grid').innerHTML=roster.length?groups.map(group=>{const members=roster.filter(o=>o.position===group[0]);return members.length?'<div class="trans-org-group"><h3>'+group[1]+'</h3><div class="trans-roster">'+members.map(card).join('')+'</div></div>':''}).join(''):'<div class="trans-empty">Official directory is being prepared. Names will appear after the Chairman publishes them.</div>';
  renderMonths();
 }catch(e){$('#annual-budget').textContent='Unavailable';$('#annual-expense').textContent='Unavailable';$('#annual-projects').textContent='—';$('#project-spending').textContent='Unable to load transparency data: '+e.message;$('#monthly-reports').textContent='Please retry later.';$('#officials-grid').textContent='SK directory temporarily unavailable.'}
}
yearSelect.onchange=loadTransparency;monthSelect.onchange=renderMonths;loadTransparency();