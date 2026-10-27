'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=pathName=>fs.readFileSync(path.join(__dirname,'..',pathName),'utf8');
const staff=read('dist/account.js'),publicJs=read('dist/app.js'),home=read('dist/home-landing.js');
const css=read('dist/project-title-display.css');
test('Imported Unicode-styled project names render as a single readable font without altering stored data',()=>{
 const helper=staff.match(/const projectTitleForDisplay=value=>[^\n]+/);
 assert.ok(helper,'staff title display helper missing');
 const fn=vm.runInNewContext(helper[0]+'\nprojectTitleForDisplay');
 assert.equal(fn('𝗢𝗖𝗧𝗢𝗕𝗘𝗥 𝟯, 𝟮𝟬𝟮𝟲 | 𝗛𝗔𝗡𝗗𝗢𝗚'),'OCTOBER 3, 2026 | HANDOG');
 assert.equal(fn('Oct 21, 2026 | Girls Summit 2026'),'Oct 21, 2026 | Girls Summit 2026');
 assert.equal(fn(' 𝗦𝗞  𝗩𝗔𝗦𝗥𝗔 '),'SK VASRA');
 assert.match(staff,/<h3 class="project-unified-title">\$\{esc\(projectTitleForDisplay\(p\.title\)\)\}<\/h3>/);
 assert.match(publicJs,/<h3 class="project-unified-title">\$\{esc\(projectTitleForDisplay\(p\.title\)\)\}<\/h3>/);
 assert.match(home,/safe\(projectTitleForDisplay\(p\.title\)\)/);
 assert.match(publicJs,/projectTitleForDisplay\(p\.title\)\)\+'<\/h2>/);
 // Original input/edit workflow still uses the actual record title.
 assert.match(staff,/activeProgressProject=\{id:p\.id,version:p\.version,title:p\.title\}/);
});
test('Consistent bold, font-size and weight on Manage Projects and public project cards',()=>{
 for(const selector of [
  '#managed-projects .project-manage-info > h3.project-unified-title',
  '.portal-refresh.projects-page #grid .cardbody > h3.project-unified-title',
  '.portal-refresh #home-recent-projects .home-recent-details > h3.project-unified-title'
 ])assert.ok(css.includes(selector),selector);
 assert.match(css,/font-family:Manrope,system-ui/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/font-weight:800/);
 assert.match(css,/@media\(max-width:600px\)/);
 for(const page of ['account.html','projects.html','index.html']){
  assert.match(read('dist/'+page),/project-title-display\.css\?v=20261027-v1/,page);
 }
});
test('Updated project-rendering scripts retain valid syntax',()=>{
 for(const page of ['dist/account.js','dist/app.js','dist/home-landing.js'])
  assert.doesNotThrow(()=>new vm.Script(read(page),{filename:page}));
});
