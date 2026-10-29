'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('dist/staff-sidebar.css'),html=read('dist/account.html');
test('Authenticated SK staff have viewport-bounded, independently scrollable navigation',()=>{
 assert.match(css,/\[data-staff-mode="staff"\] \.site-header\{/);
 assert.match(css,/height:100dvh/);
 assert.match(css,/#staff-nav\{[\s\S]*?flex:1 1 0%/);
 assert.match(css,/#staff-nav\{[\s\S]*?min-height:0/);
 assert.match(css,/#staff-nav\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/scrollbar-width:thin/);
 assert.match(css,/#staff-sidebar-footer:not\(\[hidden\]\)/);
});
test('Mobile drawer scrolls as one container and preserves safe-area access to bottom buttons',()=>{
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/\.site-header\{[\s\S]*?overflow-y:auto;overflow-x:hidden/);
 assert.match(css,/#staff-nav\{[\s\S]*?flex:0 0 auto/);
 assert.match(css,/#staff-nav\{[\s\S]*?overflow:visible/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
});
test('Existing role-gated actions, buttons, and footer remain available',()=>{
 assert.match(html,/staff-sidebar\.css\?v=20261029-scroll-v1/);
 assert.match(html,/staff-nav-section-title[^>]*>KK MEMBER MANAGEMENT/);
 const nav=html.slice(html.indexOf('id="staff-nav"'),html.indexOf('id="staff-sidebar-footer"'));
 for(const role of ['overview','projects','awards','monthly','disclosure','sk-resolutions','roster','duty-manage','users','kk-profiling','kk-participants','kk-rewards','kk-ids','kk-services','audit','settings'])
  assert(nav.includes('data-tab="'+role+'"'),'missing tab '+role);
 for(const protectedTab of ['roster','duty-manage','users','audit'])
  assert.match(nav,new RegExp('data-tab="'+protectedTab+'" class="chair-only" hidden'));
 assert.match(html,/id="staff-sidebar-footer"/);
 assert.match(css,/#staff-nav button\[hidden\]/);
});
