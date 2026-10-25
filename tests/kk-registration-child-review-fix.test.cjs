'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('dist/kk.js'),staff=read('dist/kk-staff.js'),css=read('dist/kk.css'),staffCSS=read('dist/kk-staff.css');
test('Register has no Step 1 scope variables and stays independent from Valid ID',()=>{
 const register=js.slice(js.indexOf("if(view==='register')"),js.indexOf("if(view!=='profile')"));
 assert.doesNotMatch(register,/\bcurrent===1\b|\bvalidID\?\.exists\b|\bidBusy\b/);
 assert.match(register,/await send\('register',data\)/);
 assert.match(register,/location\.replace\('\.\/kk-profile'\)/);
});
test('Step 1 requires uploaded Valid ID, with clear feedback before saving',()=>{
 const profile=js.slice(js.indexOf("if(view!=='profile')"));
 assert.match(profile,/addressFields\(\)\+validIDSection\(\)/);
 assert.match(profile,/if\(current===1&&!validID\?\.exists\)/);
 assert.match(profile,/Mag-upload muna ng Valid ID bago mag-Save & Next/);
 assert.match(profile,/send\('id\/upload',payload\)/);
 assert.match(profile,/accepted:|Accepted:/i);
 assert.match(profile,/idBusy/);
 assert.match(profile,/\$\('#kk-back'\)\.hidden=current<=1/);
 assert.match(profile,/yesNoField\('sk_voter'/);
 for(const name of ['national_voter','voted_last_election','kk_assembly'])assert.ok(profile.includes("yesNoField('"+name+"'"));
});
test('Master/detail applicant list remains compact with readable sections and authenticated ID viewing',()=>{
 assert.match(staff,/data-open-member/);
 for(const label of ['Personal Information','Address','Education','Additional Information','Emergency Contact','Uploaded Valid ID'])
   assert.ok(staff.includes(label),label);
 assert.match(staff,/\/api\/kk\/staff\/id\//);
 assert.match(staffCSS,/kk-applications-layout/);
 assert.match(staffCSS,/kk-applicant-main strong\{font-size:14px/);
 assert.match(staffCSS,/kk-child-pairs dd\{font-size:14px/);
 assert.match(css,/kk-label-title/);
 assert.match(css,/font-size:16px/);
});
test('Changes parse and PWA version is updated',()=>{
 new vm.Script(js,{filename:'dist/kk.js'});new vm.Script(staff,{filename:'dist/kk-staff.js'});
 assert.match(read('dist/sw.js'),/vasra-v62-kk-services-20261025/);
});
