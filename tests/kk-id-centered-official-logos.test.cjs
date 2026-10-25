'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const renderer=fs.readFileSync(path.join(root,'dist/kk-id-render.js'),'utf8');
const frontBackPages=['kk-dashboard.html','account.html'];
test('Authentic Barangay Vasra JPEG seal is committed for canvas exports',()=>{
 const jpeg=fs.readFileSync(path.join(root,'dist/barangay-vasra-logo.jpg'));
 assert.ok(jpeg.length>3000,'logo should have actual image bytes');
 assert.equal(jpeg[0],0xff);assert.equal(jpeg[1],0xd8);assert.equal(jpeg[2],0xff);
 assert.equal(jpeg[jpeg.length-2],0xff);assert.equal(jpeg[jpeg.length-1],0xd9);
 assert.match(renderer,/logoImage\('\.\/barangay-vasra-logo\.jpg'\)/);
 assert.match(renderer,/logoImage\('\.\/sk%20logo\.jpg'\)/);
});
test('Left Barangay logo and right SK logo use equal 112-pixel slots and centered header text on both faces',async()=>{
 const calls=[];let canvasIndex=0;
 class Context{
  constructor(id){this.id=id;this.textAlign='start';this.fillStyle='';this.strokeStyle='';}
  createLinearGradient(){return{addColorStop(){}}}
  createRadialGradient(){return{addColorStop(){}}}
  fillRect(){} stroke(){} beginPath(){} arc(){} roundRect(){} fill(){} save(){this.saved=this.textAlign} restore(){this.textAlign=this.saved} clip(){}
  drawImage(img,...args){calls.push({type:'image',id:this.id,src:img.src,args});}
  fillText(text,x,y,maxWidth){calls.push({type:'text',id:this.id,value:text,x,y,align:this.textAlign});}
 }
 class ImageMock{
  constructor(){this.complete=true;this.naturalWidth=112;this.width=112;this.height=112;this.src='';}
 }
 const doc={createElement(name){assert.equal(name,'canvas');const id=++canvasIndex;return{width:0,height:0,getContext(){return new Context(id);}};}};
 const sandbox={window:{},document:doc,Image:ImageMock,TextEncoder,console};
 vm.runInNewContext(renderer,sandbox);
 const result=await sandbox.window.KKIDRender.pair({kk_id:'VASRA-KK-02',first_name:'Test',last_name:'Member'});
 assert.ok(result.front&&result.back);
 for(const id of [1,2]){
  const images=calls.filter(x=>x.type==='image'&&x.id===id);
  assert.equal(images.length,2);
  assert.match(images[0].src,/barangay-vasra-logo\.jpg$/);
  assert.match(images[1].src,/sk%20logo\.jpg$/);
  assert.deepEqual(images[0].args,[56,52,112,112]);
  assert.deepEqual(images[1].args,[1116,52,112,112]);
  const heads=calls.filter(x=>x.type==='text'&&x.id===id&&[
   'REPUBLIKA NG PILIPINAS','SANGGUNIANG KABATAAN','SK VASRA IDENTIFICATION CARD'].includes(x.value));
  assert.equal(heads.length,3);
  for(const h of heads){assert.equal(h.x,642);assert.equal(h.align,'center');}
 }
});
test('Preview and print share same versioned renderer to prevent mixed old logo assets',()=>{
 for(const name of frontBackPages){
  const file=fs.readFileSync(path.join(root,'dist',name),'utf8');
  assert.match(file,/src="\.\/kk-id-render\.js\?v=20261025-brgy-vasra-centered-v2"/);
 }
});
