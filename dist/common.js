const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,options={}){let r;try{r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}})}catch{throw Error('Hindi makonekta ang server. Buksan gamit ang lokal na server o online website.')}let b;try{b=await r.json()}catch{throw Error('Hindi available ang account server. Patakbuhin ang node server.cjs.')}if(!r.ok)throw Error(b.error||'Hindi natuloy ang request.');return b;}
const dateText=v=>new Intl.DateTimeFormat('fil-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(v));
const roleText={youth:'Walang SK access',sk:'SK Officer',chairman:'SK Chairman'};

/* Unified, accessible, auto-dismissed feedback for SK and KK pages. */
(()=>{
 let timer=null;
 const styles=document.createElement('style');
 styles.textContent=`
 .vasra-app-toast{position:fixed;z-index:2147483000;top:82px;right:18px;box-sizing:border-box;
  width:min(370px,calc(100vw - 28px));padding:13px 40px 13px 16px;border-radius:12px;
  color:#173e69;background:#f0f7ff;border:1px solid #8fbee9;
  box-shadow:0 12px 38px rgba(12,34,69,.23);font:700 13px/1.5 Arial,sans-serif;
  overflow-wrap:anywhere}
 .vasra-app-toast[hidden]{display:none!important}
 .vasra-app-toast[data-kind="success"]{background:#eaf9f0;color:#155b3d;border-color:#84cda3}
 .vasra-app-toast[data-kind="error"]{background:#fff0f0;color:#902a36;border-color:#e5a4ad}
 .vasra-app-toast[data-kind="loading"]{background:#eef5ff;color:#24558b;border-color:#9ebde3}
 .vasra-app-toast-close{position:absolute;right:9px;top:8px;border:0;border-radius:8px;
  padding:3px 7px;font:700 18px Arial,sans-serif;cursor:pointer;background:transparent;color:inherit}
 html[data-theme="dark"] .vasra-app-toast{background:#173354;color:#e9f3ff;border-color:#5276a5}
 html[data-theme="dark"] .vasra-app-toast[data-kind="success"]{background:#153c34;color:#c9f7de;border-color:#36866c}
 html[data-theme="dark"] .vasra-app-toast[data-kind="error"]{background:#4b222d;color:#ffdde2;border-color:#a35762}
 .vasra-app-toast[data-kind="info"]{background:#ecf5ff;color:#20558c;border-color:#a8c8eb}
 .vasra-app-toast[data-kind="success"],.vasra-app-toast[data-kind="error"]{
  padding-left:42px
 }
 .vasra-app-toast[data-kind="success"]::before,.vasra-app-toast[data-kind="error"]::before{
  position:absolute;top:12px;left:14px;font:900 17px Arial,sans-serif
 }
 .vasra-app-toast[data-kind="success"]::before{content:"✓"}
 .vasra-app-toast[data-kind="error"]::before{content:"!"}
 html[data-theme="dark"] .vasra-app-toast[data-kind="info"]{
  background:#1d3c62;color:#dcecff;border-color:#5278a5
 }
 @media(max-width:600px){
  .vasra-app-toast{top:74px;right:12px;left:auto;width:min(350px,calc(100vw - 24px))}
 }
 `;
 document.head.append(styles);
 window.showVasraToast=(message,kind='success')=>{
  if(timer!==null){clearTimeout(timer);timer=null;}
  let node=document.getElementById('vasra-app-toast');
  if(!node){
   node=document.createElement('div');node.id='vasra-app-toast';node.className='vasra-app-toast';
   const label=document.createElement('span');label.className='vasra-app-toast-label';
   const close=document.createElement('button');close.type='button';close.className='vasra-app-toast-close';
   close.setAttribute('aria-label','Dismiss notification');close.textContent='×';
   close.addEventListener('click',()=>{if(timer!==null)clearTimeout(timer);timer=null;node.hidden=true;});
   node.append(label,close);document.body.append(node);
  }
  node.querySelector('.vasra-app-toast-label').textContent=String(message||'');
  node.dataset.kind=['success','error','loading','info'].includes(kind)?kind:'info';
  node.setAttribute('role',kind==='error'?'alert':'status');
  node.setAttribute('aria-live',kind==='error'?'assertive':'polite');
  node.hidden=!message;
  if(message&&kind!=='loading')timer=setTimeout(()=>{node.hidden=true;timer=null;},5000);
 };
 // Carry a one-time, non-sensitive success toast through KK login/registration redirects.
 window.queueVasraToast=(message,kind='success')=>{
  try{sessionStorage.setItem('vasra-kk-toast-once',JSON.stringify({
   message:String(message||''),kind:String(kind),at:Date.now()
  }));}catch{}
 };
 const restoreToast=()=>{
  try{
   const raw=sessionStorage.getItem('vasra-kk-toast-once');
   if(!raw)return;
   sessionStorage.removeItem('vasra-kk-toast-once');
   const data=JSON.parse(raw);
   if(data&&Date.now()-data.at<20000&&data.at<=Date.now()&&typeof data.message==='string'&&
      data.message.length<=220)window.showVasraToast(data.message,data.kind==='error'?'error':'success');
  }catch{}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',restoreToast,{once:true});
 else restoreToast();
})();
