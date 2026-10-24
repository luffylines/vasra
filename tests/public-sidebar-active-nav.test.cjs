'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dist=path.resolve(__dirname,'../dist');
const expected={
 'index.html':'./',
 'projects.html':'./projects.html',
 'duty.html':'./duty.html',
 'youth-leaders.html':'./youth-leaders',
 'achievements.html':'./achievements.html',
 'contacts.html':'./contacts.html',
 'transparency.html':'./transparency'
};
test('All seven public pages highlight exactly their own route, without any sidebar dots',()=>{
 for(const [page,route] of Object.entries(expected)){
  const content=fs.readFileSync(path.join(dist,page),'utf8');
  const match=content.match(/<nav aria-label="Pangunahing navigation">([\s\S]*?)<\/nav>/);
  assert.ok(match,page+' must provide public navigation');
  const nav=match[1];
  const selected=[...nav.matchAll(/<a\b([^>]*\baria-current="page"[^>]*)>/g)];
  assert.equal(selected.length,1,page+' must have one and only one selected link');
  assert.ok(selected[0][1].includes('href="'+route+'"'),page+' should highlight '+route);
  assert.doesNotMatch(nav,/<i\b|<\/i>/i,page+' should not have a trailing dot');
  assert.equal((nav.match(/<a href=/g)||[]).length,7,page+' keeps all seven public routes');
 }
});
test('Client-side shell reconciles active state from URL for clean and .html route aliases',()=>{
 const source=fs.readFileSync(path.join(dist,'shell.js'),'utf8');
 assert.match(source,/const currentPage=match\(location\.pathname\)/);
 assert.match(source,/a\.setAttribute\('aria-current','page'\)/);
 assert.match(source,/a\.removeAttribute\('aria-current'\)/);
 assert.match(source,/a\.querySelectorAll\(':scope > i'\)/);
 for(const path of ['/projects','/projects.html','/duty','/duty.html','/transparency',
   '/transparency.html','/achievements','/achievements.html',
   '/contacts','/contacts.html','/youth-leaders','/youth-leaders.html'])
   assert.ok(source.includes("target.endsWith('"+path+"')"),path);
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(fs.readFileSync(path.join(dist,'mobile-nav.css'),'utf8'),/\.site-header nav a > i\{display:none!important\}/);
});
test('Service worker cache is bumped so old sidebar HTML cannot stay pinned on installed PWA',()=>{
 assert.match(fs.readFileSync(path.join(dist,'sw.js'),'utf8'),/vasra-v54-public-sidebar-active-20261025/);
});
