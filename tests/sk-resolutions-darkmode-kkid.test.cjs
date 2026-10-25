'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const server=read('lib/handler.cjs'),rpc=read('lib/supabase.cjs'),db=read('supabase/migrations/20261025201000_sk_resolutions_drive_registry.sql');
test('SK Resolution appears after Transparency across public pages',()=>{
 for(const page of ['index','projects','duty','youth-leaders','achievements','contacts','transparency']){
  const s=read('dist/'+page+'.html'),t=s.indexOf('<span>Transparency</span></a>'),k=s.indexOf('href="./sk-resolutions"',t);
  assert.ok(t>=0&&k>t&&k<t+600,page);
 }
 const page=read('dist/sk-resolutions.html');assert.match(page,/aria-current="page"><svg/);
 assert.match(read('vercel.json'),/\/sk-resolutions/);
});
test('Resolution server is published-only publicly; staff edit requires authorization',()=>{
 assert.match(server,/path==='\/api\/sk-resolutions'&&method==='GET'/);
 assert.match(server,/resolutions_public_list/);
 assert.match(server,/path==='\/api\/sk-resolutions\/manage'&&method==='GET'/);
 assert.match(server,/await user\(\['sk','chairman'\]\)/);
 assert.match(server,/resolutions_save/);
 assert.match(rpc,/vasra_sk_resolutions/);
 assert.match(db,/IF action='public_list'/);
 assert.match(db,/WHERE r\.published=true/);
 assert.match(db,/u\.role IN \('sk','chairman'\)/);
 assert.match(db,/REVOKE ALL ON .* FROM PUBLIC,anon,authenticated/);
 assert.match(db,/GRANT EXECUTE ON .* TO service_role/);
 assert.match(db,/ROW LEVEL SECURITY/);
});
test('Staff and public Resolution UI have links, filters and dark styles',()=>{
 const a=read('dist/account.html'),js=read('dist/account.js');
 assert.match(a,/data-tab="sk-resolutions"/);assert.match(a,/id="panel-sk-resolutions"/);
 assert.match(js,/'sk-resolutions':'SK Resolution'/);
 assert.match(js,/window\.loadSKResolutionsAdmin/);
 assert.match(read('dist/sk-resolutions-admin.js'),/Published/);
 assert.match(read('dist/sk-resolutions.js'),/skres-search/);
 assert.match(read('dist/sk-resolutions.css'),/html\[data-theme="dark"\]/);
 assert.match(read('dist/sk-resolutions-admin.css'),/data-theme=dark/);
 assert.match(read('dist/theme.css'),/home-metrics article/);
});
test('Existing KK ID photo approvals and sequential database issuance retained',()=>{
 const member=read('dist/kk-dashboard.html'),staff=read('dist/account.html'),dashboard=read('dist/kk-dashboard.js');
 assert.match(member,/kk-copy-id/);assert.match(member,/kk-id-photo/);
 assert.match(staff,/data-tab="kk-ids"/);assert.match(staff,/85\.6 × 54 mm/);
 assert.match(dashboard,/summary\.hidden=!\['overview','settings'\]\.includes\(which\)/);
 assert.match(read('dist/kk-id-staff.js'),/window\.print|print\(/);
 assert.match(read('dist/kk-id-member.js'),/loadKKIDCard/);
});
test('New scripts are syntactically valid',()=>{
 for(const p of ['dist/sk-resolutions.js','dist/sk-resolutions-admin.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
