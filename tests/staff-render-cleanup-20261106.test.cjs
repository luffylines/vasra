'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=name=>fs.readFileSync('dist/'+name,'utf8');
test('public projects page has no install app banner or install handlers',()=>{
 const html=read('projects.html'), js=read('app.js');
 assert.doesNotMatch(html,/install-strip|installhelp|Dalhin ang SK Vasra saan ka man|I-install ang app/);
 assert.doesNotMatch(js,/\$\('#install'\)|\$\('#install2'\)|\$\('#installhelp'\)/);
 assert.match(html,/id="grid"/);
});
test('secretary workspace placeholder is hidden, other roles keep their notices',()=>{
 const js=read('account.js');
 assert.doesNotMatch(js,/Secretary workspace: i-review ang project records/);
 assert.match(js,/info\.hidden=user\.role==='chairman'\|\|user\.position==='secretary'/);
 assert.match(js,/Treasurer workspace:/);
});
test('staff initializes theme and session before scripts and overlaps independent API requests',()=>{
 const html=read('account.html'),js=read('account.js');
 assert.match(html,/window\.__vasraEarlySession=fetch\('\.\/api\/me'/);
 assert.match(html,/document\.body\.dataset\.theme=localStorage\.getItem/);
 assert.match(js,/window\.__vasraEarlySession\.then\(result/);
 assert.match(js,/Promise\.all\(\[projectsReady,loadRoleOverview\(projectsReady\)\]\)/);
 assert.match(js,/Promise\.all\(\[projectsReady,dataPromise\]\)/);
});
