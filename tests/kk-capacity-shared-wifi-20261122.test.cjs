'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandler}=require('../lib/handler.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const origin='https://www.skvasra.app';
function fixture(){
 const hits=new Map();
 const backend={
  async rpc(action,payload={}){
   if(action==='rate_limit'){
    const n=(hits.get(payload.key)||0)+1;
    hits.set(payload.key,n);
    return {allowed:n<=payload.limit};
   }
   if(action==='me')return {id:'00000000-0000-4000-8000-000000000001',role:'sk',position:'officer',must_change:false};
   return null;
  }
 };
 const handle=createHandler({backend,config:{origin,secure:true,allowedOrigins:[origin]}});
 const post=(route,body,ip='198.51.100.9',cookie='')=>
  handle(new Request(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)}),{ip});
 return {post,hits};
}
test('100 independent residents on one public IP are not blocked by the old eight-registration ceiling',async()=>{
 const {post,hits}=fixture();
 for(let i=0;i<100;i++){
  const res=await post('/api/kk/register',{email:'youth'+i+'@example.test'});
  assert.equal(res.status,400,'invalid registration remains rejected without falsely hitting IP cap');
 }
 assert.equal(hits.size,1,'IP safety limit remains in place');
 assert.equal([...hits.values()][0],100);
});
test('Shared-IP registration retains a finite anti-abuse ceiling',async()=>{
 const {post}=fixture();
 let last;
 for(let i=0;i<241;i++)last=await post('/api/kk/register',{email:'youth'+i+'@example.test'});
 assert.equal(last.status,429);
});
test('Shared IP does not block more than 30 legitimate login attempts',async()=>{
 const {post}=fixture();
 for(let i=0;i<40;i++){
  const res=await post('/api/kk/login',{email:'youth'+i+'@example.test',password:'x'.repeat(201)});
  assert.equal(res.status,400);
 }
});
test('Staff scanners are limited per authenticated session rather than public Wi-Fi IP',async()=>{
 const {post,hits}=fixture();
 for(const cookie of ['vasra_session='+('a'.repeat(64)),'vasra_session='+('b'.repeat(64))]){
  for(let i=0;i<3;i++){
   const res=await post('/api/kk/staff/services/scan',{kk_id:'invalid',action:'lookup'},'198.51.100.9',cookie);
   assert.equal(res.status,400);
  }
 }
 assert.equal(hits.size,2);
 assert.deepEqual([...hits.values()],[3,3]);
});
test('Dashboard status checks are spread out and backend refreshes are bounded',()=>{
 const dashboard=read('dist/kk-dashboard.js'),profile=read('dist/kk.js');
 assert.match(dashboard,/firstLivePollAt=Date\.now\(\)\+Math\.floor\(Math\.random\(\)\*15000\)/);
 assert.match(dashboard,/due\('services',section==='overview'\?60000:45000\)/);
 assert.match(dashboard,/due\('rewards',90000\)/);
 assert.match(dashboard,/due\('attendance',90000\)/);
 assert.match(dashboard,/due\('projects',120000\)/);
 assert.match(profile,/profileStatusTimer=setInterval\(\(\)=>\{void checkProfileReview\(\);\},15000\)/);
 assert.match(dashboard,/document\.hidden\|\|!navigator\.onLine/);
});
test('Migration protects private password reset data and indexes history lookups',()=>{
 const sql=read('supabase/migrations/20261122191500_kk_capacity_secure_indices.sql');
 assert.match(sql,/ALTER TABLE vasra\.kk_password_resets ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE vasra\.kk_password_resets FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/kk_project_attendance_member_time_idx/);
 assert.match(sql,/kk_points_member_time_idx/);
});
