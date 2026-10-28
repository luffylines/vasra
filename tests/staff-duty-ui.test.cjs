'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '../dist');
const markup = fs.readFileSync(path.join(dist, 'account.html'), 'utf8');
const staff = fs.readFileSync(path.join(dist, 'account.js'), 'utf8');
const duty = fs.readFileSync(path.join(dist, 'duty.js'), 'utf8');

test('SK duty controls are dashboard-only; SK official sort is automatic', () => {
 const index = markup.indexOf('id="duty-controls"');
 assert(index > markup.indexOf('id="dashboard"'));
 assert(index < markup.indexOf('id="chairman-overview"'));
 assert(index < markup.indexOf('id="panel-projects"'));
 assert.equal(markup.split('id="duty-controls"').length - 1, 1);
 assert(!markup.includes('Display order'));
 assert(markup.includes('type="hidden" name="sort" value="10"'));
 assert(staff.includes("if(name==='overview')await updateDutyControls()"));
 assert(staff.includes("activeStaffTab=name;$('#duty-controls').hidden=true"));
});

test('only assigned SK officers (plus existing chairman override) can manage duty', () => {
 const a = staff.indexOf('function canManageDutyToday(');
 const b = staff.indexOf('async function updateDutyControls()', a);
 assert(a > -1 && b > a);
 const dutyNames = [
  ['gel bergonio'], ['ernest bragais','kristine de ocampo'],
  ['sherwin estanislao'], ['rembert natividad'],
  ['arvin capiral'], ['kath irag'], ['roland reyes']
 ];
 const allowed = new Function('dutyNames', staff.slice(a,b)+'return canManageDutyToday;')(dutyNames);
 assert.equal(allowed({role:'sk',name:'Gel Bergonio'},0), true);
 assert.equal(allowed({role:'sk',name:'Gel Bergonio'},1), false);
 assert.equal(allowed({role:'sk',name:'Kristine De Ocampo'},1), true);
 assert.equal(allowed({role:'youth',name:'Gel Bergonio'},0), false);
 assert.equal(allowed({role:'chairman',name:'Chairperson'},6), true);
 assert.equal(allowed({role:'chairman',name:'Chairperson',mustChange:true},6), false);
 assert(staff.includes("closed.disabled=true;auto.disabled=true;retry.hidden=false"));
 assert(staff.includes("if(result.mode!==mode||result.date&&result.date!==manilaDutyDay().date"));
});

test('public SK duty uses local office hours and never claims unknown closures are confirmed', () => {
 const a = duty.indexOf('function updateSchedule(){');
 const b = duty.indexOf('updateSchedule();\nsetInterval',a);
 assert(a !== -1 && b > a);
 const fn = new Function('now','state',`
  let selected=0,manualSelection=true,observedDate=now.date;
  let dutyOverride=state.mode,overrideDate=state.date;
  const days=[{short:'MON'}];
  function manilaNow(){return now}
  function selectDay(){}
  const label={textContent:''},pill={classList:{toggle(){}},title:''};
  function $(k){return k==='#office-status-label'?label:pill}
  const document={querySelectorAll(){return [{querySelector(){return {hidden:false}},classList:{toggle(){}}}]}};
  ${duty.slice(a,b)}
  updateSchedule();
  return { label:label.textContent, title:pill.title };
 `);
 const now={short:'MON',date:'2026-10-19',hour:10,minute:0};
 assert.equal(fn(now,{mode:'auto',date:now.date}).label,'Open · 9 AM–6 PM');
 assert.equal(fn(now,{mode:'closed',date:now.date}).label,'Closed by SK on duty');
 assert.equal(fn({...now,hour:18},{mode:'closed',date:now.date}).label,'Closed by SK on duty');
 assert.equal(fn(now,{mode:'closed',date:'2026-10-18'}).label,'Open · 9 AM–6 PM');
 assert.equal(fn({...now,hour:18},{mode:'auto',date:now.date}).label,'Closed · Office hours ended');
 const fallback=fn(now,{mode:'unknown',date:''});
 assert.equal(fallback.label,'Scheduled open · 9 AM–6 PM');
 assert.match(fallback.title,/Live closure updates are temporarily unavailable/);
 assert(!duty.includes('Status unverified'));
});

test('duty status dashboard has modern icons, verified badge and limited controls',()=>{
 for(const id of ['duty-controls','duty-mode-badge','duty-mode-text','duty-assigned-name',
  'duty-control-date','duty-control-info','duty-set-closed','duty-set-auto','duty-retry']){
  assert(markup.includes('id="'+id+'"'),id);
 }
 assert.match(markup,/<section id="duty-controls" class="duty-office-card"[^>]*hidden>/);
 assert.match(markup,/class="duty-card-heading-icon"/);
 assert.match(markup,/class="duty-card-info-icon"/);
 assert.match(markup,/class="duty-action-button duty-action-close"/);
 assert.match(markup,/class="duty-action-button duty-action-auto"/);
 assert.match(staff,/setInterval\(\(\)=>\{if\(!document\.hidden&&user&&!user\.mustChange&&activeStaffTab==='overview'\)updateDutyControls\(\)\},60000\)/);
 const css=fs.readFileSync(path.join(dist,'admin-dashboard.css'),'utf8');
 assert.match(css,/#dashboard > #duty-controls\.duty-office-card\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:730px\)/);
 assert.match(css,/data-state="open"/);
 assert.match(css,/data-state="closed"/);
 assert.match(css,/data-theme="dark".*#dashboard > #duty-controls\.duty-office-card/);
});
test('duty card appears only for scheduled officer or Chairman with office-hours awareness',async()=>{
 const begin=staff.indexOf('function setDutyBadge('),end=staff.indexOf('async function setDutyMode(mode){',begin);
 assert(begin!==-1&&end>begin);
 const captured=staff.slice(begin,end);
 const roster=[
  {names:['Gel Bergonio'],day:'Lunes'},{names:['Ernest Bragais','Kristine De Ocampo'],day:'Martes'},
  {names:['Sherwin Estanislao'],day:'Miyerkules'},{names:['Rembert Natividad'],day:'Huwebes'},
  {names:['Arvin Capiral'],day:'Biyernes'},{names:['Kath Irag'],day:'Sabado'},
  {names:['Roland Reyes'],day:'Linggo'}
 ];
 async function render(account,day,server={mode:'auto',date:'2026-10-17'},fail=false,tab='overview'){
  const nodes=Object.fromEntries(['#duty-controls','#duty-mode-badge','#duty-mode-text',
   '#duty-assigned-name','#duty-control-date','#duty-control-info',
   '#duty-set-closed','#duty-set-auto','#duty-retry','#admin-office'].map(id=>[id,{
    hidden:id==='#duty-controls',disabled:true,dataset:{},textContent:''
   }]));
  let requests=0;
  const api=async()=>{requests++;if(fail)throw Error('offline');return server};
  const eligibility=(u,index)=>u?.role==='chairman'||(u?.role==='sk'&&
   (roster[index]?.names||[]).some(n=>n.toLowerCase()===u?.name?.toLowerCase()));
  const run=new Function('$','days','user','activeStaffTab','manilaDutyDay',
   'canManageDutyToday','api','Intl',
   'let dutyReadSequence=0,dutyMutationBusy=false;\n'+captured+'\nreturn updateDutyControls;'
  )(id=>nodes[id],roster,account,tab,()=>day,eligibility,api,Intl);
  await run();
  return {nodes,requests};
 }
 const sat={index:5,date:'2026-10-17',hour:10,minute:30};
 const skip=await render({role:'sk',name:'Gel Bergonio'},sat);
 assert.equal(skip.nodes['#duty-controls'].hidden,true);
 assert.equal(skip.requests,0);
 const officer=await render({role:'sk',name:'Kath Irag'},sat);
 assert.equal(officer.nodes['#duty-controls'].hidden,false);
 assert.equal(officer.nodes['#duty-assigned-name'].textContent,'Kath Irag');
 assert.equal(officer.nodes['#duty-mode-badge'].dataset.state,'open');
 assert.equal(officer.nodes['#duty-set-closed'].disabled,false);
 assert.equal(officer.nodes['#duty-set-auto'].disabled,true);
 const afterHours=await render({role:'sk',name:'Kath Irag'},{...sat,hour:18});
 assert.equal(afterHours.nodes['#duty-mode-badge'].dataset.state,'closed');
 assert.match(afterHours.nodes['#duty-control-info'].textContent,/6:00 PM/);
 const manual=await render({role:'sk',name:'Kath Irag'},sat,{mode:'closed',date:sat.date});
 assert.equal(manual.nodes['#duty-mode-badge'].dataset.state,'closed');
 assert.equal(manual.nodes['#duty-set-closed'].disabled,true);
 assert.equal(manual.nodes['#duty-set-auto'].disabled,false);
 const offline=await render({role:'sk',name:'Kath Irag'},sat,undefined,true);
 assert.equal(offline.nodes['#duty-mode-badge'].dataset.state,'unknown');
 assert.equal(offline.nodes['#duty-set-closed'].disabled,true);
 assert.equal(offline.nodes['#duty-set-auto'].disabled,true);
 assert.equal(offline.nodes['#duty-retry'].hidden,false);
 const chairman=await render({role:'chairman',name:'SK Chairman'},sat);
 assert.equal(chairman.nodes['#duty-controls'].hidden,false);
 const outsideDashboard=await render({role:'sk',name:'Kath Irag'},sat,undefined,false,'users');
 assert.equal(outsideDashboard.nodes['#duty-controls'].hidden,true);
 assert.equal(outsideDashboard.requests,0);
});
