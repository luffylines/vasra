'use strict';
(()=>{
 const $=q=>document.querySelector(q);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let rows=[];
 const paint=()=>{
  const needle=$('#skres-search').value.trim().toLocaleLowerCase(),year=$('#skres-year').value;
  const data=rows.filter(r=>(year==='all'||String(r.year)===year)&&
    (!needle||[r.number,r.title,r.description,r.year].some(s=>String(s??'').toLocaleLowerCase().includes(needle))));
  $('#skres-count').textContent=data.length+' published resolution'+(data.length===1?'':'s');
  $('#skres-public-list').innerHTML=data.length?data.map(r=>{
   const date=r.approved_on?new Date(r.approved_on+'T12:00:00Z').toLocaleDateString('en-PH',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'Official publication';
   return '<article class="skres-card"><div class="skres-card-meta"><span class="skres-card-number">'+esc(r.number)+'</span>'+
    '<time>'+esc(date)+'</time></div><h3>'+esc(r.title)+'</h3>'+
    '<p>'+esc(r.description||'Official SK Vasra resolution document.')+'</p>'+
    '<div class="skres-card-bottom"><span>Year '+esc(r.year)+'</span><a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer" '+
     'aria-label="Open '+esc(r.number)+' in Google Drive">Open Google Drive <span aria-hidden="true">↗</span></a></div></article>';
  }).join(''):'<div class="skres-empty">Wala pang published SK Resolution'+(needle||year!=='all'?' na tumutugma sa search.':'. Balikan kapag nakapag-publish na ang SK officers.')+'</div>';
 };
 const load=async()=>{
  $('#skres-status').textContent='Loading official SK Resolutions…';
  try{
   const response=await fetch('./api/sk-resolutions',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('Could not connect to SK Resolutions service.');
   const data=await response.json();
   if(data?.ok!==true||!Array.isArray(data.resolutions))throw Error('Invalid SK Resolutions response.');
   rows=data.resolutions;const active=$('#skres-year').value;
   const years=[...new Set(rows.map(r=>Number(r.year)).filter(Number.isInteger))].sort((a,b)=>b-a);
   $('#skres-year').innerHTML='<option value="all">Lahat ng taon</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
   if(years.some(y=>String(y)===active))$('#skres-year').value=active;
   $('#skres-status').textContent='Public documents · Published SK Resolutions only';
   paint();
  }catch(error){$('#skres-status').textContent='Hindi ma-load ang SK Resolutions. '+error.message;
   $('#skres-public-list').innerHTML='<div class="skres-empty">Pindutin ang Refresh upang subukang muli.</div>';}
 };
 $('#skres-search').addEventListener('input',paint);
 $('#skres-year').addEventListener('change',paint);
 $('#skres-refresh').addEventListener('click',load);
 load();
})();
