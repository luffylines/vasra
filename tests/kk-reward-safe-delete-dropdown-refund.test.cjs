'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const migration=read('supabase/migrations/20261027073000_kk_reward_delete_preserve_approved_release_reservations.sql');
const staff=read('dist/kk-rewards-staff.js'),member=read('dist/kk-dashboard.js');
const account=read('dist/account.html'),css=read('dist/sk-select-controls.css');
test('Delete hides reward but preserves approved claim FK, historical points and audit trail',()=>{
 assert.match(migration,/ADD COLUMN IF NOT EXISTS deleted_at timestamptz/);
 assert.match(migration,/IF approved_claims>0 THEN/);
 assert.match(migration,/SET active=false,deleted_at=clock_timestamp\(\)/);
 assert.match(migration,/DELETE FROM vasra\.kk_perks WHERE id=reward_id/);
 assert.match(migration,/DELETE FROM vasra\.kk_redemptions WHERE perk_id=reward_id AND status IN \('pending','rejected'\)/);
 assert.match(migration,/WHERE p\.deleted_at IS NULL/);
 assert.match(migration,/AND p\.deleted_at IS NULL/);
 assert.match(migration,/FROM vasra\.kk_redemptions d JOIN vasra\.kk_members m/);
 assert.doesNotMatch(migration,/DELETE FROM vasra\.kk_points/);
});
test('Deletion is chairman-only, transactional, and prevents unknown statuses',()=>{
 assert.match(migration,/u\.role='chairman'/);
 assert.match(migration,/FOR UPDATE/);
 assert.match(migration,/status NOT IN \('pending','approved','rejected'\)/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.vasra_kk_reward_delete\(text,jsonb,text\) TO service_role/);
 assert.match(staff,/data-reward-delete/);
 assert.doesNotMatch(staff,/claimed\+reserved>0\?' disabled/);
 assert.match(staff,/result\.preserved_approved/);
 assert.match(staff,/result\.cancelled_pending/);
 assert.match(staff,/result\.removed_rejected/);
});
test('Rejected request releases reserved points, but never creates a fake point credit',()=>{
 assert.match(migration,/Pending requests reserve points but never create point-deduction ledger entries/);
 assert.match(migration,/DELETE FROM vasra\.kk_redemptions WHERE perk_id=reward_id AND status IN \('pending','rejected'\)/);
 assert.match(member,/rewards\.available_points\?\?rewards\.balance/);
 const original=read('supabase/migrations/20261026142000_kk_rewards_catalog_stock_attendance.sql');
 assert.match(original,/status='pending'/);
 assert.match(original,/INSERT INTO vasra\.kk_points\(member_id,delta,reason,staff_id,redemption_id\)/);
 assert.match(original,/VALUES\(claim\.member_id,-claim\.cost/);
});
test('Dropdowns share clear SVG chevrons across SK pages, camera text centered',()=>{
 assert.match(account,/\.\/sk-select-controls\.css/);
 assert.match(css,/select:not\(\[multiple\]\):not\(\[size\]\)/);
 assert.match(css,/appearance:none!important/);
 assert.match(css,/background-position:right 13px center/);
 assert.match(css,/#kk-quick-start/);
 assert.match(css,/justify-content:center!important/);
 assert.match(css,/\[data-theme="dark"\]/);
});
test('Changed JS parses',()=>{
 for(const p of ['dist/kk-rewards-staff.js','dist/kk-dashboard.js'])
   assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
