'use strict';
let publicAwards=[],awardGalleryImages=[],awardGalleryIndex=0;
const awardsDate=d=>new Intl.DateTimeFormat('fil-PH',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'}).format(new Date(d+'T12:00:00Z'));
const awardCover=a=>Array.isArray(a.image_ids)&&a.image_ids.length?a.image_ids[0]:a.image_id;
const awardPhoto=id=>'./api/images/'+encodeURIComponent(id);
function renderAwards(){
 const grid=document.querySelector('#awards-public-grid');
 document.querySelector('#awards-public-total').textContent=publicAwards.length+' award'+(publicAwards.length===1?'':'s');
 grid.innerHTML=publicAwards.length?publicAwards.map((a,i)=>{
  const cover=awardCover(a),count=Array.isArray(a.image_ids)?a.image_ids.length:(cover?1:0);
  return '<article class="award-card"><button class="award-card-cover" type="button" data-award-open="'+i+'" aria-label="View photos of '+esc(a.title)+'" '+(!cover?'disabled':'')+'>'+
   (cover?'<img src="'+awardPhoto(cover)+'" loading="lazy" alt="Award certificate or recognition photo">':'<span class="awards-placeholder" aria-hidden="true">🏆</span>')+
   (count>1?'<span class="award-count">'+count+' photos</span>':'')+'</button><div class="award-card-body"><span class="award-category">'+esc(a.category)+'</span>'+
   '<h3>'+esc(a.title)+'</h3><p>'+esc(a.description||'')+'</p><dl><div><dt>Presented by</dt><dd>'+esc(a.issuer)+'</dd></div><div><dt>Date</dt><dd>'+esc(awardsDate(a.award_date))+'</dd></div></dl>'+
   (a.reference_url?'<a class="award-reference" href="'+esc(a.reference_url)+'" target="_blank" rel="noopener noreferrer">Official reference ↗</a>':'')+'</div></article>';
 }).join(''):'<div class="awards-empty"><strong>Wala pang published achievements.</strong><p>Makikita rito ang mga awards at recognitions kapag na-verify at na-publish ng SK Chairman.</p></div>';
 for(const img of grid.querySelectorAll('img'))img.addEventListener('error',()=>{img.replaceWith(Object.assign(document.createElement('span'),{className:'awards-placeholder',textContent:'🏆'}))},{once:true});
}
async function loadAwardsPublic(){
 try{
  const data=await api('./api/achievements');
  publicAwards=Array.isArray(data.awards)?data.awards:[];
  publicAwards.sort((a,b)=>String(b.award_date).localeCompare(String(a.award_date)));
  renderAwards();
 }catch(e){
  document.querySelector('#awards-public-grid').innerHTML='<div class="awards-empty" role="alert">Hindi pa available ang Achievements database. Subukan muli kapag na-activate na ito.</div>';
 }
}
function showAwardGallery(){
 const img=document.querySelector('#awards-gallery-image');
 const source=awardGalleryImages[awardGalleryIndex];if(!source)return;
 img.src=awardPhoto(source);img.alt='Award photo '+(awardGalleryIndex+1)+' of '+awardGalleryImages.length;
 document.querySelector('#awards-gallery-counter').textContent=(awardGalleryIndex+1)+' / '+awardGalleryImages.length;
 document.querySelector('#awards-gallery-prev').disabled=awardGalleryImages.length<2;
 document.querySelector('#awards-gallery-next').disabled=awardGalleryImages.length<2;
}
document.querySelector('#awards-public-grid').addEventListener('click',e=>{
 const btn=e.target.closest('[data-award-open]');if(!btn)return;
 const a=publicAwards[Number(btn.dataset.awardOpen)];
 awardGalleryImages=Array.isArray(a.image_ids)&&a.image_ids.length?a.image_ids:(a.image_id?[a.image_id]:[]);
 if(!awardGalleryImages.length)return;
 awardGalleryIndex=0;
 document.querySelector('#awards-gallery-heading').textContent=a.title;
 showAwardGallery();
 document.querySelector('#awards-gallery').showModal();
});
document.querySelector('#awards-gallery-prev').onclick=()=>{awardGalleryIndex=(awardGalleryIndex-1+awardGalleryImages.length)%awardGalleryImages.length;showAwardGallery()};
document.querySelector('#awards-gallery-next').onclick=()=>{awardGalleryIndex=(awardGalleryIndex+1)%awardGalleryImages.length;showAwardGallery()};
document.querySelector('#awards-gallery-close').onclick=()=>document.querySelector('#awards-gallery').close();
document.querySelector('#awards-gallery').onclick=e=>{if(e.target===e.currentTarget)e.currentTarget.close()};
document.querySelector('#awards-gallery').addEventListener('keydown',e=>{
 if(e.key==='ArrowLeft'){e.preventDefault();document.querySelector('#awards-gallery-prev').click()}
 if(e.key==='ArrowRight'){e.preventDefault();document.querySelector('#awards-gallery-next').click()}
});
loadAwardsPublic();