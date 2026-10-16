'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../dist');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const officers=read('officers.js');
const portraits=read('officers.css');
const chart=read('leaders-compact.css');
const mobile=read('mobile-nav.css');
const pages=['index.html','projects.html','duty.html','youth-leaders.html','contacts.html','transparency.html','account.html'];

test('public and staff pages share responsive viewport, drawer and CSS',()=>{
 for(const page of pages){
  const html=read(page);
  assert.match(html,/name="viewport"/,page);
  assert.match(html,/href="\.\/mobile-nav\.css"/,page);
  assert.match(html,/src="\.\/shell\.js"/,page);
 }
 assert.match(mobile,/max-width:850px/);
 assert.match(mobile,/body\.mobile-menu-ready \.portal-main\{width:100%/);
 assert.match(mobile,/sidebar-backdrop/);
});

test('SK portraits load in iOS and keep a visible safe fallback',()=>{
 assert.match(officers,/loading="eager"/);
 assert.match(officers,/officer-portrait-fallback/);
 assert.match(officers,/document\.addEventListener\('load'/);
 assert.match(officers,/document\.addEventListener\('error'/);
 assert.match(portraits,/\.officer-portrait\.portrait-loaded:not\(\.portrait-error\) img\{opacity:1\}/);
 assert.match(portraits,/\.officer-portrait\.portrait-error img\{display:none\}/);
 assert.match(portraits,/\.officer-portrait-fallback\{/);
 assert.doesNotMatch(officers,/<script/i);
});

test('SK Youth Leaders has small screen two-column hierarchy with connected tiers',()=>{
 assert.match(chart,/@media\(max-width:690px\)/);
 assert.match(chart,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(chart,/\.leaders-compact \.org-tier:before/);
 assert.match(chart,/\.leaders-compact \.org-chair/);
 assert.match(chart,/@media\(max-width:350px\)/);
 assert.match(chart,/\.leaders-compact \.org-card strong\{font-size:12px\}/);
});

test('mobile header and content have no forced desktop-width layout',()=>{
 assert.match(mobile,/body\.mobile-menu-ready \.mobile-appbar/);
 assert.match(mobile,/body\.mobile-menu-ready \.mobile-appbar \.mobile-brand/);
 assert.match(mobile,/max-width:100%;overflow-x:clip/);
 assert.match(mobile,/body\.account-workspace\.mobile-menu-ready \.account-main/);
 assert.match(mobile,/body\.account-workspace\.mobile-menu-ready \.account-main :is\(input,select,textarea\)/);
});
