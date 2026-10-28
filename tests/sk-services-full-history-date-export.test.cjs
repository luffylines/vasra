'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),ui=read('dist/kk-service-staff.js'),
  handler=read('lib/handler.cjs'),sql=read('supabase/migrations/20261026181000_sk_services_full_history_archive.sql');

test('Staff UI keeps completed/rejected out of active queue, and moves Excel to all-date Service History',()=>{
 assert.match(ui,/const isOpen=r=>r.status==='pending'\|\|r.status==='approved'/);
 assert.match(ui,/records.filter\(r=>isOpen\(r\)&&filter\(r,f\)\)/);
 assert.match(html,/id="kk-service-history-heading">Service History</);
 assert.doesNotMatch(html,/Today's Service History/);
 assert.doesNotMatch(html,/id="kk-service-staff-refresh"/);
 const header=html.slice(html.indexOf('<header class="kk-service-admin-heading">'),html.indexOf('<p id="kk-service-staff-message"'));
 assert.doesNotMatch(header,/kk-service-export/);
 const history=html.slice(html.indexOf('kk-service-history-panel"'),html.indexOf('id="kk-retabox-rate-section"'));
 for(const id of ['kk-service-history-search','kk-service-history-date','kk-service-export',
    'kk-service-history-clear','kk-service-history-prev','kk-service-history-next'])assert.match(history,new RegExp('id="'+id+'"'));
 assert.match(history,/Submitted \(PHT\)/);
 assert.match(history,/Processed Date &amp; Time \(PHT\)/);
 assert.match(ui,/scope=history/);
});
test('Staff active queue excludes archived requests and shows even old completed records in history',async()=>{
 const nodes=new Map(),handlers=new Map();
 const get=key=>{
  if(!nodes.has(key))nodes.set(key,{
   value:['#kk-service-type-filter','#kk-service-status-filter','#kk-service-date-filter'].includes(key)?'all':'',
   textContent:'',innerHTML:'',dataset:{},hidden:false,disabled:false,
   addEventListener(type,fn){handlers.set(key+':'+type,fn);},
   querySelector(){return{value:'0'}},scrollIntoView(){}
  });
  return nodes.get(key);
 };
 const date='2024-03-10T13:12:00.000Z';
 const active={id:'a0000000-0000-4000-8000-000000000001',kk_id:'VASRA-KK-02',
  name:'Member Pending',status:'pending',service_type:'printing',details:{paper_size:'long',color:'colored',pages:2,copies:1},
  requested_at:date};
 const finished={...active,id:'b0000000-0000-4000-8000-000000000002',name:'Member Completed',
  status:'completed',reviewed_at:'2024-03-10T14:00:00.000Z',completed_at:'2024-03-10T15:12:00.000Z',
  reviewed_by:'SK Officer',completed_by:'Officer B'};
 const rejected={...active,id:'c0000000-0000-4000-8000-000000000003',name:'Member Rejected',
  status:'rejected',reviewed_at:'2024-03-11T15:12:00.000Z',reviewed_by:'SK Officer'};
 const calls=[];const window={location:{assign:url=>calls.push('EXPORT '+url)}};
 const api=async url=>{
  calls.push(url);
  if(url.includes('/history?')){
   const params=new URL(url,'https://example.com').searchParams;
   const dateFilter=params.get('date');
   const requests=[finished,rejected].filter(x=>!dateFilter||dateFilter==='2024-03-10'&&x===finished);
   return {ok:true,requests,total:requests.length};
  }
  return {ok:true,requests:[active,finished,rejected],retabox_points_per_kg:10};
 };
 vm.runInNewContext(ui,{document:{querySelector:get},window,api,Intl,Date,URL,URLSearchParams,
   console,user:{role:'sk'},confirm:()=>true,setTimeout,clearTimeout});
 await window.loadKKServiceStaff();
 assert.equal(get('#kk-service-result-count').textContent,'1 request(s)');
 assert.match(get('#kk-service-admin-queue').innerHTML,/Member Pending/);
 assert.doesNotMatch(get('#kk-service-admin-queue').innerHTML,/Member Completed|Member Rejected/);
 const history=get('#kk-service-history-body').innerHTML;
 assert.match(history,/Member Completed/);
 assert.match(history,/Member Rejected/);
 assert.match(history,/Officer B/);
 get('#kk-service-history-date').value='2024-03-10';
 await handlers.get('#kk-service-history-date:change')();
 // Event handler isn't async-returning; let the network promise settle.
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(get('#kk-service-history-body').innerHTML,/Member Completed/);
 assert.doesNotMatch(get('#kk-service-history-body').innerHTML,/Member Rejected/);
 handlers.get('#kk-service-export:click')();
 assert.ok(calls.includes('EXPORT ./api/kk/staff/services/export?scope=history'));
});
test('Archive queries are staff authorized, paginated and process dates in Asia/Manila',()=>{
 assert.match(sql,/u.role IN \('chairman','sk'\)/);
 assert.match(sql,/s.token=session_hash/);
 assert.match(sql,/r.status IN \('completed','rejected'\)/);
 assert.match(sql,/LIMIT page_limit OFFSET page_offset/);
 assert.match(sql,/AT TIME ZONE 'Asia\/Manila'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.vasra_kk_service_archive/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.vasra_kk_service_archive.*TO service_role/);
 assert.match(handler,/path==='\/api\/kk\/staff\/services\/history'/);
 assert.match(handler,/kkRpc\('service_archive_list'/);
 assert.match(read('lib/supabase.cjs'),/rpc\/vasra_kk_service_archive/);
});
test('Excel exports every archived page and explicit PHT submitted, processed and completed timestamps',()=>{
 assert.match(handler,/for\(let offset=0;offset<maxRows;offset\+=pageSize\)/);
 assert.match(handler,/all.push\(\.\.\.page.requests\)/);
 assert.match(handler,/Processed Date \(PHT\)/);
 assert.match(handler,/Processed Time \(PHT\)/);
 assert.match(handler,/Completed Date \(PHT\)/);
 assert.match(handler,/Completed Time \(PHT\)/);
 assert.match(handler,/Completed By/);
 assert.match(handler,/SK-Vasra-Service-History-All.xlsx/);
 assert.match(handler,/KKExport.workbook\(rows,\{sheetName:'Service History'\}\)/);
 assert.match(read('lib/kk-export.cjs'),/function workbook\(rows,\{sheetName='Verified KK'\}=\{\}\)/);
 for(const p of ['lib/handler.cjs','lib/supabase.cjs','lib/kk-export.cjs','dist/kk-service-staff.js'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
