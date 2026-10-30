'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const four=['projects','leaders','duty','awards'];
test('Four homepage statistic cards retain their existing SVG artwork and working links',()=>{
 const page=read('dist/index.html');
 for(const kind of four){
  assert.match(page,new RegExp('class="home-summary-card '+kind+'"[^>]*href="|href="[^"]+"[^>]*class="home-summary-card '+kind+'"'));
  assert.match(page,new RegExp('class="home-summary-card '+kind+'"[^>]*>[\\s\\S]*?<svg class="home-card-svg"'));
 }
 assert.equal((page.match(/class="home-summary-card (projects|leaders|duty|awards)"/g)||[]).length,4);
});
test('Dark mode supplies distinct, high-contrast backgrounds and foregrounds for all four icons',()=>{
 const css=read('dist/home-memorial.css');
 for(const kind of four){
  const pos=css.lastIndexOf('.home-summary-card.'+kind+' > .home-summary-icon');
  assert(pos>=0,'Missing '+kind+' icon-specific dark rule');
  const rule=css.slice(pos,css.indexOf('}',pos));
  assert.match(rule,/background-color:#[\da-f]{6}!important/i);
  assert.match(rule,/color:#[\da-f]{6}!important/i);
 }
 assert.match(css,/html\[data-theme="dark"\] body\.portal-refresh \.home-summary-cards/);
 assert.match(css,/\.home-summary-icon > svg\.home-card-svg/);
 assert.match(css,/stroke:currentColor!important/);
 assert.match(css,/color:inherit!important/);
});
test('Light mode is untouched and homepage requests fresh stylesheet',()=>{
 const css=read('dist/home-memorial.css');
 const page=read('dist/index.html');
 assert.match(page,/home-memorial\.css\?v=20261030-dark-svg-contrast-v2/);
 assert.match(css,/\.home-summary-icon\{flex:0 0 52px/);
 assert.match(css,/\.home-summary-card\.awards \.home-summary-icon\{background:#fff2ca;color:#e5a700\}/);
 assert.doesNotMatch(css,/body\[data-theme="light"\] \.home-summary-cards/);
});
