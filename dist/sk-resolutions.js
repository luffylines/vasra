'use strict';
(()=>{
 const $=q=>document.querySelector(q);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const utils=window.SKResolutionUtils;
 if(!utils)throw Error('Missing SK Resolution year/search utilities.');
 let rows=[],page=1,selectedYear='all';
 const tabs=$('#skres-public-year-tabs');
 const renderTabs=()=>{
  const counts=utils.yearCounts(rows);
  tabs.querySelectorAll('[data-skres-year]').forEach(btn=>{
   const value=btn.dataset.skresYear;
   btn.setAttribute('aria-pressed',String(value===selectedYear));
   const count=btn.querySelector('[data-year-count]');if(count)count.textContent=String(counts[value]||0);
  });
 };
 const chooseYear=(value)=>{
  if(!['all',...utils.years.map(String)].includes(String(value)))return;
  selectedYear=String(value);page=1;renderTabs();paint();
 };
 tabs.addEventListener('click',e=>{
  const btn=e.target.closest('button[data-skres-year]');
  if(btn&&tabs.contains(btn))chooseYear(btn.dataset.skresYear);
 });
 const pageSize=12;
 const paint=()=>{
  const needle=$('#skres-search').value.trim();
  const data=rows.filter(r=>(selectedYear==='all'||String(r.year)===selectedYear)&&utils.matches(r,needle));
  $('#skres-count').textContent=data.length+' published resolution'+(data.length===1?'':'s');
  const totalPages=Math.max(1,Math.ceil(data.length/pageSize));
  page=Math.max(1,Math.min(page,totalPages));
  const visible=data.slice((page-1)*pageSize,page*pageSize);
  $('#skres-public-page-count').textContent=data.length?
   ((page-1)*pageSize+1)+'–'+Math.min(page*pageSize,data.length)+' of '+data.length:
   'No published resolutions for these filters';
  $('#skres-public-prev').disabled=page<=1;
  $('#skres-public-next').disabled=page>=totalPages;
  $('#skres-public-list').innerHTML=visible.length?visible.map(r=>{
   const date=r.approved_on?new Date(r.approved_on+'T12:00:00Z').toLocaleDateString('en-PH',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'Official publication';
   return '<article class="skres-card"><div class="skres-card-meta"><span class="skres-card-number">'+esc(r.number)+'</span>'+
    '<time>'+esc(date)+'</time></div><h3>'+esc(r.title)+'</h3>'+
    (r.author?'<p class="skres-author">Authors: '+esc(r.author)+'</p>':'')+ (r.description?'<p>'+esc(r.description)+'</p>':'')+
    '<div class="skres-card-bottom"><span>Year '+esc(r.year)+'</span><a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer" '+
     'aria-label="Open '+esc(r.number)+' in Google Drive">Open Google Drive <span aria-hidden="true">↗</span></a></div></article>';
  }).join(''):'<div class="skres-empty">Wala pang published SK Resolution'+(needle||selectedYear!=='all'?' na tumutugma sa search at taon.':'. Balikan kapag nakapag-publish na ang SK officers.')+'</div>';
 };
 const load=async()=>{
  $('#skres-status').textContent='Loading official SK Resolutions…';
  try{
   const response=await fetch('./api/sk-resolutions',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('Could not connect to SK Resolutions service.');
   const data=await response.json();
   if(data?.ok!==true||!Array.isArray(data.resolutions))throw Error('Invalid SK Resolutions response.');
   rows=[...data.resolutions].sort(utils.byNewest);
   renderTabs();
   $('#skres-status').textContent='Public documents · Published SK Resolutions only';
   paint();
  }catch(error){$('#skres-status').textContent='Hindi ma-load ang SK Resolutions. '+error.message;
   $('#skres-public-list').innerHTML='<div class="skres-empty">Pindutin ang Refresh upang subukang muli.</div>';}
 };
 $('#skres-search').addEventListener('input',()=>{page=1;paint();});
 $('#skres-refresh').addEventListener('click',load);
 $('#skres-public-prev').addEventListener('click',()=>{if(page>1){page--;paint();}});
 $('#skres-public-next').addEventListener('click',()=>{page++;paint();});
 load();
})();
