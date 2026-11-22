'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('dist/vasra-dark-mode-polish.css');
const html=read('dist/account.html');
const projects=read('dist/current-projects.css');
const js=read('dist/current-projects.js');

function block(theme,extra=''){
 const selector='body.account-workspace[data-theme="'+theme+'"] #panel-current-projects\n.current-project-admin-actions>.current-project-upload'+extra+'{';
 const index=css.indexOf(selector);
 assert.ok(index>=0,'Missing '+theme+' contrast rule '+extra);
 return css.slice(index+selector.length,css.indexOf('}',index));
}
function hexColor(block,property){
 const match=block.match(new RegExp('(?:^|\\s)'+property+':(#[0-9a-fA-F]{6})'));
 assert.ok(match,'Missing explicit '+property);
 return match[1];
}
function luminance(hex){
 const values=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255)
  .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return values[0]*.2126+values[1]*.7152+values[2]*.0722;
}
function ratio(fg,bg){
 const a=luminance(fg),b=luminance(bg);
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
test('Dark Current Project upload label has readable text and background on all screen sizes',()=>{
 const rule=block('dark');
 assert.ok(ratio(hexColor(rule,'color'),hexColor(rule,'background'))>=4.5);
 assert.match(rule,/border-color:#[0-9a-f]{6}!important/);
 assert.match(rule,/-webkit-text-fill-color:/);
 assert.ok(css.includes('.current-project-admin-card label:not(.current-project-upload)'),
   'Ordinary labels must not override image picker lettering');
});
test('Light mode preserves dark text on pale image-upload surface',()=>{
 const rule=block('light');
 assert.ok(ratio(hexColor(rule,'color'),hexColor(rule,'background'))>=4.5);
});
test('Keyboard focus, hover and loading feedback stay visible in dark mode',()=>{
 assert.match(css,/.current-project-admin-actions>\.current-project-upload:focus-within/);
 assert.match(css,/.current-project-admin-actions>\.current-project-upload:hover/);
 assert.match(css,/.current-project-admin-actions>\.current-project-upload:has\(input:disabled\)/);
});
test('File chooser keeps full-size iPhone/Android touch target',()=>{
 assert.match(projects,/.current-project-admin-actions \.current-project-upload input\[type="file"\]/);
 assert.match(projects,/pointer-events:auto;cursor:pointer/);
 assert.match(js,/class="current-project-upload">Upload \/ Replace Image<input type="file"/);
 assert.match(js,/input.disabled=true/);
 assert.match(js,/input.disabled=false/);
});
test('Account page explicitly loads new stylesheet regardless of browser cache',()=>{
 assert.match(html,/vasra-dark-mode-polish\.css\?v=20261122-current-upload-contrast-v1/);
 assert.match(html,/id="panel-current-projects"/);
 assert.match(html,/id="current-project-admin"/);
});
