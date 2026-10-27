'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../dist');
const page=fs.readFileSync(path.join(root,'projects.html'),'utf8');
const css=fs.readFileSync(path.join(root,'project-hero-scenic.css'),'utf8');
test('projects hero retains original content, CTA and background size with SK logo',()=>{
 for(const t of ['ANG ATING KOMUNIDAD, ANG ATING BUKAS','Maliliit na hakbang.',
 'Malaking pagbabago.','Kilalanin ang mga naka-duty'])
  assert(page.includes(t),t);
 assert.match(page,/href="\.\/duty" class="hero-link/);
 assert.match(page,/class="hero-mark-logo" src="\.\/sk%20logo.jpg"/);
 assert.match(page,/project-hero-scenic\.css\?v=20261027-v1/);
 assert.equal((page.match(/<section class="project-hero">/g)||[]).length,1);
 assert.match(css,/background-image:url\("\.\/home-memorial-circle\.webp"\)/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert(!/min-height\s*:\s*\d+px/.test(css),'do not change hero height');
 assert(!/padding\s*:\s*\d+px/.test(css.match(/\.portal-refresh\.projects-page \.project-hero\{[^}]+/)[0]),'preserve hero padding');
 assert(fs.existsSync(path.join(root,'home-memorial-circle.webp')));
 assert(fs.existsSync(path.join(root,'sk logo.jpg')));
});
