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
 const photo=x=>x.has_image?
   '/api/current-projects/'+x.slug+'/image?v='+encodeURIComponent(x.updated_at||'latest'):
   '/current-project-'+x.slug+'.svg';
 const load=async()=>{const data=await api('/api/current-projects');return defaults.map(d=>({...d,...(data.projects||[]).find(x=>x.slug===d.slug)}));};
 const note=(message,kind='success')=>window.showVasraToast?.(message,kind);
 const format=x=>String(x).replace(/\s+/g,' ').trim();
 // JavaScript .slice() counts UTF-16 units, and can split a bold/emoji character in half.
 // Segment by complete graphemes so Facebook-style characters never turn into �.
 const teaser=(raw,max=150)=>{
  const summary=format(raw);
  const graphemes=typeof Intl!=='undefined' && typeof Intl.Segmenter==='function'
   ? Array.from(new Intl.Segmenter('fil',{granularity:'grapheme'}).segment(summary),part=>part.segment)
   : Array.from(summary);
  if(graphemes.length<=max)return summary;
  const cropped=graphemes.slice(0,max).join('');
  const lastSpace=cropped.lastIndexOf(' ');
  const end=lastSpace>=max*.65?cropped.slice(0,lastSpace):cropped;
  return end.trimEnd()+'…';
 };
 // A nested child URL displays over the existing homepage, never as a standalone page.
 let latest=defaults;
 const projectRoute=()=>{const match=location.pathname.match(/^\/current-project\/(printing|computer|retabox)\/?$/);return match?.[1]||null;};
 function home(){
  const host=document.getElementById('current-project-cards');
  const dialog=document.getElementById('current-project-modal');
  const detail=document.getElementById('current-project-detail');
  if(!host||!dialog||!detail)return;
  let lastFocus=null,active=null;
  // Keep the full poster INSIDE the already-open detail dialog.
  // A second nested native dialog can fail to open on iPhone Safari.
  const zoom=dialog.querySelector('#current-project-poster-zoom');
  const zoomImage=dialog.querySelector('#current-project-poster-full-image');
  const zoomClose=dialog.querySelector('#current-project-poster-close');
  const closeZoom=()=>{
   if(!zoom||zoom.hidden)return;
   zoom.hidden=true;
   zoom.setAttribute('aria-hidden','true');
   dialog.querySelector('.current-project-poster-open')?.focus({preventScroll:true});
  };
  if(zoom&&zoomImage&&zoomClose){
   dialog.addEventListener('click',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    const posterButton=target.closest('.current-project-poster-open');
    if(!posterButton)return;
    const img=posterButton.querySelector('img');
    if(!img)return;
    zoomImage.src=img.currentSrc||img.src;
    zoomImage.alt=img.alt||'Full SK VASRA poster';
    zoom.hidden=false;
    zoom.setAttribute('aria-hidden','false');
    zoomClose.focus({preventScroll:true});
   });
   zoomClose.addEventListener('click',event=>{event.stopPropagation();closeZoom()});
   zoom.addEventListener('click',event=>{if(event.target===zoom)closeZoom()});
  }
  const homeTitle='Home — SK Vasra';
  const draw=items=>{
   host.innerHTML=items.map(x=>'<a class="current-project-card" href="/current-project/'+x.slug+'" aria-label="View '+safe(x.title)+' details">'+
    '<span class="current-project-cover"><img src="'+photo(x)+'" alt="'+safe(x.title)+'" loading="lazy">'+
    '<span class="current-project-image-tag">KK SERVICE</span></span>'+
    '<span class="current-project-card-body"><strong>'+safe(x.title)+'</strong><span>'+safe(teaser(x.summary))+'</span>'+
    '<span class="current-project-open">View details <span aria-hidden="true">→</span></span></span></a>').join('');
  };
  const render=x=>{
   closeZoom();
   detail.innerHTML='<div class="current-project-detail-image"><button class="current-project-poster-open" type="button" aria-label="Tap to view full poster of '+safe(x.title)+'"><img src="'+photo(x)+'" alt="'+safe(x.title)+'"></button><span class="current-project-poster-hint" aria-hidden="true">Tap to view full poster</span></div>'+
    '<div class="current-project-detail-copy"><span class="current-project-eyebrow">SANGGUNIANG KABATAAN · BARANGAY VASRA</span>'+
    '<h1 id="current-project-dialog-title">'+safe(x.title)+'</h1><h2>About this service</h2>'+
    '<p class="current-project-long-summary">'+safe(x.summary)+'</p>'+
    '<div class="current-project-service-cta"><strong>Para sa verified KK members</strong>'+
    '<span>Mag-login sa KK account para makapag-request ng serbisyo. Kung hindi pa verified, kumpletuhin muna ang iyong KK profile.</span>'+
    '<a id="current-project-request" class="current-project-cta-link" href="/kk-login?service='+x.slug+'">Mag-login para mag-request <span aria-hidden="true">→</span></a></div></div>';
   dialog.setAttribute('aria-labelledby','current-project-dialog-title');
   document.title=x.title+' — SK VASRA';
   const requested=x.slug;
   api('/api/kk/me').then(res=>{
    if(active!==requested||!dialog.open)return;
    if(res?.member?.id&&res.profile?.status==='verified'){
     const link=dialog.querySelector('#current-project-request');
     if(link){link.href='/kk-dashboard#'+requested;link.innerHTML='Buksan ang KK service <span aria-hidden="true">→</span>';}
    }
   }).catch(()=>{});
  };
  const show=slug=>{
   const x=latest.find(p=>p.slug===slug);
   if(!x)return;
   if(!dialog.open){lastFocus=document.activeElement;dialog.showModal();}
   active=slug;
   document.body.classList.add('current-project-modal-open');
   render(x);
   dialog.querySelector('#current-project-close')?.focus({preventScroll:true});
  };
  const hide=()=>{
   closeZoom();
   active=null;
   if(dialog.open)dialog.close();
   document.body.classList.remove('current-project-modal-open');
   document.title=homeTitle;
   if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
   lastFocus=null;
  };
  const navigateClose=()=>{
   if(history.state?.currentProjectOverlay){history.back();return;}
   // Direct-link visits have no homepage history entry; close in place instead.
   history.replaceState(null,'','/#current-projects');hide();
  };
  const sync=()=>{
   const slug=projectRoute();
   if(slug)show(slug);
   else hide();
  };
  host.addEventListener('click',event=>{
   const anchor=event.target.closest('a.current-project-card');
   if(!anchor||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const slug=anchor.getAttribute('href')?.split('/').at(-1);
   if(!keys.has(slug))return;
   event.preventDefault();
   history.pushState({currentProjectOverlay:true},'','/current-project/'+slug);
   show(slug);
  });
  dialog.querySelector('#current-project-close').addEventListener('click',navigateClose);
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(zoom&&!zoom.hidden)closeZoom();else navigateClose();});
  dialog.addEventListener('click',e=>{if(e.target===dialog){if(zoom&&!zoom.hidden)closeZoom();else navigateClose();}});
  window.addEventListener('popstate',sync);
  // Safari can restore a cached page after navigating back from KK login.
  window.addEventListener('pageshow',event=>{if(event.persisted)sync();});
  draw(defaults);
  sync();
  load().then(items=>{
   latest=items;draw(items);
   const slug=projectRoute();
   if(slug&&active===slug)render(items.find(x=>x.slug===slug)||defaults.find(x=>x.slug===slug));
  }).catch(()=>{
   const note=document.getElementById('current-project-update-note');
   if(note)note.textContent='Showing service information. Latest edits are temporarily unavailable.';
  });
 }
 function details(){
  // Legacy standalone-page renderer remains only for older cached /current-project.html visitors.
  const host=document.getElementById('current-project-detail');
  if(!host||document.getElementById('current-project-modal'))return;
  const slug=projectRoute(),entry=defaults.find(x=>x.slug===slug);
  if(entry)location.replace('/current-project/'+slug);
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
    '<div class="current-project-admin-image"><button type="button" class="current-project-image-preview" data-service-preview="'+x.slug+'" aria-label="View full-size poster for '+safe(x.title)+'"><img alt="'+safe(x.title)+'" src="'+photo(x)+'" loading="lazy"><span>Click to view full poster</span></button></div>'+
    '<form data-service-summary="'+x.slug+'"><h3>'+safe(x.title)+'</h3>'+
    '<label for="current-summary-'+x.slug+'">Service summary</label>'+
    '<textarea id="current-summary-'+x.slug+'" name="summary" maxlength="12000" minlength="20" required rows="7">'+safe(x.summary)+'</textarea><span class="current-project-char-count" data-summary-count="'+x.slug+'">'+String(x.summary.length)+' / 12,000 characters · supports line breaks</span>'+
    '<div class="current-project-admin-actions"><button class="primary" type="submit">Save Summary</button>'+
    '<label class="current-project-upload">Upload / Replace Image<input type="file" accept="image/jpeg,image/png,image/webp" data-service-image="'+x.slug+'" aria-label="Upload image for '+safe(x.title)+'"></label>'+
    '<a href="/current-project/'+x.slug+'" target="_blank" rel="noopener">View on Homepage ↗</a></div>'+
    '<small>Full portrait posters will be shown without cropping. JPG, PNG or WebP · maximum 2 MB.</small></form></article>').join('');
   status.textContent='Only these three KK services can be edited. Changes are saved to the database.';
  };
  window.loadCurrentProjectAdmin=async()=>{try{await refresh()}catch(error){host.replaceChildren();status.textContent=error.message;}};
  host.addEventListener('input',e=>{
   const field=e.target.closest('textarea[name="summary"]');if(!field)return;
   const slug=field.closest('form')?.dataset.serviceSummary;
   const counter=slug&&host.querySelector('[data-summary-count="'+slug+'"]');
   if(counter)counter.textContent=field.value.length.toLocaleString('en-PH')+' / 12,000 characters · supports line breaks';
  });
  const preview=document.getElementById('current-project-preview');
  if(preview){
   host.addEventListener('click',e=>{
    const button=e.target.closest('button[data-service-preview]');
    if(!button)return;
    const img=button.querySelector('img');
    const zoom=preview.querySelector('#current-project-preview-img');
    if(!img||!zoom)return;
    zoom.src=img.src;zoom.alt=img.alt;
    if(!preview.open)preview.showModal();
   });
   preview.querySelector('#current-project-preview-close').addEventListener('click',()=>preview.close());
   preview.addEventListener('click',e=>{if(e.target===preview)preview.close()});
  }
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