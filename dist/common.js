const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,options={}){let r;try{r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}})}catch{throw Error('Hindi makonekta ang server. Buksan gamit ang lokal na server o online website.')}let b;try{b=await r.json()}catch{throw Error('Hindi available ang account server. Patakbuhin ang node server.cjs.')}if(!r.ok)throw Error(b.error||'Hindi natuloy ang request.');return b;}
const dateText=v=>new Intl.DateTimeFormat('fil-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(v));
const roleText={youth:'Walang SK access',sk:'SK Officer',chairman:'SK Chairman'};
