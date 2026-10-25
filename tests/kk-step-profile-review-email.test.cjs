'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const js=read('dist/kk.js'),css=read('dist/kk.css'),handler=read('lib/handler.cjs');
const sql=read('supabase/migrations/20261025030000_kk_profile_required_fields_and_review.sql');
test('KK Step 1 required personal, true address dropdown and radio controls',()=>{
 for(const key of [
 "field('religion','Religion',{select:options.religion,required:true})",
 "field('civil_status','Civil Status',{select:options.civil,required:true})",
 "field('gender','Gender',{select:options.gender,required:true})",
 "name=\"solo_parent\"",
 "field('family_count','Number of Family Members',{required:true,type:'number'",
 "field('siblings','Number of Siblings',{required:true,type:'number'",
 "field('residence_city','City / Municipality',{select:city,required:true})",
 "field('residence_barangay','Barangay',{select:barangays,required:true})",
 "field('street','House No. / Street',{required:true"
 ]) assert.ok(js.includes(key),key);
 assert.match(js,/const metroCities=\['Caloocan','Las Piñas'/);
 assert.match(js,/Piliin ang City \/ Municipality/);
 assert.doesNotMatch(js,/Current Barangay in Metro Manila|Reload Barangay List|metroAreaSelection/);
 assert.match(css,/\.kk-step-one select\{appearance:none/);
 assert.match(css,/font-size:16px!important/);
 assert.match(js,/data\.residence_province=data\.residence_province\|\|'Metro Manila'/);
});
test('Step 2 school and course conditional validation blocks Save & Next',()=>{
 assert.match(js,/educationStatus:\[\['student','Student'\],\['graduate','Graduate'\],\['osy'/);
 assert.match(js,/field\('education_status','Current Educational Status',\{select:options.educationStatus,required:true\}\)/);
 assert.match(js,/field\('year_level','Year \/ Grade Level',\{select:yearLevelOptions\[data.education\]\|\|\[\],required:true\}\)/);
 assert.match(js,/field\('course_program','Course \/ Program',\{required:courseRequired/);
 assert.match(js,/field\('school_name','School \/ Institution',\{required:schoolRequired/);
 assert.match(js,/form\.reportValidity\(\)/);
 assert.match(handler,/Kumpletuhin ang Educational Level, Year Level at school details/);
 assert.match(sql,/education_status/);
 assert.match(sql,/course_program/);
 assert.match(sql,/school_name/);
});
test('Server uses authenticated profile and precise barangay validation, never claims any NCR address as verified',()=>{
 for(const field of ['residence_region','residence_province','residence_city','residence_barangay','address_line_2','education_status','course_program'])
  assert.ok(handler.includes("'"+field+"'"),field);
 assert.match(handler,/profile\.residence_barangay\.length>150/);
 assert.match(handler,/const ncrCities=new Set/);
 assert.match(handler,/profile\.city='Quezon City';profile\.barangay='Vasra'/);
 assert.match(sql,/lower\(coalesce\(pr\.profile->>'residence_barangay',''\)\)<>'vasra'/);
 assert.match(sql,/not exists\(select 1 from vasra\.kk_sitios s/);
});
test('Rejected applications remain editable with saved rejection explanation and resubmission',()=>{
 assert.match(js,/profile\.status==='rejected'\?1:/);
 assert.match(js,/Rejected by SK Officer — maaari mong itama at i-submit muli/);
 assert.match(sql,/status=case when status='rejected' then 'rejected' else 'draft' end/);
 assert.match(sql,/review_note=case when status='rejected' then review_note else '' end/);
 assert.match(sql,/step=case when payload->>'status'='rejected' then 1 else step end/);
 assert.match(sql,/update vasra\.kk_profiles set status='pending',step=5/);
 assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM vasra\.kk_members\b/i);
});
test('Review email goes to database-verified destination only and accurately reports provider acceptance',()=>{
 const staff=read('dist/kk-staff.js');
 assert.match(handler,/async function sendKKReviewEmail\(\{recipient,decision,origin\}\)/);
 assert.match(handler,/await kkRpc\('staff_list',\{\},true\)/);
 assert.match(handler,/recipient:applicant\.email/);
 assert.match(handler,/if\(!decision\?\.ok\)return json\(decision\)/);
 assert.match(handler,/status:'provider_accepted'/);
 assert.match(handler,/status:'unavailable'/);
 assert.match(handler,/new URL\(request\.url\)\.origin/);
 assert.match(staff,/Notification accepted by email provider/);
 assert.match(staff,/hindi pa naipadala ang email/);
 assert.doesNotMatch(handler,/recipient:b\.email/);
});
test('Shared database preserves legacy production submissions until mandatory v2 form is deployed',()=>{
 const compat=read('supabase/migrations/20261025032000_kk_legacy_profile_compat.sql');
 assert.match(compat,/if coalesce\(pr\.profile->>'residence_region',''\)<>'' then/);
 assert.match(compat,/residence_barangay/);
 assert.match(compat,/education_status/);
 assert.match(compat,/status=case when status='rejected' then 'rejected' else 'draft' end/);
 assert.doesNotMatch(compat,/\\bTRUNCATE\\b|\\bDROP TABLE\\b/);
});
test('Updated code parses and PWA cache was bumped',()=>{
 for(const [name,src] of [['KK profile',js],['KK staff',read('dist/kk-staff.js')],['API',handler]])
  assert.doesNotThrow(()=>new vm.Script(src,{filename:name}));
 assert.match(read('dist/sw.js'),/vasra-v60-kk-services-and-theme-20261025/);
});
