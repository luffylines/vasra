'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Integrated deployment keeps working API and account routes, not legacy public-only static build',()=>{
 const cfg=JSON.parse(read('vercel.json'));
 assert.equal(cfg.version,2);
 assert.equal(cfg.outputDirectory,'dist');
 assert.equal(cfg.buildCommand,'npm run check:deploy');
 assert(!String(cfg.buildCommand).includes('prepare-vercel-static'));
 const mappings=new Map(cfg.rewrites.map(r=>[r.source,r.destination]));
 assert.equal(mappings.get('/api/:path*'),'/api/index?__path=:path*');
 for(const url of ['/account','/kk-profile','/kk-dashboard','/duty','/projects'])
  assert(mappings.has(url),'missing supported public/staff route '+url);
});
test('Original main duty handling survives with later SK-managed functionality',()=>{
 const code=read('dist/duty.js');
 assert.doesNotThrow(()=>new vm.Script(code,{filename:'dist/duty.js'}));
 for(const term of ["Asia/Manila","manualSelection=false","setInterval(updateSchedule,30000)",
  "classList.toggle('today',i===today)","Scheduled open · ",
  "Closed by SK on duty","./api/duty-status","./api/duty-schedule"])
  assert(code.includes(term),'missing safe duty behavior: '+term);
 const css=read('dist/modern.css');
 assert(css.includes('.day-switch button.today'));
 assert(css.includes('.schedule-pill.is-open'));
 assert(css.includes('.schedule-pill.is-closed'));
});
test('GitHub Actions includes main integration path (previously missing)',()=>{
 const yaml=read('.github/workflows/tests.yml');
 assert.match(yaml,/pull_request:\s*\n\s*branches:\s*\n\s*- main/);
 assert.match(yaml,/push:\s*\n\s*branches:\s*\n\s*- main/);
 assert.match(yaml,/node-version: '24'/);
 assert.match(yaml,/npm ci/);
 assert.match(yaml,/npm test/);
});
