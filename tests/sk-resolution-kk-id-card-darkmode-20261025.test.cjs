'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const handler=read('lib/handler.cjs'),db=read('lib/supabase.cjs');
const resolutionSql=read('supabase/migrations/20261025201000_sk_resolutions_drive_registry.sql');
const numberedSql=read('supabase/migrations/20261025203500_kk_sequential_verified_ids.sql');
const cardSql=read('supabase/migrations/20261025205000_kk_id_card_review.sql');
test('SK Resolution public nav is directly below Transparency everywhere',()=>{
 for(const p of ['index','projects','duty','transparency','youth-leaders','achievements','contacts']){
  const html=read('dist/'+p+'.html');
  assert.match(html,/<span>Transparency<\/span><\/a><a href="\.\/sk-resolutions"/,p);
 }
 assert.match(read('dist/sk-resolutions.html'),/aria-current="page"/);
 assert.match(read('vercel.json'),/"source": "\/sk-resolutions"/);
});
test('Resolution catalog is published-only and officer-write protected in private DB',()=>{
 assert.match(resolutionSql,/CREATE TABLE IF NOT EXISTS vasra\.sk_resolutions/);
 assert.match(resolutionSql,/ALTER TABLE vasra\.sk_resolutions ENABLE ROW LEVEL SECURITY/);
 assert.match(resolutionSql,/WHERE r\.published=true/);
 assert.match(resolutionSql,/u\.role IN \('sk','chairman'\)/);
 assert.match(resolutionSql,/s\.expires>clock_timestamp\(\)/);
 assert.match(resolutionSql,/INSERT INTO vasra\.audit/);
 assert.match(resolutionSql,/REVOKE ALL ON FUNCTION public\.vasra_sk_resolutions/);
 assert.match(handler,/if\(path==='\/api\/sk-resolutions\/manage'&&method==='POST'\)/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
 assert.match(db,/vasra_sk_resolutions/);
 assert.match(read('dist/account.html'),/data-tab="sk-resolutions"/);
 assert.match(read('dist/account.js'),/loadSKResolutionsAdmin/);
});
test('Homepage fully supports dark nested short cards and metrics',()=>{
 const s=read('dist/theme.css');
 for(const term of ['home-metrics article','home-shortcuts strong','home-panel h3','home-budget-total','home-award','home-values article']){
  assert.ok(s.includes(term),term);
 }
 assert.match(s,/html\[data-theme="dark"\] body\.portal-refresh \.home-main/);
});
test('KK verification numbers are generated sequentially, not from UUID hash',()=>{
 assert.match(numberedSql,/CREATE SEQUENCE IF NOT EXISTS vasra\.kk_verification_id_seq/);
 assert.match(numberedSql,/ORDER BY reviewed_at ASC NULLS LAST/);
 assert.match(numberedSql,/nextval\('vasra\.kk_verification_id_seq'\)/);
 assert.doesNotMatch(numberedSql,/coalesce\(kk_id,'VASRA-KK-'\|\|upper\(left\(replace/);
 assert.match(numberedSql,/GRANT USAGE, SELECT ON SEQUENCE .* TO service_role/);
});
test('Membership summary is only Dashboard or Settings and has Copy ID button',()=>{
 const html=read('dist/kk-dashboard.html'),script=read('dist/kk-dashboard.js');
 assert.match(html,/id="kk-copy-id"/);
 assert.match(html,/data-tab="kk-id"/);
 assert.match(script,/navigator\.clipboard\.writeText/);
 assert.match(script,/summary\.hidden=!\['overview','settings'\]\.includes\(which\)/);
 assert.match(script,/window\.loadKKIDCard/);
 assert.match(read('dist/kk-id-card.css'),/\.kk-summary\[hidden\]\{display:none!important\}/);
});
test('KK photo stored privately, officer-reviewed, printable only on approved state',()=>{
 for(const check of [
  /ALTER TABLE vasra\.kk_id_cards ENABLE ROW LEVEL SECURITY/,
  /REVOKE ALL ON vasra\.kk_id_cards FROM PUBLIC,anon,authenticated/,
  /CREATE TABLE IF NOT EXISTS vasra\.kk_id_card_audit/,
  /action='photo_save'/,
  /action='staff_review'/,
  /IF card\.status<>'pending'/,
  /u\.role IN \('chairman','sk'\)/,
  /GRANT EXECUTE ON FUNCTION public\.vasra_kk_card.*TO service_role/])assert.match(cardSql,check);
 assert.match(handler,/if\(path==='\/api\/kk\/id-card\/photo'&&method==='POST'\)/);
 assert.match(handler,/await db\.putPrivate\(filePath,bytes,mime\)/);
 assert.match(handler,/if\(path==='\/api\/kk\/staff\/id-cards\/review'/);
 assert.match(handler,/if\(path==='\/api\/kk\/id-card\/photo'&&method==='GET'\)/);
 assert.match(handler,/await db\.getPrivate\(item\.path\)/);
 assert.match(handler,/'Cache-Control':'private,no-store'/);
 assert.match(read('dist/kk-id-staff.js'),/const approved=r=>r\.status==='approved'&&r\.photo_exists/);
 assert.match(read('dist/kk-id-card.css'),/width:85\.6mm!important;height:54mm!important/);
 assert.match(read('dist/kk-id-card.css'),/@page\{size:A4 portrait;margin:0\}/);
});
test('Latest public/member/staff scripts all parse with no exposed private Storage keys',()=>{
 for(const p of ['dist/sk-resolutions.js','dist/sk-resolutions-admin.js','dist/kk-id-member.js','dist/kk-id-staff.js','dist/kk-dashboard.js','lib/handler.cjs','lib/supabase.cjs','dist/account.js'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}),p);
 for(const p of ['dist/sk-resolutions.js','dist/kk-id-member.js','dist/kk-id-staff.js'])
  assert.doesNotMatch(read(p),/SUPABASE_SECRET_KEY|service_role|sb_secret_/);
});
