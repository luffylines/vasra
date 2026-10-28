'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..','dist',p),'utf8');
const pages=['kk-dashboard.html','kk-login.html','kk-register.html','kk-profile.html'];
const theme=read('theme.css'),dashboard=read('kk-dashboard.html');

test('KK dashboard keeps sidebar logo but removes duplicate content toolbar brand',()=>{
 assert.match(dashboard,/class="kk-sidebar-brand"/);
 assert.match(dashboard,/class="kk-workspace-topbar" aria-label="KK account controls"/);
 assert.match(dashboard,/id="kk-menu-toggle"/);
 assert.match(dashboard,/class="kk-workspace-tools"/);
 assert.doesNotMatch(dashboard,/class="kk-workspace-brand"/);
});

test('Latest dark stylesheet loads on every KK page, not only after toggling',()=>{
 for(const page of pages){
  const html=read(page);
  assert.match(html,/href="\.\/theme\.css\?v=20261026-kk-mobile-profile-v8" data-vasra-theme="true"/,page);
  assert.match(html,/src="\.\/theme\.js\?v=/,page);
 }
});

test('Dark mode has separate shell, main cards, nested cards, inputs and member ID states',()=>{
 for(const value of ['--kk-shell:#0c172a','--kk-panel:#182d49','--kk-inner:#243f60','--kk-input:#11263f'])
  assert.ok(theme.includes(value),value);
 for(const selector of ['.kk-dashboard-panel','.kk-auth-layout','.kk-registration','.kk-profile-sheet',
  '.kk-activity-card','.kk-settings-card','.kk-service-form','.kk-service-history-row',
  '.kk-id-reference-card','.kk-id-upload-card','.kk-id-approved-details','.kk-overview-card',
  '.kk-auth-story','.kk-workspace-footer'])
  assert.ok(theme.includes(selector),selector);
 assert.match(theme,/html\[data-theme="dark"\] body\.kk-body/);
 assert.match(theme,/\.kk-auth-layout\{/);
 assert.match(theme,/\.kk-sidebar-bottom>a/);
});
