'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'../dist');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const staff=read('account.js'),staffHtml=read('account.html'),staffCss=read('admin-dashboard.css');
const publicApp=read('app.js'),publicCss=read('portal.css'),worker=read('sw.js');

test('project covers choose the first gallery photo before legacy image_id',()=>{
 const publicHelper=publicApp.match(/const galleryIds=p=>[^\n]+;/)?.[0];
 const staffHelper=staff.match(/const managedGalleryIds=p=>[^\n]+;/)?.[0];
 assert(publicHelper&&staffHelper,'both gallery helpers must exist');
 const c=vm.createContext({});
 vm.runInContext(publicHelper+'\n'+staffHelper,c);
 for(const name of ['galleryIds','managedGalleryIds']){
  const evalIds=source=>Array.from(vm.runInContext(name+'('+JSON.stringify(source)+')',c));
  assert.deepEqual(evalIds({image_ids:['primary','secondary'],image_id:'stale'}),['primary','secondary']);
  assert.deepEqual(evalIds({image_ids:[],image_id:'legacy'}),['legacy']);
  assert.deepEqual(evalIds({image_ids:[],image_id:null}),[]);
 }
 assert.match(publicApp,/galleryUrl\(galleryIds\(p\)\[0\]\)/);
 assert.match(publicApp,/data-project-cover/);
 assert.match(publicApp,/addEventListener\('error',event=>/);
});

test('SK-only gallery is reachable from thumbnails without changing existing actions',()=>{
 assert.match(staff,/data-view-gallery/);
 assert.match(staff,/project-manage-thumbnail/);
 assert.match(staff,/function openStaffGallery\(p\)/);
 assert.match(staff,/\['sk','chairman'\]\.includes\(user\?\.role\)/);
 assert.match(staff,/staffGalleryImages=ids\.slice\(\)/);
 assert.match(staff,/data-progress/);
 assert.match(staff,/data-edit/);
 assert.match(staff,/data-delete/);
 assert.match(staff,/image_ids:ids,image_id:ids\[0\]\|\|null/);
 assert.match(staffHtml,/id="staff-project-gallery"/);
 for(const id of ['staff-gallery-image','staff-gallery-prev','staff-gallery-next','staff-gallery-close','staff-gallery-count'])
  assert(staffHtml.includes('id="'+id+'"'),id);
 assert.match(staff,/e\.key==='ArrowLeft'/);
 assert.match(staff,/e\.key==='ArrowRight'/);
});

test('staff thumbnails and public project cards stay dense and responsive',()=>{
 assert.match(staffCss,/#managed-projects \.project-manage-row\{/);
 assert.match(staffCss,/grid-template-columns:104px minmax\(0,1fr\) auto/);
 assert.match(staffCss,/width:104px;height:78px/);
 assert.match(staffCss,/width:72px;height:56px/);
 assert.match(staffCss,/#staff-project-gallery/);
 assert.match(staffCss,/object-fit:contain/);
 assert.match(publicCss,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(publicCss,/aspect-ratio:16 \/ 9/);
 assert.match(publicCss,/-webkit-line-clamp:3/);
 assert.match(publicCss,/object-fit:contain;object-position:center/);
 assert.match(publicCss,/@media\(max-width:1250px\)/);
 assert.match(publicCss,/@media\(max-width:950px\)/);
 assert.doesNotMatch(publicCss,/\.portal-refresh #grid \.cover\{height:118px/);
 assert.match(publicCss,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(publicCss,/\.project-photo\[hidden\]\{display:none!important\}/);
 assert.match(worker,/vasra-v37-full-project-covers/);
});

test('scripts remain syntactically valid and images are accessed through existing routes',()=>{
 for(const name of ['account.js','app.js','sw.js'])
  assert.doesNotThrow(()=>new Function(read(name)),name);
 assert.match(staff,/const managedPhotoUrl=id=>'\.\/api\/images\/'.*encodeURIComponent\(id\)/);
 assert.match(publicApp,/const galleryUrl=id=>'\.\/api\/images\/'.*encodeURIComponent\(id\)/);
 assert.doesNotMatch(staffHtml,/src="https?:\/\//);
});
test('draft cards have safe Publish Now action and a confirmation dialog',()=>{
 assert.match(staff,/data-publish/);
 assert.match(staff,/!p\.published&&\['sk','chairman'\]\.includes\(user\?\.role\)/);
 assert.match(staff,/function openPublishProject\(p\)/);
 assert.match(staff,/function draftPublishPayload\(p\)/);
 assert.match(staff,/result\.project\.published!==true/);
 assert.match(staff,/method:'PUT',body:JSON\.stringify\(draftPublishPayload\(p\)\)/);
 assert.match(staffHtml,/id="publish-project-dialog"/);
 assert.match(staffHtml,/id="publish-project-confirm"/);
 assert.match(staffCss,/#managed-projects \.project-publish-trigger/);
});
test('publishing payload preserves details, image order, and project version',()=>{
 const c=vm.createContext({});
 const gallery=staff.match(/const managedGalleryIds=p=>[^\n]+;/)?.[0];
 const payload=staff.slice(staff.indexOf('function draftPublishPayload(p)'),staff.indexOf('let pendingPublishProject=null'));
 assert(gallery&&payload);
 vm.runInContext(gallery+'\n'+payload,c);
 const p={id:'id',version:7,title:'School project',category:'Edukasyon',description:'Summary',
  scope:'Scope',status:'Natapos',progress:100,image_id:'old',image_ids:['cover','two'],published:false};
 const result=vm.runInContext('draftPublishPayload('+JSON.stringify(p)+')',c);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{
  title:'School project',category:'Edukasyon',description:'Summary',scope:'Scope',
  status:'Natapos',progress:100,image_ids:['cover','two'],image_id:'cover',
  version:7,publication_mode:'now',published:true,publish_at:null
 });
});
test('project editor scrolls internally while header and action footer stay visible',()=>{
 assert.match(staffHtml,/id="project-editor-scroll"/);
 assert.match(staffHtml,/id="editor-cancel"/);
 assert.match(staffHtml,/id="project-save-note"/);
 assert.match(staff,/\$\('#editor-cancel'\)\.onclick=/);
 assert.match(staffCss,/#editor\.project-editor-modal\[open\]/);
 assert.match(staffCss,/#editor\.project-editor-modal #project-editor-scroll/);
 assert.match(staffCss,/overflow-y:auto;overscroll-behavior:contain/);
 assert.match(staffCss,/#editor\.project-editor-modal \.editor-footer/);
});
test('publication choices use accessible buttons but preserve the existing select as form source',()=>{
 assert.match(staffHtml,/id="project-publication-choices"/);
 for(const mode of ['draft','now','schedule','keep'])assert(staffHtml.includes('data-publication-option="'+mode+'"'));
 assert.match(staffHtml,/id="project-publication-mode" tabindex="-1" aria-hidden="true"/);
 assert.match(staff,/publicationChoices\.addEventListener\('click'/);
 assert.match(staff,/dataset\.publicationOption/);
 assert.match(staff,/dispatchEvent\(new Event\('change'/);
 assert.match(staff,/save\.insertAdjacentHTML\('beforeend',managementActionIcon\('right'\)\)/);
 assert.match(staff,/if\(note\)note\.textContent=/);
 assert.match(staffCss,/#editor #project-publication-choices/);
});
