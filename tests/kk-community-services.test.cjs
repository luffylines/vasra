'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const youth=read('dist/kk-dashboard.html'),staff=read('dist/account.html');
const youthClient=read('dist/kk-services.js'),staffClient=read('dist/kk-service-staff.js');
const backend=read('lib/handler.cjs'),router=read('lib/supabase.cjs');
const ddl=read('supabase/migrations/20261025064702_kk_services_print_computer_retabox_20261025.sql');
const grants=read('supabase/migrations/20261025064805_kk_services_backend_private_table_grants_20261025.sql');

test('Verified KK dashboard includes three working SK service forms',()=>{
 for(const tab of ['printing','computer','retabox']){
  assert.match(youth,new RegExp('data-tab="'+tab+'"'));
  assert.match(youth,new RegExp('data-section="'+tab+'"'));
  assert.match(youth,new RegExp('id="kk-'+tab+'-form"'));
  assert.match(youth,new RegExp('id="kk-'+tab+'-history"'));
 }
 for(const name of ['paper_size','color','copies','pages','hours','grams'])
  assert.match(youth,new RegExp('name="'+name+'"'));
 assert.match(youth,/src="\.\/kk-services\.js(?:\?v=[a-zA-Z0-9-]+)?"/);
 assert.match(youth,/href="\.\/kk-services\.css(?:\?v=[a-zA-Z0-9-]+)?"/);
 assert.match(read('dist/kk-dashboard.js'),/new Set\(\['overview','projects','activities','rewards','printing','computer','retabox','settings','kk-id'\]\)/);
 assert.match(youthClient,/api\('\.\/api\/kk\/services'/);
 assert.doesNotThrow(()=>new vm.Script(youthClient));
});

test('Every SK staff officer can review but rate configuration remains chairman-only',()=>{
 assert.match(staff,/data-tab="kk-services"/);
 assert.match(staff,/id="panel-kk-services"/);
 assert.match(staff,/src="\.\/kk-service-staff\.js\?v=20261025-toast5-v1"/);
 assert.match(read('dist/account.js'),/window\.loadKKServiceStaff/);
 assert.match(backend,/if\(path==='\/api\/kk\/staff\/services'&&method==='GET'\)\{\s*await user\(\['sk','chairman'\]\)/);
 assert.match(backend,/if\(path==='\/api\/kk\/staff\/services'&&method==='POST'\)\{\s*await user\(\['sk','chairman'\]\)/);
 assert.match(backend,/if\(path==='\/api\/kk\/staff\/services\/config'&&method==='POST'\)\{\s*await user\(\['chairman'\]\)/);
 assert.match(staffClient,/name="verified_grams"/);
 assert.match(staffClient,/pointsRate/);
 assert.match(staffClient,/payload\.verified_grams=grams/);
 assert.doesNotThrow(()=>new vm.Script(staffClient));
});

test('Youth must have a KK session to submit requests; server validates service quantities',()=>{
 assert.match(backend,/if\(path==='\/api\/kk\/services'&&method==='POST'\)\{\s*if\(!kkSession\)S\.fail\(401/);
 assert.match(backend,/if\(path==='\/api\/kk\/services'&&method==='GET'\)\{\s*if\(!kkSession\)S\.fail\(401/);
 assert.match(backend,/await limit\('kk-service-submit-ip'/);
 assert.match(backend,/!Number\.isInteger\(copies\)\|\|copies<1\|\|copies>100/);
 assert.match(backend,/!Number\.isInteger\(hours\)\|\|hours<1\|\|hours>8/);
 assert.match(backend,/!Number\.isInteger\(grams\)\|\|grams<1\|\|grams>100000/);
 assert.match(router,/vasra_kk_services/);
 assert.match(router,/action\.startsWith\('kk_services_'\) \? action\.slice\(12\)/);
 assert.doesNotThrow(()=>new vm.Script(read('dist/theme.js')));
});
test('Service DB keeps private RLS, verified members, approval locking and exactly-once points',()=>{
 assert.match(ddl,/CREATE TABLE IF NOT EXISTS vasra\.kk_service_requests/);
 assert.match(ddl,/ENABLE ROW LEVEL SECURITY/);
 assert.match(ddl,/select p\.status='verified' into youth_verified/);
 assert.match(ddl,/FOR UPDATE/i);
 assert.match(ddl,/if item\.status<>'pending'/);
 assert.match(ddl,/if awarded>0 then/);
 assert.match(ddl,/kk_points_service_once_idx/);
 assert.match(ddl,/points_per_kg/);
 assert.match(grants,/TO service_role/);
 assert.match(grants,/FROM PUBLIC,anon,authenticated/);
 assert.match(grants,/REVOKE EXECUTE ON FUNCTION public\.vasra_kk_services/);
});
test('Theme button shows exactly one icon, retains state and correct ARIA controls',()=>{
 const theme=read('dist/theme.js'),css=read('dist/theme.css');
 assert.match(theme,/b\.innerHTML=dark\?icon:moon/);
 assert.match(theme,/b\.setAttribute\('aria-label',dark\?'Switch to light mode':'Switch to dark mode'\)/);
 assert.match(css,/\.vasra-theme-toggle svg\{display:block!important/);
 assert.doesNotMatch(theme,/b\.innerHTML=icon\+moon/);
 assert.match(read('dist/sw.js'),/kk-services\.js/);
 assert.match(read('dist/sw.js'),/u\.pathname\.startsWith\('\/api\/'\)/);
});
