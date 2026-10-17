'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../dist/account.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../dist/account.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../dist/admin-dashboard.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../lib/handler.cjs'),'utf8');

test('forced first-login password change contains visible Show/Hide buttons',()=>{
 const section=html.match(/<section id="password-section"[\s\S]*?<\/section>/)?.[0]||'';
 for(const name of ['current','password','confirm']){
  assert.match(section,new RegExp('name="'+name+'"[^>]*type="password"|name="'+name+'"'));
 }
 assert.equal((section.match(/class="password-toggle"/g)||[]).length,3);
 assert.match(html,/aria-pressed="false"/);
 assert.match(html,/const visible=input\.type==="text"/);
 assert.match(html,/input\.type=visible\?"password":"text"/);
});

test('change email stays actionable after failed readiness probe',()=>{
 const section=html.match(/<form id="change-email-form"[\s\S]*?<\/form>/)?.[0]||'';
 assert.match(section,/type="email"/);
 assert.match(section,/name="current" type="password"/);
 assert.match(section,/class="password-toggle"/);
 assert.match(section,/button class="primary" type="submit">Send verification link/);
 assert.match(js,/if\(emailButton\.getAttribute\('aria-busy'\)!=='true'\)emailButton\.disabled=false/);
 assert.doesNotMatch(js,/querySelector\('button\[type="submit"\]'\)\.disabled=!recoveryReady/);
 assert.match(js,/emailChangeFeedback\(detail,'error'\)/);
 assert.match(html,/id="email-change-message"/);
});

test('password settings can toggle all password fields and keep strength policy',()=>{
 const section=html.match(/<form id="settings-password-form"[\s\S]*?<\/form>/)?.[0]||'';
 assert.equal((section.match(/class="password-toggle"/g)||[]).length,3);
 assert.equal((section.match(/minlength="12"/g)||[]).length,2);
 assert.match(js,/if\(f\.password!==f\.confirm\)throw Error/);
 assert.match(server,/await S\.passwordHash/);
});

test('Chrome Brave password autofill and labels are readable in dark mode',()=>{
 assert.match(css,/\[data-theme="dark"\] #password-section \.password-field input/);
 assert.match(css,/\[data-theme="dark"\] #panel-settings \.settings-card input:-webkit-autofill/);
 assert.match(css,/-webkit-text-fill-color:#f8fbff!important/);
 assert.match(css,/-webkit-box-shadow:0 0 0 1000px #11213a inset!important/);
 assert.match(css,/#password-section \.password-field \.password-toggle/);
 assert.match(css,/#panel-settings \.settings-inline-status\[data-kind="error"\]/);
 assert.match(css,/#panel-settings \.settings-inline-status\[data-kind="success"\]/);
});

test('emails require verified link and current password; password reset still available',()=>{
 for(const x of ['account_email_prepare','account_email_confirm','account_cancel_token',
  'account_reset_prepare','account_reset_confirm'])assert(server.includes(x),x);
 assert.match(server,/S\.passwordMatch\(b\.current,u\.password\)/);
 assert.match(server,/sendAccountEmail\(next,link,'email'\)/);
 assert.match(server,/sendAccountEmail\(result\.delivery_email,link,'reset'\)/);
 assert.match(server,/Same response for known and unknown accounts/);
 assert.match(server,/sessionCookie\(''\)/);
 assert.match(server,/console\.warn\('SK Vasra mail dispatch failure'/);
 assert.doesNotMatch(server,/console\.warn\([^\n]*\b(to|link|apiKey)\b/);
});

test('verified sender and rejected delivery errors have actionable non-secret messaging',()=>{
 const from=server.indexOf('async function sendAccountEmail(');
 const end=server.indexOf('function accountLink(',from);
 assert(from!==-1&&end>from);
 const body=server.slice(from,end);
 assert.match(body,/response\?\.status===403\|\|response\?\.status===422/);
 assert.match(body,/verified ang sending domain/);
 assert.match(body,/response\?\.status===429/);
 assert.match(body,/Resend authentication error/);
 assert.match(body,/Resend 2xx means accepted for delivery, not necessarily delivered/);
});
