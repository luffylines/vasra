'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const login=read('dist/kk-login.html'),register=read('dist/kk-register.html');
const profile=read('dist/kk-profile.html'),contact=read('dist/contacts.html');
const css=read('dist/kk.css'),contactCss=read('dist/contacts-page.css'),client=read('dist/kk.js');
test('KK Login mimics staff two-panel composition without reusing staff accounts',()=>{
 assert.match(login,/class="kk-auth-layout"/);
 assert.match(login,/class="kk-auth-story"/);
 assert.match(login,/class="kk-auth-card"/);
 assert.match(login,/SK VASRA · KK YOUTH SIGN IN/);
 assert.match(login,/KK Youth Community Portal/);
 assert.match(login,/id="kk-login-form"/);
 assert.match(login,/id="kk-google-login"/);
 assert.match(login,/name="email"/);
 assert.match(login,/name="password"/);
 assert.match(login,/class="kk-story-home" href="\.\/"/);
 assert.match(login,/class="kk-register-action" href="\.\/kk-register"/);
 assert.doesNotMatch(login,/<header class="kk-header">/);
 assert.doesNotMatch(login,/href="\.\/account"/);
 assert.doesNotMatch(login,/id="auth-form"/);
 // Dedicated youth and staff sessions remain different.
 assert.match(read('lib/handler.cjs'),/vasra_kk=/);
 assert.match(read('lib/handler.cjs'),/if \(path === '\/api\/login' && method === 'POST'\)/);
 assert.match(read('lib/handler.cjs'),/if\(path==='\/api\/kk\/login'&&method==='POST'\)/);
});
test('Registration and youth profile have card-internal brand/Home and no separate top bar',()=>{
 for(const html of [register,profile]){
  assert.doesNotMatch(html,/<header class="kk-header">/);
  assert.match(html,/class="kk-reg-toolbar"/);
  assert.match(html,/class="kk-register-brand" href="\.\/"/);
  assert.match(html,/class="kk-register-home" href="\.\/"/);
  assert.doesNotMatch(html,/aria-label="KK Portal navigation"/);
 }
 assert.match(register,/Already have a KK account\?/);
 assert.match(register,/href="\.\/kk-login"/);
 assert.match(register,/id="kk-registration-form"/);
 assert.match(profile,/id="kk-step-form"/);
 assert.match(profile,/id="kk-logout"/);
});
test('KK registration keeps all eight required asterisks beside the corresponding label',()=>{
 assert.equal((register.match(/class="kk-required"/g)||[]).length,8);
 for(const name of ['first_name','last_name','birthdate','phone','email','confirm_email','password','confirm_password']){
  assert.match(register,new RegExp('<span class="kk-label-title">[^<]+<span class="kk-required"[^>]*>\\*<\\/span><\\/span>\\s*(?:<span class="kk-ph-number">[\\s\\S]*?)?<input[^>]+name="'+name+'"'));
 }
 assert.match(css,/\.kk-label-title \.kk-required/);
 assert.match(css,/display:inline!important/);
 assert.doesNotMatch(css,/\.kk-form label span:not\(\.kk-checkbox span\)\{color:#bd4d56\}/);
 assert.match(register,/name="agree"/);
 assert.match(register,/name="confirm_email_correct"/);
});
test('Contacts form places four required markers inside inline label titles, not flex-column children',()=>{
 assert.equal((contact.match(/class="contacts-required"/g)||[]).length,4);
 for(const name of ['name','email','topic','message']){
  assert.match(contact,new RegExp('<span class="contacts-label-title">[^<]+<span class="contacts-required"[^>]*>\\*<\\/span><\\/span>\\s*<(?:input|select|textarea)[^>]+name="'+name+'"'));
 }
 assert.match(contactCss,/\.contacts-label-title/);
 assert.match(contactCss,/\.contacts-required/);
 assert.match(contactCss,/display:inline!important/);
});
test('KK login password eye toggles type and accessibility state',()=>{
 assert.match(login,/id="kk-login-password"/);
 assert.match(login,/class="kk-password-toggle"/);
 assert.match(login,/aria-controls="kk-login-password"/);
 assert.match(client,/reveal\.addEventListener\('click'/);
 assert.match(client,/password\.type=visible\?'password':'text'/);
 assert.match(client,/aria-pressed/);
 assert.doesNotThrow(()=>new vm.Script(client,{filename:'dist/kk.js'}));
});
test('Responsive layout handles desktop, phone and narrow phone without viewport zoom',()=>{
 assert.match(login,/name="viewport" content="width=device-width,initial-scale=1"/);
 assert.match(register,/name="viewport" content="width=device-width,initial-scale=1"/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,\.96fr\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/\.kk-mobile-home\{display:flex/);
 assert.match(css,/\.kk-auth-page\[data-view="register"\] \.kk-field-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/font:500 16px 'DM Sans'/);
 assert.match(contactCss,/@media\(max-width:560px\)/);
 assert.match(read('dist/sw.js'),/vasra-v60-kk-services-and-theme-20261025/);
});
test('Staff sign-in UI remains unchanged by the youth login redesign',()=>{
 const staff=read('dist/account.html');
 assert.match(staff,/id="auth" class="auth-layout vasra-login"/);
 assert.match(staff,/Official staff workspace/);
 assert.match(staff,/id="auth-form"/);
 assert.match(staff,/id="google-sign-in"/);
 assert.match(staff,/id="kk-staff-stats"/);
});
