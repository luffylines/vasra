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
 assert.match(staff,/body\.image_ids=ids/);
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
 assert.match(publicCss,/\.portal-refresh #grid \.cover\{height:118px/);
 assert.match(publicCss,/height:90px;min-height:90px/);
 assert.match(publicCss,/-webkit-line-clamp:3/);
 assert.match(publicCss,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(publicCss,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(publicCss,/\.project-photo\[hidden\]\{display:none!important\}/);
 assert.match(worker,/vasra-v36-project-cover-cards/);
});

test('scripts remain syntactically valid and images are accessed through existing routes',()=>{
 for(const name of ['account.js','app.js','sw.js'])
  assert.doesNotThrow(()=>new Function(read(name)),name);
 assert.match(staff,/const managedPhotoUrl=id=>'\.\/api\/images\/'.*encodeURIComponent\(id\)/);
 assert.match(publicApp,/const galleryUrl=id=>'\.\/api\/images\/'.*encodeURIComponent\(id\)/);
 assert.doesNotMatch(staffHtml,/src="https?:\/\//);
});
