'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const handler=read('lib/handler.cjs'),login=read('dist/kk-login.html'),registration=read('dist/kk-register.html'),
      youth=read('dist/kk.js'),theme=read('dist/theme.js'),staff=read('dist/kk-staff.js'),account=read('dist/account.html');
test('KK Google sign in reuses configured SK callback only on matching trusted origin',()=>{
 assert.match(handler,/const shared=Google\.googleConfig\(cfg\)/);
 assert.match(handler,/if\(dedicated\.enabled\)return dedicated/);
 assert.match(handler,/if\(shared\.enabled\)return \{\.\.\.shared,mode:'shared'\}/);
 assert.match(handler,/const sharedFlow=kkSettings\.enabled&&kkSettings\.mode==='shared'/);
 assert.match(handler,/Google\.readFlow\(youthCookie,url\.searchParams\.get\('state'\),kkSettings\)/);
 assert.match(handler,/if\(youthFlow\)\{/);
 assert.match(handler,/db\.rpc\('kk_google'/);
 assert.match(handler,/if\(sessionValue\)headers\.append\('Set-Cookie',kkCookie\(sessionValue,true\)/);
 assert.match(handler,/db\.rpc\('google_login'/);
 assert.match(handler,/vasra_kk_oauth=/);
 assert.match(handler,/vasra_google=/);
 assert.match(handler,/account_link_required/);
 assert.match(handler,/callback_domain_mismatch/);
 assert.doesNotMatch(handler,/!settings\.enabled.*true.*override/i);
});
test('KK top-right ordered theme, Home then Login on sign in and registration',()=>{
 for(const html of [login,registration]){
  assert.match(html,/class="kk-auth-top-actions"/);
  const nav=html.match(/<nav class="kk-auth-top-actions"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav,'auth action group');
  assert.ok(nav.indexOf('Go to Home')<nav.indexOf('KK Login'));
 }
 assert.match(theme,/target\.prepend\(b\)/);
 assert.match(theme,/document\.querySelector\('\.kk-auth-top-actions'\)/);
 assert.doesNotMatch(login,/class="kk-story-home"/);
 assert.match(read('dist/kk.css'),/\.kk-auth-page \.kk-auth-card>\.kk-auth-top-actions/);
 assert.match(read('dist/theme.css'),/\.kk-auth-top-actions \.vasra-theme-toggle/);
});
test('Phone input always uses +63 with 10 local digits starting 9',()=>{
 for(const html of [registration,account]){
  assert.match(html,/name="phone"/);
  assert.match(html,/maxlength="10"/);
  assert.match(html,/9\[0-9\]\{9\}/);
 }
 assert.match(registration,/<span class="kk-ph-prefix" aria-hidden="true">\+63<\/span>/);
 assert.match(staff,/data-ph-mobile type="tel"/);
 assert.match(youth,/name==='phone'\|\|name==='emergency_phone'/);
 assert.match(youth,/const kkPhilippineMobile=/);
 assert.match(handler,/const phMobile=value=>/);
 assert.match(handler,/input\.match\(\/\^\(\?:/);
 assert.match(handler,/const phoneInput=field\(b\.phone,35\),phone=phoneInput\?phMobile\(phoneInput\):''/);
 assert.match(handler,/const middle_name=String\(b\.middle_name\|\|''\)\.trim\(\),phone=phMobile\(b\.phone\)/);
 assert.match(handler,/k==='emergency_phone'&&v\.trim\(\)\?phMobile\(v\)/);
});
test('Philippine phone helpers reject overlong or non-mobile numbers without truncating on server',()=>{
 const script=handler.slice(handler.indexOf('const phMobile=value=>'),handler.indexOf('async function sendAccountEmail'));
 const fake={fail:(code,message)=>{throw Object.assign(new Error(message),{code})}};
 const normalize=value=>vm.runInNewContext(script+';phMobile('+JSON.stringify(value)+')',{S:fake});
 assert.equal(normalize('+639123456789'),'+639123456789');
 assert.equal(normalize('09123456789'),'+639123456789');
 assert.equal(normalize('9123456789'),'+639123456789');
 for(const bad of ['+6391234567898','912345678','8123456789','08876543210','+638123456789'])
  assert.throws(()=>normalize(bad),{code:400},bad);
});
test('Auth icons cannot expand to giant size when browser has cached old CSS',()=>{
 for(const html of [login,registration]){
  assert.match(html,/<style id="kk-auth-actions-critical">/);
  assert.match(html,/\.kk-auth-top-actions \.kk-auth-nav-link svg\{display:block!important;width:18px!important;height:18px!important/);
  assert.match(html,/<svg width="18" height="18" style="width:18px;height:18px;display:block;flex:none"/);
  assert.match(html,/href="\.\/kk\.css\?v=20261026-kk-password-reset-v1"/);
  assert.match(html,/src="\.\/theme\.js\?v=[a-zA-Z0-9-]+"/);
  assert.match(html,/src="\.\/kk\.js\?v=20261026-kk-password-reset-v1"/);
  assert.match(html,/\.kk-auth-card>\.kk-auth-top-actions\{position:absolute/);
 }
});
test('Server code and browser scripts parse with no new secret keys in browser',()=>{
 for(const p of ['lib/handler.cjs','dist/kk.js','dist/theme.js','dist/account.js','dist/kk-staff.js'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
 assert.doesNotMatch(youth,/GOOGLE_CLIENT_SECRET|KK_GOOGLE_CLIENT_SECRET/);
 assert.match(login,/href="\.\/api\/kk\/google\/start"/);
});
