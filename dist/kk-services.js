'use strict';
(() => {
 const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[ch]));
 const call=async(method,body)=>{
   const response=await api('./api/kk/services',method==='GET'?{}:{method:'POST',body:JSON.stringify(body)});
   return response;
 };
 const message=(type,text,err=false)=>{
   const node=document.querySelector('#kk-'+type+'-feedback');
   if(node){node.textContent=text;node.hidden=false;node.dataset.kind=err?'error':'success';}
 };
 const labels={printing:'Free Printing',computer:'Computer Use',retabox:'RetaBox Donations'};
 const statusLabel={pending:'Pending SK Approval',approved:'Approved by SK',rejected:'Rejected / Correction Needed'};
 const detailText=r=>{
  const d=r.details||{};
  if(r.service_type==='printing')return (d.paper_size==='short'?'Short':'Long')+' · '+(d.color==='colored'?'Colored':'Black & White')+' · '+d.pages+' pages × '+d.copies+' copies';
  if(r.service_type==='computer')return String(d.hours)+' requested hours';
  return String(d.grams)+'g estimated'+(r.verified_grams?' · '+r.verified_grams+'g verified':'')+(r.points_awarded?' · +'+r.points_awarded+' pts':'');
 };
 const refresh=async()=>{
  try{
   const response=await call('GET');
   const rows=Array.isArray(response.requests)?response.requests:[];
   for(const type of Object.keys(labels)){
    const list=document.querySelector('#kk-'+type+'-history');
    if(!list)continue;
    const entries=rows.filter(r=>r.service_type===type);
    list.innerHTML=entries.length?entries.map(r=>
     '<article class="kk-service-item"><div><strong>'+safe(labels[type])+'</strong>'+
     '<small>'+safe(detailText(r))+'</small>'+
     '<small>'+safe(new Date(r.requested_at).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}))+'</small>'+
     (r.review_note?'<p>SK note: '+safe(r.review_note)+'</p>':'')+'</div>'+
     '<span class="kk-service-status" data-status="'+safe(r.status)+'">'+safe(statusLabel[r.status]||r.status)+'</span></article>').join(''):
     '<div class="kk-dash-empty">Wala ka pang '+safe(labels[type].toLowerCase())+' requests.</div>';
   }
  }catch(e){for(const type of Object.keys(labels))message(type,e.message,true);}
 };
 for(const [type,formId] of [['printing','kk-print-form'],['computer','kk-computer-form'],['retabox','kk-retabox-form']]){
  const form=document.getElementById(formId);
  form?.addEventListener('submit',async e=>{
   e.preventDefault();
   if(!form.reportValidity())return;
   const details=Object.fromEntries(new FormData(form));
   const submit=form.querySelector('[type=submit]');
   submit.disabled=true;
   try{
    const r=await call('POST',{service_type:type,details});
    if(r?.ok!==true)throw Error('Hindi na-save ang request.');
    message(type,'Submitted successfully. Pending SK Officer verification.');
    form.reset();await refresh();
   }catch(error){message(type,error.message,true);}
   finally{submit.disabled=false;}
  });
 }
 refresh();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
