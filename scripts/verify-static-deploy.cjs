'use strict';
/* Prevent a valid-looking but blank Vercel deployment when the KK dashboard
 * HTML is accidentally overwritten with a fragment (e.g. only a hidden section
 * followed by the footer). No network or credentials required. */
const fs=require('node:fs'),path=require('node:path');
function verifyKKDashboard(document,assetExists=()=>true){
 const fail=message=>{throw new Error('KK Dashboard deploy integrity failed: '+message);};
 if(!/^\s*<!doctype html>/i.test(document))fail('missing <!doctype html>; possible truncated file');
 if(!/<html\b[^>]*>[\s\S]*<\/html>\s*$/i.test(document))fail('document does not contain full html wrapper');
 if(!/<head\b[^>]*>[\s\S]*<\/head>/i.test(document))fail('missing head/stylesheet block');
 if(!/<body\b[^>]*class="[^"]*\bkk-member-dashboard\b[^"]*"[^>]*>[\s\S]*<\/body>/i.test(document))
  fail('missing KK member body');
 if(!/<aside\b[^>]*id="kk-sidebar"/i.test(document)&&!/<aside\b[^>]*id="kk-sidebar"[^>]*>/i.test(document))
  fail('missing member sidebar');
 if(!document.includes('id="kk-dash-content"'))fail('missing main dashboard content');
 if(!document.includes('id="kk-current-section-title"'))fail('missing heading controller');
 const sections=['overview','projects','activities','rewards','printing','computer','retabox','settings','kk-id'];
 for(const section of sections){
  if(!document.includes('data-section="'+section+'"'))fail('missing '+section+' panel');
 }
 const scripts=['common.js','theme.js','kk-dashboard.js','kk-id-render.js','kk-id-member.js','kk-services.js'];
 const styles=['kk.css','kk-dashboard.css','kk-id-card.css','kk-services.css'];
 for(const name of scripts){
  if(!document.includes('src="./'+name)&&!document.includes("src='"+name))
    fail('missing '+name+' script tag');
  if(!assetExists(name))fail('missing static JS file '+name);
 }
 for(const name of styles){
  if(!document.includes('href="./'+name)&&!document.includes("href='"+name))
    fail('missing '+name+' stylesheet tag');
  if(!assetExists(name))fail('missing static CSS file '+name);
 }
 if(!document.includes('kk-id-upload-form')||!document.includes('kk-id-render-front')||!document.includes('kk-id-render-back'))
  fail('missing photo upload or front/back preview');
 if(document.indexOf('kk-id-upload-card')>=document.indexOf('kk-id-reference-card'))
  fail('KK ID upload must appear before front/back preview');
 if(!/<footer\b[\s\S]*<\/footer>/i.test(document))fail('missing footer');
 return {ok:true,sections:sections.length};
}
function main(){
 const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
 const html=fs.readFileSync(path.join(dist,'kk-dashboard.html'),'utf8');
 const out=verifyKKDashboard(html,name=>fs.existsSync(path.join(dist,name)));
 process.stdout.write('Deploy integrity OK: complete KK Dashboard, '+out.sections+' sections, styles and scripts.\n');
}
if(require.main===module)main();
module.exports={verifyKKDashboard};
