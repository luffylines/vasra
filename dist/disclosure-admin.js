'use strict';
// Public publication requires both an approved Google URL and explicit SK Chairman consent.
const disclosureCatalog=[
 ['cbydp','01','Comprehensive Barangay Youth Development Plan (CBYDP)','Three-year youth development plan'],
 ['abyip','02','Annual Barangay Youth Investment Program (ABYIP)','Annual youth investment and program priorities'],
 ['budget','03','SK Approved Annual Budget','Approved fiscal year budget documents'],
 ['rcb','04','Quarterly Register of Cash in Bank (RCB)','Quarterly bank balances and financial transactions'],
 ['purchase_requests','05','Monthly Itemized List of Purchase Requests','Purchase request forms and itemized listings']
];
const disclosureCheckUrl=value=>{
 if(!value)return true;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return false;
  return (url.hostname==='drive.google.com'&&(
   /^\/(drive\/folders|file\/d)\/[A-Za-z0-9_-]+/.test(url.pathname)||
   (url.pathname==='/open'&&/^[A-Za-z0-9_-]+$/.test(url.searchParams.get('id')||''))))
   ||(url.hostname==='docs.google.com'&&
    /^\/(document|spreadsheets|presentation|forms)\/d\/[A-Za-z0-9_-]+/.test(url.pathname));
 }catch{return false;}
};
const disclosureAdminMessage=(value,error=false)=>{
 const node=$('#fdp-admin-status');if(!node)return;
 node.textContent=value;node.classList.toggle('fdp-error',error);
};
async function loadDisclosureAdmin(){
 disclosureAdminMessage('Loading official links…');
 try{
  const data=await api('./api/disclosure/manage');
  if(!Array.isArray(data?.links))throw Error('Invalid disclosure response.');
  const rows=new Map(data.links.map(link=>[link.category,link]));
  const list=$('#fdp-admin-list');
  list.innerHTML=disclosureCatalog.map(([key,index,title,description])=>{
   const item=rows.get(key)||{};
   const url=String(item.url||'');
   const published=!!item.published;
   const yr=/^20\d{2}(?:-20\d{2})?$/.test(item.year||'')?item.year:'2026';
   return '<form class="fdp-admin-row" data-disclosure-key="'+key+'">'+
    '<div class="fdp-admin-row-head"><span class="fdp-admin-icon">'+index+'</span><div><h3>'+esc(title)+'</h3>'+
    '<p>'+esc(description)+'</p></div><span class="fdp-admin-state '+(published?'fdp-published':'')+'">'+
    (published?'Published':'Not published')+'</span></div>'+
    '<div class="fdp-admin-fields"><label>Document year<input type="text" name="year" required maxlength="16" pattern="20[0-9]{2}(-20[0-9]{2})?" value="'+esc(yr)+'" placeholder="2026 or 2026-2028"></label>'+
    '<label class="fdp-admin-link-label">Google Drive document / folder URL<input type="url" name="url" maxlength="1500" inputmode="url" placeholder="https://drive.google.com/drive/folders/..." value="'+esc(url)+'" autocomplete="off"></label></div>'+
    '<div class="fdp-admin-row-footer"><label class="fdp-admin-publish"><input type="checkbox" name="published"'+(published?' checked':'')+'><span>Show on public board</span></label>'+
    '<div class="fdp-admin-actions">'+(url?'<a class="secondary" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Preview Drive <svg class="ui-action-icon" data-direction="external" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9"/><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1 2-2V6a2 2 0 0 1 2-2h4"/></svg></a>':'')+
    '<button type="submit" class="primary">Save Disclosure Link</button></div></div></form>';
  }).join('');
  disclosureAdminMessage('5 categories · '+data.links.filter(link=>link.published&&link.url).length+' published Google Drive links.');
 }catch(error){disclosureAdminMessage('Hindi ma-load ang disclosure settings: '+error.message,true);}
}
$('#fdp-admin-list')?.addEventListener('submit',async event=>{
 const form=event.target.closest('[data-disclosure-key]');if(!form)return;
 event.preventDefault();
 if(!form.reportValidity())return;
 const value=Object.fromEntries(new FormData(form)),url=String(value.url||'').trim();
 if(!disclosureCheckUrl(url)){disclosureAdminMessage('Google Drive/Docs HTTPS link lamang ang puwedeng i-publish.',true);return;}
 const body={category:form.dataset.disclosureKey,year:String(value.year||'').trim(),
  url,published:form.elements.published.checked};
 if(body.published&&!url){disclosureAdminMessage('Maglagay muna ng Google Drive link bago i-publish.',true);return;}
 if(body.published&&!confirm('Publish '+body.category.toUpperCase()+' documents to the public Transparency page? Ensure Drive sharing is Viewer and the files have no sensitive personal data.'))return;
 const button=form.querySelector('button[type=submit]');button.disabled=true;
 disclosureAdminMessage('Saving '+body.category.toUpperCase()+' publication settings…');
 try{
  const result=await api('./api/disclosure/manage',{method:'POST',body:JSON.stringify(body)});
  if(result?.ok!==true)throw Error('The server did not confirm the document link.');
  success('Full Disclosure link saved'+(body.published?' and published.':'.'));
  await loadDisclosureAdmin();
 }catch(error){disclosureAdminMessage('Hindi na-save: '+error.message,true);button.disabled=false;}
});
window.loadDisclosureAdmin=loadDisclosureAdmin;
