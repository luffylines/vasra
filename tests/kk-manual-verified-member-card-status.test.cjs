'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migration=read('supabase/migrations/20261027160000_verified_kk_manual_entry_card_scan.sql');
const server=read('lib/handler.cjs'),backend=read('lib/supabase.cjs');
const scanner=read('dist/kk-qr-scan.js'),quick=read('dist/kk-quick-scan.js');
const events=read('dist/kk-event-staff.js'),account=read('dist/account.js');
test('KK membership and card approval are separately checked, with QR-only card restriction',()=>{
 assert.match(migration,/p\.status,c\.status,c\.storage_path,c\.reviewed_at/);
 assert.match(migration,/membership_status IS DISTINCT FROM 'verified'/);
 assert.match(migration,/card_status='approved'/);
 assert.match(migration,/nullif\(card_path,''\) IS NOT NULL/);
 assert.match(migration,/card_reviewed_at IS NOT NULL/);
 assert.match(migration,/IF entry_mode='qr' AND NOT coalesce\(card_verified,false\)/);
 assert.match(migration,/card_not_verified/);
 assert.match(migration,/RETURN jsonb_build_object\('ok',true,'member_verified',true/);
 assert.doesNotMatch(migration,/INSERT INTO vasra\.kk_points|UPDATE vasra\.kk_profiles/);
});
test('Only SK or Chairman can validate member IDs; no anonymous or member RPC access',()=>{
 assert.match(migration,/u\.role IN \('sk','chairman'\)/);
 assert.match(migration,/s\.expires>clock_timestamp\(\)/);
 assert.match(migration,/u\.disabled_at IS NULL/);
 assert.match(migration,/SECURITY INVOKER SET search_path=''/);
 assert.match(migration,/FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/TO service_role/);
 assert.match(backend,/kk_scan_identity_.*vasra_kk_scan_identity/);
 assert(server.indexOf('const scanIdentity=async')<server.indexOf("if(path==='/api/kk/staff/events/checkin'"),'scanner validation must be initialized before attendance routing');
 assert.match(server,/const scanIdentity=async\(kkId,mode\)=>/);
 assert.match(server,/db\.rpc\('kk_scan_identity_lookup',\{kk_id:kkId,mode\},session\)/);
});
test('Manual services accept a verified profile without approved photo; QR preflight blocks unapproved cards',()=>{
 assert.match(server,/const mode=b\.mode===undefined\?'manual':String\(b\.mode\)/);
 assert.match(server,/const identity=await scanIdentity\(id,mode\)/);
 assert.match(server,/card_verified:identity\.card_verified/);
 assert.match(server,/if\(action==='complete_pending'\)/);
 assert.match(scanner,/const cardVerified=data\.card_verified===true/);
 assert.match(scanner,/Member ID\/Card: Not Verified/);
 assert.match(scanner,/Manual KK ID entry is allowed/);
 assert.match(scanner,/const lookup=async\(raw,mode='manual'\)=>/);
 assert.match(scanner,/lookup\(value,'qr'\)/);
 assert.match(scanner,/lookup\(e\.target\.value,'manual'\)/);
 assert.match(scanner,/mode:entryMode/);
 assert.match(quick,/JSON\.stringify\(\{action:'lookup',kk_id:raw,mode\}\)/);
 assert.match(quick,/window\.enterKKScanService\(raw,mode\)/);
 assert.match(quick,/recognized\(manual\.value,'manual'\)/);
 assert.match(account,/window\.enterKKScanService=async\(kkId,mode='manual'\)=>/);
});
test('Attendance restricts QR check-in by card status but still grants a single manual verified check-in',()=>{
 const begin=server.indexOf("if(path==='/api/kk/staff/events/checkin'");
 const end=server.indexOf("if(path==='/api/kk/staff/events/export'",begin);
 assert(begin>0&&end>begin);
 const route=server.slice(begin,end);
 assert.match(route,/await user\(\['sk','chairman'\]\)/);
 assert.match(route,/const identity=await scanIdentity\(kkId,mode\)/);
 assert.match(route,/const recorded=await eventRpc\('checkin'/);
 assert(route.indexOf('await scanIdentity')<route.indexOf("await eventRpc('checkin'"));
 assert.match(events,/mode:automatic\?'qr':'manual'/);
 assert.match(events,/Member's ID\/Card is not verified — manual KK ID accepted/);
 const original=read('supabase/migrations/20261026153500_kk_event_qr_checkin_automatic_ten_points.sql');
 assert.match(original,/pr\.status='verified'/);
 assert.match(original,/ON CONFLICT\(project_id,member_id\) DO NOTHING/);
 assert.match(original,/IF recorded_at IS NULL/);
});
test('Card notices are responsive and honor dark theme; scripts parse',()=>{
 const css=read('dist/kk-qr-scan.css');
 assert.match(css,/\.kk-scan-card-notice\.is-verified/);
 assert.match(css,/\.kk-scan-card-notice\.is-unverified/);
 assert.match(css,/body\[data-theme="dark"\]/);
 const html=read('dist/account.html');
 assert.match(html,/kk-quick-scan\.js\?v=20261027-manual-card-v1/);
 assert.match(html,/kk-event-staff\.js\?v=20261027-manual-card-v1/);
 for(const p of ['lib/supabase.cjs','lib/handler.cjs','dist/kk-qr-scan.js',
  'dist/kk-quick-scan.js','dist/kk-event-staff.js','dist/account.js'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
