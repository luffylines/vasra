'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const staff=read('dist/kk-rewards-staff.js'),member=read('dist/kk-dashboard.js'),
html=read('dist/kk-dashboard.html'),landing=read('dist/home-landing.js');
test('Legacy uploaded reward photo recovers only from authenticated NoSuchKey 400, not unauthorized storage errors',async()=>{
 const {SupabaseBackend}=require('../lib/supabase.cjs');
 const uuid='11111111-1111-4111-8111-111111111111',name='rewards/'+uuid+'/'+uuid+'.png';
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(180)]);
 const calls=[],backend=new SupabaseBackend({url:'https://example.test',key:'sb_secret_placeholder'});
 backend.request=async url=>{
  calls.push(url);
  if(url.includes('/vasra-project-images/'))return new Response(JSON.stringify({code:'NoSuchKey',error:'not_found',message:'Object not found'}),{status:400});
  if(url.includes('/vasra-kk-identity/'))return new Response(bytes,{status:200});
  throw Error('Unexpected storage request');
 };
 backend.putReward=async(p,data,mime)=>{calls.push('copy:'+p+':'+mime);assert.deepEqual(data,bytes)};
 assert.deepEqual(await backend.getReward(name),bytes);
 assert(calls.some(x=>x==='copy:'+name+':image/png'));
 const bad=new SupabaseBackend({url:'https://example.test',key:'sb_secret_placeholder'});
 bad.request=async()=>new Response(JSON.stringify({code:'AccessDenied',error:'unauthorized'}),{status:400});
 bad.putReward=async()=>assert.fail('Never copy unauthorized data');
 await assert.rejects(()=>bad.getReward(name));
});
test('KK overview uses published authenticated reward catalog without mock data',()=>{
 assert.match(html,/id="kk-featured-rewards"/);assert.match(html,/id="kk-spotlight-points"/);
 assert.match(member,/member\.perks\.slice\(0,3\)/);assert.match(member,/renderRewardSpotlight\(\)/);
 assert.match(member,/data-open-rewards/);assert.match(member,/tab\('rewards'\)/);
 assert.match(member,/kk-member-reward-art img, \.kk-featured-image img/);
});
test('Published rewards show Edit and Delete, never Disable, and claim history remains protected',()=>{
 assert.match(staff,/p\.active\?'':'<button/);
 assert.doesNotMatch(staff,/\?\s*'Disable'/);
 assert.match(staff,/data-reward-delete/);assert.doesNotMatch(staff,/claimed\+reserved>0\?' disabled/);
 assert.match(staff,/data-claim-decision/);
});
test('SK duty card shows scheduled hours, not Labas sa duty hours',()=>{
 assert.match(landing,/Oras ng duty:/);
 assert.match(landing,/result\.open_time/);assert.match(landing,/result\.close_time/);
 assert.doesNotMatch(landing,/Labas sa duty hours/);
});
test('All touched scripts parse successfully',()=>{
 for(const p of ['lib/supabase.cjs','lib/handler.cjs','dist/kk-dashboard.js','dist/kk-rewards-staff.js','dist/home-landing.js'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
