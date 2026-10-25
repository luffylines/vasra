'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('dist/kk-register.html'),js=read('dist/kk.js'),sql=read('supabase/migrations/20261024223000_kk_youth_profiling.sql');
test('Youth registration confirms KK database availability before accepting a submit',()=>{
 assert.match(html,/id="kk-registration-readiness"/);
 assert.match(html,/id="kk-readiness-title"/);
 assert.match(html,/id="kk-readiness-description"/);
 assert.match(html,/id="kk-readiness-retry"/);
 assert.match(html,/<button type="submit" class="kk-btn" disabled aria-disabled="true">Checking KK Registration/);
 assert.match(js,/const result=await getApi\('sitios'\)/);
 assert.match(js,/if\(!Array\.isArray\(result\?\.sitios\)\)throw Error/);
 assert.match(js,/if\(!databaseReady\)\{feedback\('/);
 assert.match(js,/submit\.disabled=true/);
 assert.match(js,/submit\.disabled=false/);
 assert.match(js,/readiness\.dataset\.status='unavailable'/);
 assert.match(js,/Walang na-create na account/);
});
test('Absent database never masquerades as a successful registration',()=>{
 assert.match(js,/readinessTitle\.textContent='KK registration is not yet available'/);
 assert.match(js,/Hindi pa available ang KK database migration/);
 assert.match(js,/retry\.addEventListener\('click',checkKKRegistration\)/);
 assert.match(js,/await send\('register',data\)/);
 assert.ok(js.indexOf('if(!databaseReady)')<js.indexOf("await send('register',data)"));
});
test('All private youth tables explicitly enable RLS and restrict public access',()=>{
 const tables=['kk_members','kk_sessions','kk_profiles','kk_sitios','kk_points','kk_perks','kk_redemptions'];
 for(const name of tables)assert.ok(sql.includes('alter table vasra.'+name+' enable row level security;'),name);
 assert.match(sql,/revoke all on vasra\.kk_members.*from public, anon, authenticated;/);
 assert.match(sql,/revoke all on function public\.vasra_kk\(text,jsonb,text\) from public,anon,authenticated;/);
 assert.match(sql,/grant execute on function public\.vasra_kk\(text,jsonb,text\) to service_role;/);
 assert.doesNotMatch(html,/SUPABASE_SECRET_KEY|sb_secret_/);
});
test('Registration readiness is mobile responsive and JS syntax valid',()=>{
 const css=read('dist/kk.css');
 assert.match(css,/\.kk-readiness\[data-status="unavailable"\]/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(read('dist/sw.js'),/vasra-v60-kk-services-and-theme-20261025/);
 assert.doesNotThrow(()=>new vm.Script(js));
});
