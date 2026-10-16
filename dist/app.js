let projects=[],filter='Lahat';
const publishedPHT=iso=>{
 if(!iso)return 'Petsa hindi naitala';
 const d=new Date(iso);
 return Number.isFinite(d.getTime())
  ?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(d)+' PHT'
  :'Petsa hindi naitala';
};

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

function render(){const q=$('#search').value.toLocaleLowerCase();const found=projects.filter(p=>(filter==='Lahat'||p.status===filter)&&`${p.title} ${p.category} ${p.description}`.toLocaleLowerCase().includes(q));$('#count').textContent=`${found.length} proyekto`;$('#grid').innerHTML=found.map(p=>`<article class="card"><div class="cover" style="background:#e5eafb"><span class="badge">${esc(p.status)}</span>${p.image_id?`<img class="project-photo" src="./api/images/${encodeURIComponent(p.image_id)}" alt="${esc(p.title)}" loading="lazy">`:'<span class="project-placeholder">SK VASRA</span>'}${galleryIds(p).length>1?'<span class="project-photo-badge">+'+(galleryIds(p).length-1)+' photos</span>':''}</div><div class="cardbody"><div class="category">${esc(p.category)}</div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="progresslabel"><span>Progreso</span><b>${p.progress}%</b></div><div class="track"><div style="width:${p.progress}%"></div></div><div class="cardbottom"><span class="card-publish-date"><span aria-hidden="true">▣</span> Na-publish: <strong>${esc(publishedPHT(p.publish_at))}</strong></span><button data-id="${esc(p.id)}">See More ↗</button></div></div></article>`).join('')||`<div class="empty"><span class="empty-icon" aria-hidden="true">▤</span><h3>${projects.length?"Walang tugmang proyekto":"May mga bagong hakbang na darating."}</h3><p>${projects.length?"Subukan ang ibang salita o piliin ang ibang status ng proyekto.":"Dito makikita ang mga inilathalang programa at progreso ng SK Vasra."}</p><a class="secondary" href="./contacts.html">May ideya ka? Makipag-ugnay ↗</a></div>`;$('#stat-all').textContent=projects.length;$('#stat-active').textContent=projects.filter(p=>p.status==='Isinasagawa').length;$('#stat-done').textContent=projects.filter(p=>p.status==='Natapos').length;$('#stat-planned').textContent=projects.filter(p=>p.status==='Pinaplano').length;}
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
