'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandler}=require('../lib/handler.cjs');
const S=require('../lib/security.cjs');

test('staff remains signed in using a secure 7-day cookie; logout immediately revokes it',async()=>{
  const password='TestingSession2026!',hash=await S.passwordHash(password);
  const actor={id:'11111111-1111-4111-8111-111111111111',name:'Test Officer',email:'staff@example.test',role:'sk',position:'kagawad',password:hash,must_change:false};
  const sessions=new Map();
  const backend={rpc:async(action,payload={},sessionHash=null)=>{
    if(action==='rate_limit')return {allowed:true};
    if(action==='login_lookup')return actor;
    if(action==='login_commit'){
      assert.equal(payload.expected_password,hash);
      sessions.set(payload.token,actor);
      return actor;
    }
    if(action==='me')return sessions.get(sessionHash)||null;
    if(action==='logout'){sessions.delete(sessionHash);return {ok:true};}
    throw new Error('Unexpected RPC '+action);
  }};
  const origin='https://vasra.vercel.app';
  const handle=createHandler({backend,config:{origin,secure:true}});
  const login=await handle(new Request(origin+'/api/login',{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({email:actor.email,password})
  }),{ip:'127.0.0.1'});
  assert.equal(login.status,200,await login.clone().text());
  const cookie=login.headers.get('set-cookie');
  assert.match(cookie,/vasra_session=[A-Za-z0-9_-]{32,128}/);
  assert.match(cookie,/Max-Age=604800/);
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/SameSite=Strict/);
  assert.match(cookie,/Secure/);
  const jar=cookie.split(';')[0];
  const me=await handle(new Request(origin+'/api/me',{headers:{Cookie:jar}}));
  assert.equal((await me.json()).user.email,actor.email);
  const logout=await handle(new Request(origin+'/api/logout',{
    method:'POST',headers:{Origin:origin,Cookie:jar,'Content-Type':'application/json'},body:'{}'
  }));
  assert.equal(logout.status,200);
  assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  const after=await handle(new Request(origin+'/api/me',{headers:{Cookie:jar}}));
  assert.equal((await after.json()).user,null);
});

test('database login session expiry applies to password, Google and password updates',()=>{
  const root=path.join(__dirname,'..');
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261019114500_staff_session_7_days.sql'),'utf8');
  assert.match(migration,/BEFORE INSERT ON vasra\.sessions/);
  assert.match(migration,/NEW\.expires := transaction_timestamp\(\) \+ interval '7 days'/);
  const html=fs.readFileSync(path.join(root,'dist/account.html'),'utf8');
  assert.match(html,/Stay signed in for 7 days/);
  const local=fs.readFileSync(path.join(root,'server.cjs'),'utf8');
  assert.match(local,/Max-Age=604800/);
  assert.match(local,/Date\.now\(\)\+604800000/);
});
