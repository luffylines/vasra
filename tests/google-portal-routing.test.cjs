'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('KK Google sign-in does not create new members or profiles',()=>{
 const migration=read('supabase/migrations/20261103222500_kk_google_existing_accounts_only.sql');
 const googleAction=migration.slice(migration.indexOf('$google_action$')+15,migration.indexOf('$google_action$',migration.indexOf('$google_action$')+15));
 assert.match(googleAction,/if not found then\s+return jsonb_build_object\('error',404,'reason','not_registered'\)/);
 assert.doesNotMatch(googleAction,/insert into vasra\.kk_members|insert into vasra\.kk_profiles/);
 assert.match(googleAction,/m\.google_sub is not null and m\.google_sub<>payload->>'sub'/);
 assert.match(googleAction,/m\.email_2fa_enabled/);
 assert.match(googleAction,/google_sub=payload->>'sub',email_verified=true/);
});
test('2FA challenge links existing KK Google identity only after OTP validation',()=>{
 const migration=read('supabase/migrations/20261103222500_kk_google_existing_accounts_only.sql');
 assert.match(migration,/google_sub is null or google_sub=payload->>'sub'/);
 assert.match(migration,/Link the verified Google identity only AFTER successful email 2FA/);
 assert.match(migration,/challenge\.identity_sub is not null/);
 assert.match(migration,/set google_sub=challenge\.identity_sub,email_verified=true/);
});
test('dedicated and shared KK Google callbacks never use SK sessions',()=>{
 const src=read('lib/handler.cjs');
 assert.equal((src.match(/const protectedAccount=await db\.rpc\('mfa_google_enabled',\{kind:'kk'/g)||[]).length,2);
 assert.equal((src.match(/const outcome=await db\.rpc\('kk_google',/g)||[]).length,2);
 assert.equal((src.match(/\/verify-login\?kind=kk&challenge=/g)||[]).length,2);
 assert.match(src,/\/verify-login\?kind=staff&challenge=/);
 assert.match(src,/const protectedAccount=await db\.rpc\('mfa_google_enabled',\{kind:'staff'/);
 assert.equal((src.match(/reason==='not_registered'\?'no_account'/g)||[]).length,2);
 assert.match(src,/kkCookie\(sessionValue,true\)/);
 assert.match(src,/sessionCookie\(sessionValue,true\)/);
 assert.doesNotThrow(()=>new Function(src));
});
test('unregistered Google account returns a visible error above KK credentials',()=>{
 const page=read('dist/kk-login.html');
 const js=read('dist/kk.js');
 const css=read('dist/kk-google-signin.css');
 assert.match(page,/id="kk-google-signin-error" class="kk-google-signin-error" role="alert"/);
 assert.ok(page.indexOf('id="kk-google-signin-error"')<page.indexOf('id="kk-login-form"'));
 assert.match(js,/no_account:'Wala pang rehistradong KK account/);
 assert.match(js,/banner\.textContent=message;banner\.hidden=false/);
 assert.match(css,/html\[data-theme="dark"\]/);
 assert.match(page,/kk-google-signin\.css\?v=20261103-google-guard-v1/);
 assert.doesNotThrow(()=>new Function(js));
});
test('Google identity is verified by token code before entering either portal',()=>{
 const src=read('lib/google-auth.cjs');
 assert.match(src,/email_verified/);
 assert.match(src,/verifyIdToken/);
 assert.match(src,/nonce/);
});
