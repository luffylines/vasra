'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const pages=["account","achievements","contacts","current-project","duty","index","kk-dashboard","kk-login","kk-profile","kk-register","kk-reset","projects","sk-resolutions","transparency","youth-leaders"];
test('Shared touch policy is loaded by all 15 portal entrypoints',()=>{
 for(const page of pages)assert(read('dist/'+page+'.html').includes('src="./common.js'),page);
});
test('Double tap suppressed but scrolling and pinch zoom preserved',()=>{
 const js=read('dist/common.js');
 assert(js.includes('vasra-mobile-touch-zoom-policy'));
 assert(js.includes('html,body{touch-action:manipulation'));
 assert(js.includes('a,button,label,summary,input,select,textarea'));
 assert(!js.includes('user-scalable=no'));
 assert(!js.includes('maximum-scale=1'));
 assert(!js.includes('touchend') || !js.includes('touchend.preventDefault'));
 assert.doesNotThrow(()=>new vm.Script(js));
});
test('Mobile form controls use 16px text to avoid Safari focus zoom',()=>{
 const js=read('dist/common.js');
 assert(js.includes('pointer:coarse'));
 assert(js.includes('max-width:820px'));
 assert(js.includes('font-size:16px!important'));
 assert(js.includes('contenteditable'));
});
