'use strict';
/* Three permanent public Current Project entries, with separate chairman-only editing. */
(()=>{
 const defaults=[
  {slug:'printing',title:'FREE PRINTING AND PHOTOCOPYING SERVICES',summary:'Libreng printing at photocopying para sa mga kwalipikadong kabataang Vasra. Mag-login sa iyong verified KK account para pumili ng paper size, black-and-white o colored, bilang ng pahina at copies bago mag-request.'},
  {slug:'computer',title:'VASRA MIND HUB · FREE COMPUTER USE',summary:'Gamitin ang VASRA Mind Hub para sa mga gawain sa paaralan, research at digital activities. Mag-login sa iyong verified KK account para mag-request ng computer use at piliin ang bilang ng oras.'},
  {slug:'retabox',title:'RETABOX · DONATION BOX',summary:'Makibahagi sa RetaBox donation program ng SK Vasra. Mag-login sa iyong verified KK account upang mag-submit ng RetaBox request at ilagay ang timbang o grams ng iyong dadalhing donasyon.'}
 ];
 const keys=new Set(defaults.map(x=>x.slug));
 const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const photo=(x,always=false)=>x.has_image||always&&x.has_image?
   '/api/current-projects/'+x.slug+'/image?v='+encodeURIComponent(x.updated_at||'latest'):
   '/current-project-'+x.slug+'.svg';
 const load=async()=>{const data=await api('/api/current-projects');return defaults.map(d=>({...d,...(data.projects||[]).find(x=>x.slug===d.slug)}));};
 const note=(message,kind='success')=>window.showVasraToast?.(message,kind);
 const format=x=>String(x).replace(/\s+/g,' ').trim();
 function home(){
  const host=document.getElementById('current-project-cards');if(!host)return;
  const draw=items=>{
   host.innerHTML=items.map(x=>'<a class="current-project-card" href="/current-project/'+x.slug+'" aria-label="View '+safe(x.title)+' details">'+
    '<span class="current-project-cover"><img src="'+photo(x)+'" alt="'+safe(x.title)+'" loading="lazy">'+
    '<span class="current-project-image-tag">KK SERVICE</span></span>'+
    '<span class="current-project-card-body"><strong>'+safe(x.title)+'</strong><span>'+safe(format(x.summary).slice(0,185))+'</span>'+
    '<span class="current-project-open">View details <span aria-hidden="true">→</span></span></span></a>').join('');
  };
  draw(defaults);load().then(draw).catch(()=>{document.getElementById('current-project-update-note').textContent='Showing service information. Latest edits are temporarily unavailable.';});
 }
 function details(){
  const host=document.getElementById('current-project-detail');if(!host)return;
  const slug=location.pathname.split('/').filter(Boolean).at(-1);
  const found=defaults.find(x=>x.slug===slug);
  if(!found){host.innerHTML='<p class="current-project-notfound">Hindi makita ang serbisyong ito. <a href="/">Bumalik sa Home.</a></p>';return;}
  const render=x=>{
   document.title=x.title+' — SK VASRA';
   const crumb=document.getElementById('current-project-breadcrumb');if(crumb)crumb.textContent=x.title;
   host.innerHTML='<div class="current-project-detail-image"><img src="'+photo(x)+'" alt="'+safe(x.title)+'"></div>'+
    '<div class="current-project-detail-copy"><span class="current-project-eyebrow">SANGGUNIANG KABATAAN · BARANGAY VASRA</span>'+
    '<h1>'+safe(x.title)+'</h1><h2>About this service</h2><p>'+safe(x.summary)+'</p>'+
    '<div class="current-project-service-cta"><strong>Para sa verified KK members</strong><span>Mag-login sa KK account upang makapag-request ng serbisyo. Kung hindi pa verified, kumpletuhin muna ang iyong KK profile.</span>'+
    '<a id="current-project-request" class="current-project-cta-link" href="/kk-login?service='+x.slug+'">Mag-login para mag-request <span aria-hidden="true">→</span></a></div>'+
    '<a class="current-project-return" href="/">← Bumalik sa Home</a></div>';
   api('/api/kk/me').then(res=>{
    if(res?.member?.id&&res.profile?.status==='verified'){
     const link=document.getElementById('current-project-request');
     if(link){link.href='/kk-dashboard#'+x.slug;link.innerHTML='Buksan ang KK service <span aria-hidden="true">→</span>';}
    }
   }).catch(()=>{});
  };
  render(found);
  load().then(items=>render(items.find(x=>x.slug===slug)||found))
   .catch(()=>{const el=document.getElementById('current-project-detail-status');if(el)el.textContent='Live service details temporarily unavailable.';});
 }
 function staff(){
  const host=document.getElementById('current-project-admin');if(!host)return;
  const status=document.getElementById('current-project-admin-status');
  const state={items:[]};
  const refresh=async()=>{
   status.textContent='Loading current services…';
   const result=await api('/api/current-projects/manage');
   state.items=(result.projects||[]).filter(x=>keys.has(x.slug));
   if(state.items.length!==3)throw Error('Incomplete services directory. Check the migration.');
   host.innerHTML=state.items.map(x=>'<article class="current-project-admin-card" data-service="'+x.slug+'">'+
    '<div class="current-project-admin-image"><img alt="'+safe(x.title)+'" src="'+photo(x)+'"></div>'+
    '<form data-service-summary="'+x.slug+'"><h3>'+safe(x.title)+'</h3>'+
    '<label for="current-summary-'+x.slug+'">Service summary</label>'+
    '<textarea id="current-summary-'+x.slug+'" name="summary" maxlength="1800" minlength="20" required rows="5">'+safe(x.summary)+'</textarea>'+
    '<div class="current-project-admin-actions"><button class="primary" type="submit">Save Summary</button>'+
    '<label class="current-project-upload">Upload / Replace Image<input type="file" accept="image/jpeg,image/png,image/webp" data-service-image="'+x.slug+'" aria-label="Upload image for '+safe(x.title)+'"></label>'+
    '<a href="/current-project/'+x.slug+'" target="_blank" rel="noopener">Public page ↗</a></div>'+
    '<small>JPG, PNG or WebP · maximum 2 MB. Photo changes appear automatically on the homepage.</small></form></article>').join('');
   status.textContent='Only these three KK services can be edited. Changes are saved to the database.';
  };
  window.loadCurrentProjectAdmin=async()=>{try{await refresh()}catch(error){host.replaceChildren();status.textContent=error.message;}};
  host.addEventListener('submit',async e=>{
   const form=e.target.closest('form[data-service-summary]');if(!form)return;
   e.preventDefault();const slug=form.dataset.serviceSummary;
   if(!keys.has(slug)||!form.reportValidity())return;
   const button=form.querySelector('button[type="submit"]');button.disabled=true;
   try{
    await api('/api/current-projects/save',{method:'POST',body:JSON.stringify({slug,summary:form.elements.summary.value.trim()})});
    note('Current Project summary saved.');status.textContent='Saved '+slug+' summary successfully.';
   }catch(error){status.textContent=error.message;note(error.message,'error');}
   finally{button.disabled=false;}
  });
  host.addEventListener('change',async e=>{
   const input=e.target.closest('input[data-service-image]');if(!input)return;
   const slug=input.dataset.serviceImage,file=input.files?.[0];if(!file||!keys.has(slug))return;
   if(file.size>2000000||file.size<100||!['image/jpeg','image/png','image/webp'].includes(file.type)){
    status.textContent='JPG, PNG or WebP only; maximum 2 MB.';input.value='';return;
   }
   input.disabled=true;status.textContent='Uploading '+slug+' image…';
   try{
    const data=await new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onerror=()=>reject(Error('Could not read photo.'));
     reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
     reader.readAsDataURL(file);
    });
    await api('/api/current-projects/image',{method:'POST',body:JSON.stringify({slug,mime:file.type,data})});
    await refresh();note('Current Project image uploaded and published.');
   }catch(error){status.textContent=error.message;note(error.message,'error');}
   finally{input.disabled=false;input.value='';}
  });
 }
 home();details();staff();
})();