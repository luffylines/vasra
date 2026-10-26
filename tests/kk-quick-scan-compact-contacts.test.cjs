'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),account=read('dist/account.js'),scanner=read('dist/kk-qr-scan.js'),quick=read('dist/kk-quick-scan.js'),css=read('dist/kk-qr-scan.css');
test('Duplicate Scan KK ID sidebar shortcut removed and staff-only header QR button present before theme toggle',()=>{
 assert.doesNotMatch(html,/class="staff-nav-scan"|data-scan-open/);
 assert.match(html,/id="kk-service-open-scanner"/);
 assert.ok(html.indexOf('id="staff-quick-scanner"')<html.indexOf('id="theme-toggle"'));
 assert.match(html,/id="staff-quick-scanner"[^>]*aria-label="Scan KK ID QR"/);
 assert.match(account,/quickButton.hidden=!signedIn\|\|!\['sk','chairman'\]\.includes\(user\?\.role\)/);
});
test('Toolbar opens child camera and only routes to SK Services after valid KK ID QR recognition',()=>{
 for(const id of ['kk-quick-overlay','kk-quick-video','kk-quick-canvas','kk-quick-manual-form','kk-quick-close'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(quick,/window\.openQuickKKScan=\(\)=>/);
 assert.match(quick,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(quick,/window\.BarcodeDetector/);
 assert.match(quick,/window\.jsQR/);
 assert.match(quick,/window\.enterKKScanService\(raw\)/);
 assert.match(account,/window\.enterKKScanService=async kkId=>/);
 assert.match(account,/await selectTab\('kk-services'\)/);
 assert.match(account,/await window\.openKKScan\?\.\(\{kkId\}\)/);
 assert.match(quick,/VASRA-KK-\[0-9\]\{1,10\}/);
});
test('QR decoder is locally vendored and safe manual fallback is retained',()=>{
 assert.match(html,/vendor-jsqr\.js\?v=/);
 assert.match(html,/kk-quick-scan\.js\?v=/);
 assert.match(scanner,/script\.src='\.\/vendor-jsqr\.js/);
 assert.doesNotMatch(scanner,/cdn\.jsdelivr\.net/);
 assert.match(scanner,/id="kk-scan-service-type"|name="service_type"/);
 assert.match(scanner,/action:'lookup'/);
 assert.match(scanner,/window\.openKKScan=async\(\{kkId=null,autoStart=false\}/);
 assert.match(account,/window\.openKKScan\?\.\(\{autoStart:true\}\)/);
 assert.ok(read('dist/vendor-jsqr.js').length>100000);
 assert.match(read('dist/vendor-jsqr.LICENSE'),/Apache License/);
});
test('SK Services cards and scan controls are uniform and compact at phone widths',()=>{
 const s=read('dist/kk-services.css');
 assert.match(css,/\.kk-quick-overlay/);
 assert.match(css,/\.kk-scan-service-form/);
 assert.match(css,/min-height:36px/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(s,/\.kk-service-heading-actions button/);
 assert.match(s,/min-height:38px;height:38px/);
 assert.match(scanner,/kk-scan-walkin-details/);
});
test('Contact details have no distracting horizontal underlines in dark mode while retaining link focus',()=>{
 const s=read('dist/officer-contacts.css'),duty=read('dist/duty.html');
 assert.match(s,/\.duty-contact-detail a:link/);
 assert.match(s,/text-decoration:none!important/);
 assert.match(s,/body\.portal-refresh \.duty-contact-detail a\{/);
 assert.match(s,/focus-visible\{outline:2px solid/);
 assert.match(duty,/officer-contacts\.css\?v=20261026-dark-contact-v2/);
});
test('Updated scanner JavaScript compiles',()=>{
 for(const file of ['dist/kk-qr-scan.js','dist/kk-quick-scan.js','dist/account.js','dist/vendor-jsqr.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
