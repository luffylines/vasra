// Keep previously shared section links working as dedicated pages.
if(location.pathname.endsWith('/')||location.pathname.endsWith('/index.html')){if(location.hash==='#duty')location.replace('./duty.html');if(location.hash==='#contacts')location.replace('./contacts.html');}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
