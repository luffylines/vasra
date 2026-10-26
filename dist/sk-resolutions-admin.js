'use strict';
(()=>{
 const $=q=>document.querySelector(q);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const form=$('#skres-admin-form');
 if(!form)return;
 let saved=[],busy=false,page=1,preview=[],importRunning=false;
 const pageSize=12;
 const msg=(text,error=false)=>{
  $('#skres-admin-message').textContent='';
  if(text)window.showVasraToast?.(text,error?'error':'success');
 };
 const allowedUrl=value=>{
  try{
   const u=new URL(value);
   return u.protocol==='https:'&&!u.username&&!u.password&&(
    (u.hostname==='drive.google.com'&&(
     /^\/(file\/d|drive\/folders)\/[A-Za-z0-9_-]+/.test(u.pathname)||
     (u.pathname==='/open'&&/^[A-Za-z0-9_-]+$/.test(u.searchParams.get('id')||''))))||
    (u.hostname==='docs.google.com'&&/^\/(document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]+/.test(u.pathname))
   );
  }catch{return false;}
 };
 const filterRecords=()=>{
  const term=$('#skres-admin-search').value.trim().toLocaleLowerCase(),
    year=$('#skres-admin-year').value,status=$('#skres-admin-status').value;
  return saved.filter(r=>(year==='all'||String(r.year)===year)&&
   (status==='all'||(status==='published'===!!r.published))&&
   (!term||[r.number,r.title,r.description,r.author,r.year,r.approved_on].some(x=>
     String(x??'').toLocaleLowerCase().includes(term))));
 };
 const dateDisplay=iso=>{
  if(!iso)return 'Date not set';
  const s=String(iso).slice(0,10);
  const d=new Date(s+'T12:00:00Z');
  return Number.isNaN(d.getTime())?s:d.toLocaleDateString('en-PH',{timeZone:'UTC',
   day:'2-digit',month:'short',year:'numeric'});
 };
 const list=()=>{
  const matching=filterRecords(),pages=Math.max(1,Math.ceil(matching.length/pageSize));
  page=Math.min(page,pages);
  const display=matching.slice((page-1)*pageSize,page*pageSize);
  $('#skres-list-count').textContent=matching.length+' matching · '+saved.length+' total · '+
   saved.filter(r=>r.published).length+' published';
  $('#skres-page-status').textContent=matching.length?
    ((page-1)*pageSize+1)+'–'+Math.min(page*pageSize,matching.length)+' of '+matching.length:
    'No matching resolutions';
  $('#skres-prev-page').disabled=page<=1;
  $('#skres-next-page').disabled=page>=pages;
  $('#skres-admin-list').innerHTML=display.length?display.map(r=>
   '<article class="skres-admin-row"><div class="skres-admin-row-head">'+
     '<div class="skres-row-identity"><strong>'+esc(r.number)+'</strong><span>'+esc(r.year)+'</span></div>'+
     '<span class="skres-pub-badge'+(r.published?' active':'')+'">'+(r.published?'Published':'Draft')+'</span></div>'+
    '<h4>'+esc(r.title)+'</h4>'+
    (r.author?'<p class="skres-row-author">'+esc(r.author)+'</p>':'')+
    '<div class="skres-admin-row-footer"><small>'+esc(dateDisplay(r.approved_on))+'</small>'+
     '<div><button type="button" data-skres-edit="'+esc(r.id)+'">Edit</button>'+
     (r.published?'<button type="button" data-skres-unpublish="'+esc(r.id)+'">Unpublish</button>':'')+
     '<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">View Drive <span aria-hidden="true">↗</span></a></div></div></article>'
  ).join(''):'<p class="skres-admin-empty">Walang resolution na tumutugma sa kasalukuyang search at filters.</p>';
 };
 const defaultYear=()=>String(Math.min(2027,Math.max(2023,Number(new Intl.DateTimeFormat('en-US',
  {year:'numeric',timeZone:'Asia/Manila'}).format(new Date())))));
 const reset=()=>{
  form.reset();form.elements.id.value='';form.elements.year.value=defaultYear();
  $('#skres-editor-heading').textContent='Add SK Resolution';
  $('#skres-admin-save').textContent='Save Resolution';
 };
 const load=async()=>{
  try{
   const data=await api('./api/sk-resolutions/manage');
   if(data?.ok!==true||!Array.isArray(data.resolutions))throw Error('Invalid service response');
   saved=data.resolutions;
   list();
  }catch(e){msg('Hindi ma-load ang SK Resolutions: '+e.message,true);}
 };
 const save=async row=>{
  const res=await api('./api/sk-resolutions/manage',{method:'POST',body:JSON.stringify(row)});
  if(res?.ok!==true)throw Error('Server did not confirm the saved resolution.');
  return res;
 };
 const locked=active=>{
  busy=active;$('#skres-admin-save').disabled=active;$('#skres-admin-reset').disabled=active;
 };
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(busy||!form.reportValidity())return;
  const d=Object.fromEntries(new FormData(form));
  const params={id:d.id||null,number:d.number.trim(),title:d.title.trim(),author:d.author.trim(),
   year:Number(d.year),approved_on:d.approved_on,description:d.description.trim(),
   url:d.url.trim(),published:form.elements.published.checked};
  if(!allowedUrl(params.url)){msg('Use an official Google Drive or Docs HTTPS link.',true);return;}
  if(params.approved_on&&Number(params.approved_on.slice(0,4))!==params.year){
   msg('Date approved must match the selected resolution year.',true);return;
  }
  if(params.published&&!confirm('Publish this official SK Resolution publicly? Confirm that the Google Drive file is safe for public viewing.'))return;
  locked(true);
  try{
   await save(params);reset();page=1;await load();
   msg(params.published?'SK Resolution saved and published.':'SK Resolution saved as draft.');
  }catch(error){msg('Hindi na-save: '+error.message,true);}
  finally{locked(false);}
 });
 $('#skres-admin-reset').addEventListener('click',e=>{e.preventDefault();reset();});
 const filters=['skres-admin-search','skres-admin-year','skres-admin-status'];
 for(const id of filters)$('#'+id).addEventListener(id==='skres-admin-search'?'input':'change',()=>{page=1;list();});
 $('#skres-prev-page').addEventListener('click',()=>{if(page>1){page--;list();}});
 $('#skres-next-page').addEventListener('click',()=>{page++;list();});
 $('#skres-admin-refresh').addEventListener('click',load);
 $('#skres-admin-list').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-skres-edit]'),unpub=e.target.closest('[data-skres-unpublish]');
  const record=saved.find(r=>r.id===(edit?.dataset.skresEdit||unpub?.dataset.skresUnpublish));
  if(!record||busy)return;
  if(unpub){
   if(!confirm('Unpublish '+record.number+'? The record and Drive file will remain intact.'))return;
   unpub.disabled=true;locked(true);
   try{await save({...record,published:false});await load();msg('Resolution unpublished.');}
   catch(error){msg(error.message,true);}finally{locked(false);unpub.disabled=false;}
   return;
  }
  for(const key of ['id','number','title','year','author','description','url','approved_on']){
   const v=record[key];form.elements[key].value=key==='approved_on'?String(v||'').slice(0,10):String(v??'');
  }
  form.elements.published.checked=!!record.published;
  $('#skres-editor-heading').textContent='Edit SK Resolution';
  $('#skres-admin-save').textContent='Save Changes';
  form.scrollIntoView({behavior:'smooth',block:'start'});form.elements.title.focus();
 });
 // Spreadsheet copy uses tabs, quoted embedded lines, and headers.
 const parseTSV=text=>{
  const lines=[];let row=[],cell='',quoted=false;
  const src=String(text||'').replace(/^\uFEFF/,'');
  for(let i=0;i<src.length;i++){
   const ch=src[i];
   if(ch==='"'){
    if(quoted&&src[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
   }else if(ch==='\t'&&!quoted){row.push(cell.trim());cell='';}
   else if((ch==='\n'||ch==='\r')&&!quoted){
    if(ch==='\r'&&src[i+1]==='\n')i++;
    row.push(cell.trim());if(row.some(Boolean))lines.push(row);
    row=[];cell='';
   }else cell+=ch;
  }
  if(quoted)throw Error('Unclosed quote in pasted spreadsheet rows.');
  row.push(cell.trim());if(row.some(Boolean))lines.push(row);
  return lines;
 };
 const monthMap={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,
  september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,
  aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
 const isoDate=(text,year)=>{
  const value=String(text||'').trim();
  if(!value)return '';
  let y,m,d,match;
  if(match=value.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/)){[,y,m,d]=match;}
  else if(match=value.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/)){[,m,d,y]=match;}
  else if(match=value.match(/^([a-z]+)\s+(\d{1,2}),?\s+(20\d{2})$/i)){
   m=monthMap[match[1].toLowerCase()];d=match[2];y=match[3];
  }else throw Error('Date should be January 3, 2026, 01/03/2026 or 2026-01-03.');
  const n=Number(y),mm=Number(m),dd=Number(d);
  const dt=new Date(Date.UTC(n,mm-1,dd));
  if(!m||!Number.isFinite(dt.getTime())||dt.getUTCFullYear()!==n||
   dt.getUTCMonth()+1!==mm||dt.getUTCDate()!==dd||n!==year)
   throw Error('Invalid date or date does not match the selected sheet year.');
  return String(n)+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
 };
 const bulk=$('#skres-import-panel'),textarea=$('#skres-import-paste'),result=$('#skres-import-preview-results'),
 submit=$('#skres-import-submit'),year=$('#skres-import-year');
 const showBulk=open=>{bulk.hidden=!open;$('#skres-import-toggle').setAttribute('aria-expanded',String(open));};
 $('#skres-import-toggle').addEventListener('click',()=>showBulk(bulk.hidden));
 const previewRows=()=>{
  preview=[];
  const rows=parseTSV(textarea.value);const chosen=Number(year.value),invalid=[],seen=new Set();
  for(let i=0;i<rows.length;i++){
   const cells=rows[i];
   const no=String(cells[0]||'').trim(),title=String(cells[1]||'').trim();
   if(!no||/^(no|number|resolution\s*no)[.:]?$/i.test(no))continue;
   try{
    if(cells.length<4)throw Error('Missing number, title, approval date or Drive link.');
    const author=String(cells[2]||'').trim();
    const urlIndex=cells.findIndex((v,j)=>j>=3&&/^https:\/\//i.test(v));
    if(urlIndex<0)throw Error('Missing official Google Drive / Docs link.');
    const url=cells[urlIndex];
    let approved='';
    for(let j=urlIndex-1;j>=3;j--)if(cells[j]){approved=cells[j];break;}
    approved=isoDate(approved,chosen);
    if(no.length<2||no.length>80||title.length<3||title.length>180||author.length>600||!allowedUrl(url))
     throw Error('Check resolution number, title (max 180), authors, and official Drive URL.');
    const key=chosen+'|'+no.toLocaleLowerCase()+'|'+title.toLocaleLowerCase();
    if(seen.has(key))throw Error('Duplicate entry within pasted rows.');
    seen.add(key);
    preview.push({number:no,title,author,approved_on:approved,year:chosen,url,description:'',published:false});
   }catch(e){invalid.push({row:i+1,message:e.message});}
  }
  submit.disabled=!preview.length;
  const reusedLinks=new Map();
  for(const item of preview){
   const key=item.url.split('?')[0].toLocaleLowerCase();
   const list=reusedLinks.get(key)||new Set();
   list.add(item.title.toLocaleLowerCase());reusedLinks.set(key,list);
  }
  const sharedDocs=[...reusedLinks.values()].filter(titles=>titles.size>1).length;
  const short=preview.slice(0,5).map(x=>'<li>'+esc(x.number)+' · '+esc(x.title)+'</li>').join('');
  result.innerHTML='<p><strong>'+preview.length+' valid</strong> · '+invalid.length+' need correction · '+
   rows.length+' pasted row(s). All imported as drafts.</p>'+
   (short?'<ul>'+short+'</ul>':'')+
   (invalid.length?'<p class="skres-import-errors">'+invalid.slice(0,12).map(e=>'Row '+e.row+': '+esc(e.message)).join('; ')+'</p>':'')+
   (sharedDocs?'<p class="skres-import-errors"><strong>Drive link warning:</strong> '+sharedDocs+
    ' link(s) are reused across different titles. Check each document before publishing.</p>':'');
  return preview;
 };
 $('#skres-import-preview').addEventListener('click',()=>{
  try{previewRows();}catch(e){preview=[];submit.disabled=true;result.textContent=e.message;msg(e.message,true);}
 });
 const invalidate=()=>{preview=[];submit.disabled=true;result.textContent='Preview rows after each change before importing.';};
 textarea.addEventListener('input',invalidate);year.addEventListener('change',invalidate);
 submit.addEventListener('click',async()=>{
  if(importRunning||busy||!preview.length)return;
  if(!confirm('Import '+preview.length+' verified-looking spreadsheet row(s) as UNPUBLISHED drafts? Review individual Google Drive links before publishing.'))return;
  importRunning=true;submit.disabled=true;
  const rows=[...preview];let total=0,duplicates=0,failed=0,errors=[];
  try{
   for(let i=0;i<rows.length;i+=150){
    const batch=rows.slice(i,i+150);
    result.textContent='Importing '+(i+1)+'–'+(i+batch.length)+' of '+rows.length+'…';
    const response=await api('./api/sk-resolutions/import',{method:'POST',body:JSON.stringify({rows:batch})});
    total+=Number(response.saved||0);duplicates+=Number(response.duplicates||0);
    failed+=Number(response.failed||0);
    for(const err of (response.errors||[]))errors.push('Row '+(i+Number(err.row))+': '+(err.reason||'invalid'));
   }
   preview=[];textarea.value='';await load();page=1;list();
   result.textContent=total+' imported as drafts · '+duplicates+' exact duplicates skipped · '+failed+' failed.'+
    (errors.length?' Check: '+errors.slice(0,10).join('; '):'');
   msg(total+' SK Resolutions imported as drafts. '+duplicates+' duplicates skipped.');
  }catch(e){result.textContent='Import stopped: '+e.message+' · '+total+' saved before the error. Re-preview remaining rows before retrying.';msg(e.message,true);}
  finally{importRunning=false;submit.disabled=true;}
 });
 reset();window.loadSKResolutionsAdmin=load;
})();