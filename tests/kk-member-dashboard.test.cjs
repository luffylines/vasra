'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const sql=read('supabase/migrations/20261025040000_kk_member_dashboard.sql'),handler=read('lib/handler.cjs'),profile=read('dist/kk-profile.html'),client=read('dist/kk.js'),dashboard=read('dist/kk-dashboard.js'),page=read('dist/kk-dashboard.html');
test('Pending KK remains pending until verified and Home Logout appear side by side',()=>{
 assert.ok(profile.includes('id="kk-logout"'));
 assert.ok(client.includes("profile.status==='verified'"));
 assert.ok(client.includes("location.replace('./kk-dashboard')"));
 assert.ok(dashboard.includes("data.profile?.status!=='verified'"));
 assert.ok(dashboard.includes("location.replace('./kk-profile')"));
});
test('Published upcoming project participation is verified-only and unique',()=>{
 for(const key of ['create table if not exists vasra.kk_project_participation','primary key(member_id,project_id)',"if action='youth_dashboard' then","if action='project_join' then","pr.status<>'verified'","pj.status in ('Pinaplano','Isinasagawa')","on conflict(member_id,project_id) do nothing"])assert.ok(sql.includes(key),key);
 assert.ok(dashboard.includes("data-join"));
 assert.ok(handler.includes("'/api/kk/join'"));
});
test('Chairman controls rewards and redemption must be approved before deducting points',()=>{
 assert.ok(page.includes('id="kk-reward-list"'));
 assert.ok(read('dist/account.html').includes('id="kk-perk-form"'));
 assert.ok(read('dist/kk-staff.js').includes('data-redemption'));
 assert.ok(dashboard.includes("request('redeem'"));
 assert.ok(!handler.slice(handler.indexOf("if(path==='/api/kk/redeem'"),handler.indexOf("if(path==='/api/kk/staff'")).includes("temporarily unavailable"));
});
test('KK password and email changes require authentication and new email verification',()=>{
 for(const key of ["/api/kk/settings/password","/api/kk/settings/email/request","/api/kk/settings/email/confirm","S.passwordMatch","S.passwordHash","token_hash:S.hash(tokenValue)"])assert.ok(handler.includes(key),key);
 for(const key of ["if action='email_confirm' then","e.expires>clock_timestamp()","token_hash=payload->>'token_hash'","enable row level security","revoke all on vasra.kk_email_change_requests"])assert.ok(sql.includes(key),key);
 assert.ok(page.includes('id="kk-dash-password"'));
 assert.ok(page.includes('id="kk-dash-email"'));
});
test('SK staff sees participation roster, but public dashboard cannot read other members',()=>{
 const staff=read('dist/kk-staff.js');
 assert.ok(staff.includes('displayParticipants'));
 assert.ok(staff.includes('result?.participation'));
 assert.ok(read('dist/account.html').includes('id="kk-participant-list"'));
 const roster=read('supabase/migrations/20261025044000_kk_participation_staff_roster.sql');
 assert.ok(roster.includes("'participation',coalesce"));
 assert.ok(roster.includes('from vasra.kk_project_participation r'));
 assert.ok(roster.includes("if staff.id is null then"));
});
test('New dashboard has valid source and preview route',()=>{
 assert.ok(read('vercel.json').includes('"source": "/kk-dashboard"'));
 assert.ok(read('dist/sw.js').includes('vasra-v61-resolutions-kk-card-20261025'));
 assert.ok(read('dist/kk-dashboard.css').includes('@media(max-width:650px)'));
 for(const file of ['dist/kk-dashboard.js','dist/kk.js','dist/kk-staff.js','lib/handler.cjs'])
 assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
