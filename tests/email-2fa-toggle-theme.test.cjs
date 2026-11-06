'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('dark settings input rules cannot paint over the email 2FA switch',()=>{
 const dashboard=read('dist/admin-dashboard.css');
 const css=read('dist/email-2fa-ui.css');
 assert.match(dashboard,/#panel-settings \.settings-card input\{[\s\S]*?opacity:1!important;/);
 const isolated=css.slice(css.indexOf('#vasra-mfa-settings-card #vasra-mfa-switch{'));
 assert.match(isolated,/appearance:none!important;/);
 assert.match(isolated,/opacity:0!important;/);
 assert.match(isolated,/background:transparent!important;/);
 assert.match(isolated,/border:0!important;/);
 assert.match(isolated,/min-height:0!important;/);
 assert.match(isolated,/width:100%!important;/);
});
test('switch remains a pill with a moving circular thumb in both themes',()=>{
 const css=read('dist/email-2fa-ui.css');
 assert.match(css,/#vasra-mfa-settings-card label\.vasra-mfa-switch-wrap\{/);
 assert.match(css,/#vasra-mfa-settings-card \.vasra-mfa-switch-wrap \.vasra-mfa-track\{/);
 assert.match(css,/border-radius:999px!important;/);
 assert.match(css,/transform:translateX\(21px\)/);
 assert.match(css,/body\.account-workspace\[data-theme="dark"\] #vasra-mfa-settings-card/);
 assert.match(css,/input:focus-visible \+ \.vasra-mfa-track/);
 assert.match(css,/input:disabled \+ \.vasra-mfa-track/);
});
test('staff and KK pages fetch corrected 2FA CSS',()=>{
 for(const page of ['dist/account.html','dist/kk-login.html','dist/kk-dashboard.html']){
  assert.match(read(page),/email-2fa-ui\.css\?v=20261103-dark-toggle-v3/);
 }
 const js=read('dist/email-2fa-ui.js');
 assert.match(js,/id="vasra-mfa-switch"/);
 assert.match(js,/role="switch"/);
});
