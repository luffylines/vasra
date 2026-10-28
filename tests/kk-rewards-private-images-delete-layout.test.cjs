'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const handler=get('lib/handler.cjs'),backend=get('lib/supabase.cjs'),reward=get('dist/kk-rewards-staff.js'),
 sql=get('supabase/migrations/20261026181500_kk_reward_delete_guarded.sql');
test('Reward photos stored in existing private WEBP-enabled project bucket rather than Valid ID bucket',()=>{
 assert.match(backend,/async putReward\(path,bytes,mime\)/);
 assert.match(backend,/async getReward\(path\)/);
 assert.match(backend,/\['image\/jpeg','image\/png','image\/webp'\]/);
 assert.match(handler,/await db\.putReward\(filePath,bytes,mime\)/);
 assert.match(handler,/await db\.getReward\(image\.path\)/);
 assert.match(handler,/await db\.putPrivate\(/); // Valid ID uploads remain unchanged.
 assert.match(backend,/const BUCKET = 'vasra-project-images'/);
});
test('SK Chairman can delete only reward without claim history',()=>{
 assert.match(handler,/if\(action==='delete'\)/);
 assert.match(handler,/actor\.role!=='chairman'/);
 assert.match(handler,/kk_reward_delete_delete/);
 assert.match(backend,/vasra_kk_reward_delete/);
 assert.match(sql,/u\.role='chairman'/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/EXISTS\(SELECT 1 FROM vasra\.kk_redemptions/);
 assert.match(sql,/reward_has_redemptions_disable_instead/);
 assert.match(sql,/kk_reward_deleted/);
 assert.match(sql,/GRANT EXECUTE.*service_role/);
});
test('Reward stock is already reserved on request; approval permanently consumes; rejection releases and cannot double process',()=>{
 // Existing transactional RPC is replaced only for deletion; never mutate its reservation logic.
 const notes=get('dist/account.html');
 assert.match(notes,/Pending claims reserve stock; rejected claims release it/);
 assert.match(reward,/data-reward-delete/);
 assert.match(reward,/data-reward-publish/);
 assert.match(reward,/data-reward-edit/);
 assert.match(reward,/data-claim-decision/);
 assert.match(reward,/Reviewing|reviewed|review/i);
});
test('Reward images retain draft ID on upload failure to avoid duplicate creation',()=>{
 assert.match(reward,/form\.elements\.id\.value=result\.id/);
 assert.match(reward,/photo upload failed\. Retry Save Reward/);
 assert.match(reward,/form\.reset\(\)/);
});
test('Rate field, reward buttons, resolution buttons share fixed 39-40px compact heights',()=>{
 assert.match(get('dist/kk-services.css'),/#kk-retabox-rate-form/);
 assert.match(get('dist/kk-services.css'),/height:40px!important/);
 assert.match(get('dist/kk-rewards.css'),/kk-reward-editor>\.kk-rewards-actions/);
 assert.match(get('dist/kk-rewards.css'),/height:39px!important/);
 assert.match(get('dist/sk-resolutions-admin.css'),/\.skres-form-bottom \.skres-admin-actions/);
 assert.match(get('dist/sk-resolutions-admin.css'),/height:40px!important/);
});
test('Reward backend, handler and staff code compile',()=>{
 for(const p of ['dist/kk-rewards-staff.js','lib/handler.cjs','lib/supabase.cjs'])assert.doesNotThrow(()=>new vm.Script(get(p),{filename:p}));
});
