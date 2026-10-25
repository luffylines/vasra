'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('SK Services staff-list migration resolves the 42702 ambiguous PL/pgSQL alias',()=>{
 const sql=read('supabase/migrations/20261025162249_fix_kk_services_staff_list_ambiguous_request_alias.sql');
 const start=sql.indexOf("IF action='staff_list' THEN"),end=sql.indexOf("END IF;",start);
 assert.ok(start>0&&end>start,'staff_list block must exist');
 const list=sql.slice(start,end);
 assert.match(list,/FROM \(SELECT \* FROM vasra\.kk_service_requests ORDER BY requested_at DESC LIMIT 3000\) request_item/);
 assert.match(list,/request_item\.id/);
 assert.match(list,/m\.id=request_item\.member_id/);
 assert.doesNotMatch(list,/\br\./,'ambiguous r record/table alias must be removed only from SELECT');
 assert.match(sql,/DECLARE[\s\S]*?r vasra\.kk_service_requests;/);
 assert.match(sql,/IF action='complete' THEN/);
 assert.match(sql,/IF action NOT IN \('review','complete'\) THEN/); // Function still validates review actions.
 assert.match(sql,/SECURITY INVOKER/);
 assert.doesNotMatch(sql,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM vasra\.kk_service_requests)\b/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.vasra_kk_service_workflow\(text,jsonb,text\) TO service_role/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.vasra_kk_service_workflow\(text,jsonb,text\) FROM PUBLIC,anon,authenticated/);
});

test('SK Officer UI renders actual pages/copies and computer hours from the staff API',()=>{
 const ui=read('dist/kk-service-staff.js'),handler=read('lib/handler.cjs'),router=read('lib/supabase.cjs');
 assert.match(ui,/d\.pages/);
 assert.match(ui,/d\.copies/);
 assert.match(ui,/d\.hours/);
 assert.match(handler,/kkRpc\('service_workflow_staff_list',\{\},true\)/);
 assert.match(router,/action\.startsWith\('kk_service_workflow_'\)/);
 assert.match(router,/rpc\/vasra_kk_service_workflow/);
});
