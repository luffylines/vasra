'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const pages=['index','projects','duty','youth-leaders','achievements','contacts','transparency'];
const html=read('dist/account.html'),duty=read('dist/duty.html'),front=read('dist/duty.js');
const client=read('dist/account.js'),handler=read('lib/handler.cjs');
const backend=read('lib/supabase.cjs');
const sql=read('supabase/migrations/20261024210000_officer_public_contact_settings.sql');
test('All public portal footers consistently use Arang Kada-Kabataang Vasra',()=>{
 for(const p of pages){
  const source=read('dist/'+p+'.html');
  assert.match(source,/<footer class="portal-footer">[^]*?<span>Arang Kada-Kabataang Vasra<\/span>/);
 }
});
test('SK Duty replaces historical resolution with dynamic SK Details',()=>{
 assert.doesNotMatch(duty,/<details class="resolution">/);
 assert.doesNotMatch(duty,/Buksan ang schedule announcement/);
 assert.match(duty,/id="duty-contact-list"/);
 assert.match(duty,/SK DETAILS/);
 assert.match(duty,/officer-contacts\.css/);
 assert.match(front,/loadPublicDutyContacts/);
 assert.match(front,/loadManagedDutyRoster/);
 assert.match(front,/managedDutyProfiles\.filter|managedDutyProfiles\s*\.filter/);
 assert.match(front,/c\.official_id===profile\.id/);
 assert.match(front,/c\.position===profile\.position/);
});
test('Personal Account fields are owner-managed and default to private',()=>{
 assert.match(html,/id="panel-settings"/);
 assert.match(html,/id="officer-contact-form"/);
 assert.match(html,/name="address"/);
 assert.match(html,/name="email"/);
 assert.match(html,/name="phone"/);
 assert.match(html,/name="facebook_url"/);
 assert.match(html,/name="is_public" type="checkbox"/);
 assert.doesNotMatch(html,/name="is_public"[^>]*checked/);
 assert.match(client,/\.\/api\/officer-contacts\/me/);
 assert.match(client,/loadOfficerContacts/);
 assert.match(client,/is_public:form\.elements\.namedItem\('is_public'\)\.checked/);
});
test('Private endpoints enforce signed-in SK role and server validates public input',()=>{
 assert.match(handler,/path === '\/api\/officer-contacts\/me' && method === 'GET'/);
 assert.match(handler,/path === '\/api\/officer-contacts\/me' && method === 'POST'/);
 assert.match(handler,/await user\(\['sk','chairman'\]\)/);
 assert.match(handler,/parsed\.protocol!=='https:'/);
 assert.match(handler,/b\.is_public&&!/);
 assert.match(backend,/vasra_officer_contacts/);
 assert.match(backend,/action\.slice\(17\)/);
});
test('SQL requires session, owner-scoped update, explicit publish and excludes private auth data',()=>{
 assert.match(sql,/user_id uuid primary key references vasra\.users\(id\)/);
 assert.match(sql,/s\.token = session_hash/);
 assert.match(sql,/where c\.user_id = actor\.id/);
 assert.match(sql,/values \(actor\.id,v_address,v_email,v_phone,v_facebook,v_public/);
 assert.match(sql,/where c\.is_public/);
 assert.match(sql,/not u\.must_change/);
 assert.match(sql,/'official_id'/);
 assert.match(sql,/o\.published and not o\.archived/);
 assert.match(sql,/revoke all on table vasra\.officer_contact_details from public, anon, authenticated/);
 assert.match(sql,/revoke all on function public\.vasra_officer_contacts/);
 assert.doesNotMatch(sql,/'email', u\.email/);
});
