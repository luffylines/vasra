'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),app=read('dist/account.js'),mg=read('dist/duty-management.js');
const api=read('lib/handler.cjs'),sql=read('supabase/migrations/20261018150000_weekly_office_hours.sql');
test('Chairman SK Duty editor selects an existing officer rather than duplicate people cards',()=>{
 assert.match(html,/data-tab="duty-manage" class="chair-only" hidden/);
 assert.match(html,/id="panel-duty-manage"/);
 assert.match(html,/id="duty-officer-select"/);
 assert.match(html,/id="duty-manage-selected"/);
 assert.match(html,/id="duty-manage-selected-name"/);
 assert.match(html,/id="duty-manage-selected-role"/);
 assert.match(html,/id="duty-manage-photo-preview"/);
 assert.doesNotMatch(html,/id="roster-open-duty"/);
 assert.doesNotMatch(html,/id="duty-manage-edit-official"/);
 assert.match(app,/name==='duty-manage'\)await loadDutyManagement\(\)/);
});
test('Select options prioritize existing Youth Leaders directory and suppress outdated archived legacy names',()=>{
 assert.match(mg,/api\('\.\/api\/transparency\/manage\?year='/);
 assert.match(mg,/api\('\.\/api\/officer-profiles\/manage'\)/);
 assert.match(mg,/const hasManagedNames=/);
 const begin=mg.indexOf("const dutyManageWeekdays=");
 const end=mg.indexOf("function dutyManageRenderOptions()",begin);
 assert(begin>=0&&end>begin);
 const scope=vm.createContext({days:[{names:['Old Member'],roles:['SK Kagawad']}],transYearNow:()=>2026});
 vm.runInContext(mg.slice(begin,end)+';this.collect=dutyManageCollect;',scope);
 const existing=scope.collect({profiles:[]},{officials:[{id:'id123',name:'New Member',position:'kagawad',published:true}]});
 assert.equal(existing.length,1);
 assert.equal(existing[0].name,'New Member');
 assert.equal(existing[0].canSave,false); // Until protected profile is present
 const confirmed=scope.collect({profiles:[{id:'id123',name:'New Member',position:'kagawad',published:true,duty_days:[2]}]},{officials:[]});
 assert.equal(confirmed.length,1);
 assert.equal(confirmed[0].canSave,true);
 const fallback=scope.collect(null,null);
 assert.equal(fallback.length,1);
 assert.equal(fallback[0].name,'Old Member');
 assert.equal(fallback[0].canSave,false);
});
test('One duty day only: changes are explicitly confirmed before server save',()=>{
 assert.match(html,/id="duty-manage-day-choices"/);
 assert.match(html,/id="duty-manage-day-fieldset"/);
 assert.match(mg,/type="radio" name="sk-duty-day"/);
 assert.match(mg,/await dutyManageConfirm\('Confirm duty day assignment'/);
 assert.match(mg,/dutyManageSave\(\{duty_day:proposed\|\|null\},input\)/);
 assert.match(mg,/if\(response\?\.ok!==true\)throw Error/);
 assert.match(mg,/dutyManageRestoreDay\(before\)/);
 assert.match(mg,/dutyManagerSaving/);
 assert.match(api,/officer_profile_duty/);
 assert.match(read('supabase/migrations/20261018140000_official_photos_duty_roster.sql'),/cardinality\(duty_days\)<=1/);
});
test('Duty photo upload is separate from Organizational Structure, with preview and removal',()=>{
 assert.match(html,/id="duty-photo-file"/);
 assert.match(html,/id="duty-photo-remove"/);
 assert.match(mg,/officer\.duty_photo_id/);
 assert.match(mg,/uploadProjectPhoto\(file\)/);
 assert.match(mg,/dutyManageSave\(\{duty_photo_id:uploadedId\},input\)/);
 assert.match(mg,/dutyManageSave\(\{duty_photo_id:null\},e\.currentTarget\)/);
 assert.match(mg,/URL\.revokeObjectURL/);
 assert.match(mg,/legacyOfficerPortrait\(officer\.name,officer\.position\)/);
 assert.doesNotMatch(mg,/officer\.photo_id\?/);
});
test('Before migration, selectable names/previews remain visible but save is disabled',()=>{
 assert.match(mg,/Promise\.allSettled/);
 assert.match(mg,/dutyManageRenderOptions\(\);dutyManageRenderHours\(\)/);
 assert.match(mg,/Preview lamang\. Hindi pa active/);
 assert.match(mg,/!dutyManagerReady\|\|dutyManagerSaving/);
 assert.match(mg,/officer\.canSave/);
});
test('Office hours are a separate optional collapsible editor',()=>{
 assert.match(html,/<details class="duty-manager-hours-disclosure">/);
 assert.match(html,/id="duty-manage-week"/);
 assert.match(html,/id="duty-manage-form"/);
 assert.match(html,/Save Office Hours/);
 assert.match(sql,/if action='save_hours'/);
 assert.match(mg,/api\('\.\/api\/duty-schedule'/);
 assert.match(api,/duty_management_save_hours/);
});
test('Responsive duty selector has accessible light/dark controls',()=>{
 const css=read('dist/admin-dashboard.css');
 assert.match(css,/#duty-officer-select/);
 assert.match(css,/\.duty-manager-selected\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.duty-manager-day-choices/);
 assert.match(css,/\.duty-manager-day-chip input:focus-visible\+span/);
 assert.match(css,/\[data-theme="dark"\] :is\(\.duty-manager-single/);
 assert.match(css,/@media\(max-width:420px\)/);
});
