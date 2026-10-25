'use strict';
// Minimal standards-compliant XLSX writer: inline-string cells prevent formula
// injection and avoid extra runtime dependencies or third-party services.
const {deflateRawSync}=require('node:zlib');
function xml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');}
const table=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}
function crc(bytes){let c=0xffffffff;for(const v of bytes)c=table[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const letter=index=>{let result='';let n=index+1;while(n){n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26);}return result;};
function workbook(rows){
 const cells=rows.map((row,ri)=>'<row r="'+(ri+1)+'">'+row.map((value,ci)=>{
  const address=letter(ci)+(ri+1);
  return typeof value==='number'&&Number.isFinite(value)?
   '<c r="'+address+'"><v>'+value+'</v></c>':
   '<c r="'+address+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
 }).join('')+'</row>').join('');
 const files={
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Verified KK" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+letter(rows[0].length-1)+rows.length+'"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>'+cells+'</sheetData></worksheet>'
 };
 const parts=[],central=[];let offset=0;
 const localHeader=(name,source,packed,checksum)=>{
  const nameB=Buffer.from(name),h=Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);
  h.writeUInt32LE(checksum,14);h.writeUInt32LE(packed.length,18);h.writeUInt32LE(source.length,22);h.writeUInt16LE(nameB.length,26);
  return {h,nameB};
 };
 for(const [name,value] of Object.entries(files)){
  const source=Buffer.from(value),packed=deflateRawSync(source),checksum=crc(source);
  const {h,nameB}=localHeader(name,source,packed,checksum);
  parts.push(h,nameB,packed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);
  c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt32LE(checksum,16);c.writeUInt32LE(packed.length,20);
  c.writeUInt32LE(source.length,24);c.writeUInt16LE(nameB.length,28);c.writeUInt32LE(offset,42);
  central.push(c,nameB);offset+=h.length+nameB.length+packed.length;
 }
 const centralData=Buffer.concat(central);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);
 end.writeUInt32LE(centralData.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,centralData,end]);
}
module.exports={workbook};
