'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),app=read('dist/account.js'),mg=read('dist/duty-management.js'),api=read('lib/handler.cjs');
const sql=read('supabase/migrations/20261018150000_weekly_office_hours.sql');
test('Chairman sidebar retains a separate SK Duty management UI',()=>{
 assert.match(html,/data-tab="duty-manage" class="chair-only" hidden/);
 assert.match(html,/id="panel-duty-manage"/);
 assert.match(html,/src="\.\/duty-management\.js"/);
 assert.match(html,/id="duty-manage-officers"/);
 assert.match(html,/Save Office Hours/);
 assert.match(app,/name==='duty-manage'\)await loadDutyManagement\(\)/);
});
test('Duty officer selector only allows one day and saves immediately',()=>{
 assert.match(mg,/Duty day \(one only\)/);
 assert.match(mg,/<select data-duty-day-for/);
 assert.match(mg,/async function saveDutyOfficer/);
 assert.match(mg,/api\('\.\/api\/officer-profiles\/duty'/);
 assert.match(mg,/await saveDutyOfficer\(id,\{duty_day:Number\(day\.value\)\|\|null\},day\)/);
 assert.match(mg,/dutyManageSaving\.has\(id\)/);
 assert.match(mg,/if\(!result\?\.ok\)throw Error/);
 assert.match(mg,/catch\{day\.value=String\(old\)\}/);
});
test('Upload a duty photo without replacing official organizational photo',()=>{
 assert.match(mg,/profile\.duty_photo_id/);
 assert.match(mg,/data-duty-photo-for/);
 assert.match(mg,/uploadProjectPhoto\(file\)/);
 assert.match(mg,/await saveDutyOfficer\(id,\{duty_photo_id:idOfPhoto\},input\)/);
 assert.match(mg,/data-duty-photo-remove/);
 assert.match(mg,/duty_photo_id:null/);
 assert.doesNotMatch(mg,/image=profile\.photo_id/);
});
test('Office hours save separately without overriding selected SK Duty officer',()=>{
 assert.match(sql,/if action='save_hours'/);
 assert.match(sql,/duty_hours_updated/);
 assert.match(sql,/opens<closes/);
 assert.match(mg,/api\('\.\/api\/duty-schedule'/);
 assert.match(api,/duty_management_save_hours/);
 assert.doesNotMatch(api,/official_ids:b\.official_ids/);
 assert.match(sql,/grant execute on function public\.vasra_duty_management/);
});
test('SK Duty preview requires an approved published active official record',()=>{
 assert.match(read('supabase/migrations/20261018140000_official_photos_duty_roster.sql'),/where id=item and published and not archived for update/);
 assert.match(mg,/dutyManageProfiles\.filter\(p=>p\.published\)/);
 assert.match(mg,/Wala pang published SK Officials/);
 assert.match(mg,/Database setup pending/);
 assert.match(read('dist/duty.js'),/duty\.days|duty_days/);
});
test('Existing office-hours status and public map stay in Philippine Time',()=>{
 const duty=read('dist/duty.js'),home=read('dist/home.js');
 assert.match(duty,/publishedDutyHours/);
 assert.match(duty,/toMinutes\(opens\)/);
 assert.match(home,/homeDutyOpen/);
 assert.match(home,/homeDutyClose/);
 assert.match(api,/\/api\/duty-schedule/);
});
test('Mobile and dark mode show correctly styled separate duty photo manager',()=>{
 const css=read('dist/admin-dashboard.css');
 assert.match(css,/\.duty-manager-officer-card/);
 assert.match(css,/\[data-theme="dark"\] :is\(/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/#roster-form \.roster-duty-link/);
});
