'use strict';
(()=>{
 const $=q=>document.querySelector(q);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let saved=[],busy=false;
 const msg=(m,error=false)=>{const el=$('#skres-admin-message');el.textContent=m;el.dataset.kind=error?'error':'info';};
 const allowedUrl=value=>{
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&
   ((u.hostname==='drive.google.com'&&(
    /^\/(file\/d|drive\/folders)\/[A-Za-z0-9_-]+/.test(u.pathname)||
    (u.pathname==='/open'&&/^[A-Za-z0-9_-]+$/.test(u.searchParams.get('id')||''))))||
    (u.hostname==='docs.google.com'&&/^\/(document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]+/.test(u.pathname)));
  }catch{return false;}
 };
 const list=()=>{
  const q=$('#skres-admin-search').value.toLowerCase().trim();
  const matching=saved.filter(x=>!q||[x.number,x.title,x.year,x.description].some(v=>String(v??'').toLowerCase().includes(q)));
  $('#skres-admin-list').innerHTML=matching.length?matching.map(r=>
   '<article class="skres-admin-row"><div class="skres-admin-row-head"><strong>'+esc(r.number)+'</strong>'+
    '<span class="skres-pub-badge'+(r.published?' active':'')+'">'+(r.published?'Published':'Draft')+'</span></div>'+
   '<h4>'+esc(r.title)+'</h4><p>'+esc(r.description||'No description')+'</p>'+
   '<div class="skres-admin-row-footer"><small>'+esc(r.year)+' · '+esc(r.approved_on||'Date not set')+'</small>'+
    '<div><button type="button" data-skres-edit="'+esc(r.id)+'">Edit</button>'+
    (r.published?'<button type="button" data-skres-unpublish="'+esc(r.id)+'">Unpublish</button>':'')+
    '<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">View Drive ↗</a></div></div></article>'
  ).join(''):'<p class="skres-admin-empty">Walang saved SK Resolutions para sa search na ito.</p>';
 };
 const reset=()=>{
  const f=$('#skres-admin-form');f.reset();f.elements.id.value='';
  f.elements.year.value=new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date());
  $('#skres-editor-heading').textContent='Add SK Resolution';$('#skres-admin-save').textContent='Save Resolution';
 };
 const load=async()=>{
  msg('Loading SK Resolutions…');
  try{
   const data=await api('./api/sk-resolutions/manage');
   if(data?.ok!==true||!Array.isArray(data.resolutions))throw Error('Invalid service response');
   saved=data.resolutions;list();msg(saved.length+' saved SK Resolutions · '+saved.filter(r=>r.published).length+' published');
  }catch(e){msg('Hindi ma-load ang SK Resolutions: '+e.message,true);}
 };
 const save=async r=>{
  const data=await api('./api/sk-resolutions/manage',{method:'POST',body:JSON.stringify(r)});
  if(data?.ok!==true)throw Error('Server did not confirm the saved resolution.');
  return data;
 };

 $('#skres-admin-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=e.currentTarget;if(busy||!f.reportValidity())return;
  const d=Object.fromEntries(new FormData(f));
  const params={id:d.id||null,number:d.number.trim(),title:d.title.trim(),
   year:Number(d.year),approved_on:d.approved_on,description:d.description.trim(),
   url:d.url.trim(),published:f.elements.published.checked};
  if(!allowedUrl(params.url)){msg('Only official Google Drive or Docs HTTPS links are allowed.',true);return;}
  if(params.approved_on&&Number(params.approved_on.slice(0,4))!==params.year){msg('Approved date year must match Resolution Year.',true);return;}
  if(params.published&&!confirm('Publish this SK Resolution publicly? Make sure Google Drive is set to Anyone with the link — Viewer, and the document contains no private personal data.'))return;
  const btn=$('#skres-admin-save');busy=true;btn.disabled=true;msg('Saving resolution…');
  try{await save(params);reset();await load();msg('SK Resolution saved'+(params.published?' and published on the public page.': ' as draft.'));}
  catch(error){msg('Hindi na-save: '+error.message,true);}
  finally{busy=false;btn.disabled=false;}
 });
 $('#skres-admin-reset')?.addEventListener('click',event=>{event.preventDefault();reset();});
 $('#skres-admin-search')?.addEventListener('input',list);
 $('#skres-admin-refresh')?.addEventListener('click',load);
 $('#skres-admin-list')?.addEventListener('click',async e=>{
  const edit=e.target.closest('[data-skres-edit]'),unpub=e.target.closest('[data-skres-unpublish]');
  const r=saved.find(x=>x.id===(edit?.dataset.skresEdit||unpub?.dataset.skresUnpublish));
  if(!r)return;
  if(unpub){
   if(!confirm('Unpublish '+r.number+' from public SK Resolutions? This does not delete the Google Drive file.'))return;
   unpub.disabled=true;
   try{await save({...r,published:false});await load();msg('Resolution unpublished. Saved record kept for future editing.');}
   catch(error){unpub.disabled=false;msg(error.message,true);}
   return;
  }
  const f=$('#skres-admin-form');
  for(const key of ['id','number','title','year','description','url','approved_on']){
   const v=key==='number'?r.number:r[key];
   f.elements[key].value=key==='approved_on'?String(v||'').slice(0,10):String(v??'');
  }
  f.elements.published.checked=!!r.published;
  $('#skres-editor-heading').textContent='Edit SK Resolution';$('#skres-admin-save').textContent='Save Changes';
  f.scrollIntoView({behavior:'smooth',block:'center'});f.elements.title.focus();
 });
 reset();
 window.loadSKResolutionsAdmin=load;
})();
