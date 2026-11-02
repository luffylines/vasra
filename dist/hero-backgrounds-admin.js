'use strict';
(()=>{
 const host=document.getElementById('hero-admin-grid');
 const status=document.getElementById('hero-admin-status');
 if(!host||!status)return;
 const entries=[
  ['home','Homepage Hero','Homepage'],
  ['projects','Projects Hero','Projects'],
  ['duty','SK Duty Hero','SK Duty'],
  ['transparency','Transparency Hero','Transparency'],
  ['contacts','Contacts Hero','Contacts']
 ];
 const pending=new Map(),previews=new Map();
 let saved=[];
 const statusMessage=(message,error=false)=>{
  status.textContent=message;status.dataset.error=String(error);
 };
 const notify=(message,error=false)=>{
  statusMessage(message,error);window.showVasraToast?.(message,error?'error':'success');
 };
 const getImage=key=>{
  const row=saved.find(item=>item.key===key);
  return row?.has_image?'/api/hero-backgrounds/'+key+'/image?v='+encodeURIComponent(row.updated_at||'latest'):'';
 };
 const render=()=>{
  host.innerHTML=entries.map(([key,title,site])=>{
   const image=getImage(key);
   return '<article class="hero-admin-card" data-hero-card="'+key+'">'+
    '<h3>'+title+'</h3>'+
    '<div class="hero-admin-preview" data-preview="'+key+'">'+
      (image?'<img src="'+image+'" alt="Current '+site+' hero background">':
        '<span>Default site background · No custom image</span>')+'</div>'+
    '<p>Only the background changes. The original hero text, elements, spacing and height remain.</p>'+
    '<div class="hero-admin-actions">'+
     '<label class="hero-upload-label">Choose Background Image'+
      '<input type="file" data-hero-file="'+key+'" accept="image/jpeg,image/png,image/webp" aria-label="Choose '+site+' hero background image"></label>'+
     '<button type="button" class="hero-action primary" data-hero-save="'+key+'" disabled>Save Background</button>'+
     '<button type="button" class="hero-action" data-hero-reset="'+key+'"'+(image?'':' disabled')+'>Restore Default</button>'+
    '</div>'+
    '<small>JPG, PNG or WebP · max 2MB · landscape 1600×900 recommended.</small>'+
    '<p class="hero-selection-status" data-hero-message="'+key+'" role="status" aria-live="polite"></p>'+
    '</article>';
  }).join('');
 };
 const load=async()=>{
  const data=await api('/api/hero-backgrounds/manage');
  saved=Array.isArray(data.items)?data.items:[];
  for(const src of previews.values())URL.revokeObjectURL(src);
  previews.clear();pending.clear();render();
  statusMessage('Select one of the five backgrounds to update. Changes appear on public pages after saving.');
 };
 const asBase64=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('Could not read image.'));
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.readAsDataURL(file);
 });
 const inspectImage=file=>new Promise((resolve,reject)=>{
  const img=new Image(),url=URL.createObjectURL(file);
  img.onload=()=>{const size={width:img.naturalWidth,height:img.naturalHeight};URL.revokeObjectURL(url);resolve(size)};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Invalid image content.'))};
  img.src=url;
 });
 window.loadHeroBackgroundAdmin=async()=>{
  try{await load()}catch(error){statusMessage(error.message||'Hero media unavailable. Apply the database migration first.',true)}
 };
 host.addEventListener('change',async event=>{
  const input=event.target.closest('input[data-hero-file]');if(!input)return;
  const key=input.dataset.heroFile,file=input.files?.[0];if(!file)return;
  const message=host.querySelector('[data-hero-message="'+key+'"]');
  if(file.size<100||file.size>2000000||!['image/jpeg','image/png','image/webp'].includes(file.type)){
   message.textContent='Choose a JPG, PNG or WebP image under 2MB.';input.value='';return;
  }
  try{
   const dimensions=await inspectImage(file);
   pending.set(key,file);
   const old=previews.get(key);if(old)URL.revokeObjectURL(old);
   const url=URL.createObjectURL(file);previews.set(key,url);
   const preview=host.querySelector('[data-preview="'+key+'"]');
   preview.innerHTML='';
   const img=document.createElement('img');img.src=url;img.alt='New background preview';
   preview.appendChild(img);
   const save=host.querySelector('[data-hero-save="'+key+'"]');save.disabled=false;
   message.textContent=dimensions.width+' × '+dimensions.height+
    (dimensions.width<1200||dimensions.width/dimensions.height<1.4?
      ' · Landscape image recommended to prevent cropping.':' · Ready to save.');
  }catch(error){message.textContent=error.message;input.value='';}
 });
 host.addEventListener('click',async event=>{
  const save=event.target.closest('[data-hero-save]');
  const reset=event.target.closest('[data-hero-reset]');
  if(!save&&!reset)return;
  const key=(save||reset).dataset[save?'heroSave':'heroReset'];
  const card=host.querySelector('[data-hero-card="'+key+'"]');
  const buttons=card.querySelectorAll('button');
  if(save&&!pending.has(key))return;
  if(reset&&!window.confirm('Restore the original '+key+' hero background?'))return;
  buttons.forEach(b=>b.disabled=true);
  statusMessage(save?'Uploading and publishing '+key+' background…':'Restoring default '+key+' background…');
  try{
   if(save){
    const file=pending.get(key),data=await asBase64(file);
    await api('/api/hero-backgrounds/upload',{method:'POST',
      body:JSON.stringify({key,mime:file.type,data})});
   }else{
    await api('/api/hero-backgrounds/reset',{method:'POST',body:JSON.stringify({key})});
   }
   await load();
   notify(save?'Hero background saved successfully.':'Default hero background restored.');
  }catch(error){
   buttons.forEach(b=>b.disabled=false);
   statusMessage(error.message||'Could not save background.',true);
  }
 });
})();
