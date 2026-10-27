const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const dist=path.join(__dirname,'../dist');const html=fs.readFileSync(path.join(dist,'index.html'),'utf8'),css=fs.readFileSync(path.join(dist,'home-memorial.css'),'utf8'),js=fs.readFileSync(path.join(dist,'home-landing.js'),'utf8');
test('memorial scene is localized to homepage with official portal brand untouched',()=>{
 assert.match(html,/class="home-memorial-hero"/);assert.match(css,/home-memorial-circle\.webp/);
 assert.match(html,/src="\.\/sk%20logo.jpg"/);assert.match(html,/home-memorial\.css/);
 assert.match(html,/home-landing\.js/);assert.match(html,/home-awards\.js/);
 assert.equal((html.match(/<nav aria-label="Pangunahing navigation">/g)||[]).length,1);
});
test('only requested homepage content, backed by APIs, appears in overview',()=>{
 for(const token of ['home-total-projects','home-total-leaders','home-duty-summary','home-total-awards','home-recent-projects','home-awards-list'])assert(html.includes(token),token);
 for(const removed of ['home-budget-total','home-shortcuts','home-officials','home-columns'])assert(!html.includes('class="'+removed),removed);
 assert.match(js,/api\('\.\/api\/projects'\)/);assert.match(js,/api\('\.\/api\/achievements'\)/);
 assert.match(js,/api\('\.\/api\/duty-status'/);
 assert(!/set\('home-total-projects',12\)|set\('home-total-awards',15\)/.test(js));
});

test('SVG icons replace text symbols and sharp hero asset is versioned',()=>{
 const cards=['projects','leaders','duty','awards'];
 for(const kind of cards){
  const match=html.match(new RegExp('<a class="home-summary-card '+kind+'"[\\s\\S]*?<\\/a>'));
  assert.ok(match,kind);
  assert.match(match[0],/class="home-card-svg"/);
  assert.match(match[0],/class="home-summary-chevron"/);
 }
 assert.doesNotMatch(html, /aria-hidden="true">(?:▣|♟|▦|★)<\\/span>/);
 assert.match(css,/home-memorial-circle\\.webp/);
 assert.match(html,/home-memorial\\.css\\?v=qmc-hd-20261027-v2/);
});

test('responsive homepage uses full-resolution landscape and portrait photographs',()=>{
 assert.match(css,/background-image:url\("\.\/home-memorial-circle\.webp"\)/);
 assert.match(css,/background-image:url\("\.\/home-memorial-circle-mobile\.webp"\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/background-size:cover/);
 assert.match(html,/home-memorial\.css\?v=qmc-hd-20261027-v2/);
 const desktop=fs.readFileSync(path.join(dist,'home-memorial-circle.webp'));
 const mobile=fs.readFileSync(path.join(dist,'home-memorial-circle-mobile.webp'));
 assert(desktop.length>100000,'desktop image unexpectedly compressed');
 assert(mobile.length>100000,'mobile image unexpectedly compressed');
 assert.equal(desktop.toString('ascii',0,4),'RIFF');
 assert.equal(mobile.toString('ascii',0,4),'RIFF');
});

test('Open / Closed status typography is balanced across desktop and mobile cards',()=>{
 const block=css.match(/\.home-summary-card\.duty #home-duty-summary\{[^}]+\}/);
 assert.ok(block,'Dedicated SK Duty card typography must exist');
 assert.match(block[0],/font-size:clamp\(21px,1\.75vw,25px\)/);
 assert.match(css,/@media\(max-width:600px\)\{\s*\.home-summary-card\.duty #home-duty-summary\{font-size:22px\}/);
 assert.match(html,/home-memorial\.css\?v=qmc-hd-20261027-v2/);
 assert.match(js,/isHours&&!closed\?'Open':'Closed'/);
});
