'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/20261025020000_fix_kk_rpc_ambiguity.sql'),
 client=read('dist/kk.js'),handler=read('lib/handler.cjs'),
 staff=read('dist/kk-staff.js'),backend=read('lib/supabase.cjs');
test('Database KK staff listing and member login lookup use disambiguated record names',()=>{
 assert.match(sql,/selected_perk vasra\.kk_perks/);
 assert.match(sql,/select \* into selected_perk from vasra\.kk_perks/);
 assert.match(sql,/lookup_member\.id/);
 assert.match(sql,/from vasra\.kk_members lookup_member where lookup_member\.email/);
 assert.match(sql,/jsonb_build_object\('members',coalesce/);
 assert.match(sql,/grant execute|CREATE OR REPLACE FUNCTION public\.vasra_kk/i);
 assert.doesNotMatch(sql,/drop table|delete from vasra\.kk_members|truncate vasra\.kk_/i);
 assert.match(sql,/notify pgrst, 'reload schema'/);
});
test('Existing logged-in KK members resume steps instead of registering twice',()=>{
 assert.match(client,/getApi\('me'\)\.then\(result=>/);
 assert.match(client,/if\(result\?\.member\?\.id\)location\.replace\(result\.profile\?\.status==='verified'\?'\.\/kk-dashboard':'\.\/kk-profile'\)/);
 assert.match(client,/if\(result\?\.ok\)location\.replace\('\.\/kk-profile'\)/);
 assert.match(client,/link\.href='\.\/kk-login'/);
 assert.match(client,/Pumunta sa KK Login at ipagpatuloy ang profiling/);
 assert.match(handler,/result\?\.error===409&&action==='register'/);
 assert.match(handler,/Mag-login upang ituloy ang 5-step profiling/);
 assert.match(client,/const titles=\['Personal Information','Education','Additional Information','Emergency Contact','Review & Submit'\]/);
 assert.match(client,/await send\('submit',\{\}\)/);
});
test('KK applications appear in staff dashboard only after member submits and sessions are authorized',()=>{
 assert.match(staff,/await Promise\.all\(\[request\(''\),request\('sitios'\),request\('catalog'\)\]\)/);
 assert.match(staff,/members=result\.members;sitios=sitioResult\.sitios/);
 assert.match(staff,/m\.status==='pending'/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
 assert.match(handler,/const result=await kkRpc\('staff_list',\{\},true\)/);
 assert.match(backend,/SK VASRA RPC failed/);
 assert.doesNotMatch(backend,/console\.warn\([^)]*password_hash/);
});
test('All updated modules parse without exposing credentials',()=>{
 for(const [name,file] of [['KK frontend','dist/kk.js'],['KK staff','dist/kk-staff.js'],
  ['handler','lib/handler.cjs'],['Supabase backend','lib/supabase.cjs']])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:name}));
 assert.doesNotMatch(sql,/sb_secret_|Bearer /);
});
