'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const google=require('../lib/google-auth.cjs');
const cfg={origin:'https://vasra.vercel.app'};
const env={GOOGLE_CLIENT_ID:'client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-client-secret',GOOGLE_REDIRECT_URI:'https://vasra.vercel.app/api/auth/google/callback'};
test('OAuth disabled without matching origin, client secrets, and redirect URI',()=>{
 assert.equal(google.googleConfig(cfg,{}).enabled,false);
 assert.equal(google.googleConfig(cfg,{...env,GOOGLE_REDIRECT_URI:'https://attacker.invalid/api/auth/google/callback'}).enabled,false);
 assert.equal(google.googleConfig(cfg,env).enabled,true);
});
test('OAuth requires validated signed state and PKCE challenge',()=>{
 const settings=google.googleConfig(cfg,env),flow=google.createFlow(settings),url=new URL(flow.url);
 assert.equal(url.hostname,'accounts.google.com');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('scope'),'openid email profile');
 assert(google.readFlow(flow.cookie,url.searchParams.get('state'),settings).verifier);
 assert.throws(()=>google.readFlow(flow.cookie,'wrong',settings),/OAuth state/);
 assert.throws(()=>google.readFlow(flow.cookie.slice(0,-1)+'a',url.searchParams.get('state'),settings));
});
test('Verifies signed Google ID token; rejects wrong audience and unverified email',async()=>{
 const original=global.fetch;
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=publicKey.export({format:'jwk'});jwk.kid='google-test-key';jwk.alg='RS256';jwk.use='sig';
 global.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'content-type':'application/json'}});
 try {
  const settings=google.googleConfig(cfg,env),nonce=crypto.randomBytes(32).toString('base64url'),now=Math.floor(Date.now()/1000);
  const token=(payload)=>{
   const enc=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
   const input=enc({alg:'RS256',kid:jwk.kid,typ:'JWT'})+'.'+enc(payload);
   return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
  };
  const claims={iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,sub:'123456789012345678901',email:'OFFICER@example.test',email_verified:true,nonce,iat:now-10,exp:now+1200};
  const verified=await google.verifyIdToken(token(claims),settings,nonce);
  assert.equal(verified.email,'officer@example.test');
  assert.equal(verified.sub,claims.sub);
  await assert.rejects(()=>google.verifyIdToken(token({...claims,aud:'wrong'}),settings,nonce),/Untrusted Google identity/);
  await assert.rejects(()=>google.verifyIdToken(token({...claims,email_verified:false}),settings,nonce),/Untrusted Google identity/);
  await assert.rejects(()=>google.verifyIdToken(token(claims),settings,'different-nonce'),/Untrusted Google identity/);
 }finally{global.fetch=original;}
});
