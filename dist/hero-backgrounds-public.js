'use strict';
/* Public pages: keep original design if media lookup or photo loading fails.
   On wide screens a square/portrait upload displays fully at the right side
   instead of being enlarged and cropped as a wide panorama. */
(async()=>{
 const hero=document.querySelector('[data-hero-media-key]');
 if(!hero)return;
 const key=hero.dataset.heroMediaKey;
 if(!['home','projects','duty','transparency','contacts'].includes(key))return;
 try{
  const response=await fetch('/api/hero-backgrounds',{credentials:'same-origin'});
  if(!response.ok)return;
  const data=await response.json();
  const entry=(data.items||[]).find(x=>x.key===key);
  if(!entry||entry.has_image!==true)return;
  const version=encodeURIComponent(entry.updated_at||'latest');
  const url='/api/hero-backgrounds/'+key+'/image?v='+version;
  const photo=new Image();
  photo.onload=()=>{
   if(!photo.naturalWidth||!photo.naturalHeight)return;
   // Portrait/square logos retain their complete shape on desktop; landscape
   // photography keeps the full-bleed cover treatment. Mobile stays unchanged.
   const compact=photo.naturalWidth/photo.naturalHeight<1.45;
   hero.classList.toggle('hero-media-compact',compact);
   hero.style.setProperty('--hero-upload-url','url("'+url+'")');
   hero.classList.add('hero-media-active');
  };
  photo.onerror=()=>{/* Original hero image remains visible. */};
  photo.src=url;
 }catch{/* Retain original hero if Supabase or network is unavailable. */}
})();
