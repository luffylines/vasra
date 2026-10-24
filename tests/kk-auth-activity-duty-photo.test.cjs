'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const photos=read('dist/duty.js'),portal=read('dist/portal.css'),audit=read('dist/account.js');
const sql=read('supabase/migrations/20261024235500_kk_staff_login_audit.sql');
test('Single assigned duty officer fills complete right-side card, without nested thumbnail padding',()=>{
 assert.match(photos,/photos\.dataset\.layout=list\.length===1\?'single'/);
 assert.match(photos,/class="duty-photo-primary"/);
 assert.match(photos,/class="duty-photo-backdrop"/);
 assert.match(photos,/encodeURIComponent\(p\.duty_photo_id\)/);
 assert.match(portal,/#duty-officer-portraits\[data-layout="single"\]/);
 assert.match(portal,/\[data-layout="single"\] \.duty-profile-frame\{/);
 assert.match(portal,/duty-photo-primary\{\s*object-fit:contain/);
 assert.match(portal,/duty-photo-backdrop\{\s*object-fit:cover/);
 assert.match(portal,/\[data-layout="single"\] \.duty-profile\{[^}]*width:100%;height:100%/);
});
test('Portraits remain usable for multiple officers and narrow mobile screens',()=>{
 assert.match(portal,/#duty-officer-portraits\[data-layout="group"\]/);
 assert.match(portal,/@media\(max-width:650px\)/);
 assert.match(portal,/@media\(max-width:390px\)/);
 assert.match(portal,/img\[hidden\]\{display:none!important\}/);
 assert.doesNotThrow(()=>new vm.Script(photos,{filename:'dist/duty.js'}));
});
test('Three authoritative audit triggers record successful SK and KK sessions plus registrations',()=>{
 for(const [t,n] of [['kk_members','vasra_kk_register_audit'],['kk_sessions','vasra_kk_login_audit'],['sessions','vasra_staff_login_audit']]){
  assert.match(sql,new RegExp('create trigger '+n+'\\s+after insert on vasra\\.'+t));
 }
 for(const action of ['kk_registered','kk_login','staff_login'])assert.ok(sql.includes("'"+action+"'"));
 assert.match(sql,/create or replace function vasra\.audit_auth_success\(\)/);
 assert.match(sql,/revoke all on function vasra\.audit_auth_success\(\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function vasra\.audit_auth_success\(\) to service_role/);
 assert.match(sql,/jsonb_build_object\('account_type','kk','method',method_label\)/);
 assert.match(sql,/jsonb_build_object\('account_type','staff','role',role_label\)/);
 assert.doesNotMatch(sql,/new\.password_hash|new\.token|new\.birthdate|new\.phone|new\.email/);
 assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE\b/i);
});
test('Activity Log identifies who registered/logged in and keeps staff/youth visually distinct',()=>{
 for(const action of ['kk_registered','kk_login','staff_login']) assert.ok(audit.includes(action+':'));
 assert.match(audit,/audit-type-kk/);
 assert.match(audit,/audit-type-staff/);
 assert.match(audit,/if\(\['kk_registered','kk_login','staff_login'\]\.includes\(event\.action\)\)/);
 assert.match(audit,/Passwords, birthdates, phone numbers, tokens/);
 assert.match(audit,/esc\(actor\)/);
 assert.doesNotThrow(()=>new vm.Script(audit,{filename:'dist/account.js'}));
 assert.match(read('dist/admin-dashboard.css'),/\.audit-row \.audit-type-kk/);
});
