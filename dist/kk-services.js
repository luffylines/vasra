'use strict';
(()=>{
 const $=selector=>document.querySelector(selector);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const notice=(type,message,error=false)=>{
  const node=$('#kk-'+type+'-message');
  if(!node)return;
  node.hidden=false;node.textContent=message;node.dataset.kind=error?'error':'success';
 };
 let loading=false;
 const formatDetails=record=>{
  const d=record.details||{};
  if(record.service_type==='printing')return [d.paper_size==='long'?'Long':'Short','bond paper',d.color==='colored'?'Colored':'Black & White',
   String(d.pages||0)+' page(s) per copy',String(d.copies||0)+' copies'].join(' · ');
  if(record.service_type==='computer')return String(d.hours||0)+' hour(s) requested';
  return String(d.grams||0)+' grams estimated'+(record.verified_grams?' · '+record.verified_grams+' grams verified':'')+
   (record.points_awarded>0?' · '+record.points_awarded+' points':'');
 };
 const render=(records=[])=>{
  for(const type of ['printing','computer','retabox']){
   const container=$('#kk-'+type+'-history');
   if(!container)continue;
   const rows=records.filter(r=>r.service_type===type);
   container.innerHTML=rows.length?rows.map(r=>'<article class="kk-service-history-row">'+
    '<div><strong>'+esc(formatDetails(r))+'</strong><small>'+esc(new Date(r.requested_at).toLocaleString('en-PH',{timeZone:'Asia/Manila',
     dateStyle:'medium',timeStyle:'short'}))+'</small>'+
    (r.review_note?'<small>SK Note: '+esc(r.review_note)+'</small>':'')+'</div>'+
    '<span class="kk-service-status kk-service-status-'+esc(r.status)+'">'+esc(r.status)+'</span></article>').join(''):
    '<div class="kk-dash-empty">Wala pang '+(type==='printing'?'printing':type==='computer'?'computer use':'RetaBox')+' requests.</div>';
  }
 };
 window.loadKKServices=async()=>{
  if(loading)return;
  loading=true;
  try{
   const data=await api('./api/kk/services');
   render(Array.isArray(data.requests)?data.requests:[]);
  }catch(e){
   for(const type of ['printing','computer','retabox']){
    const container=$('#kk-'+type+'-history');
    if(container)container.textContent='Hindi ma-load ang service requests: '+e.message;
   }
  }finally{loading=false;}
 };
 for(const type of ['printing','computer','retabox']){
  $('#kk-'+type+'-form')?.addEventListener('submit',async event=>{
   event.preventDefault();
   const form=event.currentTarget;
   if(!form.reportValidity())return;
   const raw=Object.fromEntries(new FormData(form));
   const details=type==='printing'?{paper_size:raw.paper_size,color:raw.color,
    pages:Number(raw.pages),copies:Number(raw.copies)}:type==='computer'?{hours:Number(raw.hours)}:
    {grams:Number(raw.grams),description:String(raw.description||'').trim()};
   if(!confirm('Submit this '+(type==='printing'?'printing':type==='computer'?'computer use':'RetaBox donation')+
    ' request for SK review?'))return;
   const button=form.querySelector('[type="submit"]');button.disabled=true;
   try{
    const data=await api('./api/kk/services',{method:'POST',body:JSON.stringify({service_type:type, ...details})});
    if(data?.ok!==true)throw Error('Hindi na-save ang request.');
    notice(type,'Request submitted. Pending SK officer approval.');
    form.reset();
    await window.loadKKServices();
   }catch(e){notice(type,e.message,true);}finally{button.disabled=false;}
  });
 }
})();
