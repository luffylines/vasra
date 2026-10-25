'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const staff=read('dist/kk-staff.js'),handler=read('lib/handler.cjs'),staffCSS=read('dist/kk-staff.css');
const profile=read('dist/kk-profile.html'),form=read('dist/kk.js'),visual=read('dist/kk-visual.css');
test('KK staff master/detail layout uses real applicants, opens initial applicant and keeps the directory available',()=>{
 assert.match(staff,/members=result\.members/);
 assert.match(staff,/selectedMemberId=showing\[0\]\.id/);
 assert.match(staff,/hasSelectedInitialMember/);
 assert.match(staff,/data-open-member/);
 assert.match(staff,/data-child-tab/);
 assert.match(staff,/const \[sitiosResult,catalogResult\]=await Promise\.allSettled/);
 assert.match(staffCSS,/grid-template-columns:minmax\(310px,39%\) minmax\(0,61%\)/);
 assert.match(staffCSS,/kk-child-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(staffCSS,/@media\(max-width:1050px\)/);
});
test('KK documents cannot block staff application listing, and remain staff-only',()=>{
 assert.match(handler,/let docData=\{documents:\[\]\}/);
 assert.match(handler,/try\{docData=await kkRpc\('staff_documents',\{\},true\);\}/);
 assert.match(handler,/catch\(err\)\{console\.warn\('KK documents temporarily unavailable'/);
 const migration=read('supabase/migrations/20261025060000_kk_staff_documents_guard.sql');
 assert.match(migration,/'staff_catalog','staff_documents','staff_id_access'/);
 assert.match(migration,/if staff\.id is null then return jsonb_build_object\('error',403\)/);
 assert.doesNotMatch(migration,/\bDELETE FROM vasra\.kk_members\b|\bTRUNCATE\b/);
});
test('Youth form matches approved sidebar, preview, required inputs and five steps',()=>{
 assert.match(profile,/kk-youth-shell/);
 assert.match(profile,/kk-youth-sidebar/);
 assert.match(profile,/kk-profile-preview/);
 assert.match(profile,/kk-visual\.css/);
 assert.match(profile,/id="kk-valid-id-file"|id="kk-step-fields"/);
 assert.match(form,/validIDSection\(\)/);
 for(const key of ['sk_voter','national_voter','voted_last_election','kk_assembly'])assert.match(form,new RegExp("yesNoField\\('"+key+"'"));
 assert.match(form,/renderPreview\(\)/);
 assert.match(form,/idBusy/);
 assert.match(form,/current<=1;.*hidden=current<=1/);
 assert.match(visual,/\.kk-profile-workspace\{display:grid/);
 assert.match(visual,/@media\(max-width:730px\)/);
 assert.match(read('dist/sw.js'),/vasra-v60-kk-reference-layout-staff-docs-20261025/);
 assert.match(read('dist/sw.js'),/\.\/kk-visual\.css/);
});
test('Changed client and handler JavaScript compiles',()=>{
 for(const file of ['dist/kk.js','dist/kk-staff.js','lib/handler.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
