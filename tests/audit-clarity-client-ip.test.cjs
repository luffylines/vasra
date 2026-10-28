'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const account=fs.readFileSync(path.join(root,'dist/account.js'),'utf8');
const api=fs.readFileSync(path.join(root,'api/index.js'),'utf8');
const handler=fs.readFileSync(path.join(root,'lib/handler.cjs'),'utf8');
const portal=fs.readFileSync(path.join(root,'dist/portal.css'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'dist/admin-dashboard.css'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261016183000_audit_client_ip.sql'),'utf8');
const auditBody=account.slice(account.indexOf('function auditDetails(event){'),account.indexOf('async function loadAudit(){'));
const {auditDetails}=new Function(auditBody+'return {auditDetails};')();
test('Activity gallery events are explained in Filipino and not displayed as JSON',()=>{
 assert.equal(auditDetails({action:'project_gallery_updated',details:'{"image_count":3}'}),
  '3 larawan ang naka-save sa project gallery. Ang unang larawan ang cover photo.');
 assert.match(account,/class="audit-detail-text"/);
 assert.doesNotMatch(account,/<pre>'\+esc\(auditDetails\(event\)\)/);
});
test('Sensitive data never appears in activity details',()=>{
 assert.doesNotMatch(auditDetails({action:'password_changed',details:{password:'SECRET'}}),/SECRET/);
 assert.doesNotMatch(auditDetails({action:'unknown_action',details:{token:'SECRET'}}),/SECRET/);
});
test('Only Chairman may read IP-bearing Activity Log, and only validated addresses are forwarded',()=>{
 assert.match(handler,/if \(path === '\/api\/audit' && method === 'GET'\) \{\s*await user\(\['chairman'\]\)/);
 assert.match(api,/isIP\(value\)\?value:null/);
 assert.match(api,/x-vercel-forwarded-for/);
 assert.match(api,/x-forwarded-for/);
 assert.match(migration,/BEFORE INSERT ON vasra\.audit/);
 assert.match(migration,/x-vasra-client-ip/);
});
test('Project title/category and audit details have readable mobile styles',()=>{
 assert.match(portal,/\.cardbody \.category\{font-size:12px/);
 assert.match(portal,/#detail #detailbody>h2/);
 assert.match(dashboard,/\.audit-more \.audit-detail-text/);
 assert.match(portal,/@media\(max-width:650px\)/);
});