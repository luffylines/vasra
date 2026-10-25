// Shared client-side navigation: consistent SVG icons, accessible mobile drawer.
// Keep the existing page routes and desktop sidebar behavior intact.
(() => {
 const routes=[
  {part:'./',key:'home',label:'Home',icon:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'},
  {part:'projects',key:'projects',icon:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'},
  {part:'duty',key:'duty',icon:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 16 2 2 4-4"/>'},
  {part:'youth-leaders',key:'leaders',icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'},
  {part:'achievements',key:'awards',icon:'<path d="M8 21h8m-4-4v4M7 4h10v6a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>'},
  {part:'contacts',key:'contacts',icon:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>'},
  {part:'transparency',key:'transparency',icon:'<path d="M3 3v18h18"/><path d="M7 16V9M12 16V5M17 16v-6"/>'},
  {part:'sk-resolutions',key:'resolutions',icon:'<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 12h8M8 16h8"/>'}
 ];
 const header=document.querySelector('header.site-header');
 const nav=header?.querySelector('nav[aria-label="Pangunahing navigation"]');
 if(!header||!nav)return;
 const icon=(path)=>'<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+path+'</svg>';
 const match=(href)=>{const target=new URL(href,location.href).pathname.toLowerCase();
  if(target.endsWith('/projects')||target.endsWith('/projects.html'))return 'projects';
  if(target.endsWith('/duty')||target.endsWith('/duty.html'))return 'duty';
  if(target.endsWith('/youth-leaders')||target.endsWith('/youth-leaders.html'))return 'leaders';
  if(target.endsWith('/achievements')||target.endsWith('/achievements.html'))return 'awards';
  if(target.endsWith('/contacts')||target.endsWith('/contacts.html'))return 'contacts';
  if(target.endsWith('/transparency')||target.endsWith('/transparency.html'))return 'transparency';
  if(target.endsWith('/sk-resolutions')||target.endsWith('/sk-resolutions.html'))return 'resolutions';
  if(target.endsWith('/index.html')||target.endsWith('/'))return 'home';
  return null;
 };
 // One authoritative active state, derived from the current public URL.
 // Corrects stale/mismatched markup and supports both .html and clean routes.
 const currentPage=match(location.pathname);
 for(const a of nav.querySelectorAll('a[href]')){
  const route=routes.find(item=>item.key===match(a.getAttribute('href')));
  a.querySelectorAll(':scope > i').forEach(dot=>dot.remove());
  if(route && route.key===currentPage)a.setAttribute('aria-current','page');
  else a.removeAttribute('aria-current');

  if(!route)continue;
  const old=a.querySelector(':scope > svg, :scope > span[aria-hidden="true"]');
  if(old)old.outerHTML=icon(route.icon);
  else a.insertAdjacentHTML('afterbegin',icon(route.icon));
 }
 const fbPath='<path d="M15 3h-2.5A4.5 4.5 0 0 0 8 7.5V10H5.5v4H8v7h4v-7h3l.6-4H12V7.7c0-.5.3-.7.8-.7H15V3z"/>';
 document.querySelectorAll('.sidebar-bottom a[href*="facebook.com"]').forEach(link=>{
  if(!link.querySelector('svg'))link.insertAdjacentHTML('afterbegin',icon(fbPath));
  link.classList.add('social-footer-link');
 });
 // KK navigation is derived from the verified server-side HttpOnly cookie.
 // Don't store a guessed logged-in flag in localStorage and never treat an API
 // outage as an expired session.
 if(!document.body.classList.contains('account-workspace')){
  const loginIcon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>';
  const logoutIcon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-5"/></svg>';
  const dashboardIcon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
  nav.insertAdjacentHTML('beforeend','<a class="kk-mobile-nav-link" href="./kk-login">'+loginIcon+'<span>KK Login / Register</span></a>');
  const locationTag=document.querySelector('.page-top .location-tag');
  let actions=null;
  if(locationTag){
   actions=document.createElement('div');actions.className='kk-page-actions';
   locationTag.before(actions);actions.append(locationTag);
   actions.insertAdjacentHTML('beforeend','<a class="kk-top-login" href="./kk-login" aria-label="KK Login and Registration">'+loginIcon+'<span>Login</span></a>');
  }
  const showAuthenticatedControls=profile=>{
   const target=profile?.status==='verified'?'./kk-dashboard':'./kk-profile';
   const mobileLink=nav.querySelector('.kk-mobile-nav-link');
   if(mobileLink){mobileLink.href=target;mobileLink.innerHTML=dashboardIcon+'<span>'+(profile?.status==='verified'?'My KK Dashboard':'My KK Profile')+'</span>';}
   if(actions){
    const login=actions.querySelector('.kk-top-login');
    if(login){
     const memberLink=document.createElement('a');
     memberLink.href=target;memberLink.className='kk-member-entry';
     memberLink.innerHTML=dashboardIcon+'<span>'+(profile?.status==='verified'?'My KK Dashboard':'My KK Profile')+'</span>';
     login.before(memberLink);
     const logout=document.createElement('button');
     logout.type='button';logout.className='kk-top-login kk-signout';
     logout.setAttribute('aria-label','Logout from KK account');
     logout.innerHTML=logoutIcon+'<span>Logout</span>';
     login.replaceWith(logout);
    }
   }
   const mobileSignout=document.createElement('a');
   mobileSignout.href='./';mobileSignout.className='kk-mobile-nav-link kk-mobile-signout';
   mobileSignout.innerHTML=logoutIcon+'<span>Logout KK Account</span>';
   mobileLink?.after(mobileSignout);
   // On phones the KK Logout icon is available without opening the drawer.
   const phoneLogout=document.createElement('button');
   phoneLogout.type='button';phoneLogout.className='kk-appbar-logout';
   phoneLogout.setAttribute('aria-label','Logout KK Account');phoneLogout.title='Logout KK Account';
   phoneLogout.innerHTML=logoutIcon;
   topbar.querySelector('.mobile-menu-toggle')?.before(phoneLogout);
   const signOut=async event=>{
    event.preventDefault();
    const pressed=event.currentTarget;
    if(pressed.dataset.pending==='yes')return;
    pressed.dataset.pending='yes';pressed.setAttribute('aria-disabled','true');
    try{
     const reply=await fetch('./api/kk/logout',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json','Accept':'application/json'},body:'{}',cache:'no-store'});
     if(!reply.ok)throw Error('Logout service unavailable');
     location.assign('./');
    }catch{
     pressed.removeAttribute('aria-disabled');pressed.dataset.pending='no';
     const note=document.createElement('p');note.className='kk-logout-error';note.setAttribute('role','alert');
     note.textContent='Hindi natuloy ang KK logout. Subukang muli.';
     (actions||nav).append(note);setTimeout(()=>note.remove(),6500);
    }
   };
   actions?.querySelector('.kk-signout')?.addEventListener('click',signOut);
   mobileSignout.addEventListener('click',signOut);
   phoneLogout.addEventListener('click',signOut);
  };
  fetch('./api/kk/me',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}})
   .then(r=>r.ok?r.json():null)
   .then(result=>{if(result?.member?.id)showAuthenticatedControls(result.profile||{});})
   .catch(()=>{/* Server offline: do not assume a session exists or sign the user out. */});
 }
 const topbar=document.createElement('div');
 topbar.className='mobile-appbar';
 topbar.innerHTML='<a class="mobile-brand" href="./" aria-label="SK Vasra homepage"><img src="./sk%20logo.jpg" alt=""><span>SK VASRA<small>Sangguniang Kabataan Vasra</small></span></a><button class="mobile-menu-toggle" type="button" aria-controls="vasra-sidebar" aria-expanded="false" aria-label="Buksan ang menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>';
 const close=document.createElement('button');
 close.className='sidebar-close';close.type='button';close.setAttribute('aria-label','Isara ang menu');
 close.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
 const overlay=document.createElement('button');
 overlay.className='sidebar-backdrop';overlay.type='button';overlay.setAttribute('aria-label','Isara ang navigation menu');
 overlay.setAttribute('tabindex','-1');
 header.id='vasra-sidebar';
 header.append(close);
 header.before(topbar);
 header.after(overlay);
 const toggle=topbar.querySelector('.mobile-menu-toggle');
 const mobile=window.matchMedia('(max-width:850px)');
 let isOpen=false;
 const sync=()=>{
  const active=isOpen&&mobile.matches;
  document.body.classList.toggle('menu-open',active);
  toggle.setAttribute('aria-expanded',String(active));
  toggle.setAttribute('aria-label',active?'Isara ang menu':'Buksan ang menu');
  if(mobile.matches){header.inert=!active;header.setAttribute('aria-hidden',String(!active));}
  else{header.inert=false;header.removeAttribute('aria-hidden');}
 };
 const setOpen=(value,restoreFocus=false)=>{
  isOpen=Boolean(value)&&mobile.matches;
  sync();
  if(isOpen)close.focus();
  else if(restoreFocus&&mobile.matches)toggle.focus();
 };
 toggle.addEventListener('click',()=>setOpen(!isOpen,true));
 close.addEventListener('click',()=>setOpen(false,true));
 overlay.addEventListener('click',()=>setOpen(false,true));
 header.querySelectorAll('nav a, #staff-nav button[data-tab]').forEach(a=>a.addEventListener('click',()=>setOpen(false)));
 document.addEventListener('keydown',event=>{
  if(!isOpen||!mobile.matches)return;
  if(event.key==='Escape'){event.preventDefault();setOpen(false,true);return;}
  if(event.key==='Tab'){
   const items=[...header.querySelectorAll('a[href],button:not([disabled])')].filter(el=>el.getClientRects().length);
   if(!items.length)return;
   const first=items[0],last=items[items.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 });
 mobile.addEventListener('change',()=>{isOpen=false;sync()});
 document.body.classList.add('mobile-menu-ready');
 sync();
})();
// Keep previously shared section links working as dedicated pages.
if((location.pathname.endsWith('/transparency')||location.pathname.endsWith('/transparency.html'))&&location.hash==='#officials')location.replace('./youth-leaders');
if(location.pathname.endsWith('/')||location.pathname.endsWith('/index.html')){if(location.hash==='#duty')location.replace('./duty.html');if(location.hash==='#contacts')location.replace('./contacts.html');if(location.hash==='#projects')location.replace('./projects.html');}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});


// Appearance controls for public pages, separate from the staff workspace.
if(!document.body.classList.contains('account-workspace')){
 const appearance=document.createElement('script');appearance.src='./theme.js';
 document.head.append(appearance);
}

/* Consistent Philippine Time at the page header on every public/staff page.
   Syncs against a lightweight server timestamp to avoid wrong device clocks;
   if server is offline the client clock is shown as a fallback. */
(() => {
 const tags=[...document.querySelectorAll('.page-top .location-tag')];
 if(!tags.length)return;
 const display=new Intl.DateTimeFormat('en-PH',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});
 let originTime=Date.now(),originTick=performance.now();
 for(const tag of tags){
   const label=document.createElement('span');
   label.className='ph-location-name';
   label.textContent=tag.textContent.trim();
   tag.replaceChildren(label);
   const clock=document.createElement('time');
   clock.className='ph-live-clock';
   clock.title='Philippine Standard Time (Asia/Manila)';
   clock.setAttribute('aria-label','Philippine Time');
   tag.append(clock);
 }
 const update=()=>{
   const now=new Date(originTime+performance.now()-originTick);
   const text=display.format(now);
   for(const clock of document.querySelectorAll('.page-top .ph-live-clock')){
     clock.textContent=text;
     clock.dateTime=now.toISOString();
   }
 };
 const sync=async()=>{
   try{
     const before=performance.now();
     const r=await fetch('./api/time',{cache:'no-store'});
     if(!r.ok)throw Error('Time service unavailable');
     const data=await r.json();
     const remote=Date.parse(data.now);
     if(!Number.isFinite(remote))throw Error('Invalid time');
     const after=performance.now();
     originTime=remote;
     originTick=(before+after)/2;
   }catch{
     // Graceful fallback: device clock, still formatted for Asia/Manila.
   }
   update();
 };
 update();
 sync();
 setInterval(update,10000);
 setInterval(sync,300000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
})();
