'use strict';
(()=>{
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[ch]));
 const types={printing:'Free Printing',computer:'Free Computer Use',retabox:'RetaBox Donations'};
 const video=$('#kk-scan-video'),canvas=$('#kk-scan-canvas');
 if(!video||!canvas)return;
 let stream=null,active=false,processing=false,detector=null,timer=null,revision=0,member=null,pending=[],entryKey=null,jsQRLoading=null;
 const status=(msg,error=false)=>{const el=$('#kk-scan-status');el.textContent=msg;el.dataset.kind=error?'error':'info';};
 const detailFields=(type,d={})=>{
  if(type==='printing')return '<div class="kk-scan-fields"><label>Paper size<select name="paper_size"><option value="short"'+(d.paper_size==='short'?' selected':'')+'>Short</option><option value="long"'+(d.paper_size==='long'?' selected':'')+'>Long</option></select></label>'+
   '<label>Print type<select name="color"><option value="bw"'+(d.color==='bw'?' selected':'')+'>Black & White</option><option value="colored"'+(d.color==='colored'?' selected':'')+'>Colored</option></select></label>'+
   '<label>Pages<input name="pages" type="number" min="1" max="100" required value="'+esc(d.pages||1)+'"></label>'+
   '<label>Copies<input name="copies" type="number" min="1" max="100" required value="'+esc(d.copies||1)+'"></label></div>';
  if(type==='computer')return '<div class="kk-scan-fields"><label>Computer hours<input type="number" name="hours" min="1" max="8" required value="'+esc(d.hours||1)+'"></label></div>';
  return '<div class="kk-scan-fields"><label>Verified donation weight (grams)<input type="number" name="grams" min="1" max="100000" required value="'+esc(d.grams||1)+'"></label></div>';
 };
 const formDetails=(form,type)=>{
  const data=new FormData(form);
  const valid=(key,max)=>{const n=Number(data.get(key));if(!Number.isInteger(n)||n<1||n>max)throw Error('Invalid '+key+' amount.');return n;};
  if(type==='printing')return {paper_size:String(data.get('paper_size')),color:String(data.get('color')),pages:valid('pages',100),copies:valid('copies',100)};
  if(type==='computer')return {hours:valid('hours',8)};
  return {grams:valid('grams',100000)};
 };
 const hide=(id)=>{$(id).hidden=true;$(id).innerHTML='';};
 const showResult=data=>{
  member=data.member;pending=data.pending||[];
  const officer=data.officer?.name||'Signed-in SK Officer';
  $('#kk-scan-member').hidden=false;
  $('#kk-scan-member').innerHTML='<div class="kk-scan-member-profile"><span class="kk-scan-id-badge">VERIFIED KK MEMBER</span>'+
    '<h4>'+esc(member.name)+'</h4><p>'+esc(member.kk_id)+'</p>'+
    '<small>Scanned by: <strong>'+esc(officer)+'</strong> · recorded from your authenticated SK session</small></div>';
  const existing=$('#kk-scan-pending');
  existing.hidden=!pending.length;
  existing.innerHTML=pending.length?'<h4>Existing pending requests ('+pending.length+')</h4>'+
  '<p>Confirm the original online request; details may be corrected by the SK Officer.</p>'+
  pending.map(r=>'<form class="kk-scan-service-form" data-scan-pending="'+esc(r.id)+'" data-type="'+esc(r.service_type)+'">'+
   '<header><strong>'+esc(types[r.service_type])+'</strong><small>Requested '+esc(new Date(r.requested_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}))+'</small></header>'+
   detailFields(r.service_type,r.details)+
   '<label>Officer note (optional)<input name="note" maxlength="500" placeholder="Verified during service"></label>'+
   '<button type="submit" class="primary">Confirm & Record Completed</button></form>').join(''):'';
  const walkin=$('#kk-scan-walkin');walkin.hidden=false;
  walkin.innerHTML=(pending.length?'<p class="kk-scan-walkin-separator">Need a different service?</p>':'<h4>No pending requests</h4><p>Select the service being provided and confirm the actual details.</p>')+
   '<form id="kk-scan-walkin-form" class="kk-scan-service-form">'+
   '<label>Service<select name="service_type" id="kk-scan-service-type"><option value="printing">Free Printing</option><option value="computer">Free Computer Use</option><option value="retabox">RetaBox Donations</option></select></label>'+
   '<div id="kk-scan-service-fields">'+detailFields('printing')+'</div>'+
   '<label>Officer note (optional)<input name="note" maxlength="500" placeholder="Record the actual service"></label>'+
   '<button type="submit" class="primary">Confirm & Record Completed</button></form>';
  entryKey=crypto?.randomUUID?.()||null;
  status('KK member verified. Choose an existing request or enter the actual walk-in service.');
 };
 const fetchScan=async body=>{
  const result=await api('./api/kk/staff/services/scan',{method:'POST',body:JSON.stringify(body)});
  if(!result?.ok)throw Error(result?.message||'Unable to verify QR service.');
  return result;
 };
 const safeId=value=>{
  const id=String(value||'').trim().toUpperCase();
  if(!/^VASRA-KK-[0-9]{1,10}$/.test(id))throw Error('Scan a valid SK VASRA KK ID (for example, VASRA-KK-02).');
  return id;
 };
 const lookup=async raw=>{
  if(processing)return;
  processing=true;
  const seq=++revision;
  try{
   const id=safeId(raw);
   stopCamera();
   status('Looking up verified KK member…');
   member=null;pending=[];entryKey=null;
   hide('#kk-scan-member');hide('#kk-scan-pending');hide('#kk-scan-walkin');
   const data=await fetchScan({action:'lookup',kk_id:id});
   if(seq!==revision)return;
   $('#kk-scan-manual-input').value=id;
   showResult(data);
  }catch(e){status(e.message,true);window.showVasraToast?.(e.message,'error');}
  finally{processing=false;}
 };
 const stopCamera=()=>{
  active=false;
  if(timer){clearTimeout(timer);timer=null;}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  video.pause?.();video.srcObject=null;video.hidden=true;
  $('#kk-scan-stop').hidden=true;$('#kk-scan-start').hidden=false;
  $('#kk-scan-placeholder').hidden=false;
 };
 const decodeFrame=async()=>{
  if(!active||processing||!stream)return;
  if(video.readyState<2)return;
  try{
   let value=null;
   if(detector){const codes=await detector.detect(video);value=codes[0]?.rawValue||null;}
   else if(window.jsQR){
    const w=Math.min(720,video.videoWidth),h=Math.round(w*video.videoHeight/video.videoWidth);
    if(w>0&&h>0){canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});
     ctx.drawImage(video,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h);value=window.jsQR(pixels.data,w,h)?.data||null;}
   }
   if(value){await lookup(value);return;}
  }catch{}
 };
 const fallback=()=>new Promise((resolve,reject)=>{
  if(typeof window.jsQR==='function'){resolve();return;}
  if(jsQRLoading){jsQRLoading.then(resolve,reject);return;}
  jsQRLoading=new Promise((ok,fail)=>{
   const script=document.createElement('script');
   script.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
   script.async=true;script.crossOrigin='anonymous';
   script.onload=()=>typeof window.jsQR==='function'?ok():fail(Error('QR decoder unavailable'));
   script.onerror=()=>fail(Error('Unable to load QR decoder; enter KK ID manually.'));
   document.head.appendChild(script);
  });
  jsQRLoading.then(resolve,reject);
 });
 const startCamera=async()=>{
  if(active)return;
  if(!navigator.mediaDevices?.getUserMedia){status('Camera unavailable in this browser. Enter the KK ID manually.',true);return;}
  try{
   if(typeof window.BarcodeDetector==='function'){
    try{detector=new window.BarcodeDetector({formats:['qr_code']});}catch{detector=null;}
   }
   if(!detector)await fallback();
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1024}},audio:false});
   video.srcObject=stream;
   video.hidden=false;
   await video.play();
   active=true;$('#kk-scan-placeholder').hidden=true;
   $('#kk-scan-start').hidden=true;$('#kk-scan-stop').hidden=false;
   status('Point camera at the QR on the back of the KK ID.');
   timer=setInterval(decodeFrame,230);
  }catch(e){stopCamera();status('Cannot start camera: '+(e.name==='NotAllowedError'?'Please allow camera access in browser settings.':e.message),true);}
 };
 window.openKKScan=()=>{
  const panel=$('#kk-scan-panel');panel.hidden=false;
  panel.scrollIntoView?.({behavior:'smooth',block:'start'});
  status('Ready to scan. Start Camera or enter KK ID.');
 };
 const close=()=>{revision++;stopCamera();$('#kk-scan-panel').hidden=true;member=null;pending=[];entryKey=null;};
 $('#kk-scan-start').addEventListener('click',startCamera);
 $('#kk-scan-stop').addEventListener('click',stopCamera);
 $('#kk-scan-close').addEventListener('click',close);
 $('#kk-scan-manual-submit').addEventListener('click',()=>lookup($('#kk-scan-manual-input').value));
 $('#kk-scan-manual-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookup(e.target.value);}});
 $('#kk-scan-panel').addEventListener('change',e=>{
  if(e.target.id==='kk-scan-service-type')$('#kk-scan-service-fields').innerHTML=detailFields(e.target.value);
 });
 $('#kk-scan-panel').addEventListener('submit',async e=>{
  const form=e.target.closest('.kk-scan-service-form');if(!form)return;
  e.preventDefault();
  if(processing||!member||!form.reportValidity())return;
  const existing=form.dataset.scanPending,kind=existing?form.dataset.type:form.elements.service_type.value;
  let details;try{details=formDetails(form,kind);}catch(err){status(err.message,true);return;}
  if(!confirm('Confirm '+types[kind]+' for '+member.name+' ('+member.kk_id+')? This records an APPROVED and COMPLETED service with your SK account.'))return;
  if(!existing&&!entryKey){status('Secure request identifier unavailable. Refresh this page.',true);return;}
  const action=existing?'complete_pending':'walkin_complete',requestId=existing||undefined;
  const payload={action,kk_id:member.kk_id,service_type:kind,details,note:form.elements.note.value};
  if(existing)payload.request_id=requestId;
  else payload.entry_key=entryKey;
  const button=form.querySelector('button[type="submit"]');button.disabled=true;processing=true;
  try{
   const result=await fetchScan(payload);
   const finishedName=member.name,id=member.kk_id;
   status('Recorded '+types[kind]+' for '+finishedName+' · handled by '+(result.officer||'signed-in officer')+'.');
   window.showVasraToast?.('Service completed and saved to SK / KK history.','success');
   await window.loadKKServiceStaff?.();
   entryKey=null;
   const d=await fetchScan({action:'lookup',kk_id:id});
   showResult(d);
  }catch(err){status(err.message,true);window.showVasraToast?.(err.message,'error');}
  finally{processing=false;button.disabled=false;}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
 window.addEventListener('pagehide',stopCamera);
})();