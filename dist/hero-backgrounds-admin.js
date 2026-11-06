'use strict';
/* One Chairman editor controls five independently saved public hero backgrounds. */
(()=>{
 const panel=document.getElementById('panel-hero-backgrounds');
 if(!panel)return;
 const select=document.getElementById('hero-target-select');
 const preview=document.getElementById('hero-editor-preview');
 const input=document.getElementById('hero-editor-file');
 const saveButton=document.getElementById('hero-save-btn');
 const resetButton=document.getElementById('hero-reset-btn');
 const status=document.getElementById('hero-admin-status');
 const message=document.getElementById('hero-selection-message');
 const uploadLabel=panel.querySelector('.hero-editor-upload');
 const labels={
  home:'Homepage Hero',projects:'Projects Hero',duty:'SK Duty Hero',
  transparency:'Transparency Hero',contacts:'Contacts Hero'
 };
 if(!select||!preview||!input||!saveButton||!resetButton||!status||!message||!uploadLabel)return;
 let saved=[],pendingFile=null,objectUrl='',busy=false,revision=0,loaded=false;
 const key=()=>Object.hasOwn(labels,select.value)?select.value:'home';
 const find=which=>saved.find(item=>item.key===which);
 const hasImage=which=>find(which)?.has_image===true;
 const currentUrl=which=>{
  const record=find(which);
  return record?.has_image===true?
   '/api/hero-backgrounds/'+which+'/image?v='+encodeURIComponent(record.updated_at||'latest'):'';
 };
 const setStatus=(text,error=false)=>{
  status.textContent=text;
  status.dataset.error=String(error);
 };
 const setMessage=(text,error=false)=>{
  message.textContent=text;
  message.dataset.error=String(error);
 };
 const clearPreviewUrl=()=>{
  if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}
 };
 const renderPreview=()=>{
  const activeKey=key();
  const src=(pendingFile&&objectUrl)||currentUrl(activeKey);
  const hint=src?null:document.createElement('span');
  preview.replaceChildren();
  if(src){
   const picture=document.createElement('img');
   picture.src=src;
   picture.alt=labels[activeKey]+' background preview';
   picture.onerror=()=>{
    if(preview.contains(picture)){
     const fallback=document.createElement('span');
     fallback.textContent='Preview unavailable. Reopen Hero Backgrounds to refresh.';
     preview.replaceChildren(fallback);
    }
   };
   preview.appendChild(picture);
  }else{
   hint.textContent='No custom background uploaded. Original hero design is active.';
   preview.appendChild(hint);
  }
 };
 const updateButtons=()=>{
  const locked=busy||!loaded;
  select.disabled=locked;
  input.disabled=locked;
  uploadLabel.classList.toggle('is-disabled',locked);
  saveButton.disabled=locked||!pendingFile;
  resetButton.disabled=locked||!hasImage(key());
 };
 const resetSelection=()=>{
  revision++;
  clearPreviewUrl();
  pendingFile=null;
  input.value='';
  setMessage('');
  renderPreview();
  updateButtons();
 };
 const fetchSaved=async()=>{
  const response=await api('/api/hero-backgrounds/manage');
  if(!Array.isArray(response.items))throw Error('Unable to load hero backgrounds.');
  saved=response.items;
  loaded=true;
 };
 const fileBase64=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('Could not read selected image.'));
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.readAsDataURL(file);
 });
 const inspectImage=file=>new Promise((resolve,reject)=>{
  const local=URL.createObjectURL(file);
  const picture=new Image();
  picture.onload=()=>{
   const dimensions={width:picture.naturalWidth,height:picture.naturalHeight};
   URL.revokeObjectURL(local);
   dimensions.width>0&&dimensions.height>0?resolve(dimensions):reject(Error('Invalid image.'));
  };
  picture.onerror=()=>{URL.revokeObjectURL(local);reject(Error('Invalid image.'))};
  picture.src=local;
 });
 window.loadHeroBackgroundAdmin=async()=>{
  if(busy)return;
  busy=true;updateButtons();setStatus('Loading hero backgrounds…');
  try{
   await fetchSaved();
   resetSelection();
   setStatus('Select a page, choose an image, then save. Each page keeps its own background.');
  }catch(error){
   loaded=false;resetSelection();
   setStatus(error.message||'Could not load hero backgrounds.',true);
  }finally{busy=false;updateButtons();}
 };
 select.addEventListener('change',()=>{
  if(busy)return;
  resetSelection();
  setStatus('Editing '+labels[key()]+'.');
 });
 input.addEventListener('change',async()=>{
  if(busy)return;
  const file=input.files?.[0];if(!file)return;
  const activeRevision=++revision;
  const activeKey=key();
  if(file.size<100||file.size>2000000||
   !['image/jpeg','image/png','image/webp'].includes(file.type)){
   input.value='';
   setMessage('Select a valid JPG, PNG or WebP image (maximum 2 MB).',true);
   return;
  }
  setMessage('Checking image…');
  try{
   const dimensions=await inspectImage(file);
   if(activeRevision!==revision||activeKey!==key())return;
   clearPreviewUrl();
   pendingFile=file;
   objectUrl=URL.createObjectURL(file);
   renderPreview();
   updateButtons();
   const warning=dimensions.width<1200||dimensions.width/dimensions.height<1.4?
    ' Landscape 1600 × 900 is recommended to avoid cropping.':' Ready to save.';
   setMessage(dimensions.width+' × '+dimensions.height+' selected.'+warning);
  }catch(error){
   if(activeRevision!==revision)return;
   input.value='';
   setMessage(error.message||'Could not preview image.',true);
  }
 });
 const action=async type=>{
  if(busy||!loaded)return;
  const selected=key();
  const file=pendingFile;
  if(type==='save'&&!file)return;
  if(type==='reset'&&!hasImage(selected))return;
  if(type==='reset'&&!window.confirm('Restore the original background for '+labels[selected]+'?'))return;
  busy=true;updateButtons();
  setStatus((type==='save'?'Uploading ':'Restoring original background for ')+labels[selected]+'…');
  let succeeded=false;
  try{
   if(type==='save'){
    const data=await fileBase64(file);
    await api('/api/hero-backgrounds/upload',{method:'POST',
     body:JSON.stringify({key:selected,mime:file.type,data})});
   }else{
    await api('/api/hero-backgrounds/reset',{method:'POST',
     body:JSON.stringify({key:selected})});
   }
   succeeded=true;
   await fetchSaved();
   resetSelection();
   setStatus(labels[selected]+(type==='save'?' background saved successfully.':' default background restored.'));
   window.showVasraToast?.('Hero background updated.','success');
  }catch(error){
   setStatus(succeeded?'Saved, but preview refresh failed. Reopen Hero Backgrounds.':
    (error.message||'Could not update hero background.'),true);
  }finally{
   busy=false;
   updateButtons();
  }
 };
 saveButton.addEventListener('click',()=>action('save'));
 resetButton.addEventListener('click',()=>action('reset'));
 window.addEventListener('pagehide',clearPreviewUrl);
})();
