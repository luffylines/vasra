'use strict';
(async()=>{
 const list=document.querySelector('#home-awards-list');
 if(!list)return;
 try{
  const data=await api('./api/achievements');
  const awards=(Array.isArray(data.awards)?data.awards:[]).sort((a,b)=>String(b.award_date).localeCompare(String(a.award_date))).slice(0,3);
  list.innerHTML=awards.length?awards.map(a=>'<a class="home-award" href="./achievements.html">'+
   '<span class="home-award-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 21h8m-4-4v4M7 4h10v6a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/></svg></span>'+
   '<span><small>'+esc(a.category)+' · '+esc(a.award_date)+'</small><strong>'+esc(a.title)+'</strong><span>'+esc(a.issuer)+'</span></span></a>').join(''):
   '<p class="home-note">Wala pang na-publish na verified award. Magpapakita rito kapag naaprubahan ng SK Chairman.</p>';
 }catch{list.innerHTML='<p class="home-note">Ang award records ay hindi pa available; kailangan munang ma-activate ang Awards database.</p>'}
})();