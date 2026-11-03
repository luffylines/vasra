'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8');

test('verification is a dedicated Vercel route with no login credentials',()=>{
 const vercel=JSON.parse(read('vercel.json'));
 assert.ok(vercel.rewrites.some(x=>x.source==='/verify-login'&&x.destination==='/verify-login.html'));
 const html=read('dist/verify-login.html');
 assert.match(html,/ACCOUNT SECURITY/);
 assert.match(html,/Check your email/);
 assert.match(html,/Verify &amp; Sign In/);
 assert.match(html,/Back to login/);
 assert.match(html,/inputmode="numeric"/);
 assert.match(html,/autocomplete="one-time-code"/);
 assert.match(html,/name="referrer" content="no-referrer"/);
 assert.doesNotMatch(html,/type="password"|name="password"/);
 assert.doesNotMatch(html,/id="kk-login-form"|id="auth-form"/);
 assert.doesNotMatch(html,/Sign in with Google/);
 assert.equal((html.match(/class="verify-otp-digit"/g)||[]).length,6);
});
test('staff, KK and OAuth 2FA all navigate to standalone page',()=>{
 const shared=read('dist/email-2fa-ui.js');
 const staff=read('dist/account.js');
 const kk=read('dist/kk.js');
 const backend=read('lib/handler.cjs');
 assert.match(shared,/location\.replace\('\.\/verify-login\?'/);
 assert.doesNotMatch(shared,/original\.after\(panel\)/);
 assert.match(staff,/VasraEmail2FA\.beginLogin\('staff',b\)/);
 assert.match(kk,/VasraEmail2FA\.beginLogin\('kk',b,nextService\)/);
 assert.match(backend,/\/verify-login\?kind=staff&challenge=/);
 assert.equal((backend.match(/\/verify-login\?kind=kk&challenge=/g)||[]).length,2);
 assert.doesNotMatch(backend,/\/kk-login\?mfa_challenge=/);
});
test('verification JS uses server-side OTP check before dashboard redirect',()=>{
 const script=read('dist/verify-login.js');
 assert.doesNotThrow(()=>new Function(script));
 assert.match(script,/security\/2fa\/login\/verify/);
 assert.match(script,/body\.ok!==true/);
 assert.match(script,/history\.replaceState\(null,'',location\.pathname\)/);
 assert.match(script,/draw\('error'\)/);
 assert.match(script,/draw\('success'\)/);
 assert.match(script,/location\.replace\(destination\)/);
 assert.doesNotMatch(script,/sessionStorage\.setItem|localStorage\.setItem\([^)]*challenge|localStorage\.setItem\([^)]*code/);
 const sql=read('supabase/migrations/20261103195000_optional_email_2fa.sql');
 assert.match(sql,/current_setting\('vasra\.verified_2fa',true\)/);
 assert.match(sql,/insert into vasra\.kk_sessions\(token_hash,member_id,expires\)/);
 assert.match(sql,/insert into vasra\.sessions\(token,user_id,expires\)/);
});
test('responsive OTP buttons align and verification shows red/green states',()=>{
 const css=read('dist/verify-login.css');
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/verify-otp-group\[data-state="error"\]/);
 assert.match(css,/verify-otp-group\[data-state="success"\]/);
 assert.match(css,/@media\(max-width:560px\)/);
});
