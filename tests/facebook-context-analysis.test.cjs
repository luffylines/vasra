'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Context=require('../lib/caption-analysis.cjs');
const FB=require('../lib/facebook-import.cjs');
const staff=fs.readFileSync(path.join(__dirname,'../dist/account.js'),'utf8');
const captionHSBE=[
 'OCTOBER 3, 2026 | HANDOG SA BALIK ESKWELA 2026 DISTRIBUTION',
 'Naipamahagi ng SK VASRA ang mga school supplies sa mga Senior High at College students.',
 'Kasabay ng pamamahagi, nagbigay rin ng mensahe ang SK Council sa mga mag-aaral upang patuloy silang magsikap.'
].join('\n');
const captionSafety=[
 'OCTOBER 10, 2026 | GEAR UP!',
 'Naganap ang GEAR UP Road Safety Awareness Seminar para sa mga kabataang riders.',
 'Tinalakay ang traffic signs at helmet safety sa multipurpose building.'
].join('\n');
const aiReply=data=>async()=>({
 ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(data)}}]})
});
test('completed school supplies distribution -> Edukasyon, Natapos and 100%',async()=>{
 const r=await FB.importFacebookPost({caption:captionHSBE},{aiKey:'',fetcher:()=>{throw Error('No external fetch expected')}});
 assert.equal(r.draft.category,'Edukasyon');
 assert.equal(r.draft.status,'Natapos');
 assert.equal(r.draft.progress,100);
 assert.equal(r.draft.progress_provisional,false);
 assert.equal(r.draft.method,'basic');
 assert(!Context.substantiallySame(r.draft.description,r.draft.scope));
});
test('different subjects resolve from body context, not a generic seminar heading',()=>{
 assert.equal(Context.categoryForCaption('TRAINING AT SEMINAR\nNagsagawa ng medical mission at vaccination awareness tungkol sa kalusugan.'),'Kalusugan');
 assert.equal(Context.categoryForCaption(captionSafety),'Edukasyon');
 assert.equal(Context.categoryForCaption('CLEAN-UP DRIVE\nMatagumpay na naisagawa ang clean-up sa palaruan bago ang basketball event.'),'Kalikasan');
 assert.equal(Context.categoryForCaption('YOUTH SPORTS FESTIVAL\nBasketball at volleyball tournament'),'Palakasan');
 assert.equal(Context.categoryForCaption(captionHSBE),'Edukasyon');
});
test('planned, ongoing, finished, negative and unclear captions receive evidence-based status',()=>{
 const samples=[
  ['Ipamamahagi pa lamang ang school supplies sa susunod na buwan.','Pinaplano',0],
  ['Kasalukuyang isinasagawa ang pamamahagi ng school kits.','Isinasagawa',1],
  ['Patuloy na isinasagawa ang programa. Progress: 65%','Isinasagawa',65],
  ['Matagumpay na naisagawa ang food distribution.','Natapos',100],
  ['Hindi pa naisagawa ang proyekto; nakatakdang gaganapin sa Nobyembre.','Pinaplano',0],
  ['Programang Kabataan: Sama-sama para sa komunidad.','Pinaplano',0]
 ];
 for(const [caption,status,progress] of samples){
  const d=Context.detectStatus(caption);
  assert.equal(d.status,status,caption);
  assert.equal(d.progress,progress,caption);
 }
 const ongoing=Context.detectStatus('Kasalukuyang isinasagawa ang programa.');
 assert.equal(ongoing.provisional,true);
 assert.match(ongoing.note,/placeholder/);
 const complete=Context.detectStatus('Naganap ang seminar at patuloy na susuportahan ang mga estudyante.');
 assert.equal(complete.status,'Natapos');
});
test('AI uses all caption text, concise summary and a distinct factual scope',async()=>{
 const r=await FB.importFacebookPost({caption:captionHSBE},{aiKey:'test',fetcher:aiReply({
  title:'Handog sa Balik Eskwela 2026',category:'Edukasyon',
  category_evidence:'school supplies sa mga Senior High',
  status:'Natapos',status_evidence:'Naipamahagi ng SK VASRA',
  progress:null,
  description:'Namahagi ng school supplies ang SK VASRA para sa mga estudyante.',
  scope:'- Mga benepisyaryo: Senior High at College students\n- Nagbigay ng mensahe ang SK Council.'
 })});
 assert.equal(r.ai.status,'success');
 assert.equal(r.draft.method,'ai');
 assert.equal(r.draft.status,'Natapos');
 assert.equal(r.draft.progress,100);
 assert.notEqual(r.draft.scope,r.draft.description);
 assert.match(r.draft.scope,/College students/);
});
test('AI cannot invent 100 percent or override an evidence-based completed status',async()=>{
 const r=await FB.importFacebookPost({caption:captionHSBE},{aiKey:'test',fetcher:aiReply({
  category:'Iba pang programa',description:'Namahagi ng mga school supplies ang SK VASRA.',
  scope:'Namahagi ng mga school supplies ang SK VASRA.',
  status:'Pinaplano',progress:0
 })});
 assert.equal(r.draft.category,'Edukasyon');
 assert.equal(r.draft.status,'Natapos');
 assert.equal(r.draft.progress,100);
 assert(!Context.substantiallySame(r.draft.description,r.draft.scope));
});
test('AI completed claim without matching caption evidence cannot claim completion',async()=>{
 const caption='YOUTH PROJECT\nNakatakdang ipamamahagi ang mga supply kit sa susunod na linggo.';
 const r=await FB.importFacebookPost({caption},{aiKey:'test',fetcher:aiReply({
  category:'Edukasyon',description:'May balak na pamamahagi ng kits.',
  scope:'- Naka-schedule sa susunod na linggo',
  status:'Natapos',status_evidence:'Nakatakdang ipamamahagi',
  progress:100
 })});
 assert.equal(r.draft.status,'Pinaplano');
 assert.equal(r.draft.progress,0);
});
test('AI can refine uncertain status only with exact supporting caption evidence',async()=>{
 const caption='PROJECT UPDATE\nNagpapatuloy ang trabaho sa multipurpose center.';
 const r=await FB.importFacebookPost({caption},{aiKey:'test',fetcher:aiReply({
  category:'Serbisyong Panlipunan',
  description:'Nagpapatuloy ang gawain sa multipurpose center.',
  scope:'- Gawain sa multipurpose center',
  status:'Isinasagawa',status_evidence:'Nagpapatuloy ang trabaho',
  progress:90
 })});
 assert.equal(r.draft.status,'Isinasagawa');
 assert.equal(r.draft.progress,1);
 assert.equal(r.draft.progress_provisional,true);
});
test('FB autofill and manual status/progress remain consistent',()=>{
 assert.match(staff,/const progress=status==='Natapos'\?100:status==='Pinaplano'\?0/);
 assert.match(staff,/progress_provisional/);
 assert.match(staff,/form\.elements\.status\.value=n===100\?'Natapos':n===0\?'Pinaplano':'Isinasagawa'/);
 assert.match(staff,/form\.elements\.progress\.value=100/);
 assert.match(staff,/form\.elements\.progress\.value=0/);
 assert.match(staff,/Status evidence:/);
});
