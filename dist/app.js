let projects=[],filter='Lahat';
const publishedPHT=iso=>{
 if(!iso)return 'Petsa hindi naitala';
 const d=new Date(iso);
 return Number.isFinite(d.getTime())
  ?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(d)+' PHT'
  :'Petsa hindi naitala';
};

// Sort by actual activity date in the title first, not the upload/publish
// timestamp. Supports the historic projects with no stored activity_date.
const monthNumber={january:1,enero:1,february:2,pebrero:2,march:3,marso:3,april:4,abril:4,may:5,mayo:5,june:6,hunyo:6,july:7,hulyo:7,august:8,agosto:8,september:9,setyembre:9,septiyembre:9,october:10,oktubre:10,november:11,nobyembre:11,december:12,disyembre:12};
function projectActivityTimestamp(p){
 const text=String(p.title||'').normalize('NFKC');
 const names=Object.keys(monthNumber).join('|');
 const m=text.match(new RegExp('\\b('+names+')\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b','i'))||
  text.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th|ng)?\\s+(?:ng\\s+)?('+names+')\\s*,?\\s*(20\\d{2})\\b','i'));
 let fromTitle=null;
 if(m){
  const nameFirst=Object.hasOwn(monthNumber,m[1].toLowerCase());
  const mon=monthNumber[(nameFirst?m[1]:m[2]).toLowerCase()];
  const day=Number(nameFirst?m[2]:m[1]),year=Number(m[3]);
  const d=Date.UTC(year,mon-1,day);
  if(new Date(d).getUTCMonth()===mon-1&&new Date(d).getUTCDate()===day)fromTitle=d;
 }
 // Explicit activity date, where present, takes precedence over a title date.
 const declared=typeof p.activity_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.activity_date)
  ?Date.parse(p.activity_date+'T00:00:00Z'):NaN;
 return Number.isFinite(declared)?declared:(fromTitle??NaN);
}
function sortProjectsNewestFirst(rows){
 return [...rows].sort((a,b)=>{
  const aActivity=projectActivityTimestamp(a),bActivity=projectActivityTimestamp(b);
  const aValue=Number.isFinite(aActivity)?aActivity:Date.parse(a.publish_at||'')||0;
  const bValue=Number.isFinite(bActivity)?bActivity:Date.parse(b.publish_at||'')||0;
  return bValue-aValue||(Date.parse(b.publish_at||'')||0)-(Date.parse(a.publish_at||'')||0)||String(a.id).localeCompare(String(b.id));
 });
}

// Compact card date: same locale/timezone for every project, with separate
// date and time spans so one unusually long timestamp cannot move the CTA.
function publishedCardDate(iso){
 const parsed=new Date(iso||'');
 if(!Number.isFinite(parsed.getTime()))return '<span class="project-card-date-missing">Petsa hindi naitala</span>';
 const date=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}).format(parsed);
 const time=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}).format(parsed)+' PHT';
 return '<time datetime="'+esc(parsed.toISOString())+'" title="Na-publish: '+esc(date+' · '+time)+'"><span class="project-card-date-day">'+esc(date)+'</span><span class="project-card-date-separator" aria-hidden="true">·</span><span class="project-card-date-time">'+esc(time)+'</span></time>';
}
const galleryIds=p=>Array.isArray(p.image_ids)&&p.image_ids.length?p.image_ids:(p.image_id?[p.image_id]:[]);
const galleryUrl=id=>'./api/images/'+encodeURIComponent(id);
function projectGallery(p){
 const ids=galleryIds(p);if(!ids.length)return '';
 return '<section class="project-detail-gallery" aria-label="Project photos">'+
  '<button type="button" class="project-gallery-cover" id="detail-cover-trigger" aria-label="Palakihin ang larawan"><img id="detail-cover-image" src="'+galleryUrl(ids[0])+'" alt="'+esc(p.title)+' cover"><span class="photo-zoom-label">⌕ Palakihin ang larawan</span></button>'+
  (ids.length>1?'<div class="project-gallery-thumbs">'+ids.map((id,index)=>
   '<button type="button" class="project-gallery-thumb'+(index===0?' selected':'')+'" data-gallery-image="'+esc(id)+'" aria-label="View photo '+(index+1)+'">'+
    '<img src="'+galleryUrl(id)+'" alt="" loading="lazy"></button>').join('')+'</div>':'')+
  '<p class="project-gallery-count">'+ids.length+' larawan · Piliin ang thumbnail para palakihin.</p></section>';
}

function render(){const q=$('#search').value.toLocaleLowerCase();const found=sortProjectsNewestFirst(projects.filter(p=>(filter==='Lahat'||p.status===filter)&&`${p.title} ${p.category} ${p.description}`.toLocaleLowerCase().includes(q)));$('#count').textContent=`${found.length} proyekto`;$('#grid').innerHTML=found.map(p=>`<article class="card"><div class="cover" style="background:#e5eafb"><span class="badge">${esc(p.status)}</span><span class="project-placeholder" aria-hidden="true">SK VASRA</span>${galleryIds(p).length?`<img class="project-photo" data-project-cover src="${galleryUrl(galleryIds(p)[0])}" alt="${esc(p.title)} cover photo" loading="lazy" decoding="async">`:''}${galleryIds(p).length>1?'<span class="project-photo-badge">+'+(galleryIds(p).length-1)+' photos</span>':''}</div><div class="cardbody"><div class="category">${esc(p.category)}</div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="project-card-bottom"><div class="project-card-progress"><div class="progresslabel"><span>Progreso</span><b>${p.progress}%</b></div><div class="track"><div style="width:${p.progress}%"></div></div></div><div class="cardbottom"><span class="card-publish-date"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/></svg><span class="project-card-published-at">${publishedCardDate(p.publish_at)}</span></span><button type="button" class="project-see-more" data-id="${esc(p.id)}" aria-label="See more details about ${esc(p.title)}"><span>See More</span><span class="project-see-more-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span></button></div></div></div></article>`).join('')||`<div class="empty"><span class="empty-icon" aria-hidden="true">▤</span><h3>${projects.length?"Walang tugmang proyekto":"May mga bagong hakbang na darating."}</h3><p>${projects.length?"Subukan ang ibang salita o piliin ang ibang status ng proyekto.":"Dito makikita ang mga inilathalang programa at progreso ng SK Vasra."}</p><a class="secondary" href="./contacts.html">May ideya ka? Makipag-ugnay ↗</a></div>`;$('#stat-all').textContent=projects.length;$('#stat-active').textContent=projects.filter(p=>p.status==='Isinasagawa').length;$('#stat-done').textContent=projects.filter(p=>p.status==='Natapos').length;$('#stat-planned').textContent=projects.filter(p=>p.status==='Pinaplano').length;}
// Broken public image links fall back to branding rather than leaving an empty card.
$('#grid').addEventListener('error',event=>{
 if(event.target.matches?.('[data-project-cover]'))event.target.hidden=true;
},true);
$('#search').addEventListener('input',render);document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});render()}));
let detailProjectId=null;
const moneyLabel=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v));
const thisManilaYear=Number(new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date()));
function detailMonthLabel(s){return new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(String(s).slice(0,10)+'T12:00:00Z'))}
async function loadProjectHistory(){
 const year=Number($('#detail-year').value),month=$('#detail-month').value,pid=detailProjectId;
 $('#detail-monthly').innerHTML='<div class="trans-empty">Loading published monthly reports...</div>';
 try{
  const b=await api('./api/transparency?year='+year);
  if(pid!==detailProjectId||!$('#detail').open)return;
  const reports=(b.updates||[]).filter(r=>r.project_id===pid&&(month==='all'||String(r.month).slice(5,7)===month));
  $('#detail-monthly').innerHTML=reports.length?reports.map(r=>'<article class="trans-report"><div class="trans-report-top"><strong>'+esc(detailMonthLabel(r.month))+'</strong><span>Published</span></div><p>'+esc(r.summary)+'</p><div class="trans-meta">Reported expense: <b>'+(r.expense===null?'Not reported':moneyLabel(r.expense))+'</b></div></article>').join(''):'<div class="trans-empty">No published monthly updates for this project and period yet.</div>';
 }catch(e){if(pid===detailProjectId)$('#detail-monthly').textContent='Unable to load monthly updates: '+e.message}
}
$('#grid').addEventListener('click',e=>{
 const button=e.target.closest('[data-id]');if(!button)return;
 const p=projects.find(x=>x.id===button.dataset.id);if(!p)return;
 detailProjectId=p.id;
 let years='';
 for(let y=thisManilaYear+1;y>=2020;y--)years+='<option value="'+y+'"'+(y===thisManilaYear?' selected':'')+'>'+y+'</option>';
 let months='<option value="all">All months</option>';
 for(let m=1;m<=12;m++){let value=String(m).padStart(2,'0');months+='<option value="'+value+'">'+new Intl.DateTimeFormat('en-PH',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2025,m-1,1)))+'</option>'}
 $('#detailbody').innerHTML='<div class="eyebrow">'+esc(p.category)+'</div><h2>'+esc(p.title)+'</h2>'+projectGallery(p)+'<p><b>'+esc(p.status)+'</b> · '+p.progress+'%</p><p>'+esc(p.description)+'</p><h3>Project scope</h3><p class="preserve">'+esc(p.scope)+'</p><div class="detail-publication-meta"><span>Na-publish noong</span><strong>'+esc(publishedPHT(p.publish_at))+'</strong></div><p class="muted">Last updated: '+dateText(p.updated)+'</p><h3>Monthly Project Updates</h3><div class="trans-sectionhead"><label class="trans-picker">Year <select id="detail-year">'+years+'</select></label><label class="trans-picker">Month <select id="detail-month">'+months+'</select></label></div><div id="detail-monthly" class="trans-report-list"></div><p class="muted"><a href="./transparency">View annual SK transparency ↗</a></p>';
 $('#detail').showModal();loadProjectHistory();
});
let lightboxIndex=0,lightboxImages=[],lightboxTitle='';
function renderLightbox(){
 const img=$('#lightbox-image');
 if(!img||!lightboxImages.length)return;
 img.src=galleryUrl(lightboxImages[lightboxIndex]);
 img.alt=lightboxTitle+' — larawan '+(lightboxIndex+1)+' sa '+lightboxImages.length;
 $('#lightbox-counter').textContent=(lightboxIndex+1)+' / '+lightboxImages.length;
 $('#lightbox-prev').disabled=lightboxImages.length<2;
 $('#lightbox-next').disabled=lightboxImages.length<2;
}
function openProjectLightbox(){
 const p=projects.find(x=>x.id===detailProjectId);
 if(!p)return;
 lightboxImages=galleryIds(p);if(!lightboxImages.length)return;
 lightboxTitle=p.title;
 const active=$('#detail-cover-image')?.getAttribute('src');
 lightboxIndex=Math.max(0,lightboxImages.findIndex(id=>galleryUrl(id)===active));
 $('#lightbox-title').textContent=lightboxTitle;
 renderLightbox();
 $('#image-lightbox').showModal();
}
function advanceLightbox(step){
 if(!lightboxImages.length)return;
 lightboxIndex=(lightboxIndex+step+lightboxImages.length)%lightboxImages.length;
 renderLightbox();
 const id=lightboxImages[lightboxIndex];
 const main=$('#detail-cover-image');
 if(main)main.src=galleryUrl(id);
 document.querySelectorAll('.project-gallery-thumb').forEach(button=>button.classList.toggle('selected',button.dataset.galleryImage===id));
}
$('#detail').addEventListener('click',e=>{
 if(e.target.closest('#detail-cover-trigger')){openProjectLightbox();return;}
 const thumb=e.target.closest('[data-gallery-image]');if(!thumb)return;
 const cover=$('#detail-cover-image');if(!cover)return;
 cover.src=galleryUrl(thumb.dataset.galleryImage);
 document.querySelectorAll('.project-gallery-thumb').forEach(button=>button.classList.toggle('selected',button===thumb));
 openProjectLightbox();
});
$('#lightbox-prev').addEventListener('click',()=>advanceLightbox(-1));
$('#lightbox-next').addEventListener('click',()=>advanceLightbox(1));
$('#lightbox-close').addEventListener('click',()=>$('#image-lightbox').close());
$('#image-lightbox').addEventListener('click',e=>{if(e.target.id==='image-lightbox')e.target.close();});
document.addEventListener('keydown',e=>{
 if(!$('#image-lightbox').open)return;
 if(e.key==='ArrowLeft'){e.preventDefault();advanceLightbox(-1)}
 if(e.key==='ArrowRight'){e.preventDefault();advanceLightbox(1)}
});

$('#detail').addEventListener('change',e=>{if(e.target.id==='detail-year'||e.target.id==='detail-month')loadProjectHistory()});
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());let installPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});async function install(){if(installPrompt){await installPrompt.prompt();installPrompt=null}else $('#installhelp').showModal()}$('#install').onclick=install;$('#install2').onclick=install;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));render();api('./api/projects').then(b=>{projects=b.projects;render()}).catch(e=>{$('#count').textContent='Hindi ma-load ang mga proyekto.';$('#grid').innerHTML=`<div class="empty">${esc(e.message)}</div>`});if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
