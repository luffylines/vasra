'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const handler=read('lib/handler.cjs'),backend=read('lib/supabase.cjs');
const member=read('dist/kk-id-member.js'),staff=read('dist/kk-id-staff.js');
const profile=read('dist/kk.js'),render=read('dist/kk-id-render.js');
const mailSql=read('supabase/migrations/20261027170000_kk_card_review_email_pdf_resubmit.sql');
const optionalSql=read('supabase/migrations/20261027171500_optional_kk_valid_id_manual_sk_review.sql');
test('KK member portrait uses PRIVATE identity storage and not reward image validation',()=>{
 const start=handler.indexOf("if(path==='/api/kk/id-card/photo'&&method==='POST')");
 const end=handler.indexOf("if(path==='/api/kk/id-card/photo'&&method==='GET')",start);
 assert(start>0&&end>start);
 const upload=handler.slice(start,end);
 assert.match(upload,/await db\.putPrivate\(filePath,bytes,mime\)/);
 assert.doesNotMatch(upload,/db\.putReward/);
 assert.match(upload,/^/);
 assert.match(read('supabase/migrations/20261027165000_kk_photo_private_storage_types.sql'),/image\/webp/);
 assert.match(handler,/return json\(await kkCard\('photo_save'/);
});
test('Rejected photo exposes re-upload UI and own review note without un-verifying profile',()=>{
 assert.match(member,/state==='rejected'\?'Rejected · Upload a New Photo'/);
 assert.match(member,/Choose a NEW photo and submit for SK approval/);
 assert.match(member,/uploadCard\.hidden=approved/);
 assert.match(member,/if\(memberApproval==='approved'\)/);
 assert.match(mailSql,/IF FOUND AND card\.status='approved'/);
 assert.match(mailSql,/status='pending',review_note='',uploaded_at=clock_timestamp\(\)/);
});
test('Photo review mail notifications are staff authorized, race-guarded and private',()=>{
 assert.match(mailSql,/u\.role IN \('chairman','sk'\)/);
 assert.match(mailSql,/kk_card_review_mail_after_review/);
 assert.match(mailSql,/OLD\.status='pending' AND NEW\.status IN \('approved','rejected'\)/);
 assert.match(mailSql,/UNIQUE\(member_id,card_path\)/);
 assert.match(mailSql,/claim_nonce/);
 assert.match(mailSql,/delivery_state='accepted'/);
 assert.match(backend,/kk_card_mail_.*vasra_kk_card_mail/);
 assert.match(handler,/async function deliverKKCardReviewEmail/);
 assert.match(handler,/email\.attachments=\[/);
 assert.match(handler,/content:pdf\.toString\('base64'\)/);
 assert.match(handler,/Idempotency-Key':'kk-id-photo-review-'/);
 assert.match(handler,/db\.putPrivate\(pdfPath,bytes,'application\/pdf'\)/);
 assert.match(handler,/async function notifyKKCardReview/);
 assert.match(handler,/await notifyKKCardReview\(db,session,id\)/);
 assert.match(staff,/const status=await emailApproved\(current\)/);
 assert.match(staff,/Send \/ Retry ID PDF Email/);
 assert.match(render,/const pdfBytes=cards=>/);
 assert.match(render,/window\.KKIDRender=\{pair,pdf,pdfBytes,qr/);
});
test('Valid ID is optional but KK profiling still needs SK review',()=>{
 assert.match(profile,/Valid ID <small class="kk-optional-label">\(Optional\)/);
 assert.match(profile,/Wala pa akong Valid ID/);
 assert.match(profile,/Puwede kang mag-Save &amp; Next kahit walang Valid ID/);
 assert.doesNotMatch(profile,/if\(current===1&&!validID\?\.exists\)/);
 assert.doesNotMatch(profile,/kk-valid-id-file"[^\n]*required/);
 assert.match(profile,/if\(idBusy\)/);
 assert.match(optionalSql,/pg_get_functiondef/);
 assert.match(optionalSql,/not exists\(select 1 from vasra\.kk_valid_ids/);
 assert.match(optionalSql,/RAISE EXCEPTION/);
 assert.match(read('dist/kk-staff.js'),/SK staff must manually verify identity/);
});
test('Scripts keep valid JavaScript syntax and preview assets refresh',()=>{
 for(const p of ['dist/kk.js','dist/kk-id-member.js','dist/kk-id-staff.js','dist/kk-id-render.js','dist/kk-staff.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
 assert.match(read('dist/kk-dashboard.html'),/kk-id-member\.js\?v=20261027-resubmit-pending-v1/);
 assert.match(read('dist/account.html'),/kk-id-staff\.js\?v=20261027-kk-review-email-v1/);
 assert.match(read('dist/kk-profile.html'),/kk\.js\?v=20261027-optional-valid-id-v1/);
});
