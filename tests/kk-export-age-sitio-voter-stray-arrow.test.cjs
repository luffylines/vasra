'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),handler=read('lib/handler.cjs'),css=read('dist/admin-dashboard.css'),
  staff=read('dist/account.js'),duty=read('dist/duty.js'),dutyHtml=read('dist/duty.html');
test('Verified KK export fixes requested columns, province, sitio names and Yes/No responses',()=>{
 const block=handler.slice(handler.indexOf("if(path==='/api/kk/staff/export'"),handler.indexOf("if(path==='/api/kk/staff/review'"));
 assert.ok(block.includes("kkRpc('staff_export',{},true)"));
 assert.ok(block.includes("kkRpc('sitio_list',{},true)"));
 assert.ok(block.includes('sitioNames.get(String(p.sitio_id'));
 for(const label of ['Last Name','Age','Birthdate','Sitio / Purok','Registered SK Voter?','Registered National Voter?',
    'Voted Last Election?','Attended KK Assembly?']) assert.ok(block.includes("'"+label+"'"),label);
 assert.ok(block.indexOf("'Last Name','Age','Birthdate'")!==-1,'Age must immediately follow Last Name');
 assert.doesNotMatch(block,/['"]Sitio \/ Purok ID['"]|['"]Current NCR City['"]|['"]Current NCR Barangay['"]/);
 assert.ok(block.includes('validProvince(p.residence_province)||validProvince(p.province)'));
 assert.ok(block.includes('p.residence_city||p.city'));
 assert.ok(block.includes('p.residence_barangay||p.barangay'));
 for(const attr of ['sk_voter','national_voter','voted_last_election','kk_assembly'])assert.ok(block.includes('answer(p.'+attr+')'));
});
test('Age export computes correct birthday-based age on Philippine date rather than raw year',()=>{
 const start=handler.indexOf('const ageAtExport=date=>');
 const end=handler.indexOf('\n        };',start);
 assert.ok(start>0&&end>start);
 const arrow=handler.slice(start+'const ageAtExport='.length,end+10).replace(/;\s*$/,'');
 const create=new Function('todayYear','todayMonth','todayDay','return ('+arrow+');');
 const onOct26=create(2026,10,26),onJune27=create(2026,6,27);
 assert.equal(onOct26('2004-06-28'),22);
 assert.equal(onJune27('2004-06-28'),21);
 assert.equal(onOct26('2006-07-17'),20);
 assert.equal(onOct26('2003-03-18'),23);
 assert.equal(onOct26('invalid'),'');
 assert.match(handler,/timeZone:'Asia\/Manila'/);
});
test('Old KK ID Card Layout controls are removed without deleting printing guide',()=>{
 assert.doesNotMatch(html,/Card Layout|kk-id-logo-position|Left Position|Right Position/);
 assert.match(html,/ID Printing Guide/);
});
test('No stray gallery text chevrons on all SK pages; closed dialogs always hidden',()=>{
 assert.doesNotMatch(html,/id="staff-gallery-next"[^>]*>›<\/button>/);
 assert.doesNotMatch(html,/id="staff-gallery-prev"[^>]*>‹<\/button>/);
 assert.match(html,/id="staff-gallery-next"[^>]*><svg/);
 assert.match(html,/id="staff-gallery-prev"[^>]*><svg/);
 assert.match(css,/#staff-project-gallery:not\(\[open\]\)/);
 assert.match(css,/dialog:not\(\[open\]\)/);
 assert.match(css,/display:none!important;visibility:hidden!important/);
});
test('Staff and public duty show capitalized names while retaining stored values',()=>{
 assert.match(staff,/names\.map\(prettyDutyName\)\.join\(' · '\)/);
 assert.match(duty,/esc\(displayOfficerName\(name\)\)/);
 assert.match(dutyHtml,/duty\.js\?v=20261026-duty-name-case-v3/);
 for(const file of ['dist/account.js','dist/duty.js','lib/handler.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
