'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const nav=read('dist/shell.js'),kk=read('dist/kk.js'),dashboard=read('dist/kk-dashboard.js');
const html=read('dist/kk-dashboard.html'),theme=read('dist/theme.js'),themeCss=read('dist/theme.css'),dashCss=read('dist/kk-dashboard.css');

test('Public navigation uses server-verified KK cookie without localStorage auth flags',()=>{
 assert.match(nav,/fetch\('\.\/api\/kk\/me',\{credentials:'same-origin',cache:'no-store'/);
 assert.match(nav,/result\?\.member\?\.id/);
 assert.match(nav,/profile\?\.status==='verified'\?'\.\/kk-dashboard':'\.\/kk-profile'/);
 assert.match(nav,/className='kk-top-login kk-signout'/);
 assert.match(nav,/href='\.\/'/);
 assert.match(nav,/fetch\('\.\/api\/kk\/logout'/);
 assert.match(nav,/if\(!reply\.ok\)throw/);
 assert.doesNotMatch(nav,/localStorage\.setItem\([^)]*(?:session|member|token)/);
});
test('KK login resumes session and verified account redirects to real member dashboard',()=>{
 assert.match(kk,/if\(active\?\.member\?\.id\)location\.replace/);
 assert.match(kk,/active\.profile\?\.status==='verified'\?'\.\/kk-dashboard':'\.\/kk-profile'/);
 assert.match(kk,/getApi\('me'\)/);
 assert.match(dashboard,/if\(data\.profile\?\.status!=='verified'\)/);
 assert.match(dashboard,/location\.replace\('\.\/kk-profile'\)/);
});
test('Member workspace keeps distinctive sidebar, icons, profile and project functionality',()=>{
 for(const part of ['overview','projects','activities','rewards','settings'])assert.ok(html.includes('data-tab="'+part+'"'));
 for(const id of ['kk-sidebar','kk-menu-toggle','kk-dashboard-settings','kk-dashboard-logout',
  'kk-sidebar-logout','kk-dash-id','kk-upcoming-projects','kk-joined-list','kk-reward-list',
  'kk-dash-password','kk-dash-email'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(dashboard,/renderProjects\(\);renderRewards\(\)/);
 assert.match(dashboard,/data-join/);
 assert.match(dashboard,/request\('redeem'/);
 assert.match(dashboard,/request\('settings\/password'/);
 assert.match(dashboard,/request\('settings\/email\/request'/);
 assert.match(dashboard,/aria-expanded/);
 assert.match(dashboard,/Escape/);
});
test('Shared dark mode is persistent and does not modify staff theme',()=>{
 assert.match(theme,/vasra-staff-theme-v1/);
 assert.match(theme,/localStorage\.setItem\(key,next\)/);
 assert.match(theme,/classList\.contains\('account-workspace'\)/);
 assert.match(themeCss,/html\[data-theme="dark"\] body\.kk-body/);
 assert.match(themeCss,/html\[data-theme="dark"\] body\.portal-refresh/);
 assert.match(themeCss,/\.kk-form input/);
 assert.match(dashCss,/@media\(max-width:900px\)/);
 for(const file of ['dist/kk-profile.html','dist/kk-register.html','dist/kk-login.html','dist/kk-dashboard.html'])
  assert.match(read(file),/script src="\.\/theme\.js(?:\?v=[a-zA-Z0-9-]+)?"/,file);
 for(const file of ['dist/shell.js','dist/kk.js','dist/theme.js','dist/kk-dashboard.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
test('PWA caches new theme assets without caching private KK API payloads',()=>{
 const sw=read('dist/sw.js');
 assert.match(sw,/'\.\/theme\.js','\.\/theme\.css'/);
 assert.match(sw,/u\.pathname\.startsWith\('\/api\/'\)/);
});
