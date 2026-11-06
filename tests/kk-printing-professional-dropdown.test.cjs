'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('dist/kk-dashboard.html','utf8');
const css=fs.readFileSync('dist/kk-services.css','utf8');
test('Free Printing keeps native accessible selects and original submission fields',()=>{
 for(const name of ['paper_size','color']){
  assert.match(html,new RegExp('<select name="'+name+'" required>'));
 }
 for(const value of ['short','long','bw','colored'])assert.match(html,new RegExp('<option value="'+value+'">'));
 assert.equal((html.match(/class="kk-select-wrap"/g)||[]).length,2);
 assert.equal((html.match(/class="kk-select-chevron"/g)||[]).length,2);
});
test('Dropdown has dedicated chevron at the right edge, responsive width and clear focus state',()=>{
 assert.match(css,/#kk-printing-form \.kk-select-wrap select/);
 assert.match(css,/-webkit-appearance:none;appearance:none/);
 assert.match(css,/padding:10px 42px 10px 14px/);
 assert.match(css,/position:absolute;top:50%;right:10px/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/:focus-within select/);
 assert.match(css,/html\[data-theme="dark"\] body\.kk-body #kk-printing-form/);
 assert.match(html,/kk-services\.css\?v=20261106-printing-select-v1/);
});
