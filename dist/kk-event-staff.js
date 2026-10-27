'use strict';
(()=>{
 const $=s=>document.querySelector(s);
 const enc=encodeURIComponent;
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const pht=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'2-digit',
   hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
 const onlyDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'});
 const safeId=value=>{
  const id=String(value||'').trim().toUpperCase();
  if(!/^VASRA-KK-[0-9]{1,10}$/.test(id))throw Error('Scan the back of the KK ID or enter VASRA-KK-02.');
  return id;
 };
 const toast=(s,error=false)=>window.showVasraToast?.(s,error?'error':'success');
 const request=async(path,body)=>api('./api/kk/staff/events'+path,body===undefined?{}:
   {method:'POST',body:JSON.stringify(body)});
 const page=$('#panel-kk-participants'),select=$('#kk-event-active-select'),video=$('#kk-event-video'),
   canvas=$('#kk-event-canvas'),result=$('#kk-event-scan-result');
 if(!page||!video||!canvas)return;
 let events=[],finished=[],officer='',currentEvent='',roster=[],stream=null,active=false,
   detector=null,timer=null,busy=false,fetching=false,decoderPromise=null,lastCode='',lostFrames=0,revision=0;
 const setStatus=(message,error=false)=>{
   result.textContent=message;result.dataset.kind=error?'error':'info';
 };
 const stopCamera=()=>{
  active=false;
  if(timer){clearInterval(timer);timer=null;}
  if(stream){for(const t of stream.getTracks())t.stop();stream=null;}
  try{video.pause();}catch{}
  video.srcObject=null;video.hidden=true;
  $('#kk-event-camera-start').hidden=false;
  $('#kk-event-camera-stop').hidden=true;
  $('#kk-event-camera-hint').hidden=false;
  lastCode='';lostFrames=0;
 };
 const drawRoster=()=>{
  $('#kk-event-participants-count').textContent=String(roster.length);
  const today=onlyDate.format(new Date());
  $('#kk-event-today-count').textContent=String(roster.filter(r=>
     r.checked_in_at&&onlyDate.format(new Date(r.checked_in_at))===today).length);
  const table=$('#kk-event-roster');
  if(!currentEvent){table.innerHTML='<p class="kk-reward-empty">Select an active event. Previous-event participants are not shown here.</p>';return;}
  if(!roster.length){table.innerHTML='<p class="kk-reward-empty">No verified check-ins yet for this event. Scan the first KK ID to start the log.</p>';return;}
  table.innerHTML='<div class="kk-event-table-wrap"><table class="kk-event-table"><thead><tr>'+
   '<th>KK ID</th><th>Verified Member</th><th>Scan Date & Time (PHT)</th><th>Points</th><th>SK Officer</th></tr></thead><tbody>'+
   roster.map(r=>'<tr><td>'+esc(r.kk_id)+'</td><td>'+esc(r.name)+'</td><td>'+
     esc(pht.format(new Date(r.checked_in_at)))+'</td><td><strong>+'+Number(r.points||0)+'</strong></td><td>'+
     esc(r.officer||'—')+'</td></tr>').join('')+'</tbody></table></div>';
 };
 const loadRoster=async(id,seq)=>{
  if(!id){roster=[];drawRoster();return;}
  const data=await request('/roster?project_id='+enc(id));
  if(currentEvent!==id||seq!==revision)return;
  roster=Array.isArray(data.participants)?data.participants:[];
  drawRoster();
 };
 const drawArchive=()=>{
  $('#kk-event-archive').innerHTML=finished.length?
    finished.map(p=>'<article class="kk-event-archived"><div><strong>'+esc(p.title)+'</strong>'+
    '<small>Completed · '+Number(p.attendees||0)+' checked-in participants</small>'+
    (p.last_checkin_at?'<small>Last check-in: '+esc(pht.format(new Date(p.last_checkin_at)))+'</small>':'')+'</div>'+
    '<button type="button" class="secondary" data-event-export="'+esc(p.id)+'">Download Excel</button></article>').join(''):
    '<p class="kk-reward-empty">No completed events with registered attendance yet.</p>';
 };
 const choose=async(id)=>{
  revision++;stopCamera();currentEvent=id;
  $('#kk-event-scanner-panel').hidden=!id;
  const evt=events.find(e=>e.id===id);
  $('#kk-event-selection').textContent=evt?'Recording attendance for: '+evt.title:
    'Choose a current Isinasagawa event to begin.';
  $('#kk-event-manual-id').value='';
  setStatus('Ready for the next verified KK member.');
  roster=[];drawRoster();
  if(!id)return;
  try{await loadRoster(id,revision);}catch(e){setStatus(e.message,true);}
 };
 const refresh=async()=>{
  if(fetching)return;
  fetching=true;
  try{
   const data=await request('');
   events=Array.isArray(data.active_events)?data.active_events:[];
   finished=Array.isArray(data.finished_events)?[...data.finished_events].sort((a,b)=>{
    const date=p=>Date.parse(p.last_checkin_at||p.created_at||0)||0;
    return date(b)-date(a);
   }):[];
   officer=data.officer?.name||'Authenticated SK Officer';
   $('#kk-event-active-count').textContent=String(events.length);
   const preserved=currentEvent;
   select.innerHTML='<option value="">Select an active event</option>'+
    events.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
   drawArchive();
   if(events.some(x=>x.id===preserved)){select.value=preserved;await loadRoster(preserved,revision);}
   else{select.value='';await choose('');}
  }catch(e){setStatus('Cannot load SK events: '+e.message,true);toast(e.message,true);}
  finally{fetching=false;}
 };
 window.loadKKEventStaff=refresh;
 const checkin=async(raw,automatic=false)=>{
  if(!currentEvent||busy)return;
  let id;try{id=safeId(raw);}catch(e){setStatus(e.message,true);if(!automatic)toast(e.message,true);return;}
  busy=true;
  const selected=currentEvent,seq=revision;
  setStatus('Verifying KK ID and recording the +10 points check-in…');
  try{
   const row=await request('/checkin',{project_id:selected,kk_id:id});
   if(seq!==revision||selected!==currentEvent)return;
   const message='CHECKED IN: '+row.name+' ('+row.kk_id+') · +10 points · '+
      pht.format(new Date(row.checked_in_at))+' · '+(row.officer||officer);
   setStatus(message);
   toast(row.name+' checked in · +10 points');
   $('#kk-event-manual-id').value='';
   await loadRoster(selected,seq);
  }catch(e){
   if(seq!==revision)return;
   setStatus(e.message,true);
   toast(e.message,true);
   if(/not currently|not open|Isinasagawa/i.test(e.message))await refresh();
  }finally{busy=false;}
 };
 const loadDecoder=()=>{
  if(typeof window.jsQR==='function')return Promise.resolve();
  if(decoderPromise)return decoderPromise;
  decoderPromise=new Promise((resolve,reject)=>{
   const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
   s.async=true;s.crossOrigin='anonymous';
   s.onload=()=>typeof window.jsQR==='function'?resolve():reject(Error('QR decoding unavailable. Use manual entry.'));
   s.onerror=()=>reject(Error('QR library unavailable. Use manual KK ID.'));
   document.head.appendChild(s);
  });
  return decoderPromise;
 };
 const scanFrame=async()=>{
  if(!active||busy||!stream||page.hidden||!currentEvent||video.readyState<2)return;
  try{
   let value=null;
   if(detector){const symbols=await detector.detect(video);value=symbols.find(x=>x.rawValue)?.rawValue||null;}
   else if(window.jsQR&&video.videoWidth){
     const w=Math.min(720,video.videoWidth),h=Math.round(w*video.videoHeight/video.videoWidth);
     if(h>0){canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});
       ctx.drawImage(video,0,0,w,h);
       const pix=ctx.getImageData(0,0,w,h);value=window.jsQR(pix.data,w,h)?.data||null;}
   }
   if(!value){lostFrames++;if(lostFrames>=5)lastCode='';return;}
   lostFrames=0;
   const normalized=String(value).trim().toUpperCase();
   if(lastCode===normalized)return;
   lastCode=normalized;
   await checkin(normalized,true);
  }catch(e){setStatus('Camera scan error: '+e.message,true);}
 };
 const startCamera=async()=>{
  if(active||!currentEvent)return;
  if(!navigator.mediaDevices?.getUserMedia){setStatus('Camera unsupported. Enter KK ID manually.',true);return;}
  try{
   if(typeof window.BarcodeDetector==='function'){
    try{detector=new window.BarcodeDetector({formats:['qr_code']});}catch{detector=null;}
   }
   if(!detector)await loadDecoder();
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1024}},audio:false});
   video.srcObject=stream;video.hidden=false;
   await video.play();active=true;
   $('#kk-event-camera-hint').hidden=true;
   $('#kk-event-camera-start').hidden=true;$('#kk-event-camera-stop').hidden=false;
   setStatus('Scanning the back of the KK ID for '+events.find(x=>x.id===currentEvent)?.title+'.');
   timer=setInterval(scanFrame,250);
  }catch(e){stopCamera();setStatus('Unable to start camera. Allow permission or use manual ID: '+e.message,true);}
 };
 const download=async(button,id)=>{
  if(!finished.some(x=>x.id===id))return;
  button.disabled=true;
  try{
   const res=await fetch('./api/kk/staff/events/export?project_id='+enc(id),{credentials:'same-origin'});
   if(!res.ok){let data;try{data=await res.json();}catch{}throw Error(data?.error||'Cannot export this completed event.');}
   const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='SK-Vasra-Event-Attendance.xlsx';
   document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1200);
  }catch(e){toast(e.message,true);}finally{button.disabled=false;}
 };
 select.addEventListener('change',()=>choose(select.value));
 $('#kk-event-refresh').addEventListener('click',refresh);
 $('#kk-event-manual-form').addEventListener('submit',e=>{
  e.preventDefault();checkin($('#kk-event-manual-id').value,false);
 });
 $('#kk-event-camera-start').addEventListener('click',startCamera);
 $('#kk-event-camera-stop').addEventListener('click',stopCamera);
 page.addEventListener('click',e=>{const b=e.target.closest('[data-event-export]');if(b)download(b,b.dataset.eventExport);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
 window.addEventListener('pagehide',stopCamera);
 // Account is tab-based: never keep a camera running outside the Participants page.
 new MutationObserver(()=>{if(page.hidden)stopCamera();}).observe(page,{attributes:true,attributeFilter:['hidden']});
})();