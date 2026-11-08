'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/20261108105000_verified_kk_qr_without_photo_and_scan_completion.sql','utf8');
test('QR lookup requires an authorized SK officer and verified KK membership, not approved photo',()=>{
 assert.match(sql,/u\.role IN \('sk','chairman'\)/);
 assert.match(sql,/membership_status IS DISTINCT FROM 'verified'/);
 assert.match(sql,/card_verified=\(card_status='approved'/);
 assert.match(sql,/'card_verified',coalesce\(card_verified,false\)/);
 assert.doesNotMatch(sql,/IF entry_mode='qr' AND NOT coalesce\(card_verified,false\)/);
});
test('scanner keeps completed by reviewer and avoids duplicate completion failure',()=>{
 assert.match(sql,/IF r\.status='completed' AND r\.completed_by=actor\.id THEN/);
 assert.match(sql,/RETURN jsonb_build_object\('ok',true,'status','completed'\)/);
 assert.match(sql,/IF r\.status<>'approved' THEN RETURN jsonb_build_object\('error',409\)/);
});
test('scan and workflow RPCs are still service-role only',()=>{
 for(const fn of ['vasra_kk_scan_identity','vasra_kk_service_workflow']){
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+fn+'\\(text,jsonb,text\\) FROM PUBLIC,anon,authenticated'));
  assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+fn+'\\(text,jsonb,text\\) TO service_role'));
 }
});
