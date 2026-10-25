'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const publicHtml=read('dist/transparency.html'),publicJs=read('dist/disclosure-board.js'),
 transJs=read('dist/transparency.js'),css=read('dist/modern.css'),
 staffHtml=read('dist/account.html'),staffJs=read('dist/disclosure-admin.js'),
 accountJs=read('dist/account.js'),api=read('lib/handler.cjs'),
 db=read('lib/supabase.cjs'),sql=read('supabase/migrations/20261025013000_sk_full_disclosure_board.sql');
const categories=['cbydp','abyip','budget','rcb','purchase_requests'];
test('Full Disclosure Board replaces public budget/spending widgets and appears immediately after hero',()=>{
 assert.match(publicHtml,/SK Full Disclosure/);
 assert.equal((publicHtml.match(/data-disclosure-category="/g)||[]).length,5);
 for(const key of categories)assert.ok(publicHtml.includes('data-disclosure-category="'+key+'"'));
 assert.ok(publicHtml.indexOf('id="disclosure-board"')<publicHtml.indexOf('id="about-sk"'));
 assert.doesNotMatch(publicHtml,/Annual SK Budget &amp; Expenses|id="annual-budget"|id="project-spending"|id="trans-year"|id="annual-expense"/);
 assert.match(publicHtml,/id="monthly"/);
 assert.match(publicHtml,/disclosure-board\.js/);
 assert.doesNotMatch(transJs,/trans-year|annual-budget|annual-projects|project-spending/);
});
test('Five categories match SK FDP: plans, annual investment, budget, RCB, purchase requests',()=>{
 for(const title of ['Comprehensive Barangay Youth Development Plan',
  'Annual Barangay Youth Investment Program','SK Approved Annual Budget',
  'Quarterly Register of Cash in Bank','Monthly Itemized List of Purchase Requests'])
  assert.ok(publicHtml.includes(title),title);
 assert.match(css,/\.sk-fdp-grid/);
 assert.match(css,/@media\(max-width:470px\)/);
 assert.match(css,/\.sk-fdp-card-live:focus-visible/);
});
test('Public Google links are disabled until genuinely published and validated',()=>{
 assert.doesNotMatch(publicHtml,/href="https:\/\/drive.google.com/);
 assert.match(publicJs,/await api\('\.\/api\/disclosure'\)/);
 assert.match(publicJs,/entry\.category/);
 assert.match(publicJs,/url\.protocol!=='https:'/);
 assert.match(publicJs,/url\.hostname==='drive\.google\.com'/);
 assert.match(publicJs,/url\.hostname==='docs\.google\.com'/);
 assert.match(publicJs,/card\.replaceWith\(anchor\)/);
 assert.match(publicJs,/target='_blank'/);
 assert.match(publicJs,/anchor\.rel='noopener noreferrer'/);
 assert.match(publicJs,/awaiting approved public links/i);
});
test('Only chairman can update Drive document links, links stored separate from financial records',()=>{
 assert.match(staffHtml,/data-tab="disclosure" class="chair-only" hidden/);
 assert.match(staffHtml,/id="panel-disclosure"/);
 assert.match(staffHtml,/id="fdp-admin-list"/);
 assert.match(staffHtml,/disclosure-admin\.js/);
 assert.match(accountJs,/if\(name==='disclosure'&&window\.loadDisclosureAdmin\)/);
 assert.match(accountJs,/disclosure:'Full Disclosure Board'/);
 assert.match(staffJs,/await api\('\.\/api\/disclosure\/manage'\)/);
 assert.match(staffJs,/method:'POST'/);
 assert.match(staffJs,/name="published"/);
 assert.match(staffJs,/value\.url/);
 assert.match(api,/path==='\/api\/disclosure\/manage'&&method==='POST'/);
 assert.match(api,/await user\(\['chairman'\]\)/);
 assert.match(db,/action\.startsWith\('disclosure_'\)/);
 assert.match(db,/vasra_disclosure/);
 assert.match(sql,/u\.role='chairman'/);
 assert.match(sql,/revoke all on function public\.vasra_disclosure\(text,jsonb,text\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.vasra_disclosure\(text,jsonb,text\) to service_role/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|delete from vasra\.annual_budgets/i);
});
test('No guessed document URLs, invalid unpublished links cannot be shown publicly',()=>{
 assert.match(sql,/published_disclosure_has_link/);
 assert.match(sql,/where published and drive_url is not null/);
 assert.match(sql,/if publish and link=''/);
 assert.match(sql,/on conflict\(category\) do nothing/);
 assert.match(sql,/disclosure_link_updated/);
 assert.match(staffJs,/if\(body\.published&&!url\)/);
 assert.match(read('dist/sw.js'),/vasra-v60-kk-services-and-theme-20261025/);
 for(const [p,src] of [['public',publicJs],['staff',staffJs],['monthly',transJs],
  ['handler',api],['db',db],['account',accountJs]])
  assert.doesNotThrow(()=>new vm.Script(src,{filename:p}));
});
