'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const config=JSON.parse(read('vercel.json'));
const admin=read('dist/admin-dashboard.css'),account=read('dist/account.html');
const handler=read('lib/handler.cjs'),event=read('dist/kk-event-staff.js');
const sql=read('supabase/migrations/20261027103000_completed_event_latest_attendance_first.sql');
test('public pages use clean routes and legacy .html redirects',()=>{
 for(const page of ['projects','achievements']){
  assert(config.rewrites.some(x=>x.source==='/'+page&&x.destination==='/'+page+'.html'));
  assert(config.redirects.some(x=>x.source==='/'+page+'.html'&&x.destination==='/'+page&&x.permanent));
 }
 for(const name of ['index','projects','duty','youth-leaders','achievements','contacts','transparency','sk-resolutions']){
  const page=read('dist/'+name+'.html');
  assert(!/href="\.\/(projects|achievements)\.html"/.test(page),name);
 }
});
test('Cancel and Save Progress are visually equal centered actions',()=>{
 assert.match(admin,/#progress-dialog \.progress-dialog-actions>button/);
 assert.match(admin,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(admin,/width:100%;height:44px;min-height:44px/);
 assert.match(admin,/justify-content:center/);
 assert.match(account,/id="progress-cancel"/);
 assert.match(account,/id="progress-save"/);
});
test('every existing Excel export has month-first Philippine dates',()=>{
 const {dateMMDDYYYY,workbook}=require('../lib/kk-export.cjs');
 assert.equal(dateMMDDYYYY('2026-10-27'),'10/27/2026');
 assert.equal(dateMMDDYYYY('2026-02-03'),'02/03/2026');
 assert.equal(dateMMDDYYYY('2026-02-30'),'');
 assert.equal(dateMMDDYYYY(new Date('2026-10-26T16:30:00Z')),'10/27/2026');
 assert.match(handler,/datePht=\{format:KKExport\.dateMMDDYYYY\}/);
 assert.match(handler,/get\('month'\)\+'\/'\+get\('day'\)\+'\/'\+get\('year'\)/);
 assert.match(handler,/KKExport\.dateMMDDYYYY\(m\.birthdate\)/);
 for(const filename of ['SK-Vasra-Event-Attendance.xlsx','SK-Vasra-Service-History-All.xlsx','SK-Vasra-Verified-KK.xlsx'])
  assert(handler.includes(filename));
 const bytes=workbook([['Date (PHT)'],['10/27/2026']]);
 assert(bytes.subarray(0,2).equals(Buffer.from('PK')));
});
test('completed events sort by most recent actual check-in, not project creation',()=>{
 assert.match(sql,/last_checkin_at/);
 assert.match(sql,/max\(a\.confirmed_at\)/);
 assert.match(sql,/ORDER BY ev\.last_checkin_at DESC/);
 assert.match(sql,/EXISTS\(SELECT 1 FROM vasra\.kk_project_attendance/);
 assert.match(sql,/p\.status='Natapos'/);
 assert.match(event,/Date\.parse\(p\.last_checkin_at\|\|p\.created_at/);
 assert.match(handler,/Array\.isArray\(data\.finished_events\)/);
 assert.match(event,/data-event-export/);
});
test('public duty card only uses Open and Closed with actual duty hours',()=>{
 const home=read('dist/home-landing.js');
 assert.match(home,/isHours&&!closed\?'Open':'Closed'/);
 assert.match(home,/Oras ng duty:/);
 assert.doesNotMatch(home,/'Bukas'|'Sarado'/);
});
test('changed scripts parse',()=>{
 for(const name of ['lib/handler.cjs','lib/kk-export.cjs','dist/home-landing.js','dist/kk-event-staff.js'])
  assert.doesNotThrow(()=>new vm.Script(read(name),{filename:name}));
});
