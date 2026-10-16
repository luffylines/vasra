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
 assert.match(staffJs,/body\.publish_at=iso/);
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
