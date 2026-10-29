'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=load('dist/style.css');
const staff=load('dist/staff-duty-ui.css');
const html=load('dist/account.html');

test('Mobile form controls avoid automatic iPhone input focus zoom without disabling pinch zoom',()=>{
 assert.match(css,/@media screen and \(max-width:820px\)/);
 assert.match(css,/text-size-adjust:100%/);
 assert.match(css,/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
 assert.match(css,/textarea,select/);
 assert.match(css,/font-size:16px!important/);
 assert.match(html,/name="viewport" content="width=device-width,initial-scale=1"/);
 assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
});

test('Full mobile duty card fits screen with a small status pill instead of a circle',()=>{
 assert.match(staff,/SK Duty compact portrait-mobile UI/);
 assert.match(staff,/body\.account-workspace\[data-staff-mode="staff"\] #duty-controls #duty-mode-badge/);
 assert.match(staff,/width:fit-content!important;max-width:100%!important/);
 assert.match(staff,/max-height:36px!important/);
 assert.match(staff,/border-radius:999px!important/);
 assert.match(staff,/grid-column:1\/-1!important;grid-row:2!important/);
 assert.match(staff,/height:32px!important/);
});

test('Mobile duty buttons have fixed 42px height, do not create tall red panels',()=>{
 assert.match(staff,/\.duty-card-actions button\.duty-action-button\{/);
 assert.match(staff,/height:42px!important;min-height:42px!important;max-height:42px!important/);
 assert.match(staff,/aspect-ratio:auto!important/);
 assert.match(staff,/font-size:11px!important/);
 assert.match(staff,/button\.duty-action-button\[hidden\]/);
 assert.match(staff,/max-width:360px/);
});

test('When office status is unavailable, only the actionable small Retry is visible on mobile',()=>{
 assert.match(staff,/duty-mode-badge\[data-state="unknown"\]/);
 assert.match(staff,/:is\(#duty-set-closed,#duty-set-auto\)/);
 assert.match(staff,/button#duty-retry/);
 const js=load('dist/account.js');
 assert.match(js,/setDutyBadge\('unknown','Status unavailable'\)/);
 assert.match(js,/closed\.disabled=true;auto\.disabled=true;retry\.hidden=false/);
});
test('Dedicated mobile stylesheet loads after other account dashboard styles',()=>{
 const admin=html.indexOf('href="./admin-dashboard.css?v=20261027-progress-button-align-v4"');
 const mobile=html.indexOf('href="./staff-duty-ui.css"');
 assert(admin>=0&&mobile>admin);
 assert.match(html,/href="\.\/style\.css"/);
 assert.match(staff,/\.duty-manager-panel \.duty-manager-day-chip/);
});
