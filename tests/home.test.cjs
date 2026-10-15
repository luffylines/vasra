const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dist=path.join(__dirname,'../dist');
async function home(fail=false){
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',className:''});return nodes.get(id)};
 const now=new Date(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const month=parts.year+'-'+parts.month+'-01';
 const context=vm.createContext({$,Intl,Date,Set,esc:v=>String(v).replaceAll('<','&lt;'),navigator:{},setInterval(){},document:{querySelectorAll:()=>[],addEventListener(){}},api:async url=>{
  if(fail)throw Error('Unavailable');
  if(url.includes('transparency'))return {budget:{amount:10000,reference:'Published record'},updates:[{project_id:'a',month,expense:125.50},{project_id:'a',month,expense:null},{project_id:'b',month,expense:0}],officials:[{name:'<Officer>',position:'chairman'}]};
  if(url.includes('projects'))return {projects:[{id:'a',title:'<Project>',status:'Isinasagawa',description:'Description',progress:50,category:'Education',updated:now.toISOString()}]};
  return {mode:'auto'};
 }});
 vm.runInContext(fs.readFileSync(path.join(dist,'duty-data.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(dist,'officers.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(dist,'home.js'),'utf8'),context);
 await new Promise(setImmediate);return $;
}
test('homepage counts distinct reported projects, sums known expenses and escapes public content',async()=>{
 const $=await home();assert.equal($('#home-month-count').textContent,2);assert.equal($('#home-year-count').textContent,2);assert.equal($('#home-active').textContent,1);
 assert.match($('#home-expense').textContent,/125\.50/);assert.match($('#home-highlights').innerHTML,/&lt;Project>/);assert.match($('#home-officials').innerHTML,/&lt;Officer>/);assert.doesNotMatch($('#home-highlights').innerHTML,/<Project>/);
 assert.match($('#home-duty-officers').innerHTML,/NAKATAKDA NGAYON/);
});
test('homepage failures remain explicit without inventing financial or official records',async()=>{
 const $=await home(true);assert.equal($('#home-budget').textContent,'Hindi ma-load sa ngayon');assert.equal($('#home-month-count').textContent,'Hindi ma-load sa ngayon');assert.match($('#home-duty-status').textContent,/Status unverified|Closed/);assert.match($('#home-officials').innerHTML,/Hindi ma-load/);
});
test('default home and inner pages retain a single complete navigation and valid local assets',()=>{
 for(const name of ['index.html','projects.html','duty.html','contacts.html','transparency.html','account.html']){
  const html=fs.readFileSync(path.join(dist,name),'utf8');assert.equal((html.match(/<nav aria-label="Pangunahing navigation">/g)||[]).length,1,name);
  assert.match(html,/<a href="\.\/"[^>]*>.*?<span>Home<\/span>/s);assert.match(html,/href="\.\/projects.html"/);
  for(const [,asset] of html.matchAll(/(?:src|href)="\.\/([^"?#]+\.(?:js|css))"/g))assert(fs.existsSync(path.join(dist,asset)),asset);
 }
 const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');assert.match(html,/<title>Home/);assert(!html.includes('src="./app.js"'));assert.match(fs.readFileSync(path.join(dist,'projects.html'),'utf8'),/id="grid"/);
});

test('directory excludes drafts and unverified entries and only renders available roles',()=>{
 const c=vm.createContext({esc:v=>String(v).replaceAll('<','&lt;')});
 vm.runInContext(fs.readFileSync(path.join(dist,'duty-data.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(dist,'officers.js'),'utf8'),c);
 const html=vm.runInContext('officerDirectory([{name:"Published",position:"secretary"},{name:"Draft",position:"chairman",published:false},{name:"Unverified",position:"kagawad",verified:false}],true)',c);
 assert.match(html,/Published/);assert.doesNotMatch(html,/Draft|Unverified|SK Chairperson/);assert.match(vm.runInContext('officerDirectory([])',c),/Wala pang available na verified officers/);
 assert.match(vm.runInContext('officerPortrait("Ernest Bragais")',c),/portrait-left/);assert.match(vm.runInContext('officerPortrait("Kristine De Ocampo")',c),/portrait-right/);
});
