'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const api=read('lib/handler.cjs'),db=read('lib/supabase.cjs');
const schema=read('supabase/migrations/20261022170000_achievements_awards.sql');
test('Achievements is a public page and a consistent SK VASRA sidebar link',()=>{
 const pages=['index','projects','duty','youth-leaders','contacts','transparency','account','achievements'];
 for(const p of pages)assert.match(read('dist/'+p+'.html'),/href="\.\/achievements(?:\.html)?"/);
 assert.match(read('dist/shell.js'),/key:'awards'/);
 assert.match(read('dist/index.html'),/id="home-awards-list"/);
 assert.match(read('dist/home-awards.js'),/api\('\.\/api\/achievements'\)/);
 assert.match(read('dist/achievements.js'),/api\('\.\/api\/achievements'\)/);
});
test('iPhone home screen and favicon continue using verified real SK Vasra artwork',()=>{
 const index=read('dist/index.html');
 assert.match(index,/rel="apple-touch-icon" sizes="180x180"/);
 assert.match(index,/rel="icon" type="image\/jpeg"/);
 assert.match(read('dist/sw.js'),/\.\/apple-touch-icon-vasra\.png/);
 assert.match(read('dist/sw.js'),/\.\/achievements\.html/);
});
test('SK officers can upload draft awards with up to twelve photos',()=>{
 const markup=read('dist/account.html');
 const client=read('dist/awards-management.js');
 assert.match(markup,/id="panel-awards"/);
 assert.match(markup,/data-tab="awards"/);
 assert.match(markup,/id="award-photos"[^>]*multiple/);
 assert.match(markup,/id="award-publish"/);
 assert.match(client,/uploadProjectPhoto\(awardPendingFiles\[i\]\.file\)/);
 assert.match(client,/awardImageList\.length\+awardPendingFiles\.length>12/);
 assert.match(client,/id:awardEditing\|\|null/);
 assert.match(client,/published:publish/);
 assert.match(api,/await user\(\['sk','chairman'\]\)/);
 assert.match(api,/Chairman approval is required before publishing/);
});
test('Only Chairman can approve/publish or archive, staff cannot edit others or published content',()=>{
 assert.match(schema,/actor\.role not in \('chairman','sk'\)/);
 assert.match(schema,/actor\.role<>'chairman' and coalesce\(\(payload->>'published'\)/);
 assert.match(schema,/target\.created_by is distinct from actor\.id or target\.published/);
 assert.match(schema,/if actor\.role<>'chairman' then return jsonb_build_object\('error',403\)/);
 assert.match(api,/await user\(\['chairman'\]\)/);
});
test('Published awards are separated from drafts and their photos are authorization-gated',()=>{
 assert.match(schema,/where a\.published and not a\.archived/);
 assert.match(schema,/where not a\.archived and \(actor\.role='chairman' or a\.created_by=actor\.id or a\.published\)/);
 assert.match(schema,/create table if not exists vasra\.achievement_images/);
 assert.match(schema,/jsonb_array_length\(raw_ids\)>12/);
 assert.match(schema,/from vasra\.images i join vasra\.achievement_images/);
 assert.match(api,/for\(const action of \['image','gallery_image','awards_image','awards_image_manage'/);
 assert.match(db,/action\.startsWith\('awards_'\) \? '\/rest\/v1\/rpc\/vasra_awards'/);
 assert.match(db,/action\.startsWith\('awards_'\) \? action\.slice\(7\)/);
});
test('Award gallery is viewport bounded for small laptop screens',()=>{
 const css=read('dist/achievements.css'),html=read('dist/achievements.html');
 assert.match(css,/#awards-gallery\[open\]/);
 assert.match(css,/grid-template-rows:auto minmax\(0,1fr\)/);
 assert.match(css,/max-height:calc\(100dvh - 24px\)/);
 assert.match(html,/id="awards-gallery-close"/);
 assert.match(html,/id="awards-gallery-next"/);
});
test('Mobile form inputs avoid iOS focus zoom and SK Duty buttons stay compact',()=>{
 const css=read('dist/mobile-nav.css');
 const staff=read('dist/staff-duty-ui.css');
 assert.match(css,/font-size:16px!important/);
 assert.match(staff,/height:42px!important;min-height:42px!important;max-height:42px!important/);
 assert.match(staff,/border-radius:999px!important/);
});

test('Achievements navigation selects the awards page and offers retry when API is unreachable',()=>{
 const html=read('dist/achievements.html');
 const js=read('dist/achievements.js');
 const css=read('dist/achievements.css');
 assert.match(html,/href="\.\/achievements\.html" aria-current="page"/);
 assert.doesNotMatch(html,/href="\.\/youth-leaders" aria-current="page"/);
 assert.match(js,/id="awards-retry"/);
 assert.match(js,/loadAwardsPublic\(\)/);
 assert.match(css,/\.awards-retry-button/);
});
test('Chairman organizational portrait uploads keep the officer ID and selected photo on network failures',()=>{
 const markup=read('dist/account.html'),client=read('dist/account.js'),css=read('dist/officers.css');
 assert.match(markup,/id="roster-photo-file"[^>]*type="file"/);
 assert.match(markup,/id="roster-upload-status"/);
 assert.match(css,/\.roster-upload-status\.is-error/);
 assert.match(client,/rosterSaveInProgress/);
 assert.match(client,/f\.id\.value=saved\.id;[\s\S]*?detailsSaved=true;/);
 assert.match(client,/rosterPhotoId=imageId;[\s\S]*?rosterPhotoFile=null;/);
 assert.match(client,/form\.reset\(\);[\s\S]*?await loadTransparencyEditor\('roster'\)/);
 assert.match(client,/src="\.\/api\/officer-images\//);
 assert.match(client,/Hindi pa kumpleto ang photo save/);
 const endpoint=api;
 assert.match(endpoint,/path === '\/api\/officer-profiles' && method === 'POST'/);
 assert.match(endpoint,/await user\(\['chairman'\]\)/);
});
test('SK officer award uploads retain unuploaded photos for retry and show persistent progress',()=>{
 const awards=read('dist/awards-management.js');
 assert.match(awards,/let uploadedCount=0/);
 assert.match(awards,/uploadedCount\+\+/);
 assert.match(awards,/const completedFiles=awardPendingFiles\.splice\(0,uploadedCount\)/);
 assert.match(awards,/projectUploadStatus\(progress\)/);
 assert.match(awards,/projectUploadStatus\('Award upload needs retry:/);
 assert.match(awards,/Only your own unpublished draft or Chairman-managed awards can be edited/);
});

test('All portal public routes have extensionless Vercel rewrites and old URL redirects',()=>{
 const cfg=JSON.parse(read('vercel.json'));
 for(const route of ['account','projects','achievements','duty','contacts','transparency','youth-leaders']){
   assert(cfg.rewrites.some(r=>r.source==='/'+route&&r.destination==='/'+route+'.html'),route+' rewrite');
   assert(cfg.redirects.some(r=>r.source==='/'+route+'.html'&&r.destination==='/'+route),route+' redirect');
 }
});
test('SK officers access project-style awards editor in their sidebar with secure submission',()=>{
 const html=read('dist/account.html'),js=read('dist/awards-management.js'),css=read('dist/awards-dashboard-modal.css');
 assert.match(html,/data-tab="awards"/);
 for(const id of ['award-new','award-dialog','award-mode-manual','award-mode-facebook','award-caption','award-analyze','award-photo-thumbs','award-manage-list']){
  assert(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/Manual Entry/);
 assert.match(html,/Facebook Caption \+ AI/);
 assert.match(js,/awardDialog\.showModal\(\)/);
 assert.match(js,/data-award-edit/);
 assert.match(js,/data-award-archive/);
 assert.match(js,/api\/manage\/projects\/import-facebook/);
 assert.match(js,/const archive=user\?\.role==='chairman'/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/\.award-modal-form #award-photo-thumbs/);
});

test('Award dialog has one viewport with fixed header/footer, scrollable content and responsive phone layout',()=>{
 const css=read('dist/awards-dashboard-modal.css'),js=read('dist/awards-management.js'),html=read('dist/account.html');
 assert.match(css,/\.award-dashboard-dialog:not\(\[open\]\)\{display:none!important\}/);
 assert.match(css,/\.award-dashboard-dialog\[open\]\{/);
 assert.match(css,/display:flex;flex-direction:column/);
 assert.match(css,/grid-template-rows:minmax\(0,1fr\) auto/);
 assert.match(css,/\.award-modal-scroll\{/);
 assert.match(css,/overflow-y:auto;overflow-x:hidden/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/height:100dvh;max-height:100dvh/);
 assert.match(css,/font-size:16px!important/);
 assert.match(html,/id="award-dialog"/);
 assert.match(js,/scroll\.scrollTop=0/);
});
