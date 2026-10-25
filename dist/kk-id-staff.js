'use strict';
(()=>{
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const request=(path,body)=>api('./api/kk/staff/id-cards'+path,body?{method:'POST',body:JSON.stringify(body)}:{});
 const photo=id=>'./api/kk/staff/id-cards/'+encodeURIComponent(id)+'/photo';
 let rows=[],selected=null,previewRevision=0,busy=false;
 const report=(msg,error=false)=>{const target=$('#kk-id-staff-status');if(!target)return;target.textContent=msg;target.dataset.kind=error?'error':'info';};
 const approved=r=>r.status==='approved'&&r.photo_exists&&/^VASRA-KK-\d+$/.test(r.kk_id||'');
 const date=v=>v?new Date(v).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Manila'}):'—';
 const filtered=()=>{
  const filter=$('#kk-id-staff-filter').value,q=$('#kk-id-staff-query').value.trim().toLowerCase();
  return rows.filter(r=>(filter==='all'||(filter==='printed'?!!r.printed_at:r.status===filter))&&
   (!q||[r.name,r.kk_id].some(v=>String(v||'').toLowerCase().includes(q))));
 };
 const paint=()=>{
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
    '</div><div class="kk-id-staff-actions">'+
    '<button type="button" data-card-preview="'+esc(r.member_id)+'">View Front & Back</button>'+
    (r.status==='pending'?'<button type="button" data-card-approve="'+esc(r.member_id)+'">Approve Photo</button>'+
     '<button type="button" data-card-reject="'+esc(r.member_id)+'">Reject</button>':'')+
    (approved(r)?'<button type="button" class="kk-id-download-button" data-card-download="'+esc(r.member_id)+'">Download PDF</button>'+
     '<button type="button" class="kk-id-print-button" data-card-print="'+esc(r.member_id)+'">Print Front & Back</button>'+
     '<button type="button" class="kk-id-mark-printed" data-card-printed="'+esc(r.member_id)+'">'+
       (r.printed_at?'Record Reprint':'Mark as Printed')+'</button>':'')+
    '</div></article>'
  ).join(''):'<div class="kk-id-empty">Walang KK ID cards na tumutugma sa filter.</div>';
 };
 const preview=async(id)=>{
  selected=id;paint();const row=rows.find(r=>r.member_id===id);
  if(!row)return;
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
   rows=response.members;paint();
   report(rows.length+' verified members · '+rows.filter(approved).length+' ready for PDF · '+
    rows.filter(r=>r.printed_at).length+' printed');
   if(rows.length)await preview(rows.some(r=>r.member_id===selected)?selected:
    (rows.find(r=>r.photo_exists)?.member_id||rows[0].member_id));
   else{$('#kk-id-staff-front').removeAttribute('src');$('#kk-id-staff-back').removeAttribute('src');
    $('#kk-id-staff-preview-status').textContent='No verified KK ID members yet.';}
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
   report('Downloaded '+items.length+' approved KK IDs: '+pages.length+' exact-size front/back PDF pages.');
  }catch(e){report('Batch PDF failed: '+e.message+' — no partial set was exported.',true);}
  finally{busy=false;paint();}
 };
 const print=async member=>{
  if(!approved(member))return;
  try{
   const root=$('#kk-id-print-root'),{front,back}=await make(member);
   root.innerHTML='<div class="kk-print-page"><img class="kk-id-print-canvas" src="'+front.toDataURL('image/jpeg',.98)+'" alt="Front"></div>'+
    '<div class="kk-print-page"><img class="kk-id-print-canvas" src="'+back.toDataURL('image/jpeg',.98)+'" alt="Back"></div>';
   await Promise.all([...root.querySelectorAll('img')].map(i=>i.decode()));
   report('Printing '+member.kk_id+' at actual CR80 size (85.6 × 54 mm). After physically printing, select Mark as Printed.');
   window.print();
  }catch(e){report('Printing failed: '+e.message,true);$('#kk-id-print-root').replaceChildren();}
 };
 const mark=async member=>{
  if(!approved(member))return;
  if(!confirm('Confirm that '+member.kk_id+' for '+member.name+' was physically printed'+
    (member.printed_at?' AGAIN':'')+'? This permanently records the SK officer and print timestamp.'))return;
  try{
   const result=await request('/printed',{id:member.member_id,confirmed:true});
   if(result?.ok!==true)throw Error('No server confirmation.');
   await load();report('Recorded printed KK ID: '+member.kk_id+' · print count '+result.print_count+'.');
  }catch(e){report('Could not mark ID as printed: '+e.message,true);}
 };
 $('#kk-id-staff-query')?.addEventListener('input',paint);
 $('#kk-id-staff-filter')?.addEventListener('change',paint);
 $('#kk-id-bulk-pdf')?.addEventListener('click',all);
 $('#kk-id-staff-refresh')?.addEventListener('click',load);
 $('#kk-id-staff-list')?.addEventListener('click',async event=>{
  if(busy)return;
  const target=event.target.closest('button[data-card-preview],button[data-card-approve],button[data-card-reject],button[data-card-download],button[data-card-print],button[data-card-printed]');
  if(!target)return;
  const id=target.dataset.cardPreview||target.dataset.cardApprove||target.dataset.cardReject||
   target.dataset.cardDownload||target.dataset.cardPrint||target.dataset.cardPrinted;
  const member=rows.find(r=>r.member_id===id);if(!member)return;
  if(target.dataset.cardPreview){await preview(id);return;}
  if(target.dataset.cardDownload){try{target.disabled=true;report('Preparing '+member.kk_id+' PDF…');await pdfOne(member);
   report('Downloaded '+member.kk_id+' front/back PDF · CR80 85.6 × 54 mm.');}
   catch(e){report('Download failed: '+e.message,true);}finally{target.disabled=false;}return;}
  if(target.dataset.cardPrint){await print(member);return;}
  if(target.dataset.cardPrinted){await mark(member);return;}
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
   await load();report('KK ID photo '+(yes?'approved':'rejected')+' for '+member.kk_id+'.');
  }catch(e){report('Review failed: '+e.message,true);target.disabled=false;}
 });
 window.addEventListener('afterprint',()=>$('#kk-id-print-root')?.replaceChildren());
 window.loadKKIDStaff=load;
})();
