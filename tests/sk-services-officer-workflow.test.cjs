'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=file('dist/account.html'),staff=file('dist/kk-service-staff.js'),server=file('lib/handler.cjs'),
  account=file('dist/account.js'),css=file('dist/kk-services.css'),router=file('lib/supabase.cjs');
const sql=file('supabase/migrations/20261025090000_kk_service_staff_workflow_history.sql'),
  fdp=file('supabase/migrations/20261025090500_disclosure_officer_access.sql');

test('All officer workspaces expose KK Profiling, SK Services and Full Disclosure',()=>{
 for(const tab of ['kk-profiling','kk-services','disclosure'])assert.match(html,new RegExp('data-tab="'+tab+'"'));
 assert.doesNotMatch(html,/data-tab="disclosure" class="chair-only"/);
 assert.match(account,/\['roster','duty-manage','users','audit'\]\.includes\(name\)/);
 assert.doesNotMatch(account,/\['roster','duty-manage','users','audit','disclosure'\]/);
 assert.match(server,/if\(path==='\/api\/disclosure\/manage'&&method==='GET'\)\{\s*await user\(\['sk','chairman'\]\)/);
 assert.match(server,/if\(path==='\/api\/disclosure\/manage'&&method==='POST'\)\{\s*await user\(\['sk','chairman'\]\)/);
 assert.match(fdp,/u\.role in \('sk','chairman'\)/);
 assert.match(server,/if\(path==='\/api\/kk\/staff\/services'&&method==='GET'\)\{\s*await user\(\['sk','chairman'\]\)/);
 assert.match(server,/if\(path==='\/api\/kk\/staff\/services\/config'&&method==='POST'\)\{\s*await user\(\['chairman'\]\)/);
});
test('SK Services management includes stats, search, date, approvals and daily history',()=>{
 for(const id of ['kk-service-staff-refresh','kk-service-export','kk-service-search','kk-service-date-filter',
   'kk-service-stat-total','kk-service-stat-pending','kk-service-stat-approved','kk-service-stat-completed',
   'kk-service-stat-rejected','kk-service-admin-queue','kk-service-history-search','kk-service-history-body']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 for(const word of ['Today (PHT)','Custom date','Free Printing','Computer Use','RetaBox Donations','Completed'])
  assert.ok(html.includes(word),word);
 for(const fragment of ['approved_details','data-action="approve"','data-action="reject"','data-action="complete"',
    'name="pages"','name="copies"','name="hours"','name="paper_size"','name="verified_grams"',
    'Asia/Manila','period','kk-service-history-body','kk-service-export'])
  assert.ok(staff.includes(fragment),fragment);
 assert.match(css,/\.kk-service-stats article/);
 assert.match(css,/@media\(max-width:450px\)/);
 assert.match(css,/body\.account-workspace\[data-theme="dark"\]/);
});
test('Server checks and normalizes request edits before transactional approval',()=>{
 assert.match(server,/kkRpc\('service_workflow_review',data,true\)/);
 assert.match(server,/kkRpc\('service_workflow_complete'/);
 assert.match(server,/Number\.isInteger\(pages\)/);
 assert.match(server,/Number\.isInteger\(hours\)/);
 assert.match(server,/kk-service-review-ip/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/IF r\.status<>'pending'/);
 assert.match(sql,/IF r\.status<>'approved'/);
 assert.match(sql,/approved_details=changed/);
 assert.match(sql,/CHECK\(status IN \('pending','approved','rejected','completed'\)\)/);
 assert.match(sql,/kk_service_completed/);
 assert.match(sql,/kk_service_.*decision/);
 assert.match(sql,/kk_points\(member_id,delta,reason,staff_id,service_request_id\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.vasra_kk_service_workflow.* TO service_role/);
 assert.match(sql,/REVOKE ALL ON FUNCTION.*FROM PUBLIC,anon,authenticated/);
 assert.match(router,/vasra_kk_service_workflow/);
});
test('Excel download uses protected XLSX handler, never exposes private service rows publicly',()=>{
 assert.match(server,/if\(path==='\/api\/kk\/staff\/services\/export'&&method==='GET'\)\{\s*await user\(\['sk','chairman'\]\)/);
 assert.match(server,/KKExport\.workbook\(rows\)/);
 assert.match(server,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
 assert.match(server,/filename="SK-Vasra-Service-Requests\.xlsx"/);
 assert.match(server,/Cache-Control':'private, no-store'/);
 assert.match(server,/period!=='week'/);
 assert.match(staff,/kk\/staff\/services\/export/);
});
test('KK member request history shows officer-approved details',()=>{
 const member=file('dist/kk-services.js'),sqlMember=file('supabase/migrations/20261025091000_kk_member_service_approved_details.sql');
 assert.match(member,/record\.effective_details\|\|record\.details/);
 assert.match(sqlMember,/'effective_details',coalesce\(r\.approved_details,r\.details\)/);
 assert.match(sqlMember,/REVOKE EXECUTE ON FUNCTION public\.vasra_kk_services/);
});
test('Modified JavaScript remains parseable and does not leak record data to public homepage',()=>{
 for(const p of ['dist/account.js','dist/kk-service-staff.js','dist/kk-services.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(file(p),{filename:p}));
 assert.doesNotMatch(file('dist/index.html'),/kk-service-history-body/);
});
