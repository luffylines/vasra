'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const api=read('lib/handler.cjs'),db=read('lib/supabase.cjs');
const schema=read('supabase/migrations/20261022170000_achievements_awards.sql');
test('Achievements is a public page and a consistent SK VASRA sidebar link',()=>{
 const pages=['index','projects','duty','youth-leaders','contacts','transparency','account','achievements'];
 for(const p of pages)assert.match(read('dist/'+p+'.html'),/href="\.\/achievements"/);
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
 assert.match(read('dist/sw.js'),/\.\/achievements/);
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