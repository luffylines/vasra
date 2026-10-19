'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const pages=['index','account','projects','duty','contacts','transparency','youth-leaders'];
for(const p of pages)test(p+' SK Vasra browser and Apple icons',()=>{const html=fs.readFileSync(path.join(root,'dist',p+'.html'),'utf8');assert.match(html,/rel="icon" type="image\/jpeg" href="\.\/sk%20logo\.jpg/);assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\.\/apple-touch-icon\.png/);assert.match(html,/rel="manifest"/);});
test('Manifest and cache point to actual SK artwork',()=>{const m=JSON.parse(fs.readFileSync(path.join(root,'dist/manifest.webmanifest')));assert.equal(m.icons[0].src,'./sk.png');const sw=fs.readFileSync(path.join(root,'dist/sw.js'),'utf8');assert.match(sw,/apple-touch-icon\.png/);});
