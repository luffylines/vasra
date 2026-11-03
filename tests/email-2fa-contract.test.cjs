'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('2FA backend and frontend JavaScript are syntactically valid',()=>{
 for(const filename of ['lib/handler.cjs','lib/supabase.cjs','dist/email-2fa-ui.js','dist/account.js','dist/kk.js']){
  assert.doesNotThrow(()=>new Function(read(filename)),filename);
 }
});
test('DB migration installs private OTP storage and fail-closed session gates',()=>{
 const sql=read('supabase/migrations/20261103195000_optional_email_2fa.sql');
 assert.equal((sql.match(/\bcommit;/gi)||[]).length,1);
 assert.equal((sql.match(/create or replace function/gi)||[]).length,2);
 assert.match(sql,/alter table vasra\.email_2fa_challenges enable row level security/i);
 assert.match(sql,/revoke all on function public\.vasra_email_2fa/i);
 assert.match(sql,/enforce_email_2fa_staff/);
 assert.match(sql,/enforce_email_2fa_kk/);
 assert.match(sql,/current_setting\('vasra\.verified_2fa'/);
 assert.match(sql,/challenge\.attempts>=5/);
 assert.match(sql,/interval '5 minutes'/);
 assert.match(sql,/action='prepare_google'/);
 assert.match(sql,/action='password_change'/);
});
test('OTP endpoints require server code validation and Resend',()=>{
 const server=read('lib/handler.cjs');
 assert.match(server,/randomInt\(0,1000000\)/);
 assert.match(server,/MFA_CODE_SECRET/);
 assert.match(server,/emailMfaHash\(challengeId,code\)/);
 assert.match(server,/mfa_prepare_login/);
 assert.match(server,/mfa_google_enabled/);
 assert.match(server,/mfa_verify/);
 assert.match(server,/api\/security\/2fa\/login\/verify/);
 assert.match(server,/api\/kk\/security\/2fa\/login\/verify/);
 assert.match(server,/api\.resend\.com\/emails/);
 assert.doesNotMatch(server,/console\.log\([^)]*(?:code|MFA_CODE_SECRET)/);
});
test('both login screens and account settings load the same 2FA UI',()=>{
 for(const page of ['dist/account.html','dist/kk-login.html','dist/kk-dashboard.html']){
  assert.match(read(page),/email-2fa-ui\.js/);
  assert.match(read(page),/email-2fa-ui\.css/);
 }
 const ui=read('dist/email-2fa-ui.js');
 assert.match(ui,/two-factor/i);
 assert.match(ui,/autocomplete="one-time-code"/);
 assert.match(ui,/challenge_id/);
 assert.match(ui,/mfa_challenge/);
});
