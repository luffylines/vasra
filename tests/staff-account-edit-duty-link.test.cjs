'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),app=read('dist/account.js'),duty=read('dist/duty-management.js'),
 css=read('dist/admin-dashboard.css'),dutyCss=read('dist/staff-duty-ui.css'),
 handler=read('lib/handler.cjs'),db=read('lib/supabase.cjs'),
 migration=read('supabase/migrations/20261025010000_staff_account_officer_identity.sql');
test('Chairman account directory has compact designation + Edit and Delete, not redundant per-row roles',()=>{
 assert.match(html,/id="panel-users"/);
 assert.match(html,/id="staff-account-search"/);
 assert.match(html,/id="staff-account-total"/);
 assert.match(app,/data-account-edit=/);
 assert.match(app,/data-account-remove=/);
 assert.match(app,/staffRoleTitle/);
 assert.match(app,/SK Treasurer/);
 assert.match(app,/SK Secretary/);
 assert.doesNotMatch(app,/Role para kay/);
 assert.doesNotMatch(app,/Save Access<\/button>/);
 assert.doesNotMatch(app,/Save Position<\/button>/);
 assert.match(css,/@media\(max-width:430px\)/);
 assert.match(css,/\.staff-account-edit-fields\{grid-template-columns:minmax\(0,1fr\)/);
});
test('Chairman-only editing fields and typed-name deactivation are protected server side',()=>{
 assert.match(html,/id="staff-account-delete"/);
 assert.match(html,/id="staff-delete-confirm-name"/);
 assert.match(html,/id="staff-delete-copy"/);
 assert.match(html,/id="staff-delete-confirm".*disabled/);
 assert.match(app,/typed\.value!==account\.name/);
 assert.match(app,/navigator\.clipboard\.writeText\(account\.name\)/);
 assert.match(app,/method:'DELETE'/);
 assert.match(app,/method:'PUT'/);
 assert.match(handler,/accounts_update/);
 assert.match(handler,/accounts_deactivate/);
 assert.match(handler,/await user\(\['chairman'\]\)/);
 assert.match(migration,/u\.role='chairman'/);
 assert.match(migration,/target\.role='chairman' or target\.id=actor\.id/);
 assert.match(migration,/payload->>'confirm_name' <> target\.name/);
 assert.match(migration,/delete from vasra\.sessions where user_id=target\.id/);
 assert.match(migration,/disabled_at=clock_timestamp\(\),role='youth'/);
 assert.doesNotMatch(migration,/delete from vasra\.users\b/i);
 assert.doesNotMatch(migration,/truncate\b/i);
});
test('Editing and new account creation bind to the official SK Duty identity with preserved photo history',()=>{
 assert.match(migration,/add column if not exists account_user_id uuid unique references vasra\.users\(id\)/);
 assert.match(migration,/create trigger sk_account_officer_sync after insert or update/);
 assert.match(migration,/update vasra\.officials set name=new\.name,position=new\.position/);
 assert.match(migration,/where account_user_id=new\.id/);
 assert.match(migration,/insert into vasra\.officials\(name,position,published,archived,account_user_id,duty_days\)/);
 assert.match(migration,/when archived then true else published/);
 assert.match(migration,/update vasra\.officials set published=false,archived=true,duty_days=/);
 assert.match(migration,/on vasra\.users for each row/);
 assert.match(db,/action\.startsWith\('accounts_'\)/);
 assert.match(db,/\/rest\/v1\/rpc\/vasra_staff_accounts/);
 assert.match(migration,/grant execute on function public\.vasra_staff_accounts\(text,jsonb,text\) to service_role/);
 assert.match(app,/await loadUsers\(\)/);
});
test('Duty photo confirmed upload shows progress and prevents changing officer mid-transfer',()=>{
 assert.match(html,/id="duty-upload-progress"/);
 assert.match(html,/id="duty-upload-meter"/);
 assert.match(html,/id="duty-upload-label"/);
 assert.match(app,/async function uploadProjectPhoto\(file,onProgress\)/);
 assert.match(app,/onProgress\?\.\('Uploading photo part '/);
 assert.match(duty,/function dutyManageUploadStatus/);
 assert.match(duty,/dutyManagerUploadBusy=true/);
 assert.match(duty,/\$\('#duty-officer-select'\)\.disabled=true/);
 assert.match(duty,/await uploadProjectPhoto\(file,\(label,done,total\)=>dutyManageUploadStatus\(label,done,total\)\)/);
 assert.match(duty,/await dutyManageConfirm\('Confirm new SK Duty photo'/);
 assert.match(duty,/dutyManageUploadStatus\('',0,1,false\)/);
 assert.match(dutyCss,/\.duty-save-confirm \.duty-confirm-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(dutyCss,/\.duty-upload-progress\[hidden\]/);
});
test('Modified JS parses, responsive state and no new hardcoded credentials',()=>{
 for(const [p,s] of [['account.js',app],['duty-management.js',duty],['handler.cjs',handler],['supabase.cjs',db]])
  assert.doesNotThrow(()=>new vm.Script(s,{filename:p}));
 assert.doesNotMatch(migration,/PASSWORD_SECRET|service_role_key|SUPABASE_SERVICE_KEY/);
 assert.match(read('dist/sw.js'),/vasra-v52-sk-account-manage-duty-upload-20261025/);
});
