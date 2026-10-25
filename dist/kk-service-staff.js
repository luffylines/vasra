'use strict';
(()=>{
 const root=document.querySelector('#panel-kk-services');if(!root)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const label={printing:'Free Printing',computer:'Computer Use',retabox:'RetaBox Donations'};
 const request=async(path='',body)=>api('./api/kk/staff/services'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
 let entries=[],rate=0;
 const message=(s,err=false)=>{const el=root.querySelector('#kk-services-staff-message');el.textContent=s;el.dataset.kind=err?'error':'info';};
 const details=r=>{
  const d=r.details||{};
  if(r.service_type==='printing')return (d.paper_size==='short'?'Short':'Long')+' paper · '+(d.color==='colored'?'Colored':'Black & White')+' · '+d.pages+' pages × '+d.copies+' copies';
  if(r.service_type==='computer')return d.hours+' hours requested';
  return d.grams+' grams declared'+(r.verified_grams?' · '+r.verified_grams+' grams SK verified':'');
 };
 const render=()=>{
  for(const s of ['pending','approved','rejected'])root.querySelector('#kk-services-count-'+s).textContent=entries.filter(x=>x.status===s).length;
  root.querySelector('#kk-service-current-rate').textContent=rate===0?'Not configured':rate+' pts / kg';
  const filter=root.querySelector('#kk-service-filter').value;
  const subset=entries.filter(x=>filter==='all'||x.status===filter||x.service_type===filter);
  const list=root.querySelector('#kk-service-staff-list');
  list.innerHTML=subset.length?subset.map(r=>
   '<article class="kk-service-staff-request" data-request-id="'+esc(r.id)+'">'+
    '<header><div><strong>'+esc(r.name||'KK Member')+'</strong><small>'+esc(label[r.service_type]||r.service_type)+'</small></div>'+
    '<span class="kk-service-status" data-status="'+esc(r.status)+'">'+esc(r.status.toUpperCase())+'</span></header>'+
    '<p>'+esc(details(r))+'</p><small>'+esc(new Date(r.requested_at).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}))+'</small>'+
    (r.review_note?'<p>Review note: '+esc(r.review_note)+'</p>':'')+
    (r.points_awarded?'<p><strong>Points credited: +'+esc(r.points_awarded)+'</strong></p>':'')+
    (r.status==='pending'?'<div class="kk-service-review-controls">'+
      (r.service_type==='retabox'?'<label>Verified weight (grams) <span class="kk-service-required">*</span>'+
       '<input type="number" data-verified-grams min="1" max="100000" value="'+esc(r.details?.grams||'')+'" required inputmode="numeric"></label>':'')+
      '<label>SK Review Note <input type="text" data-service-note maxlength="500" placeholder="Required when rejecting"></label>'+
      '<div class="kk-service-staff-actions"><button type="button" class="primary" data-service-decision="approved">Approve</button>'+
      '<button type="button" class="secondary" data-service-decision="rejected">Reject / Correction</button></div>'+
     '</div>':'')+'</article>').join(''):'<div class="kk-dash-empty">Walang request para sa filter na ito.</div>';
 };
 async function load(){
  try{
   const result=await request();
   entries=Array.isArray(result.requests)?result.requests:[];
   rate=Number(result.retabox_points_per_kg||0);
   render();
   message('KK service requests refreshed.');
  }catch(e){message('Cannot load service requests: '+e.message,true);}
 }
 root.querySelector('#kk-services-reload')?.addEventListener('click',load);
 root.querySelector('#kk-service-filter')?.addEventListener('change',render);
 root.querySelector('#kk-service-rate-form')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
  const button=form.querySelector('[type=submit]'),points=Number(form.elements.points_per_kg.value);
  if(!confirm('Apply '+points+' points per kilogram to future approved RetaBox donations?'))return;
  button.disabled=true;
  try{await request('/config',{points_per_kg:points});await load();message('Saved RetaBox points rate.');}
  catch(error){message(error.message,true)}finally{button.disabled=false;}
 });
 root.addEventListener('click',async e=>{
  const btn=e.target.closest('button[data-service-decision]');if(!btn)return;
  const card=btn.closest('[data-request-id]'),id=card?.dataset.requestId,status=btn.dataset.serviceDecision;
  const row=entries.find(r=>r.id===id);if(!row||row.status!=='pending')return;
  const note=card.querySelector('[data-service-note]')?.value.trim()||'';
  if(status==='rejected'&&note.length<5){message('Ilagay ang dahilan ng rejection (minimum 5 characters).',true);return;}
  const input=card.querySelector('[data-verified-grams]'),grams=input?Number(input.value):undefined;
  if(status==='approved'&&input&&(!input.reportValidity()||!Number.isInteger(grams)||grams<1||grams>100000)){
   message('Ilagay muna ang aktuwal na timbang sa grams.',true);return;
  }
  if(status==='approved'&&row.service_type==='retabox'&&rate<=0){message('Configure points per kilogram before approving RetaBox.',true);return;}
  const addition=status==='approved'&&row.service_type==='retabox'?'\nVerified weight: '+grams+' grams. Points will be awarded once.':'';
  if(!confirm((status==='approved'?'Approve':'Reject')+' the '+(label[row.service_type]||'KK service')+' request from '+row.name+'?'+addition))return;
  card.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   const result=await request('/review',{id,status,note,verified_grams:grams});
   await load();message(status==='approved'?'Request approved. '+(result.points_awarded||0)+' RetaBox points credited.':'Request rejected and recorded.');
  }catch(error){message(error.message,true);card.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
 window.loadKKServices=load;
})();
