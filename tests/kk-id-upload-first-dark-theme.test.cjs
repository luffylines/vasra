'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const dash=read('dist/kk-dashboard.html'),app=read('dist/kk-dashboard.js'),member=read('dist/kk-id-member.js'),
 css=read('dist/kk-id-card.css'),theme=read('dist/theme.css'),themeJs=read('dist/theme.js');
test('full KK member dashboard and unchanged other sections survive the ID layout change',()=>{
 assert.match(dash,/^<!doctype html>/i);assert.match(dash,/<\/html>\s*$/i);
 for(const key of ['overview','projects','activities','rewards','printing','computer','retabox','settings','kk-id'])
  assert.match(dash,new RegExp('data-section="'+key+'"'));
 assert.match(dash,/kk-sidebar-nav/);assert.match(dash,/kk-dashboard-logout/);
 assert.equal((dash.match(/data-section="kk-id"/g)||[]).length,1);
});
test('member sees exactly one primary heading for each tab and portrait upload first',()=>{
 assert.match(dash,/<h1 id="kk-current-section-title">My KK Dashboard<\/h1>/);
 assert.match(app,/const headings=\{overview:'My KK Dashboard'/);
 assert.match(app,/title\.textContent=headings\[which\]/);
 assert.match(app,/which==='kk-id'\?'OFFICIAL KATIPUNAN NG KABATAAN IDENTIFICATION'/);
 const section=dash.slice(dash.indexOf('<section data-section="kk-id"'),dash.indexOf('<section data-section="settings"'));
 assert.ok(section.indexOf('kk-id-upload-card')<section.indexOf('kk-id-reference-card'));
 assert.equal((section.match(/<h2/g)||[]).length,0);
 assert.equal((section.match(/<h3/g)||[]).length,1);
 assert.match(section,/Step 1 · Upload Your Photo/);
 assert.match(section,/id="kk-id-render-front"/);assert.match(section,/id="kk-id-render-back"/);
});
test('portrait chooser previews locally, validates before upload and revokes preview URLs',()=>{
 for(const id of ['kk-id-upload-form','kk-id-photo','kk-id-selected-photo','kk-id-selected-thumbnail','kk-id-selected-filename'])
  assert.ok(dash.includes('id="'+id+'"'),id);
 assert.match(member,/chooser\.addEventListener\('change'/);
 assert.match(member,/URL\.createObjectURL\(file\)/);
 assert.match(member,/URL\.revokeObjectURL\(selectedPhotoUrl\)/);
 assert.match(member,/upload\.reset\(\);clearPreview\(\)/);
 assert.match(member,/image\/jpeg.*image\/png.*image\/webp/);
 assert.match(member,/file\.size>2000000/);
});
test('unified theme fixes logged in KK pages and authentication/profile without affecting CR80 artwork',()=>{
 assert.match(theme,/--kk-dark-base:#0b1729/);
 for(const token of ['.kk-dashboard-panel','.kk-service-form','.kk-activity-card','.kk-settings-card',
  '.kk-id-upload-card','.kk-auth-card','.kk-registration','.kk-profile-sheet','.kk-ph-number',
  '.kk-workspace-sidebar','.kk-summary article','input:not([type=checkbox])'])
  assert.ok(theme.includes(token),token);
 assert.match(theme,/html\[data-theme="dark"\] body\.kk-body/);
 assert.match(css,/kk-id-upload-card\{order:0/);
 assert.match(css,/kk-id-reference-card\{order:1/);
 assert.match(css,/kk-id-preview-side>img/);
 assert.match(themeJs,/theme\.css\?v=20261025-kk-upload-first-dark-v3/);
 for(const page of ['kk-dashboard','kk-login','kk-register','kk-profile'])
  assert.match(read('dist/'+page+'.html'),/theme\.js\?v=20261025-kk-upload-first-dark-v3/,page);
 assert.match(dash,/kk-id-card\.css\?v=20261025-kk-toast-square-v1/);
});
test('member and theme scripts compile and PDF printing renderer remains available',()=>{
 for(const src of ['dist/kk-dashboard.js','dist/kk-id-member.js','dist/theme.js','dist/kk-id-render.js'])
  assert.doesNotThrow(()=>new vm.Script(read(src),{filename:src}));
 assert.match(dash,/kk-id-render\.js\?v=/);
 assert.match(read('dist/kk-id-staff.js'),/Download PDF|download PDF|PDF/);
});
