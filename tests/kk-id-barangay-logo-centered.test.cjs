'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const render=read('dist/kk-id-render.js');
test('Uploaded Barangay Vasra official seal is a real local 112px JPEG',()=>{
 const logo=fs.readFileSync(path.join(root,'dist/barangay-vasra-logo.jpg'));
 assert.ok(logo.length>2500,'Missing or empty Barangay Vasra logo');
 assert.deepEqual([...logo.subarray(0,3)],[255,216,255],'Not a JPEG');
 assert.deepEqual([...logo.subarray(-2)],[255,217],'JPEG is truncated');
 assert.match(render,/logoImage\('\.\/barangay-vasra-logo\.jpg'\)/);
 assert.match(render,/logoImage\('\.\/sk%20logo\.jpg'\)/);
});
test('Both CR80 faces center all ID title lines and show Barangay LEFT / SK RIGHT at equal sizes',async()=>{
 const window={},calls=[];
 class LogoImage{
  naturalWidth=112;
  set src(s){this._src=s;this.onload?.();}
  get src(){return this._src;}
 }
 const document={createElement(type){
  assert.equal(type,'canvas');
  let ctx={textAlign:'start',stack:[],lineWidth:1,
   beginPath(){},arc(){},clip(){},fill(){},stroke(){},fillRect(){},roundRect(){},
   createLinearGradient(){return {addColorStop(){}};},
   createRadialGradient(){return {addColorStop(){}};},
   save(){this.stack.push(this.textAlign);},
   restore(){this.textAlign=this.stack.pop()||'start';},
   drawImage(img,...geometry){calls.push({kind:'image',src:img.src,geometry});},
   fillText(text,x,y){calls.push({kind:'text',text,x,y,textAlign:this.textAlign});},
  };
  return {width:0,height:0,getContext(){return ctx;}};
 }};
 vm.runInNewContext(render,{window,document,Image:LogoImage,TextEncoder,Uint8Array});
 const member={kk_id:'VASRA-KK-02',name:'Christian Aring',first_name:'Christian',last_name:'Aring',gender:'Male'};
 await window.KKIDRender.pair(member,null);
 const images=calls.filter(c=>c.kind==='image'),texts=calls.filter(c=>c.kind==='text');
 assert.equal(images.length,4,'Each side requires both logos');
 for(let i=0;i<4;i+=2){
  assert.equal(images[i].src,'./barangay-vasra-logo.jpg');
  assert.equal(images[i+1].src,'./sk%20logo.jpg');
  assert.deepEqual(images[i].geometry,[56,52,112,112]);
  assert.deepEqual(images[i+1].geometry,[1116,52,112,112]);
 }
 for(const text of ['REPUBLIKA NG PILIPINAS','SANGGUNIANG KABATAAN','SK VASRA IDENTIFICATION CARD']){
  const matches=texts.filter(t=>t.text===text);
  assert.equal(matches.length,2,'Missing header text on front/back: '+text);
  for(const t of matches){assert.equal(t.x,642);assert.equal(t.textAlign,'center');}
 }
});
test('Member and officer previews use a fresh, shared artwork asset',()=>{
 const member=read('dist/kk-dashboard.html'),officer=read('dist/account.html');
 const path='./kk-id-render.js?v=20261025-kk-id-on-demand-v2';
 assert.ok(member.includes(path),'Member script not refreshed');
 assert.ok(officer.includes(path),'Staff script not refreshed');
 assert.match(render,/x\.arc\(112,108,53,0,Math\.PI\*2\)/);
 assert.match(render,/x\.textAlign='right'/);
 assert.match(render,/85\.6\*MM/);
 assert.match(render,/54\*MM/);
});
test('Render script compiles and still supports PDF and QR',()=>{
 assert.doesNotThrow(()=>new vm.Script(render));
 assert.match(render,/const qr=value=>/);
 assert.match(render,/const pdf=\(cards,fileName\)=>/);
});
