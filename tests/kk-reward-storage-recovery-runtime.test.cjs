'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SupabaseBackend}=require('../lib/supabase.cjs');
const id='0e47bc5b-a987-4525-a087-aa78765b60e8';
const path='rewards/'+id+'/56f745a8-998e-4d5f-a6e6-224c21bef297.png';
const png=Buffer.alloc(150,0);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png,0);
const mock=()=>{
 let project=null;
 const requests=[];
 const fetcher=async(url,options)=>{
  const route=new URL(url).pathname;
  requests.push({route,method:options?.method||'GET'});
  if(route==='/storage/v1/object/authenticated/vasra-project-images/'+path)
   return project?new Response(project,{status:200}):new Response('not found',{status:404});
  if(route==='/storage/v1/object/authenticated/vasra-kk-identity/'+path)
   return new Response(png,{status:200});
  if(route==='/storage/v1/object/vasra-project-images/'+path&&options.method==='POST'){
   project=Buffer.from(options.body);
   return new Response('ok',{status:200});
  }
  throw Error('Unexpected storage API call '+route);
 };
 return {backend:new SupabaseBackend({url:'https://test.supabase.co',key:'secret-test'},fetcher),requests};
};
test('Existing reward photo migrates from old identity location on first authorized read',async()=>{
 const {backend,requests}=mock();
 assert.deepEqual(await backend.getReward(path),png);
 assert.deepEqual(requests.map(x=>[x.route,x.method]),[
  ['/storage/v1/object/authenticated/vasra-project-images/'+path,'GET'],
  ['/storage/v1/object/authenticated/vasra-kk-identity/'+path,'GET'],
  ['/storage/v1/object/vasra-project-images/'+path,'POST']]);
 assert.deepEqual(await backend.getReward(path),png);
 assert.equal(requests.length,4,'subsequent reads must use the repaired reward bucket only');
});
test('Reward validation never reads or migrates a member identity document',async()=>{
 const {backend,requests}=mock();
 await assert.rejects(()=>backend.getReward('ids/'+id+'/'+id+'.png'),/Invalid reward image path/);
 assert.deepEqual(requests,[]);
});
test('New uploads use reward bucket only, leaving Valid ID storage untouched',async()=>{
 const {backend,requests}=mock();
 await backend.putReward(path,png,'image/png');
 assert.deepEqual(requests.map(x=>x.route),['/storage/v1/object/vasra-project-images/'+path]);
});
