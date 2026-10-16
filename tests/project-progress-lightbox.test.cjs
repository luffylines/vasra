'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const files={
  app:fs.readFileSync(path.join(root,'dist/app.js'),'utf8'),
  projectHtml:fs.readFileSync(path.join(root,'dist/projects.html'),'utf8'),
  projectCss:fs.readFileSync(path.join(root,'dist/portal.css'),'utf8'),
  staff:fs.readFileSync(path.join(root,'dist/account.js'),'utf8'),
  staffHtml:fs.readFileSync(path.join(root,'dist/account.html'),'utf8'),
  staffCss:fs.readFileSync(path.join(root,'dist/admin-dashboard.css'),'utf8'),
  api:fs.readFileSync(path.join(root,'lib/handler.cjs'),'utf8'),
  connector:fs.readFileSync(path.join(root,'lib/supabase.cjs'),'utf8'),
  migration:fs.readFileSync(path.join(root,'supabase/migrations/20261016203000_project_progress.sql'),'utf8'),
};
test('every gallery photo opens the enlarged viewer without altering image data',()=>{
  assert.match(files.app,/function openProjectLightbox\(/);
  assert.match(files.app,/function advanceLightbox\(/);
  assert.match(files.app,/openProjectLightbox\(\);return;/);
  assert.match(files.app,/galleryUrl\(lightboxImages\[lightboxIndex\]\)/);
  assert.match(files.app,/const thumb=e\.target\.closest\('\[data-gallery-image\]'\)/);
  assert.match(files.app,/e\.key==='ArrowLeft'/);
  assert.match(files.app,/e\.key==='ArrowRight'/);
  assert.match(files.projectHtml,/id="image-lightbox"/);
  assert.match(files.projectHtml,/id="lightbox-image"/);
  assert.match(files.projectHtml,/id="lightbox-prev"/);
  assert.match(files.projectHtml,/id="lightbox-next"/);
  assert.match(files.projectCss,/#image-lightbox/);
  assert.match(files.projectCss,/object-fit:contain/);
  assert.match(files.projectCss,/@media\(max-width:600px\)/);
});
test('quick progress is discoverable on planned and ongoing project rows',()=>{
  assert.match(files.staff,/data-progress/);
  assert.match(files.staff,/p\.status!=='Natapos'/);
  assert.match(files.staff,/function openProgressDialog/);
  assert.match(files.staff,/const projectProgressStatus=/);
  assert.match(files.staff,/0\?'Pinaplano':value===100\?'Natapos':'Isinasagawa'/);
  assert.match(files.staffHtml,/id="progress-dialog"/);
  assert.match(files.staffHtml,/id="progress-number"/);
  assert.match(files.staffHtml,/id="progress-range"/);
  assert.match(files.staffHtml,/data-progress-preset="25"/);
  assert.match(files.staffCss,/\.project-progress-trigger/);
});
test('progress update uses authenticated minimal endpoint and optimistic concurrency',()=>{
  assert.match(files.staff,/method:'POST',body:JSON\.stringify\(\{progress:n,version:p\.version\}\)/);
  assert.match(files.api,/await user\(\['sk','chairman'\]\)/);
  assert.match(files.api,/method === 'POST'/);
  assert.match(files.api,/b\.progress>100/);
  assert.match(files.api,/rpc\('project_progress'/);
  assert.match(files.connector,/vasra_project_progress/);
  assert.match(files.migration,/u\.role IN \('chairman','sk'\)/);
  assert.match(files.migration,/old_row\.version<>/);
  assert.match(files.migration,/version=version\+1/);
  assert.match(files.migration,/'project_progress_updated'/);
  assert.match(files.migration,/GRANT EXECUTE ON FUNCTION public\.vasra_project_progress/);
  assert.match(files.migration,/REVOKE ALL ON FUNCTION public\.vasra_project_progress/);
});
