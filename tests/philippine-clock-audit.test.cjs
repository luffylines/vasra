'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dist=path.join(__dirname,'../dist');
const staff=fs.readFileSync(path.join(dist,'account.js'),'utf8');
const clockSource=fs.readFileSync(path.join(dist,'shell.js'),'utf8');
const home=fs.readFileSync(path.join(dist,'home.js'),'utf8');
const officers=fs.readFileSync(path.join(dist,'officers.js'),'utf8');

test('Home hides provisional duty-roster note without hiding SK cards',()=>{
 assert.match(home,/officerDirectory\(data\.officials,false,data\.directory_managed===true,false\)/);
 assert.match(officers,/function officerDirectory\(records,grouped=false,managed=false,showDutyNote=true\)/);
 assert.match(officers,/fromDuty&&showDutyNote\?dutySourceNote/);
});

test('Philippine clock displays server-time in each page header',async()=>{
 const section=clockSource.slice(clockSource.indexOf('\/\* Consistent Philippine Time'));
 assert(section.includes('timeZone:\'Asia/Manila\''));
 const tags=['DISTRICT 1 · QUEZON CITY','QUEZON CITY, PH'].map(name=>({
  textContent:name,children:[],
  replaceChildren(child){this.children=[child]},append(child){this.children.push(child)}
 }));
 const clocks=[];
 const document={
  querySelectorAll(sel){return sel==='.page-top .location-tag'?tags:clocks},
  createElement(tag){
   const result={tagName:tag,className:'',textContent:'',title:'',dateTime:'',setAttribute(){}};
   if(tag==='time')clocks.push(result);
   return result;
  },
  addEventListener(){}
 };
 const context={document,performance:{now:()=>100},Date,Intl,setInterval(){},
   fetch:async()=>({ok:true,json:async()=>({now:'2026-10-16T09:23:00.000Z'})})};
 vm.runInNewContext(section,context);
 await new Promise(setImmediate);
 assert.equal(clocks.length,2);
 for(const clock of clocks){
  assert.match(clock.textContent,/5:23\s*PM/i);
  assert.equal(clock.title,'Philippine Standard Time (Asia/Manila)');
 }
 assert.equal(tags[0].children[0].textContent,'DISTRICT 1 · QUEZON CITY');
});

test('Activity Log always distinguishes recorded IP from missing historical IP',async()=>{
 const start=staff.indexOf('const actions=');
 const end=staff.indexOf("$('#audit-prev').onclick",start);
 const section=staff.slice(start,end);
 const dom=new Map();
 const $=sel=>{if(!dom.has(sel))dom.set(sel,{textContent:'',innerHTML:'',disabled:false});return dom.get(sel)};
 const escape=x=>String(x??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
 const code=section+'return {loadAudit,auditDetails,actions};';
 const fn=new Function('api','$','esc','dateText','auditOffset','auditTotal',code);
 const audit=fn(async()=>({total:2,events:[
  {id:1,actor_name:'SK Chairman',action:'chairman_provisioned',details:'{}',created:'2026-10-12T11:26:00Z',ip_address:null},
  {id:2,actor_name:'SK Staff',action:'project_created',details:JSON.stringify({name:'Sample'}),created:'2026-10-16T09:23:00Z',ip_address:'203.0.113.20'}
 ]}),$,escape,(time)=>new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(time)),0,0);
 await audit.loadAudit();
 const output=$('#audit-list').innerHTML;
 assert.match(output,/IP address: Not recorded/);
 assert.match(output,/IP address: 203\.0\.113\.20/);
 assert.match(output,/Na-set up ang SK Chairman account/);
 assert.match(output,/5:23\s*PM\s*PHT/);
 assert.doesNotMatch(output,/<pre>\{\}<\/pre>/);
 assert.equal(audit.auditDetails({details:'{}'}),'Walang dagdag na detalye para sa action na ito.');
});

test('IP source is proxy-observed and forwarded to the private RPC layer',()=>{
 const adapter=fs.readFileSync(path.join(__dirname,'../api/index.js'),'utf8');
 const backend=fs.readFileSync(path.join(__dirname,'../lib/supabase.cjs'),'utf8');
 const handler=fs.readFileSync(path.join(__dirname,'../lib/handler.cjs'),'utf8');
 assert.match(adapter,/x-vercel-forwarded-for/);
 assert.match(adapter,/isIP\(value\)/);
 assert.match(backend,/isIP\(clientIp\)/);
 assert.match(backend,/x-vasra-client-ip/);
 assert.match(handler,/new SupabaseBackend\(cfg,fetch,context\.ip\)/);
 assert.match(handler,/path==='\/api\/time'/);
});
