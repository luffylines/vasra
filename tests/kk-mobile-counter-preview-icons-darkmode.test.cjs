'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..','dist',file),'utf8');
const js=read('kk.js'),style=read('kk.css'),theme=read('theme.css'),shell=read('shell.js'),duty=read('duty.js');
test('Mobile family and sibling +/- prevent only double tap zoom; viewport pinch zoom remains available',()=>{
 assert.match(style,/\.kk-step-one \.kk-count-field button\{\s*touch-action:manipulation/);
 assert.match(style,/-webkit-user-select:none/);
 assert.match(js,/addEventListener\('dblclick',event=>\{/);
 assert.match(js,/closest\('button\[data-adjust\]'\)\)event\.preventDefault\(\)/);
 assert.match(js,/numberInput\.value=String\(next\)/);
 assert.doesNotMatch(read('kk-profile.html'),/user-scalable=no|maximum-scale=1/);
});
test('Preview maps canonical database enums to human readable original option labels',()=>{
 const start=js.indexOf(' const displayProfileValue='),end=js.indexOf(' const previewSection=',start);
 assert.ok(start>=0&&end>start);
 const src=js.slice(start,end);
 const options={
  civil:[['single','Single'],['married','Married']],
  gender:[['male','Male'],['female','Female']],
  edu:[['no-formal','No Formal Schooling'],['college','College / Undergraduate']],
  educationStatus:[['osy','Out of School Youth (OSY)']],
  employment:[['employed','Employed']],religion:['Roman Catholic']
 };
 const format=new Function('options',src+'return displayProfileValue;')(options);
 assert.equal(format('civil_status','single'),'Single');
 assert.equal(format('gender','male'),'Male');
 assert.equal(format('sk_voter','yes'),'Yes');
 assert.equal(format('national_voter','no'),'No');
 assert.equal(format('education','college'),'College / Undergraduate');
 assert.equal(format('education_status','osy'),'Out of School Youth (OSY)');
 assert.equal(format('education','no-formal'),'No Formal Schooling');
 assert.equal(format('email','lowercase@example.com'),'lowercase@example.com');
 for(const part of ["displayProfileValue('gender',data.gender)","displayProfileValue('civil_status',data.civil_status)","displayProfileValue('sk_voter',data.sk_voter)","displayProfileValue('education',data.education)"])
  assert.ok(js.includes(part),part);
 assert.match(js,/if\(event\.target\.matches\('select,input\[type="radio"\]'\)\)savedFields/);
 assert.match(js,/data\[numberInput\.name\]=String\(next\);renderPreview\(\)/);
});
test('Pending KK logout and public mobile logout use SVG icon, duty links no Unicode arrow',()=>{
 const pending=read('kk-profile.html'),member=read('kk-dashboard.html');
 assert.doesNotMatch(pending,/Logout ↗/);
 assert.match(pending,/aria-label="Logout of KK account"[^>]*>\s*<svg/);
 assert.match(shell,/const logoutIcon='<svg/);
 assert.match(shell,/phoneLogout\.innerHTML=logoutIcon/);
 assert.match(member,/id="kk-dashboard-logout"[^>]*>\s*<svg/);
 assert.match(duty,/duty-contact-link-icon/);
 assert.doesNotMatch(duty,/Facebook profile \/ page ↗/);
 assert.match(read('officer-contacts.css'),/\.duty-contact-link-icon/);
});
test('Dark profile separators harmonize and refreshed assets load on KK and public pages',()=>{
 assert.match(theme,/html\[data-theme="dark"\] body\.kk-body \.kk-profile-preview\{/);
 assert.match(theme,/\.kk-count-field button:last-child/);
 assert.match(theme,/\.kk-profile-sheet-head/);
 for(const file of ['kk-login.html','kk-register.html','kk-profile.html','kk-dashboard.html']){
  const markup=read(file);
  assert.match(markup,/\.\/theme\.css\?v=20261026-kk-mobile-profile-v8/);
  assert.match(markup,new RegExp('\\.\\/kk\\.css\\?v='+
   (file==='kk-login.html'?'20261026-login-options-aligned-v2':'20261026-kk-mobile-profile-v8')));
 }
 for(const file of ['duty.html','index.html','contacts.html'])
  assert.match(read(file),/\.\/shell\.js\?v=20261026-kk-mobile-profile-v8/);
 for(const file of ['kk.js','shell.js','duty.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
