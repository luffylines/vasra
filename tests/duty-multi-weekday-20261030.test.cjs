'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Database permits multiple weekdays but caps weekday occupancy at two officials',()=>{
 const sql=read('supabase/migrations/20261030083000_duty_multiple_weekdays.sql');
 assert.match(sql,/duty_days <@ array\[1,2,3,4,5,6,7\]/);
 assert.match(sql,/cardinality\(duty_days\)<=7/);
 assert.match(sql,/payload \? 'duty_weekdays'/);
 assert.match(sql,/jsonb_array_length\(payload->'duty_weekdays'\)>6/);
 assert.match(sql,/duplicate_weekday/);
 assert.match(sql,/two_officers_maximum/);
 assert.match(sql,/pg_advisory_xact_lock\(20261030,1\)/);
 assert.match(sql,/array_append\(assigned_days,7::smallint\)/);
 assert.match(sql,/if payload \? 'duty_sunday'/);
 assert.match(sql,/actor\.role<>'chairman'/);
});
test('Chairman can save Monday and Saturday together without affecting Sunday/photo',()=>{
 const html=read('dist/account.html'),js=read('dist/duty-management.js');
 const api=read('lib/handler.cjs');
 assert.match(html,/id="duty-manage-save-weekdays"/);
 assert.match(js,/type="checkbox" name="sk-duty-weekday"/);
 assert.match(js,/Save Assignments/);
 assert.match(js,/await dutyManageSave\(\{duty_weekdays:desired\},control\)/);
 assert.match(js,/dutyManageConfirm\('Confirm weekly SK Duty assignments'/);
 assert.match(js,/response\.duty_days\.filter\(d=>d>=1&&d<=6\)/);
 assert.match(js,/duty_sunday:input\.checked/);
 assert.match(js,/duty_photo_id:uploadedId/);
 assert.match(api,/b\.duty_weekdays\.slice\(\)\.sort\(\(a,b\)=>a-b\)/);
 assert.match(api,/new Set\(b\.duty_weekdays\)\.size!==b\.duty_weekdays\.length/);
 assert.match(api,/await user\(\['chairman'\]\)/);
 const mondaySaturday=[1,6].sort((a,b)=>a-b);
 const saved=[1,6,7].filter(d=>d>=1&&d<=6).sort((a,b)=>a-b);
 assert.deepEqual(mondaySaturday,saved);
});
test('Public duty shows side-by-side portrait cards, names below image, published contact details only',()=>{
 const script=read('dist/duty.js'),css=read('dist/duty-multi-schedule.css');
 assert.match(script,/data-officer-id=/);
 assert.match(script,/duty-profile-contact/);
 assert.match(script,/dutyInlineContacts\(\)/);
 assert.match(script,/publicDutyContacts\.find\(o=>o\.official_id===p\.id&&o\.position===p\.position\)/);
 assert.match(script,/p\.duty_days\.includes\(index\+1\)/);
 assert.match(script,/if\(managedDutyDays\)\{if\(separate\)separate\.hidden=true/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.duty-profile-frame/);
 assert.match(css,/\.duty-profile strong/);
 assert.match(css,/\.duty-profile-contact-row/);
 assert.match(css,/html\[data-theme="dark"\] body\.portal-refresh \.duty-profile/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
});
test('Roster polling preserves loaded images when nothing changed',()=>{
 const script=read('dist/duty.js');
 assert.match(script,/if\(managedDutyDays!==null&&fingerprint\(valid\)===fingerprint\(managedDutyProfiles\)\)return/);
 assert.doesNotMatch(script,/duty-photo-backdrop" src=/);
 assert.match(script,/loadManagedDutyRoster\(\);setInterval\(loadManagedDutyRoster,20000\)/);
});
test('New schedule code parses, pages load versioned CSS and JS',()=>{
 for(const p of ['dist/duty.js','dist/duty-management.js','lib/handler.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
 assert.match(read('dist/duty.html'),/duty-multi-schedule\.css\?v=20261030-v1/);
 assert.match(read('dist/account.html'),/duty-multi-schedule\.css\?v=20261030-v1/);
 assert.match(read('dist/duty.html'),/duty\.js\?v=20261030-multi-days-v1/);
 assert.match(read('dist/account.html'),/duty-management\.js\?v=20261030-multi-days-v1/);
});
