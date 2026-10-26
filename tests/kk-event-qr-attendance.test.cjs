'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const html=read('dist/account.html'),memberPage=read('dist/kk-dashboard.html'),
 staff=read('dist/kk-event-staff.js'),server=read('lib/handler.cjs'),
 sql=read('supabase/migrations/20261026153500_kk_event_qr_checkin_automatic_ten_points.sql');
test('SK Participants is independent and offers scan, manual ID, roster and archived exports',()=>{
 for(const id of ['panel-kk-participants','kk-event-active-select','kk-event-video','kk-event-manual-form','kk-event-roster','kk-event-archive'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/data-tab="kk-participants"/);
 assert.match(read('dist/account.js'),/name==='kk-participants'&&window\.loadKKEventStaff/);
 assert.doesNotMatch(html,/id="kk-participant-list"|id="kk-attendance-points"|id="kk-attendance-award"/);
});
test('Only published Isinasagawa event and verified KK ID can check in',()=>{
 assert.match(sql,/p.status='Isinasagawa'/);
 assert.match(sql,/pr.status='verified'/);
 assert.match(sql,/selected_event.status<>'Isinasagawa'/);
 assert.match(sql,/selected_event.published IS DISTINCT FROM true/);
 assert.match(sql,/selected_event.publish_at>clock_timestamp\(\)/);
 assert.match(sql,/^.*normalized_kk_id !~ '\^VASRA-KK-\[0-9\]\{1,10\}\$'/m);
 assert.match(server,/path==='\/api\/kk\/staff\/events\/checkin'/);
 assert.match(server,/await user\(\['sk','chairman'\]\)/);
});
test('Checkin is atomic, worth exactly ten and deduplicated by project and member',()=>{
 assert.match(sql,/VALUES\(project_ref,member.id,10,officer.id,clock_timestamp\(\)\)/);
 assert.match(sql,/ON CONFLICT\(project_id,member_id\) DO NOTHING/);
 assert.match(sql,/IF recorded_at IS NULL THEN RETURN jsonb_build_object\('error',409,'reason','already_checked_in'\)/);
 assert.match(sql,/INSERT INTO vasra\.kk_points\(member_id,delta,reason,staff_id\)/);
 assert.match(sql,/VALUES\(member.id,10,'Event attendance:/);
 assert.match(sql,/kk_event_attendance'/);
 assert.match(server,/Use SK Event Attendance to scan an official KK ID and automatically award 10 points/);
});
test('Staff roster is event-scoped with server timestamp, separate completed history, Excel sheet',()=>{
 assert.match(sql,/WHERE a.project_id=project_ref/);
 assert.match(sql,/ORDER BY a.confirmed_at ASC/);
 assert.match(sql,/p.status='Natapos'/);
 assert.match(sql,/p.status='Isinasagawa'/);
 assert.match(staff,/events\.map\(e=>/);
 assert.match(staff,/finished\.map\(p=>/);
 assert.match(staff,/startCamera=async/);
 assert.match(staff,/BarcodeDetector/);
 assert.match(staff,/window\.jsQR/);
 assert.match(staff,/loadRoster\(id,seq\)/);
 assert.match(server,/path==='\/api\/kk\/staff\/events\/export'/);
 assert.match(server,/data\.event\?\.status!=='Natapos'/);
 for(const heading of ['Event Title','KK ID','Full Name','Date (PHT)','Time (PHT)','Points','Checked In By'])
  assert.ok(server.includes(heading),heading);
});
test('Member history is private and only own verified member receives event time and points',()=>{
 assert.match(sql,/s.token_hash=session_hash/);
 assert.match(sql,/WHERE a.member_id=member.id/);
 assert.match(memberPage,/id="kk-my-participation-history"/);
 assert.match(read('dist/kk-dashboard.js'),/request\('event-history'\)/);
 assert.match(server,/path==='\/api\/kk\/event-history'/);
 assert.match(read('lib/supabase.cjs'),/\/rest\/v1\/rpc\/vasra_kk_event_attendance/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.vasra_kk_event_attendance/);
});
test('New event scripts and affected API compile',()=>{
 for(const file of ['dist/kk-event-staff.js','dist/kk-rewards-staff.js','dist/kk-dashboard.js','dist/account.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
