'use strict';
// Conservative, award-specific evidence extraction. Never infer awarding dates from post dates.
// An SK achievement post may contain several DISTINCT recognitions.
// Keep every suggested fact directly anchored in the supplied caption.
// Normalize Facebook mathematical bold/italic Unicode and pasted Markdown emoji links.
const normalize=s=>String(s||'').normalize('NFKC').replace(/\r/g,'').replace(/\u200b/g,'').replace(/[ \t]+/g,' ').trim();
const trim=(s,n)=>normalize(s).slice(0,n);
const strip=s=>normalize(s).replace(/^\[([^\]]+)\]\(https?:\/\/[^\s)]*(?:\([^)]*\)[^)]*)?\)\s*/g,'$1 ').replace(/^[\s🏆🏅🥇🥈🥉🎖️✨•\-*]+/u,'').replace(/\s+[🏆🏅🥇✨]+$/gu,'').replace(/[.!]+$/,'').trim();
function fromCaption(caption){
 if(typeof caption!=='string'||caption.trim().length<15||caption.length>12000)throw new Error('Kailangan ng Facebook caption (15–12,000 characters).');
 const clean=normalize(caption).replace(/\[(?:🏆|🏅|🥇|🥈|🥉)\]\(https?:\/\/[^)]+\)/gu,'\n🏆 ');
 const lines=clean.split(/\n+/).map(strip).filter(Boolean);
 const recognitions=[];const seen=new Set();
 // Recognize award names even if FB paste removes line breaks, uses emoji,
 // or inserts a project name after a colon. Exclude umbrella program names.
 const patterns=[
  /Outstanding\s+SK\s+Council/gi,
  /Outstanding\s+SK\s+Project(?:\s*[:\-–]\s*[^\n🏆🏅🥇🥈]{3,110})?/gi,
  /Special\s+Citation\s+for\s+HIV\s*\/\s*AIDS\s+Awareness(?:\s+Project)?(?:\s*[:\-–]\s*[^\n🏆🏅🥇🥈]{3,110})?/gi
 ];
 for(const pattern of patterns){
  for(const m of clean.matchAll(pattern)){
   const candidate=trim(strip(m[0]).split(/\s+(?:Ang mga parangal|Maraming salamat|Kabataang VASRA|#SKVasra)\b/i)[0],180);
   if(!candidate||seen.has(candidate.toLowerCase()))continue;
   seen.add(candidate.toLowerCase());recognitions.push(candidate);
  }
 }
 // Include other explicitly titled recognitions without treating generic
 // paragraphs or the year of the SGYG program as award titles.
 for(const line of lines){
  if(!/^(?:outstanding|special citation|best\s+(?:SK|youth|community|project)|excellence award|recognition for|award for)\b/i.test(line))continue;
  if(recognitions.some(r=>line.toLowerCase().startsWith(r.toLowerCase())))continue;
  const candidate=trim(line,180);
  if(!seen.has(candidate.toLowerCase())){seen.add(candidate.toLowerCase());recognitions.push(candidate);}
 }
 recognitions.splice(12);
 const contains=(v)=>caption.toLowerCase().includes(v.toLowerCase());
 const year=(clean.match(/\b(20\d{2})\s+(?:Quezon City Seal of Good Youth Governance|QC\s+SGYG)/i)||[])[1]||'';
 const title=recognitions.find(t=>/outstanding\s+SK\s+council/i.test(t))||recognitions[0]||'';
 // Program title is not evidence of the exact granting organization.
 const issuer='';
 const awardDate='';
 const summary=recognitions.length>1?
  'SK VASRA received '+recognitions.length+' recognitions'+(year?' under the '+year+' Quezon City Seal of Good Youth Governance':'')+'.':
  (title?'Recognition mentioned in the Facebook caption.':'');
 const evidence=recognitions.map((name,i)=>({name,evidence:lines.find(line=>line.toLowerCase().includes(name.toLowerCase()))||name}));
 return {ok:true,analysis_type:'achievements',draft:{
  title:trim(title,180),category:'Award',issuer,award_date:awardDate,
  summary:trim(summary,350),
  description:trim(recognitions.map(x=>'• '+x).join('\n')+(year?'\nProgram year: '+year+' (not the actual award date)':''),2500),
  recognitions,evidence,
  date_requires_confirmation:true,issuer_requires_confirmation:true,
  warnings:[
   ...(recognitions.length>1?['May magkakaibang parangal sa post. Piliin kung isang combined record o magkakahiwalay na awards ang gagawin.']:[]),
   'Hindi ginamit ang Facebook post date bilang award date.',
   'I-verify ang awarding institution at exact date bago i-save.'
  ]
 }};
}
module.exports={fromCaption};
