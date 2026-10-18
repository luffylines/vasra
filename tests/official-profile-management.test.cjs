'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('dist/account.html');
const js=read('dist/account.js');
const duty=read('dist/duty.js');
const dutyHtml=read('dist/duty.html');
const handler=read('lib/handler.cjs');
const sql=read('supabase/migrations/20261018140000_official_photos_duty_roster.sql');
const storage=read('lib/supabase.cjs');
const css=read('dist/admin-dashboard.css')+read('dist/portal.css');

test('chairman edits officer photo and duty days from one form',()=>{
 for(const id of ['roster-photo-file','roster-photo-preview','roster-photo-clear',
 'roster-duty-days','roster-profile-message'])assert(html.includes('id="'+id+'"'),id);
 assert.equal((html.match(/#roster-duty-days/g)||[]).length,0);
 for(let i=1;i<=7;i++)assert(html.includes('<input type="checkbox" value="'+i+'">'));
 assert.match(html,/accept="image\/png,image\/jpeg,image\/webp"/);
 assert.match(js,/function rosterPhotoPreview\(\)/);
 assert.match(js,/function loadRosterProfile\(item\)/);
 assert.match(js,/photo_id:imageId\|\|null,duty_days:dutyDays/);
 assert.match(js,/await uploadProjectPhoto\(rosterPhotoFile\)/);
 assert.match(js,/await api\('\.\/api\/officer-profiles'/);
 assert.match(css,/#roster-form \.roster-photo-editor/);
 assert.match(css,/#roster-form \.roster-day-checkboxes/);
});
test('outgoing officer turnover archives old record and prevents photo identity reuse',()=>{
 assert.match(js,/Para sa kapalit na SK officer, i-archive muna ang dating record/);
 assert.match(js,/previous\.name\.trim\(\)\.toLowerCase\(\)!==f\.name\.value\.trim\(\)\.toLowerCase\(\)/);
 assert.match(js,/resetRosterProfile\(\)/);
 const roster=read('supabase/migrations/20261016124500_official_directory_management.sql');
 assert.match(roster,/set archived=true,published=false/);
 assert.match(sql,/where o\.published and not o\.archived/);
 assert.match(sql,/previous_photo_id/);
});
test('public organizational structure uses authenticated Chairman upload only when published',()=>{
 const c=vm.createContext({esc:v=>String(v).replaceAll('<','&lt;')});
 vm.runInContext(read('dist/duty-data.js'),c);
 vm.runInContext(read('dist/officers.js'),c);
 const id='35e3ed5c-4a19-48ec-8a6c-f20bd2a46b8f';
 const result=vm.runInContext('officerChart([{name:"Current Member",position:"kagawad",photo_id:"'+id+'"}],true)',c);
 assert.match(result,new RegExp('api/images/'+id));
 assert.match(result,/portrait-profile-photo/);
 const missing=vm.runInContext('officerChart([{name:"Replacement Officer",position:"kagawad"}],true)',c);
 assert.doesNotMatch(missing,/<img/);
 assert.match(missing,/portrait-fallback-only/);
 assert.match(sql,/action='public'/);
 assert.match(sql,/action='photo'/);
 assert.match(sql,/i\.ready and o\.published and not o\.archived/);
});
test('SK Duty images use managed roster instead of obsolete poster after publication',()=>{
 assert.match(dutyHtml,/id="duty-officer-portraits"/);
 assert.match(duty,/let managedDutyDays=null/);
 assert.match(duty,/poster\.hidden=!!managedDutyDays/);
 assert.match(duty,/photos\.hidden=!managedDutyDays/);
 assert.match(duty,/function loadManagedDutyRoster/);
 assert.match(duty,/result\.profiles/);
 assert.match(duty,/\.duty_days\.includes\(i\+1\)/);
 assert.match(css,/#duty-officer-portraits\[hidden\]/);
});
test('public image URL is checked against published official only, not draft/private',()=>{
 assert.match(handler,/officer_profile_photo/);
 assert.match(handler,/if \(path === '\/api\/officer-profiles' && method === 'GET'\)/);
 assert.match(handler,/await user\(\['chairman'\]\)/);
 assert.match(storage,/action\.startsWith\('officer_profile_'\)/);
 assert.match(sql,/revoke all on function public\.vasra_officer_profile/);
 assert.match(sql,/grant execute on function public\.vasra_officer_profile/);
 assert.match(sql,/i\.id=item and i\.ready and o\.published and not o\.archived/);
});
test('Chairman-only updates validate ready uploads, weekday values and audit records',()=>{
 assert.match(sql,/actor\.role<>'chairman'/);
 assert.match(sql,/i\.owner=actor\.id or i\.id=old_profile\.photo_id/);
 assert.match(sql,/official_profile_updated/);
 assert.match(sql,/cardinality\(duty_days\)<=7/);
 assert.match(handler,/new Set\(b\.duty_days\)\.size!==b\.duty_days\.length/);
 assert.match(js,/if\(!rosterProfilesReady&&\(rosterPhotoFile\|\|dutyDays\.length\)\)/);
});
test('server duty permissions change with published roster; old roster only legacy fallback',()=>{
 assert.match(sql,/if has_schedule then/);
 assert.match(sql,/weekday=any\(o\.duty_days\)/);
 assert.match(sql,/where o\.published and not o\.archived/);
 assert.match(sql,/if lower\(trim\(actor\.name\)\)<>all\(assigned_names\)/);
 assert.match(js,/refreshStaffDutyRoster/);
 assert.match(js,/typeof liveAssignedNames!=='undefined'/);
 assert.match(sql,/STAGED ONLY/);
});
