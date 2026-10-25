'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const renderer=read('dist/kk-id-render.js'),member=read('dist/kk-id-member.js');
const staff=read('dist/kk-id-staff.js'),api=read('lib/handler.cjs');
const sql=read('supabase/migrations/20261025215000_kk_id_cr80_duplex_print_tracking.sql');
const fields=read('supabase/migrations/20261025215800_kk_id_front_back_official_fields.sql');
test('QR V1-L for VASRA-KK-01 matches the published standards-compliant byte encoding and format',()=>{
 const window={};
 vm.runInNewContext(renderer,{window,TextEncoder,Uint8Array});
 const matrix=window.KKIDRender.qr('VASRA-KK-01');
 assert.equal(matrix.length,21);
 assert.ok(matrix.every(row=>row.length===21));
 const expected=[
 '111111100101101111111','100000100111001000001','101110101101101011101',
 '101110100101001011101','101110100010101011101','100000100000101000001',
 '111111101010101111111','000000001101100000000','111011111111011000100',
 '101100000000011101010','110111101100110111111','011010000000010010011',
 '110010111110100001111','000000001001001101000','111111101111011111011',
 '100000101111110000001','101110101111010101100','101110100101010111010',
 '101110101000101010001','100000101000010000010','111111101000110010111'
 ];
 assert.deepEqual(Array.from(matrix,row=>Array.from(row,b=>b?'1':'0').join('')),expected);
 assert.throws(()=>window.KKIDRender.qr('MORE-THAN-17-CHARACTERS'));
});
test('The downloaded PDF has exact CR80 MediaBox on two pages',async()=>{
 let saved=null,download='';
 const body={append(){}},url={createObjectURL(blob){saved=blob;return 'blob:test'},revokeObjectURL(){}};
 const document={body,createElement(tag){assert.equal(tag,'a');return {href:'',set download(v){download=v},click(){},remove(){}};}};
 const window={};
 vm.runInNewContext(renderer,{window,document,TextEncoder,Uint8Array,Blob,URL:url,atob,setTimeout(){}});
 const cards=[0,1].map(()=>({width:1284,height:810,toDataURL:()=> 'data:image/jpeg;base64,'+btoa('not-a-real-jpeg')}));
 window.KKIDRender.pdf(cards,'VASRA-KK-01-front-back-CR80.pdf');
 assert.equal(download,'VASRA-KK-01-front-back-CR80.pdf');
 assert.ok(saved instanceof Blob);
 const pdf=new TextDecoder().decode(await saved.arrayBuffer());
 assert.ok(pdf.startsWith('%PDF-1.4'));
 assert.match(pdf,/\/Count 2 \/Kids/);
 const bounds=[...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
 assert.equal(bounds.length,2);
 for(const b of bounds){assert.ok(Math.abs(Number(b[1])-85.6*72/25.4)<.001);
  assert.ok(Math.abs(Number(b[2])-54*72/25.4)<.001);}
 assert.match(pdf,/\/Subtype \/Image \/Width 1284 \/Height 810/);
 assert.match(pdf,/xref\n0 9\n/);
});
test('Member and staff preview run the SAME QR & artwork renderer',()=>{
 const memberHTML=read('dist/kk-dashboard.html'),staffHTML=read('dist/account.html');
 for(const html of [memberHTML,staffHTML])assert.match(html,/src="\.\/kk-id-render\.js"/);
 assert.match(member,/window\.KKIDRender\.pair/);
 assert.match(staff,/window\.KKIDRender\.pair/);
 assert.match(staff,/KKIDRender\.pdf\(pages/);
 assert.match(staff,/KKIDRender\.pdf\(\[pair\.front,pair\.back\]/);
 assert.match(memberHTML,/kk-id-render-back/);
 assert.match(staffHTML,/kk-id-staff-back/);
 assert.match(read('dist/kk-id-card.css'),/aspect-ratio:85\.6 \/ 54/);
});
test('Only reviewed portraits can be exported; printing requires confirmation and audit',()=>{
 assert.match(staff,/const approved=r=>r\.status==='approved'&&r\.photo_exists/);
 assert.match(staff,/rows\.filter\(approved\)/);
 assert.match(staff,/data-card-download/);
 assert.match(staff,/kk-id-bulk-pdf/);
 assert.match(staff,/data-card-printed/);
 assert.match(staff,/if\(!confirm\('Confirm that /);
 assert.match(api,/path==='\/api\/kk\/staff\/id-cards\/printed'&&method==='POST'/);
 assert.match(api,/await user\(\['sk','chairman'\]\)/);
 assert.match(api,/b\.confirmed!==true/);
 assert.match(sql,/IF card\.status<>'approved'/);
 assert.match(sql,/INSERT INTO vasra\.kk_id_card_audit/);
 assert.match(sql,/action.*'printed'/);
 assert.match(sql,/printed_by uuid REFERENCES vasra\.users/);
 assert.match(sql,/print_count integer NOT NULL DEFAULT 0/);
 assert.match(fields,/'first_name',m\.first_name/);
 assert.match(fields,/'issued_at',c\.reviewed_at/);
});
test('No anonymous PDF/photos/QR token leaking or external QR generators',()=>{
 assert.match(api,/if\(path==='\/api\/kk\/id-card\/photo'/);
 assert.match(api,/if\(path==='\/api\/kk\/staff\/id-cards'&&method==='GET'\)/);
 assert.match(renderer,/encodes only the printed KK ID/);
 assert.doesNotMatch(renderer,/api\.qrserver|quickchart\.io|chart\.googleapis|GOOGLE_CLIENT_SECRET/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.vasra_kk_card/);
 assert.match(fields,/REVOKE ALL ON FUNCTION public\.vasra_kk_card/);
});
test('All client/server scripts compile',()=>{
 for(const file of ['dist/kk-id-render.js','dist/kk-id-staff.js','dist/kk-id-member.js','lib/handler.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
