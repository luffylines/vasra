'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dist=path.join(__dirname,'../dist');
const read=p=>fs.readFileSync(path.join(dist,p),'utf8');
const html=read('index.html'),css=read('home-memorial.css'),js=read('home-landing.js'),sw=read('sw.js');
const picture='https://quezoncity.gov.ph/wp-content/uploads/2025/01/vasra3.jpg';

test('homepage retains official SK VASRA navigation, content and card links',()=>{
 assert.match(html,/class="home-memorial-hero"/);
 assert.match(html,/src="\.\/sk%20logo.jpg"/);
 assert.match(html,/home-landing\.js/);
 assert.match(html,/home-awards\.js/);
 assert.equal((html.match(/<nav aria-label="Pangunahing navigation">/g)||[]).length,1);
 for(const token of ['home-total-projects','home-total-leaders','home-duty-summary','home-total-awards','home-recent-projects','home-awards-list'])
  assert(html.includes(token),token);
 for(const removed of ['home-budget-total','home-shortcuts','home-officials','home-columns'])
  assert(!html.includes('class="'+removed),removed);
 assert.match(js,/api\('\.\/api\/projects'\)/);
 assert.match(js,/api\('\.\/api\/achievements'\)/);
 assert.match(js,/api\('\.\/api\/duty-status'/);
});

test('homepage background is the official Barangay Vasra building, not the QC Memorial Circle',()=>{
 assert(css.includes('background-image:url("'+picture+'")'));
 assert(!css.includes('url("./home-memorial-circle.webp")'));
 assert(!css.includes('url("./home-memorial-circle-mobile.webp")'));
 assert(css.includes('Quezon City Government, Jan 18 2025'));
 assert(html.includes('home-memorial.css?v=vasra-barangay-hall-20261029-v1'));
 assert(sw.includes("vasra-v69-homepage-barangay-hall-20261029"));
 assert(!sw.includes("'./home-memorial-circle.webp'"));
 assert(!sw.includes("'./home-memorial-circle-mobile.webp'"));
});

test('desktop, tablet and mobile hero preserve original typography and clickable buttons',()=>{
 assert.match(css,/@media \(min-width:1201px\)/);
 assert.match(css,/@media \(min-width:601px\) and \(max-width:1200px\)/);
 assert.match(css,/@media \(max-width:600px\)/);
 assert.match(css,/background-position:60% 36%/);
 assert.match(css,/background-size:cover/);
 assert.match(html,/class="home-memorial-primary"/);
 assert.match(html,/class="home-memorial-secondary"/);
 assert.match(css,/\.home-memorial-hero::after/);
});

test('vector icons and SK Duty live status stay unchanged',()=>{
 for(const kind of ['projects','leaders','duty','awards']){
  const section=html.match(new RegExp('<a class="home-summary-card '+kind+'"[^]*?<\\/a>'));
  assert(section,kind);
  assert.match(section[0],/home-card-svg/);
  assert.match(section[0],/home-summary-chevron/);
 }
 assert.match(css,/font-size:clamp\(21px,1\.75vw,25px\)/);
 assert.match(js,/isHours&&!closed\?'Open':'Closed'/);
});
