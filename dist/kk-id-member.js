'use strict';
(()=>{
 const $=s=>document.querySelector(s),upload=$('#kk-id-upload-form');
 if(!upload)return;
 const status=$('#kk-id-upload-status');
 let revision=0;
 const tell=(s,err=false)=>{status.textContent=s;status.dataset.kind=err?'error':'success';status.hidden=!s;};
 const load=async()=>{
  const version=++revision;
  $('#kk-id-display-name').textContent=[window.kkCardMember?.first_name,window.kkCardMember?.middle_name,window.kkCardMember?.last_name].filter(Boolean).join(' ')||'Verified KK Member';
  $('#kk-id-display-number').textContent=window.kkCardNumber||'VASRA-KK-—';
  const notice=$('#kk-id-preview-note');
  notice.textContent='Rendering your official CR80 front and back ID preview…';
  try{
   const response=await api('./api/kk/id-card');
   if(response?.ok!==true)throw Error('Unable to load KK ID details.');
   const found=!!response.photo_exists,state=response.status||'not_uploaded';
   $('#kk-id-card-approval').textContent=found?(state==='approved'?
    (response.printed_at?'Printed · Official ID':'Photo Approved · Ready for Print'):
    state==='rejected'?'Needs Photo Correction':'Awaiting SK Photo Approval'):'No Photo Yet';
   $('#kk-id-card-approval').dataset.status=state;
   const member={
    ...window.kkCardMember,...response,
    kk_id:response.kk_id||window.kkCardNumber||'',
    status:state
   };
   const picture=found?'./api/kk/id-card/photo?t='+Date.now():null;
   let cards;
   try{cards=await window.KKIDRender.pair(member,picture);}
   catch(e){if(!found)throw e;cards=await window.KKIDRender.pair(member,null);
     tell('Hindi ma-load ang larawan mula sa private storage: '+e.message,true);}
   if(version!==revision)return;
   $('#kk-id-render-front').src=cards.front.toDataURL('image/jpeg',.92);
   $('#kk-id-render-back').src=cards.back.toDataURL('image/jpeg',.92);
   notice.textContent=state==='approved'?
    (response.printed_at?'Your official KK ID has been recorded as printed.':
     'Your portrait is approved. SK officers can now download and print both sides in actual CR80 size.'):
    found?'Portrait submitted. The preview will update after SK verification.':
     'Upload your portrait to complete the ID; the preview already shows your verified membership details and QR.';
   if(state==='rejected'&&response.review_note)tell('SK Officer: '+response.review_note,true);
  }catch(err){notice.textContent='Cannot render KK ID: '+err.message;tell('Cannot load KK ID details: '+err.message,true);}
 };
 upload.addEventListener('submit',async e=>{
  e.preventDefault();
  const file=$('#kk-id-photo').files[0];
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<100||file.size>2000000){
   tell('Choose a valid JPG/PNG/WEBP portrait with a maximum size of 2 MB.',true);return;
  }
  const button=upload.querySelector('button[type=submit]');button.disabled=true;
  tell('Uploading portrait securely…');
  try{
   const buf=await file.arrayBuffer(),bytes=new Uint8Array(buf);
   let binary='';for(let i=0;i<bytes.length;i+=32768)
    binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   const response=await api('./api/kk/id-card/photo',{method:'POST',
    body:JSON.stringify({name:file.name,mime:file.type,data:btoa(binary)})});
   if(response?.ok!==true)throw Error('Photo upload was not confirmed');
   upload.reset();tell('Photo submitted. Waiting for SK Officer review.');
   await load();
  }catch(err){tell('Hindi na-upload: '+err.message,true);}
  finally{button.disabled=false;}
 });
 window.loadKKIDCard=load;
})();
