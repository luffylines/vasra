'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const pages=['index','account','projects','duty','contacts','transparency','youth-leaders'];
for(const page of pages)test(page+' uses the same official SK Vasra favicon and new iPhone touch icon',()=>{
 const html=fs.readFileSync(path.join(root,'dist',page+'.html'),'utf8');
 assert.match(html,/rel="icon" type="image\/jpeg" href="\.\/sk%20logo\.jpg\?v=skvasra-20261019-v2"/);
 assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\.\/apple-touch-icon-vasra\.png\?v=skvasra-20261019-v2"/);
 assert.match(html,/rel="manifest"/);
 assert.match(html,page==='account'?/name="apple-mobile-web-app-title" content="SK Vasra Account"/:/name="apple-mobile-web-app-title" content="SK Vasra"/);
});
test('Apple touch PNG is square, 180px, and all formerly generic PWA icons use official artwork',()=>{
 const read=p=>fs.readFileSync(path.join(root,'dist',p));
 const apple=read('apple-touch-icon-vasra.png');
 assert.equal(apple.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(apple.readUInt32BE(16),180);
 assert.equal(apple.readUInt32BE(20),180);
 for(const p of ['apple-touch-icon.png','sk.png','icon-192.png','icon-512.png'])
  assert.deepEqual(read(p),apple);
 const svg=read('icon.svg').toString();
 assert.match(svg,/data:image\/jpeg;base64,/);
 assert.doesNotMatch(svg,/>SK<\/text>/);
});
test('Manifest and service worker use only current SK logo assets',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'dist/manifest.webmanifest'),'utf8'));
 assert.equal(m.icons[0].src,'./apple-touch-icon-vasra.png?v=20261019-v2');
 assert.equal(m.icons[0].sizes,'180x180');
 assert(m.icons.some(x=>x.src.startsWith('./sk%20logo.jpg')));
 const sw=fs.readFileSync(path.join(root,'dist/sw.js'),'utf8');
 assert.match(sw,/vasra-v39-square-sk-vasra-home-icons-20261019/);
 assert.match(sw,/\.\/apple-touch-icon-vasra\.png/);
});
