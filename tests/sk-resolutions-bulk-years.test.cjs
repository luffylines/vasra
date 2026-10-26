'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const markup=read('dist/account.html'),staff=read('dist/sk-resolutions-admin.js'),style=read('dist/sk-resolutions-admin.css'),publicHtml=read('dist/sk-resolutions.html'),publicJs=read('dist/sk-resolutions.js'),handler=read('lib/handler.cjs'),router=read('lib/supabase.cjs'),sql=read('supabase/migrations/20261026200000_sk_resolutions_multi_title_bulk_import.sql');
test('Repeated sheet numbers allowed for distinct year/title, exact duplicates prevented',()=>{
 assert.match(sql,/DROP CONSTRAINT IF EXISTS sk_resolutions_number_year_unique/);
 assert.match(sql,/sk_resolutions_year_number_title_unique/);
 assert.match(sql,/lower\(btrim\(resolution_number\)\),lower\(btrim\(title\)\)/);
 assert.match(sql,/EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object\('error',409,'reason','exact_duplicate'\)/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS author text NOT NULL DEFAULT ''/);
});
test('Bulk import requires authenticated SK staff and limits batches without auto-publishing',()=>{
 assert.match(sql,/public\.vasra_sk_resolutions\('staff_list','\{\}'::jsonb,session_hash\)/);
 assert.match(sql,/jsonb_array_length\(rows\)>150/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.vasra_sk_resolutions_import/);
 assert.match(handler,/path==='\/api\/sk-resolutions\/import'&&method==='POST'/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
 assert.match(handler,/x\.published=false/);
 assert.match(router,/\/rest\/v1\/rpc\/vasra_sk_resolutions_import/);
});
test('Compact staff list has year/status/search and pagination for large 2023-2027 archives',()=>{
 for(let yr=2023;yr<=2027;yr++)assert.match(markup,new RegExp('data-skres-year="'+yr+'"'));
 for(const id of ['skres-admin-year-tabs','skres-admin-status','skres-admin-search','skres-prev-page','skres-next-page','skres-list-count','skres-import-paste','skres-import-year','skres-import-preview','skres-import-submit'])
  assert.match(markup,new RegExp('id="'+id+'"'));
 assert.match(staff,/const pageSize=12/);
 assert.match(staff,/utils\.matches\(r,term\)/);
 assert.match(staff,/const parseTSV=text=>/);
 assert.match(staff,/const isoDate=\(text,year\)=>/);
 assert.match(markup,/Import Valid Rows as Drafts/);
 assert.match(style,/skres-admin-grid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(style,/appearance:none;-webkit-appearance:none/);
 assert.match(staff,/utils\.byNewest/);
});
test('Public page supports the same 2023-2027 year filtering, authors and pages',()=>{
 for(let yr=2023;yr<=2027;yr++)assert.match(publicHtml,new RegExp('data-skres-year="'+yr+'"'));
 assert.match(publicHtml,/id="skres-public-year-tabs"/);
 assert.match(publicHtml,/id="skres-public-page-count"/);
 assert.match(publicJs,/const pageSize=12/);
 assert.match(publicJs,/const visible=data.slice/);
 assert.match(publicJs,/r\.author/);
});
test('Existing individual add-edit and public publication guards are preserved',()=>{
 assert.match(staff,/data-skres-edit/);
 assert.match(staff,/data-skres-unpublish/);
 assert.match(staff,/allowedUrl\(params\.url\)/);
 assert.match(staff,/form\.elements\.published\.checked/);
 assert.match(handler,/path==='\/api\/sk-resolutions\/manage'&&method==='POST'/);
 assert.match(sql,/r\.published=true/);
});
test('All edited server and client JavaScript compiles',()=>{
 for(const file of ['dist/sk-resolutions-admin.js','dist/sk-resolutions.js','dist/account.js','lib/handler.cjs','lib/supabase.cjs'])
   assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});