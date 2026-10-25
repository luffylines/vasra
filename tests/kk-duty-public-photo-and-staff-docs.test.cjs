'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const server=read('lib/handler.cjs'),staff=read('dist/kk-staff.js'),duty=read('dist/duty.js'),account=read('dist/account.html');
const meta=read('supabase/migrations/20261025191500_kk_staff_docs_dates.sql');
const safety=read('supabase/migrations/20261025192000_kk_officer_confirmed_duplicate_delete.sql');
test('Published duty photos use immutable persisted Supabase image IDs and do not require re-upload after deploy',()=>{
 assert.match(duty,/\.\/api\/duty-images\//);
 assert.doesNotMatch(duty,/src="\.\/api\/images\/.*duty_photo_id/);
 assert.match(server,/if \(\/\^\\\/api\\\/duty-images/);
 assert.match(server,/officer_profile_photo/);
 assert.match(server,/await db\.get\(image\.storage_path\)/);
 assert.match(server,/image\/jpeg.*image\/png.*image\/webp/);
 assert.match(server,/Cache-Control':'public, max-age=300/);
 assert.match(duty,/p\.duty_photo_id/);
});
test('KK staff returns real registration dates and uploaded ID document metadata',()=>{
 assert.match(meta,/'created_at',u\.created_at/);
 assert.match(meta,/'document',\(select jsonb_build_object\('exists',true,'name',d\.file_name,'mime',d\.mime,'uploaded_at',d\.uploaded_at\)/);
 assert.doesNotMatch(meta,/'document'.*?'storage_path'/s);
 assert.match(staff,/doc\?\.exists/);
 assert.match(staff,/doc\.name/);
 assert.match(staff,/kk-document-inline-viewer/);
 assert.match(staff,/m\.document\.mime==='application\/pdf'/);
 assert.match(staff,/kk-validid-full-image/);
});
test('Newest and oldest compare actual created_at with stable fallback',()=>{
 assert.match(staff,/const chosen=\$\('#kk-staff-order'\)/);
 assert.match(staff,/const createdKey=m=>Date\.parse\(m\.created_at/);
 assert.match(staff,/chosen==='old'\?delta:-delta/);
 assert.match(staff,/String\(a\.id\)\.localeCompare\(String\(b\.id\)\)/);
});
test('Only authenticated active officers with copied challenge can remove duplicate accounts',()=>{
 assert.match(server,/await user\(\['sk','chairman'\]\)/);
 assert.match(server,/confirm_code:challenge/);
 assert.match(safety,/u\.role IN \('sk','chairman'\)/);
 assert.match(safety,/confirmed_by_authorized_sk_officer/);
 assert.match(safety,/DELETE KK /);
 assert.match(safety,/FOR UPDATE/);
 assert.match(safety,/REVOKE ALL ON FUNCTION/);
 for(const id of ['kk-delete-dialog','kk-delete-target-name','kk-delete-challenge','kk-delete-copy','kk-delete-confirm-code','kk-delete-confirm-name','kk-delete-acknowledge','kk-delete-submit'])
  assert.ok(account.includes('id="'+id+'"'),id);
 assert.match(staff,/navigator\.clipboard\.writeText/);
 assert.match(staff,/kk-delete-confirm-code/);
 assert.match(staff,/kk-delete-confirm-name/);
 assert.match(staff,/kk-delete-acknowledge/);
 assert.match(staff,/if\(!confirm\('Final confirmation:/);
});
test('Modified browser & server scripts parse',()=>{
 for(const f of ['dist/duty.js','dist/kk-staff.js','lib/handler.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(f),{filename:f}));
});
