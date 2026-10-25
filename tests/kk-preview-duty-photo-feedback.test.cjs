'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('KK Profile differentiates missing database from a logged-out account',()=>{
 const kk=read('dist/kk.js');
 assert.match(kk,/const setupUnavailable=\/Hindi available ang database\|migration\|server configuration\/i/);
 assert.match(kk,/KK Profiling database is not ready/);
 assert.match(kk,/setupUnavailable\?'':'<a href="\.\/kk-login">Go to KK Login<\/a>/);
 assert.match(kk,/id="kk-retry-load"/);
});

test('SK Duty on mobile does not present an absent duty picture as a full photo poster',()=>{
 const script=read('dist/duty.js');
 const css=read('dist/portal.css');
 assert.match(script,/photos\.dataset\.photoState=list\.length===1&&!list\[0\]\.duty_photo_id\?'missing':'ready'/);
 assert.match(script,/class="duty-photo-notice"/);
 assert.match(script,/img\.classList\.contains\('duty-photo-primary'\)/);
 assert.match(script,/if\(list\.length===1\)photos\.dataset\.photoState='missing'/);
 assert.match(css,/\[data-layout="single"\]\[data-photo-state="missing"\]/);
 assert.match(css,/\[data-photo-state="missing"\] \.duty-profile-frame/);
 assert.match(css,/@media\(max-width:650px\)/);
});

test('Duty picture and organizational portrait continue to be separate',()=>{
 const duty=read('dist/duty.js');
 const council=read('dist/officers.js');
 assert.match(duty,/p\.duty_photo_id\?'<img class="duty-photo-primary"/);
 assert.doesNotMatch(duty,/p\.photo_id\?'<img/);
 assert.match(council,/officerPortrait\(o\.name,o\.position,o\.photo_id/);
});
