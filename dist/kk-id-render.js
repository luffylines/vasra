'use strict';
/* Identical browser preview/PDF card artwork. No CDN and no third-party QR service:
   QR V1-L encodes only the printed KK ID, never private profile information.
   CR80 PDF MediaBox is exactly 85.6 x 54 mm on every front/back page. */
(()=>{
 const W=1284,H=810,MM=72/25.4,PDF_W=85.6*MM,PDF_H=54*MM;
 const getImage=async url=>{
  if(!url)return null;
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('Cannot load approved portrait ('+response.status+').');
  const blob=await response.blob();
  if(!/^image\/(jpeg|png|webp)$/.test(blob.type))throw Error('Unexpected portrait format.');
  const objectURL=URL.createObjectURL(blob);
  try{
   return await new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);
    img.onerror=()=>reject(Error('Unable to decode approved photo.'));img.src=objectURL;
   });
  }finally{URL.revokeObjectURL(objectURL);}
 };
 const logoImage=()=>{
  const img=new Image();img.src='./sk%20logo.jpg';
  return new Promise(resolve=>{
   if(img.complete){resolve(img.naturalWidth?img:null);return;}
   img.onload=()=>resolve(img);img.onerror=()=>resolve(null);
  });
 };
 // A complete self-contained QR Version 1, level L: 19 data bytes + 7 RS ECC.
 const qr=value=>{
  const bytes=[...new TextEncoder().encode(String(value||''))];
  if(bytes.length===0||bytes.length>17)throw Error('KK ID is too long for the QR code.');
  const bits=[0,1,0,0]; // Byte mode 0100
  for(let i=7;i>=0;i--)bits.push((bytes.length>>>i)&1);
  for(const byte of bytes)for(let i=7;i>=0;i--)bits.push((byte>>>i)&1);
  for(let i=0;i<4&&bits.length<152;i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const data=[];
  for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((v,b)=>(v<<1)|b,0));
  for(let pad=0;data.length<19;pad++)data.push(pad%2?0x11:0xec);
  const mul=(a,b)=>{let z=0;for(let i=7;i>=0;i--){if((b>>>i)&1)z^=a;a=(a<<1)^((a&0x80)?0x11d:0);}return z&255;};
  const gen=[87,229,146,149,238,102,21],ecc=new Array(7).fill(0);
  for(const byte of data){
   const factor=byte^ecc.shift();ecc.push(0);
   for(let i=0;i<7;i++)ecc[i]^=mul(gen[i],factor);
  }
  const encoded=[...data,...ecc],stream=[];
  for(const b of encoded)for(let i=7;i>=0;i--)stream.push((b>>>i)&1);
  const size=21,grid=Array.from({length:size},()=>Array(size).fill(false)),
   fixed=Array.from({length:size},()=>Array(size).fill(false));
  const set=(x,y,b)=>{if(x<0||y<0||x>=size||y>=size)return;grid[y][x]=!!b;fixed[y][x]=true;};
  const finder=(left,top)=>{
   for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){
    const x=left+dx,y=top+dy;
    const dark=dx>=0&&dx<=6&&dy>=0&&dy<=6&&
     (dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4));
    set(x,y,dark);
   }
  };
  finder(0,0);finder(14,0);finder(0,14);
  for(let i=8;i<=12;i++){set(i,6,i%2===0);set(6,i,i%2===0);}
  // Reserve two copies of format information before inserting data bits.
  for(let i=0;i<=8;i++){if(i!==6){set(8,i,false);set(i,8,false);}}
  for(let i=13;i<size;i++){set(8,i,false);set(i,8,false);}
  set(8,13,true);
  let bit=0,upward=true;
  for(let right=20;right>=1;right-=2){
   if(right===6)right=5;
   for(let rowIndex=0;rowIndex<size;rowIndex++){
    const y=upward?20-rowIndex:rowIndex;
    for(let d=0;d<2;d++){
     const x=right-d;if(fixed[y][x])continue;
     const raw=bit<stream.length?stream[bit++]:0;
     grid[y][x]=!!(raw^((x+y)%2===0?1:0)); // QR mask 0
    }
   }
   upward=!upward;
  }
  // L correction level = 1 (binary 01), mask = 0.
  let format=8<<10;for(let i=14;i>=10;i--)if((format>>>i)&1)format^=0x537<<(i-10);
  format=((8<<10)|format)^0x5412;
  const fm=(x,y,i)=>set(x,y,(format>>>i)&1);
  for(let i=0;i<15;i++){
   // Vertical format copy: row 0..5,7..8,14..20 at column 8.
   fm(8,i<6?i:i<8?i+1:i+6,i);
   // Horizontal format copy: columns 20..13,7,5..0 at row 8.
   fm(i<8?20-i:i===8?7:14-i,8,i);
  }
  set(8,13,true);
  return grid;
 };
 const rounded=(c,x,y,w,h,r,fill,stroke)=>{
  c.beginPath();c.roundRect(x,y,w,h,r);
  if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}
 };
 const txt=(c,value,x,y,size=24,color='#1a3558',weight=600,maxWidth)=>{
  c.fillStyle=color;c.font=weight+' '+size+'px Arial, sans-serif';
  c.fillText(String(value??'').toUpperCase(),x,y,...(maxWidth?[maxWidth]:[]));
 };
 const cover=(c,img,x,y,w,h)=>{
  if(!img){rounded(c,x,y,w,h,8,'#e5d9f5','#c9badf');txt(c,'PHOTO',x+w/2-48,y+h/2,25);return;}
  const scale=Math.max(w/img.width,h/img.height),sourceW=w/scale,sourceH=h/scale;
  c.save();c.beginPath();c.roundRect(x,y,w,h,10);c.clip();
  c.drawImage(img,(img.width-sourceW)/2,(img.height-sourceH)/2,sourceW,sourceH,x,y,w,h);
  c.restore();rounded(c,x,y,w,h,10,null,'#e1b5cb');
 };
 const dateText=value=>{
  if(!value)return 'PENDING';
  const d=new Date(String(value).slice(0,10)+'T12:00:00Z');
  return Number.isNaN(d.getTime())?'PENDING':d.toLocaleDateString('en-US',
   {month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).toUpperCase();
 };
 const valid=member=>/^VASRA-KK-[0-9]+$/.test(String(member?.kk_id||''));
 const art=async(member,face,options={})=>{
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d',{alpha:false}),logo=await logoImage();
  let bg=x.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#fffefb');bg.addColorStop(.34,'#faf0ff');
  bg.addColorStop(.73,'#f1e7fe');bg.addColorStop(1,'#fff2b0');
  x.fillStyle=bg;x.fillRect(0,0,W,H);
  const g=x.createRadialGradient(1100,710,20,1100,710,650);
  g.addColorStop(0,'#ffe97566');g.addColorStop(1,'#ffffff00');
  x.fillStyle=g;x.fillRect(0,0,W,H);
  x.strokeStyle='#bb9de250';x.lineWidth=3;
  for(let n=0;n<8;n++){x.beginPath();x.arc(1230,460,120+n*48,0,Math.PI*1.8);x.stroke();}
  for(let n=0;n<8;n++){x.beginPath();x.arc(110,760,120+n*50,Math.PI,Math.PI*1.85);x.stroke();}
  rounded(x,11,11,W-22,H-22,44,null,'#e2beef');
  rounded(x,20,20,W-40,H-40,40,null,'#fff8');
  if(logo){x.drawImage(logo,56,52,112,112);x.drawImage(logo,1117,50,111,111);}
  txt(x,'REPUBLIKA NG PILIPINAS',W/2,81,24,'#192640',700,530);
  txt(x,'SANGGUNIANG KABATAAN',W/2,114,29,'#172441',800,575);
  txt(x,'SK VASRA IDENTIFICATION CARD',W/2,147,20,'#3a4271',650,575);
  x.fillStyle='#edbcf4';x.fillRect(195,180,890,3);
  const code=String(member.kk_id||'VASRA-KK-—'),status=member.status||'not_uploaded';
  if(face==='front'){
   cover(x,options.photo,50,230,248,355);
   txt(x,'APELYIDO / SURNAME',336,255,21,'#677091',600);
   txt(x,member.last_name||member.name||'—',336,296,41,'#18223c',800,880);
   txt(x,'PANGALAN / GIVEN NAME',336,337,21,'#677091',600);
   txt(x,member.first_name||'',336,378,41,'#18223c',800,880);
   txt(x,'GITNANG PANGALAN / MIDDLE NAME',336,419,21,'#677091',600);
   txt(x,member.middle_name||'—',336,454,31,'#18223c',700,860);
   txt(x,'PETSA NG KAPANGANAKAN / DATE OF BIRTH',336,501,20,'#677091',600,630);
   txt(x,dateText(member.birthdate),336,540,27,'#172441',700,550);
   txt(x,'KASARIAN / SEX',940,501,20,'#677091',600);
   txt(x,member.gender||'—',940,540,27,'#172441',700,250);
   txt(x,'ADDRESS',55,635,20,'#657096',600);
   const address=[member.street,member.barangay||'Barangay Vasra',member.city||'Quezon City'].filter(Boolean).join(', ');
   txt(x,address||'BARANGAY VASRA, QUEZON CITY',55,676,24,'#1e2b48',700,1172);
   rounded(x,55,706,260,50,8,'#ffe89a');
   txt(x,code,76,741,25,'#1b2541',800,236);
   txt(x,'KATIPUNAN NG KABATAAN · VASRA',1096,743,18,'#5e5478',700,650);
   if(status!=='approved'||!options.photo){rounded(x,416,570,450,42,12,'#ffffffc7');
    txt(x,'PHOTO FOR SK VERIFICATION',450,599,22,'#9d4a59',800);}
  }else{
   const matrix=valid(member)?qr(code):null;
   if(matrix){
    rounded(x,60,245,333,333,16,'#ffffff');
    const cell=10.15,originX=80,originY=265;
    x.fillStyle='#fff';x.fillRect(originX,originY,294,294);
    x.fillStyle='#121e34';
    for(let y=0;y<21;y++)for(let xx=0;xx<21;xx++)if(matrix[y][xx])x.fillRect(originX+(xx+4)*cell,originY+(y+4)*cell,cell+.3,cell+.3);
   }else{rounded(x,60,245,333,333,12,'#fff');txt(x,'QR PENDING',105,415,32);}
   txt(x,'OFFICIAL KK ID',450,268,22,'#65708e',650);
   txt(x,code,450,320,42,'#15233e',800,790);
   txt(x,'DATE ISSUED',450,390,23,'#677190',650);
   txt(x,dateText(member.issued_at),450,432,34,'#24304e',800,775);
   txt(x,'BARANGAY VASRA',450,501,24,'#65708e',650);
   txt(x,'QUEZON CITY · PHILIPPINES',450,537,29,'#1b2e52',800);
   txt(x,'SCAN QR TO READ THE KK ID NUMBER',59,623,21,'#424d70',700,835);
   x.fillStyle='#e3a8d0';x.fillRect(55,654,1170,3);
   txt(x,'THIS CARD IS PROPERTY OF SK VASRA. IF FOUND, RETURN TO THE SK VASRA OFFICE.',56,693,20,'#4a5d78',700,1160);
   txt(x,'40 FORESTRY ST, BARANGAY VASRA, QUEZON CITY',56,730,21,'#59647d',650,1130);
  }
  return c;
 };
 const pdf=(cards,fileName)=>{
  if(!cards.length)throw Error('No approved KK cards selected.');
  const enc=new TextEncoder(),chunks=[],positions=[0],imageCount=cards.length,objects=2+imageCount*3;
  let cursor=0;
  const write=part=>{const buf=typeof part==='string'?enc.encode(part):part;chunks.push(buf);cursor+=buf.length;};
  const start=n=>{positions[n]=cursor;write(n+' 0 obj\n');},finish=()=>write('\nendobj\n');
  write('%PDF-1.4\n%KKID\n');
  start(1);write('<< /Type /Catalog /Pages 2 0 R >>');finish();
  start(2);write('<< /Type /Pages /Count '+imageCount+' /Kids ['+
   cards.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');finish();
  cards.forEach((canvas,i)=>{
   const p=3+i*3,contents=p+1,image=p+2;
   const raw=atob(canvas.toDataURL('image/jpeg',.95).split(',')[1]);
   const jpeg=new Uint8Array(raw.length);
   for(let j=0;j<raw.length;j++)jpeg[j]=raw.charCodeAt(j);
   start(p);write('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+
    PDF_W.toFixed(5)+' '+PDF_H.toFixed(5)+'] /Resources << /XObject << /Card '+
    image+' 0 R >> >> /Contents '+contents+' 0 R >>');finish();
   const stream='q\n'+PDF_W.toFixed(5)+' 0 0 '+PDF_H.toFixed(5)+' 0 0 cm\n/Card Do\nQ\n';
   start(contents);write('<< /Length '+enc.encode(stream).length+' >>\nstream\n'+stream+'endstream');finish();
   start(image);write('<< /Type /XObject /Subtype /Image /Width '+canvas.width+
    ' /Height '+canvas.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');
   write(jpeg);write('\nendstream');finish();
  });
  const xref=cursor;write('xref\n0 '+(objects+1)+'\n0000000000 65535 f \n');
  for(let i=1;i<=objects;i++)write(String(positions[i]).padStart(10,'0')+' 00000 n \n');
  write('trailer\n<< /Size '+(objects+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  const blob=new Blob(chunks,{type:'application/pdf'}),href=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=href;link.download=fileName.replace(/[^a-zA-Z0-9_.-]/g,'_');
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),60000);
 };
 const pair=async(member,photoUrl)=>{
  const photo=photoUrl?await getImage(photoUrl):null;
  const [front,back]=await Promise.all([art(member,'front',{photo}),art(member,'back',{photo})]);
  return {front,back};
 };
 window.KKIDRender={pair,pdf,qr,CR80:{widthMm:85.6,heightMm:54,widthPoints:PDF_W,heightPoints:PDF_H}};
})();
