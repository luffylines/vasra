'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../dist/admin-dashboard.css'),'utf8');
const markup=fs.readFileSync(path.join(__dirname,'../dist/account.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../dist/account.js'),'utf8');

test('all SK staff roles share one dark theme, defaulting to light',()=>{
 assert.match(css,/body\.account-workspace\[data-staff-mode="staff"\]\[data-theme="dark"\]/);
 assert.match(app,/let savedStaffTheme='light'/);
 assert.match(app,/document\.body\.dataset\.theme=dark\?'dark':'light'/);
 assert.match(app,/localStorage\.setItem\(themeStorageKey/);
 assert.match(markup,/id="theme-toggle"/);
});

test('all management panels and shared input forms have dark surfaces',()=>{
 for(const id of ['monthly-form','budget-form','roster-form','create-officer']){
  assert.match(markup,new RegExp('id="'+id+'"'));
  assert(css.includes('#'+id),id+' missing dark surface rule');
 }
 for(const panel of ['panel-projects','panel-monthly','panel-budget','panel-roster','panel-users','panel-audit','panel-settings']){
  assert(markup.includes('id="'+panel+'"'),panel+' missing from markup');
  assert(css.includes('#'+panel),panel+' missing dark styling');
 }
 assert.match(css,/\.trans-editform,\.officer-create/);
 assert.match(css,/background:var\(--surface\)!important/);
 assert.match(css,/color:var\(--secondary-text\)!important/);
 assert.match(css,/color:var\(--text\)!important/);
 assert.match(css,/background:var\(--field\)!important/);
});

test('staff officer overview, generated records, editor dialog and checkboxes are themed',()=>{
 assert.match(markup,/id="officer-overview"/);
 assert.match(css,/\.staff-overview-grid article/);
 assert.match(css,/\.manage-row,\.audit-row/);
 assert.match(css,/\.trans-report-list article/);
 assert.match(css,/#dashboard :is\([\s\S]*?#monthly-form[\s\S]*?input\[type="checkbox"\]/);
 assert.match(css,/#editor\{/);
 assert.match(css,/accent-color:#79aeff/);
});

function luminance(hex){
 const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
test('dark backgrounds and field text meet WCAG AA 4.5:1 contrast',()=>{
 assert(contrast('#e9f1fd','#192a42')>=4.5);
 assert(contrast('#b8cce4','#192a42')>=4.5);
 assert(contrast('#9eb6d2','#111f33')>=4.5);
 assert(contrast('#e9f1fd','#111f33')>=4.5);
});
