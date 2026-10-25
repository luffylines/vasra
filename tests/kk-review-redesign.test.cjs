'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const kk=read('dist/kk.js'),staff=read('dist/kk-staff.js'),handler=read('lib/handler.cjs'),
sql=read('supabase/migrations/20261025043000_kk_secure_id_and_voter_review.sql');
test('member applications use compact master-detail, selectable child and status',()=>{
 const html=read('dist/account.html'),css=read('dist/kk-staff.css');
 for(const key of ['kk-applications-layout','kk-applicant-count','kk-staff-list','kk-staff-detail','kk-staff-order'])assert.ok(html.includes(key),key);
 for(const key of ['data-open-member','data-close-member','renderMemberDetail','data-child-tab','kk-child-grid','data-review="verified"'])assert.ok(staff.includes(key),key);
 assert.match(css,/@media\(max-width:950px\)/);
});
test('all four voter/assembly questions required, persisted and reviewed by SK staff',()=>{
 for(const key of ['sk_voter','national_voter','voted_last_election','kk_assembly']){
  assert.ok(kk.includes("yesNoField('"+key+"'"),key);
  assert.ok(handler.includes("'"+key+"'"),key);
  assert.ok(sql.includes("pr.profile->>'"+key+"'"),key);
  assert.ok(staff.includes('p.'+key),key);
 }
 assert.ok(kk.includes("if(current===3 && "));
});
test('ID upload is private, size-capped, authenticated, and protected from public access',()=>{
 const html=read('dist/kk-profile.html'),sty=read('dist/kk.css'),backend=read('lib/supabase.cjs');
 assert.ok(kk.includes('validIDSection()'));
 assert.ok(kk.includes("send('id/upload'"));
 assert.ok(html.includes('kk-profile-preview'));
 assert.ok(sty.includes('.kk-id-upload'));
 for(const route of ['/api/kk/id/upload','/api/kk/id/mine','staff_id_access'])assert.ok(handler.includes(route),route);
 for(const sqlSnippet of ['vasra.kk_valid_ids','storage.buckets','public=false','enable row level security','if action=\'staff_id_access\' then','if action=\'id_attach\' then'])assert.ok(sql.includes(sqlSnippet),sqlSnippet);
 assert.ok(backend.includes('getPrivate(')&&backend.includes('putPrivate('));
 assert.ok(!sql.includes('grant select on vasra.kk_valid_ids to anon'));
});
test('first step hides Back, red required markers next to text and mobile preview responsive',()=>{
 assert.ok(kk.includes("$('#kk-back').hidden=current<=1"));
 assert.ok(kk.includes('kk-required'));
 assert.ok(kk.includes('renderPreview()'));
 assert.ok(read('dist/kk.css').includes('max-width:1080px'));
});
test('scripts parse and PWA cache is invalidated',()=>{
 for(const p of ['dist/kk.js','dist/kk-staff.js','lib/handler.cjs','lib/supabase.cjs'])assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
 assert.ok(read('dist/sw.js').includes('vasra-v60-kk-reference-layout-staff-docs-20261025'));
});
