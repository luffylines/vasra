'use strict';
(()=>{
 const $=selector=>document.querySelector(selector);
 const overlay=$('#kk-quick-overlay'),video=$('#kk-quick-video'),canvas=$('#kk-quick-canvas');
 if(!overlay||!video||!canvas)return;
 const statusEl=$('#kk-quick-status'),manual=$('#kk-quick-manual-id');
 const frame=overlay.querySelector('.kk-quick-camera-frame'),hint=$('#kk-quick-camera-hint');
 let stream=null,timer=null,active=false,reading=false,busy=false,barcode=null,previousFocus=null,revision=0,notice='';
 const cameraState=(value,hintText)=>{
   overlay.dataset.camera=value;
   if(hintText)hint.textContent=hintText;
 };
 const message=(msg,error=false)=>{
  statusEl.textContent=String(msg);
  statusEl.dataset.kind=error?'error':'info';
 };
 const stop=()=>{
  active=false;revision++;
  if(timer!==null){clearInterval(timer);timer=null;}
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
  try{video.pause();}catch{}
  video.srcObject=null;video.hidden=true;
  $('#kk-quick-camera-hint').hidden=false;
  $('#kk-quick-start').hidden=false;$('#kk-quick-stop').hidden=true;
  reading=false;
  if(overlay.dataset.camera!=='unavailable')cameraState('idle','Camera is off. Start Camera or enter the KK ID.');
 };
 const close=()=>{
  stop();overlay.hidden=true;
  document.body.classList.remove('kk-quick-open');
  previousFocus?.focus?.();previousFocus=null;
 };
 window.closeQuickKKScan=close;
 const recognized=async value=>{
  if(busy||overlay.hidden)return;
  const raw=String(value||'').trim().toUpperCase();
  if(!/^VASRA-KK-[0-9]{1,10}$/.test(raw)){
   if(notice!==raw){notice=raw;message('This QR is not a VASRA KK ID. Scan the QR on the back of the approved card.',true);}
   return;
  }
  busy=true;message('Verified KK ID format. Opening SK Services…');
  stop(); // stop camera before navigating
  close();
  try{
   if(typeof window.enterKKScanService!=='function')throw Error('Service scanner is unavailable. Reload the dashboard.');
   await window.enterKKScanService(raw);
  }catch(error){
   overlay.hidden=false;document.body.classList.add('kk-quick-open');
   message('Unable to open verified KK member: '+error.message,true);
  }finally{busy=false;}
 };
 const scan=async()=>{
  if(!active||reading||busy||overlay.hidden||video.readyState<2)return;
  reading=true;const seq=revision;
  try{
   let raw=null;
   if(barcode){
    const codes=await barcode.detect(video);
    raw=codes.find(x=>x.rawValue)?.rawValue||null;
   }else if(typeof window.jsQR==='function'&&video.videoWidth){
    const w=Math.min(800,video.videoWidth),h=Math.round(w*video.videoHeight/video.videoWidth);
    if(w&&h){
     canvas.width=w;canvas.height=h;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     ctx.drawImage(video,0,0,w,h);
     raw=window.jsQR(ctx.getImageData(0,0,w,h).data,w,h,{inversionAttempts:'attemptBoth'})?.data||null;
    }
   }
   if(raw&&seq===revision)await recognized(raw);
  }catch(error){
   if(seq===revision)message('Camera decoding error: '+error.message,true);
  }finally{reading=false;}
 };
 const start=async()=>{
  if(active||overlay.hidden)return;
  if(!navigator.mediaDevices?.getUserMedia){
   cameraState('unavailable','No camera API on this browser. Enter the KK ID manually.');
   message('Camera unavailable. Use the manual KK ID field.',true);return;
  }
  if(!window.isSecureContext){
   cameraState('unavailable','Open SK VASRA over HTTPS to use the camera.');
   message('Camera requires HTTPS. Use the secure SK VASRA website.',true);return;
  }
  cameraState('starting','Waiting for camera permission…');
  try{
   barcode=null;
   if(typeof window.BarcodeDetector==='function'){
    try{barcode=new window.BarcodeDetector({formats:['qr_code']});}catch{barcode=null;}
   }
   if(!barcode&&typeof window.jsQR!=='function')throw Error('QR decoder did not load. Reload the page or use manual KK ID.');
   // Some Windows laptops and phones do not have a rear-facing camera.
   // Retry with the browser default camera before reporting "device not found".
   let media;
   try{
    media=await navigator.mediaDevices.getUserMedia({
     video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false
    });
   }catch(firstError){
    if(!['NotFoundError','OverconstrainedError','DevicesNotFoundError'].includes(firstError.name))throw firstError;
    media=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
   }
   if(overlay.hidden){media.getTracks().forEach(track=>track.stop());return;}
   stream=media;video.srcObject=media;video.hidden=false;
   await video.play();active=true;
   cameraState('live');
   $('#kk-quick-camera-hint').hidden=true;
   $('#kk-quick-start').hidden=true;$('#kk-quick-stop').hidden=false;
   message('Camera scanning. Hold the QR steady inside the preview.');
   timer=setInterval(scan,230);
  }catch(error){
   stop();
   const code=error?.name||'';
   cameraState('unavailable',code==='NotFoundError'||code==='DevicesNotFoundError'?
     'No camera detected. Check your device or enter a KK ID below.':
     code==='NotAllowedError'||code==='PermissionDeniedError'?
     'Camera permission blocked. Enable camera permission or use manual entry.':
     'Camera could not start. You can still enter the KK ID below.');
   message(code==='NotAllowedError'||code==='PermissionDeniedError'
    ?'Camera blocked. Allow camera access in your browser settings, or enter the KK ID manually.'
    :code==='NotFoundError'||code==='DevicesNotFoundError'
     ?'No camera detected on this device. Connect or enable a camera, or use manual KK ID.'
     :'Camera unavailable: '+String(error.message||'Try manual KK ID.'),true);
  }
 };
 window.openQuickKKScan=()=>{
  if(!overlay.hidden)return;
  previousFocus=document.activeElement;
  overlay.hidden=false;document.body.classList.add('kk-quick-open');
  notice='';manual.value='';cameraState('starting','Waiting for camera permission…');message('Opening camera…');
  $('#kk-quick-close').focus();
  start();
 };
 $('#kk-quick-close').addEventListener('click',close);
 $('#kk-quick-start').addEventListener('click',start);
 $('#kk-quick-stop').addEventListener('click',()=>{stop();message('Camera stopped. Start again or enter KK ID manually.');});
 $('#kk-quick-manual-form').addEventListener('submit',e=>{e.preventDefault();recognized(manual.value);});
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 document.addEventListener('keydown',e=>{
  if(overlay.hidden)return;
  if(e.key==='Escape'){e.preventDefault();close();}
  if(e.key==='Tab'){
   const focusable=[...overlay.querySelectorAll('button:not([hidden]):not([disabled]),input:not([disabled])')]
    .filter(el=>el.getClientRects().length);
   const first=focusable[0],last=focusable.at(-1);
   if(first&&last&&e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(first&&last&&!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 window.addEventListener('pagehide',stop);
})();