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

test('Award file picker keeps dialog anchored and thumbnails limited to scroll area',()=>{
 const css=read('dist/awards-dashboard-modal.css'),js=read('dist/awards-management.js');
 assert.match(css,/dialog#award-dialog\.award-dashboard-dialog\[open\]/);
 assert.match(css,/overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important/);
 assert.match(css,/dialog#award-dialog form#award-form\.award-modal-form/);
 assert.match(css,/grid-template-rows:minmax\(0,1fr\) auto!important/);
 assert.match(css,/dialog#award-dialog #award-photo-thumbs/);
 assert.match(js,/const oldScrollTop=scroll\?\.scrollTop\|\|0/);
 assert.match(js,/awardDialog\.scrollTop=0/);
 assert.match(js,/requestAnimationFrame\(\(\)=>/);
});

test('SK awards photo gallery allows any thumbnail to become persisted cover',()=>{
 const script=read('dist/awards-management.js'),markup=read('dist/account.html'),css=read('dist/awards-dashboard-modal.css');
 assert.match(markup,/Set as Cover/);
 assert.match(script,/awardCoverSelection/);
 assert.match(script,/dataset\.awardCover/);
 assert.match(script,/const chosen=typeof awardCoverSelection/);
 assert.match(script,/photos\.unshift\(\.\.\.photos\.splice\(i,1\)\)/);
 assert.match(script,/uploaded\.set\(awardPendingFiles\[i\],id\)/);
 assert.match(css,/\.award-thumb\.cover-selected/);
 assert.match(css,/\.award-set-cover/);
});
test('Facebook Caption + AI presents only caption first, then human-reviewed award fields',()=>{
 const script=read('dist/awards-management.js'),markup=read('dist/account.html'),css=read('dist/awards-dashboard-modal.css');
 assert.match(markup,/id="award-review-fields"/);
 assert.match(markup,/id="award-facebook-panel"/);
 assert.match(markup,/Analyze Caption &amp; Create Award Draft/);
 assert.match(script,/awardDraftReady=!facebook/);
 assert.match(script,/awardReviewVisibility\(\)/);
 assert.match(script,/awardDraftReady=true;awardReviewVisibility\(\)/);
 assert.match(script,/awardMode\('manual'\)/);
 assert.match(css,/#award-review-fields\[hidden\]/);
});

test('award photo cards are large on desktop and phone',()=>{const css=read('dist/awards-dashboard-modal.css');assert.match(css,/height:196px!important/);assert.match(css,/height:181px!important/);assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);assert.match(css,/\.award-set-cover/);});

test('Award Facebook caption extracts three separate QC recognitions without inventing date or issuer',()=>{
 const {fromCaption}=require('../lib/award-caption.cjs');
 const sample=[
 'SK VASRA, WAGI SA 2026 QC SGYG!',
 'Nakamit ng Sangguniang Kabataan ng Barangay VASRA ang mga sumusunod na parangal sa 2026 Quezon City Seal of Good Youth Governance (SGYG):',
 '🏆 Outstanding SK Council',
 '🏆 Outstanding SK Project: Health Empowerment for Youth (HEY) Program',
 '🥇 Special Citation for HIV/AIDS Awareness Project: Health Empowerment for Youth (HEY) Program',
 'Ang mga parangal na ito ay para sa lahat ng Kabataang VASRA.',
 'Maraming salamat sa ating Mayor Joy Belmonte.',
 ].join('\n');
 const result=fromCaption(sample);
 assert.equal(result.ok,true);
 assert.equal(result.analysis_type,'achievements');
 assert.equal(result.draft.recognitions.length,3);
 assert.equal(result.draft.recognitions[0],'Outstanding SK Council');
 assert.match(result.draft.recognitions[1],/Outstanding SK Project/);
 assert.match(result.draft.recognitions[2],/Special Citation for HIV\/AIDS Awareness/);
 assert.equal(result.draft.issuer,'');
 assert.equal(result.draft.award_date,'');
 assert.equal(result.draft.date_requires_confirmation,true);
 assert.equal(result.draft.evidence.length,3);
 assert.doesNotMatch(result.draft.description,/Maraming salamat/);
 assert.throws(()=>fromCaption('Too short'),/caption/);
});
test('SK awards use dedicated caption API and allow choosing among multiple evidence-backed recognitions',()=>{
 const script=read('dist/awards-management.js');
 const markup=read('dist/account.html');
 const handler=read('lib/handler.cjs');
 assert.match(script,/api\/manage\/achievements\/analyze-caption/);
 assert.doesNotMatch(script,/api\/manage\/projects\/import-facebook/);
 assert.match(script,/award-recognition-select/);
 assert.match(script,/f\.award_date\.value=''/);
 assert.match(script,/f\.issuer\.value=String\(d\.issuer\|\|''\)/);
 assert.match(markup,/id="award-ai-recognitions"/);
 assert.match(handler,/AwardCaption\.fromCaption/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
});
