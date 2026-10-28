'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const member=read('dist/kk-id-member.js');
const staff=read('dist/kk-id-staff.js');
const rewards=read('dist/kk-rewards-staff.js');
const schema=read('supabase/migrations/20261027170000_kk_card_review_email_pdf_resubmit.sql');
const deleteSchema=read('supabase/migrations/20261027073000_kk_reward_delete_preserve_approved_release_reservations.sql');

test('Replacing a rejected KK portrait turns the badge Pending only on confirmed server success',()=>{
 assert.match(schema,/status='pending',review_note='',uploaded_at=clock_timestamp\(\)/);
 assert.match(schema,/reviewed_at=NULL,reviewed_by=NULL/);
 assert.match(member,/response\?\.ok!==true\|\|response\.status!=='pending'/);
 assert.match(member,/memberApproval='pending';exportReady=false;download\.disabled=true/);
 assert.match(member,/\.textContent='Pending · Awaiting SK Photo Approval'/);
 assert.match(member,/\.dataset\.status='pending'/);
 assert.match(member,/New portrait successfully submitted\. Your previous rejection has been cleared/);
 assert.match(member,/await load\(\)/);
 assert.doesNotMatch(member,/if\(state==='rejected'\)tell\('Photo rejected\./);
});
test('SK staff list refreshes when active without interrupting review and updated photos use fresh URLs',()=>{
 assert.match(staff,/const refreshIfIdle=\(\)=>/);
 assert.match(staff,/reviewPanel\.hidden\|\|document\.hidden/);
 assert.match(staff,/busy\|\|loading\|\|selected!==null/);
 assert.match(staff,/setInterval\(refreshIfIdle,20000\)/);
 assert.match(staff,/visibilitychange/);
 assert.match(staff,/window\.addEventListener\('focus',refreshIfIdle\)/);
 assert.match(staff,/const photo=\(id,uploadedAt\)=>/);
 assert.match(staff,/photo\(r\.member_id,r\.uploaded_at\)/);
 assert.match(staff,/photo\(member\.member_id,member\.uploaded_at\)/);
 assert.match(staff,/const reviewPriority=\{pending:0,rejected:1,not_uploaded:2,approved:3\}/);
});
test('Reward deletion is confirmed on server and protects approved redemption history',()=>{
 assert.match(rewards,/data-reward-delete/);
 assert.match(rewards,/result\?\.ok!==true/);
 assert.match(rewards,/approved redemption\(s\) and spent points stay in history/);
 assert.match(deleteSchema,/SET active=false,deleted_at=clock_timestamp\(\)/);
 assert.match(deleteSchema,/IF approved_claims>0 THEN/);
 assert.match(deleteSchema,/DELETE FROM vasra\.kk_redemptions WHERE perk_id=reward_id AND status IN \('pending','rejected'\)/);
 assert.doesNotMatch(deleteSchema,/DELETE FROM vasra\.kk_points/);
 assert.match(deleteSchema,/u\.role='chairman'/);
 assert.match(deleteSchema,/WHERE p\.deleted_at IS NULL/);
 const handler=read('lib/handler.cjs');
 assert.match(handler,/db\.rpc\('kk_reward_delete_delete'/);
});
test('Updated files are valid scripts and HTML/PWA caches point at current versions',()=>{
 for(const p of ['dist/kk-id-member.js','dist/kk-id-staff.js','dist/kk-rewards-staff.js'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
 const account=read('dist/account.html');
 assert.match(account,/kk-id-staff\.js\?v=20261027-resubmit-pending-v1/);
 assert.match(account,/kk-rewards-staff\.js\?v=20261027-safe-reward-delete-v1/);
 assert.match(read('dist/kk-dashboard.html'),/kk-id-member\.js\?v=20261027-resubmit-pending-v1/);
 assert.match(read('dist/sw.js'),/vasra-v69-homepage-barangay-hall-20261029/);
});
