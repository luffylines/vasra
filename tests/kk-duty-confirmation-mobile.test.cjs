'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('Youth portal branding says Sangguniang Kabataan Vasra, staff auth remains unchanged',()=>{
 for(const file of ['kk-register.html','kk-login.html','kk-profile.html']){
  const html=read('dist/'+file);
  assert.match(html,/Sangguniang Kabataan Vasra|SANGGUNIANG KABATAAN VASRA/);
  assert.doesNotMatch(html,/Katipunan ng Kabataan|KATIPUNAN NG KABATAAN/);
 }
 const staff=read('dist/account.html');
 assert.match(staff,/Official staff workspace/);
 assert.match(staff,/id="auth-form"/);
});
test('KK Philippine phone prefix +63 9 is immutable with exactly nine editable digits',()=>{
 const reg=read('dist/kk-register.html'),css=read('dist/kk.css'),js=read('dist/kk.js');
 assert.match(reg,/class="kk-ph-prefix"[^>]*>\+63 9<\/span>/);
 assert.match(reg,/name="phone"[^>]*pattern="\[0-9\]\{9\}"/);
 assert.match(reg,/name="phone"[^>]*maxlength="9"/);
 assert.match(reg,/inputmode="numeric"/);
 assert.match(js,/const kkMobileTail=value=>/);
 assert.match(js,/return digits\.slice\(0,9\)/);
 assert.match(js,/const kkPhilippineMobile=value=>'\+639'\+kkMobileTail\(value\)/);
 assert.match(js,/phone:kkPhilippineMobile\(f\.phone\)/);
 assert.match(js,/identity\.phone=kkPhilippineMobile\(identity\.phone\)/);
 assert.match(js,/name==='phone'/);
 assert.match(css,/\.kk-form \.kk-ph-prefix/);
 assert.match(css,/\.kk-ph-number input\[name="phone"\]/);
 assert.match(read('lib/handler.cjs'),/!\/\^\(\?:\\\+63\|0\)9\\d\{9\}\$\/\.test\(phone\)/);
});
test('Duty assignment requests confirmation and cancels before any save',()=>{
 const duty=read('dist/duty-management.js');
 assert.match(duty,/function dutyManageConfirm\(/);
 assert.match(duty,/await dutyManageConfirm\('Confirm duty day assignment'/);
 assert.match(duty,/if\(!confirmed\)\{dutyManageRestoreDay\(before\);return;\}/);
 assert.match(duty,/await dutyManageSave\(\{duty_day:proposed\|\|null\},input\)/);
 assert.match(duty,/dutyManageRestoreDay\(before\)/);
 assert.doesNotMatch(duty,/const officer=dutyManageOfficer\(\),before=officer\?\.duty_days\?\.\[0\]\|\|0;\s*try\{await dutyManageSave/);
});
test('Photo upload and removal require explicit confirmation; cancel skips upload',()=>{
 const duty=read('dist/duty-management.js');
 const change=duty.slice(duty.indexOf("$('#duty-photo-file').addEventListener('change'"),duty.indexOf("$('#duty-photo-remove').addEventListener"));
 const remove=duty.slice(duty.indexOf("$('#duty-photo-remove').addEventListener"),duty.indexOf("$('#duty-manage-week').addEventListener"));
 assert.match(change,/duty-manager-pending/);
 assert.match(change,/PREVIEW · NOT SAVED/);
 assert.ok(change.indexOf("await dutyManageConfirm(")<change.indexOf("await uploadProjectPhoto(file,"));
 assert.match(change,/if\(!confirmed\|\|dutyManageOfficer\(\)\?\.id!==selectedId\)return/);
 assert.match(remove,/await dutyManageConfirm\('Remove SK Duty photo'/);
 assert.ok(remove.indexOf("if(!confirmed)return")<remove.indexOf("await dutyManageSave("));
 assert.match(read('dist/account.html'),/id="duty-save-confirm"/);
});
test('Public duty portraits retain published duty photo ID and reflect confirmed assignment',()=>{
 const publicDuty=read('dist/duty.js'),staff=read('dist/duty-management.js');
 assert.match(publicDuty,/p\.duty_photo_id\?'<img class="duty-photo-primary" src="\.\/api\/images\//);
 assert.match(publicDuty,/p\.duty_days\.includes\(index\+1\)/);
 assert.match(staff,/duty_photo_id:uploadedId/);
 assert.match(staff,/officer\.duty_days=payload\.duty_day\?\[payload\.duty_day\]:\[\]/);
 assert.match(read('dist/staff-duty-ui.css'),/\.duty-save-confirm::backdrop/);
 assert.match(read('dist/staff-duty-ui.css'),/@media\(max-width:390px\)/);
});
test('New JavaScript is syntactically valid',()=>{
 for(const p of ['dist/duty-management.js','dist/kk.js'])assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
