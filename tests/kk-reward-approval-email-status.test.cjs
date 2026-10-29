'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/20261027090000_kk_reward_approval_email_outbox.sql');
const handler=read('lib/handler.cjs'),db=read('lib/supabase.cjs');
const member=read('dist/kk-dashboard.js'),memberCss=read('dist/kk-dashboard.css');
const staff=read('dist/kk-rewards-staff.js'),staffCss=read('dist/kk-rewards.css');
test('Member reward requests show visibly distinct Pending/Approved/Rejected with explicit pickup/release guidance',()=>{
 for(const status of ['pending','approved','rejected']){
  assert.match(member,new RegExp(status+':'));
  assert.match(memberCss,new RegExp('\\.kk-redemption-status\\.is-'+status));
  assert.match(memberCss,new RegExp('\\.kk-redemption-entry\\.is-'+status));
  assert.match(staffCss,new RegExp('\\.kk-redemption-status\\.is-'+status));
 }
 assert.match(member,/SK VASRA Office/);
 assert.match(member,/Available ulit ang naka-reserve na points/);
 assert.match(staff,/kk-claim-status-actions/);
});
test('Queue is inserted atomically only for pending -> approved, never rejected or previous approved records',()=>{
 assert.match(sql,/IF OLD\.status='pending' AND NEW\.status='approved' THEN/);
 assert.match(sql,/AFTER UPDATE OF status ON vasra\.kk_redemptions/);
 assert.match(sql,/redemption_id uuid PRIMARY KEY/);
 assert.match(sql,/ON CONFLICT\(redemption_id\) DO NOTHING/);
 assert.doesNotMatch(sql,/UPDATE vasra\.kk_redemptions SET status='approved'/);
 assert.doesNotMatch(sql,/INSERT INTO vasra\.kk_points/);
});
test('Outbox is staff-authorized and idempotent across retry requests, with no public data access',()=>{
 assert.match(sql,/AND u\.role IN \('sk','chairman'\)/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON vasra\.kk_reward_approval_mail FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/n\.attempts<5/);
 assert.match(sql,/23 hours/);
 assert.match(sql,/send_nonce=gen_random_uuid\(\)/);
 assert.match(sql,/delivery_state='accepted'/);
 assert.match(db,/kk_reward_email_.*vasra_kk_reward_email/);
 assert.match(handler,/'Idempotency-Key':'kk-reward-approved\/'\+id/);
});
test('Approval sends a recipient-derived branded email; reject never calls notification; no browser email accepted',()=>{
 const route=handler.slice(handler.indexOf("if(path==='/api/kk/staff/rewards'&&method==='POST')"),
  handler.indexOf("if(path==='/api/kk/staff/rewards/image'&&method==='POST')"));
 assert.match(route,/if\(decision==='approved'\)/);
 assert.match(route,/notifyApprovedReward\(db,session,claimId\)/);
 assert.match(route,/approval_email:\{status:'not_applicable'\}/);
 assert.match(route,/S\.uuid\(b\.id\)/);
 assert.match(handler,/const sender=name\?name\+' <'\+from\+'>':from/);
 assert.match(handler,/to:\[recipient\]/);
 assert.match(handler,/Mail\.renderEmail\(\{subject,heading:'Approved!/);
 assert.match(handler,/KK REWARDS APPROVAL/);
 assert.match(read('lib/vasra-email-template.cjs'),/SK VASRA official logo/);
});
test('UI can explicitly retry a pending approved notification but cannot retry rejected requests',()=>{
 assert.match(staff,/claim\.status!=='approved'/);
 assert.match(staff,/claim\.email_status!=='pending'/);
 assert.match(staff,/action:'retry_approval_email'/);
 assert.match(staff,/Approval email pending/);
 assert.match(staff,/No approval email sent/);
});
test('All changed JavaScript still parses',()=>{
 for(const file of ['lib/handler.cjs','lib/supabase.cjs','dist/kk-dashboard.js','dist/kk-rewards-staff.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
