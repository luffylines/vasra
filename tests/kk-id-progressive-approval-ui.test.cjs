'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..','dist',name),'utf8');
const memberHtml=read('kk-dashboard.html'),staffHtml=read('account.html');
const member=read('kk-id-member.js'),staff=read('kk-id-staff.js');
const css=read('kk-id-card.css');

test('Approved member view replaces uploader with square portrait and downloadable PDF',()=>{
 assert.match(memberHtml,/id="kk-id-photo-submission" hidden/);
 assert.match(memberHtml,/id="kk-id-approved-photo" class="kk-id-approved-photo" hidden/);
 assert.match(memberHtml,/id="kk-id-approved-portrait"/);
 assert.match(memberHtml,/id="kk-id-member-download"[^>]*disabled/);
 assert.match(member,/submission\.hidden=approved;approvedPhoto\.hidden=!approved/);
 assert.match(member,/exportReady=state==='approved'&&found&&photoLoaded/);
 assert.match(css,/#kk-id-approved-photo\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.kk-id-approved-photo>img\{[\s\S]*?aspect-ratio:1\/1/);
});

test('Members cannot export PDF without a fresh approved response and a valid ID number',()=>{
 assert.match(member,/await api\('\.\/api\/kk\/id-card'\)/);
 assert.match(member,/response\.status!=='approved'/);
 assert.match(member,/response\.photo_exists!==true/);
 assert.match(member,/!\/\^VASRA-KK-\[0-9\]\+\$\/\.test\(id\)/);
 assert.match(member,/await window\.KKIDRender\.pair\(member,'\.\/api\/kk\/id-card\/photo\?t='/);
 assert.match(member,/window\.KKIDRender\.pdf\(\[cards\.front,cards\.back\]/);
 assert.match(member,/if\(memberApproval==='approved'\)/);
});

test('Staff preview opens only for clicked member, directly after their row',()=>{
 assert.match(staffHtml,/id="kk-id-staff-preview"[^>]+hidden/);
 assert.match(staffHtml,/id="kk-id-preview-close"/);
 assert.match(staff,/if\(target\.dataset\.cardPreview\)\{await preview\(id\);return;\}/);
 assert.match(staff,/active\.after\(previewPanel\)/);
 assert.match(staff,/selected=id;paint\(\)/);
 assert.match(staff,/previewRevision\+\+/);
 assert.match(staff,/$('#kk-id-staff-preview').hidden=false/.source ? /kk-id-staff-preview'\)\.hidden=false/ : /kk-id-staff-preview/);
 assert.doesNotMatch(staff,/await preview\(rows\./);
 assert.match(staff,/closePreview\(\); \/\/ Never auto-open/);
});

test('Staff actions remain approval-gated and have no redundant Print Front & Back',()=>{
 assert.match(staff,/const approved=r=>r\.status==='approved'&&r\.photo_exists/);
 assert.match(staff,/approved\(r\)\?'<button/);
 assert.match(staff,/data-card-preview/);
 assert.match(staff,/data-card-download/);
 assert.match(staff,/data-card-printed/);
 assert.doesNotMatch(staff,/data-card-print="/);
 assert.doesNotMatch(staff,/Print Front & Back/);
 assert.match(staff,/if\(!approved\(member\)\)throw Error/);
 assert.match(staff,/if\(!confirm\('Confirm that /);
});

test('Updated KK card scripts are syntactically valid',()=>{
 for(const src of ['kk-id-member.js','kk-id-staff.js','kk-id-render.js'])
  assert.doesNotThrow(()=>new vm.Script(read(src),{filename:src}));
});
