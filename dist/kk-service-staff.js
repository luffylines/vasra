'use strict';
(()=>{
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const kindLabels={printing:'Free Printing',computer:'Computer Use',retabox:'RetaBox Donations'};
 const statusLabels={pending:'Pending',approved:'Approved',completed:'Completed',rejected:'Rejected'};
 let records=[],pointsRate=0,loading=false,reviewingId=null;
 const apiCall=(url,body)=>api(url,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
 const info=(msg,isError=false,isSuccess=false)=>{
  const el=$('#kk-service-staff-message');
  if(msg&&(isError||isSuccess)){el.textContent='';window.showVasraToast(msg,isError?'error':'success');return;}
  el.textContent=msg;el.dataset.kind='info';
 };
 const phDate=value=>{
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get=key=>parts.find(p=>p.type===key)?.value||'';
  return get('year')+'-'+get('month')+'-'+get('day');
 };
 const pht=value=>value?new Date(value).toLocaleString('en-PH',{
  timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}):'—';
 const today=()=>phDate(new Date());
 const daysApart=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
 const describe=r=>{
  const d=r.effective_details||r.details||{};
  if(r.service_type==='printing')return (d.paper_size==='long'?'Long':'Short')+
   ' bond paper · '+(d.color==='colored'?'Colored':'B&W')+' · '+esc(d.pages)+' pages × '+esc(d.copies)+' copies';
  if(r.service_type==='computer')return esc(d.hours)+' hour(s)';
  return esc(r.verified_grams||r.details?.grams||0)+' grams'+(r.verified_grams?' verified':' estimated')+
   (Number(r.points_awarded)>0?' · '+esc(r.points_awarded)+' pts':'');
 };
 const badge=r=>'<span class="kk-service-status kk-service-status-'+esc(r.status)+'">'+
  esc(statusLabels[r.status]||r.status)+'</span>';
 const state=()=>{
  const type=$('#kk-service-type-filter').value,status=$('#kk-service-status-filter').value,
   period=$('#kk-service-date-filter').value,
   custom=$('#kk-service-custom-date').value,search=$('#kk-service-search').value.trim().toLowerCase();
  return {type,status,period,custom,search};
 };
 const filter=(r,f)=>{
  if(f.type!=='all'&&r.service_type!==f.type)return false;
  if(f.status!=='all'&&r.status!==f.status)return false;
  const day=phDate(r.requested_at),now=today();
  if(f.period==='today'&&day!==now)return false;
  if(f.period==='week'&&(daysApart(now,day)<0||daysApart(now,day)>6))return false;
  if(f.period==='custom'&&f.custom&&day!==f.custom)return false;
  return !f.search||[r.name,r.kk_id,r.email,r.id].some(x=>String(x||'').toLowerCase().includes(f.search));
 };
 const editable=r=>{
  const d=r.details||{};
  if(r.service_type==='printing')return '<div class="kk-service-edit-grid">'+
   '<label>Paper Size<select name="paper_size"><option value="short"'+(d.paper_size==='short'?' selected':'')+'>Short</option>'+
   '<option value="long"'+(d.paper_size==='long'?' selected':'')+'>Long</option></select></label>'+
   '<label>Color<select name="color"><option value="bw"'+(d.color==='bw'?' selected':'')+'>Black & White</option>'+
   '<option value="colored"'+(d.color==='colored'?' selected':'')+'>Colored</option></select></label>'+
   '<label>Pages per Copy<input type="number" name="pages" min="1" max="100" value="'+esc(d.pages||1)+'" required></label>'+
   '<label>Copies<input type="number" name="copies" min="1" max="100" value="'+esc(d.copies||1)+'" required></label></div>';
  if(r.service_type==='computer')return '<div class="kk-service-edit-grid"><label>Approved Computer Hours'+
   '<input name="hours" type="number" min="1" max="8" value="'+esc(d.hours||1)+'" required></label></div>';
  return '<div class="kk-service-edit-grid"><label>Verified Donation Weight (grams)'+
    '<input name="verified_grams" type="number" min="1" max="100000" value="'+esc(d.grams||1)+'" required></label>'+
    '<p class="kk-service-rate-note">Official rate: '+esc(pointsRate)+' pts/kg. Awarded once on approval after checking the actual donation.</p></div>';
 };
 const card=r=>{
  const pending=r.status==='pending',selected=pending&&reviewingId===r.id;
  const desc=describe({...r,effective_details:r.details||{}});
  return '<article class="kk-service-admin-card'+(selected?' is-selected':'')+'" data-request-id="'+esc(r.id)+'">'+
   '<header class="kk-service-admin-card-header">'+
    '<span class="kk-service-request-label">'+esc(kindLabels[r.service_type]||r.service_type)+'</span>'+badge(r)+'</header>'+
   '<div class="kk-service-card-identity">'+
    '<h4>'+esc(r.name||'KK Member')+'</h4>'+
    '<span class="kk-service-member-id">'+esc(r.kk_id||'KK ID pending')+'</span>'+
    '<small class="kk-service-request-code">Request #'+esc(r.id.slice(0,8).toUpperCase())+'</small>'+
    '<small class="kk-service-submitted">Submitted '+esc(pht(r.requested_at))+'</small>'+
   '</div>'+
   '<div class="kk-service-request-summary"><strong>Member request</strong><p>'+desc+'</p></div>'+
   '<div class="kk-service-card-actions">'+
    (pending?'<button type="button" class="kk-service-review-trigger" data-action="open-review" data-id="'+esc(r.id)+'" aria-expanded="'+String(selected)+'" aria-controls="kk-service-active-review">'+
       (selected?'Close review':'Review request')+'</button>':
     '<span class="kk-service-reviewed-meta">'+esc(r.reviewed_by||'Reviewed by SK')+'</span>'+
      (r.status==='approved'?'<button type="button" class="kk-service-complete-button" data-action="complete" data-id="'+esc(r.id)+'">Mark Completed</button>':''))+
   '</div></article>';
 };
 const reviewPanel=r=>{
  const d=r.details||{},effective=r.effective_details||d;
  const wasEdited=JSON.stringify(d)!==JSON.stringify(effective);
  return '<section id="kk-service-active-review" class="kk-service-review-detail" aria-label="Review '+esc(kindLabels[r.service_type]||r.service_type)+' request">'+
   '<div class="kk-service-review-detail-heading"><div><span class="kk-service-request-label">'+esc(kindLabels[r.service_type]||r.service_type)+'</span>'+
    '<h4>Review '+esc(r.name||'KK Member')+'’s request</h4>'+
    '<p>'+esc(r.kk_id||'KK ID pending')+' · '+esc(pht(r.requested_at))+'</p></div>'+
    '<button type="button" class="kk-service-review-dismiss" data-action="close-review" data-id="'+esc(r.id)+'" aria-label="Close review form">Close ×</button></div>'+
   '<div class="kk-service-request-summary"><strong>Member request</strong><p>'+describe({...r,effective_details:d})+'</p>'+
   (wasEdited?'<strong>Officer-approved details</strong><p>'+describe(r)+'</p>':'')+'</div>'+
   '<form class="kk-service-review-form" data-service-form="'+esc(r.id)+'">'+
    '<p class="kk-service-review-caption">Verify the information below before approving or rejecting this request.</p>'+
    editable(r)+
    '<label class="kk-service-officer-note">Officer Note <input name="note" type="text" maxlength="500" placeholder="Optional for approval · Required on rejection"></label>'+
    '<div class="kk-service-review-actions">'+
     '<button type="button" class="primary" data-action="approve" data-id="'+esc(r.id)+'">Approve Request</button>'+
     '<button type="button" class="secondary" data-action="reject" data-id="'+esc(r.id)+'">Reject Request</button>'+
    '</div></form></section>';
 };
 const updateStats=()=>{
  const now=today(),created=records.filter(r=>phDate(r.requested_at)===now);
  const counts={
   total:created.length,
   pending:records.filter(r=>r.status==='pending').length,
   approved:records.filter(r=>phDate(r.reviewed_at)===now&&['approved','completed'].includes(r.status)).length,
   completed:records.filter(r=>phDate(r.completed_at)===now).length,
   rejected:records.filter(r=>phDate(r.reviewed_at)===now&&r.status==='rejected').length
  };
  for(const [key,value] of Object.entries(counts))
   $('#kk-service-stat-'+key).textContent=String(value);
 };
 const renderHistory=()=>{
  const q=$('#kk-service-history-search').value.trim().toLowerCase();
  const now=today();
  const data=records.filter(r=>[r.requested_at,r.reviewed_at,r.completed_at]
    .some(d=>d&&phDate(d)===now)&&
   (!q||[r.name,r.kk_id,r.id,r.service_type].some(x=>String(x||'').toLowerCase().includes(q))));
  $('#kk-service-history-body').innerHTML=data.length?data.map(r=>
   '<tr><td>'+esc(new Date(
    (r.completed_at&&phDate(r.completed_at)===now?r.completed_at:null)||
    (r.reviewed_at&&phDate(r.reviewed_at)===now?r.reviewed_at:null)||r.requested_at
   ).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'}))+
   '</td><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.kk_id||r.id.slice(0,8))+
   '</small></td><td>'+esc(kindLabels[r.service_type])+'</td><td>'+describe(r)+'</td><td>'+badge(r)+
   '</td><td>'+esc(r.reviewed_by||'—')+'</td><td>'+esc(r.completed_by||'—')+'</td></tr>').join(''):
   '<tr><td colspan="7" class="kk-service-no-history">Wala pang service requests ngayong araw.</td></tr>';
 };
 const render=()=>{
  const f=state(),visible=records.filter(r=>filter(r,f));
  const active=visible.find(r=>r.id===reviewingId&&r.status==='pending');
  if(!active)reviewingId=null;
  $('#kk-service-admin-queue').innerHTML=visible.length?
   visible.map(card).join('')+(active?reviewPanel(active):''):
   '<div class="kk-service-empty">Walang requests para sa napiling filters.</div>';
  $('#kk-service-result-count').textContent=visible.length+' request(s)';
  $('#kk-service-custom-date-wrap').hidden=f.period!=='custom';
  const section=$('#kk-retabox-rate-section'),chairman=typeof user!=='undefined'&&user?.role==='chairman';
  section.hidden=!chairman;
  if(chairman)section.querySelector('input[name="points_per_kg"]').value=String(pointsRate);
  updateStats();renderHistory();
 };
 const refresh=async()=>{
  if(loading)return;
  loading=true;info('Loading service requests…');
  try{
   const data=await apiCall('./api/kk/staff/services');
   if(data?.error)throw Error('Service not ready. Check database migration.');
   records=Array.isArray(data.requests)?data.requests:[];
   pointsRate=Number(data.retabox_points_per_kg||0);
   render();info(records.length+' total service request(s) · '+today()+' PHT');
  }catch(e){info('Hindi ma-load ang SK Services: '+e.message,true);}
  finally{loading=false;}
 };
 window.loadKKServiceStaff=refresh;
 for(const id of ['kk-service-type-filter','kk-service-status-filter','kk-service-date-filter','kk-service-custom-date'])
  $('#'+id)?.addEventListener('change',render);
 $('#kk-service-search')?.addEventListener('input',render);
 $('#kk-service-history-search')?.addEventListener('input',renderHistory);
 $('#kk-service-staff-refresh')?.addEventListener('click',refresh);
 $('#kk-service-export')?.addEventListener('click',()=>{
  const f=state(),date=f.period==='today'?today():f.period==='custom'?(f.custom||'all'):'all';
  const q=new URLSearchParams({search:f.search,service:f.type,status:f.status,date,
   period:f.period==='week'?'week':'all'});
  // Export downloads an actual XLSX from the authenticated backend, not a public link.
  window.location.assign('./api/kk/staff/services/export?'+q.toString());
 });
 $('#kk-service-admin-queue')?.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-action]');
  if(!button||button.disabled)return;
  if(button.dataset.action==='close-review'){
   reviewingId=null;render();return;
  }
  if(button.dataset.action==='open-review'){
   reviewingId=reviewingId===button.dataset.id?null:button.dataset.id;
   render();
   if(reviewingId)$('#kk-service-active-review')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
   return;
  }
  const item=records.find(r=>r.id===button.dataset.id);
  if(!item)return;
  const decision=button.dataset.action;
  let url='./api/kk/staff/services',payload={id:item.id};
  if(decision==='complete'){
   if(item.status!=='approved')return;
   if(!confirm('Mark this '+(kindLabels[item.service_type]||'service')+' request completed?'))return;
   url+='/complete';payload.note='';
  }else{
   if(item.status!=='pending')return;
   const form=button.closest('[data-service-form]'),data=new FormData(form);
   const note=String(data.get('note')||'').trim();
   if(decision==='reject'){
    if(note.length<5){info('Maglagay ng dahilan ng rejection (5 characters minimum).',true);return;}
    payload={id:item.id,status:'rejected',note};
   }else if(decision==='approve'){
    if(!form.reportValidity())return;
    payload={id:item.id,status:'approved',note};
    if(item.service_type==='printing'){
     payload.approved_details={paper_size:data.get('paper_size'),color:data.get('color'),
      pages:Number(data.get('pages')),copies:Number(data.get('copies'))};
    }else if(item.service_type==='computer'){
     payload.approved_details={hours:Number(data.get('hours'))};
    }else{
     const grams=Number(data.get('verified_grams'));
     if(!Number.isInteger(grams)||grams<1||grams>100000){info('Actual grams must be valid.',true);return;}
     if(pointsRate<=0){info('SK Chairman must set RetaBox points rate first.',true);return;}
     const points=Math.floor(grams*pointsRate/1000);
     if(points>500){info('Points exceed permitted limit; check official rate.',true);return;}
     payload.verified_grams=grams;
     if(!confirm('Confirm '+grams+' verified grams = '+points+' point(s)?'))return;
    }
    if(item.service_type!=='retabox'&&!confirm('Confirm the corrected details and approve this request?'))return;
   }else return;
  }
  button.disabled=true;
  try{
   const result=await apiCall(url,payload);
   if(result?.ok!==true)throw Error('Cannot update request. Refresh and retry.');
   reviewingId=null;
   await refresh();
   info('Request '+(decision==='complete'?'completed':decision==='approve'?'approved':'rejected')+' successfully.',false,true);
  }catch(error){info(error.message,true);button.disabled=false;}
 });
 $('#kk-retabox-rate-form')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;
  if(!form.reportValidity())return;
  const rate=Number(form.elements.points_per_kg.value);
  if(!Number.isInteger(rate)||rate<0||rate>5000)return;
  if(!confirm('Set official rate to '+rate+' points per kilogram?'))return;
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   const outcome=await apiCall('./api/kk/staff/services/config',{points_per_kg:rate});
   if(!outcome?.ok)throw Error('Could not update rate.');
   await refresh();info('RetaBox rate updated.',false,true);
  }catch(e){info(e.message,true);}finally{button.disabled=false;}
 });
})();
