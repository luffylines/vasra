'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {forwardKKReview}=require('../lib/kk-n8n-notifications.cjs');
const env={N8N_KK_NOTIFICATIONS_ENABLED:'true',N8N_KK_WEBHOOK_URL:'https://chan-n8n.duckdns.org/webhook/sk-vasra-kk-verification-v1',N8N_KK_WEBHOOK_SECRET:'a'.repeat(40)};
test('disabled by default: no network traffic',async()=>{
 let called=false;
 const x=await forwardKKReview({memberId:'test',recipient:'test@example.com',decision:'verified',env:{},fetchImpl:()=>{called=true;}});
 assert.equal(x.status,'disabled');assert.equal(called,false);
});
test('verified event maps to approved with stable id and no points modification',async()=>{
 const sent=[];
 const fetchImpl=async(url,opts)=>{sent.push({url,opts,payload:JSON.parse(opts.body)});return {ok:true};};
 const a={memberId:'e462451d-9ea1-438b-9a27-9eec769f731d',recipient:'test@example.com',decision:'verified',origin:'https://vasra.vercel.app',revision:'2026-11-02T12:00:00Z',env,fetchImpl};
 assert.equal((await forwardKKReview(a)).status,'accepted');
 await forwardKKReview(a);
 assert.equal(sent[0].payload.event_id,sent[1].payload.event_id);
 assert.equal(sent[0].payload.status,'approved');
 assert.equal(sent[0].opts.headers['X-SK-VASRA-Webhook-Secret'],env.N8N_KK_WEBHOOK_SECRET);
 assert.ok(!JSON.stringify(sent[0].payload).includes('points'));
});
test('rejected maps to rejected, no fallback sender',async()=>{
 let count=0;
 const x=await forwardKKReview({memberId:'test',recipient:'test@example.com',decision:'rejected',env,fetchImpl:async()=>{count++;return {ok:false,status:503};}});
 assert.equal(x.status,'unavailable');assert.equal(count,1);
});
test('fail closed on invalid URL and missing secret',async()=>{
 assert.equal((await forwardKKReview({memberId:'test',recipient:'test@example.com',decision:'verified',env:{...env,N8N_KK_WEBHOOK_URL:'http://example.com'}})).reason,'webhook_invalid_url');
 assert.equal((await forwardKKReview({memberId:'test',recipient:'test@example.com',decision:'verified',env:{...env,N8N_KK_WEBHOOK_SECRET:'short'}})).reason,'webhook_unconfigured');
});
