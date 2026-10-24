// Monthly accomplishments remain public; historical finance records stay in the DB
// but no longer occupy the public Full Disclosure Board.
const money=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v));
const monthLabel=v=>new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric',timeZone:'UTC'})
 .format(new Date(String(v).slice(0,10)+'T12:00:00Z'));
const nowParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
 year:'numeric',timeZone:'Asia/Manila'
}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const monthSelect=$('#trans-month');
for(let m=1;m<=12;m++){
 const o=document.createElement('option');o.value=String(m).padStart(2,'0');
 o.textContent=new Intl.DateTimeFormat('en-PH',{month:'long',timeZone:'UTC'})
  .format(new Date(Date.UTC(2025,m-1,1)));
 monthSelect.append(o);
}
let reports=[];
function renderMonths(){
 const chosen=monthSelect.value,list=reports.filter(r=>chosen==='all'||String(r.month).slice(5,7)===chosen);
 $('#monthly-reports').innerHTML=list.length?list.map(r=>
  '<article class="trans-report"><div class="trans-report-top"><strong>'+esc(r.title)+'</strong>'+
  '<span>'+esc(monthLabel(r.month))+'</span></div><p>'+esc(r.summary)+'</p><div class="trans-meta">Reported expense: <b>'+
  (r.expense===null?'Not reported':money(r.expense))+'</b></div></article>'
 ).join(''):'<div class="trans-empty">Wala pang nai-publish na monthly update.</div>';
}
async function loadTransparency(){
 try{
  const data=await api('./api/transparency?year='+nowParts.year);
  reports=Array.isArray(data.updates)?data.updates:[];
  renderMonths();
 }catch{
  $('#monthly-reports').textContent='Hindi ma-load ang monthly updates sa ngayon. Subukan muli mamaya.';
 }
}
monthSelect.onchange=renderMonths;loadTransparency();
