/* Shared SK VASRA appearance: public pages and KK pages use the same
   remembered preference as the staff workspace. No KK auth state is stored. */
(()=>{
 if(document.body.classList.contains('account-workspace'))return;
 const key='vasra-staff-theme-v1';
 const root=document.documentElement;
 try{root.dataset.theme=localStorage.getItem(key)==='dark'?'dark':'light';}
 catch{root.dataset.theme='light';}
 if(!document.querySelector('link[data-vasra-theme]')){
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='./theme.css';link.dataset.vasraTheme='true';
  document.head.append(link);
 }
 const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
 const moon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>';
 const button=()=>{const b=document.createElement('button');b.type='button';b.className='vasra-theme-toggle';b.dataset.vasraThemeToggle='';b.innerHTML=icon+moon;return b};
 const paint=()=>{
  const dark=root.dataset.theme==='dark';
  for(const b of document.querySelectorAll('[data-vasra-theme-toggle]')){
   b.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
   b.setAttribute('title',dark?'Light mode':'Dark mode');
   b.setAttribute('aria-pressed',String(dark));
  }
 };
 const toggle=()=>{
  const next=root.dataset.theme==='dark'?'light':'dark';
  root.dataset.theme=next;
  try{localStorage.setItem(key,next)}catch{}
  paint();
 };
 // On public pages the control sits beside KK account actions on desktop
 // and next to the hamburger on smaller devices.
 if(document.body.classList.contains('portal-refresh')){
  const actions=document.querySelector('.kk-page-actions');
  if(actions)actions.prepend(button());
  const mobile=document.querySelector('.mobile-appbar .mobile-menu-toggle');
  if(mobile)mobile.before(button());
 }else if(document.body.classList.contains('kk-body')){
  // KK Dashboard provides its own toolbar control in its fixed app shell.
  if(!document.querySelector('[data-vasra-theme-toggle]')){
   const target=document.querySelector('.kk-reg-toolbar')||document.querySelector('.kk-auth-card');
   if(target){const b=button();target.append(b);if(target.classList.contains('kk-auth-card'))b.classList.add('kk-auth-theme-button');}
  }
 }
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-vasra-theme-toggle]');
  if(b){event.preventDefault();toggle();}
 });
 paint();
})();
