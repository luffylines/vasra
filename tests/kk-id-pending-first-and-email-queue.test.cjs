'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('dist/kk-id-staff.js');
const b=js.indexOf(' const reviewPriority=');
const e=js.indexOf(' const filtered=',b);
const order=new Function(js.slice(b,e)+'return sortForReview;')();
test('Pending KK photo submissions are listed first, with newest pending at top',()=>{
 const source=[
  {status:'approved',kk_id:'VASRA-KK-02',uploaded_at:'2026-10-27T11:00:00Z'},
  {status:'pending',kk_id:'VASRA-KK-03',uploaded_at:'2026-10-27T09:00:00Z'},
  {status:'not_uploaded',kk_id:'VASRA-KK-04'},
  {status:'rejected',kk_id:'VASRA-KK-06',uploaded_at:'2026-10-26T08:00:00Z'},
  {status:'pending',kk_id:'VASRA-KK-05',uploaded_at:'2026-10-27T12:00:00Z'}
 ];
 assert.deepEqual(order(source).map(x=>x.kk_id),[
  'VASRA-KK-05','VASRA-KK-03','VASRA-KK-06','VASRA-KK-04','VASRA-KK-02'
 ]);
 assert.equal(source[0].kk_id,'VASRA-KK-02','do not modify input array');
});
test('Same-status tie break is deterministic even with missing timestamps',()=>{
 const source=[{status:'approved',kk_id:'VASRA-KK-10'},
  {status:'approved',kk_id:'VASRA-KK-02'},
  {status:'pending',kk_id:'VASRA-KK-11',uploaded_at:'bad time'},
  {status:'pending',kk_id:'VASRA-KK-01',uploaded_at:'2026-10-26T00:00:00Z'}];
 assert.deepEqual(order(source).map(x=>x.kk_id),[
  'VASRA-KK-01','VASRA-KK-11','VASRA-KK-02','VASRA-KK-10'
 ]);
});
test('Sorting is performed after searching and filtering, with summary showing pending queue',()=>{
 assert.match(js,/return sortForReview\(rows\.filter\(/);
 assert.match(js,/r\.status===filter/);
 assert.match(js,/\[r\.name,r\.kk_id\]/);
 assert.match(js,/pending photo review/);
 for(const a of ['data-card-approve','data-card-reject','data-card-download',
   'data-card-mail','data-card-printed','data-card-preview'])
  assert(js.includes(a),'unchanged action: '+a);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(read('dist/account.html'),/kk-id-staff\.js\?v=20261027-resubmit-pending-v1/);
});
test('Approved KK ID reviews can be queued even when issued before the email migration',()=>{
 const sql=read('supabase/migrations/20261027170000_kk_card_review_email_pdf_resubmit.sql');
 assert.match(sql,/Backfill is queue-only: it sends no emails/);
 assert.match(sql,/c\.status IN \('approved','rejected'\)/);
 assert.match(sql,/ON CONFLICT\(member_id,card_path\) DO NOTHING/);
 assert.match(sql,/ALTER TABLE vasra\.kk_card_review_mail ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.vasra_kk_card_mail.*TO service_role/s);
 assert.match(read('dist/sw.js'),/vasra-v69-homepage-barangay-hall-20261029/);
});
