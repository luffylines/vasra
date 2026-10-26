'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('dist/kk-dashboard.html'),dashboard=read('dist/kk-dashboard.js'),services=read('dist/kk-services.js'),backend=read('supabase/migrations/20261025040000_kk_member_dashboard.sql');

test('Unimplemented My Activities is removed from sidebar, overview and active tabs',()=>{
 assert.doesNotMatch(html,/data-tab="activities"|data-section="activities"|Registered activities/);
 assert.doesNotMatch(dashboard,/kk-dash-joined-count/);
 assert.match(html,/id="kk-dash-projects-count"/);
 for(const id of ['kk-dash-printing-count','kk-dash-computer-count','kk-dash-rewards-count'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(dashboard,/if\(which==='activities'\)which='projects'/);
});

test('Published upcoming projects are sourced from live database and refreshed on selecting Projects',()=>{
 assert.match(backend,/if action='youth_dashboard' then/);
 assert.match(backend,/pj\.published=true/);
 assert.match(backend,/pj\.publish_at is null or pj\.publish_at<=clock_timestamp\(\)/);
 assert.match(backend,/pj\.status in \('Pinaplano','Isinasagawa'\)/);
 assert.match(dashboard,/const refreshProjects=async\(\)=>/);
 assert.match(dashboard,/if\(which==='projects'\)\{refreshProjects\(\);refreshParticipation\(\);\}/);
 assert.match(dashboard,/projects=response\.projects\.filter/);
 assert.doesNotMatch(html,/id="kk-joined-list"/);
});

test('Overview Printing and Computer Use counts reflect real per-member requests',async()=>{
 const nodes={};
 for(const id of ['kk-dash-printing-count','kk-dash-computer-count','kk-printing-history','kk-computer-history','kk-retabox-history'])
  nodes['#'+id]={textContent:'—',title:'',innerHTML:''};
 let failed=false,errors=[];
 const document={querySelector(key){return nodes[key]||null}};
 const window={showVasraToast:(msg,kind)=>errors.push({msg,kind})};
 const api=async()=>{if(failed)throw Error('Service unavailable');return {requests:[
  {service_type:'printing',status:'pending',requested_at:'2026-10-25T08:00:00Z',details:{paper_size:'short',color:'bw',pages:2,copies:1}},
  {service_type:'printing',status:'approved',requested_at:'2026-10-25T08:10:00Z',details:{paper_size:'long',color:'colored',pages:2,copies:2}},
  {service_type:'computer',status:'pending',requested_at:'2026-10-25T08:20:00Z',details:{hours:2}},
  {service_type:'retabox',status:'rejected',requested_at:'2026-10-25T08:40:00Z',details:{grams:200}}
 ]}};
 vm.runInNewContext(services,{window,document,api,console,Date});
 await window.loadKKServices();
 assert.equal(nodes['#kk-dash-printing-count'].textContent,'2');
 assert.equal(nodes['#kk-dash-computer-count'].textContent,'1');
 assert.match(nodes['#kk-dash-printing-count'].title,/1 pending/);
 assert.match(nodes['#kk-printing-history'].innerHTML,/pending/);
 assert.match(nodes['#kk-computer-history'].innerHTML,/2 hour\(s\) requested/);
 failed=true;await window.loadKKServices();
 assert.equal(nodes['#kk-dash-printing-count'].textContent,'—');
 assert.equal(nodes['#kk-dash-computer-count'].textContent,'—');
 assert.equal(errors.at(-1).kind,'error');
});

test('Updated KK dashboard and service scripts still compile',()=>{
 for(const p of ['dist/kk-dashboard.js','dist/kk-services.js'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
