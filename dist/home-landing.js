'use strict';
/* Homepage-only data. Never use invented example counts or project cards. */
(()=> {
 const node=id=>document.getElementById(id);
 const safe=value=>typeof esc==='function'?esc(String(value??'')):String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const projectTitleForDisplay=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
 const set=(id,value)=>{const el=node(id);if(el)el.textContent=String(value)};
 const timeZone='Asia/Manila';
 const dateParts=()=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 const formatDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-PH',{timeZone,month:'short',day:'numeric',year:'numeric'}).format(d)};
 const ratio=v=>Math.max(0,Math.min(100,Number(v)||0));
 // Match the public Projects ordering: title date, or published day if undated.
 async function projects(){
  try{
   const result=await api('./api/projects');
   const all=Array.isArray(result.projects)?result.projects:[];
   set('home-total-projects',all.length);
   const cards=window.SKProjectOrder.sortProjectsNewestFirst(all).slice(0,4);
   node('home-recent-projects').innerHTML=cards.length?cards.map(p=>{
    const done=p.status==='Natapos';const pct=ratio(p.progress);
    const image=p.image_id?'<img src="./api/images/'+encodeURIComponent(p.image_id)+'" loading="lazy" alt="'+safe(p.title)+'">':'';
    return '<a class="home-recent-card'+(done?' done':'')+'" href="./projects"><span class="home-recent-cover">'+image+'<span class="home-recent-category">'+safe(p.category||'Programa')+'</span></span><span class="home-recent-details"><h3 class="project-unified-title">'+safe(projectTitleForDisplay(p.title))+'</h3><span class="home-recent-date">'+safe(formatDate(p.published_at||p.updated||p.created_at))+'</span><span class="home-recent-progress"><span class="home-recent-track"><span style="width:'+pct+'%"></span></span>'+pct+'%</span><span class="home-recent-state">'+safe(done?'✓ Completed':p.status==='Isinasagawa'?'Ongoing':p.status||'Pinaplano')+'</span></span></a>';
   }).join(''):'<p class="home-recent-placeholder">Wala pang nailathalang proyekto.</p>';
  }catch{
   set('home-total-projects','—');
   node('home-recent-projects').innerHTML='<p class="home-recent-placeholder">Hindi ma-load ang mga proyekto. Buksan ang Projects page upang subukang muli.</p>';
  }
 }
 async function leaders(){
  try{
   const result=await api('./api/transparency');
   const list=Array.isArray(result.officials)?result.officials:[];
   set('home-total-leaders',list.filter(p=>p.published!==false&&p.verified!==false).length);
  }catch{set('home-total-leaders','—')}
 }
 async function achievements(){
  try{
   const result=await api('./api/achievements');
   const list=Array.isArray(result.awards)?result.awards:[];
   set('home-total-awards',list.length);
  }catch{set('home-total-awards','—')}
 }
 async function duty(){
  try{
   const result=await api('./api/duty-status',{cache:'no-store'});
   const p=dateParts(),today=p.year+'-'+p.month+'-'+p.day;
   const minutes=Number(p.hour)*60+Number(p.minute);
   const parse=s=>{const n=String(s).split(':').map(Number);return n[0]*60+(n[1]||0)};
   const isHours=minutes>=parse(result.open_time||'09:00')&&minutes<parse(result.close_time||'18:00');
   const closed=result.mode==='closed'&&result.date===today;
   set('home-duty-summary',isHours&&!closed?'Open':'Closed');
   const fmtTime=(raw,fallback)=>{
    const m=/^(\d{1,2}):(\d{2})/.exec(String(raw||fallback));
    if(!m)return fallback;
    const hour=Number(m[1]),minute=Number(m[2]);
    if(hour>23||minute>59)return fallback;
    return (hour%12||12)+':'+String(minute).padStart(2,'0')+(hour<12?' AM':' PM');
   };
   set('home-duty-description','Oras ng duty: '+fmtTime(result.open_time,'09:00')+' – '+fmtTime(result.close_time,'18:00'));
  }catch{set('home-duty-summary','—');set('home-duty-description','Hindi makumpirma ang duty status')}
 }
 projects();leaders();achievements();duty();
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
