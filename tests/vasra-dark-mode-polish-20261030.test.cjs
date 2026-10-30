'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
test('One late stylesheet corrects mismatched HTML dark-mode selector in public Current Project',()=>{
 const home=read('dist/index.html'),style=read('dist/vasra-dark-mode-polish.css');
 assert.match(home,/vasra-dark-mode-polish\.css\?v=20261030-single-fix-v1/);
 assert.match(style,/html\[data-theme="dark"\] body\.portal-refresh \.current-project-section/);
 assert.match(style,/html\[data-theme="dark"\] body\.portal-refresh \.current-project-modal/);
 assert.match(style,/\.current-project-open/);
});
test('One native duty select has one non-repeating decoration across mobile and desktop',()=>{
 const html=read('dist/account.html'),css=read('dist/vasra-dark-mode-polish.css');
 assert.match(html,/class="duty-officer-select-shell"><select id="duty-officer-select"/);
 assert.equal((html.match(/id="duty-officer-select"/g)||[]).length,1);
 assert.match(css,/\.duty-officer-select-shell::after/);
 assert.match(css,/\.duty-officer-select-shell #duty-officer-select/);
 assert.match(css,/background-image:none!important/);
 assert.match(css,/background-size:0 0!important/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/body\.account-workspace\[data-theme="dark"\] #panel-duty-manage/);
});
test('KK reward and event history get readable navy dark-mode backgrounds',()=>{
 const html=read('dist/kk-dashboard.html'),css=read('dist/vasra-dark-mode-polish.css');
 assert.match(html,/vasra-dark-mode-polish\.css\?v=20261030-single-fix-v1/);
 for(const marker of ['.kk-reward-spotlight','.kk-participation-history','.kk-featured-reward','.kk-attended-event','.kk-rewards-preview-empty','.kk-reward-spotlight-balance'])
  assert(css.includes(marker),marker);
 assert.match(css,/html\[data-theme="dark"\] body\.kk-body\.kk-member-dashboard/);
});
test('Grey KK side gutters/boxed overview removed in dark mode, and light mode unaffected',()=>{
 const css=read('dist/vasra-dark-mode-polish.css');
 assert.match(css,/\.kk-workspace-content/);
 assert.match(css,/\.kk-dashboard-panel\.kk-overview-panel\{/);
 assert.match(css,/background:transparent!important/);
 assert.match(css,/border:0!important/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.doesNotMatch(css,/body\.kk-body\.kk-member-dashboard[ ]*\.kk-reward-spotlight[ ]*\{/);
});
