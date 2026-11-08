'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync('dist/'+file,'utf8');

test('Pending KK profile automatically checks for SK verification or rejection',()=>{
 const s=read('kk.js');
 assert.match(s,/const checkProfileReview=async\(force=false\)=>/);
 assert.match(s,/profile\.status!=='pending'\|\|document\.hidden\|\|!navigator\.onLine/);
 assert.match(s,/const nextStatus=response\.profile\?\.status\|\|'draft'/);
 assert.match(s,/if\(nextStatus==='verified'\)/);
 assert.match(s,/location\.replace\('\.\/kk-dashboard'\)/);
 assert.match(s,/if\(nextStatus==='rejected'\)/);
 assert.match(s,/await load\(\)/);
 assert.match(s,/profileStatusTimer=setInterval\(\(\)=>\{void checkProfileReview\(\);\},8000\)/);
 assert.match(s,/startProfileReviewWatch\(\);/);
 assert.match(s,/document\.addEventListener\('visibilitychange'/);
 assert.match(s,/window\.addEventListener\('focus'/);
 assert.match(read('kk-profile.html'),/kk\.js\?v=20261108-live-profile-v1/);
 assert.doesNotMatch(s,/window\.location\.reload\(\)/);
});

test('Only the active member sections poll status while tab is visible and online',()=>{
 const s=read('kk-dashboard.js'),p=read('kk-dashboard.html'),staff=read('account.js');
 assert.match(s,/const refreshLiveMemberData=async\(force=false\)=>/);
 assert.match(s,/if\(!member\|\|document\.hidden\|\|!navigator\.onLine\|\|memberLiveRunning\)return/);
 assert.match(s,/window\.loadKKServices\?\.\(\{quiet:true\}\)/);
 assert.match(s,/refreshRewards\(\)/);
 assert.match(s,/refreshParticipation\(true\)/);
 assert.match(s,/refreshProjects\(true\)/);
 assert.match(s,/window\.refreshKKIDCardIfChanged\?\.\(\)/);
 assert.match(s,/setInterval\(\(\)=>\{void refreshLiveMemberData\(\);\},10000\)/);
 assert.match(p,/kk-dashboard\.js\?v=20261108-live-status-v1/);
 assert.match(p,/kk-services\.js\?v=20261108-live-status-v1/);
 assert.match(p,/kk-id-member\.js\?v=20261108-live-status-v1/);
 assert.match(staff,/const minimumInterval=tab\.startsWith\('kk-'\)\?12000:22000/);
 assert.match(staff,/refreshVisibleStaffTab\(\)\},15000/);
 assert.match(read('account.html'),/account\.js\?v=20261108-live-staff-v1/);
});

test('Background SK service polling updates changed requests and retains old data during outages',async()=>{
 const nodes={};
 for(const id of ['kk-printing-history','kk-computer-history','kk-retabox-history','kk-dash-printing-count','kk-dash-computer-count'])
  nodes['#'+id]={textContent:'',innerHTML:'',title:''};
 let status='pending',failed=false,alerts=[];
 const context={
  document:{querySelector:q=>nodes[q]||null},
  window:{showVasraToast:(message,kind)=>alerts.push([message,kind])},
  api:async()=>{if(failed)throw Error('network unavailable');
   return {requests:[{id:'abc',service_type:'printing',status,requested_at:'2026-11-08T01:30:00Z',
    details:{paper_size:'short',color:'bw',pages:1,copies:1}}]};},
  JSON,Date,Map,Number,Array,console
 };
 vm.runInNewContext(read('kk-services.js'),context);
 await context.window.loadKKServices();
 assert.match(nodes['#kk-printing-history'].innerHTML,/pending/);
 assert.equal(nodes['#kk-dash-printing-count'].textContent,'1');
 status='completed';
 await context.window.loadKKServices({quiet:true});
 assert.match(nodes['#kk-printing-history'].innerHTML,/completed/);
 assert.equal(alerts.length,1);
 const previous=nodes['#kk-printing-history'].innerHTML;
 failed=true;
 await context.window.loadKKServices({quiet:true});
 assert.equal(nodes['#kk-printing-history'].innerHTML,previous);
 assert.equal(alerts.length,1);
});

test('KK photo approval refreshes only if card status changes and no upload is in progress',()=>{
 const s=read('kk-id-member.js');
 assert.match(s,/window\.refreshKKIDCardIfChanged=async\(\)=>/);
 assert.match(s,/cardStatusPolling\|\|downloading\|\|upload\.querySelector/);
 assert.match(s,/chooser\.files\?\.length\)return/);
 assert.match(s,/if\(lastCardState!==null&&snapshot!==lastCardState\)await load\(\)/);
});
