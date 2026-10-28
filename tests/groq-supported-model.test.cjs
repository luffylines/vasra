'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const FB=require('../lib/facebook-import.cjs');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../lib/facebook-import.cjs'),'utf8');
const staff=fs.readFileSync(path.join(__dirname,'../dist/account.js'),'utf8');
const caption='OCTOBER 17, 2026 | DENTAL FLUORIDE PROGRAM\nMatagumpay na naisagawa ang dental fluoride services para sa mga Batang Vasra.';
function fakeGroq(requests,status=200){
 return async(url,request)=>{
  requests.push({url,headers:{contentType:request.headers['Content-Type']},body:JSON.parse(request.body)});
  return status===200?{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({
   title:'SK Dental Fluoride Program',category:'Kalusugan',category_evidence:'DENTAL FLUORIDE PROGRAM',
   status:'Natapos',status_evidence:'Matagumpay na naisagawa',
   description:'Inilunsad ang dental fluoride program para sa mga batang Vasra.',
   scope:'- Dental fluoride services para sa mga batang Vasra.'
  })}}]})}:{ok:false,status};
 };
}
test('Groq uses the current supported GPT-OSS model and JSON completion endpoint',async()=>{
 const requests=[];
 const result=await FB.importFacebookPost({caption},{aiKey:'test',fetcher:fakeGroq(requests)});
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'https://api.groq.com/openai/v1/chat/completions');
 assert.equal(requests[0].body.model,'openai/gpt-oss-20b');
 assert.equal(requests[0].body.reasoning_effort,'low');
 assert.deepEqual(requests[0].body.response_format,{type:'json_object'});
 assert.equal(result.ai.status,'success');
 assert.equal(result.draft.method,'ai');
 assert.equal(result.draft.category,'Kalusugan');
 assert.equal(result.draft.progress,100);
});
test('deprecated 2026 Groq model IDs are transparently replaced',async()=>{
 for(const [legacy,newModel] of [
  ['llama-3.1-8b-instant','openai/gpt-oss-20b'],
  ['llama-3.3-70b-versatile','openai/gpt-oss-120b']
 ]){
  const requests=[];
  await FB.importFacebookPost({caption},{aiKey:'test',model:legacy,fetcher:fakeGroq(requests)});
  assert.equal(requests.length,1);
  assert.equal(requests[0].body.model,newModel);
 }
});
test('a supported explicit model remains respected',async()=>{
 const requests=[];
 await FB.importFacebookPost({caption},{aiKey:'test',model:'qwen/qwen3.8-27b',fetcher:fakeGroq(requests)});
 assert.equal(requests[0].body.model,'qwen/qwen3.8-27b');
 assert.equal(Object.hasOwn(requests[0].body,'reasoning_effort'),false);
});
test('404 returns safe actionable diagnostic and basic fallback, without leaking upstream body',async()=>{
 const requests=[];
 const result=await FB.importFacebookPost({caption},{aiKey:'test',fetcher:fakeGroq(requests,404)});
 assert.equal(result.ai.status,'provider_error');
 assert.equal(result.ai.http_status,404);
 assert.equal(result.ai.hint,'model_not_found');
 assert.equal(result.draft.method,'basic');
 assert.equal(result.draft.category,'Kalusugan');
 assert.equal(result.draft.status,'Natapos');
 assert.equal(result.draft.progress,100);
 assert.match(staff,/Groq model o endpoint unavailable \(HTTP 404\)/);
});
test('403 authentication/config failure is not ignored',async()=>{
 const requests=[];
 const result=await FB.importFacebookPost({caption},{aiKey:'test',fetcher:fakeGroq(requests,403)});
 assert.equal(result.ai.http_status,403);
 assert.equal(result.ai.hint,undefined);
 assert.equal(result.draft.method,'basic');
});
test('the Groq default no longer refers to the retired Llama 8B model',()=>{
 assert.match(source,/const GROQ_DEFAULT_MODEL='openai\/gpt-oss-20b'/);
 assert.doesNotMatch(source,/model=process\.env\.GROQ_MODEL\|\|'llama-3\.1-8b-instant'/);
});
