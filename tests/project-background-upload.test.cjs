'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../dist/account.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../dist/account.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../dist/admin-dashboard.css'),'utf8');
const a=js.indexOf('function captureProjectSave(automatic=false){');
const b=js.indexOf('async function loadUsers(){',a);
assert(a>=0&&b>a,'background queue implementation exists');
const snippet=js.slice(a,b);
function harness({failure=false}={}){
 let uploadResolve;
 const writes=[],toasts=[],successes=[];
 const editor={open:true,close(){this.open=false}};
 const form={elements:{publication_mode:{value:'now'}},onsubmit:null};
 const widgets={'#editor':editor,'#project-form':form,'#save-project':{disabled:false},
 '#project-publish-datetime':{value:''}};
 const api=async(url,options)=>{
  const data=JSON.parse(options.body);writes.push({url,method:options.method,data});
  return {project:{id:'project-1',version:writes.length,published:data.publication_mode!=='draft'}};
 };
 const uploadProjectPhoto=()=>failure?Promise.reject(Error('network failed')):
   new Promise(resolve=>{uploadResolve=resolve});
 const f=new Function('$','api','uploadProjectPhoto','projectUploadStatus',
  'projectSaveFeedback','success','message','loadProjects','updatePublicationFields',
  'FormData','scheduledDateIso','window','editing','editorPhotos','editorFormSignature',
  'let projectSaveJob=null,editorBaseline="";\n'+snippet+
  '\nreturn {startProjectSave,getJob:()=>projectSaveJob};'
 );
 const flow=f(id=>widgets[id],api,uploadProjectPhoto,
  (text,state)=>toasts.push({text,state}),()=>{},
  t=>successes.push(t),t=>successes.push('ERROR '+t),async()=>{},()=>{},
  class{},()=>null,{addEventListener(){}},null,[],()=>'');
 return {flow,editor,writes,toasts,successes,finish:()=>uploadResolve?.('photo-id-1'),
  hasUpload:()=>!!uploadResolve};
}
const newJob=mode=>({
 body:{title:'SK sample',category:'Kalusugan',description:'Dental program',
  scope:'Fluoride clinic',status:'Natapos',progress:100,publication_mode:mode,publish_at:null},
 record:null,automatic:mode==='draft',
 photos:[{id:null,file:{name:'photo.jpg',size:8000},source:{id:null}}]
});
test('a running Save uploads and links photos after the editor X is closed',async()=>{
 const app=harness(),job=newJob('now');
 const work=app.flow.startProjectSave(job);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.writes.length,1);
 assert.equal(app.writes[0].data.publication_mode,'draft');
 assert(app.hasUpload());
 app.editor.close();
 app.finish();
 await work;
 assert.equal(app.editor.open,false);
 assert.deepEqual(app.writes.map(x=>x.data.publication_mode),['draft','draft','now']);
 assert.deepEqual(app.writes[1].data.image_ids,['photo-id-1']);
 assert.equal(app.writes[1].data.image_id,'photo-id-1');
 assert.equal(job.photos[0].source.id,'photo-id-1');
 assert.equal(app.flow.getJob(),null);
 assert(app.toasts.some(x=>x.text.includes('Uploading photo 1 of 1')));
 assert(app.toasts.some(x=>x.state==='success'));
});
test('automatic X save retains private draft, with photo linked',async()=>{
 const app=harness(),job=newJob('draft');
 const work=app.flow.startProjectSave(job);
 await new Promise(resolve=>setImmediate(resolve));
 app.editor.close();app.finish();await work;
 assert.deepEqual(app.writes.map(x=>x.data.publication_mode),['draft','draft']);
 assert.equal(app.writes[1].data.image_id,'photo-id-1');
});
test('failed photo upload retains initial draft and reports incompleteness',async()=>{
 const app=harness({failure:true});await app.flow.startProjectSave(newJob('now'));
 assert.equal(app.writes.length,1);
 assert.equal(app.writes[0].data.publication_mode,'draft');
 assert(app.toasts.some(x=>x.state==='error'&&x.text.includes('incomplete')));
});
test('progress toast is independent of dialog with readable dark theme states',()=>{
 assert(html.indexOf('id="project-upload-progress"')<html.indexOf('<dialog id="editor"'));
 assert.match(html,/id="project-upload-progress"[^>]+popover="manual"/);
 assert.match(js,/toast\.showPopover\(\)/);
 assert.match(css,/#project-upload-progress\.project-upload-toast:popover-open/);
 assert.match(css,/data-state="success"/);
 assert.match(css,/data-state="error"/);
 assert.match(css,/#editor\.project-editor-modal \.project-save-feedback:not\(\.error\)/);
 assert.match(css,/#editor\.project-editor-modal \.publication-choice\.selected/);
 assert.match(js,/beforeunload/);
});
