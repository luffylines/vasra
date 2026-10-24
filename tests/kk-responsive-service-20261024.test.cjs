'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const registration=read('dist/kk-register.html');
const client=read('dist/kk.js');
const styles=read('dist/kk.css');
const portal=read('dist/mobile-nav.css');
const contacts=read('dist/contacts-page.css');
const schema=read('supabase/migrations/20261024223000_kk_youth_profiling.sql');
test('No green KK readiness banner when database check succeeds',()=>{
 assert.match(registration,/<section id="kk-registration-readiness" class="kk-readiness" hidden/);
 assert.match(client,/databaseReady=true;readiness\.dataset\.status='ready';\s*readiness\.hidden=true;/);
 assert.match(client,/readiness\.dataset\.status='unavailable';\s*readiness\.hidden=false;/);
 assert.match(styles,/#kk-registration-readiness\[hidden\]/);
 assert.match(styles,/#kk-registration-readiness \[hidden\]/);
 assert.match(styles,/display:none!important/);
 assert.match(client,/if\(!databaseReady\)/); // Don't submit when DB is genuinely unavailable.
});
test('Wide desktop registration with natural page scrolling',()=>{
 assert.match(styles,/@media \(min-width: 900px\)/);
 assert.match(styles,/max-width:980px/);
 assert.match(styles,/\.kk-auth-page\[data-view="register"\] \.kk-field-grid\{gap:11px 22px\}/);
 assert.match(styles, /align-items:flex-start/);
 assert.match(styles, /@media \(min-width: 1250px\) and \(max-height:900px\)/);
 assert.doesNotMatch(styles,/\.kk-auth-page\[data-view="register"\] \.kk-main\{[^}]*overflow:hidden/);
});
test('Responsive phone layout at 320, 360 and tablet widths',()=>{
 assert.match(styles,/@media \(max-width:760px\)/);
 assert.match(styles,/@media \(max-width:380px\)/);
 assert.match(styles,/\.kk-auth-page\[data-view="register"\] \.kk-field-grid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(styles,/\.kk-auth-page\[data-view="register"\] \.kk-registration\{max-width:600px;width:100%/);
 assert.match(styles,/\.kk-step-actions\{flex-wrap:wrap\}/);
 assert.match(portal,/@media\(max-width:520px\)/);
});
test('All main portal, staff and KK forms prevent iOS auto-focus zoom without disabling pinch zoom',()=>{
 assert.match(styles,/@media \(hover:none\) and \(pointer:coarse\)/);
 assert.match(styles,/\.kk-body select,\.kk-body textarea\{font-size:16px!important\}/);
 assert.match(portal,/input:not\(\[type="checkbox"\]\)/);
 assert.match(portal,/select,textarea\{/);
 assert.match(portal,/font-size:16px!important/);
 assert.match(contacts, /\.contacts-redesign \.contacts-message-form select/);
 for(const html of [registration,read('dist/kk-login.html'),read('dist/kk-profile.html')])
  assert.match(html,/content="width=device-width,initial-scale=1"/);
 assert.doesNotMatch(registration,/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
 assert.doesNotMatch(portal,/user-scalable\s*=\s*no/);
});
test('KK DB seed migration uses fixed email regex for both password and Google registration',()=>{
 const corrected='^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$';
 assert.equal(schema.split(corrected).length-1,2);
 assert.doesNotMatch(schema, /payload->>'email' !~\* '[^']*\\\\[.]/);
 assert.match(schema,/status text not null default 'draft'/);
});
test('Modified KK frontend JavaScript parses and safe navigation retained',()=>{
 assert.doesNotThrow(()=>new vm.Script(client,{filename:'dist/kk.js'}));
 assert.match(read('dist/kk-login.html'),/href="\.\/kk-register"/);
 assert.match(read('dist/kk-register.html'),/href="\.\/kk-login"/);
 assert.match(read('dist/sw.js'),/vasra-v53-sk-full-disclosure-board-20261025/);
});
