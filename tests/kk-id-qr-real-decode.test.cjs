'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Official SK VASRA generated QR is readable by the bundled mobile decoder',()=>{
 const win={};
 vm.runInNewContext(read('dist/kk-id-render.js'),{window:win,TextEncoder,Uint8Array,Math});
 const vendor={exports:{}};
 vm.runInNewContext(read('dist/vendor-jsqr.js'),{module:vendor,exports:vendor.exports,Uint8ClampedArray,Uint8Array,Math});
 const decoder=vendor.exports;
 assert.equal(typeof decoder,'function');
 const ids=['VASRA-KK-02','VASRA-KK-100','VASRA-KK-9999'];
 for(const id of ids){
  const matrix=win.KKIDRender.qr(id);
  assert.equal(matrix.length,21);
  const scale=10,pad=4,dim=(21+pad*2)*scale;
  const rgba=new Uint8ClampedArray(dim*dim*4);
  for(let y=0;y<dim;y++)for(let x=0;x<dim;x++){
   const i=4*(y*dim+x),mx=Math.floor(x/scale)-pad,my=Math.floor(y/scale)-pad;
   const black=mx>=0&&my>=0&&mx<21&&my<21&&matrix[my][mx];
   rgba[i]=rgba[i+1]=rgba[i+2]=black?0:255;rgba[i+3]=255;
  }
  const result=decoder(rgba,dim,dim,{inversionAttempts:'attemptBoth'});
  assert.equal(result?.data,id,'The actual official card QR must decode as the KK ID');
 }
});
