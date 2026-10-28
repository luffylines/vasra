'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'../',x),'utf8');
const js=read('dist/account.js'),css=read('dist/admin-dashboard.css'),server=read('lib/handler.cjs');
test('Project Edit uses an interpolated inline SVG, not JavaScript literal text',()=>{
 assert.match(js,/<button type="button" class="secondary project-edit-trigger" data-edit="\$\{esc\(p\.id\)\}"[^>]*>\$\{managementActionIcon\('edit'\)\} Edit<\/button>/);
 assert.doesNotMatch(js,/'\+managementActionIcon\('edit'\)\+' Edit<\/button>/);
 assert.match(js,/managementActionIcon\('edit'\)/);
 assert.match(js,/\[data-edit\]/);
});
test('Staff thumbnails load valid image IDs eagerly and keep a fallback',()=>{
 assert.match(js,/managedPhotoUrl\(ids\[0\]\)/);
 assert.match(js,/loading="eager" decoding="async"/);
 assert.match(js,/project-thumb-fallback/);
 assert.match(js,/#managed-projects/);
 assert.match(js,/\.project-manage-thumbnail img/);
});
test('Image API handles JSON error responses without handing them to Storage',()=>{
 assert.match(server,/for\(const action of \['image','gallery_image','awards_image','awards_image_manage','officer_profile_photo'\]\)/);
 assert.match(server,/found && !found\.error/);
 assert.match(server,/typeof found\.storage_path==='string'/);
 assert.match(server,/if\(!img\)S\.fail\(404/);
 assert.match(server,/const bytes=await db\.get\(img\.storage_path\)/);
 assert.doesNotMatch(server,/catch\(e\)\{\s*if\(e\.status!==404\)throw e;\s*try\{img=await rpc\('gallery_image'/);
});
test('Phone duty Office Closed state displays as a small pill rather than circular tile',()=>{
 assert.match(css,/@media\(max-width:730px\)/);
 assert.match(css,/#duty-controls \.duty-mode-badge\{[\s\S]*?height:30px!important/);
 assert.match(css,/aspect-ratio:auto!important/);
 assert.match(css,/border-radius:999px!important/);
 assert.match(css,/grid-column:2!important/);
});
test('Phone duty actions have short fixed touch height, not big vertical tiles',()=>{
 assert.match(css,/#dashboard > #duty-controls button\.duty-action-button\{[\s\S]*?height:44px!important/);
 assert.match(css,/min-height:44px!important;max-height:44px!important/);
 assert.match(css,/flex:0 0 44px!important/);
 assert.match(css,/grid-template-columns:1fr!important/);
 assert.match(css,/button\.duty-action-button\[hidden\]/);
});
test('Mobile Manage Projects actions and image card remain compact and accessible',()=>{
 assert.match(css,/#managed-projects \.project-manage-thumbnail\{width:78px!important;height:67px!important/);
 assert.match(css,/#managed-projects \.project-edit-trigger svg\{width:16px;height:16px/);
 assert.match(css,/\[data-theme="dark"\] #managed-projects \.project-edit-trigger/);
});
