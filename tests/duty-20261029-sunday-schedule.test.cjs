'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Duty schedule can show one or two weekday portraits and Sunday attendees',()=>{
 const manager=read('dist/duty-management.js'),markup=read('dist/account.html'),publicDuty=read('dist/duty.js'),sql=read('supabase/migrations/20261029193000_sk_duty_two_officers_sunday_attendance.sql');
 assert.match(markup,/id="duty-manage-sunday"/);
 assert.match(markup,/id="duty-manage-week-roster"/);
 assert.match(manager,/dutyManageWeekdays\.slice\(0,6\)/);
 assert.match(manager,/Confirm Sunday attendance/);
 assert.match(manager,/length>=2/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/reason','two_officers_maximum'/);
 assert.match(sql,/duty_sunday/);
 assert.match(publicDuty,/duty-officer-portraits/);
 assert.doesNotThrow(()=>new vm.Script(manager));
});
