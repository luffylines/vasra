'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261106144500_kk_service_auto_complete_duty_email.sql');
const server=read('lib/handler.cjs'),router=read('lib/supabase.cjs'),ui=read('dist/kk-service-staff.js');
test('database approval atomically completes with same reviewing SK officer',()=>{
 assert.match(sql,/OLD\.status='pending' AND NEW\.status='approved' AND NEW\.reviewer_id IS NOT NULL/);
 assert.match(sql,/NEW\.status='completed'/);
 assert.match(sql,/NEW\.completed_by=NEW\.reviewer_id/);
 assert.match(sql,/NEW\.completed_at=coalesce\(NEW\.reviewed_at,clock_timestamp\(\)\)/);
 assert.doesNotMatch(ui,/Mark Completed/);
});
test('only authenticated youth-originated service POST initiates duty notification',()=>{
 assert.match(server,/if\(path==='\/api\/kk\/services'&&method==='POST'\)\{/);
 assert.match(server,/const result=await kkRpc\('services_request'/);
 assert.match(server,/notifyDutyOfficerForKKService\(db,kkSession,result\.id,cfg\.origin\)/);
 const walkin=server.slice(server.indexOf("if(path==='/api/kk/staff/services/scan'"),server.indexOf("if(path==='/api/kk/staff/services'&&method==='GET'"));
 assert.doesNotMatch(walkin,/notifyDutyOfficerForKKService/);
 assert.match(sql,/q\.staff_entry_key IS NULL/);
});
test('duty emails use Manila roster, active linked staff and private claim/ack',()=>{
 assert.match(sql,/Asia\/Manila/);
 assert.match(sql,/ANY\(o\.duty_days\)/);
 assert.match(sql,/o\.published IS TRUE AND o\.archived IS FALSE/);
 assert.match(sql,/u\.disabled_at IS NULL/);
 assert.match(sql,/r\.duty_email_nonce IS DISTINCT FROM token_text::uuid/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.vasra_kk_service_duty_mail/);
 assert.match(server,/Idempotency-Key':'kk-service-duty-'\+id/);
 assert.match(router,/vasra_kk_service_duty_mail/);
});
