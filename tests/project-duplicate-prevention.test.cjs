'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'dist/account.js'),'utf8');
const html=fs.readFileSync(path.join(root,'dist/account.html'),'utf8');
const css=fs.readFileSync(path.join(root,'dist/admin-dashboard.css'),'utf8');
const supabase=fs.readFileSync(path.join(root,'lib/supabase.cjs'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261128100000_prevent_duplicate_project_titles.sql'),'utf8');

test('project titles normalize case, Unicode form, and repeated whitespace',()=>{
 const helper=js.match(/function normalizeProjectTitle\(value\)\{[\s\S]*?\n\}/)?.[0];
 assert(helper,'normalization helper exists');
 const context={};const vm=require('node:vm');vm.createContext(context);
 vm.runInContext(helper,context);
 assert.equal(vm.runInContext("normalizeProjectTitle('  Girls   Summit 2026  ')",context),'girls summit 2026');
 assert.equal(vm.runInContext("normalizeProjectTitle('GIRLS SUMMIT 2026')",context),'girls summit 2026');
 assert.equal(vm.runInContext("normalizeProjectTitle('Cafe\\u0301')",context),vm.runInContext("normalizeProjectTitle('Café')",context));
});

test('duplicate warning offers edit existing, change title, and cancel',()=>{
 for(const id of ['duplicate-project-dialog','duplicate-project-title','duplicate-project-status','duplicate-project-edit','duplicate-project-change','duplicate-project-close'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/function showDuplicateProject\(project\)/);
 assert.match(js,/if\(project\)openEditor\(project\)/);
 assert.match(js,/title\.focus\(\)/);
 assert.match(css,/#duplicate-project-dialog/);
 assert.match(css,/data-theme="dark".*#duplicate-project-dialog|#duplicate-project-dialog[\s\S]*data-theme="dark"/);
});

test('existing project can retain its title while a rename to another title is checked',()=>{
 assert.match(js,/if\(editing&&editing\.id===excludeId&&normalizeProjectTitle\(editing\.title\)===normalized\)return null/);
 assert.match(js,/findDuplicateProject\(\$\('#project-form'\)\.elements\.title\.value,editing\?\.id\|\|null\)/);
});

test('database trigger serializes same-title writes and ignores the current row',()=>{
 assert.match(migration,/pg_advisory_xact_lock\(hashtextextended\(normalized_title, 0\)\)/);
 assert.match(migration,/p\.id IS DISTINCT FROM NEW\.id/);
 assert.match(migration,/ERRCODE='23505'/);
 assert.match(migration,/BEFORE INSERT OR UPDATE OF title ON vasra\.projects/);
 assert.match(migration,/TG_OP='UPDATE'.*normalized_title.*OLD\.title/s);
});

test('concurrent database duplicate conflicts reopen the existing-project warning',()=>{
 assert.match(js,/duplicateError=\/kapareho ng title\|vasra_projects_title_normalized_unique\/i/);
 assert.match(js,/await loadProjects\(\);const duplicate=findDuplicateProject/);
 assert.match(supabase,/action === 'save_project' \? 'May existing project na kapareho ng title/);
});

test('duplicate warning dialog is polished and responsive on phones, tablets, desktop, and landscape',()=>{
 assert.match(css,/width:min\(540px,calc\(100vw - 32px\)\)/);
 assert.match(css,/max-height:calc\(100dvh - 32px\)/);
 assert.match(css,/overflow-y:auto/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/@media\(max-height:560px\) and \(orientation:landscape\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/body\.account-workspace\[data-theme="dark"\] #duplicate-project-dialog/);
 assert.match(css,/\.duplicate-project-actions #duplicate-project-edit\{[\s\S]*grid-row:1/);
 assert.match(css,/\.duplicate-project-actions #duplicate-project-close\{grid-column:1;grid-row:2\}/);
 assert.match(css,/\.duplicate-project-actions #duplicate-project-change\{grid-column:2;grid-row:2\}/);
});
