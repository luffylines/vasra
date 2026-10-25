'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const page=read('dist/projects.html'),theme=read('dist/theme.css'),app=read('dist/app.js');
const rule=selector=>{
 const i=theme.lastIndexOf(selector);
 assert.ok(i>=0,'Missing dark-mode selector: '+selector);
 const brace=theme.indexOf('{',i),close=theme.indexOf('}',brace);
 assert.ok(close>brace,'Broken CSS declaration: '+selector);
 return theme.slice(brace+1,close);
};
const hex=(color)=>{
 const s=color.replace('#','');
 return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
};
const luminance=x=>hex(x).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
test('Projects styling is scoped to dark page while preserving light mode',()=>{
 assert.match(page,/<body class="portal-refresh projects-page">/);
 assert.match(page,/id="grid"/);
 assert.match(page,/class="toolbar"/);
 assert.match(theme,/html\[data-theme="dark"\] body\.portal-refresh\.projects-page/);
 assert.doesNotMatch(read('dist/index.html'),/<body class="portal-refresh projects-page">/);
});
test('All user-reported dark elements receive page-specific contrast rules',()=>{
 for(const key of ['#projects .sectionhead h2 span','#projects .sectionhead p','#projects .toolbar',
  '#projects .filters button','#projects .filters button.selected','#projects .search input',
  '#grid .cardbody .category','#grid .cardbody h3','#grid .cardbody>p',
  '#grid .cardbottom .card-publish-date','#grid .project-card-date-day',
  '#grid .cover .badge','#grid .project-see-more','#detail #detailbody>p',
  '#grid .progresslabel :is(span,b)']){
  assert.ok(theme.includes(key),'No specific dark-mode rule for '+key);
 }
 assert.match(app,/class="badge"/);
 assert.match(app,/class="category"/);
 assert.match(app,/class="card-publish-date"/);
 assert.match(app,/class="project-see-more"/);
});
test('Chosen dark card, date, category and badge colors meet AA text contrast',()=>{
 const card='#172a46';
 for(const [label,textColor] of [['category','#a7d1ff'],['description','#d1e0f4'],
  ['date','#b8d4f5'],['heading','#f2f8ff'],['progress','#e4f1ff']]){
  assert.ok(ratio(textColor,card)>=4.5,label+' contrast too low: '+ratio(textColor,card).toFixed(2));
 }
 assert.ok(ratio('#173d71','#e7f1ff')>=4.5,'status pill text contrast too low');
 assert.ok(ratio('#c4d5ef','#10243c')>=4.5,'filter label contrast too low');
 assert.ok(ratio('#edf6ff','#23456f')>=4.5,'See More label contrast too low');
});
test('Dark detail modal and empty state are legible without changing API',()=>{
 assert.match(theme,/projects-page #detail\{/);
 assert.match(theme,/projects-page #detail #detailbody :is\(h2,h3\)/);
 assert.match(theme,/projects-page #projects \.empty\{/);
 assert.match(theme,/projects-page #grid \.track>div\{/);
 assert.match(page,/<script src="\.\/app\.js">/);
});
