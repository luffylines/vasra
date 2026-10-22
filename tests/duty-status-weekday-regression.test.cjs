'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Duty status SQL uses an unambiguous Philippine-local weekday lookup',()=>{
 const sql=load('supabase/migrations/20261018150000_weekly_office_hours.sql');
 assert.doesNotMatch(sql,/where h\.weekday=weekday;/);
 assert.match(sql,/where h\.weekday=extract\(isodow from \(clock_timestamp\(\) at time zone 'Asia\/Manila'\)\);/);
 assert.match(sql,/if action='status' then/);
});
test('Existing production function patch is idempotent and preserves duty records',()=>{
 const sql=load('supabase/migrations/20261019110000_fix_duty_status_weekday.sql');
 assert.match(sql,/if position\('where h\.weekday=weekday;' in ddl\)>0 then/);
 assert.match(sql,/execute replace\(ddl/);
 assert.doesNotMatch(sql,/\b(delete from|truncate|drop table|update vasra\.duty_)\b/i);
 assert.match(sql,/commit;/);
});
test('Chairman dashboard retains verified status response and safe error handling',()=>{
 const app=load('dist/account.js'),handler=load('lib/handler.cjs');
 assert.match(handler,/db\.rpc\('duty_status'\)/);
 assert.match(app,/if\(!\['auto','closed'\]\.includes\(result\.mode\)/);
 assert.match(app,/setDutyBadge\(open\?'open':'closed'/);
 assert.match(app,/closed\.disabled=true;auto\.disabled=true;retry\.hidden=false/);
});
