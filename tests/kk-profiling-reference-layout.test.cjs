'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),js=read('dist/kk-staff.js'),css=read('dist/kk-staff.css');
const panel=html.slice(html.indexOf('<section id="panel-kk-profiling"'),html.indexOf('<section id="panel-settings"'));
test('KK reference screen displays header controls above side-by-side applicants and selected details',()=>{
 assert.match(panel,/class="kk-staff-panel kk-reference-layout"/);
 assert.match(panel,/class="kk-profiling-topline"/);
 assert.match(panel,/KK Profiling<\/h2>/);
 for(const id of ['kk-staff-search','kk-staff-filter','kk-staff-refresh','kk-staff-list','kk-staff-detail','kk-applicant-count','kk-staff-order'])
  assert.ok(panel.includes('id="'+id+'"'),id);
 const app=panel.indexOf('class="kk-applications-layout"');
 assert.ok(panel.indexOf('id="kk-staff-stats"')>app,'Summary should not appear above applicant list');
 assert.ok(panel.indexOf('kk-sitio-section')>app,'Other management tools must follow the application review');
 assert.match(panel,/href="\.\/api\/kk\/staff\/export"/);
 assert.match(panel,/id="kk-sitio-list"/);
 assert.doesNotMatch(panel,/id="kk-staff-reward-list"|id="kk-participant-list"/);
 assert.match(html,/id="panel-kk-rewards"/);
});
test('Member details match reference sections without creating fake applicants or editable controls',()=>{
 for(const title of ['Personal Information','Address','Education','Additional Information','Emergency Contact','Uploaded Valid ID'])
  assert.ok(js.includes(title),title);
 for(const tab of ['Profile Details','Activity Log','Documents'])
  assert.ok(js.includes(tab),tab);
 for(const field of ['sk_voter','national_voter','voted_last_election','kk_assembly','emergency_phone','residence_city'])
  assert.ok(js.includes('p.'+field),field);
 assert.match(js,/aria-selected/);
 assert.match(js,/const yesNoRow=/);
 assert.match(js,/kk-choice/);
 assert.match(js,/data-view-id/);
 assert.match(js,/api\/kk\/staff\/id\//);
 assert.doesNotMatch(js,/fake24|sampleApplicants|mockResidents/);
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'kk-staff.js'}));
});
test('Existing security and review flows remain bound to authorized endpoints',()=>{
 assert.match(js,/request\('review',\{id:target\.dataset\.id,status:decision,note\}\)/);
 assert.match(js,/const \[result,sitioResult,catalog\]=await Promise\.all\(\[request\(''\),request\('sitios'\),request\('catalog'\)\]\)/);
 assert.match(js,/window\.loadKKStaff=refresh/);
 assert.match(js,/if\(!selectedMemberId&&showing\.length\)selectedMemberId=showing\[0\]\.id/);
 assert.match(js,/escVal\(m\.email\)/);
 const server=read('lib/handler.cjs');
 assert.match(server,/await user\(\['sk','chairman'\]\)/);
});
test('KK styling is scoped, responsive, and supports existing staff dark mode',()=>{
 assert.match(css,/#panel-kk-profiling\.kk-reference-layout/);
 assert.match(css,/#panel-kk-profiling \.kk-profiling-topline/);
 assert.match(css,/#panel-kk-profiling \.kk-applications-layout/);
 assert.match(css,/#panel-kk-profiling \.kk-child-grid/);
 assert.match(css,/#panel-kk-profiling \.kk-binary-row/);
 assert.match(css,/#panel-kk-profiling \.kk-document-summary/);
 assert.match(css,/@media\(max-width:690px\)/);
 assert.match(css,/body\.account-workspace\[data-theme="dark"\] #panel-kk-profiling/);
 assert.match(html,/id="theme-toggle"/);
 assert.match(html,/id="header-settings"/);
 assert.match(html,/id="logout"/);
});
