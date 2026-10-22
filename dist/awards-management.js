'use strict';
// SK officers submit drafts with up to 12 award photos. Only Chairman can publish.
let staffAwards=[],awardImageList=[],awardPendingFiles=[],awardEditing=null,awardBusy=false;
const awardDialog=document.querySelector('#award-dialog');
function awardOpen(){if(!awardDialog.open)awardDialog.showModal()}
function awardClose(){if(!awardBusy&&awardDialog.open)awardDialog.close()}
function awardMode(v){document.querySelector('#award-facebook-panel').hidden=v!=='facebook';for(const mode of ['manual','facebook']){const b=document.querySelector('#award-mode-'+mode);b.classList.toggle('selected',mode===v);b.setAttribute('aria-pressed',String(mode===v))}}
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
function awardClearPhotos(){awardPendingFiles=[];awardImageList=[];document.querySelector('#award-photos').value='';renderAwardPhotos()}
function renderAwardPhotos(){
 const total=awardImageList.length+awardPendingFiles.length;
 document.querySelector('#award-photo-thumbs').innerHTML=[
  ...awardImageList.map((id,i)=>'<div class="award-thumb"><img src="./api/images/'+encodeURIComponent(id)+'" alt="Saved award image '+(i+1)+'"><button type="button" data-award-drop-saved="'+i+'" aria-label="Remove image '+(i+1)+'">×</button>'+(i===0?'<span>Cover</span>':'')+'</div>'),
  ...awardPendingFiles.map((item,i)=>'<div class="award-thumb"><img src="'+item.url+'" alt="New award image '+(i+1)+'"><button type="button" data-award-drop-new="'+i+'" aria-label="Remove new image '+(i+1)+'">×</button>'+(i===0&&!awardImageList.length?'<span>Cover</span>':'')+'</div>')
 ].join('');
 awardStatus.textContent=total+' / 12 photos. Ang unang larawan ang public cover pagkatapos ma-publish.';
}
function awardClear(){
 awardEditing=null;awardForm.reset();awardForm.elements.id.value='';
 for(const item of awardPendingFiles)URL.revokeObjectURL(item.url);
 awardClearPhotos();awardMode('manual');
 document.querySelector('#award-save').textContent='Save Award Draft';
 document.querySelector('#award-publish').hidden=true;
 awardStatus.textContent='Bagong award draft. Lahat ng SK officers ay puwedeng mag-submit; Chairman ang mag-aapruba.';
}
document.querySelector('#award-reset').onclick=awardClear;
document.querySelector('#award-photos').addEventListener('change',e=>{
 const files=[...e.currentTarget.files];e.currentTarget.value='';
 const good=files.filter(f=>['image/jpeg','image/png','image/webp'].includes(f.type)&&f.size>0&&f.size<=5*1024*1024);
 if(good.length!==files.length)message('JPG, PNG o WebP lang at hanggang 5 MB bawat photo.',true);
 if(good.length+awardImageList.length+awardPendingFiles.length>12){message('Maximum 12 award photos lamang.',true);return}
 for(const file of good)awardPendingFiles.push({file,url:URL.createObjectURL(file)});
 renderAwardPhotos();
});
document.querySelector('#award-photo-thumbs').addEventListener('click',e=>{
 const saved=e.target.closest('[data-award-drop-saved]'),newfile=e.target.closest('[data-award-drop-new]');
 if(saved)awardImageList.splice(Number(saved.dataset.awardDropSaved),1);
 if(newfile){const [item]=awardPendingFiles.splice(Number(newfile.dataset.awardDropNew),1);if(item)URL.revokeObjectURL(item.url)}
 renderAwardPhotos();
});
function awardEdit(a){
 if(!awardCanEdit(a)){message('Only your own unpublished draft or Chairman-managed awards can be edited.',true);return;}
 awardClear();awardEditing=a.id;
 const f=awardForm.elements;
 f.id.value=a.id;f.title.value=a.title;f.category.value=a.category;f.issuer.value=a.issuer;f.award_date.value=a.award_date;
 f.description.value=a.description||'';f.reference_url.value=a.reference_url||'';
 awardImageList=Array.isArray(a.image_ids)?[...a.image_ids]:a.image_id?[a.image_id]:[];
 renderAwardPhotos();
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
  for(let i=0;i<awardPendingFiles.length;i++){
   const progress='Uploading award photo '+(i+1)+' of '+awardPendingFiles.length+'…';
   awardStatus.textContent=progress;
   projectUploadStatus(progress);
   photos.push(await uploadProjectPhoto(awardPendingFiles[i].file));
   uploadedCount++;
  }
  awardStatus.textContent='Saving '+(publish?'published award':'award draft')+' to database…';
  const data={id:awardEditing||null,title:f.title.value.trim(),category:f.category.value,
   issuer:f.issuer.value.trim(),award_date:f.award_date.value,
   description:f.description.value.trim(),reference_url:f.reference_url.value.trim()||null,
   image_ids:photos,published:publish||(user?.role==='chairman'&&awardMine(awardEditing)?.published===true)};
  const result=await api('./api/manage/achievements',{method:'POST',body:JSON.stringify(data)});
  if(result?.ok!==true)throw Error('Database did not confirm saving the award.');
  const notice=publish?'Award is now published on Home and Achievements page.':'Award saved as draft for Chairman approval.';
  projectUploadStatus(notice,'success');
  success(notice);
  awardClear();awardClose();await loadAwards();
 }catch(e){
  // Preserve the current draft AND every pending file that has not uploaded yet.
  // Only completed uploads are moved into the saved IDs list; retry resumes at
  // the failed photo rather than losing selections or re-uploading completed ones.
  awardImageList=photos;
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
 if(caption.length<15){status.textContent='Maglagay ng Facebook caption na may 15+ characters.';field.focus();return}
 button.disabled=true;status.textContent='Sinusuri ang caption gamit ang AI analyzer…';
 try{
  const result=await api('./api/manage/projects/import-facebook',{method:'POST',body:JSON.stringify({caption})});
  if(!result?.ok||!result.draft)throw Error(result?.message||'Walang available na AI draft.');
  const d=result.draft,f=awardForm.elements;
  f.title.value=String(d.title||'').slice(0,180);
  f.description.value=String(d.scope||d.summary||caption).slice(0,3000);
  status.textContent='AI-assisted draft lamang. I-review ang title, category, issuer at petsa; hindi ito automatic na ipo-publish.';
  awardMode('manual');
 }catch(e){status.textContent='Hindi gumana ang AI analysis: '+(e.message||'Subukan muli.')+'. Puwede ang Manual Entry.';}
 finally{button.disabled=false}
};
awardClear();