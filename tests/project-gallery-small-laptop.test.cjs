'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Staff gallery uses a viewport bounded three-row dialog',()=>{
 const css=read('dist/admin-dashboard.css'),html=read('dist/account.html');
 assert.match(html,/id="staff-project-gallery"/);
 assert.match(css,/#staff-project-gallery\[open\]\{/);
 assert.match(css,/grid-template-rows:auto minmax\(0,1fr\) auto!important/);
 assert.match(css,/max-height:calc\(100dvh - 24px\)!important/);
 assert.match(css,/\.staff-gallery-photo-wrap img\{/);
 assert.match(css,/@media\(max-height:650px\), \(max-width:650px\)/);
 assert.match(html,/id="staff-gallery-close"/);
});
test('Public project gallery similarly preserves close button and image on laptop viewport',()=>{
 const css=read('dist/portal.css');
 const html=read('dist/projects.html');
 assert.match(css,/#image-lightbox\[open\]\{/);
 assert.match(css,/grid-template-rows:auto minmax\(0,1fr\) auto!important/);
 assert.match(css,/max-height:calc\(100dvh - 24px\)!important/);
 assert.match(css,/\.lightbox-view img\{/);
 assert.match(html,/id="lightbox-close"/);
 assert.match(html,/id="lightbox-image"/);
});
