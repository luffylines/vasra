'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandler}=require('../lib/handler.cjs');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'dist/account.js'),'utf8');
const html=fs.readFileSync(path.join(root,'dist/account.html'),'utf8');
const css=fs.readFileSync(path.join(root,'dist/admin-dashboard.css'),'utf8');
const source=fs.readFileSync(path.join(root,'lib/handler.cjs'),'utf8');
const projectId='aaff0000-1111-4444-8888-bbff00000001';
const token='A'.repeat(48);
const base='https://vasra.example';
const draft={title:'Test project',category:'Edukasyon',description:'Testing edits',
 scope:'Coverage of the project',status:'Isinasagawa',progress:50,
 image_ids:[],image_id:null,version:7,publication_mode:'keep',published:true,publish_at:null};
function createMock(role='chairman',deleteResult={ok:true,id:projectId}){
 const calls=[];
 const backend={rpc:async(action,payload,session)=>{
  calls.push({action,payload,session});
  if(action==='me')return {id:'actor',role,must_change:false,name:'Test SK Staff'};
  if(action==='rate_limit')return {allowed:true};
  if(action==='gallery_verify')return {ok:true};
  if(action==='save_project')return {...payload,id:projectId,version:8};
  if(action==='gallery_set')return {ok:true,image_ids:payload.image_ids};
  if(action==='project_delete')return deleteResult;
  throw Error('Unexpected backend action: '+action);
 }};
 return {calls,handler:createHandler({backend,config:{origin:base,secure:true}})};
}
async function request(handler,method,body,origin=base){
 const req=new Request(base+'/api/manage/projects/'+projectId,{
  method,
  headers:{'content-type':'application/json','origin':origin,'cookie':'vasra_session='+token},
  body:JSON.stringify(body)
 });
 const res=await handler(req);
 return {status:res.status,body:await res.json()};
}
test('Both SK Chairman and SK officers can DELETE a versioned project',async()=>{
 for(const role of ['chairman','sk']){
  const {handler,calls}=createMock(role);
  const res=await request(handler,'DELETE',{version:7});
  assert.equal(res.status,200,role+': '+JSON.stringify(res.body));
  assert.deepEqual(res.body,{ok:true,id:projectId});
  assert(calls.some(x=>x.action==='project_delete'&&x.payload.id===projectId&&x.payload.version===7));
 }
});
test('DELETE still enforces role, CSRF origin, version and financial-history protection',async()=>{
 const youth=createMock('youth');
 assert.equal((await request(youth.handler,'DELETE',{version:7})).status,403);
 assert(!youth.calls.some(x=>x.action==='project_delete'));
 const fake=createMock();
 assert.equal((await request(fake.handler,'DELETE',{version:7},'https://evil.example')).status,403);
 assert(!fake.calls.some(x=>x.action==='project_delete'));
 assert.equal((await request(fake.handler,'DELETE',{version:-1})).status,400);
 assert.equal((await request(fake.handler,'PATCH',{version:7})).status,405);
 const reports=createMock('chairman',{error:409,reason:'monthly_reports'});
 const error=await request(reports.handler,'DELETE',{version:7});
 assert.equal(error.status,409);
 assert.match(error.body.error,/monthly reports/);
});
test('existing project edit with KEEP publication mode uses PUT and does not erase content',async()=>{
 const {handler,calls}=createMock();
 const result=await request(handler,'PUT',draft);
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.project.id,projectId);
 assert.equal(result.body.project.title,draft.title);
 assert.equal(result.body.project.published,true);
 assert.equal(result.body.project.version,8);
 assert(calls.some(x=>x.action==='save_project'&&x.payload.version===7&&x.payload.title===draft.title));
 assert(calls.some(x=>x.action==='gallery_set'&&x.payload.project_id===projectId));
});
test('edit errors and native invalid inputs are visible by Save, not silently discarded',()=>{
 assert.match(html,/id="project-save-feedback"/);
 assert.match(js,/function projectSaveFeedback\(text='',error=false\)/);
 assert.match(js,/addEventListener\('invalid',e=>/);
 assert.match(js,/control\.validationMessage/);
 assert.match(js,/projectSaveFeedback\(detail,true\)/);
 assert.match(js,/method:wasEditing\?'PUT':'POST'/);
 assert.match(js,/if\(save\.disabled\)return;/);
 assert.match(css,/#editor\.project-editor-modal \.project-save-feedback\.error/);
});
test('delete confirmation offers exact-name copy, without bypassing typed-name verification',()=>{
 assert.match(html,/id="delete-project-copy-name"/);
 assert.match(html,/id="delete-project-copy-status"/);
 assert.match(html,/id="delete-project-confirm-name"/);
 assert.match(js,/navigator\.clipboard\.writeText\(p\.title\)/);
 assert.match(js,/e\.target\.value\.trim\(\)!==pendingDeleteProject\.title/);
 assert.match(js,/\$\('#delete-project-input'\)\.value\.trim\(\)!==p\.title/);
 assert.match(css,/#delete-project-dialog \.delete-project-copy-row/);
});
test('server allowlist includes DELETE without allowing arbitrary methods',()=>{
 assert.match(source,/\['GET','POST','PUT','DELETE'\]\.includes\(method\)/);
 assert.match(source,/await user\(\['sk','chairman'\]\)/);
 assert.match(source,/result\?\.error===409&&result\.reason==='monthly_reports'/);
});

test('Facebook caption analysis accepts SK officers, denies youth accounts',async()=>{
 for(const role of ['chairman','sk']){
  const {handler}=createMock(role);
  const response=await handler(new Request(base+'/api/manage/projects/import-facebook',{
   method:'POST',
   headers:{'content-type':'application/json','origin':base,'cookie':'vasra_session='+token},
   body:JSON.stringify({caption:'Youth Leadership Training para sa mga kabataan sa Barangay Vasra.'})
  }));
  assert.equal(response.status,200,role);
  const parsed=await response.json();
  assert.equal(parsed.ok,true);
  assert.equal(parsed.draft.category,'Edukasyon');
 }
 const {handler}=createMock('youth');
 const response=await handler(new Request(base+'/api/manage/projects/import-facebook',{
   method:'POST',
   headers:{'content-type':'application/json','origin':base,'cookie':'vasra_session='+token},
   body:JSON.stringify({caption:'Youth Leadership Training para sa mga kabataan sa Barangay Vasra.'})
 }));
 assert.equal(response.status,403);
});
test('Authorized SK officers also see project deletion and Facebook import controls',()=>{
 assert.match(js,/\$\{\['sk','chairman'\]\.includes\(user\?\.role\)\?'<button type="button" class="project-delete-trigger"/);
 assert.match(js,/if\(!p\|\|!\['sk','chairman'\]\.includes\(user\?\.role\)\)return;/);
 assert.match(js,/const facebook=mode==='facebook'&&!editing&&\['sk','chairman'\]\.includes\(user\?\.role\)/);
});

test('SK officer deletion migration retains authorization, record version and financial safeguards',()=>{
 const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261017094500_sk_officer_project_permissions.sql'),'utf8');
 assert.match(migration,/u\.role IN \('sk','chairman'\)/);
 assert.match(migration,/NOT u\.must_change/);
 assert.match(migration,/project_row\.version<>\(payload->>'version'\)::integer/);
 assert.match(migration,/report_count>0/);
 assert.match(migration,/reason','monthly_reports'/);
 assert.match(migration,/INSERT INTO vasra\.audit/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.vasra_project_delete\(text,jsonb,text\) TO service_role/);
 assert.doesNotMatch(migration,/GRANT EXECUTE ON FUNCTION public\.vasra_project_delete\(text,jsonb,text\) TO (?:anon|authenticated)/);
});
test('Project delete access is limited to SK role while account/roster management stays Chairman only',()=>{
 assert.match(source,/await user\(\['chairman'\]\); const b = await body\(\); if \(!\['sk','youth'\]\.includes\(b\.role\)\)/);
 assert.match(js,/if\(\['roster','users','audit'\]\.includes\(name\)&&user\?\.role!=='chairman'\)/);
});
