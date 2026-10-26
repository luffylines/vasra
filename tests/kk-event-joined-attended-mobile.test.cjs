'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('dist/kk-dashboard.js'),sql=read('supabase/migrations/20261026190000_kk_dashboard_confirmed_event_attendance.sql');
const css=read('dist/kk-dashboard.css'),srv=read('dist/kk-services.css'),modal=read('dist/kk-qr-scan.css'),quick=read('dist/kk-quick-scan.js');
test('Join is registration only; dashboard separately returns confirmed officer attendance',()=>{
 assert.match(sql,/'joined',\s*exists\(select 1 from vasra\.kk_project_participation/);
 assert.match(sql,/'attended',exists\(select 1 from vasra\.kk_project_attendance/);
 assert.match(sql,/'attendance_points',coalesce/);
 assert.match(sql,/where att\.project_id=pj\.id and att\.member_id=m\.id/);
 assert.match(sql,/reason','already_attended'/);
 const joinBlock=sql.slice(sql.indexOf("if action='project_join' then"),sql.indexOf("if action='password_change' then"));
 assert.doesNotMatch(joinBlock,/insert into vasra\.kk_points\(member_id,delta/);
});
test('Upcoming event never offers Request to Join to registered or attended members',()=>{
 assert.match(js,/const attended=p\.attended===true,registered=p\.joined===true/);
 assert.match(js,/Attended · \+/);
 assert.match(js,/Registered · Awaiting SK Attendance Check-in/);
 assert.match(js,/Request to Join/);
 assert.match(js,/if\(which==='projects'\)\{refreshProjects\(\);refreshParticipation\(\);\}/);
 assert.match(js,/const ids=new Set\(list\.map\(a=>String\(a\.project_id\|\|''\)\)\)/);
});
test('Phone and desktop request cards have no forced empty height or auto-pushed actions',()=>{
 assert.match(srv,/height:auto!important;min-height:0!important/);
 assert.match(srv,/\.kk-service-card-actions\{padding-top:3px!important\}/);
 assert.match(srv,/align-items:start!important;align-content:start/);
 for(const px of ['1024','760','480','360'])assert.ok(srv.includes('@media(max-width:'+px+'px)'),px);
});
test('Responsive camera uses default-device fallback and supports narrow phones',()=>{
 assert.match(quick,/getUserMedia\(\{video:true,audio:false\}\)/);
 assert.match(quick,/NotFoundError/);
 assert.match(quick,/manual KK ID/);
 for(const px of ['480','350'])assert.ok(modal.includes('@media(max-width:'+px+'px)'),px);
 assert.match(modal,/max-height:min\(92dvh,840px\)/);
 assert.match(modal,/overflow-y:auto/);
});
test('Mobile event card prevents iPhone input zoom and clipped content',()=>{
 assert.match(css,/\.kk-project-registered,\.kk-project-attended/);
 assert.match(css,/\.kk-dashboard-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/font-size:16px;max-width:100%/);
 assert.match(read('dist/kk-dashboard.html'),/attendance-mobile-v4/);
 assert.match(read('dist/account.html'),/content-height-mobile-v4/);
});
test('Updated dashboard and camera scripts compile',()=>{
 for(const file of ['dist/kk-dashboard.js','dist/kk-quick-scan.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
