'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync('dist/'+p,'utf8');
const quick=read('kk-quick-scan.js'),service=read('kk-qr-scan.js'),events=read('kk-event-staff.js'),html=read('account.html');

test('All three camera scanners decode immediately and do not schedule overlapping expensive frames',()=>{
 const configs=[['quick',quick,'scan'],['service',service,'decodeFrame'],['participants',events,'scanFrame']];
 for(const [name,js,method] of configs){
  assert.match(js,new RegExp('void '+method+'\\(\\);'),name+' immediate first scan');
  assert.match(js,new RegExp('timer=setInterval\\('+method+',140\\)'),name+' faster scan cadence');
  assert.match(js,/const attempt=\+\+frames/,name+' tracks attempts');
  assert.match(js,/attempt%4===0/,name+' periodic fallback after native misses');
  assert.match(js,/attempt%5===0\?960:720/,name+' adaptive resolution');
  assert.match(js,/attempt%7===0\?'attemptBoth':'dontInvert'/,name+' fast normal decoding');
  assert.match(js,/canvas\.width!==w/,name+' reuses matching canvas size');
  assert.match(js,/scanContext \|\|=canvas\.getContext/,name+' reuses drawing context');
  assert.match(js,/focusMode\?\.includes\('continuous'\)/,name+' optional auto-focus');
 }
 assert.match(quick,/!active\|\|reading\|\|busy/);
 assert.match(service,/!active\|\|processing\|\|decoding/);
 assert.match(events,/!active\|\|busy\|\|decoding/);
 assert.match(events,/finally\{decoding=false;\}/);
});

test('SK Participants uses bundled QR library instead of waiting for a third-party CDN',()=>{
 assert.match(events,/s\.src='\.\/vendor-jsqr\.js\?v=20261026-local-qr-v1'/);
 assert.doesNotMatch(events,/cdn\.jsdelivr\.net/);
 assert.match(html,/vendor-jsqr\.js\?v=20261026-local-qr-v1/);
 for(const name of ['kk-event-staff','kk-qr-scan','kk-quick-scan'])
  assert.match(html,new RegExp(name+'\\.js\\?v=20261108-fast-qr-v1'));
});

test('Existing printed KK QR codes decode locally in one non-inverted pass',()=>{
 const scope={window:{},TextEncoder};
 vm.runInNewContext(read('kk-id-render.js'),scope,{filename:'kk-id-render.js'});
 const jsQR=require('../dist/vendor-jsqr.js');
 for(const id of ['VASRA-KK-02','VASRA-KK-123']){
  const matrix=scope.window.KKIDRender.qr(id),scale=8,width=29*scale;
  const rgba=new Uint8ClampedArray(width*width*4);rgba.fill(255);
  for(let y=0;y<21;y++)for(let x=0;x<21;x++)if(matrix[y][x]){
   for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
    const offset=((y+4)*scale+dy)*width*4+((x+4)*scale+dx)*4;
    rgba[offset]=rgba[offset+1]=rgba[offset+2]=0;
   }
  }
  assert.equal(jsQR(rgba,width,width,{inversionAttempts:'dontInvert'})?.data,id);
 }
});

test('Only verified IDs are accepted and event attendance retains server-side validation',()=>{
 const route=read('kk-event-staff.js');
 assert.match(quick,/^\s*if\(!\/\^VASRA-KK-\[0-9\]\{1,10\}\$\/\.test\(raw\)\)/m);
 assert.match(service,/\^VASRA-KK-\[0-9\]\{1,10\}\$/);
 assert.match(route,/mode:automatic\?'qr':'manual'/);
 assert.match(route,/await request\('\/checkin'/);
 assert.match(quick,/await api\('\.\/api\/kk\/staff\/services\/scan'/);
});
