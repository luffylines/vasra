'use strict';
// Only explicitly published Drive/Docs links become navigable public cards.
const disclosureCategories=['cbydp','abyip','budget','rcb','purchase_requests'];
const googleDisclosureUrl=value=>{
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return null;
  if(url.hostname==='drive.google.com'&&(
   /^\/(drive\/folders|file\/d)\/[A-Za-z0-9_-]+/.test(url.pathname)||
   (url.pathname==='/open'&&/^[A-Za-z0-9_-]+$/.test(url.searchParams.get('id')||''))))
   return url.href;
  if(url.hostname==='docs.google.com'&&
    /^\/(document|spreadsheets|presentation|forms)\/d\/[A-Za-z0-9_-]+/.test(url.pathname))return url.href;
  return null;
 }catch{return null;}
};
async function loadDisclosureBoard(){
 const status=$('#sk-fdp-status');
 try{
  const data=await api('./api/disclosure');
  const published=Array.isArray(data?.links)?data.links:[];
  let count=0;
  for(const entry of published){
   if(!disclosureCategories.includes(entry?.category))continue;
   const link=googleDisclosureUrl(entry.url);
   if(!link)continue;
   const card=document.querySelector('.sk-fdp-card[data-disclosure-category="'+entry.category+'"]');
   if(!card || card.tagName.toLowerCase()==='a')continue;
   const anchor=document.createElement('a');
   anchor.className=card.className+' sk-fdp-card-live';
   anchor.dataset.disclosureCategory=entry.category;
   anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';
   anchor.setAttribute('aria-label','Open published '+card.querySelector('h3').textContent+' documents in Google Drive');
   anchor.innerHTML=card.innerHTML;
   const yr=anchor.querySelector('[data-disclosure-year]');
   if(yr && /^20\d{2}(?:-20\d{2})?$/.test(String(entry.year||'')))yr.textContent=entry.year;
   const action=anchor.querySelector('[data-disclosure-state]');
   if(action)action.textContent='View Google Drive documents';
   card.replaceWith(anchor);count++;
  }
  status.textContent=count
   ?count+' of 5 disclosure categories have published Google Drive documents. Other categories are awaiting approved public links.'
   :'Ang mga dokumento ay magiging available kapag na-publish ng SK staff ang opisyal na Google Drive links.';
 }catch{
  status.textContent='Hindi ma-check ang published document links sa ngayon. I-refresh ang page mamaya.';
 }
}
loadDisclosureBoard();
