'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
const fb=fs.readFileSync(path.join(__dirname,'../lib/facebook-import.cjs'),'utf8');
const staff=fs.readFileSync(path.join(__dirname,'../dist/account.js'),'utf8');
const FB=require('../lib/facebook-import.cjs'),context=require('../lib/caption-analysis.cjs');
const datesStart=app.indexOf('// Read a valid date from a project title');
const datesEnd=app.indexOf('const galleryIds=p=>',datesStart);
assert(datesStart>=0&&datesEnd>datesStart);
const dates=new Function(app.slice(datesStart,datesEnd)+'\nreturn {projectActivityTimestamp,sortProjectsNewestFirst};')();
const caption=[
 '𝐒𝐄𝐏𝐓𝐄𝐌𝐁𝐄𝐑 𝟐𝟕, 𝟐𝟎𝟐𝟔 | 𝐀𝐊𝐋𝐀𝐓𝐀𝐍𝐆 𝐁𝐀𝐘𝐀𝐍 𝐗 𝐏𝐑𝐎𝐉𝐄𝐂𝐓 𝐖𝐄 𝐒𝐌𝐈𝐋𝐄: 𝐃𝐄𝐍𝐓𝐀𝐋 𝐅𝐋𝐔𝐎𝐑𝐈𝐃𝐄 𝐏𝐑𝐎𝐆𝐑𝐀𝐌',
 'Isang matagumpay na programa para sa mga Batang VASRA ang Aklatang Bayan at Project We Smile: Dental Fluoride Program noong ika-27 ng Setyembre, sa pakikipagtulungan ng Rotaract Club of Quezon City MediaTech at Sangguniang Kabataan ng Barangay VASRA.',
 'Nagsimula ang programa sa isang masayang storytelling tungkol sa responsableng paggamit ng internet at pagiging maingat sa pag-click ng mga link online.',
 'Sinundan ito ng isang Magic Show at makulay na coloring activity.',
 'Nagtapos ang programa sa pagbibigay kaalaman sa tamang pag-aalaga ng ating mga ngipin at pagbibigay ng Dental Fluoride services.',
 'Sinundan din ito ng pamamahagi ng school supplies at hygiene kits.&#x20;'
].join('\n');
test('public card sorting prioritizes October 12 over October 4 regardless of publication timestamp',()=>{
 const rows=[
  {id:'oct4',title:'OCTOBER 4, 2026 | Health outreach',publish_at:'2026-10-17T07:00:00Z'},
  {id:'oct12',title:'OCTOBER 12, 2026 | SK outreach',publish_at:'2026-10-15T07:00:00Z'},
  {id:'sept27',title:'SEPTEMBER 27, 2026 | Dental fluoride',publish_at:'2026-10-18T07:00:00Z'}
 ];
 assert.deepEqual(dates.sortProjectsNewestFirst(rows).map(r=>r.id),['oct12','oct4','sept27']);
 assert.deepEqual(rows.map(r=>r.id),['oct4','oct12','sept27']);
 assert.match(app,/const found=sortProjectsNewestFirst\(projects\.filter\(/);
});
test('supports stylized Unicode and Tagalog event-date headings',()=>{
 assert.equal(dates.projectActivityTimestamp({title:'𝐒𝐄𝐏𝐓𝐄𝐌𝐁𝐄𝐑 𝟐𝟕, 𝟐𝟎𝟐𝟔 | 𝐀𝐊𝐋𝐀𝐓𝐀𝐍𝐆 𝐁𝐀𝐘𝐀𝐍'}),Date.UTC(2026,8,27));
 assert.equal(dates.projectActivityTimestamp({title:'ika-4 ng Oktubre 2026 | Batang Vasra'}),Date.UTC(2026,9,4));
 assert.equal(dates.projectActivityTimestamp({title:'2026 project',activity_date:'2026-10-12'}),Date.UTC(2026,9,12));
});
test('pasted dental fluoride program detects Kalusugan and completed 100, without Groq',async()=>{
 const result=await FB.importFacebookPost({caption},{aiKey:'',fetcher:async()=>{throw Error('AI must not be contacted')}});
 assert.equal(result.draft.category,'Kalusugan');
 assert.equal(result.draft.status,'Natapos');
 assert.equal(result.draft.progress,100);
 assert.equal(result.draft.activity_date,'2026-09-27');
 assert.equal(result.draft.method,'basic');
 assert.match(result.draft.scope,/ngipin|hygiene|Magic Show/i);
 assert.equal(result.ai.status,'missing_key');
 assert.notEqual(result.draft.description,result.draft.scope);
});
test('future-only activity remains planned even when its date is in the past',()=>{
 assert.equal(context.detectStatus('OCTOBER 4, 2026\nNakatakdang gaganapin ang dental awareness program.').status,'Pinaplano');
 assert.equal(context.detectStatus('Nagtapos ang programa sa pagbibigay ng dental fluoride services.').status,'Natapos');
});
test('UI distinguishes Groq unavailable from actual AI analysis and preserves event date',()=>{
 assert.match(staff,/Basic rule-based draft \(not AI\)/);
 assert.match(staff,/facebookAiStatus\(result\.ai\)/);
 assert.match(staff,/new Date\(draft\.activity_date\+'T12:00:00Z'\)/);
});
test('upload flow retries only transient failures and retains partial DB links',()=>{
 assert.match(staff,/async function uploadPhotoRequest\(data,stage\)/);
 assert.match(staff,/const maxTries=3/);
 assert.match(staff,/if\(!transient\|\|attempt===maxTries\)/);
 assert.match(staff,/Saving photo '\+\(linked\+1\)/);
 assert.match(staff,/await saveProjectStage\(job,stage,job\.photos\.filter\(p=>p\.id\)\.map\(p=>p\.id\)\)/);
});
test('nonrecoverable upload errors cannot be silently swallowed',async()=>{
 const begin=staff.indexOf('async function uploadPhotoRequest(data,stage){');
 const end=staff.indexOf('async function uploadProjectPhoto(file,onProgress){',begin);
 assert(begin>=0&&end>begin);
 let requests=0;const status=[];
 const helper=new Function('api','projectUploadStatus','setTimeout',
  staff.slice(begin,end)+'\nreturn uploadPhotoRequest;'
 )(async()=>{
  requests++;
  throw Error('Invalid upload chunk.');
 },x=>status.push(x),setTimeout);
 await assert.rejects(()=>helper({action:'chunk',id:'id',index:0},'Uploading photo part 1'),/Invalid upload chunk/);
 assert.equal(requests,1);
 assert.equal(status.length,0);
});


test('newly uploaded September 12 activity never outranks October 10, October 3 or September 27',()=>{
 const rows=[
  {id:'sep12',title:'Sep 12, 2026 | RED FLAG OR RIGHT MOVE',publish_at:'2026-10-17T08:26:00Z'},
  {id:'oct10gear',title:'OCTOBER 10, 2026 | GEAR UP',publish_at:'2026-10-17T01:31:00Z'},
  {id:'oct10meeting',title:'OCTOBER 10, 2026 | 36TH SK VASRA REGULAR SESSION',publish_at:'2026-10-16T15:52:00Z'},
  {id:'oct3',title:'OCTOBER 3, 2026 | HANDOG SA BALIK ESKWELA',publish_at:'2026-10-17T07:25:00Z'},
  {id:'sep27',title:'SEPTEMBER 27, 2026 | AKLATANG BAYAN',publish_at:'2026-10-17T07:36:00Z'},
  {id:'aug29',title:'AUGUST 29, 2026 | PROJECT NUTRIMAGINE',publish_at:'2026-10-17T08:03:00Z'},
  {id:'aug27',title:'AUGUST 27, 2026 | FREE MEDICINES',publish_at:'2026-10-17T07:57:00Z'}
 ];
 assert.deepEqual(dates.sortProjectsNewestFirst(rows).map(p=>p.id),[
  'oct10gear','oct10meeting','oct3','sep27','sep12','aug29','aug27'
 ]);
 // Rendering/sorting must never mutate the loaded API response array.
 assert.equal(rows[0].id,'sep12');
});
test('abbreviated and localized dates are recognized, including Unicode bold headings',()=>{
 for(const title of ['Sep 12, 2026 | Program','Sept. 12, 2026 | Program',
   'September 12, 2026 | Program','𝐒𝐄𝐏 𝟏𝟐, 𝟐𝟎𝟐𝟔 | Program','12 Setyembre 2026 | Program']){
  assert.equal(dates.projectActivityTimestamp({title}),Date.UTC(2026,8,12),title);
 }
 for(const title of ['Oct 10, 2026 | SK Program','October 10, 2026 | SK Program','10 Oktubre 2026 | SK Program'])
  assert.equal(dates.projectActivityTimestamp({title}),Date.UTC(2026,9,10),title);
 assert.equal(dates.projectActivityTimestamp({title:'2026-09-27 | Project'}),Date.UTC(2026,8,27));
 assert(Number.isNaN(dates.projectActivityTimestamp({title:'February 31, 2026 | Invalid'})));
});
test('projects with no title date use their publication day among dated events',()=>{
 const rows=[
  {id:'unknown',title:'SK Project',publish_at:'2026-10-17T12:00:00Z'},
  {id:'known',title:'Sep 12, 2026 | Right Move',publish_at:'2026-10-10T12:00:00Z'}
 ];
 assert.deepEqual(dates.sortProjectsNewestFirst(rows).map(p=>p.id),['unknown','known']);
});
test('same activity day uses publish timestamp only as a stable tie breaker',()=>{
 const rows=[
  {id:'older',title:'OCTOBER 10, 2026 | Training',publish_at:'2026-10-11T00:00:00Z'},
  {id:'newer',title:'OCTOBER 10, 2026 | Seminar',publish_at:'2026-10-17T01:00:00Z'}
 ];
 assert.deepEqual(dates.sortProjectsNewestFirst(rows).map(p=>p.id),['newer','older']);
});
