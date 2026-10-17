'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'../dist',x),'utf8');
const publicPages=['index.html','projects.html','duty.html','contacts.html','transparency.html','youth-leaders.html'];
const allPages=[...publicPages,'account.html'];
const iconCss=read('action-icons.css'),staffCss=read('admin-dashboard.css');
const staff=read('account.js'),publicProjects=read('app.js'),home=read('home.js');
test('all public and authenticated pages load a single shared icon stylesheet',()=>{
 for(const page of allPages){
  const s=read(page);
  assert.equal((s.match(/href="\.\/action-icons\.css"/g)||[]).length,1,page);
  assert.doesNotMatch(s,/data-lucide=/,page+' must not depend on runtime CDN icon insertion');
 }
});
test('no old arrow glyph is used for navigation actions across public pages',()=>{
 for(const page of allPages){
  const s=read(page);
  assert.doesNotMatch(s,/↗/,page+' still has the old plain arrow');
 }
 for(const script of [staff,publicProjects,home])assert.doesNotMatch(script,/↗/);
});
test('SK duty services have meaningful service icons and navigation has its own arrows',()=>{
 const duty=read('duty.html');
 const around=duty.slice(duty.indexOf('class="service-chips"'),duty.indexOf('</div>',duty.indexOf('class="service-chips"'))+6);
 assert.match(around,/Printing & photocopying/);
 assert.match(around,/M6 9V3h12v6M6 18H4/,'printing icon must be a printer, not external arrow');
 assert.match(around,/Free use of computers/);
 assert.match(around,/M8 21h8m-4-4v4/);
 assert.match(around,/RetaBox donations/);
 assert.match(around,/M20\.8 4\.6/);
 assert.match(read('projects.html'),/Kilalanin ang mga naka-duty[\s\S]{0,350}class="ui-action-icon"/);
});
test('staff publication and project actions have consistent vector icons',()=>{
 const html=read('account.html');
 const choices=html.slice(html.indexOf('id="project-publication-choices"'),html.indexOf('</div>',html.indexOf('id="project-publication-choices"'))+6);
 for(const value of ['draft','now','schedule','keep'])assert(choices.includes('data-publication-option="'+value+'"'),value);
 assert.equal((choices.match(/class="publication-choice-icon"/g)||[]).length,4);
 assert.equal((choices.match(/<svg/g)||[]).length,4);
 for(const name of ['globe','photos','progress','edit','delete'])assert(staff.includes("managementActionIcon('"+name+"')"),name);
 assert.match(staff,/save\.insertAdjacentHTML\('beforeend',managementActionIcon\('right'\)\)/);
});
test('visible X in dark project editor is a real SVG and has explicit contrast states',()=>{
 const html=read('account.html');
 assert.match(html,/<button class="close" type="button" aria-label="Isara"><svg class="ui-action-icon/);
 assert.match(iconCss,/body\.account-workspace\[data-staff-mode="staff"\]\[data-theme="dark"\] #editor\.project-editor-modal \.close\{/);
 assert.match(iconCss,/background:#29496e!important/);
 assert.match(iconCss,/color:#fff!important/);
 assert.match(iconCss,/stroke:#fff!important/);
 assert.match(iconCss,/visibility:visible!important/);
 assert.match(iconCss,/\.close:focus-visible\{outline:3px/);
 assert.match(staff,/document\.querySelector/); // Staff controls already initialized.
});
test('all image viewer close controls use matching SVG not low-contrast text glyphs',()=>{
 for(const [page,id] of [['account.html','staff-gallery-close'],['projects.html','lightbox-close'],['duty.html','poster-close']]){
  const html=read(page);
  const tag=html.match(new RegExp('<button[^>]+id="'+id+'"[^>]*>[\\s\\S]*?<\\/button>'))?.[0]||'';
  assert.match(tag,/<svg class="ui-action-icon/,page+' '+id);
  assert.doesNotMatch(tag,/>[×✕]</);
 }
 assert.match(iconCss,/#staff-gallery-close,#poster-close,#lightbox-close/);
});
test('icons keep consistent 24px viewbox, touch/hover focus, and reduced-motion support',()=>{
 assert.match(iconCss,/\.ui-action-icon\{width:17px;height:17px/);
 assert.match(iconCss,/@media\(max-width:600px\)/);
 assert.match(iconCss,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(iconCss,/\.ui-icon-link:focus-visible/);
 assert.match(read('projects.html'),/id="install" class="secondary">I-install ang app <svg/);
});
