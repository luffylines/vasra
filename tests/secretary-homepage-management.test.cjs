'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('Secretary and Chairperson see Current Project and Hero Backgrounds navigation',()=>{
 const html=read('dist/account.html'),js=read('dist/account.js');
 for(const name of ['current-projects','hero-backgrounds']){
  assert.match(html,new RegExp('data-tab="'+name+'" class="homepage-content-only" hidden'));
  assert.match(html,new RegExp('data-admin-open="'+name+'"'));
  assert.match(js,new RegExp("name==='"+name+"'"));
 }
 assert.match(js,/const canManageHomepageContent=user\.role==='chairman'\|\|\(user\.role==='sk'&&user\.position==='secretary'\)/);
 assert.match(js,/el\.hidden=!canManageHomepageContent/);
 assert.match(js,/if\(\['current-projects','hero-backgrounds'\]\.includes\(name\)&&!\(user\?\.role==='chairman'\|\|\(user\?\.role==='sk'&&user\?\.position==='secretary'\)\)\)return;/);
 assert.match(js,/'hero-backgrounds':'Hero Backgrounds'/);
});
test('homepage management endpoints use Secretary-scoped server authorization, not a UI-only gate',()=>{
 const handler=read('lib/handler.cjs');
 assert.match(handler,/async function homepageContentAdmin\(\)/);
 assert.match(handler,/actor\.role!=='chairman'.*actor\.position==='secretary'/);
 for(const route of ['hero-backgrounds/manage','hero-backgrounds/upload','hero-backgrounds/reset','current-projects/manage','current-projects/save','current-projects/image']){
  const index=handler.indexOf("path==='/api/"+route+"'");
  assert.notEqual(index,-1,'missing '+route);
  const limited=handler.slice(index,index+220);
  assert.match(limited,/homepageContentAdmin\(\)/,'missing server-side gate for '+route);
  assert.doesNotMatch(limited,/user\(\['chairman'\]\)/,'old chairman-only gate for '+route);
 }
});
test('chairperson-only functionality remains restricted',()=>{
 const handler=read('lib/handler.cjs'),js=read('dist/account.js');
 assert.match(handler,/if \(path === '\/api\/users' && method === 'POST'\) \{\s*const u = await user\(\['chairman'\]\)/);
 assert.match(js,/\['roster','duty-manage','users','audit'\]\.includes\(name\)&&user\?\.role!=='chairman'/);
 assert.match(js,/document\.querySelectorAll\('\.chair-only'\)/);
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotThrow(()=>new Function(handler));
});
