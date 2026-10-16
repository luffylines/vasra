'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dist/account.html'),'utf8');
const js=fs.readFileSync(path.join(root,'dist/account.js'),'utf8');
const css=fs.readFileSync(path.join(root,'dist/admin-dashboard.css'),'utf8');
const handler=fs.readFileSync(path.join(root,'lib/handler.cjs'),'utf8');

test('password recovery uses SK branded compact two-panel UI',()=>{
 assert.match(html,/id="recovery-section"/);
 assert.match(html,/class="recovery-layout"/);
 assert.match(html,/class="recovery-aside"/);
 assert.match(html,/id="recovery-send"/);
 assert.match(html,/id="recovery-email"[^>]*type="email"[^>]*required/);
 assert.match(html,/id="recovery-reset-form" hidden/);
 assert.match(html,/id="recovery-message"[^>]*aria-live="polite"/);
 assert.match(css,/#recovery-section \.recovery-layout\{/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/#recovery-section \.recovery-aside\{display:none\}/);
});
test('reset link request does not stay disabled when readiness probe fails',()=>{
 assert.match(js,/if\(submit\.getAttribute\('aria-busy'\)!=='true'\)submit\.disabled=false/);
 assert.match(js,/if\(mode==='request'\)checkRecoveryAvailability\(\)/);
 assert.match(js,/form\.reportValidity\(\)/);
 assert.match(js,/recoveryFeedback\('Preparing your secure reset request/);
 assert.match(js,/aria-busy','true'/);
 assert.match(js,/aria-busy','false'/);
 assert.match(js,/recoveryFeedback\(err\.message/);
});
test('password recovery is server validated, hashed, expires and prevents account enumeration',()=>{
 assert.match(handler,/path === '\/api\/account\/reset\/request'/);
 assert.match(handler,/await limit\('reset-ip'/);
 assert.match(handler,/await limit\('reset-email'/);
 assert.match(handler,/account_reset_prepare/);
 assert.match(handler,/if\(result\?\.delivery_email\)/);
 assert.match(handler,/sendAccountEmail\(result\.delivery_email,link,'reset'\)/);
 assert.match(handler,/Same response for known and unknown accounts/);
 assert.match(handler,/account_reset_confirm/);
 assert.match(handler,/sessionCookie\(''\)/);
});
test('there is no automatic reset email on opening login or Forgot Password page',()=>{
 assert.doesNotMatch(js,/checkRecoveryAvailability\(\)\.then\(.*api\('\.\/api\/account\/reset\/request'/);
 assert.match(js,/\$\('#recovery-request-form'\)\.onsubmit=async e=>/);
});
