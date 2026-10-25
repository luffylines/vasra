'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

const publicPages=['index','projects','duty','youth-leaders','achievements','contacts','transparency'];
test('SK Council, Awards, Transparency and Contacts share the Home shell and theme button',()=>{
 const home=read('dist/index.html');
 assert.match(home,/<body class="portal-refresh"/);
 const homeNav=home.match(/<nav aria-label="Pangunahing navigation">[\s\S]*?<\/nav>/)?.[0];
 assert.ok(homeNav,'Missing authoritative Home sidebar');
 for(const name of ['youth-leaders','achievements','transparency','contacts']){
  const html=read('dist/'+name+'.html');
  assert.match(html,/<body class="[^"]*portal-refresh/,'missing unified layout in '+name);
  assert.match(html,/<link rel="stylesheet" href="\.\/portal\.css">/,'missing Home sidebar CSS in '+name);
  assert.match(html,/<script src="\.\/shell\.js">/,'missing Home nav controller in '+name);
  assert.match(html,/<div class="page-top">/,'missing Home header in '+name);
  assert.match(html,/<span class="location-tag">/,'missing Philippine Time header in '+name);
  assert.match(html,/<a class="brand" href="\.\/"><span class="sk-logo">/,'incorrect official logo in '+name);
  const nav=html.match(/<nav aria-label="Pangunahing navigation">[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav,'missing navigation in '+name);
  for(const link of ['./projects.html','./duty.html','./youth-leaders','./achievements.html','./contacts.html','./transparency'])
   assert.ok(nav.includes('href="'+link+'"'),name+' is missing '+link);
 }
});

test('Public theme toggle initializes on all four pages and does not interfere with staff',()=>{
 const script=read('dist/theme.js');
 const shell=read('dist/shell.js');
 assert.match(script,/classList\.contains\('portal-refresh'\)/);
 assert.match(shell,/appearance\.src='\.\/theme\.js'/);
 assert.match(script,/vasra-staff-theme-v1/);
 assert.match(script,/location|document\.querySelector\('\.kk-page-actions'\)/);
 assert.match(script,/mobile-menu-toggle/);
 assert.match(script,/dataset\.vasraThemeToggle/);
 assert.doesNotMatch(script,/document\.cookie\s*=/);
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.doesNotThrow(()=>new vm.Script(shell));
});

test('Dark contact UI does not leave white cards or unreadable text',()=>{
 const styles=read('dist/theme.css');
 for(const selector of ['.contacts-overview .contacts-info-card',
   '.contacts-form-panel,.contacts-location-panel',
   '.contacts-message-form label:not(.contacts-consent)',
   '.contacts-message-form .contacts-label-title',
   '.contacts-message-form :is(input:not([type=checkbox]),select,textarea)',
   '.contacts-office-meta','.contacts-info-card strong',
   '.contacts-feedback[data-kind="error"]']){
   assert.ok(styles.includes(selector),'Missing dark contact override: '+selector);
 }
 assert.match(styles,/html\[data-theme="dark"\] body\.portal-refresh\.contacts-redesign/);
 assert.match(styles,/\.contacts-overview \.contacts-info-card,\s*html\[data-theme="dark"\]/);
});

test('Dark SK Council, Awards and Transparency override their light-only cards',()=>{
 const css=read('dist/theme.css');
 for(const part of ['.leaders-chart-section','.org-card','.award-card','.award-card-body h3',
  '.trans-section','.trans-report','.sk-fdp-card','.sk-fdp-board','.trans-picker']){
  assert.ok(css.includes(part),'Missing dark override for '+part);
 }
 assert.match(css,/\.sk-fdp-board\{\s*background:[^}]+!important/);
 const compact=read('dist/leaders-compact.css');
 assert.match(compact,/\.leaders-compact \.page-top\{height:78px;margin-bottom:28px\}/);
 assert.match(compact,/@media\(max-width:850px\)/);
});
