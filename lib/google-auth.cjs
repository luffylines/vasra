'use strict';
const crypto=require('node:crypto');
const GOOGLE_JWKS='https://www.googleapis.com/oauth2/v3/certs';
let jwksCache=null,jwksExpiry=0;
const random=()=>crypto.randomBytes(32).toString('base64url');
function googleConfig(cfg,env=process.env){
 const clientId=env.GOOGLE_CLIENT_ID||env.AUTH_GOOGLE_ID;
 const clientSecret=env.GOOGLE_CLIENT_SECRET||env.AUTH_GOOGLE_SECRET;
 const redirectUri=env.GOOGLE_REDIRECT_URI||env.AUTH_GOOGLE_REDIRECT_URI;
 const expected=cfg.origin?cfg.origin+'/api/auth/google/callback':null;
 const enabled=Boolean(clientId&&clientSecret&&redirectUri&&redirectUri===expected&&/^https:\/\//.test(redirectUri));
 return {clientId,clientSecret,redirectUri,enabled};
}
const sha256=(value)=>crypto.createHash('sha256').update(value).digest('base64url');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)};
function createFlow(settings){
 const state=random(),nonce=random(),verifier=random(),exp=Date.now()+600000;
 const raw=Buffer.from(JSON.stringify({state,nonce,verifier,exp})).toString('base64url');
 const signature=crypto.createHmac('sha256',settings.clientSecret).update(raw).digest('base64url');
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [key,value] of Object.entries({
  client_id:settings.clientId,redirect_uri:settings.redirectUri,response_type:'code',
  scope:'openid email profile',state,nonce,
  code_challenge:sha256(verifier),code_challenge_method:'S256',prompt:'select_account'
 }))url.searchParams.set(key,value);
 return {url:url.toString(),cookie:raw+'.'+signature};
}
function readFlow(value,expectedState,settings){
 if(typeof value!=='string'||value.length>1500)throw Error('Invalid OAuth state');
 const parts=value.split('.');
 if(parts.length!==2||!parts.every(x=>/^[A-Za-z0-9_-]+$/.test(x)))throw Error('Invalid OAuth state');
 const signature=crypto.createHmac('sha256',settings.clientSecret).update(parts[0]).digest('base64url');
 if(!equal(signature,parts[1]))throw Error('Invalid OAuth signature');
 let flow;
 try{flow=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}catch{throw Error('Invalid OAuth state');}
 if(!flow||!equal(flow.state,expectedState)||!Number.isFinite(flow.exp)||flow.exp<=Date.now()||flow.exp>Date.now()+600000||
   !/^[A-Za-z0-9_-]{43,128}$/.test(flow.nonce)||!/^[A-Za-z0-9_-]{43,128}$/.test(flow.verifier))throw Error('Expired or invalid OAuth state');
 return flow;
}
async function googleJson(url,options){
 const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(8500)});
 if(!response.ok)throw Error('Google authorization unavailable');
 const value=await response.json();
 if(!value||typeof value!=='object')throw Error('Invalid Google response');
 return value;
}
async function googleKeys(){
 if(jwksCache&&Date.now()<jwksExpiry)return jwksCache;
 const value=await googleJson(GOOGLE_JWKS,{method:'GET'});
 if(!Array.isArray(value.keys)||!value.keys.length)throw Error('Google keys missing');
 jwksCache=value.keys;jwksExpiry=Date.now()+300000;
 return jwksCache;
}
async function verifyIdToken(idToken,settings,nonce){
 if(typeof idToken!=='string'||idToken.length>16000)throw Error('Invalid Google ID token');
 const sections=idToken.split('.');
 if(sections.length!==3)throw Error('Invalid Google ID token');
 let header,claims;
 try{
  header=JSON.parse(Buffer.from(sections[0],'base64url').toString('utf8'));
  claims=JSON.parse(Buffer.from(sections[1],'base64url').toString('utf8'));
 }catch{throw Error('Invalid Google ID token');}
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>250)throw Error('Unsupported Google token');
 let keys=await googleKeys(),key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');
 if(!key){jwksExpiry=0;keys=await googleKeys();key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');}
 if(!key)throw Error('Google signing key not found');
 const publicKey=crypto.createPublicKey({key,format:'jwk'});
 if(!crypto.verify('RSA-SHA256',Buffer.from(sections[0]+'.'+sections[1]),publicKey,Buffer.from(sections[2],'base64url')))
  throw Error('Google token signature invalid');
 const now=Math.floor(Date.now()/1000);
 if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||
   claims.aud!==settings.clientId||(claims.azp&&claims.azp!==settings.clientId)||
   !Number.isInteger(claims.exp)||claims.exp<=now||
   !Number.isInteger(claims.iat)||claims.iat>now+180||
   claims.email_verified!==true&&claims.email_verified!=='true'||
   !equal(claims.nonce,nonce)||
   typeof claims.sub!=='string'||!/^[0-9]{5,40}$/.test(claims.sub)||
   typeof claims.email!=='string'||claims.email.length>254)
  throw Error('Untrusted Google identity');
 return {email:claims.email.toLowerCase(),sub:claims.sub};
}
async function exchangeCode(code,flow,settings){
 if(typeof code!=='string'||code.length>2400||!code)throw Error('Invalid Google authorization code');
 const params=new URLSearchParams({
   code,client_id:settings.clientId,client_secret:settings.clientSecret,
   redirect_uri:settings.redirectUri,grant_type:'authorization_code',code_verifier:flow.verifier
 });
 const response=await googleJson('https://oauth2.googleapis.com/token',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()
 });
 return verifyIdToken(response.id_token,settings,flow.nonce);
}
module.exports={googleConfig,createFlow,readFlow,exchangeCode,verifyIdToken};
