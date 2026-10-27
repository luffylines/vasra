'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const Mail=require('../lib/vasra-email-template.cjs');
const handler=read('lib/handler.cjs');
test('All four VASRA Resend flows use one SK logo branded email theme alongside plain text',()=>{
 assert.equal((handler.match(/Mail\.renderEmail\(/g)||[]).length,5);
 for(const start of ['async function sendAccountEmail','async function sendKKEmailChangeLink',
   'async function sendKKReviewEmail','async function sendPublicContactEmail']){
   const at=handler.indexOf(start);
   assert.ok(at>=0,start);
   const endpoint=handler.indexOf("https://api.resend.com/emails",at);
   assert.ok(endpoint>=0);
   const next=handler.indexOf('}\n\n',endpoint);
   const block=handler.slice(at,Math.min(handler.length,next+3));
   assert.match(block,/Mail\.renderEmail\(/);
   assert.match(block,/\btext\s*:/);
   assert.match(block,/\bhtml\s*:/);
 }
 assert.match(handler,/const Mail = require\('\.\/vasra-email-template\.cjs'\)/);
});
test('Email renders accessible SK logo header, VASRA colors, responsive and email-compatible tables',()=>{
 const html=Mail.renderEmail({
  subject:'Secure Account Reset',heading:'Reset Your Password',
  body:'Open your secure link.',actionLabel:'Reset Password',
  actionUrl:'https://vasra.vercel.app/kk-reset#token=secure-test',
  details:[{label:'Link validity',value:'30 minutes'}],
  notice:'Only you should use this link.'
 });
 assert.match(html,/https:\/\/vasra\.vercel\.app\/sk%20logo\.jpg/);
 assert.match(html,/alt="SK VASRA official logo"/);
 assert.match(html,/viewport/);
 assert.match(html,/role="presentation"/);
 for(const hex of ['#132d53','#245bb1','#d93443','#f3bd2f'])assert.ok(html.includes(hex),hex);
 assert.match(html,/Reset Your Password/);
 assert.match(html,/Reset Password/);
 assert.match(html,/30 minutes/);
 assert.match(html,/secure-test/);
 assert.match(html,/SK VASRA · QUEZON CITY/);
});
test('Untrusted contact form values and email links are safely escaped',()=>{
 const html=Mail.renderEmail({
  subject:'Inquiry <bad>',heading:'New "Inquiry"',
  body:'Hello <img src=x onerror=alert(1)>',
  details:[{label:'Name',value:'<script>alert(2)</script>'}],
  actionLabel:'Click <here>',
  actionUrl:'javascript:alert(4)'
 });
 assert.doesNotMatch(html,/<script>|<img src=x|href="javascript:/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img src=x/);
 assert.match(html,/Inquiry &lt;bad&gt;/);
 assert.ok(!html.includes('Click &lt;here&gt;'),'unsafe URL must suppress the CTA');
 assert.equal(Mail.allowedLink('javascript:alert(1)'),'');
 assert.equal(Mail.allowedLink('http://example.com/reset'),'');
});
test('Manual KK ID input and Find Member are aligned at 42px on phone and desktop',()=>{
 const style=read('dist/kk-qr-scan.css'),html=read('dist/account.html');
 assert.match(style,/#kk-quick-overlay #kk-quick-manual-id,\s*\n#kk-quick-overlay #kk-quick-manual-form button\[type="submit"\]/);
 assert.match(style,/height:42px!important/);
 assert.match(style,/align-items:center!important;justify-content:center!important/);
 assert.match(style,/grid-template-columns:minmax\(0,1fr\) 112px!important/);
 assert.match(style,/@media\(max-width:480px\)/);
 assert.match(style,/@media\(max-width:340px\)/);
 assert.match(html,/kk-qr-scan\.css\?v=20261027-manual-card-v1/);
 assert.match(html,/id="kk-quick-manual-id"/);
});
test('Updated mail template and handler syntax compile',()=>{
 for(const file of ['lib/vasra-email-template.cjs','lib/handler.cjs'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
