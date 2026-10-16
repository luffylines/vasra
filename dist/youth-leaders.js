const leadersDirectory=$('#leaders-directory'),leadersRetry=$('#leaders-retry');
async function loadYouthLeaders(){
 leadersDirectory.setAttribute('aria-busy','true');leadersRetry.hidden=true;
 leadersDirectory.innerHTML='<div class="trans-empty">Kinukuha ang published SK officers…</div>';
 try{
  const year=new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date());
  const data=await api('./api/transparency?year='+year);
  if(!Array.isArray(data.officials))throw Error('Invalid public directory response');
  leadersDirectory.innerHTML=officerChart(data.officials, data.directory_managed===true);
 }catch{
  // Do not re-show a removed officer from duty data if the authoritative directory is unreachable.
  leadersDirectory.innerHTML='<div class="trans-empty">Hindi ma-check ang official SK directory sa ngayon. <a href="./contacts.html">Makipag-ugnay sa SK Vasra</a> kung kailangan.</div>';
  leadersRetry.hidden=false;
 }finally{leadersDirectory.setAttribute('aria-busy','false')}
}
leadersRetry.onclick=loadYouthLeaders;
loadYouthLeaders();
