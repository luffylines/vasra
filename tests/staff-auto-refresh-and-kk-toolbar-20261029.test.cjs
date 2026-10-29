'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('KK Profiling pending submissions appear first and update without full page refresh',()=>{
 const k=read('dist/kk-staff.js'),app=read('dist/account.js');
 assert.match(k,/if\(a\.status==='pending'\)return -1/);
 assert.match(k,/if\(b\.status==='pending'\)return 1/);
 assert.match(k,/window\.refreshKKStaffIfIdle/);
 assert.match(k,/memberSignature\(result\.members\)/);
 assert.match(k,/actionInProgress/);
 assert.match(k,/pendingDeleteMemberId!==null/);
 assert.match(k,/cache:'no-store'/);
 assert.match(k,/kk-pending-badge/);
 assert.match(app,/setInterval\(\(\)=>\{refreshVisibleStaffTab\(\)\},30000\)/);
 assert.match(app,/document\.addEventListener\('visibilitychange'/);
 assert.match(app,/window\.addEventListener\('focus'/);
 assert.doesNotMatch(app,/window\.location\.reload\(\)/);
});
test('Auto updates respect officer role permissions and do not refresh a hidden module',()=>{
 const app=read('dist/account.js');
 assert.match(app,/if\(!load\|\|!panel\|\|panel\.hidden\)return/);
 assert.match(app,/user\.position==='secretary'/);
 assert.match(app,/if\(tab==='duty-manage'&&user\.role!=='chairman'\)return/);
 assert.match(app,/if\(document\.querySelector\('dialog\[open\]'\)\)return/);
 assert.match(app,/closest\('input,textarea,select,\[contenteditable="true"\]'\)/);
});
test('Services, rewards and attendance defer updates during active officer actions',()=>{
 const app=read('dist/account.js'),services=read('dist/kk-service-staff.js');
 const rewards=read('dist/kk-rewards-staff.js'),events=read('dist/kk-event-staff.js');
 assert.match(app,/window\.refreshKKServiceStaffIfIdle/);
 assert.match(app,/window\.refreshKKRewardsStaffIfIdle/);
 assert.match(app,/window\.refreshKKEventStaffIfIdle/);
 assert.match(services,/reviewingId!==null/);
 assert.match(services,/window\.refreshKKServiceStaffIfIdle/);
 assert.match(rewards,/window\.refreshKKRewardsStaffIfIdle/);
 assert.match(rewards,/loading\|\|working/);
 assert.match(events,/window\.refreshKKEventStaffIfIdle/);
 assert.match(events,/fetching\|\|busy\|\|active\|\|stream/);
 for(const file of ['dist/account.js','dist/kk-staff.js','dist/kk-service-staff.js','dist/kk-rewards-staff.js','dist/kk-event-staff.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
test('KK IDs top actions have matching height and responsive button grids',()=>{
 const style=read('dist/kk-id-card.css'),html=read('dist/account.html');
 assert.match(html,/class="kk-id-toolbar-actions"/);
 assert.match(html,/id="kk-id-bulk-pdf"/);
 assert.match(html,/id="kk-id-staff-refresh"/);
 assert.match(style,/#panel-kk-ids \.kk-id-toolbar-actions>button\.primary/);
 assert.match(style,/#panel-kk-ids \.kk-id-toolbar-actions>button\.secondary/);
 assert.match(style,/min-height:46px;height:46px/);
 assert.match(style,/@media\(max-width:430px\)/);
 assert.match(style,/@media\(max-width:350px\)/);
 assert.match(html,/kk-id-card\.css\?v=20261029-id-toolbar-v2/);
});
test('Current Project desktop detail poster is contained rather than cropped',()=>{
 const css=read('dist/current-projects.css'),home=read('dist/index.html');
 assert.match(css,/@media\(min-width:901px\)/);
 assert.match(css,/grid-template-columns:minmax\(285px,39%\) minmax\(0,1fr\)/);
 assert.match(css,/object-fit:contain!important/);
 assert.match(home,/current-projects\.css\?v=20261029-desktop-live-v5/);
});
