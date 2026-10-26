'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const handler=read('lib/handler.cjs'),db=read('lib/supabase.cjs');
test('Reward photo upload is isolated from valid ID private bucket',()=>{
 const start=handler.indexOf("if(path==='/api/kk/staff/rewards/image'&&method==='POST')");
 const end=handler.indexOf("if(/^\\/api\\/kk\\/rewards\\/image\\/",start);
 assert.ok(start>0&&end>start);
 const route=handler.slice(start,end);
 assert.match(route,/await user\(\['chairman'\]\)/);
 assert.match(route,/await rewardRpc\('staff_list',\{\},true\)/);
 assert.match(route,/await db\.putReward\(filePath,bytes,mime\)/);
 assert.doesNotMatch(route,/db\.putPrivate/);
 assert.match(route,/await rewardRpc\('set_image'/);
});
test('Old reward images are recovered from identity storage with image-only guards',()=>{
 const start=db.indexOf('  async getReward(path){'),end=db.indexOf('  async deletePrivate(path)',start);
 const method=db.slice(start,end);
 assert.match(method,/uploaded\.status===404/);
 assert.match(method,/detail\?\.code==='NoSuchKey'/);
 assert.match(method,/\/storage\/v1\/object\/authenticated\/vasra-kk-identity/);
 assert.match(method,/^\s*if\(typeof path!=='string'\|\|!\/\^rewards\\\//m);
 assert.match(method,/if\(!mime\|\|bytes\.length<100\|\|bytes\.length>2000000/);
 assert.match(method,/await this\.putReward\(path,bytes,mime\)/);
 assert.doesNotMatch(method,/this\.putPrivate\(/);
 assert.doesNotMatch(method,/deletePrivate\(/);
});
test('Reward bucket permits WEBP and is private; member Valid ID bucket unchanged',()=>{
 assert.match(db,/const BUCKET = 'vasra-project-images'/);
 assert.match(db,/\['image\/jpeg','image\/png','image\/webp'\]/);
 assert.match(db,/async putPrivate\(path,bytes,mime\)/);
 assert.match(db,/\/storage\/v1\/object\/vasra-kk-identity/);
 for(const p of ['lib/handler.cjs','lib/supabase.cjs'])assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
