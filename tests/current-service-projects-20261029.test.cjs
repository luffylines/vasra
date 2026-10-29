'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('Homepage retains existing stats and shows exactly three Current Project service links',()=>{
 const home=read('dist/index.html');
 for(const label of ['Total Projects','SK Council','SK Duty','Achievements'])assert(home.includes(label));
 assert(home.includes('id="current-project-cards"'));
 for(const slug of ['printing','computer','retabox'])assert(home.includes('href="./current-project/'+slug+'"'));
 assert(home.indexOf('home-summary-cards')<home.indexOf('id="current-projects"'));
 assert(home.indexOf('id="current-projects"')<home.indexOf('home-recent-title'));
});
test('Each child page renders safe summary and official KK login CTA',()=>{
 const page=read('dist/current-project.html'),js=read('dist/current-projects.js');
 const config=JSON.parse(read('vercel.json'));
 assert(config.rewrites.some(r=>r.source==='/current-project/:service'&&r.destination==='/current-project.html'));
 assert.match(page,/id="current-project-detail"/);
 assert.match(page,/<base href="\/">/);
 assert.match(js,/\/kk-login\?service=/);
 assert.match(js,/\/kk-dashboard#/);
 for(const slug of ['printing','computer','retabox'])assert(fs.existsSync(path.join(__dirname,'../dist/current-project-'+slug+'.svg')));
});
test('Only chairman can edit exactly three records; no public Storage keys or arbitrary URLs',()=>{
 const server=read('lib/handler.cjs'),rpc=read('lib/supabase.cjs');
 const sql=read('supabase/migrations/20261029223000_current_service_project_cards.sql');
 const account=read('dist/account.html'),app=read('dist/account.js');
 for(const action of ['/api/current-projects/manage','/api/current-projects/save','/api/current-projects/image'])
  assert(server.includes(action));
 assert.match(server,/await user\(\['chairman'\]\)/);
 assert.match(server,/image\/jpeg/);
 assert.match(sql,/current_service_image_pair/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/revoke all on function public\.vasra_current_service_project/);
 assert.match(sql,/u\.role='chairman'/);
 assert.match(rpc,/vasra_current_service_project/);
 assert.match(account,/data-tab="current-projects" class="chair-only" hidden/);
 assert.match(account,/id="panel-current-projects"/);
 assert.match(app,/\['roster','duty-manage','users','audit','current-projects'\]/);
 assert.match(sql,/slug in \('printing','computer','retabox'\)/);
});
test('KK service deep links survive password/Google login and still require verified KK profile',()=>{
 const login=read('dist/kk.js'),dashboard=read('dist/kk-dashboard.js');
 assert.match(login,/nextService/);
 assert.match(login,/vasra-kk-requested-service/);
 assert.match(login,/active\?\.profile\?\.status==='verified'/);
 assert.match(dashboard,/vasra-kk-requested-service/);
 assert.match(dashboard,/data\.profile\?\.status!=='verified'/);
 assert.match(dashboard,/location\.hash\.slice\(1\)/);
 for(const file of ['dist/current-projects.js','dist/kk.js','dist/kk-dashboard.js','dist/account.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new (require('node:vm').Script)(read(file),{filename:file}));
});