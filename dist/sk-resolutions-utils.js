'use strict';
(()=>{
 const years=[2023,2024,2025,2026,2027];
 const clean=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[,\s]+/g,' ').trim();
 const dateVariants=value=>{
  const iso=String(value||'').slice(0,10);
  const m=iso.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if(!m)return '';
  const yyyy=Number(m[1]),mm=Number(m[2]),dd=Number(m[3]),date=new Date(Date.UTC(yyyy,mm-1,dd));
  if(date.getUTCFullYear()!==yyyy||date.getUTCMonth()+1!==mm||date.getUTCDate()!==dd)return '';
  const fmt=(month)=>new Intl.DateTimeFormat('en-US',{month,day:'numeric',year:'numeric',timeZone:'UTC'}).format(date);
  const long=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(date);
  const short=new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(date);
  const d=String(dd),zeroD=String(dd).padStart(2,'0'),month=String(mm),zeroM=String(mm).padStart(2,'0');
  return [iso,fmt('long'),fmt('short'),long+' '+d+' '+yyyy,short+' '+d+' '+yyyy,
   d+' '+long+' '+yyyy,d+' '+short+' '+yyyy,
   zeroM+'/'+zeroD+'/'+yyyy,month+'/'+d+'/'+yyyy,zeroD+'/'+zeroM+'/'+yyyy,
   yyyy+'/'+zeroM+'/'+zeroD,yyyy+'-'+zeroM+'-'+zeroD].join(' ');
 };
 const searchable=row=>clean([row.number,row.title,row.description,row.author,row.year,
  row.approved_on,dateVariants(row.approved_on)].join(' '));
 const matches=(row,query)=>{
  const terms=clean(query).split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const source=searchable(row);
  return terms.every(term=>source.includes(term));
 };
 const byNewest=(a,b)=>{
  const time=v=>Number.isFinite(Date.parse(v?.created_at))?Date.parse(v.created_at):
    (Number.isFinite(Date.parse(v?.updated_at))?Date.parse(v.updated_at):0);
  const diff=time(b)-time(a);
  return diff||String(b.id||'').localeCompare(String(a.id||''));
 };
 const yearLabel=year=>year==='all'?'All Years':String(year);
 const yearCounts=(rows)=>Object.fromEntries(['all',...years.map(String)].map(year=>
  [year,year==='all'?rows.length:rows.filter(r=>String(r.year)===year).length]));
 window.SKResolutionUtils=Object.freeze({years:Object.freeze(years),clean,dateVariants,
  searchable,matches,byNewest,yearLabel,yearCounts});
})();