'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),app=read('dist/account.js'),duty=read('dist/duty.js');
const sql=read('supabase/migrations/20261018140000_official_photos_duty_roster.sql'),api=read('lib/handler.cjs');
test('Organizational photo and SK Duty photo are independent controls',()=>{
 assert.match(html,/id="roster-photo-file"/);
 assert.match(html,/Para sa SK Organizational Structure lang ito/);
 assert.doesNotMatch(html,/id="roster-open-duty"/);
 assert.doesNotMatch(html,/Separate ang SK Duty sa Organizational Structure/);
 assert.doesNotMatch(html,/id="roster-duty-days"/);
 assert.doesNotMatch(app,/roster-open-duty/);
 assert.match(app,/id:saved\.id,photo_id:imageId\|\|null/);
 assert.doesNotMatch(app,/duty_days:dutyDays/);
 assert.match(sql,/photo_id uuid references vasra\.images/);
 assert.match(sql,/duty_photo_id uuid references vasra\.images/);
});
test('Roster update never modifies duty day or duty picture',()=>{
 assert.match(sql,/Organizational photo saves do not change duty assignment/);
 assert.match(sql,/update vasra\.officials set photo_id=requested_photo,updated_by=actor\.id/);
 assert.doesNotMatch(sql,/update vasra\.officials set photo_id=requested_photo,duty_days=/);
 assert.match(api,/Change duty assignments through SK Duty Management/);
 assert.match(api,/officer_profile_update/);
});
test('Chairman-only SK Duty update validates one day and separate photo, stores audit event',()=>{
 assert.match(sql,/cardinality\(duty_days\)<=1/);
 assert.match(sql,/if action='duty'/);
 assert.match(sql,/if payload \? 'duty_day'/);
 assert.match(sql,/elsif payload->>'duty_day' ~ '\^\[1-7\]\$'/);
 assert.match(sql,/duty_officer_updated/);
 assert.match(sql,/old_duty_photo_id/);
 assert.match(sql,/publish_officer_first/);
 assert.match(api,/\/api\/officer-profiles\/duty/);
 assert.match(api,/await user\(\['chairman'\]\)/);
 assert.match(api,/b\.duty_day<1\|\|b\.duty_day>7/);
});
test('Public organizational structure remains based only on organization photo',()=>{
 const c=vm.createContext({esc:v=>String(v).replaceAll('<','&lt;')});
 vm.runInContext(read('dist/duty-data.js'),c);
 vm.runInContext(read('dist/officers.js'),c);
 const formal='35e3ed5c-4a19-48ec-8a6c-f20bd2a46b8f';
 const other='35e3ed5c-4a19-48ec-8a6c-f20bd2a46b81';
 const rendered=vm.runInContext('officerChart([{name:"Current Officer",position:"kagawad",photo_id:"'+formal+'",duty_photo_id:"'+other+'"}],true)',c);
 assert.match(rendered,new RegExp(formal));
 assert.doesNotMatch(rendered,new RegExp(other));
});
test('Public SK Duty uses only the duty image and legacy fallback until activation',()=>{
 assert.match(duty,/p\.duty_photo_id\?'<img src/);
 assert.doesNotMatch(duty,/p\.photo_id\?'<img src/);
 assert.match(duty,/poster\.hidden=!!managedDutyDays/);
 assert.match(duty,/photos\.hidden=!managedDutyDays/);
 assert.match(duty,/loadManagedDutyRoster/);
 assert.match(read('dist/home.js'),/officerPortrait\(p\.name,p\.position,p\.duty_photo_id,true\)/);
});
test('SK roster photos remain authenticated and archived officers cannot appear publicly',()=>{
 assert.match(sql,/action='photo_manage'/);
 assert.match(sql,/o\.published and not o\.archived/);
 assert.match(sql,/o\.photo_id=i\.id or o\.duty_photo_id=i\.id/);
 assert.match(sql,/revoke all on function public\.vasra_officer_profile/);
 assert.match(api,/officer_profile_photo_manage/);
 const old=read('supabase/migrations/20261016124500_official_directory_management.sql');
 assert.match(old,/set archived=true,published=false/);
});
