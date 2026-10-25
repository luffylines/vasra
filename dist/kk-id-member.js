'use strict';
(()=>{
 const $=s=>document.querySelector(s),upload=$('#kk-id-upload-form');
 if(!upload)return;
 const status=$('#kk-id-upload-status'),preview=$('#kk-id-photo-preview'),placeholder=$('#kk-id-placeholder');
 const tell=(s,err=false)=>{status.textContent=s;status.dataset.kind=err?'error':'success';status.hidden=!s;};
 const load=async()=>{
  $('#kk-id-display-name').textContent=[window.kkCardMember?.first_name,window.kkCardMember?.middle_name,window.kkCardMember?.last_name].filter(Boolean).join(' ')||'Verified KK Member';
  $('#kk-id-display-number').textContent=window.kkCardNumber||'VASRA-KK-—';
  try{
   const response=await api('./api/kk/id-card');
   const found=!!response.photo_exists;const state=response.status||'not_uploaded';
   $('#kk-id-card-approval').textContent=found?(state==='approved'?'Photo Approved':state==='rejected'?'Needs Correction':'Awaiting SK Approval'):'No Photo Yet';
   $('#kk-id-card-approval').dataset.status=state;
   preview.hidden=!found;placeholder.hidden=found;
   if(found)preview.src='./api/kk/id-card/photo?t='+Date.now();
   if(state==='rejected'&&response.review_note)tell('SK Officer: '+response.review_note,true);
  }catch(err){tell('Cannot load KK ID photo status: '+err.message,true);}
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
