'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const sql=read('supabase/migrations/20261025050000_kk_services.sql');
const handler=read('lib/handler.cjs');
const backend=read('lib/supabase.cjs');
const youth=read('dist/kk-dashboard.html');
const staff=read('dist/account.html');
test('Verified KK members can request printing, computer time and RetaBox but not self-approve',()=>{
 assert.match(youth,/data-tab="printing"/);
 assert.match(youth,/data-tab="computer"/);
 assert.match(youth,/data-tab="retabox"/);
 for(const x of ['kk-print-form','kk-computer-form','kk-retabox-form'])
  assert.ok(youth.includes('id="'+x+'"'),x);
 assert.match(sql,/if action='request' then/);
 assert.match(sql,/youth_verified is distinct from true/);
 assert.match(sql,/if action='review' then/);
 assert.match(sql,/if staff_id is null then return jsonb_build_object\('error',403\)/);
 assert.match(sql,/item.status<>'pending'/);
 assert.match(sql,/status in \('pending','approved','rejected'\)/);
 assert.match(backend,/vasra_kk_services/);
});
test('Printing and computer requests have strictly bounded parameters',()=>{
 for(const key of ["'short','long'","'bw','colored'","'copies'","'pages'","'hours'"])
  assert.ok(sql.includes(key),key);
 assert.match(sql,/not between 1 and 100/);
 assert.match(sql,/not between 1 and 8/);
 assert.match(youth,/name="paper_size"/);
 assert.match(youth,/name="color"/);
 assert.match(youth,/name="pages"/);
 assert.match(youth,/name="copies"/);
 assert.match(youth,/name="hours"/);
});
test('Retabox points are staff-only, based on verified grams and credited once',()=>{
 assert.match(sql,/staff_role is distinct from 'chairman'/);
 assert.match(sql,/retabox_points_per_kg integer not null default 0/);
 assert.match(sql,/if item.service_type='retabox' and payload->>'status'='approved'/);
 assert.match(sql,/awarded=floor\(grams::numeric\*settings_rate\/1000\)::integer/);
 assert.match(sql,/unique index if not exists kk_points_service_once_idx/);
 assert.match(sql,/for update/);
 assert.match(sql,/service_request_id/);
 assert.match(sql,/enable row level security/);
 const grants=read('supabase/migrations/20261025051000_kk_services_backend_grants.sql');
 assert.match(grants,/grant select,insert,update on vasra\.kk_service_requests to service_role/);
 assert.match(grants,/grant select,insert,update on vasra\.kk_service_settings to service_role/);
 assert.doesNotMatch(grants,/grant .* to anon|grant .* to authenticated/i);

 assert.match(sql,/revoke all on vasra.kk_service_requests from public,anon,authenticated/);
 assert.doesNotMatch(sql,/\bdrop table\b|\btruncate\b|\bdelete from vasra.kk_points\b/i);
});
test('All SK Officers can review, only chairman can configure points',()=>{
 assert.match(staff,/data-tab="kk-services"/);
 assert.match(staff,/id="panel-kk-services"/);
 assert.match(staff,/id="kk-service-rate-form" class="chair-only" hidden/);
 assert.match(handler,/if\(path==='\/api\/kk\/staff\/services\/review'&&method==='POST'\)/);
 assert.match(handler,/if\(path==='\/api\/kk\/staff\/services\/config'&&method==='POST'\)/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
 assert.match(handler,/await user\(\['chairman'\]\)/);
 assert.match(read('dist/account.js'),/'kk-profiling','kk-services'/);
});
test('Moon/sun icon is a single accessible SVG; layout responsive',()=>{
 const js=read('dist/theme.js');
 assert.match(js,/b.innerHTML=dark\?icon:moon/);
 assert.match(read('dist/theme.css'),/svg:first-child\{display:block!important\}/);
 assert.match(read('dist/kk-services.css'),/@media\(max-width:660px\)/);
 assert.match(read('dist/kk-service-staff.css'),/@media\(max-width:650px\)/);
 assert.match(read('dist/sw.js'),/vasra-v62-kk-services-20261025/);
 for(const file of ['dist/theme.js','dist/kk-services.js','dist/kk-service-staff.js','dist/kk-dashboard.js','dist/account.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
