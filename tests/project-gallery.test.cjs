'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dist=path.join(__dirname,'../dist');
const backend=fs.readFileSync(path.join(__dirname,'../lib/handler.cjs'),'utf8');
const supabase=fs.readFileSync(path.join(__dirname,'../lib/supabase.cjs'),'utf8');
const publicApp=fs.readFileSync(path.join(dist,'app.js'),'utf8');
const editor=fs.readFileSync(path.join(dist,'account.js'),'utf8');
const html=fs.readFileSync(path.join(dist,'account.html'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261016192000_gallery_preflight.sql'),'utf8');

test('new/edit project modal allows a maximum of eight photos with previews and cover changes',()=>{
 assert.match(html,/id="editor-files"[^>]+multiple/);
 assert.match(editor,/editorPhotos\.length>8|files\.length\+editorPhotos\.length>8/);
 assert.match(editor,/file\.size>5242880/);
 assert.match(editor,/URL\.createObjectURL\(file\)/);
 assert.match(editor,/URL\.revokeObjectURL\(/);
 assert.match(editor,/data-photo-cover/);
 assert.match(editor,/data-photo-remove/);
 assert.match(editor,/body\.image_id=ids\[0\]\|\|null/);
 assert.match(editor,/body\.image_ids=ids/);
});
test('gallery is secured and is validated before project save',()=>{
 assert.match(supabase,/action\.startsWith\('gallery_'\)/);
 assert.match(backend,/gallery_verify/);
 assert.match(backend,/gallery_set/);
 assert(backend.indexOf('gallery_verify')<backend.indexOf("const project=await rpc('save_project',p)"));
 assert.match(backend,/gallery_image/);
 assert.match(backend,/ids\.length>8/);
 assert.match(migration,/i\.owner<>actor\.id/);
 assert.match(migration,/p\.published OR actor\.id IS NOT NULL/);
 assert.match(migration,/requested_count>8/);
 assert.match(migration,/RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER/);
 assert.match(migration,/NOT EXISTS\(SELECT 1 FROM vasra\.project_gallery/);
});
test('public projects display first photo only; details have the complete gallery',()=>{
 assert.match(publicApp,/const galleryIds=p=>/);
 assert.match(publicApp,/project-photo-badge/);
 assert.match(publicApp,/See More ↗/);
 assert.match(publicApp,/function projectGallery\(p\)/);
 assert.match(publicApp,/project-gallery-thumbs/);
 assert.match(publicApp,/data-gallery-image/);
 assert.match(publicApp,/detail-cover-image/);
 assert.match(backend,/gallery_public/);
 assert.match(backend,/gallery_manage/);
});
