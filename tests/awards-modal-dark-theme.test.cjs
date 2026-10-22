'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../dist/awards-dashboard-modal.css'),'utf8');
const markup=fs.readFileSync(path.join(__dirname,'../dist/account.html'),'utf8');
const dark='body.account-workspace[data-theme="dark"] #award-dialog';
function lum(hex){
 const rgb=hex.slice(1).match(/.{2}/g).map(c=>parseInt(c,16)/255);
 const linear=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
function contrast(a,b){const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('Dark award editor styles are scoped to the modal without changing light mode',()=>{
 assert.match(markup,/id="award-dialog"/);
 assert.match(markup,/id="award-caption"/);
 assert.match(markup,/id="award-modal-footer"/);
 assert.match(css,/body\.account-workspace\[data-theme="dark"\] dialog#award-dialog/);
 for(const selector of [
  '.award-modal-header','.award-modal-scroll','.award-mode-choice',
  '.award-facebook-panel','.award-modal-form label','.award-modal-section',
  '.award-image-editor','.award-upload-control','.award-modal-footer'
 ])assert(css.includes(dark+' '+selector),'Dark style missing: '+selector);
 assert.match(css,/\.award-dashboard-dialog\{position:fixed;/);
 assert.match(css,/\.award-dashboard-dialog:not\(\[open\]\)\{display:none!important\}/);
});
test('Facebook caption label, analyzer status and placeholders are readable in dark mode',()=>{
 assert.match(css,/\.award-facebook-panel label,[\s\S]*?\.award-modal-form label,[\s\S]*?\.award-image-editor strong\{\s*color:#eef5ff!important;/);
 assert.match(css,/#award-ai-status/);
 assert.match(css,/#award-ai-evidence/);
 assert.match(css,/::placeholder\{\s*color:#bacee7!important;\s*opacity:1!important;/);
 assert.match(css,/#award-dialog \.award-modal-form select option/);
 assert.match(css,/:focus-visible\{\s*outline:2px solid #9dc9ff!important;/);
});
test('Dark colors meet WCAG AA 4.5:1 minimum for readable interface text',()=>{
 for(const [name,fg,bg] of [
  ['caption label','#eef5ff','#1b304d'],
  ['textarea text','#eef5ff','#12243c'],
  ['caption placeholder','#bacee7','#12243c'],
  ['AI helper and errors','#c4d8ef','#1b304d'],
  ['mode heading','#f3f8ff','#1c304b'],
  ['mode helper','#c4d8f1','#1c304b'],
  ['footer status','#cbddf5','#172b45'],
  ['close button','#f3f8ff','#29476d']
 ])assert(contrast(fg,bg)>=4.5,name+' text contrast was '+contrast(fg,bg).toFixed(2));
});
test('Photo picker, footer and input state have matching dark surfaces',()=>{
 assert.match(css,/\.award-upload-control\{\s*background:#223d61!important;/);
 assert.match(css,/#award-photo-thumbs \.award-thumb\{\s*background:#203755!important;/);
 assert.match(css,/\.award-modal-footer\{\s*background:#172b45!important;/);
 assert.match(css,/\.award-modal-footer \.award-actions \.secondary/);
 assert.match(css,/\.award-modal-footer \.award-actions \.primary/);
 assert.match(css,/-webkit-text-fill-color:#eef5ff/);
 assert.match(css,/color-scheme:dark!important;/);
});
