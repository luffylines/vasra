'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const targets={
 home:'index.html',projects:'projects.html',duty:'duty.html',
 transparency:'transparency.html',contacts:'contacts.html'
};
test('Five public hero surfaces get optional uploaded backgrounds with original markup',()=>{
 for(const [key,file] of Object.entries(targets)){
  const html=read('dist/'+file);
  assert(html.includes('data-hero-media-key="'+key+'"'),file);
  assert(html.includes('hero-backgrounds.css?v='),file);
  assert(html.includes('hero-backgrounds-public.js?v='),file);
 }
 const css=read('dist/hero-backgrounds.css');
 assert.match(css,/home-memorial-hero\.hero-media-active::before/);
 assert.match(css,/project-hero\.hero-media-active::before/);
 assert.match(css,/background-size:cover/);
 assert.doesNotMatch(css.split('.hero-admin-intro')[0],/min-height:|max-height:|padding:/);
});
test('Only chairman sees management tab and can upload/reset hero media',()=>{
 const html=read('dist/account.html'),js=read('dist/account.js');
 const api=read('lib/handler.cjs'),rpc=read('lib/supabase.cjs');
 assert.match(html,/data-tab="hero-backgrounds" class="chair-only" hidden/);
 assert.match(html,/id="panel-hero-backgrounds" hidden/);
 assert.match(js,/name==='hero-backgrounds'&&user\?\.role!=='chairman'/);
 assert.match(js,/loadHeroBackgroundAdmin/);
 for(const endpoint of ['/api/hero-backgrounds/upload','/api/hero-backgrounds/reset','/api/hero-backgrounds/manage'])
  assert(api.includes(endpoint));
 assert.match(api,/await user\(\['chairman'\]\)/);
 assert(api.includes("const storage='hero-backgrounds/'+key+'/"));
 assert.match(rpc,/vasra_site_hero_media/);
});
test('Database persists allowlisted image paths without giving browsers direct writes',()=>{
 const sql=read('supabase/migrations/20261102211500_chairman_site_hero_backgrounds.sql');
 assert.match(sql,/site_hero_media ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/security invoker/i);
 assert.match(sql,/u\.role='chairman'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.vasra_site_hero_media/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.vasra_site_hero_media.*TO service_role/);
 assert.match(sql,/IF action='reset'/);
 for(const key of Object.keys(targets))assert(sql.includes("'"+key+"'"));
});
test('One hero editor has a page selector, image preview, and equal action controls',()=>{
 const html=read('dist/account.html');
 const js=read('dist/hero-backgrounds-admin.js');
 const css=read('dist/hero-backgrounds.css');
 for(const id of ['hero-target-select','hero-editor-preview','hero-editor-file','hero-save-btn',
   'hero-reset-btn','hero-selection-message'])assert(html.includes('id="'+id+'"'),id);
 assert.equal((html.match(/id="hero-target-select"/g)||[]).length,1);
 assert(!html.includes('id="hero-admin-grid"'),'old five-card grid must be removed');
 for(const key of Object.keys(targets))assert(html.includes('value="'+key+'"'),key);
 assert.match(js,/select\.addEventListener\('change'/);
 assert.match(js,/resetSelection\(\)/);
 assert.match(js,/pendingFile=null/);
 assert(js.includes("api('/api/hero-backgrounds/upload'"));
 assert.match(css,/#panel-hero-backgrounds \.hero-editor-actions/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.35fr\)/);
 assert.match(css,/html\[data-theme="dark"\]/);
 assert.match(css,/#panel-hero-backgrounds \.hero-admin-intro/);
});

test('Square uploaded hero logos fit the desktop right side while mobile keeps cover',()=>{
 const js=read('dist/hero-backgrounds-public.js');
 const css=read('dist/hero-backgrounds.css');
 assert.match(js,/photo\.naturalWidth\/photo\.naturalHeight<1\.45/);
 assert.match(js,/hero\.classList\.toggle\('hero-media-compact',compact\)/);
 assert.match(js,/photo\.onerror/);
 assert.match(css,/@media \(min-width:761px\)/);
 assert.match(css,/home-memorial-hero\.hero-media-active\.hero-media-compact::before/);
 assert.match(css,/project-hero\.hero-media-active\.hero-media-compact::before/);
 assert.match(css,/background-size:contain!important/);
 const desktopBlock=css.slice(css.indexOf('/* Desktop image-fit safeguard'),css.indexOf('/* The single editor'));
 assert(!/min-height\s*:|padding\s*:/.test(desktopBlock),'desktop fit must preserve hero dimensions');
 for(const file of Object.values(targets)){
  const page=read('dist/'+file);
  assert(page.includes('hero-backgrounds-public.js?v=20261102-desktop-fit-v3'),file);
  assert(page.includes('hero-backgrounds.css?v=20261102-desktop-fit-v3'),file);
 }
});

test('Hero scripts and touched handlers parse as JavaScript',()=>{
 for(const file of ['dist/hero-backgrounds-admin.js','dist/hero-backgrounds-public.js',
  'dist/account.js','lib/handler.cjs','lib/supabase.cjs'])
   assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
