'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const js=read('dist/kk-staff.js'),css=read('dist/kk-staff.css'),sql=read('supabase/migrations/20261025073000_kk_profile_staff_child_editor.sql');
const handler=read('lib/handler.cjs'),db=read('lib/supabase.cjs');

test('KK card editors open the child view and preserve parent selection',()=>{
 for(const section of ['personal','address','education','additional','emergency']){
  assert.match(js,new RegExp("data-edit-section"));
  assert.match(js,new RegExp(section+":\\["));
 }
 assert.match(js,/className='kk-child-edit-view'/);
 assert.match(js,/data-cancel-edit/);
 assert.match(js,/Back to Profile/);
 assert.match(js,/Save Changes/);
 assert.match(js,/area\.classList\.add\('kk-editing-child'\)/);
 assert.match(js,/selectedMemberId=target\.dataset\.openMember/);
 assert.match(js,/const m=selectedMember\(\)/);
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'dist/kk-staff.js'}));
});
test('Staff edit POST uses current selected member ID and server reload after Save',()=>{
 assert.match(js,/request\('profile-edit',\{id:m\.id,section,changes\}\)/);
 assert.match(js,/closeChildEditor\(\);\s*await refresh\(\)/);
 assert.match(handler,/if\(path==='\/api\/kk\/staff\/profile-edit'&&method==='POST'\)\{\s*await user\(\['sk','chairman'\]\)/);
 assert.match(handler,/Object\.keys\(b\.changes\)\.length>10/);
 assert.match(db,/vasra_kk_profile_editor/);
 assert.match(db,/action\.slice\(18\)/);
});
test('Secured child edit SQL white-lists fields, locks record, preserves ID and logs metadata only',()=>{
 assert.match(sql,/SELECT u\.\* INTO staff FROM vasra\.users/);
 assert.match(sql,/AND u\.role IN \('sk','chairman'\)/);
 assert.match(sql,/FROM vasra\.kk_profiles\s*WHERE vasra\.kk_profiles\.member_id=member_id FOR UPDATE/);
 assert.match(sql,/array_append\(changed_keys,field_name\)/);
 assert.match(sql,/kk_profile_field_corrected/);
 assert.match(sql,/changed_keys/);
 assert.match(sql,/coalesce\(profile,'\{\}'::jsonb\)\|\|patch/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.vasra_kk_profile_editor.*FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/FROM vasra\.kk_sitios s WHERE s\.id::text=field_value AND s\.active/);
 assert.match(sql,/field_name IN \('sk_voter','national_voter','voted_last_election','kk_assembly'\)/);
 assert.match(js,/Secured file · staff-only access/);
 assert.doesNotMatch(js,/data-edit-section="valid.?id"/);
});
test('Child overlay is responsive, keyboard focusable and dark-mode scoped',()=>{
 assert.match(css,/#panel-kk-profiling \.kk-child-edit-view/);
 assert.match(css,/#panel-kk-profiling \.kk-edit-fields/);
 assert.match(css,/@media\(max-width:690px\)/);
 assert.match(css,/body\.account-workspace\[data-theme="dark"\] #panel-kk-profiling \.kk-child-edit-view/);
 assert.match(js,/child\.setAttribute\('role','region'\)/);
 assert.match(js,/child\.querySelector\('\[data-cancel-edit\]'\)\?\.focus\(\)/);
});
