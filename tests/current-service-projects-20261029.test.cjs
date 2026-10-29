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
 assert(config.rewrites.some(r=>r.source==='/current-project/:service'&&r.destination==='/index.html'));
 assert.match(page,/id="current-project-detail"/);
 const home=read('dist/index.html');
 assert.match(home,/<base href="\/">/);
 assert.match(home,/id="current-project-modal"/);
 assert.match(home,/id="current-project-close"/);
 assert.match(js,/history\.pushState/);
 assert.match(js,/window\.addEventListener\('popstate',sync\)/);
 assert.match(js,/dialog\.showModal\(\)/);
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
test('Facebook-style multiline summaries are accepted and safely displayed as text',()=>{
 const server=read('lib/handler.cjs'),frontend=read('dist/current-projects.js');
 const migration=read('supabase/migrations/20261029224500_current_project_multiline_summary.sql');
 assert.match(migration,/current_service_projects_summary_check/);
 assert.match(migration,/between 20 and 12000/);
 assert.doesNotMatch(migration,/new_summary ~ '\[<>\[:cntrl:\]\]'/);
 assert.match(server,/summary\.length>12000/);
 assert.match(server,/summary\.includes\('\\u0000'\)/);
 assert.match(frontend,/maxlength="12000"/);
 assert.match(frontend,/current-project-char-count/);
 assert.match(frontend,/safe\(x\.summary\)/);
 assert.match(frontend,/current-project-long-summary/);
});
test('Portrait posters are entirely visible in homepage overlay, admin preview and mobile layouts',()=>{
 const css=read('dist/current-projects.css'),home=read('dist/index.html');
 const admin=read('dist/account.html'),script=read('dist/current-projects.js');
 assert.match(css,/\.current-project-modal::backdrop/);
 assert.match(css,/backdrop-filter:blur\(9px\)/);
 assert.match(css,/\.current-project-modal \.current-project-detail-image img\{/);
 assert.match(css,/object-fit:contain/);
 assert.match(css,/\.current-project-admin-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(home,/id="current-project-modal"/);
 assert.match(admin,/id="current-project-preview"/);
 assert.match(script,/data-service-preview/);
 assert.match(script,/preview\.showModal\(\)/);
});


test('Current Project is touch-responsive on iPhone and Android viewport sizes',()=>{
 const css=read('dist/current-projects.css');
 const script=read('dist/current-projects.js');
 const home=read('dist/index.html');
 const admin=read('dist/account.html');
 for(const width of [850,650,380]){
  assert(css.includes('@media(max-width:'+width+'px)'), 'Missing mobile breakpoint '+width);
 }
 assert.match(css,/height:calc\(100dvh - 24px\)/);
 assert.match(css,/overflow-x:hidden;overflow-y:auto/);
 assert.match(css,/-webkit-overflow-scrolling:touch/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/orientation:landscape/);
 assert.match(css,/#panel-current-projects \.current-project-admin-actions/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/current-project-admin-actions \.current-project-upload input\[type="file"\]/);
 assert.match(css,/pointer-events:auto;cursor:pointer/);
 assert.match(css,/#panel-current-projects \.current-project-admin-card textarea\{/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/object-fit:contain/);
 assert.match(home,/id="current-project-poster-preview"/);
 assert.match(home,/id="current-project-poster-close"/);
 assert.match(script,/posterPreview\.showModal\(\)/);
 assert.match(script,/posterPreview\?\.open/);
 assert.match(script,/window\.addEventListener\('pageshow'/);
 assert.match(home,/current-projects\.css\?v=20261029-mobile-v3/);
 assert.match(home,/current-projects\.js\?v=20261029-mobile-v3/);
 assert.match(admin,/current-projects\.css\?v=20261029-mobile-v3/);
 assert.match(admin,/current-projects\.js\?v=20261029-mobile-v3/);
});
