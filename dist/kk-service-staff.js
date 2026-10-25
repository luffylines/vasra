'use strict';
(()=>{
 const $=selector=>document.querySelector(selector);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let requests=[],pointsRate=0,busy=false;
 const call=(path='',data)=>api('./api/kk/staff/services'+path,
  data===undefined?{}:{method:'POST',body:JSON.stringify(data)});
 const message=(value,error=false)=>{
  const el=$('#kk-service-staff-message');
  if(!el)return;el.textContent=value;el.dataset.kind=error?'error':'info';
 };
 const kindLabel={printing:'Free Printing',computer:'Computer Use',retabox:'RetaBox Donations'};
 const summary=r=>{
  const d=r.details||{};
  if(r.service_type==='printing')return (d.paper_size==='long'?'Long':'Short')+' · '+(d.color==='colored'?'Colored':'Black & White')+
   ' · '+d.pages+' pages × '+d.copies+' copies';
  if(r.service_type==='computer')return d.hours+' hour(s) of computer use';
  return 'Reported: '+d.grams+' grams'+(d.description?' · '+d.description:'');
 };
 const item=r=>{
  const pending=r.status==='pending';
  const points=r.service_type==='retabox'&&r.status==='approved'?'<p class="kk-service-earned">Verified: '+
   esc(r.verified_grams||'—')+' grams · '+esc(r.points_awarded||0)+' points awarded</p>':'';
  const controls=pending?'<div class="kk-service-review-actions">'+
   (r.service_type==='retabox'?'<label>Actual verified weight (grams)'+
    '<input type="number" inputmode="numeric" min="1" max="100000" data-verified-grams="'+esc(r.id)+'" value="'+esc(r.details?.grams||'')+'"></label>':'')+
   '<label>Officer note <input type="text" maxlength="500" data-review-note="'+esc(r.id)+'" placeholder="Optional approval note; required if rejected"></label>'+
   '<button type="button" class="primary" data-review-service="approved" data-id="'+esc(r.id)+'">Approve</button>'+
   '<button type="button" class="secondary" data-review-service="rejected" data-id="'+esc(r.id)+'">Reject</button></div>':'';
  return '<article class="kk-service-admin-card" data-request-id="'+esc(r.id)+'">'+
   '<div class="kk-service-admin-card-header"><div><small>'+esc(kindLabel[r.service_type]||r.service_type)+'</small>'+
   '<h3>'+esc(r.name||'KK Member')+'</h3>'+
   '<p>'+esc(summary(r))+'</p><small>Requested '+esc(new Date(r.requested_at).toLocaleString('en-PH',{dateStyle:'medium',
    timeStyle:'short',timeZone:'Asia/Manila'}))+'</small></div>'+
   '<span class="kk-service-status kk-service-status-'+esc(r.status)+'">'+esc(r.status)+'</span></div>'+
   points+(r.review_note?'<p class="kk-service-officer-note">SK Note: '+esc(r.review_note)+'</p>':'')+controls+'</article>';
 };
 const render=()=>{
  const type=$('#kk-service-type-filter').value,status=$('#kk-service-status-filter').value;
  const rows=requests.filter(r=>(type==='all'||r.service_type===type)&&(status==='all'||r.status===status));
  $('#kk-service-admin-queue').innerHTML=rows.length?rows.map(item).join(''):
   '<div class="kk-service-empty">Walang requests para sa napiling filters.</div>';
  const form=$('#kk-retabox-rate-form'),section=$('#kk-retabox-rate-section');
  const chairman=typeof user!=='undefined'&&user?.role==='chairman';
  section.hidden=!chairman;
  if(chairman)form.elements.points_per_kg.value=String(pointsRate);
 };
 window.loadKKServiceStaff=async()=>{
  if(busy)return;busy=true;message('Loading service requests…');
  try{
   const data=await call();
   requests=Array.isArray(data.requests)?data.requests:[];
   pointsRate=Number(data.retabox_points_per_kg||0);
   render();message(requests.length+' service requests · Points rate: '+pointsRate+' per kilogram');
  }catch(e){message('Hindi ma-load ang SK Services: '+e.message,true);}
  finally{busy=false;}
 };
 $('#kk-service-staff-refresh')?.addEventListener('click',()=>window.loadKKServiceStaff());
 $('#kk-service-type-filter')?.addEventListener('change',render);
 $('#kk-service-status-filter')?.addEventListener('change',render);
 $('#kk-service-admin-queue')?.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-review-service]');
  if(!button||button.disabled)return;
  const req=requests.find(r=>r.id===button.dataset.id);
  if(!req||req.status!=='pending')return;
  const root=button.closest('[data-request-id]');
  const status=button.dataset.reviewService;
  const note=root.querySelector('[data-review-note]')?.value.trim()||'';
  if(status==='rejected'&&note.length<5){message('Maglagay ng dahilan ng rejection (at least 5 characters).',true);return;}
  const payload={id:req.id,status,note};
  if(req.service_type==='retabox'&&status==='approved'){
   const grams=Number(root.querySelector('[data-verified-grams]')?.value);
   if(!Number.isInteger(grams)||grams<1||grams>100000){message('Ilagay ang aktuwal na verified weight (grams).',true);return;}
   if(pointsRate<=0){message('SK Chairman must configure the official RetaBox points rate first.',true);return;}
   const expected=Math.floor(grams*pointsRate/1000);
   if(expected>500){message('Mahigit 500 points ang request na ito. Kailangan munang i-review ang points rate.',true);return;}
   payload.verified_grams=grams;
   if(!confirm('Approve RetaBox donation: '+grams+' verified grams, '+expected+' points?'))return;
  }else if(!confirm((status==='approved'?'Approve':'Reject')+' this '+kindLabel[req.service_type]+' request?'))return;
  button.disabled=true;
  try{
   const result=await call('',payload);
   if(result?.ok!==true)throw Error('Review failed.');
   await window.loadKKServiceStaff();
   message(status==='approved'?'Request approved. '+(result.points_awarded||0)+' points awarded.':'Request rejected.');
  }catch(error){message(error.message,true);button.disabled=false;}
 });
 $('#kk-retabox-rate-form')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;
  if(!form.reportValidity())return;
  const value=Number(form.elements.points_per_kg.value);
  if(!Number.isInteger(value)||value<0||value>5000)return;
  if(!confirm('Set official RetaBox points rate to '+value+' points per kilogram?'))return;
  const btn=form.querySelector('button[type="submit"]');btn.disabled=true;
  try{
   const result=await call('/config',{points_per_kg:value});
   if(result?.ok!==true)throw Error('Setting was not saved.');
   await window.loadKKServiceStaff();
   message('Official RetaBox rate updated.');
  }catch(e){message(e.message,true);}finally{btn.disabled=false;}
 });
})();
