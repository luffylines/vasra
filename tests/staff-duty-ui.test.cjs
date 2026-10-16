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
 assert(staff.includes("if(result.mode!==mode)throw"));
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
