'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('KK Profiling APIs use server enforced Chairperson / Secretary authorization',()=>{
 const server=read('lib/handler.cjs'),app=read('dist/account.js');
 assert.match(server,/async function kkProfilingAdmin\(\)/);
 assert.match(server,/actor\.role==='sk' && actor\.position==='secretary'/);
 for(const route of ['/api/kk/staff/sitios','/api/kk/staff/profile-delete','/api/kk/staff/profile-edit',
 '/api/kk/staff/export','/api/kk/staff/review']){
  const pos=server.indexOf("if(path==='"+route+"'");
  assert(pos>=0,'missing '+route);
  assert.match(server.slice(pos,pos+190),/await kkProfilingAdmin\(\)/,route);
 }
 assert.match(server,/if\(staffDocumentMatch&&method==='GET'\)\{\s*await kkProfilingAdmin\(\)/);
 assert.match(app,/canManageKKProfiles=user\.role==='chairman'\|\|\(user\.role==='sk'&&user\.position==='secretary'\)/);
 assert.match(app,/if\(name==='kk-profiling'&&!/);
});