'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const login=read('dist/kk-login.html'),reset=read('dist/kk-reset.html'),
 ui=read('dist/kk-reset.js'),css=read('dist/kk.css'),api=read('lib/handler.cjs'),
 router=read('lib/supabase.cjs'),qr=read('dist/kk-quick-scan.js'),qrCss=read('dist/kk-qr-scan.css'),
 sql=read('supabase/migrations/20261026170500_kk_password_reset_email.sql');
test('KK login has dedicated Forgot Password link and authentic KK-branded form',()=>{
 assert.match(login,/<a href="\.\/kk-reset" class="kk-forgot-link">Forgot Password\?<\/a>/);
 assert.match(reset,/data-view="reset"/);
 for(const id of ['kk-reset-request-form','kk-reset-confirm-form','kk-new-password','kk-confirm-password'])
  assert.match(reset,new RegExp('id="'+id+'"'));
 assert.match(reset,/autocomplete="new-password"/);
 assert.match(reset,/\.\/kk-reset\.js/);
 assert.match(css,/kk-forgot-link/);
 assert.match(css,/#kk-reset-confirm-form\[hidden\]/);
 assert.match(reset,/Back to KK Login/);
});
test('Vercel clean URLs accept KK password recovery links from email',()=>{
 const conf=JSON.parse(read('vercel.json'));
 assert.ok(conf.rewrites.some(r=>r.source==='/kk-reset'&&r.destination==='/kk-reset.html'));
 assert.ok(conf.redirects.some(r=>r.source==='/kk-reset.html'&&r.destination==='/kk-reset'));
});
test('Server recovery is separate from SK staff with rate limiting and non-enumeration',()=>{
 assert.match(api,/path==='\/api\/kk\/reset\/request'&&method==='POST'/);
 assert.match(api,/path==='\/api\/kk\/reset\/confirm'&&method==='POST'/);
 assert.match(api,/await limit\('kk-reset-ip'/);
 assert.match(api,/await limit\('kk-reset-email'/);
 assert.match(api,/await limit\('kk-reset-confirm-ip'/);
 assert.match(api,/S\.email\(b\.email\)/);
 assert.match(api,/sendAccountEmail\(result\.delivery_email,link,'kk_reset'\)/);
 assert.match(api,/return json\(\{ok:true,message:'If a KK account exists/);
 assert.match(api,/const link=cfg\.origin\+'\/kk-reset#token='/);
 assert.match(api,/S\.password\(b\.password\)/);
 assert.match(api,/S\.passwordHash\(b\.password\)/);
 assert.match(router,/action\.startsWith\('kk_password_reset_'\) \? '\/rest\/v1\/rpc\/vasra_kk_password_reset'/);
});
test('One-time KK recovery tokens are hashed, expire within 30 minutes and invalidate sessions',()=>{
 assert.match(sql,/token_hash text NOT NULL UNIQUE/);
 assert.match(sql,/expires_at timestamptz NOT NULL/);
 assert.match(sql,/clock_timestamp\(\)\+interval '30 minutes'/);
 assert.match(sql,/expires_at>clock_timestamp\(\)/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/DELETE FROM vasra\.kk_sessions WHERE member_id=match_token\.member_id/);
 assert.match(sql,/DELETE FROM vasra\.kk_password_resets WHERE member_id=match_token\.member_id/);
 assert.match(sql,/ON CONFLICT\(member_id\) DO UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.vasra_kk_password_reset/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.vasra_kk_password_reset.*TO service_role/);
});
test('Reset UI has confirmation matching and does not expose token in outgoing fetch URL',()=>{
 assert.match(ui,/password!==confirmForm\.elements\.confirm\.value/);
 assert.match(ui,/new URLSearchParams\(location\.hash/);
 assert.match(ui,/history\.replaceState\(null,''/);
 assert.match(ui,/send\('request'/);
 assert.match(ui,/send\('confirm',\{token,password\}\)/);
 assert.match(ui,/status\(.*'success'/s);
 assert.doesNotMatch(ui,/location\.search/);
});
test('Scanner dialog closes old large camera preview when device is unavailable',()=>{
 assert.match(qr,/cameraState\('unavailable'/);
 assert.match(qr,/DevicesNotFoundError/);
 assert.match(qr,/getUserMedia\(\{video:true,audio:false\}\)/);
 assert.match(qrCss,/#kk-quick-overlay \.kk-quick-header\{display:grid!important/);
 assert.match(qrCss,/grid-template-columns:minmax\(0,1fr\) 36px!important/);
 assert.match(qrCss,/#kk-quick-overlay\[data-camera="unavailable"\] \.kk-quick-camera-frame/);
 assert.match(qrCss,/@media\(max-width:480px\)/);
 assert.match(read('dist/account.html'),/kk-quick-scan\.js\?v=20261027-manual-card-v1/);
});
test('Updated JS compiles with no runtime syntax errors',()=>{
 for(const p of ['dist/kk-reset.js','dist/kk-quick-scan.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
