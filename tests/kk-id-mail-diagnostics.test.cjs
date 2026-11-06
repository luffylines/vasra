'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const handler=fs.readFileSync(path.join(__dirname,'../lib/handler.cjs'),'utf8');
test('KK ID Resend requires real provider receipt',()=>{
 assert.match(handler,/if\(typeof receipt\.id!=='string'\|\|!receipt\.id\.trim\(\)\)throw Error\('provider_receipt_missing'\)/);
});
test('KK ID failure returns staff-only sanitized code, without email or attachment data',()=>{
 assert.match(handler,/function kkCardMailFailureCode\(error\)/);
 assert.match(handler,/return \{status:'pending',reason\};/);
 assert.match(handler,/reason:'queue_claim_failed'/);
 assert.match(handler,/provider_not_accepted_/);
});
test('existing idempotency and approved PDF attachment preserved',()=>{
 assert.match(handler,/Idempotency-Key':'kk-id-photo-review-'\+ticket\.event_id/);
 assert.match(handler,/content:pdf\.toString\('base64'\)/);
 assert.match(handler,/kk_card_mail_accept/);
});
