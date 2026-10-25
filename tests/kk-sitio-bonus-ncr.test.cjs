'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),staff=read('dist/kk-staff.js'),profile=read('dist/kk-profile.html'),kk=read('dist/kk.js'),handler=read('lib/handler.cjs');
const bonus=read('supabase/migrations/20261025001500_kk_verified_welcome_points.sql');
test('KK staff uses searchable sitio directory with grouped resident and verification counts',()=>{
 assert.match(html,/id="kk-sitio-add-toggle"/);
 assert.match(html,/id="kk-sitio-editor" hidden/);
 assert.match(html,/id="kk-sitio-search"/);
 assert.match(html,/id="kk-sitio-totals"/);
 assert.match(staff,/const sitioCounts=id=>/);
 assert.match(staff,/members\.filter\(m=>String\(m\.profile\?\.sitio_id/);
 assert.match(staff,/counts\.registered/);
 assert.match(staff,/counts\.verified/);
 assert.match(staff,/aria-expanded/);
 assert.match(staff, /kk-sitio-search'\)\?\.addEventListener\('input',displaySitios/);
});
test('Manual perks and award management is paused without disabling 50 verified bonus',()=>{
 assert.doesNotMatch(html,/id="kk-perk-form"|Points & Perks|Perk Redemption Requests/);
 assert.doesNotMatch(profile,/Points & Perks|id="kk-perks-list"|id="kk-redemptions"/);
 assert.doesNotMatch(staff,/data-award|data-redemption|kk-perk-form/);
 assert.doesNotMatch(kk,/send\('redeem'/);
 for(const route of ["if(path==='/api/kk/staff/points'","if(path==='/api/kk/staff/perks'","if(path==='/api/kk/staff/redemption'","if(path==='/api/kk/redeem'"]){
  const start=handler.indexOf(route);assert.ok(start>=0,route);
  assert.ok(handler.slice(start,start+330).includes("S.fail(403,'Points & Perks are temporarily unavailable"),route);
 }
});
test('50 bonus is awarded once on status transition pending to verified, with database uniqueness',()=>{
 assert.match(bonus,/create unique index if not exists kk_points_unique_verification_bonus/);
 assert.match(bonus,/new\.status='verified' and old\.status is distinct from 'verified'/);
 assert.match(bonus,/new\.reviewer_id is null/);
 assert.match(bonus,/values\(new\.member_id,50,'KK verified profile welcome bonus',new\.reviewer_id\)/);
 assert.match(bonus,/on conflict \(member_id\) where reason='KK verified profile welcome bonus' do nothing/);
 assert.match(bonus,/after update of status on vasra\.kk_profiles/);
 assert.match(bonus,/where pr\.status='verified' and pr\.reviewer_id is not null/);
 assert.doesNotMatch(bonus,/\bDROP TABLE\b|\bTRUNCATE\b/);
});
test('Profile remains five steps with official Barangay Vasra residency and optional NCR current residence',()=>{
 for(const v of ['Personal Information','Education','Additional Information','Emergency Contact','Review & Submit'])assert.ok(kk.includes(v),v);
 assert.match(kk,/const metroCities=\['Caloocan','Las Piñas'/);
 assert.match(kk,/metroAreaSelection\(\)/);
 assert.match(kk,/data\.residence_city\|\|'Quezon City'/);
 assert.match(kk,/fetch\('https:\/\/psgc\.cloud\/api\/v2\/regions\/1300000000\/barangays'/);
 assert.match(kk,/credentials:'omit'/);
 assert.match(kk,/Current Barangay in Metro Manila/);
 assert.match(kk,/field\('year_level','Year \/ Grade Level',\{select:yearLevelOptions/);
 assert.match(handler,/profile\.city='Quezon City';profile\.barangay='Vasra'/);
 assert.match(handler,/'residence_city','residence_barangay'/);
 assert.match(handler,/const allowedNcrCities=new Set/);
});
test('Error states explain session or network instead of falsely claiming missing KK database',()=>{
 assert.doesNotMatch(staff,/KK database is not active yet/);
 assert.match(staff,/Hindi ma-load ang KK records:/);
 assert.match(kk,/Hindi ma-load ang KK profile/);
 assert.match(kk,/id="kk-retry-load"/);
 assert.match(kk,/Go to KK Login/);
 assert.match(read('dist/sw.js'),/vasra-v55-kk-rpc-account-resume-20261025/);
 for(const [p,s] of [['kk-staff.js',staff],['kk.js',kk],['handler.cjs',handler]])assert.doesNotThrow(()=>new vm.Script(s,{filename:p}));
});

test('Ten SK-supplied Sitio names are seeded once without inventing resident counts',()=>{
 const migration=read('supabase/migrations/20261025003000_kk_vasra_sitio_directory.sql');
 for(const sitio of ['BAI Lower','BAI Upper','BPI Compound','Central VASRA',
  'DENR-NCR Compound','Fisheries Street','Palanas A','Palanas B','Palanas C','Palanas D'])
  assert.ok(migration.includes("'"+sitio+"'"),sitio);
 assert.match(migration,/on conflict \(normalized_name\) do nothing/);
 assert.match(migration,/from vasra\.users where role='chairman'/);
 assert.doesNotMatch(migration,/\bTRUNCATE\b|\bDELETE\b|\bDROP TABLE\b/i);
 assert.doesNotMatch(migration,/registered_count|verified_count|members_assigned/);
});
