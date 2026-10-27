'use strict';
(()=>{
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const request=(path,body)=>api('./api/kk/staff/id-cards'+path,body?{method:'POST',body:JSON.stringify(body)}:{});
 const photo=id=>'./api/kk/staff/id-cards/'+encodeURIComponent(id)+'/photo';
 let rows=[],selected=null,previewRevision=0,busy=false;
 const icon={
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></svg>',
  pdf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v6h5M10 16h6m-6 3h5"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  reject:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  printed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M7 7V3h10v4M7 15h10"/></svg>'
 };
 const report=(msg,error=false,success=false)=>{const target=$('#kk-id-staff-status');if(!target)return;if(msg&&(error||success)){target.textContent='';window.showVasraToast(msg,error?'error':'success');return;}target.textContent=msg;target.dataset.kind='info';};
 const approved=r=>r.status==='approved'&&r.photo_exists&&/^VASRA-KK-\d+$/.test(r.kk_id||'');
 const date=v=>v?new Date(v).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Manila'}):'—';
 // Each visible action gets an equal-sized grid cell, regardless of review status.
 const actionLayout=member=>{
  const mail=['approved','rejected'].includes(member.status)&&member.email_state!=='accepted';
  const total=1+(member.status==='pending'?2:0)+(mail?1:0)+(approved(member)?2:0);
  return total===1?'single':total===3?'three':total===4?'four':'two';
 };
 const filtered=()=>{
  const filter=$('#kk-id-staff-filter').value,q=$('#kk-id-staff-query').value.trim().toLowerCase();
  return rows.filter(r=>(filter==='all'||(filter==='printed'?!!r.printed_at:r.status===filter))&&
   (!q||[r.name,r.kk_id].some(v=>String(v||'').toLowerCase().includes(q))));
 };
 const paint=()=>{
  const host=$('#kk-id-staff-list'),previewPanel=$('#kk-id-staff-preview');
  if(previewPanel.parentElement===host)host.after(previewPanel);
  const list=filtered();
  const ready=rows.filter(approved),printed=rows.filter(r=>r.printed_at);
  $('#kk-id-approved-count').textContent=ready.length+' approved for PDF download';
  $('#kk-id-printed-count').textContent=printed.length+' printed KK IDs';
  $('#kk-id-bulk-pdf').disabled=!ready.length||busy;
  $('#kk-id-staff-list').innerHTML=list.length?list.map(r=>
   '<article class="kk-id-staff-item'+(selected===r.member_id?' selected':'')+'">'+
    '<div class="kk-id-staff-photo">'+(r.photo_exists?
    '<img loading="lazy" src="'+photo(r.member_id)+'" alt="KK ID member portrait of '+esc(r.name)+'">':
    '<span>NO PHOTO</span>')+'</div><div class="kk-id-staff-details">'+
    '<h3>'+esc(r.name)+'</h3><p>'+esc(r.kk_id||'Not issued')+'</p>'+
    '<small>Birthday: '+esc(r.birthdate||'—')+'</small>'+
    '<span class="kk-id-review-badge" data-state="'+esc(r.status)+'">'+esc(r.status.replace('_',' '))+'</span>'+
    (r.printed_at?'<span class="kk-id-printed-badge">Printed '+esc(date(r.printed_at))+
     ' · '+esc(r.print_count||1)+' time(s)</span>':'')+
    (r.review_note?'<p class="kk-id-staff-reason">SK note: '+esc(r.review_note)+'</p>':'')+
    (['approved','rejected'].includes(r.status)?
     '<small class="kk-id-email-state">Email: '+esc(r.email_state==='accepted'?'Accepted by provider':
      r.email_state==='pending'?'Pending delivery':
      r.email_state==='sending'?'Sending…':
      r.email_state==='unavailable'?'Email setup pending':'Not queued')+'</small>':'')+
    '</div><div class="kk-id-staff-actions" data-layout="'+actionLayout(r)+'">'+
    '<button type="button" class="kk-id-view-button" data-card-preview="'+esc(r.member_id)+
       '" aria-controls="kk-id-staff-preview" aria-expanded="'+String(selected===r.member_id)+'">'+icon.eye+'<span>View Front & Back</span></button>'+
    (r.status==='pending'?'<button type="button" class="kk-id-approve-button" data-card-approve="'+esc(r.member_id)+'">'+icon.check+'<span>Approve Photo</span></button>'+
     '<button type="button" class="kk-id-reject-button" data-card-reject="'+esc(r.member_id)+'">'+icon.reject+'<span>Reject</span></button>':'')+
    (['approved','rejected'].includes(r.status)&&r.email_state!=='accepted'?
      '<button type="button" class="kk-id-mail-button" data-card-mail="'+esc(r.member_id)+'">'+icon.pdf+
       '<span>'+(r.status==='approved'?'Send / Retry ID PDF Email':'Retry Rejection Email')+'</span></button>':'')+
    (approved(r)?'<button type="button" class="kk-id-download-button" data-card-download="'+esc(r.member_id)+'">'+icon.pdf+'<span>Download PDF</span></button>'+
     '<button type="button" class="kk-id-mark-printed" data-card-printed="'+esc(r.member_id)+'">'+icon.printed+
       '<span>'+(r.printed_at?'Record Reprint':'Mark as Printed')+'</span></button>':'')+
    '</div></article>'
  ).join(''):'<div class="kk-id-empty">Walang KK ID cards na tumutugma sa filter.</div>';
  const active=host.querySelector('.kk-id-staff-item.selected');
  if(active)active.after(previewPanel); // On-demand preview appears beside the chosen member, not after hundreds of IDs.
 };
 const closePreview=()=>{
  selected=null;previewRevision++;
  $('#kk-id-staff-preview').hidden=true;
  $('#kk-id-staff-front').removeAttribute('src');
  $('#kk-id-staff-back').removeAttribute('src');
  $('#kk-id-selected-title').textContent='Selected KK ID · Front & Back';
  $('#kk-id-staff-preview-status').textContent='Select a member to preview both sides.';
  paint();
 };
 const preview=async(id)=>{
  const row=rows.find(r=>r.member_id===id);
  if(!row)return;
  selected=id;paint();
  $('#kk-id-staff-preview').hidden=false;
  $('#kk-id-staff-preview').scrollIntoView?.({behavior:'smooth',block:'nearest'});
  $('#kk-id-selected-title').textContent=row.name+' · '+(row.kk_id||'Pending KK ID');
  $('#kk-id-staff-front').removeAttribute('src');
  $('#kk-id-staff-back').removeAttribute('src');
  const revision=++previewRevision,message=$('#kk-id-staff-preview-status');
  message.textContent='Rendering official front and back preview…';
  try{
   const {front,back}=await window.KKIDRender.pair(row,row.photo_exists?photo(row.member_id):null);
   if(previewRevision!==revision)return;
   $('#kk-id-staff-front').src=front.toDataURL('image/jpeg',.9);
   $('#kk-id-staff-back').src=back.toDataURL('image/jpeg',.9);
   message.textContent=row.name+' · '+row.kk_id+' · '+(row.printed_at?'ID printed':'Awaiting official printing')+
    (approved(row)?' · PDF download available':' · SK photo approval required before PDF download');
  }catch(e){message.textContent='Cannot render portrait: '+e.message;report(message.textContent,true);}
 };
 const load=async()=>{
  report('Loading verified KK IDs…');
  try{
   const response=await request('');
   if(response?.ok!==true||!Array.isArray(response.members))throw Error('Invalid SK ID response.');
   rows=response.members;
   closePreview(); // Never auto-open an ID preview, even after a refresh or review.
   report(rows.length+' verified members · '+rows.filter(approved).length+' ready for PDF · '+
    rows.filter(r=>r.printed_at).length+' printed');
  }catch(e){report('Unable to load KK IDs: '+e.message,true);}
 };
 const make=async(member)=>{
  if(!approved(member))throw Error('SK officer must approve the submitted portrait before official PDF export.');
  return window.KKIDRender.pair(member,photo(member.member_id));
 };
 const pdfOne=async member=>{
  const pair=await make(member);
  window.KKIDRender.pdf([pair.front,pair.back],member.kk_id+'-front-back-CR80.pdf');
 };
 const emailApproved=async member=>{
  if(!approved(member))throw Error('SK photo approval is required before sending an ID PDF.');
  const pair=await make(member);
  const bytes=window.KKIDRender.pdfBytes([pair.front,pair.back]);
  if(bytes.length<300||bytes.length>2700000)
   throw Error('ID PDF is too large for an email attachment; member download remains available.');
  let binary='';for(let i=0;i<bytes.length;i+=32768)
   binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const result=await request('/notify',{action:'attach_and_send',id:member.member_id,pdf_data:btoa(binary)});
  if(!result?.ok)throw Error('The SK server did not accept the PDF attachment.');
  return result.email_notification?.status||'pending';
 };
 const notifyMember=async member=>{
  if(member.status==='approved'&&!member.email_pdf_ready)
   return emailApproved(member);
  const res=await request('/notify',{action:'retry',id:member.member_id});
  return res.email_notification?.status||'pending';
 };
 const all=async()=>{
  const items=rows.filter(approved);
  if(!items.length){report('No approved ID portraits are ready for download.',true);return;}
  if(busy)return;
  busy=true;paint();
  try{
   const pages=[];
   for(let i=0;i<items.length;i++){
    const member=items[i];
    report('Preparing CR80 PDF: '+(i+1)+' of '+items.length+' · '+member.kk_id);
    const pair=await make(member);
    pages.push(pair.front,pair.back);
   }
   window.KKIDRender.pdf(pages,'SK-VASRA-all-approved-KK-IDs-CR80.pdf');
   report('Downloaded '+items.length+' approved KK IDs: '+pages.length+' exact-size front/back PDF pages.',false,true);
  }catch(e){report('Batch PDF failed: '+e.message+' — no partial set was exported.',true);}
  finally{busy=false;paint();}
 };
 const mark=async member=>{
  if(!approved(member))return;
  if(!confirm('Confirm that '+member.kk_id+' for '+member.name+' was physically printed'+
    (member.printed_at?' AGAIN':'')+'? This permanently records the SK officer and print timestamp.'))return;
  try{
   const result=await request('/printed',{id:member.member_id,confirmed:true});
   if(result?.ok!==true)throw Error('No server confirmation.');
   await load();report('Recorded printed KK ID: '+member.kk_id+' · print count '+result.print_count+'.',false,true);
  }catch(e){report('Could not mark ID as printed: '+e.message,true);}
 };
 $('#kk-id-staff-query')?.addEventListener('input',()=>{closePreview();});
 $('#kk-id-staff-filter')?.addEventListener('change',()=>{closePreview();});
 $('#kk-id-preview-close')?.addEventListener('click',closePreview);
 $('#kk-id-bulk-pdf')?.addEventListener('click',all);
 $('#kk-id-staff-refresh')?.addEventListener('click',load);
 $('#kk-id-staff-list')?.addEventListener('click',async event=>{
  if(busy)return;
  const target=event.target.closest('button[data-card-preview],button[data-card-approve],button[data-card-reject],button[data-card-download],button[data-card-printed],button[data-card-mail]');
  if(!target)return;
  const id=target.dataset.cardPreview||target.dataset.cardApprove||target.dataset.cardReject||
   target.dataset.cardDownload||target.dataset.cardPrinted||target.dataset.cardMail;
  const member=rows.find(r=>r.member_id===id);if(!member)return;
  if(target.dataset.cardPreview){await preview(id);return;}
  if(target.dataset.cardDownload){try{target.disabled=true;report('Preparing '+member.kk_id+' PDF…');await pdfOne(member);
   report('Downloaded '+member.kk_id+' front/back PDF · CR80 85.6 × 54 mm.',false,true);}
   catch(e){report('Download failed: '+e.message,true);}finally{target.disabled=false;}return;}
  if(target.dataset.cardPrinted){await mark(member);return;}
  if(target.dataset.cardMail){
   target.disabled=true;
   try{
    const status=await notifyMember(member);
    await load();
    report(status==='provider_accepted'?'SK ID review email accepted by provider.':
     'The email is still pending. Verify the Resend settings or retry later.',
     status!=='provider_accepted',status==='provider_accepted');
   }catch(e){report('Email send failed: '+e.message,true);}
   finally{target.disabled=false;}
   return;
  }
  if(member.status!=='pending')return;
  const yes=!!target.dataset.cardApprove;
  let note='';
  if(yes){
   if(!confirm('Approve the KK ID portrait for '+member.name+' ('+member.kk_id+') for printing?'))return;
  }else{
   const answer=prompt('Photo rejection reason (minimum 5 characters):');
   if(answer===null)return;note=answer.trim();if(note.length<5){report('Enter a rejection reason of at least 5 characters.',true);return;}
  }
  target.disabled=true;
  try{
   const result=await request('/review',{id,status:yes?'approved':'rejected',note});
   if(result?.ok!==true)throw Error('Photo review not confirmed by server.');
   await load();
   if(yes){
    const current=rows.find(r=>r.member_id===id);
    if(!current)throw Error('Card approved, but staff preview needs a refresh.');
    try{
     const status=await emailApproved(current);
     await load();
     report(status==='provider_accepted'?
      'KK ID approved. The front/back PDF email was accepted by the provider.':
      'KK ID approved. The PDF email is pending; use Send / Retry ID PDF Email.',
      status!=='provider_accepted',status==='provider_accepted');
    }catch(e){
     report('KK ID approved, but the PDF email is pending: '+e.message+
      '. Use Send / Retry ID PDF Email when ready.',true);
    }
   }else{
    report(result.email_notification?.status==='provider_accepted'?
     'Photo rejected. Rejection email accepted by provider; member may upload a new photo.':
     'Photo rejected. Member may upload again, but rejection email is pending.',
     result.email_notification?.status!=='provider_accepted',
     result.email_notification?.status==='provider_accepted');
   }
  }catch(e){report('Review failed: '+e.message,true);target.disabled=false;}
 });
 window.loadKKIDStaff=load;
})();
