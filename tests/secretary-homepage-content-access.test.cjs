'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const tabs=['current-projects','hero-backgrounds'];
const paths=['/api/current-projects/manage','/api/current-projects/save','/api/current-projects/image',
 '/api/hero-backgrounds/manage','/api/hero-backgrounds/upload','/api/hero-backgrounds/reset'];
test('Secretary overview and sidebar offer existing Current Project and Hero Backgrounds editors',()=>{
 const html=read('dist/account.html');
 const secretary=html.slice(html.indexOf('<section id="secretary-overview"'),html.indexOf('</section>',html.indexOf('<section id="secretary-overview"')));
 for(const tab of tabs){
  assert.match(html,new RegExp('data-tab="'+tab+'" class="content-editor-only" hidden'),tab);
  assert.match(secretary,new RegExp('data-admin-open="'+tab+'"'),tab);
 }
 assert.equal((html.match(/id="panel-current-projects"/g)||[]).length,1);
 assert.equal((html.match(/id="panel-hero-backgrounds"/g)||[]).length,1);
 assert.match(html,/hero-backgrounds-admin\.js/);
 assert.match(html,/current-projects\.js/);
});
test('Frontend permits Chairperson or Secretary, blocks Kagawad/Treasurer from shared editor tabs',()=>{
 const app=read('dist/account.js');
 assert.match(app,/canEditHomepageContent=\(\)=>user\?\.role==='chairman'\|\|\(user\?\.role==='sk'&&user\?\.position==='secretary'\)/);
 assert.match(app,/\.content-editor-only'\)\.forEach\(x=>x\.hidden=!canEditHomepageContent\(\)\)/);
 assert.match(app,/\['current-projects','hero-backgrounds'\]\.includes\(name\)&&!canEditHomepageContent\(\)/);
 assert.match(app,/\['roster','duty-manage','users','audit'\]\.includes\(name\)&&user\?\.role!=='chairman'/);
});
test('Server enforces restricted editor authorization on all six private routes',()=>{
 const handler=read('lib/handler.cjs');
 const gate=handler.slice(handler.indexOf('async function homepageContentEditor()'),handler.indexOf('async function limit(',handler.indexOf('async function homepageContentEditor()')));
 assert.match(gate,/await user\(\['sk','chairman'\]\)/);
 assert.match(gate,/actor\.role!=='chairman'/);
 assert.match(gate,/actor\.role==='sk' && actor\.position==='secretary'/);
 for(const route of paths){
  const marker="if(path==='"+route+"'";
  const i=handler.indexOf(marker);
  assert(i>=0,route);
  const part=handler.slice(i,handler.indexOf('\n      }',i));
  assert.match(part,/await homepageContentEditor\(\)/,route);
 }
 // Other sensitive routes must not inherit this narrow permission.
 const accounts=handler.slice(handler.indexOf("if(path==='/api/users'"),handler.indexOf("if(path==='/api/users'")+900);
 assert(!accounts.includes('homepageContentEditor'));
});
test('Supabase functions authorize only Chairperson or SK Secretary; grants remain service-role only',()=>{
 const sql=read('supabase/migrations/20261103120000_secretary_homepage_content_editors.sql');
 const regex=/\(u\.role='chairman'\s+or\s+\(u\.role='sk'\s+and\s+u\.position='secretary'\)\)|\(u\.role='chairman'\s+OR\s+\(u\.role='sk'\s+AND\s+u\.position='secretary'\)\)/g;
 assert.equal((sql.match(regex)||[]).length,2);
 for(const rpc of ['vasra_current_service_project','vasra_site_hero_media']){
  assert(sql.includes('FUNCTION public.'+rpc),rpc);
  assert(sql.includes('GRANT EXECUTE ON FUNCTION public.'+rpc+'(text,jsonb,text) TO service_role'));
 }
 assert.match(sql,/SECURITY INVOKER/i);
 assert.match(sql,/current_service_summary_updated/);
 assert.match(sql,/site_hero_background_updated/);
 assert.match(sql,/AND u\.disabled_at IS NULL AND NOT u\.must_change/i);
 assert.doesNotMatch(sql,/GRANT EXECUTE.*TO authenticated/);
});
test('Changed scripts parse cleanly',()=>{
 for(const file of ['dist/account.js','dist/current-projects.js','dist/hero-backgrounds-admin.js','lib/handler.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
