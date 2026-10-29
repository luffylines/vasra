'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const pages=['index','projects','duty','youth-leaders','achievements','contacts','transparency','sk-resolutions'];
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
test('Contacts follows SK Resolution on every public page including active Contacts page',()=>{
 for(const page of pages){
  const s=read(page+'.html');
  const nav=s.match(/<nav aria-label="Pangunahing navigation">([\s\S]*?)<\/nav>/);
  assert.ok(nav,page+' public navigation exists');
  const anchors=[...nav[1].matchAll(/<a href="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(anchors.length,8,page+' navigation has 8 pages');
  assert.deepEqual(anchors.slice(-3),['./transparency','./sk-resolutions','./contacts'],page+' ordered end links');
  assert.equal((nav[1].match(/href="\.\/contacts"/g)||[]).length,1,page+' one Contacts link');
  if(page==='contacts')assert.match(nav[1],/href="\.\/contacts" aria-current="page"/);
 }
});
test('Every public sidebar footer has agreed labels and Facebook icon BEFORE link text without right icon',()=>{
 for(const page of pages){
  const s=read(page+'.html');
  const foot=s.match(/<div class="sidebar-bottom">([\s\S]*?)<\/div>/);
  assert.ok(foot,page+' sidebar footer exists');
  // motto nested div: inspect the full footer through its facebook link rather than first closing div.
  assert.match(s,/class="sidebar-motto"[^>]*><span class="sidebar-dot"[^>]*><\/span><strong>Arangkada, Kabataang VASRA!<\/strong>/);
  assert.match(s,/<small>Brgy Vasra Quezon City<\/small>/);
  assert.match(s,/<a class="social-footer-link"[^>]*href="https:\/\/www.facebook.com\/skbrgyvasra"[^>]*><svg class="sidebar-facebook-icon"[\s\S]*?<\/svg><span>Facebook page<\/span><\/a>/);
  assert.doesNotMatch(s,/Para sa kabataang Vasra<small>/);
  assert.doesNotMatch(s,/District 1 · Quezon City/);
  assert.match(s,/shell\.js\?v=20261027-public-sidebar-v1/);
  assert.match(s,/mobile-nav\.css\?v=20261027-public-sidebar-v1/);
 }
});
test('Shared mobile script still compiles and applies menu ordering fallback',()=>{
 const script=read('shell.js');
 assert.match(script,/nav\.append\(contactLink\)/);
 assert.doesNotThrow(()=>new vm.Script(script,{filename:'shell.js'}));
 const css=read('mobile-nav.css');
 assert.match(css,/\.sidebar-motto/);
 assert.match(css,/\.sidebar-facebook-icon/);
});
