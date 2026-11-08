'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const r=p=>fs.readFileSync(p,'utf8');
const server=r('lib/handler.cjs'),mail=r('lib/vasra-email-template.cjs'),ui=r('dist/kk-id-staff.js');
const dash=r('dist/kk-dashboard.js'),html=r('dist/kk-dashboard.html'),css=r('dist/kk-dashboard.css');
const member=r('dist/kk-id-member.js');
test('all KK approval emails and logo use the new canonical domain',()=>{
 assert.match(server,/https:\/\/www\.skvasra\.app\/kk-dashboard#kk-id/);
 assert.match(server,/https:\/\/www\.skvasra\.app\/kk-dashboard#rewards/);
 assert.doesNotMatch(server,/const url='https:\/\/vasra\.vercel\.app/);
 assert.match(mail,/https:\/\/www\.skvasra\.app\/sk%20logo\.jpg/);
});
test('already accepted card emails never report as pending due to status wording',()=>{
 assert.match(server,/if\(ticket\?\.status==='accepted'\)return \{status:'provider_accepted'\}/);
 assert.match(ui,/const delivered=status==='provider_accepted'\|\|status==='accepted'/);
 assert.match(ui,/email_state==='accepted'/);
});
test('KK dashboard shows own uploaded portrait while respecting private endpoint and fallback',()=>{
 assert.match(html,/id="kk-sidebar-photo"/);
 assert.match(html,/id="kk-dashboard-portrait"/);
 assert.match(dash,/request\('id-card'\)/);
 assert.match(dash,/card\?\.ok!==true\|\|!card\.photo_exists/);
 assert.match(dash,/\.\/api\/kk\/id-card\/photo\?v=/);
 assert.match(dash,/sidebar\.hidden=true;dashboard\.hidden=true/);
 assert.match(member,/dispatchEvent\(new Event\('kk-id-photo-updated'\)\)/);
 assert.match(css,/object-fit:cover/);
});

test('browser and installed portal load the updated member and staff assets',()=>{
 const memberPage=r('dist/kk-dashboard.html'),staffPage=r('dist/account.html'),sw=r('dist/sw.js');
 assert.match(memberPage,/kk-dashboard\.js\?v=20261108-readable-sidebar-v2/);
 assert.match(memberPage,/kk-id-member\.js\?v=20261108-photo-scan-v1/);
 assert.match(staffPage,/kk-id-staff\.js\?v=20261108-email-state-v1/);
 assert.match(sw,/const CACHE='vasra-v70-kk-photo-scan-20261108'/);
});
