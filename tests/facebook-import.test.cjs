'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const FB=require('../lib/facebook-import.cjs');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dist/account.html'),'utf8');
const staff=fs.readFileSync(path.join(root,'dist/account.js'),'utf8');
const api=fs.readFileSync(path.join(root,'lib/handler.cjs'),'utf8');

test('Facebook import only accepts HTTPS post URLs on explicit Facebook hosts',()=>{
 assert.match(FB.validFacebookUrl('https://www.facebook.com/skbrgyvasra/posts/123'),/^https:\/\/www\.facebook\.com/);
 for(const url of ['http://facebook.com/posts/123','https://facebook.com.evil.example/posts/123','https://127.0.0.1/x','https://facebook.com/','https://facebook.com:444/posts/123','https://user:password@facebook.com/posts/123'])
  assert.throws(()=>FB.validFacebookUrl(url));
});
test('public OG metadata parsing is bounded and excludes generic Facebook login screens',()=>{
 assert.equal(FB.metadata('<html><meta property="og:description" content="SK Vasra Youth Leadership Seminar 2026!"></html>'),'SK Vasra Youth Leadership Seminar 2026!');
 assert.equal(FB.metadata('<meta name="description" content="Log in to Facebook to see posts">'),'');
});
test('pasted caption basic autofill returns review-only draft without Facebook URL',async()=>{
 const result=await FB.importFacebookPost({
  url:'https://www.facebook.com/skbrgyvasra/posts/123',
  caption:'Youth Leadership Training\nPara sa kabataan ng Barangay Vasra'
 },{apiKey:'',fetcher:()=>{throw Error('No network should be requested')}});
 assert.equal(result.ok,true);
 assert.equal(result.source,'pasted-caption');
 assert.equal(result.draft.category,'Edukasyon');
 assert.equal(result.draft.status,'Pinaplano');
 assert.equal(result.draft.progress,0);
 assert.doesNotMatch(result.draft.scope,/Facebook post: https/);
 assert.equal(result.imagesImported,0);
 assert.equal(result.needsReview,true);
});
test('empty or too-short captions are rejected without guessing project info',async()=>{
 const res=await FB.importFacebookPost({caption:''},{aiKey:'',fetcher:()=>{throw Error('Network should never be called')}});
 const short=await FB.importFacebookPost({caption:'hello'},{aiKey:''});
 assert.equal(short.ok,false);
 assert.equal(res.ok,false);
 assert.equal(res.reason,'caption_required');
 assert.equal(res.draft,undefined);
});
test('AI response is constrained to text fields, publication and progress remain manual',async()=>{
 const f=async (url,init)=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
  title:'Community Cleanup',category:'Kalikasan',description:'Community clean-up activity',
  scope:'Cleanup in the barangay',published:true,progress:100,status:'Natapos'
 })}}]})});
 const res=await FB.importFacebookPost({
  url:'https://www.facebook.com/skbrgyvasra/posts/456',caption:'Clean up drive at Vasra.'
 },{aiKey:'test-only',fetcher:f});
 assert.equal(res.ok,true);assert.equal(res.draft.method,'ai');
 assert.equal(res.draft.title,'Community Cleanup');
 assert.equal(res.draft.progress,0);assert.equal(res.draft.status,'Pinaplano');
 assert.doesNotMatch(res.draft.scope,/Facebook post:/);
});
test('UI provides caption-only analysis without image input or automatic saving',()=>{
 for(const id of ['fb-import-panel','fb-post-caption','fb-analyze-post','fb-import-result'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/id="fb-import-screenshot"/);
 assert.doesNotMatch(staff,/\$\('#fb-import-screenshot'\)/);
 assert.doesNotMatch(html,/id="fb-post-url"/);
 assert.match(staff,/JSON\.stringify\(\{caption\}\)/);
 assert.match(api,/if\(typeof b\.caption!=='string'\)/);
 assert.doesNotMatch(api,/typeof b\.url!=='string'/);
 assert.match(staff,/form\.elements\.publication_mode\.value='draft'/);
 assert.match(staff,/form\.elements\.status\.value=\['Pinaplano','Natapos','Isinasagawa'\]/);
 assert.match(staff,/appendProjectFiles\(files\)/);
 assert.match(staff,/\.\/api\/manage\/projects\/import-facebook/);
 assert.match(api,/await user\(\['chairman'\]\)/);
 assert.match(api,/limit\('facebook-import'/);
});

test('new project has Manual Entry and Facebook Caption Analyzer modes',()=>{
 assert.match(html,/id="project-entry-mode"/);
 assert.match(html,/id="entry-mode-manual"[^>]*aria-pressed="true"/);
 assert.match(html,/id="entry-mode-facebook"[^>]*aria-pressed="false"/);
 assert.match(html,/Manual Entry/);
 assert.match(html,/Facebook Caption \+ AI/);
 assert.match(html,/Facebook Caption Analyzer/);
 assert.match(html,/id="fb-import-panel"[^>]*hidden/);
 assert.match(staff,/function setProjectEntryMode\(mode\)/);
 assert.match(staff,/const facebook=mode==='facebook'&&!editing&&user\?\.role==='chairman'/);
 assert.match(staff,/setProjectEntryMode\('manual'\)/);
 assert.match(staff,/button\.setAttribute\('aria-pressed',String\(active\)\)/);
});
test('Manual mode is always the default; Facebook mode offers Groq and fallback without auto-publish',()=>{
 const start=staff.indexOf('function setProjectEntryMode(mode){');
 const end=staff.indexOf("function openEditor(project=null)",start);
 assert(start>=0&&end>start);
 const block=staff.slice(start,end);
 const buttons=['manual','facebook'].map(value=>({
  dataset:{entryMode:value},classList:{toggle(name,v){this.selected=v}},
  setAttribute(name,v){this[name]=v}
 }));
 const footer={hidden:false};
 const nodes={
  '#project-entry-mode':{hidden:false,addEventListener(){}},
  '#manual-entry-help':{hidden:false},
  '#fb-import-panel':{hidden:true,open:false},
  '#project-review-fields':{hidden:false},
  '#fb-review-hint':{hidden:true},
  '#project-form':{querySelector:()=>footer}
 };
 const dom={querySelectorAll:()=>buttons};
 const $=id=>nodes[id];
 const build=new Function('$','document','getUser','getEditing','getDraftReady',
  'return function(mode){let user=getUser(),editing=getEditing(),facebookDraftReady=getDraftReady();'+
  block.slice(block.indexOf('const facebook='),block.indexOf("$('#project-entry-mode').addEventListener")).replace(/\}\s*$/,'')+
  '}');
 const chairman=build($,dom,()=>({role:'chairman'}),()=>null,()=>false);
 chairman('manual');
 assert.equal(nodes['#fb-import-panel'].hidden,true);
 assert.equal(nodes['#manual-entry-help'].hidden,false);
 chairman('facebook');
 assert.equal(nodes['#fb-import-panel'].hidden,false);
 assert.equal(nodes['#fb-import-panel'].open,true);
 assert.equal(nodes['#manual-entry-help'].hidden,true);
 assert.equal(nodes['#project-review-fields'].hidden,true);
 assert.equal(footer.hidden,true);
 assert.equal(buttons[1]['aria-pressed'],'true');
 const analyzed=build($,dom,()=>({role:'chairman'}),()=>null,()=>true);
 analyzed('facebook');
 assert.equal(nodes['#project-review-fields'].hidden,false);
 assert.equal(nodes['#fb-review-hint'].hidden,false);
 assert.equal(footer.hidden,false);
 const officer=build($,dom,()=>({role:'sk'}),()=>null,()=>false);
 officer('facebook');
 assert.equal(nodes['#project-entry-mode'].hidden,true);
 assert.equal(nodes['#fb-import-panel'].hidden,true);
});

test('36th SK VASRA Regular Session is recognized as an event, not an education project',async()=>{
 const caption=[
 'OCTOBER 10, 2026 | 36TH SK VASRA REGULAR SESSION',
 'Naganap ang ika-36 na Regular Session ng Sangguniang Kabataan ng Barangay VASRA noong ika-10 ng Oktubre 2026 sa SK VASRA Office.',
 'Tinalakay ng konseho ang mga nakatakdang programa at aktibidad para sa mga buwan ng Oktubre at Nobyembre. Layunin ng mga paghahandang ito na makapaghatid ng mga makabuluhang proyekto at aktibidad para sa mga Kabataang VASRA.',
 'Naipasa rin sa sesyong ito ang mga sumusunod na SK Resolutions:',
 'a. SKR035-2026 A RESOLUTION EXTENDING THE CONGRATULATIONS',
 'b. SKR036-2026 A RESOLUTION EXTENDING THE CONGRATULATIONS',
 'c. SKR037-2026 A RESOLUTION FORMALLY ACCEPTING STUDENT INTERNS'
 ].join('\n');
 const x=await FB.importFacebookPost({url:'https://www.facebook.com/share/p/1GcDA2vCM8/',caption},{aiKey:'',fetcher:()=>{throw Error('no network')}});
 assert.equal(x.ok,true);
 assert.equal(x.draft.content_type,'meeting');
 assert.equal(x.draft.category,'SK Regular Session');
 assert.equal(x.draft.title,'36th SK VASRA Regular Session');
 assert.equal(x.draft.activity_date,'2026-10-10');
 assert.equal(x.draft.status,'Natapos');
 assert.equal(x.draft.progress,100);
 assert.match(x.draft.description,/Naganap ang ika-36/);
 assert.doesNotMatch(x.draft.description,/SKR037-2026/);
 assert.match(x.draft.scope,/SKR035-2026/);
 assert.match(x.warning,/hindi awtomatikong project/i);
 assert.equal(x.reviewRecommended,true);
});
test('Groq failures report safe diagnostic instead of pretending basic fallback is AI',async()=>{
 const caption='OCTOBER 10, 2026 | 36TH SK VASRA REGULAR SESSION\nNaganap ang Regular Session ng SK.';
 const missing=await FB.importFacebookPost({url:'https://www.facebook.com/share/p/123',caption},{aiKey:'',fetcher:()=>{throw Error('no network')}});
 assert.equal(missing.ai.status,'missing_key');
 assert.equal(missing.draft.method,'basic');
 const notAuthorized=await FB.importFacebookPost({url:'https://www.facebook.com/share/p/123',caption},{aiKey:'test',fetcher:async()=>({ok:false,status:401})});
 assert.equal(notAuthorized.ai.status,'provider_error');
 assert.equal(notAuthorized.ai.http_status,401);
 assert.equal(notAuthorized.draft.method,'basic');
 assert.equal(notAuthorized.source,'pasted-caption');
});
test('AI cannot turn meeting into education project or change evidence-based event date',async()=>{
 const caption='OCTOBER 10, 2026 | 36TH SK VASRA REGULAR SESSION\nNaganap ang Regular Session ng SK Vasra.';
 const ai=await FB.importFacebookPost({url:'https://www.facebook.com/share/p/123',caption},{
  aiKey:'test-only',
  fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
   title:'Educational Project',category:'Edukasyon',description:'Naganap ang regular session ng SK Vasra.',scope:'Regular session agenda.',
   activity_date:'2025-01-01',content_type:'project',progress:0,status:'Pinaplano'
  })}}]})})
 });
 assert.equal(ai.draft.method,'ai');
 assert.equal(ai.draft.title,'36th SK VASRA Regular Session');
 assert.equal(ai.draft.category,'SK Regular Session');
 assert.equal(ai.draft.content_type,'meeting');
 assert.equal(ai.draft.activity_date,'2026-10-10');
 assert.equal(ai.draft.status,'Natapos');
});
test('Meeting/announcement requires explicit chairman confirmation before project autofill',()=>{
 assert.match(html,/id="fb-use-activity-as-project"[^>]*hidden/);
 assert.match(staff,/const isNonProject=draft\.content_type==='meeting'\|\|draft\.content_type==='announcement'/);
 assert.match(staff,/pendingImportedActivity=result/);
 assert.match(staff,/applyFacebookDraft\(pendingImportedActivity\)/);
 assert.match(staff,/if\(isNonProject\)\{/);
 assert.match(staff,/function facebookAiStatus\(/);
});

test('completed clean-up caption is a completed activity rather than 0%-planned',async()=>{
 const caption='CLEAN-UP DRIVE SA BARANGAY VASRA\nMatagumpay na naisagawa ang clean-up drive noong ika-12 ng Oktubre 2026 sa Barangay Vasra. Nakiisa ang mga kabataan sa paglilinis ng paligid.';
 const result=await FB.importFacebookPost({caption},{aiKey:'',fetcher:()=>{throw Error('Should not contact Facebook')}});
 assert.equal(result.ok,true);
 assert.equal(result.draft.category,'Kalikasan');
 assert.equal(result.draft.status,'Natapos');
 assert.equal(result.draft.progress,100);
 assert.equal(result.draft.activity_date,'2026-10-12');
 assert.equal(result.ai.status,'missing_key');
});
test('future planning caption does not falsely claim an event is completed',async()=>{
 const caption='YOUTH SPORTS FESTIVAL\nInihahanda ng SK Vasra ang isang paligsahan sa barangay para sa susunod na buwan.';
 const result=await FB.importFacebookPost({caption},{aiKey:'',fetcher:()=>{throw Error('Should not contact Facebook')}});
 assert.equal(result.ok,true);
 assert.equal(result.draft.status,'Pinaplano');
 assert.equal(result.draft.progress,0);
 assert.equal(result.draft.activity_date,null);
});
test('announcements require review, not automatic project creation',async()=>{
 const caption='PAALALA SA MGA KABATAAN\nAng SK Vasra Office ay pansamantalang sarado ngayong hapon. Maghintay ng karagdagang anunsyo.';
 const result=await FB.importFacebookPost({caption},{aiKey:'',fetcher:()=>{throw Error('Should not contact Facebook')}});
 assert.equal(result.draft.content_type,'announcement');
 assert.equal(result.reviewRecommended,true);
});
test('AI output can improve summary while preserving confirmed classification/status and correct date',async()=>{
 const caption='OCTOBER 10, 2026 | 36TH SK VASRA REGULAR SESSION\nNaganap ang regular session ng SK Vasra.';
 const result=await FB.importFacebookPost({caption},{aiKey:'test',
  fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
   title:'Invented education project',category:'Edukasyon',description:'Naganap ang regular session noong October 10, 2026.',
   scope:'Pinag-usapan ang mga programa.',
   status:'Pinaplano',progress:0
  })}}]})})
 });
 assert.equal(result.draft.category,'SK Regular Session');
 assert.equal(result.draft.status,'Natapos');
 assert.equal(result.draft.method,'ai');
 assert.match(result.draft.description,/Naganap/);
});
test('upload progress stays in an accessible fixed dialog toast until completion',()=>{
 assert.match(html,/id="project-upload-progress"[^>]*role="status"[^>]*hidden/);
 assert.match(staff,/function projectUploadStatus\(text\)/);
 assert.match(staff,/toast\.hidden=!text/);
 assert.match(staff,/projectUploadStatus\(progressText\)/);
 assert.match(staff,/projectUploadStatus\('Tapos na ang photo upload/);
 assert.match(staff,/projectUploadStatus\(''\)/);
 assert.match(staff,/success\(editing\?/);
 assert.doesNotMatch(staff,/setTimeout\([^)]*projectUploadStatus/);
});
test('GEAR UP road safety seminar uses educational category from full caption body',async()=>{
 const caption='OCTOBER 10, 2026 | GEAR UP!\nNoong October 10, 2026, idinaos ang GEAR UP! Secured Kabataan: Road Safety Awareness Seminar sa 2nd Floor, Mines Multipurpose Building, sa pakikipagtulungan ng Automobile Association Philippines (AAP). Dinaluhan ito ng mga kabataang riders mula sa ride-hailing at delivery platforms. Tinuro ang mga traffic signs at road safety.';
 const draft=await FB.importFacebookPost({caption},{aiKey:''});
 assert.equal(draft.draft.category,'Edukasyon');
 assert.equal(draft.draft.content_type,'project');
 assert.equal(draft.draft.activity_date,'2026-10-10');
});
test('Groq cannot downgrade an evidence-supported education category to Iba pang programa',async()=>{
 const caption='OCTOBER 10, 2026 | GEAR UP!\nNaganap ang Road Safety Awareness Seminar para sa mga kabataang riders. Tinuruan sila tungkol sa traffic signs.';
 const result=await FB.importFacebookPost({caption},{aiKey:'test',fetcher:async()=>({
  ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
   title:'GEAR UP! Road Safety Seminar',category:'Iba pang programa',
   description:'Road safety awareness seminar para sa youth riders.',
   scope:'Road signs and safe riding.'
  })}}]})
 })});
 assert.equal(result.draft.method,'ai');
 assert.equal(result.draft.category,'Edukasyon');
 assert.equal(result.draft.description,'Road safety awareness seminar para sa youth riders.');
});
test('Unrelated education mention does not turn an SK meeting into a project',async()=>{
 const caption='OCTOBER 10, 2026 | SK VASRA REGULAR SESSION\nNaganap ang regular session ng SK council tungkol sa road safety seminar at mga educational plans.';
 const result=await FB.importFacebookPost({caption},{aiKey:''});
 assert.equal(result.draft.content_type,'meeting');
 assert.equal(result.draft.category,'SK Regular Session');
});
test('Caption Analyzer disclosure uses modern SVG chevron with open-state rotation',()=>{
 assert.match(html,/<span class="fb-import-chevron"[^>]*><svg/);
 assert.doesNotMatch(html,/<span class="fb-import-chevron"[^>]*>⌄<\/span>/);
});
