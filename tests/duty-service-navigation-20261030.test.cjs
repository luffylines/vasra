'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Public SK Duty three services have distinct KK login deep links',()=>{
 const duty=read('dist/duty.html');
 for(const slug of ['printing','computer','retabox']) {
   assert(duty.includes('href="./kk-login?service='+slug+'"'));
   assert.equal((duty.match(new RegExp('href="\\./kk-login\\?service='+slug+'"','g'))||[]).length,1);
 }
 assert.match(duty,/class="service-chips duty-service-links"/);
 assert.match(duty,/aria-label="KK services available at SK Vasra Office"/);
 assert.doesNotMatch(duty,/class="service-chips"><span>/);
});
test('KK login and verified member dashboard preserve the selected service',()=>{
 const login=read('dist/kk.js'),dashboard=read('dist/kk-dashboard.js');
 assert.match(login,/new URLSearchParams\(location\.search\)\.get\('service'\)/);
 assert.match(login,/\['printing','computer','retabox'\]/);
 assert.match(login,/vasra-kk-requested-service/);
 assert.match(login,/\.\/kk-dashboard'\+\(nextService\?'#'\+nextService:''\)/);
 assert.match(dashboard,/location\.hash\.slice\(1\)/);
 assert.match(dashboard,/vasra-kk-requested-service/);
});
test('Service links are visually clear in dark mode and accessible on mobile',()=>{
 const css=read('dist/duty-multi-schedule.css'),html=read('dist/duty.html');
 assert.match(css,/\.duty-service-links>a/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/html\[data-theme="dark"\] body\.portal-refresh \.duty-info \.duty-service-links>a/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(html,/duty-multi-schedule\.css\?v=20261030-kk-service-links-v3/);
});
