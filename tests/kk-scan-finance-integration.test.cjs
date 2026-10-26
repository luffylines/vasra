'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('dist/account.html'),account=read('dist/account.js'),publicJs=read('dist/transparency.js');
const scan=read('dist/kk-qr-scan.js'),css=read('dist/kk-qr-scan.css'),sql=read('supabase/migrations/20261026121500_kk_officer_qr_services_scan.sql');
const api=read('lib/handler.cjs'),supabase=read('lib/supabase.cjs');

test('Scan is available on all SK officer workspaces and opens the SK Services panel',()=>{
 assert.match(html,/data-scan-open class="staff-nav-scan"/);
 assert.match(html,/id="kk-service-open-scanner"/);
 assert.match(html,/id="kk-scan-panel"/);
 assert.match(account,/document\.querySelectorAll\('\[data-scan-open\]'\)/);
 assert.match(account,/await selectTab\('kk-services'\)/);
 assert.match(account,/window\.openKKScan\?\.\(\)/);
 assert.match(account,/window\.closeKKScan\?\.\(\)/);
 assert.match(scan,/window\.closeKKScan=close/);
 assert.match(css,/#kk-scan-video\[hidden\]/);
});
test('Camera scanning uses QR from existing KK card and has Safari/manual fallback',()=>{
 const renderer=read('dist/kk-id-render.js');
 assert.match(renderer,/QR V1-L encodes only the printed KK ID/);
 assert.match(scan,/new window\.BarcodeDetector\(\{formats:\['qr_code'\]\}\)/);
 assert.match(scan,/jsqr@1\.4\.0\/dist\/jsQR\.min\.js/);
 assert.match(scan,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(scan,/$('#kk-scan-manual-input')/);
 assert.match(scan,/stopCamera\(\)/);
});
test('Scanner is staff-authenticated, validates real member and restricts read/write RPC',()=>{
 assert.match(api,/path==='\/api\/kk\/staff\/services\/scan'&&method==='POST'/);
 assert.match(api,/await user\(\['sk','chairman'\]\)/);
 assert.match(api,/kk-staff-scan-ip/);
 assert.match(supabase,/\/rest\/v1\/rpc\/vasra_kk_service_scan/);
 assert.match(sql,/p\.status='verified'/);
 assert.match(sql,/u\.role IN \('sk','chairman'\)/);
 assert.match(sql,/IF action='lookup' THEN/);
 assert.match(sql,/IF action='complete_pending' THEN/);
 assert.match(sql,/IF action='walkin_complete' THEN/);
 assert.match(sql,/status='pending'/);
 assert.match(sql,/matching_pending_request/);
 assert.match(sql,/staff_entry_key uuid/);
 assert.match(sql,/public\.vasra_kk_service_workflow\('review'/);
 assert.match(sql,/public\.vasra_kk_service_workflow\('complete'/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO service_role/);
});
test('Finance uses actual monthly reports, correct peso grouping and publication gate',()=>{
 assert.doesNotMatch(html,/data-tab="budget"/);
 assert.doesNotMatch(html,/id="panel-budget"/);
 assert.match(html,/id="panel-monthly"/);
 assert.match(html,/id="trans-expense-preview"/);
 assert.match(html,/aria-hidden="true">₱<\/span>/);
 assert.match(html,/name="expense" inputmode="decimal"/);
 assert.doesNotMatch(account,/\$\('#budget-form'\)\.onsubmit/);
 assert.match(account,/const transExpenseParse=value=>/);
 assert.match(account,/expense:canEditFinance\(\)\?transExpenseParse\(f\.expense\.value\):null/);
 assert.match(account,/published:canEditFinance\(\)&&f\.published\.checked/);
 assert.match(publicJs,/r\.expense===null\?'Not reported':money\(r\.expense\)/);
 const start=account.indexOf('const transMoney='),end=account.indexOf('const transYearNow=',start);
 assert.ok(start>0&&end>start);
 const fn=new Function(start===-1?'':account.slice(start,end)+'return {transMoney,transExpenseParse};')();
 assert.equal(fn.transMoney(100000),'₱100,000.00');
 assert.equal(fn.transExpenseParse('100000'),'100000.00');
 assert.equal(fn.transExpenseParse('100,000.00'),'100000.00');
 assert.equal(fn.transExpenseParse('0.25'),'0.25');
 assert.equal(fn.transExpenseParse(''),null);
 assert.throws(()=>fn.transExpenseParse('1,00,000'),/valid PHP/);
 assert.throws(()=>fn.transExpenseParse('100.123'),/valid PHP/);
});
test('Edited JS assets compile successfully',()=>{
 for(const file of ['dist/kk-qr-scan.js','dist/account.js','dist/transparency.js','lib/handler.cjs','lib/supabase.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
