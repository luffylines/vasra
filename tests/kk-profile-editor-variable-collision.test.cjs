'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261025205500_fix_kk_profile_editor_ambiguous_member_id.sql'),'utf8');
const handler=fs.readFileSync(path.join(__dirname,'../lib/handler.cjs'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../dist/kk-staff.js'),'utf8');
test('KK editor does not shadow real member_id column with a local PL/pgSQL variable',()=>{
 assert.match(migration,/target_member_id uuid;/);
 assert.match(migration,/target_member_id=\(payload->>'id'\)::uuid/);
 assert.match(migration,/WHERE vasra\.kk_profiles\.member_id=target_member_id FOR UPDATE/);
 assert.match(migration,/WHERE vasra\.kk_profiles\.member_id=target_member_id;/);
 assert.doesNotMatch(migration,/WHERE vasra\.kk_profiles\.member_id=member_id\b/);
 assert.doesNotMatch(migration,/\n member_id uuid;/);
 assert.match(migration,/'kk_profile_field_corrected',target_member_id::text/);
 assert.match(migration,/'ok',true,'member_id',target_member_id/);
});
test('KK corrections retain all sections, SK and chairman authorization, field allowlists and audit trail',()=>{
 for(const section of ['personal','address','education','additional','emergency'])
  assert.ok(migration.includes("WHEN '"+section+"'"),section);
 assert.match(migration,/u\.role IN \('sk','chairman'\)/);
 assert.match(migration,/u\.disabled_at IS NULL AND NOT u\.must_change/);
 assert.match(migration,/IF NOT FOUND THEN RETURN jsonb_build_object\('error',404\)/);
 assert.match(migration,/field_name NOT IN|NOT field_name=ANY\(allowed\)/);
 assert.match(migration,/INSERT INTO vasra\.audit/);
 assert.match(migration,/REVOKE ALL ON FUNCTION .* FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION .* TO service_role/);
});
test('KK section save calls officer-authenticated endpoint with user-visible errors, not admin-only',()=>{
 assert.match(handler,/if\(path==='\/api\/kk\/staff\/profile-edit'&&method==='POST'\)/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
 assert.match(handler,/db\.rpc\('kk_profile_editor_update'/);
 assert.match(client,/request\('profile-edit',\{id:m\.id,section,changes\}\)/);
 assert.match(client,/Hindi na-save:/);
});
