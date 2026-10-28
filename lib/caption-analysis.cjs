'use strict';
// Shared, evidence-oriented fallback for pasted SK captions. No external API.
// Groq can refine wording, but cannot invent project completion or progress.
const TOPICS=[
 ['Edukasyon',[
  [/balik[\s-]*eskwela|school[\s-]*suppl(?:y|ies)|school\s+kits?|scholarship|iskolar|educational\s+assistance|handog\s+sa\s+balik/i,9],
  [/mag[\s-]*aaral|estudyante|students?|school|paaralan|eskwela|edukasyon|education|pag[\s-]*aaral/i,3],
  [/road[\s-]*safety|traffic[\s-]*signs?|safe\s+riding|helmet\s+safety|kaligtasan\s+sa\s+kalsada/i,7],
  [/seminar|training|workshop|lecture|orientation|pagsasanay|talakayan/i,1]
 ]],
 ['Kalusugan',[
  [/dental\s+fluoride|fluoride\s+(?:program|service|treatment)|project\s+we\s+smile|pangangalaga\s+ng\s+(?:ngipin|kalusugan)|dental\s+health/i,14],
  [/medical\s+mission|health\s+(?:program|service|screening|awareness)|blood\s+donation|vaccin|mental\s+health|dental|feeding\s+program|nutrition|kalusugan/i,9],
  [/medical|health|clinic|check[\s-]*up|gamot|nutrisyon|wellness|fluoride|hygiene\s+kits|ngipin/i,4]
 ]],
 ['Kalikasan',[
  [/clean[\s-]*up\s+drive|tree[\s-]*plant|waste\s+management|environmental\s+program|recycl|kalikasan/i,9],
  [/paglilinis|linis|environment|basura|nagtanim/i,4]
 ]],
 ['Palakasan',[
  [/basketball|volleyball|sports?\s+(?:festival|league|program)|tournament|paligsahan|liga|palakasan/i,9],
  [/sports?|fitness|zumba|exercise|palaro/i,3]
 ]],
 ['Kabuhayan',[
  [/livelihood|kabuhayan|entrepreneur|job\s+fair|employment|negosyo|business\s+training/i,9],
  [/hanapbuhay|trabaho|income\s+generation/i,3]
 ]],
 ['Serbisyong Panlipunan',[
  [/relief\s+(?:goods|operations)|food\s+(?:packs|distribution)|donation\s+drive|gift[\s-]*giving|community\s+assistance|ayuda|social\s+services|outreach/i,9],
  [/pamamahagi\s+ng\s+(?:pagkain|relief)|namahagi\s+ng\s+(?:relief|pagkain)|nagbigay\s+ng\s+tulong|charity/i,6]
 ]],
 ['Kultura at Sining',[[/cultural\s+(?:festival|event)|heritage|arts?\s+(?:workshop|exhibit)|sining|kultura|buwan\s+ng\s+wika/i,9]]],
 ['Paghahanda sa Sakuna',[[/disaster\s+(?:preparedness|response|risk)|earthquake\s+drill|fire\s+drill|emergency\s+preparedness|sakuna|kalamidad|rescue\s+training/i,9]]],
 ['Pamamahala at Pakikilahok',[[/youth\s+(?:leadership|participation|consultation)|leadership\s+(?:training|summit)|good\s+governance|youth\s+assembly|paglahok\s+ng\s+kabataan/i,7]]]
];
const CATEGORY_NAMES=new Set(TOPICS.map(x=>x[0]));
function rankCategories(caption){
 const input=String(caption||'');
 const first=input.split('\n').find(x=>x.trim())||'';
 return TOPICS.map(([name,signals])=>{
  let score=0;
  for(const [pattern,weight] of signals){
   if(pattern.test(input))score+=weight;
   if(weight>=4&&pattern.test(first))score+=2;
  }
  return {name,score};
 }).sort((a,b)=>b.score-a.score);
}
function categoryForCaption(caption){
 const best=rankCategories(caption)[0];
 return best?.score?best.name:'Iba pang programa';
}
function readableSentences(text){
 return String(text||'').replace(/\s+/g,' ').match(/[^.!?]+[.!?]?/g)?.map(x=>x.trim()).filter(Boolean)||[];
}
function normalized(s){
 return String(s||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
function substantiallySame(a,b){
 const x=normalized(a),y=normalized(b);
 if(!x||!y)return false;
 if(x===y)return true;
 if((x.length>55&&y.includes(x))||(y.length>55&&x.includes(y)))return true;
 const aWords=new Set(x.split(' ').filter(w=>w.length>3)),bWords=new Set(y.split(' ').filter(w=>w.length>3));
 return [...aWords].filter(w=>bWords.has(w)).length/Math.max(1,Math.min(aWords.size,bWords.size))>.84;
}
const MISSING_DETAILS='Walang ibang espesipikong detalye sa caption. Idagdag ang lugar, benepisyaryo at aktibidad bago i-publish.';
function fallbackCopy(caption,title){
 const lines=String(caption||'').split('\n').map(x=>x.trim()).filter(x=>x&&!/^#\w+/.test(x));
 // Headline can contain event name/date but should not become the full summary.
 const body=lines.slice(1).join(' ').replace(/\s+/g,' ').trim();
 const sentences=readableSentences(body);
 const description=(sentences[0]||title).slice(0,340);
 const facts=sentences.slice(1,10).filter(x=>!substantiallySame(description,x));
 return {description,scope:facts.length?facts.map(s=>'- '+s).join('\n').slice(0,4500):MISSING_DETAILS};
}
function detectStatus(caption){
 let text=String(caption||'');
 text=text.replace(/\b(?:hindi|di|wala|not)\s+(?:pa\s+)?(?:na)?(?:naisagawa|isinagawa|naganap|natapos|naipamahagi|ginanap|completed|conducted)\b/gi,'hindi pa');
 // Count evidence of completed SK activities, not merely a date in the past.
 // "nagtapos ang programa" and "sinundan ito ng..." are common in reports.
 const finished=/\b(?:naganap|isinagawa|naisagawa|ginanap|natapos|naidaos|naipamahagi|ipinamahagi|naipamigay|namahagi|nagsagawa|nagdaos|idinaos|nagkaroon\s+ng\s+(?:programa|aktibidad)|nagtapos\s+ang\s+(?:programa|aktibidad|event)|nagtapos\s+sa\s+(?:pagbibigay|pamamahagi)|matagumpay\s+na\s+(?:naisagawa|isinagawa|naganap|natapos)|completed|was\s+(?:held|conducted|completed|distributed)|successfully\s+(?:held|conducted|finished|distributed)|tapos\s+na)\b/i;
 const active=/\b(?:kasalukuyang\s+(?:isinasagawa|ginagawa|nagsasagawa|ipinamamahagi|namamahagi|pinapamahagi)|patuloy\s+na\s+(?:isinasagawa|ginagawa|nagsasagawa|ipinamamahagi|namamahagi|pamamahagi|paglilinis|pagtatanim)|ongoing|in\s+progress|underway|isinasagawa|nagsasagawa|ginagawa\s+pa|ipinamamahagi|namamahagi|nagpapatuloy|tuloy[\s-]*tuloy)\b/i;
 const future=/\b(?:pinaplano|plano|planong|nakaplano|nakatakda|magsasagawa|gaganapin|isasagawa|ipamamahagi|magaganap|upcoming|scheduled|will\s+(?:hold|conduct|distribute|be\s+held)|inihahanda|para\s+sa\s+susunod\s+na\s+buwan)\b/i;
 // A negated completion statement cannot be reused as proof of a finished activity.
 const done=finished.test(text),doing=active.test(text),planned=future.test(text);
 const percent=text.match(/(?:\bprogress\b|\bprogreso\b|\bcompletion\b|\bnakumpleto\b|\bcompleted\b)\s*(?:ay|is|:|-)?\s*(\d{1,3})\s*%/i);
 const exact=percent&&Number(percent[1])<=100?Number(percent[1]):null;
 let status='Pinaplano',confidence='uncertain';
 if(doing)status='Isinasagawa',confidence='evidenced';
 else if(done)status='Natapos',confidence='evidenced';
 else if(planned)confidence='evidenced';
 if(exact===100&&!planned){status='Natapos';confidence='evidenced';}
 else if(exact>0&&exact<100&&status!=='Natapos'){status='Isinasagawa';confidence='evidenced';}
 const provisional=status==='Isinasagawa'&&!(exact>0&&exact<100);
 const progress=status==='Natapos'?100:status==='Pinaplano'?0:provisional?1:exact;
 const note=confidence==='uncertain'
  ?'Hindi matukoy mula sa caption kung natapos na ang project. Pinaplano / 0% ay pansamantalang default lamang; i-review at itama bago i-save.'
  :status==='Natapos'?'May indikasyon sa caption na isinagawa o natapos na ang project.'
  :status==='Pinaplano'?'Ang caption ay tumutukoy sa plano o naka-schedule na aktibidad.'
  :provisional?'Ongoing ang project. 1% ay pansamantalang UI placeholder lamang—palitan ng aktuwal na progress.'
  :'Ongoing ang project at may nakasaad na progress percentage.';
 return {status,progress,confidence,provisional,note};
}
function verifiedAiCategory(candidate,caption,baseCategory,quote){
 if(!CATEGORY_NAMES.has(candidate))return baseCategory;
 if(candidate===baseCategory)return candidate;
 const ranking=rankCategories(caption),best=ranking[0]?.score||0;
 const selected=ranking.find(x=>x.name===candidate)?.score||0;
 // AI can resolve ambiguity between equally supported categories, or provide a
 // verbatim excerpt for previously unknown wording. It cannot overwrite strong
 // caption evidence with an unrelated AI guess or an unsupported generic.
 const evidence=normalized(quote);
 const supportedQuote=evidence.length>=10&&normalized(caption).includes(evidence);
 if(selected>0&&selected>=Math.max(2,best-2))return candidate;
 if(baseCategory==='Iba pang programa'&&supportedQuote)return candidate;
 return baseCategory;
}
function verifiedAiStatus(data,caption,base){
 if(!data||!['Pinaplano','Isinasagawa','Natapos'].includes(data.status))return base;
 if(base.confidence==='evidenced')return base;
 const quote=normalized(data.status_evidence);
 if(quote.length<10||!normalized(caption).includes(quote))return base;
 const evidence=detectStatus(data.status_evidence);
 if(evidence.confidence!=='evidenced'||evidence.status!==data.status)return base;
 return evidence;
}
module.exports={categoryForCaption,rankCategories,fallbackCopy,detectStatus,verifiedAiCategory,verifiedAiStatus,substantiallySame,MISSING_DETAILS};
