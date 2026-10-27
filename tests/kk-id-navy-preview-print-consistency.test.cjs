'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const renderer=read('dist/kk-id-render.js');
test('SK Vasra Identification Card stays branded with navy-blue CR80 artwork',()=>{
 assert.match(renderer,/centeredHeader\('SK VASRA IDENTIFICATION CARD'/);
 assert.match(renderer,/bg\.addColorStop\(0,'#102647'\)/);
 assert.match(renderer,/bg\.addColorStop\(1,'#0b2040'\)/);
 assert.match(renderer,/x\.strokeStyle='#8ac4f077'/);
 assert.match(renderer,/x\.fillStyle='#eabf5f'/);
 assert.match(renderer,/logoImage\('\.\/barangay-vasra-logo\.jpg'\)/);
 assert.match(renderer,/logoImage\('\.\/sk%20logo\.jpg'\)/);
 assert.doesNotMatch(renderer,/#faf0ff|#f1e7fe|#fff2b0|#edbcf4/);
});
test('Staff and member card images and PDFs still use the same renderer',()=>{
 for(const p of ['dist/account.html','dist/kk-dashboard.html'])
  assert.match(read(p),/kk-id-render\.js\?v=20261027-kk-review-email-v1/);
 assert.match(read('dist/kk-id-staff.js'),/KKIDRender\.pair\(member/);
 assert.match(read('dist/kk-id-member.js'),/window\.KKIDRender\.pair/);
 assert.match(renderer,/85\.6\*MM/);
 assert.match(renderer,/54\*MM/);
 assert.match(renderer,/const matrix=valid\(member\)\?qr\(code\):null/);
 assert.match(renderer,/if\(!cards\.length\)throw Error\('No approved KK cards selected/);
 assert.match(renderer,/const code=String\(member\.kk_id/);
});
test('Navy card renderer compiles and keeps a working local QR generator',()=>{
 assert.doesNotThrow(()=>new vm.Script(renderer,{filename:'dist/kk-id-render.js'}));
 const window={};
 vm.runInNewContext(renderer,{window,TextEncoder,Uint8Array});
 const q=window.KKIDRender.qr('VASRA-KK-02');
 assert.equal(q.length,21);
 assert(q.every(r=>r.length===21));
});
