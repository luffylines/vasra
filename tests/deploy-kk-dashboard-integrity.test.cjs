'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {verifyKKDashboard}=require('../scripts/verify-static-deploy.cjs');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Vercel build is explicitly gated on complete KK member HTML and assets',()=>{
 const vercel=JSON.parse(file('vercel.json'));
 const pkg=JSON.parse(file('package.json'));
 assert.equal(vercel.outputDirectory,'dist');
 assert.equal(vercel.buildCommand,'npm run check:deploy');
 assert.equal(pkg.scripts['check:deploy'],'node scripts/verify-static-deploy.cjs');
 const out=verifyKKDashboard(file('dist/kk-dashboard.html'),name=>
  fs.existsSync(path.join(root,'dist',name)));
 assert.equal(out.ok,true);assert.equal(out.sections,8);
});
test('Broken footer-only preview fails before Vercel can serve the deployment',()=>{
 const broken='<section data-section="kk-id" hidden><p>upload</p></section>'+
  '<footer>© 2026 SK Vasra Arang Kada-Kabataang Vasra</footer></body></html>';
 assert.throws(()=>verifyKKDashboard(broken),/truncated|doctype/i);
});
test('Dropping stylesheet or content controller fails static deploy check',()=>{
 const good=file('dist/kk-dashboard.html');
 assert.throws(()=>verifyKKDashboard(good.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i,'')),/head/);
 assert.throws(()=>verifyKKDashboard(good.replace('id="kk-dash-content"','id="missing"')),/dashboard content/);
 assert.throws(()=>verifyKKDashboard(good,asset=>asset!=='kk-dashboard.css'),/static CSS/);
 assert.throws(()=>verifyKKDashboard(good,asset=>asset!=='kk-dashboard.js'),/static JS/);
});
