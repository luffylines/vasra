'use strict';
// SK officers submit drafts with up to 12 award photos. Only Chairman can publish.
let staffAwards=[],awardImageList=[],awardPendingFiles=[],awardEditing=null,awardBusy=false,awardCoverSelection=null,awardDraftReady=true;
const awardDialog=document.querySelector('#award-dialog');
function awardOpen(){if(!awardDialog.open)awardDialog.showModal();const scroll=awardDialog.querySelector('.award-modal-scroll');if(scroll)scroll.scrollTop=0;}
function awardClose(){if(!awardBusy&&awardDialog.open)awardDialog.close()}
function awardReviewVisibility(){const hidden=!awardDraftReady;document.querySelector('#award-review-fields').hidden=hidden;document.querySelector('#award-modal-footer').hidden=hidden;}
function awardMode(v){
 const facebook=v==='facebook';
 awardDraftReady=!facebook;
 document.querySelector('#award-facebook-panel').hidden=!facebook;
 for(const mode of ['manual','facebook']){
  const b=document.querySelector('#award-mode-'+mode);b.classList.toggle('selected',mode===v);b.setAttribute('aria-pressed',String(mode===v));
 }
 awardReviewVisibility();
 const scroll=awardDialog.querySelector('.award-modal-scroll');if(scroll)scroll.scrollTop=0;
}
document.querySelector('#award-new').onclick=()=>{awardClear();awardOpen()};
document.querySelector('#award-dialog-close').onclick=awardClose;
awardDialog.addEventListener('click',e=>{if(e.target===awardDialog)awardClose()});
awardDialog.addEventListener('cancel',e=>{if(awardBusy)e.preventDefault()});
document.querySelector('#award-mode-manual').onclick=()=>awardMode('manual');
document.querySelector('#award-mode-facebook').onclick=()=>awardMode('facebook');
const awardForm=document.querySelector('#award-form');
const awardStatus=document.querySelector('#award-form-status');
const awardMine=id=>staffAwards.find(a=>a.id===id);
const awardEsc=s=>esc(String(s||''));
const awardCanEdit=a=>user?.role==='chairman'||(!a.published&&a.created_by===user?.id);
function awardClearPhotos(){
 for(const item of awardPendingFiles)URL.revokeObjectURL(item.url);
 awardPendingFiles=[];awardImageList=[];awardCoverSelection=null;
 document.querySelector('#award-photos').value='';renderAwardPhotos();
}
function renderAwardPhotos(){
 const root=document.querySelector('#award-photo-thumbs');
 const total=awardImageList.length+awardPendingFiles.length;
 if(total&&!awardCoverSelection)awardCoverSelection=awardImageList[0]||awardPendingFiles[0];
 const items=[
  ...awardImageList.map((id,i)=>({saved:true,id,i,url:'./api/images/'+encodeURIComponent(id)})),
  ...awardPendingFiles.map((item,i)=>({saved:false,item,i,url:item.url}))
 ];
 root.replaceChildren();
 for(const photo of items){
  const selected=photo.saved?awardCoverSelection===photo.id:awardCoverSelection===photo.item;
  const holder=document.createElement('div');holder.className='award-thumb'+(selected?' cover-selected':'');
  const img=document.createElement('img');img.src=photo.url;img.alt='Award photo '+(photo.i+1);img.loading='lazy';
  const cover=document.createElement('button');cover.type='button';cover.className='award-set-cover';
  cover.textContent=selected?'✓ Cover':'Set as Cover';cover.setAttribute('aria-pressed',String(selected));
  cover.dataset.awardCover=photo.saved?'saved':'pending';cover.dataset.index=String(photo.i);
  const del=document.createElement('button');del.type='button';del.className='award-remove-photo';
  del.textContent='×';del.setAttribute('aria-label','Remove award photo '+(photo.i+1));
  del.dataset[photo.saved?'awardDropSaved':'awardDropNew']=String(photo.i);
  holder.append(img,cover,del);root.append(holder);
 }
 awardStatus.textContent=total+' / 12 photos. '+(total?'Napili na ang cover; maaari mong palitan sa Set as Cover.':'Pumili ng mga larawan at itakda ang cover.');
}
function awardClear(){
 awardEditing=null;awardForm.reset();awardForm.elements.id.value='';
 awardClearPhotos();awardMode('manual');
 document.querySelector('#award-save').textContent='Save as Draft';
 document.querySelector('#award-publish').hidden=true;
 awardStatus.textContent='Bagong award draft. Lahat ng SK officers ay puwedeng mag-submit; Chairman ang mag-aapruba.';
}
document.querySelector('#award-reset').onclick=awardClear;
document.querySelector('#award-photos').addEventListener('change',e=>{
 const files=[...e.currentTarget.files];e.currentTarget.value='';
 const good=files.filter(f=>['image/jpeg','image/png','image/webp'].includes(f.type)&&f.size>0&&f.size<=5*1024*1024);
 if(good.length!==files.length)message('JPG, PNG o WebP lang at hanggang 5 MB bawat photo.',true);
 if(good.length+awardImageList.length+awardPendingFiles.length>12){message('Maximum 12 award photos lamang.',true);return}
 const scroll=awardDialog.querySelector('.award-modal-scroll');
 const oldScrollTop=scroll?.scrollTop||0;
 for(const file of good)awardPendingFiles.push({file,url:URL.createObjectURL(file)});
 renderAwardPhotos();
 // Native file pickers may scroll the <dialog> itself into view when focus
 // returns, moving its header offscreen and leaving empty space underneath.
 // Preserve the form's scroll only, never allow the outer dialog to scroll.
 e.currentTarget.blur();
 awardDialog.scrollTop=0;
 if(scroll)scroll.scrollTop=oldScrollTop;
 requestAnimationFrame(()=>{
  if(!awardDialog.open)return;
  awardDialog.scrollTop=0;
  if(scroll)scroll.scrollTop=oldScrollTop;
 });
});
document.querySelector('#award-photo-thumbs').addEventListener('click',e=>{
 const cover=e.target.closest('[data-award-cover]');
 if(cover){
  awardCoverSelection=cover.dataset.awardCover==='saved'?awardImageList[Number(cover.dataset.index)]:awardPendingFiles[Number(cover.dataset.index)];
  renderAwardPhotos();return;
 }
 const saved=e.target.closest('[data-award-drop-saved]'),newfile=e.target.closest('[data-award-drop-new]');
 if(saved){const [id]=awardImageList.splice(Number(saved.dataset.awardDropSaved),1);if(awardCoverSelection===id)awardCoverSelection=null;}
 if(newfile){const [item]=awardPendingFiles.splice(Number(newfile.dataset.awardDropNew),1);if(item){if(awardCoverSelection===item)awardCoverSelection=null;URL.revokeObjectURL(item.url)}}
 renderAwardPhotos();
});
function awardEdit(a){
 if(!awardCanEdit(a)){message('Only your own unpublished draft or Chairman-managed awards can be edited.',true);return;}
 awardClear();awardEditing=a.id;
 const f=awardForm.elements;
 f.id.value=a.id;f.title.value=a.title;f.category.value=a.category;f.issuer.value=a.issuer;f.award_date.value=a.award_date;
 f.summary.value='';f.description.value=a.description||'';f.reference_url.value=a.reference_url||'';
 awardImageList=Array.isArray(a.image_ids)?[...a.image_ids]:a.image_id?[a.image_id]:[];
 awardCoverSelection=awardImageList[0]||null;renderAwardPhotos();
 document.querySelector('#award-save').textContent=a.published?'Save Changes':'Update Draft';
 document.querySelector('#award-publish').hidden=user?.role!=='chairman'||a.published;
 awardStatus.textContent=a.published?'Published award · editing requires Chairman approval.':'Draft for review before publishing.';
 awardOpen();
}
function awardRenderList(){
 const root=document.querySelector('#award-manage-list');
 root.innerHTML=staffAwards.length?staffAwards.map(a=>{
  const photo=a.image_ids?.[0]||a.image_id;
  const canEdit=awardCanEdit(a);
  const btn=canEdit?'<button type="button" data-award-edit="'+awardEsc(a.id)+'">Edit</button>':'';
  const publish=!a.published&&user?.role==='chairman'?'<button type="button" data-award-approve="'+awardEsc(a.id)+'">Publish Now</button>':'';
  const archive=user?.role==='chairman'?'<button type="button" class="award-archive" data-award-archive="'+awardEsc(a.id)+'">Delete</button>':'';
  return '<article class="award-manage-row">'+
   (photo?'<img src="./api/images/'+encodeURIComponent(photo)+'" alt="Award cover" loading="lazy">':'<span class="award-manage-placeholder" aria-hidden="true">🏆</span>')+
   '<div><span class="award-manage-status '+(a.published?'published':'draft')+'">'+(a.published?'Published':'Draft · Pending Chairman approval')+'</span>'+
   '<strong>'+awardEsc(a.title)+'</strong><small>'+awardEsc(a.issuer)+' · '+awardEsc(a.award_date)+' · '+(a.image_ids?.length||0)+' photo(s)</small>'+
   '</div><div class="award-manage-row-buttons">'+btn+publish+archive+'</div></article>';
 }).join(''):'<div class="award-empty">Wala pang award records. Gamitin ang form sa itaas upang gumawa ng draft.</div>';
}
async function loadAwards(){
 if(!user)return;
 const root=document.querySelector('#award-manage-list');
 root.textContent='Loading awards…';
 try{
  const result=await api('./api/manage/achievements');
  staffAwards=Array.isArray(result.awards)?result.awards:[];
  awardRenderList();
 }catch(e){
  root.innerHTML='<p class="award-empty">Awards database setup is pending. Hindi pa available ang pag-save hangga’t hindi pa naka-apply ang approved migration.</p>';
  message('Awards: '+e.message,true);
 }
}
async function awardSave(publish=false){
 if(awardBusy)return;
 if(publish&&user?.role!=='chairman')throw Error('Chairman approval required.');
 const f=awardForm.elements,photos=[...awardImageList],btn=publish?document.querySelector('#award-publish'):document.querySelector('#award-save');
 if(!awardForm.reportValidity())return;
 awardBusy=true;btn.disabled=true;
 let uploadedCount=0;
 try{
  const uploaded=new Map();
  for(let i=0;i<awardPendingFiles.length;i++){
   const progress='Uploading award photo '+(i+1)+' of '+awardPendingFiles.length+'…';
   awardStatus.textContent=progress;
   projectUploadStatus(progress);
   const id=await uploadProjectPhoto(awardPendingFiles[i].file);
   photos.push(id);uploaded.set(awardPendingFiles[i],id);
   uploadedCount++;
  }
  const chosen=typeof awardCoverSelection==='string'?awardCoverSelection:uploaded.get(awardCoverSelection);
  if(chosen){const i=photos.indexOf(chosen);if(i>0)photos.unshift(...photos.splice(i,1));}
  awardStatus.textContent='Saving '+(publish?'published award':'award draft')+' to database…';
  const combinedDescription=[f.summary.value.trim(),f.description.value.trim()].filter(Boolean).join('\n\n');
  if(combinedDescription.length>3000)throw Error('Summary + details cannot exceed 3000 characters.');
  const data={id:awardEditing||null,title:f.title.value.trim(),category:f.category.value,
   issuer:f.issuer.value.trim(),award_date:f.award_date.value,
   description:combinedDescription,reference_url:f.reference_url.value.trim()||null,
   image_ids:photos,published:publish||(user?.role==='chairman'&&awardMine(awardEditing)?.published===true)};
  const result=await api('./api/manage/achievements',{method:'POST',body:JSON.stringify(data)});
  if(result?.ok!==true)throw Error('Database did not confirm saving the award.');
  const notice=publish?'Award is now published on Home and Achievements page.':'Award saved as draft for Chairman approval.';
  projectUploadStatus(notice,'success');
  success(notice);
  awardClear();awardDialog.close();await loadAwards();
 }catch(e){
  // Preserve the current draft AND every pending file that has not uploaded yet.
  // Only completed uploads are moved into the saved IDs list; retry resumes at
  // the failed photo rather than losing selections or re-uploading completed ones.
  awardImageList=photos;
  if(uploaded.has(awardCoverSelection))awardCoverSelection=uploaded.get(awardCoverSelection);
  const completedFiles=awardPendingFiles.splice(0,uploadedCount);
  for(const item of completedFiles)URL.revokeObjectURL(item.url);
  renderAwardPhotos();
  awardStatus.textContent='Hindi pa kumpleto ang award save. '+awardPendingFiles.length+' photo(s) pending · Pindutin ulit ang Save Award Draft. '+e.message;
  projectUploadStatus('Award upload needs retry: '+e.message,'error');
  message(e.message,true);
 }finally{awardBusy=false;btn.disabled=false;}
}
awardForm.addEventListener('submit',e=>{e.preventDefault();awardSave(false)});
document.querySelector('#award-publish').onclick=()=>awardSave(true);
document.querySelector('#award-manage-list').addEventListener('click',async e=>{
 const edit=e.target.closest('[data-award-edit]'),approve=e.target.closest('[data-award-approve]'),archive=e.target.closest('[data-award-archive]');
 if(edit){const a=awardMine(edit.dataset.awardEdit);if(a)awardEdit(a);return}
 if(approve){
  const a=awardMine(approve.dataset.awardApprove);
  if(a&&user?.role==='chairman'){awardEdit(a);await awardSave(true)}
  return;
 }
 if(archive){
  const a=awardMine(archive.dataset.awardArchive);
  if(!a||user?.role!=='chairman')return;
  if(!confirm('I-archive ang award "'+a.title+'"? Hindi na ito lalabas sa public site.'))return;
  archive.disabled=true;
  try{
   const result=await api('./api/manage/achievements/archive',{method:'POST',body:JSON.stringify({id:a.id})});
   if(!result?.ok)throw Error('Archive not confirmed');
   success('Award archived.');awardClear();await loadAwards();
  }catch(e){message(e.message,true)}finally{archive.disabled=false;}
 }
});
document.querySelector('#award-analyze').onclick=async()=>{
 const field=document.querySelector('#award-caption'),status=document.querySelector('#award-ai-status'),button=document.querySelector('#award-analyze');
 const caption=field.value.trim();
 const box=document.querySelector('#award-ai-recognitions');box.hidden=true;
 document.querySelector('#award-ai-evidence').textContent='';
 if(caption.length<15){status.textContent='Maglagay ng Facebook caption na may 15+ characters.';field.focus();return}
 button.disabled=true;status.textContent='Sinusuri ang caption gamit ang AI analyzer…';
 try{
  const result=await api('./api/manage/achievements/analyze-caption',{method:'POST',body:JSON.stringify({caption})});
  if(!result?.ok||!result.draft)throw Error(result?.message||'Walang available na AI draft.');
  const d=result.draft,f=awardForm.elements;
  const names=Array.isArray(d.recognitions)?d.recognitions:[];
  const select=document.querySelector('#award-recognition-select');
  const evidence=document.querySelector('#award-ai-evidence');
  select.replaceChildren();
  function chooseAward(name){
   f.title.value=String(name||'').slice(0,180);
   f.category.value='Award';
   f.issuer.value=String(d.issuer||'').slice(0,180);
   // No reliable award date can be inferred from a Facebook posting date.
   f.award_date.value='';
   f.summary.value=String(d.summary||'').slice(0,350);
   f.description.value=String(d.description||caption).slice(0,2500);
   evidence.textContent='Pangalan mula sa caption: '+name+' · Kumpirmahin ang awarding organization at aktuwal na petsa bago mag-save.';
  }
  for(const name of names){
   const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);
  }
  if(!names.length){
   box.hidden=false;select.hidden=true;
   f.title.value='';f.issuer.value='';f.award_date.value='';
   f.summary.value='';f.description.value=caption.slice(0,2500);
   evidence.textContent='Hindi matukoy ang eksaktong parangal sa caption. Ilagay ito nang manual; hindi gagawa ng pekeng award ang system.';
  }else{
   box.hidden=false;select.hidden=names.length<2;
   chooseAward(names[0]);
   select.onchange=()=>chooseAward(select.value);
  }
  awardDraftReady=names.length>0;awardReviewVisibility();
  // Do not expose an empty fake award form when the AI found no award.
  // Officers may correct the caption or switch to Manual Entry.
  // Keep recognition selector visible so users can choose among multiple
  // real awards from the same Facebook post; show editable form underneath.
  document.querySelector('#award-facebook-panel').hidden=false;
  status.textContent=!names.length?
   'Walang natukoy na award title. Suriin ang caption at pindutin ang Analyze muli; o piliin ang Manual Entry.':
   names.length>1?'May '+names.length+' na magkahiwalay na pagkilala. Pumili ng isa sa bawat award record at i-review ang petsa at issuer.':
   'Award draft para sa manual review. Kumpirmahin ang awarding organization at exact award date.';
  const scroll=awardDialog.querySelector('.award-modal-scroll');if(scroll)scroll.scrollTop=0;
  message('Award-specific caption analysis complete. Confirm missing details before saving.');
 }catch(e){status.textContent='Hindi gumana ang AI analysis: '+(e.message||'Subukan muli.')+'. Puwede ang Manual Entry.';}
 finally{button.disabled=false}
};
awardClear();