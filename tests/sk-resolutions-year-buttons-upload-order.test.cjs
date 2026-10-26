'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const window={};
vm.runInNewContext(read('dist/sk-resolutions-utils.js'),{window,Date,Intl,Object,String,Number,RegExp}, {filename:'sk-resolutions-utils.js'});
const u=window.SKResolutionUtils;
test('All five year buttons and View All appear on both staff and public pages',()=>{
 for(const path of ['dist/account.html','dist/sk-resolutions.html']){
  const html=read(path);
  assert.match(html,/data-skres-year="all"/);
  for(const y of u.years)assert.match(html,new RegExp('data-skres-year="'+y+'"'));
  assert.match(html,/aria-pressed="true"/);
  assert.match(html,/sk-resolutions-utils\.js\?v=/);
 }
});
test('Approval dates searchable as ISO, US slash, and full/short month',()=>{
 const r={number:'SKR034-26',title:'A RESOLUTION ON THE COMMUNITY PROGRAM',year:2026,
  author:'Sample Author',approved_on:'2026-02-14',description:''};
 for(const q of ['2026-02-14','02/14/2026','2/14/2026','February 14, 2026',
  'Feb 14 2026','14 February 2026','2026','SKR034','sample author'])assert.equal(u.matches(r,q),true,q);
 assert.equal(u.matches(r,'June 28 2026'),false);
});
test('New uploads sort before older uploads even when approval date is older',()=>{
 const r=[
  {id:'old',year:2026,approved_on:'2026-10-10',created_at:'2026-10-01T01:00:00Z'},
  {id:'new',year:2023,approved_on:'2023-01-01',created_at:'2026-10-26T05:00:00Z'},
  {id:'older',year:2023,approved_on:'2023-12-31',created_at:'2026-01-01T01:00:00Z'}
 ];
 assert.deepEqual(r.sort(u.byNewest).map(x=>x.id),['new','older','old']);
 assert.deepEqual(r.filter(x=>x.year===2023).map(x=>x.id),['new','older']);
 assert.deepEqual(u.yearCounts(r),{all:3,'2023':2,'2024':0,'2025':0,'2026':1,'2027':0});
});
test('Staff selection and new import follow the saved year, public filters match',()=>{
 const staff=read('dist/sk-resolutions-admin.js'),pub=read('dist/sk-resolutions.js');
 assert.match(staff,/setYear\(String\(params\.year\)\);reset\(\);await load\(\)/);
 assert.match(staff,/setYear\(year\.value\);reset\(\);await load\(\)/);
 assert.match(staff,/form\.elements\.year\.value=selectedYear==='all'\?defaultYear\(\):selectedYear/);
 assert.match(staff,/saved=\[\.\.\.data\.resolutions\]\.sort\(utils\.byNewest\)/);
 assert.match(pub,/rows=\[\.\.\.data\.resolutions\]\.sort\(utils\.byNewest\)/);
 assert.match(pub,/utils\.matches\(r,needle\)/);
 const migration=read('supabase/migrations/20261026163000_sk_resolutions_uploaded_order.sql');
 assert.match(migration,/created_at SET DEFAULT clock_timestamp\(\)/);
 assert.match(migration,/ORDER BY r\.created_at DESC,r\.id DESC/);
});
test('Year dropdown is replaced, not doubled up, in staff and public filters',()=>{
 assert.doesNotMatch(read('dist/account.html'),/id="skres-admin-year"/);
 assert.doesNotMatch(read('dist/sk-resolutions.html'),/id="skres-year"/);
});
