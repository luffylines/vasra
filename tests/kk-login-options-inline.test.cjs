'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),
  fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('KK Login places session hint and Forgot Password in same compact row',()=>{
 const html=read('dist/kk-login.html');
 const start=html.indexOf('<div class="kk-login-options">');
 const end=html.indexOf('</div></div>',start);
 assert.ok(start>0 && end>start,'grouped option row');
 const row=html.slice(start,end+12);
 assert.match(row,/kk-session-hint/);
 assert.match(row,/Stay signed in for up to 7 days/);
 assert.match(row,/kk-forgot-row/);
 assert.match(row,/Forgot Password\?/);
 assert.match(row,/href="\.\/kk-reset"/);
 assert.ok(row.indexOf('kk-session-hint')<row.indexOf('kk-forgot-row'));
 assert.match(html,/kk\.css\?v=20261026-login-options-aligned-v2/);
});
test('KK Login session hint aligns with reset link on desktop and mobile, no excessive gap',()=>{
 const css=read('dist/kk.css');
 assert.match(css,/#kk-login-form \.kk-login-options\{\s*\n display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap/);
 assert.match(css,/gap:4px 14px;margin:-2px 0 0/);
 assert.match(css,/#kk-login-form\{gap:12px\}/);
 assert.match(css,/min-height:28px/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/html\[data-theme="dark"\] \.kk-auth-page\[data-view="login"\]/);
});
