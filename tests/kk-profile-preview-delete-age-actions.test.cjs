'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const staff=read('dist/kk-staff.js'),account=read('dist/account.js'),css=read('dist/kk-staff.css'),
handler=read('lib/handler.cjs'),db=read('lib/supabase.cjs'),
sql=read('supabase/migrations/20261025081500_kk_chairman_confirmed_profile_delete.sql');
test('Age uses the actual Manila calendar day, not just current year',()=>{
 const begin=staff.indexOf(' const memberAge='),end=staff.indexOf(' const nameWithAge=',begin);
 assert.ok(begin>0&&end>begin,'Missing date-aware memberAge');
 const source=staff.slice(begin,end);
 const Clock=class extends Date {constructor(...args){super(...(args.length?args:['2026-10-25T03:30:00Z']));}};
 const calculate=birthdate=>vm.runInNewContext(source+';memberAge('+JSON.stringify(birthdate)+')',{Date:Clock,Intl});
 assert.equal(calculate('2004-06-28'),22);
 assert.equal(calculate('2004-12-28'),21);
 assert.equal(calculate('2004-10-25'),22);
 assert.equal(calculate('2004-10-26'),21);
 assert.equal(calculate('2004-02-29'),22);
 assert.equal(calculate('2004-02-30'),null);
 assert.equal(calculate('2027-01-01'),null);
 assert.match(staff,/const full=nameWithAge\(m\)/);
 assert.match(staff,/const p=m\.profile\|\|\{\},full=nameWithAge\(m\)/);
 assert.match(staff,/\['Full Name',initials\(m\)\]/);
});
test('All five KK child editors use equal-size, aligned Cancel and Save buttons',()=>{
 assert.match(css,/#panel-kk-profiling \.kk-child-edit-form \.kk-edit-actions\{/);
 assert.match(css,/grid-template-columns:repeat\(2,140px\)!important/);
 assert.match(css,/align-items:stretch!important/);
 assert.match(css,/height:46px!important/);
 assert.match(css,/@media\(max-width:690px\)/);
 assert.match(staff,/const editSchema=\{/);
 assert.match(staff,/data-cancel-edit/);
});
test('Documents show full private image or PDF inline, separate from optional download',()=>{
 assert.match(handler,/staffDocumentMatch=path\.match/);
 assert.match(handler,/\/preview\)\?/);
 assert.match(handler,/Content-Disposition.*inline/);
 assert.match(handler,/inline\?'SAMEORIGIN':'DENY'/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
 assert.match(staff,/class="kk-document-inline-viewer"/);
 assert.match(staff,/Full size uploaded Valid ID PDF/);
 assert.match(staff,/class="kk-validid-full-image"/);
 assert.match(staff,/m\.document\.mime==='application\/pdf'/);
 assert.match(staff,/Open Full View/);
 assert.match(staff,/Download File/);
 assert.match(staff,/Protected thumbnail of uploaded Valid ID/);
 assert.match(css,/\.kk-document-inline-viewer :is\(img,iframe\)/);
 assert.match(css,/height:min\(64vh,700px\)/);
});
test('Chairman or authenticated SK officer can delete only after copied unique code and exact name',()=>{
 const modal=read('dist/account.html');
 const latestSql=read('supabase/migrations/20261025192000_kk_officer_confirmed_duplicate_delete.sql');
 assert.match(account,/window\.kkStaffRole=user\?\.role\|\|null/);
 assert.match(staff,/\['chairman','sk'\]\.includes\(window\.kkStaffRole\)/);
 assert.match(staff,/data-delete-profile/);
 for(const control of ['kk-delete-dialog','kk-delete-copy','kk-delete-confirm-code','kk-delete-confirm-name','kk-delete-acknowledge'])
  assert.ok(modal.includes('id="'+control+'"'),control);
 assert.match(staff,/$('#kk-delete-challenge')/);
 assert.match(staff,/clipboard\.writeText/);
 assert.match(staff,/window\.kkStaffRole/);
 assert.match(staff,/confirm\('Final confirmation:/);
 assert.match(handler,/if\(path==='\/api\/kk\/staff\/profile-delete'&&method==='POST'\)\{/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
 assert.match(handler,/await limit\('kk-profile-delete-ip'/);
 assert.match(handler,/confirm_code:challenge/);
 assert.match(db,/vasra_kk_profile_delete/);
 assert.match(latestSql,/u\.role IN \('sk','chairman'\)/);
 assert.match(latestSql,/IF provided IS DISTINCT FROM full_name/);
 assert.match(latestSql,/DELETE KK /);
 assert.match(latestSql,/FOR UPDATE/);
 assert.match(latestSql,/DELETE FROM vasra\.kk_members WHERE id=target_id/);
 assert.match(latestSql,/kk_profile_deleted/);
 assert.match(latestSql,/REVOKE ALL ON FUNCTION .*FROM PUBLIC,anon,authenticated/);
 assert.match(latestSql,/GRANT EXECUTE ON FUNCTION .* TO service_role/);
});
test('Deletion does not leak private Storage path, attempts cleanup and keeps logging',()=>{
 assert.match(db,/async deletePrivate\(path\)/);
 assert.match(db,/\/storage\/v1\/object\/vasra-kk-identity\//);
 assert.match(handler,/await db\.deletePrivate\(result\.storage_path\)/);
 assert.match(handler,/return json\(\{ok:result\?\.ok===true,storage_cleanup_pending\}\)/);
 assert.match(staff,/Duplicate KK profile deleted with audit trail/);
 assert.match(sql,/had_private_id/);
 assert.match(sql,/jsonb_build_object\('ok',true,'deleted_id',target_id,'storage_path',private_file\)/);
});
test('All altered source JS files parse, service code unaffected',()=>{
 for(const f of ['dist/kk-staff.js','dist/account.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(f),{filename:f}));
 assert.match(read('dist/account.html'),/id="panel-kk-services"/);
});
