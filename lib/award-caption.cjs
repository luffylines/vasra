'use strict';
// Conservative, award-specific evidence extraction. Never infer awarding dates from post dates.
// An SK achievement post may contain several DISTINCT recognitions.
// Keep every suggested fact directly anchored in the supplied caption.
const CATEGORIES=['Award','Recognition','Milestone'];
const normalize=s=>String(s||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();
const trim=(s,n)=>normalize(s).slice(0,n);
const strip=s=>normalize(s).replace(/^[\s🏆🏅🥇🥈🥉🎖️✨•\-*]+/u,'').replace(/\s+[🏆🏅🥇✨]+$/gu,'').replace(/[.!]+$/,'').trim();
function fromCaption(caption){
 if(typeof caption!=='string'||caption.trim().length<15||caption.length>12000)throw new Error('Kailangan ng Facebook caption (15–12,000 characters).');
 const lines=caption.split(/\n+/).map(strip).filter(Boolean);
 const recognitions=[];const seen=new Set();
 const relevant=/(?:outstanding|special citation|excellence|recognition|award(?:ed|s)?|parangal|pagkilala|nagwagi|winner|best\s+(?:council|project)|seal of good)/i;
 const named=/(?:outstanding\s+SK\s+(?:council|project)|special citation\s+for\s+HIV\/AIDS\s+awareness(?:\s+project)?|(?:\d{4}\s+)?Quezon City Seal of Good Youth Governance)/i;
 for(const line of lines){
   if(!relevant.test(line))continue;
  if(/^\\d{4}\\s+Quezon City Seal of Good Youth Governance/i.test(line))continue; // umbrella program, not a fourth award
   // A line prefixed by a trophy/bullet is a separate award only when it names
   // the recognition. Generic celebration and thank-you paragraphs are excluded.
   let candidate=line.replace(/^\d+\.\s*/,'').trim();
   if(!named.test(candidate)&&candidate.length>160)continue;
   candidate=candidate.replace(/^\s*(?:we received|received|nakamit|nagkamit|mga parangal\s*[:\-])\s*/i,'').trim();
   if(!/^(?:outstanding\b|special citation\b|best\s+(?:sk|youth|community|project)\b|excellence\s+award\b|recognition\s+for\b|award\s+for\b)/i.test(candidate))continue;
   const key=candidate.toLowerCase();
   if(!candidate||seen.has(key))continue;
   seen.add(key);recognitions.push(trim(candidate,180));
   if(recognitions.length>=12)break;
 }
 const contains=(v)=>caption.toLowerCase().includes(v.toLowerCase());
 const year=(caption.match(/\b(20\d{2})\s+(?:Quezon City Seal of Good Youth Governance|QC\s+SGYG)/i)||[])[1]||'';
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
