const leadersDirectory=$('#leaders-directory'),leadersRetry=$('#leaders-retry');
async function loadYouthLeaders(){
 leadersDirectory.setAttribute('aria-busy','true');leadersRetry.hidden=true;
 leadersDirectory.innerHTML='<div class="trans-empty">Kinukuha ang published SK officers…</div>';
 try{
  const year=new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date());
  const data=await api('./api/transparency?year='+year);
  if(!Array.isArray(data.officials))throw Error('Invalid public directory response');
  leadersDirectory.innerHTML=officerChart(data.officials);
 }catch{
  const fallback=dutyOfficers();
  leadersDirectory.innerHTML=fallback.length?'<p class="org-source-note" role="status">Hindi ma-check ang published directory sa ngayon; ipinapakita ang available na SK Duty roster.</p>'+officerChart([]):'<div class="trans-empty">Hindi ma-load ang directory o SK Duty roster. Subukan muli o makipag-ugnay sa <a href="./contacts.html">Contacts page</a>.</div>';
  leadersRetry.hidden=false;
 }finally{leadersDirectory.setAttribute('aria-busy','false')}
}
leadersRetry.onclick=loadYouthLeaders;
loadYouthLeaders();
