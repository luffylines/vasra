'use strict';
/* Public pages: a failed media request leaves the original design untouched. */
(async()=>{
 const hero=document.querySelector('[data-hero-media-key]');
 if(!hero)return;
 const key=hero.dataset.heroMediaKey;
 if(!['home','projects','duty','transparency','contacts'].includes(key))return;
 try{
  const response=await fetch('/api/hero-backgrounds',{credentials:'same-origin'});
  if(!response.ok)return;
  const data=await response.json(),entry=(data.items||[]).find(x=>x.key===key);
  if(!entry||entry.has_image!==true)return;
  const version=encodeURIComponent(entry.updated_at||'latest');
  const url='/api/hero-backgrounds/'+key+'/image?v='+version;
  /* URLs are fixed, same-origin paths built only from the allowlisted hero key. */
  hero.style.setProperty('--hero-upload-url','url("'+url+'")');
  hero.classList.add('hero-media-active');
 }catch{/* Retain default design if Supabase or network unavailable. */}
})();
