'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync('dist/'+p,'utf8');
const html=read('kk-dashboard.html');
const css=read('kk-dashboard.css');
const js=read('kk-dashboard.js');

test('missing KK ID portrait uses member initials without requiring approval',()=>{
 assert.match(html,/id="kk-sidebar-avatar-fallback">KK<\/span>/);
 assert.match(html,/id="kk-sidebar-photo" alt="" hidden/);
 assert.match(js,/\.map\(part=>String\(part\)\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)\)/);
 assert.match(js,/\.join\(''\)\.slice\(0,2\)\|\|'KK'/);
 assert.match(js,/card\?\.ok!==true\|\|!card\.photo_exists/);
 assert.match(js,/sidebar\.hidden=true;dashboard\.hidden=true/);
 assert.match(js,/sidebar\.hidden=false;dashboard\.hidden=false/);
 assert.match(js,/#kk-sidebar-avatar-fallback'\)\.hidden=true/);
});

test('member name and role have readable sizes and a larger crisp circular portrait',()=>{
 assert.match(css,/kk-sidebar-avatar\{width:48px;height:48px/);
 assert.match(css,/kk-sidebar-person strong\{[^\n]*13px\/1\.4/);
 assert.match(css,/kk-sidebar-person small\{[^\n]*11px\/1\.45/);
 assert.match(css,/color:#e1eeff/);
 assert.match(css,/kk-sidebar-person>span:last-child\{min-width:0;flex:1\}/);
 assert.match(css,/kk-sidebar-avatar img\{display:block;width:100%;height:100%;object-fit:cover/);
 assert.match(css,/kk-sidebar-avatar-fallback\[hidden\]\{display:none\}/);
});

test('member dashboard loads updated CSS and JS after refresh',()=>{
 assert.match(html,/kk-dashboard\.css\?v=20261108-readable-sidebar-v2/);
 assert.match(html,/kk-dashboard\.js\?v=20261108-live-status-v1/);
});
