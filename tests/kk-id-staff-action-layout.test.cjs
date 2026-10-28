'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const staff=read('dist/kk-id-staff.js');
const css=read('dist/kk-id-card.css');
const markup=read('dist/account.html');

test('Staff KK ID action grids reflect the exact number of buttons per review state',()=>{
 const from=staff.indexOf(' const approved=');
 const to=staff.indexOf(' const filtered=');
 assert(from>=0&&to>from);
 const fn=new Function(staff.slice(from,to)+'return actionLayout;')();
 const cases=[
  [{status:'pending',photo_exists:true,kk_id:'VASRA-KK-03'},'three'],
  [{status:'approved',photo_exists:true,kk_id:'VASRA-KK-03',email_state:'pending'},'four'],
  [{status:'approved',photo_exists:true,kk_id:'VASRA-KK-03',email_state:'accepted'},'three'],
  [{status:'rejected',email_state:'pending'},'two'],
  [{status:'rejected',email_state:'accepted'},'single'],
  [{status:'not_uploaded'},'single']
 ];
 for(const [member,expected] of cases)assert.equal(fn(member),expected,JSON.stringify(member));
 assert.match(staff,/data-layout="['"]\+actionLayout\(r\)/);
});

test('Buttons are equal height, icon-aligned and grid-layout sized across desktop and mobile',()=>{
 assert.match(css,/#panel-kk-ids \.kk-id-staff-actions\[data-layout="three"\]/);
 assert.match(css,/#panel-kk-ids \.kk-id-staff-actions\[data-layout="single"\]/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/height:48px;\s*min-height:48px;\s*max-height:48px/);
 assert.match(css,/align-items:center;\s*justify-content:center/);
 assert.match(css,/#panel-kk-ids \.kk-id-staff-actions button svg/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:345px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/button:focus-visible/);
});

test('All existing card controls retain their working delegated handlers',()=>{
 for(const token of ['data-card-preview','data-card-approve','data-card-reject',
  'data-card-download','data-card-printed','data-card-mail']) {
  assert(staff.includes(token),'missing '+token);
 }
 assert.match(staff,/request\('\/review'/);
 assert.match(staff,/request\('\/notify'/);
 assert.match(staff,/KKIDRender\.pdf\(/);
 assert.doesNotThrow(()=>new vm.Script(staff));
 assert.match(markup,/kk-id-staff\.js\?v=20261027-resubmit-pending-v1/);
 assert.match(markup,/kk-id-card\.css\?v=20261027-kk-actions-aligned-v1/);
 assert.match(read('dist/sw.js'),/vasra-v69-homepage-barangay-hall-20261029/);
});
