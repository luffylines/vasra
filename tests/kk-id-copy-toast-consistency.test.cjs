'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..','dist',p),'utf8');
const page=read('kk-dashboard.html'),card=read('kk-id-member.js'),common=read('common.js');
const dashboard=read('kk-dashboard.js'),css=read('kk-dashboard.css'),idCss=read('kk-id-card.css'),auth=read('kk.js');

test('KK ID number and Copy ID are separated in a responsive flex row',()=>{
 assert.match(page,/class="kk-summary-id-actions"><strong id="kk-dash-id"/);
 assert.match(page,/<button type="button" class="kk-copy-id" id="kk-copy-id">Copy ID<\/button>/);
 assert.match(css,/\.kk-summary-id-card \.kk-summary-id-actions\{/);
 assert.match(css,/gap:10px 12px/);
});

test('Approved member photo hides entire upload article but keeps PDF controls in preview',()=>{
 assert.match(page,/<article id="kk-id-upload-card" class="kk-id-upload-card" hidden>/);
 assert.match(card,/uploadCard\.hidden=approved/);
 assert.match(card,/approvedPhoto\.hidden=!approved/);
 assert.match(idCss,/#kk-id-upload-card\[hidden\]\{display:none!important/);
 assert.ok(page.indexOf('id="kk-id-approved-photo"')>page.indexOf('class="kk-id-profile-card kk-id-reference-card"'));
 assert.match(page,/id="kk-id-member-download"[^>]+disabled/);
 assert.match(card,/response\.status!=='approved'/);
 assert.match(card,/window\.KKIDRender\.pdf\(\[cards\.front,cards\.back\]/);
});

test('KK notifications use one right-side five-second toast with redirect flash',()=>{
 assert.match(common,/right:18px/);
 assert.match(common,/timer=setTimeout\(\(\)=>\{node\.hidden=true;timer=null;\},5000\)/);
 assert.match(common,/window\.showVasraToast=/);
 assert.match(common,/window\.queueVasraToast=/);
 assert.match(auth,/window\.showVasraToast\(message,type\)/);
 assert.match(auth,/window\.queueVasraToast\?\.\('Successfully signed in/);
 assert.match(auth,/window\.queueVasraToast\?\.\('KK account created/);
 assert.match(auth,/feedback\('Valid ID upload failed: '\+err\.message,'error'\)/);
 assert.match(dashboard,/window\.showVasraToast\('Hindi natuloy ang KK logout:/);
 for(const view of ['kk-login','kk-register','kk-profile']){
  const html=read(view+'.html');
  assert.match(html,/src="\.\/common\.js\?v=20261025-kk-toast-right-v5"/);
  assert.match(html,/src="\.\/kk\.js\?v=20261026-kk-password-reset-v1"/);
 }
});

test('All browser handlers still compile',()=>{
 for(const file of ['kk-id-member.js','kk-dashboard.js','kk.js','common.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
