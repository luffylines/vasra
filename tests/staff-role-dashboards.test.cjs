'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/account.js'),'utf8');
const markup=fs.readFileSync(path.join(__dirname,'../dist/account.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../dist/admin-dashboard.css'),'utf8');
const trans={
 year:2026,budget:{year:2026,amount:125000,reference:'SK Annual Budget, approved reference'},
 updates:[
  {id:'first',title:'Project A',month:'2026-10-01',summary:'Program completed',expense:'12000.00',published:true},
  {id:'second',title:'Project B',month:'2026-09-01',summary:'Draft activity',expense:null,published:false},
  {id:'third',title:'Project C',month:'2026-08-01',summary:'School supplies distributed',expense:'8000.00',published:true}
 ],officials:[]
};
const projects=[
 {id:'a',title:'Project A',published:true,status:'Natapos'},
 {id:'b',title:'Project B',published:false,status:'Pinaplano'},
 {id:'c',title:'Project C',published:true,status:'Isinasagawa'}
];
const fmt=value=>'₱'+Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
function renderFor(role,data=trans){
 const n=['secretary-monthly-count','secretary-draft-count','secretary-done-count',
 'treasurer-budget-amount','treasurer-reported-total','treasurer-missing-count',
 'secretary-overview-records','treasurer-overview-records'];
 const elements=Object.fromEntries(n.map(x=>[x,{textContent:'—',innerHTML:''}]));
 const called=[];
 const user={role:'sk',position:role,name:'SK Officer'};
 const from=source.indexOf('let roleDashboardRequest=0;');
 const to=source.indexOf('function updateChairmanMetrics(){',from);
 assert(from>=0&&to>from);
 const code=source.slice(from,to)+'\nreturn {loadRoleOverview};';
 const module=new Function('$','api','user','activeStaffTab','managed','transYearNow','transMoney','esc',code)(
  id=>elements[id.slice(1)],
  async url=>{called.push(url);return data},
  user,'overview',projects,()=>2026,fmt,
  x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
 );
 return {load:module.loadRoleOverview,elements,called};
}
test('role-specific overview visibility is tied to both role and designation',()=>{
 assert.match(source,/user\?\.role==='sk'&&user\?\.position==='secretary'/);
 assert.match(source,/user\?\.role==='sk'&&user\?\.position==='treasurer'/);
 assert.match(source,/name==='overview'&&user\?\.role==='sk'&&!secretaryDashboard&&!treasurerDashboard/);
 for(const id of ['secretary-overview','treasurer-overview','officer-overview']){
  assert.match(markup,new RegExp('id="'+id+'"[^>]*hidden'));
 }
 assert.match(css,/#secretary-overview\[hidden\]/);
 assert.match(css,/#treasurer-overview\[hidden\]/);
});
test('SK Secretary receives documentation dashboard metrics from real records',async()=>{
 const {load,elements,called}=renderFor('secretary');
 await load();
 assert.deepEqual(called,['./api/transparency/manage?year=2026']);
 assert.equal(elements['secretary-monthly-count'].textContent,'3');
 assert.equal(elements['secretary-draft-count'].textContent,'1');
 assert.equal(elements['secretary-done-count'].textContent,'1');
 assert.match(elements['secretary-overview-records'].innerHTML,/Project A/);
 assert.match(elements['secretary-overview-records'].innerHTML,/Published/);
 assert.equal(elements['treasurer-budget-amount'].textContent,'—');
});
test('SK Treasurer receives budget, actual recorded expenses and missing reports',async()=>{
 const {load,elements}=renderFor('treasurer');
 await load();
 assert.equal(elements['treasurer-budget-amount'].textContent,'₱125,000.00');
 assert.equal(elements['treasurer-reported-total'].textContent,'₱20,000.00');
 assert.equal(elements['treasurer-missing-count'].textContent,'1');
 assert.match(elements['treasurer-overview-records'].innerHTML,/Expense not reported/);
 assert.equal(elements['secretary-monthly-count'].textContent,'—');
});
test('Treasurer does not fabricate a budget if no approved record exists',async()=>{
 const {load,elements}=renderFor('treasurer',{year:2026,budget:null,updates:[]});
 await load();
 assert.equal(elements['treasurer-budget-amount'].textContent,'Not recorded');
 assert.equal(elements['treasurer-missing-count'].textContent,'0');
 assert.match(elements['treasurer-overview-records'].innerHTML,/Wala pang na-save/);
});
test('secretary minutes are identified as a missing secure module, not false records',()=>{
 assert.match(markup,/wal(a|a) pang dedicated secure records module/);
 assert.match(markup,/Hindi binibilang ang ordinaryong projects bilang signed minutes/);
 assert.match(markup,/Reported expenses only/);
 assert.match(markup,/hindi ito audited cash balance/i);
});
test('staff roles cannot gain Chairman-only account management from the dashboard',()=>{
 assert.match(source,/if\(\['roster','users','audit'\]\.includes\(name\)&&user\?\.role!=='chairman'\)return/);
 assert.match(source,/if\(name==='budget'&&!\(user\?\.role==='chairman'\|\|user\?\.position==='treasurer'\)\)return/);
 assert.match(markup,/id="panel-users"/);
 assert.match(markup,/id="panel-budget"/);
});
test('dashboard buttons navigate only to existing authorized panels',()=>{
 for(const button of ['monthly','projects','budget']){
  assert(markup.includes('data-admin-open="'+button+'"'));
 }
 assert.match(source,/document\.querySelectorAll\('\[data-admin-open\]'\)/);
 assert.match(css,/@media\(max-width:710px\)/);
 assert.match(css,/\[data-theme="dark"\].*#dashboard \.role-metric/);
});
