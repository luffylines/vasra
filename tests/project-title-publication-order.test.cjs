'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=pathName=>fs.readFileSync(path.join(root,pathName),'utf8');
const app=read('dist/app.js'),shared=read('dist/project-event-order.js');
const a=app.indexOf('// Read a valid date from a project title');
const b=app.indexOf('// Compact card date:',a);
assert(a>=0&&b>a,'sort helpers must be found');
const source=app.slice(a,b);
const helper=new Function(source+'\nreturn {projectActivityTimestamp,projectSortDay,sortProjectsNewestFirst};')();
const other=new Function('window',shared+'\nreturn window.SKProjectOrder;')({});
const normal=[
 {id:'oct3',title:'𝐎𝐂𝐓𝐎𝐁𝐄𝐑 𝟑, 𝟐𝟎𝟐𝟔 | 𝐇𝐀𝐍𝐃𝐎𝐆 𝐒𝐀 𝐁𝐀𝐋𝐈𝐊 𝐄𝐒𝐊𝐖𝐄𝐋𝐀',publish_at:'2026-10-27T03:00:00Z'},
 {id:'oct21',title:'Oct 21, 2026 | Girls Summit 2026',publish_at:'2026-10-21T02:00:00Z'},
 {id:'oct12',title:'OCTOBER 12, 2026 | SK PROGRAM',publish_at:'2026-10-27T02:00:00Z'},
 {id:'noDateOct15',title:'General SK Project',publish_at:'2026-10-15T04:00:00Z'},
 {id:'noDateOct25',title:'Community Cleanup',publish_at:'2026-10-25T04:00:00Z'},
 {id:'missingDate',title:'Old project',publish_at:null}
];
test('newest title date first, undated titles follow publication day in the same chronology',()=>{
 const expected=['noDateOct25','oct21','noDateOct15','oct12','oct3','missingDate'];
 const ordered=helper.sortProjectsNewestFirst(normal);
 assert.deepEqual(ordered.map(x=>x.id),expected);
 assert.equal(normal[0].id,'oct3','original API array is not mutated');
 assert.deepEqual(other.sortProjectsNewestFirst(normal).map(x=>x.id),expected);
});
test('Unicode bold dates, Oct abbreviation, day first and invalid dates are parsed safely',()=>{
 assert.equal(helper.projectSortDay({title:'𝗢𝗖𝗧𝗢𝗕𝗘𝗥 𝟯, 𝟮𝟬𝟮𝟲 | HANDOG'}),Date.UTC(2026,9,3));
 assert.equal(helper.projectSortDay({title:'Oct 21, 2026 | Girls Summit 2026'}),Date.UTC(2026,9,21));
 assert.equal(helper.projectSortDay({title:'21 Oktubre 2026 | Girls Summit'}),Date.UTC(2026,9,21));
 assert.equal(helper.projectSortDay({title:'February 31, 2026 | Bad date',publish_at:'2026-10-15T00:00:00Z'}),Date.UTC(2026,9,15));
 assert.equal(helper.projectSortDay({title:'Without a date',publish_at:'2026-10-20T16:30:00Z'}),Date.UTC(2026,9,21),'use Philippine calendar date near midnight');
 assert(Number.isNaN(helper.projectSortDay({title:'No date',publish_at:null})));
});
test('title date overrides unrelated metadata, and equal days use latest publication as tie breaker',()=>{
 const list=[
  {id:'older',title:'Oct 21, 2026 | Summit',publish_at:'2026-10-21T01:00:00Z',activity_date:'2026-09-01'},
  {id:'newer',title:'Oct 21, 2026 | Project',publish_at:'2026-10-22T01:00:00Z'},
  {id:'dateOnly',title:'Some project',publish_at:'2026-10-21T10:00:00Z'}
 ];
 assert.deepEqual(helper.sortProjectsNewestFirst(list).map(x=>x.id),['newer','dateOnly','older']);
});
test('public, homepage and staff use the same comparator and versioned assets',()=>{
 assert(shared.includes(source),'shared staff/home sorting must match public source exactly');
 const staff=read('dist/account.js'),home=read('dist/home-landing.js');
 assert.match(staff,/SKProjectOrder\.sortProjectsNewestFirst\(projectRows\)/);
 assert.match(home,/SKProjectOrder\.sortProjectsNewestFirst\(all\)/);
 for(const [file,script] of [['dist/account.html','account.js'],['dist/index.html','home-landing.js']]){
  const html=read(file);
  assert(html.indexOf('./project-event-order.js?v=20261027-title-date-v1')<html.indexOf('./'+script+'?v='+(script==='account.js'?'20261027-manual-card-v1':'20261027-title-date-v1')));
 }
 assert.match(read('dist/projects.html'),/app\.js\?v=20261027-title-date-v1/);
 const sw=read('dist/sw.js');assert.match(sw,/\.\/project-event-order\.js/);
});
