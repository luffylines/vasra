'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const FB=require('../lib/facebook-import.cjs');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dist/account.html'),'utf8');
const staff=fs.readFileSync(path.join(root,'dist/account.js'),'utf8');
const api=fs.readFileSync(path.join(root,'lib/handler.cjs'),'utf8');

test('Facebook import only accepts HTTPS post URLs on explicit Facebook hosts',()=>{
 assert.match(FB.validFacebookUrl('https://www.facebook.com/skbrgyvasra/posts/123'),/^https:\/\/www\.facebook\.com/);
 for(const url of ['http://facebook.com/posts/123','https://facebook.com.evil.example/posts/123','https://127.0.0.1/x','https://facebook.com/','https://facebook.com:444/posts/123','https://user:password@facebook.com/posts/123'])
  assert.throws(()=>FB.validFacebookUrl(url));
});
test('public OG metadata parsing is bounded and excludes generic Facebook login screens',()=>{
 assert.equal(FB.metadata('<html><meta property="og:description" content="SK Vasra Youth Leadership Seminar 2026!"></html>'),'SK Vasra Youth Leadership Seminar 2026!');
 assert.equal(FB.metadata('<meta name="description" content="Log in to Facebook to see posts">'),'');
});
test('pasted caption basic autofill returns review-only draft with original source URL',async()=>{
 const result=await FB.importFacebookPost({
  url:'https://www.facebook.com/skbrgyvasra/posts/123',
  caption:'Youth Leadership Training\nPara sa kabataan ng Barangay Vasra'
 },{apiKey:'',fetcher:()=>{throw Error('No network should be requested')}});
 assert.equal(result.ok,true);
 assert.equal(result.source,'pasted-caption');
 assert.equal(result.draft.category,'Edukasyon');
 assert.equal(result.draft.status,'Pinaplano');
 assert.equal(result.draft.progress,0);
 assert.match(result.draft.scope,/Facebook post: https:\/\/www\.facebook\.com\/skbrgyvasra\/posts\/123/);
 assert.equal(result.imagesImported,0);
 assert.equal(result.needsReview,true);
});
test('unavailable Facebook pages return caption fallback instead of guessed project info',async()=>{
 const res=await FB.importFacebookPost({url:'https://facebook.com/post/123',caption:''},{aiKey:'',fetcher:async()=>{throw new Error('Blocked')}});
 assert.equal(res.ok,false);
 assert.equal(res.reason,'caption_required');
 assert.equal(res.draft,undefined);
});
test('AI response is constrained to text fields, publication and progress remain manual',async()=>{
 const f=async (url,init)=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
  title:'Community Cleanup',category:'Kalikasan',description:'Community clean-up activity',
  scope:'Cleanup in the barangay',published:true,progress:100,status:'Natapos'
 })}}]})});
 const res=await FB.importFacebookPost({
  url:'https://www.facebook.com/skbrgyvasra/posts/456',caption:'Clean up drive at Vasra.'
 },{aiKey:'test-only',fetcher:f});
 assert.equal(res.ok,true);assert.equal(res.draft.method,'ai');
 assert.equal(res.draft.title,'Community Cleanup');
 assert.equal(res.draft.progress,0);assert.equal(res.draft.status,'Pinaplano');
 assert.match(res.draft.scope,/Facebook post:/);
});
test('UI provides URL, caption and photo fallback, and never autosaves imported drafts',()=>{
 for(const id of ['fb-import-panel','fb-post-url','fb-post-caption','fb-import-screenshot','fb-analyze-post','fb-import-result'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(staff,/form\.elements\.published\.checked=false/);
 assert.match(staff,/form\.elements\.status\.value='Pinaplano'/);
 assert.match(staff,/appendProjectFiles\(files\)/);
 assert.match(staff,/\.\/api\/manage\/projects\/import-facebook/);
 assert.match(api,/await user\(\['chairman'\]\)/);
 assert.match(api,/limit\('facebook-import'/);
});

test('new project has explicit Manual Entry and Facebook URL + Groq AI modes',()=>{
 assert.match(html,/id="project-entry-mode"/);
 assert.match(html,/id="entry-mode-manual"[^>]*aria-pressed="true"/);
 assert.match(html,/id="entry-mode-facebook"[^>]*aria-pressed="false"/);
 assert.match(html,/Manual Entry/);
 assert.match(html,/Facebook URL \+ Groq AI/);
 assert.match(html,/id="fb-import-panel"[^>]*hidden/);
 assert.match(staff,/function setProjectEntryMode\(mode\)/);
 assert.match(staff,/const facebook=mode==='facebook'&&!editing&&user\?\.role==='chairman'/);
 assert.match(staff,/setProjectEntryMode\('manual'\)/);
 assert.match(staff,/button\.setAttribute\('aria-pressed',String\(active\)\)/);
});
test('Manual mode is always the default; Facebook mode offers Groq and fallback without auto-publish',()=>{
 const start=staff.indexOf('function setProjectEntryMode(mode){');
 const end=staff.indexOf("function openEditor(project=null)",start);
 assert(start>=0&&end>start);
 const block=staff.slice(start,end);
 const buttons=['manual','facebook'].map(value=>({
  dataset:{entryMode:value},classList:{toggle(name,v){this.selected=v}},
  setAttribute(name,v){this[name]=v}
 }));
 const nodes={
  '#project-entry-mode':{hidden:false,addEventListener(){}},
  '#manual-entry-help':{hidden:false},
  '#fb-import-panel':{hidden:true,open:false}
 };
 const dom={querySelectorAll:()=>buttons};
 const $=id=>nodes[id];
 const build=new Function('$','document','getUser','getEditing',
  'return function(mode){let user=getUser(),editing=getEditing();'+
  block.slice(block.indexOf('const facebook='),block.indexOf("$('#project-entry-mode').addEventListener")).replace(/\}\s*$/,'')+
  '}');
 const chairman=build($,dom,()=>({role:'chairman'}),()=>null);
 chairman('manual');
 assert.equal(nodes['#fb-import-panel'].hidden,true);
 assert.equal(nodes['#manual-entry-help'].hidden,false);
 chairman('facebook');
 assert.equal(nodes['#fb-import-panel'].hidden,false);
 assert.equal(nodes['#fb-import-panel'].open,true);
 assert.equal(nodes['#manual-entry-help'].hidden,true);
 assert.equal(buttons[1]['aria-pressed'],'true');
 const officer=build($,dom,()=>({role:'sk'}),()=>null);
 officer('facebook');
 assert.equal(nodes['#project-entry-mode'].hidden,true);
 assert.equal(nodes['#fb-import-panel'].hidden,true);
});
