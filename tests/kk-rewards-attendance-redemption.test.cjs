'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const h=read('dist/account.html'),js=read('dist/account.js'),staff=read('dist/kk-rewards-staff.js'),member=read('dist/kk-dashboard.js');
const sql=read('supabase/migrations/20261026142000_kk_rewards_catalog_stock_attendance.sql');
const backend=read('lib/handler.cjs'),router=read('lib/supabase.cjs'),css=read('dist/kk-rewards.css');

test('Dedicated KK Rewards page is separate from KK Profiling and old Project Participants removed',()=>{
 assert.match(h,/data-tab="kk-rewards"/);
 assert.match(h,/id="panel-kk-rewards"/);
 assert.match(h,/id="kk-reward-catalog"/);
 assert.match(h,/id="kk-rewards-claims"/);
 assert.match(h,/id="panel-kk-participants"/);
 assert.doesNotMatch(h,/id="kk-participant-list"|id="kk-participant-search"|id="kk-perk-form"/);
 assert.match(js,/'kk-profiling','kk-participants','kk-rewards','kk-ids'/);
 assert.match(js,/name==='kk-rewards'&&window\.loadKKRewardsStaff/);
 assert.match(css,/\.kk-rewards-catalog\{display:grid/);
 assert.match(css,/@media\(max-width:640px\)/);
});
test('Rewards have photo upload and inventory; member sees images and live available points',()=>{
 assert.match(h,/id="kk-reward-photo" accept="image\/jpeg,image\/png,image\/webp"/);
 assert.match(h,/name="quantity" type="number"/);
 assert.match(staff,/loadKKRewardsStaff=refresh/);
 assert.match(staff,/action:'save'/);
 assert.match(staff,/api\/kk\/staff\/rewards\/image/);
 assert.match(staff,/data-reward-publish/);
 assert.match(member,/api\/kk\/rewards\/image\//);
 assert.match(member,/Number\(perk\.available\|\|0\)>0/);
 assert.match(member,/refreshRewards=async/);
 assert.match(member,/request\('rewards'\)/);
 assert.match(backend,/path==='\/api\/kk\/rewards'&&method==='POST'/);
 assert.match(router,/\/rest\/v1\/rpc\/vasra_kk_rewards/);
});
test('Database reserves rewards and points once and records SK officers on approval',()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 0/);
 assert.match(sql,/quantity BETWEEN 0 AND 100000/);
 assert.match(sql,/SELECT \* INTO perk FROM vasra\.kk_perks WHERE id=item_id FOR UPDATE/);
 assert.match(sql,/status IN \('pending','approved'\)/);
 assert.match(sql,/points_balance-points_reserved<perk\.cost/);
 assert.match(sql,/points_balance<claim\.cost/);
 assert.match(sql,/INSERT INTO vasra\.kk_points\(member_id,delta,reason,staff_id,redemption_id\)/);
 assert.match(sql,/VALUES\(claim\.member_id,-claim\.cost/);
 assert.match(sql,/updated_by=officer\.id/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO service_role/);
 assert.match(sql,/reward_photo_and_stock_required/);
});
test('Attendance is a dedicated QR check-in and not a manual reward points field',()=>{
 const eventSQL=read('supabase/migrations/20261026153500_kk_event_qr_checkin_automatic_ten_points.sql');
 const camera=read('dist/kk-event-staff.js');
 assert.match(h,/id="kk-event-video"/);
 assert.match(h,/id="kk-event-manual-id"/);
 assert.match(h,/id="kk-event-archive"/);
 assert.doesNotMatch(h,/id="kk-attendance-points"|id="kk-attendance-award"/);
 assert.match(eventSQL,/VALUES\(project_ref,member.id,10,officer.id,clock_timestamp\(\)\)/);
 assert.match(eventSQL,/ON CONFLICT\(project_id,member_id\) DO NOTHING/);
 assert.match(camera,/data-event-export/);
});
test('Upcoming Projects refreshes live and includes published in-progress projects',()=>{
 const source=read('dist/kk-dashboard.js');
 assert.match(source,/if\(which==='projects'\)\{refreshProjects\(\);refreshParticipation\(\);\}/);
 assert.match(source,/projects=response\.projects\.filter\(p=>\['Pinaplano','Isinasagawa'\]\.includes\(p\.status\)\)/);
 assert.match(sql,/vasra\.projects/);
});
test('Updated scripts compile',()=>{
 for(const file of ['dist/kk-rewards-staff.js','dist/kk-dashboard.js','dist/account.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
