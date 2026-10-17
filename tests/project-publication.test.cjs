'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'dist/projects.html'),'utf8');
const publicJs=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const staffJs=fs.readFileSync(path.join(root,'dist/account.js'),'utf8');
const staffHtml=fs.readFileSync(path.join(root,'dist/account.html'),'utf8');
const api=fs.readFileSync(path.join(root,'lib/handler.cjs'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261016215000_project_publication_schedule.sql'),'utf8');
test('SK staff can draft, publish now, schedule, and keep previous publication date',()=>{
 assert.match(staffHtml,/name="publication_mode"/);
 for(const mode of ['draft','now','schedule'])assert.match(staffHtml,new RegExp('value="'+mode+'"'));
 assert.match(staffHtml,/type="datetime-local"/);
 assert.match(staffJs,/function scheduledDateIso\(/);
 assert.match(staffJs,/function updatePublicationFields\(/);
 assert.match(staffJs,/publishMode\.value='keep'/);
 assert.match(staffJs,/body\.publication_mode=mode/);
 assert.match(staffJs,/body\.publish_at=date/);
 assert.match(staffJs,/form\.elements\.publication_mode\.value='draft'/);
});
test('scheduled local time is interpreted as Philippine Standard Time, independent of browser zone',()=>{
 const start=staffJs.indexOf('const phtLocalInput=');
 const end=staffJs.indexOf('function updatePublicationFields()',start);
 assert(start>=0&&end>start);
 const calc=new Function(staffJs.slice(start,end)+';return {phtLocalInput,scheduledDateIso};')();
 assert.equal(calc.scheduledDateIso('2026-12-24T18:30'),'2026-12-24T10:30:00.000Z');
 assert.equal(calc.phtLocalInput('2026-12-24T10:30:00.000Z'),'2026-12-24T18:30');
 assert.equal(calc.scheduledDateIso('2026-02-30T10:00'),null);
 assert.equal(calc.scheduledDateIso('bad'),null);
});
test('server rejects invalid schedule mode, old dates and malformed time',()=>{
 assert.match(api,/const mode=b\.publication_mode/);
 assert.match(api,/if\(mode==='keep'&&method!=='PUT'\)/);
 assert.match(api,/mode==='schedule'/);
 assert.match(api,/Date\.now\(\)\+30000/);
 assert.match(api,/p\.published=mode!=='draft'/);
 assert.match(api,/p\.publish_at=publishAt/);
});
test('public cards and project details show published date in Philippine time',()=>{
 assert.match(page,/\.\/app\.js/);
 assert.match(publicJs,/const publishedPHT=/);
 assert.match(publicJs,/timeZone:'Asia\/Manila'/);
 assert.match(publicJs,/Na-publish:/);
 assert.match(publicJs,/Na-publish noong/);
 assert.match(publicJs,/Petsa hindi naitala/);
});
test('database prevents early public project and gallery exposure',()=>{
 assert.match(migration,/ADD COLUMN IF NOT EXISTS publish_at timestamptz/);
 assert.match(migration,/where p\.published AND \(p\.publish_at IS NULL OR p\.publish_at<=clock_timestamp\(\)\)/);
 assert.match(migration,/p\.published=true AND \(p\.publish_at IS NULL OR p\.publish_at<=clock_timestamp\(\)\)/);
 assert.match(migration,/gallery image privacy guard/);
 assert.match(migration,/payload->>'publication_mode'='keep'/);
});

test('picker suggests a future Philippine time and warns before saving if time already passed',()=>{
 const start=staffJs.indexOf('const phtLocalInput='),end=staffJs.indexOf('let editorPhotos=[]',start);
 assert(start>=0&&end>start);
 const now=Date.parse('2026-10-16T14:09:00Z'); // 10:09 PM Philippine Time
 class FixedDate extends Date {static now(){return now;}}
 const elements={
  '#project-publication-mode':{value:'draft',events:{},addEventListener(n,fn){this.events[n]=fn;}},
  '#project-publish-datetime':{value:'',events:{},addEventListener(n,fn){this.events[n]=fn;}},
  '#project-publish-datetime-wrap':{hidden:true},
  '#project-publish-preview':{textContent:'',classList:{flags:new Set(),add(n){this.flags.add(n)},remove(n){this.flags.delete(n)}}}
 };
 const $=selector=>elements[selector];
 const controller=new Function('$','Date','editing','phPublicationDate',staffJs.slice(start,end)+
  ';return {updatePublicationFields,nextSchedulePHInput,scheduledDateIso};')($,FixedDate,null,x=>x);
 assert.equal(controller.nextSchedulePHInput(),'2026-10-16T22:25');
 elements['#project-publication-mode'].value='schedule';
 elements['#project-publication-mode'].events.change();
 assert.equal(elements['#project-publish-datetime'].value,'2026-10-16T22:25');
 assert.equal(elements['#project-publish-datetime'].required,true);
 assert.equal(elements['#project-publish-datetime'].min,'2026-10-16T22:10');
 elements['#project-publish-datetime'].value='2026-10-16T22:08';
 elements['#project-publish-datetime'].events.input();
 assert.match(elements['#project-publish-preview'].textContent,/Lumipas na/);
 assert(elements['#project-publish-preview'].classList.flags.has('publication-time-error'));
 elements['#project-publish-datetime'].value='2026-10-16T22:30';
 elements['#project-publish-datetime'].events.input();
 assert.match(elements['#project-publish-preview'].textContent,/Scheduled for/);
 assert(!elements['#project-publish-preview'].classList.flags.has('publication-time-error'));
});

test('editing: Publish Now, Draft, or Keep current ignore a stale scheduled date',()=>{
 const start=staffJs.indexOf('const phtLocalInput='),end=staffJs.indexOf('let editorPhotos=[]',start);
 assert(start>=0&&end>start);
 const now=Date.parse('2026-10-16T14:09:00Z');
 class FixedDate extends Date {static now(){return now;}}
 const input={
  value:'2026-10-15T10:00',min:'',required:false,disabled:false,customError:'',
  events:{},addEventListener(n,fn){this.events[n]=fn;},
  setCustomValidity(v){this.customError=v;},
  checkValidity(){
   return this.disabled||(!this.customError&&(!this.required||!!this.value)&&(!this.min||this.value>=this.min));
  }
 };
 const selector={
  '#project-publication-mode':{value:'keep',events:{},addEventListener(n,fn){this.events[n]=fn;}},
  '#project-publish-datetime':input,
  '#project-publish-datetime-wrap':{hidden:false},
  '#project-publish-preview':{textContent:'',classList:{add(){},remove(){}}}
 };
 const $=key=>selector[key]||null;
 const controller=new Function('$','Date','editing','phPublicationDate','projectPublishStatus',
  staffJs.slice(start,end)+';return {updatePublicationFields};'
 )($,FixedDate,{published:true},x=>x,()=> 'Published');
 for(const mode of ['keep','now','draft']){
  selector['#project-publication-mode'].value=mode;
  controller.updatePublicationFields();
  assert.equal(input.disabled,true,mode+' must disable scheduled input');
  assert.equal(input.required,false,mode+' must not require a scheduled time');
  assert.equal(input.min,'',mode+' must remove stale min constraint');
  assert.equal(selector['#project-publish-datetime-wrap'].hidden,true,mode);
  assert.equal(input.checkValidity(),true,mode+' must not block submit');
 }
 selector['#project-publication-mode'].value='schedule';
 selector['#project-publication-mode'].events.change();
 assert.equal(input.disabled,false);
 assert.equal(input.required,true);
 assert.equal(input.min,'2026-10-16T22:10');
 assert.equal(input.value,'2026-10-16T22:25');
 assert.equal(input.checkValidity(),true);
 // The deadline is enforced again only while Schedule remains active.
 input.value='2026-10-15T10:00';
 assert.equal(input.checkValidity(),false);
 selector['#project-publication-mode'].value='now';
 selector['#project-publication-mode'].events.change();
 assert.equal(input.checkValidity(),true);
});
