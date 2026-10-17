'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../dist/portal.css'),'utf8');
const publishedStart=js.indexOf('function publishedCardDate(iso){');
const publishedEnd=js.indexOf('const galleryIds=p=>',publishedStart);
assert(publishedStart>=0&&publishedEnd>publishedStart);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const publishedCardDate=new Function('esc',js.slice(publishedStart,publishedEnd)+'\nreturn publishedCardDate;')(esc);
const renderStart=js.indexOf('function render(){');
const renderEnd=js.indexOf('// Broken public image links',renderStart);
assert(renderStart>=0&&renderEnd>renderStart);
function renderCards(projects){
 const fields={};
 for(const id of ['search','grid','count','stat-all','stat-active','stat-done','stat-planned'])
  fields[id]={value:'',textContent:'',innerHTML:''};
 const $=sel=>fields[sel.slice(1)];
 const create=new Function('projects','filter','$','esc','sortProjectsNewestFirst','galleryIds','galleryUrl','publishedCardDate',
 js.slice(renderStart,renderEnd)+'\nreturn render;');
 create(projects,'Lahat',$,esc,rows=>rows,x=>x.image_ids||[],x=>'./api/images/'+x,publishedCardDate)();
 return fields.grid.innerHTML;
}
const examples=[
 {id:'a',title:'Short',category:'Kalusugan',description:'Dental program.',status:'Natapos',progress:100,publish_at:'2026-10-17T07:57:00Z'},
 {id:'b',title:'SEPTEMBER 27, 2026 | AKLATANG BAYAN X PROJECT WE SMILE: DENTAL FLUORIDE PROGRAM',category:'Kalusugan',
  description:'Napakahabang buod tungkol sa isang makabuluhan at matagumpay na proyekto para sa mga kabataan at sa kanilang mga pamilya.',
  status:'Natapos',progress:100,publish_at:'2026-10-16T12:40:00Z'},
 {id:'c',title:'Oct 10 Meeting',category:'SK Regular Session',description:'Review session.',status:'Natapos',progress:100,publish_at:'2026-10-17T01:30:00Z'},
 {id:'d',title:'Health',category:'Kalusugan',description:'Activities.',status:'Pinaplano',progress:0,publish_at:null}
];
test('project footer is a single aligned component across differently-sized cards',()=>{
 const result=renderCards(examples);
 assert.equal((result.match(/class="project-card-bottom"/g)||[]).length,4);
 assert.equal((result.match(/class="project-card-progress"/g)||[]).length,4);
 assert.equal((result.match(/class="cardbottom"/g)||[]).length,4);
 assert.equal((result.match(/class="project-see-more"/g)||[]).length,4);
 assert.equal((result.match(/class="project-see-more-icon"/g)||[]).length,4);
 assert.equal((result.match(/class="project-card-publish-date"/g)||[]).length,4);
 assert.equal((result.match(/class="card-publish-date"/g)||[]).length,4);
 assert.equal((result.match(/data-id="/g)||[]).length,4);
});
test('publication date is concise, separated and uniform in Philippine Time',()=>{
 const markup=publishedCardDate('2026-10-17T07:57:00Z');
 assert.match(markup,/Oct 17, 2026/);
 assert.match(markup,/3:57 PM PHT/);
 assert.match(markup,/project-card-date-day/);
 assert.match(markup,/project-card-date-separator/);
 assert.match(markup,/project-card-date-time/);
 assert.match(markup,/<time datetime="2026-10-17T07:57:00\.000Z"/);
 assert.equal(publishedCardDate('invalid'),'<span class="project-card-date-missing">Petsa hindi naitala</span>');
});
test('See More has professional vector arrow and accessible title in all cards',()=>{
 const result=renderCards(examples);
 assert.match(result,/<button type="button" class="project-see-more" data-id="a" aria-label="See more details about Short">/);
 assert.match(result,/<span>See More<\/span><span class="project-see-more-icon"/);
 assert.match(result,/<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"/);
 assert.doesNotMatch(result,/See More ↗/);
});
test('CSS pins lower section to the bottom and gives all date and CTA rows fixed structure',()=>{
 assert.match(css,/#grid \.project-card-bottom\{margin-top:auto;display:flex;flex-direction:column/);
 assert.match(css,/#grid \.project-card-progress\{display:flex;flex-direction:column/);
 assert.match(css,/#grid \.cardbottom\{display:flex;flex-direction:column/);
 assert.match(css,/#grid \.cardbottom \.card-publish-date\{display:flex;align-items:center/);
 assert.match(css,/#grid \.project-card-published-at time\{display:flex/);
 assert.match(css,/#grid \.project-see-more\{display:flex;align-items:center;justify-content:space-between/);
 assert.match(css,/#grid\{gap:14px;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:950px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
});
