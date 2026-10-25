'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..','dist',name),'utf8');
const html=read('account.html'),script=read('kk-service-staff.js'),css=read('kk-services.css');

test('Pending Requests counts the full unreviewed backlog, not only submissions today',async()=>{
 const nodes=new Map(),handlers=new Map();
 const get=key=>{
  if(!nodes.has(key)){
   const node={value:key==='#kk-service-type-filter'||key==='#kk-service-status-filter'||key==='#kk-service-date-filter'?'all':'',
    textContent:'',innerHTML:'',hidden:false,dataset:{},disabled:false,
    addEventListener(name,callback){handlers.set(key+':'+name,callback)},
    querySelector(){return{value:''}},
    scrollIntoView(){}};
   nodes.set(key,node);
  }
  return nodes.get(key);
 };
 const lastWeek=new Date(Date.now()-7*86400000).toISOString();
 const records=[
  {id:'a0000000-0000-4000-8000-000000000001',name:'Member One',kk_id:'VASRA-KK-02',
   service_type:'printing',status:'pending',requested_at:lastWeek,
   details:{paper_size:'long',color:'colored',pages:5,copies:1}},
  {id:'b0000000-0000-4000-8000-000000000002',name:'Member Two',kk_id:'VASRA-KK-03',
   service_type:'computer',status:'pending',requested_at:lastWeek,details:{hours:1}}
 ];
 vm.runInNewContext(script,{
  document:{querySelector:get},window:{},api:async()=>({requests:records}),
  Intl,Date,URLSearchParams,console,user:{role:'sk'},confirm:()=>true
 });
 // The script populates its exported loader on the supplied window, but we need the
 // same reference outside the sandbox: evaluate again using an explicitly owned window.
 const appWindow={location:{assign(){}}},dom={querySelector:get};
 vm.runInNewContext(script,{document:dom,window:appWindow,
  api:async()=>({requests:records}),Intl,Date,URLSearchParams,console,user:{role:'sk'},confirm:()=>true});
 await appWindow.loadKKServiceStaff();
 assert.equal(get('#kk-service-stat-total').textContent,'0','no submissions today');
 assert.equal(get('#kk-service-stat-pending').textContent,'2','pending backlog includes earlier days');
 assert.equal(get('#kk-service-result-count').textContent,'2 request(s)');
 assert.match(get('#kk-service-admin-queue').innerHTML,/5 pages × 1 copies/);
 assert.match(get('#kk-service-admin-queue').innerHTML,/1 hour\(s\)/);
 assert.doesNotMatch(get('#kk-service-admin-queue').innerHTML,/data-service-form=/,'request forms collapsed by default');
 const click=handlers.get('#kk-service-admin-queue:click');
 assert.equal(typeof click,'function');
 const target=action=>({target:{closest:()=>({dataset:{action,id:records[0].id},disabled:false})}});
 await click(target('open-review'));
 assert.match(get('#kk-service-admin-queue').innerHTML,/data-service-form=/);
 assert.match(get('#kk-service-admin-queue').innerHTML,/name="pages"/);
 assert.match(get('#kk-service-admin-queue').innerHTML,/Approve Request/);
 await click(target('close-review'));
 assert.doesNotMatch(get('#kk-service-admin-queue').innerHTML,/data-service-form=/);
});

test('Modern SK Services card grid uses five columns on wide screens and mobile breakpoints',()=>{
 assert.match(css,/#panel-kk-services \.kk-service-admin-queue\{\s*display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:1150px\)/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css, /kk-service-review-detail\{\s*grid-column:1\/-1/);
 assert.match(css,/kk-service-admin-card-header\{[\s\S]*?justify-content:space-between/);
 assert.match(css,/kk-service-card-identity\{[\s\S]*?text-align:left/);
 assert.match(css,/kk-service-card-actions button/);
 assert.match(css,/kk-service-review-detail \.kk-service-review-actions/);
 assert.match(html, /<span>Pending Requests<\/span>/);
 assert.match(html, /All dates · awaiting review/);
 assert.match(html,/kk-services\.css\?v=20261026-service-compact-v1/);
 assert.match(html,/kk-service-staff\.js\?v=20261026-service-compact-v1/);
 assert.doesNotThrow(()=>new vm.Script(script));
});
