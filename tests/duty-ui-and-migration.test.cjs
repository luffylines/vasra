'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('dist/account.html');
const css=read('dist/staff-duty-ui.css');
const sql=read('supabase/migrations/20261018150000_weekly_office_hours.sql');
const duty=read('dist/duty-management.js');
test('SK Officials publishing actions are directly beneath Position, not scattered below photos',()=>{
 const form=html.slice(html.indexOf('<form id="roster-form"'),html.indexOf('</form>',html.indexOf('<form id="roster-form"')));
 const position=form.indexOf('name="position"'),actions=form.indexOf('class="roster-form-actions"'),photo=form.indexOf('class="roster-photo-editor wide"');
 assert(position>=0&&actions>position&&photo>actions);
 for(const label of ['Show publicly','Save Official','Clear form']) assert(form.includes(label));
 assert.equal((form.match(/Save Official/g)||[]).length,1);
 assert.match(form,/<button type="submit" class="primary">Save Official<\/button>/);
 assert.match(form,/<button type="reset" class="secondary">Clear form<\/button>/);
 assert.match(html,/href="\.\/staff-duty-ui\.css"/);
});
test('Position and SK Duty dropdowns have accessible matching chevrons and mobile widths',()=>{
 assert.match(css,/#duty-officer-select,#roster-form select\[name="position"\]/);
 assert.match(css,/appearance:none/);
 assert.match(css,/background-image:url\("data:image\/svg\+xml/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(css,/\.roster-form-button-row/);
 assert.match(css,/\[data-theme="dark"\]/);
});
test('Weekly hours migration is one valid transaction with a single save_hours action',()=>{
 assert.equal((sql.match(/commit;/g)||[]).length,1);
 assert.equal((sql.match(/create or replace function public\.vasra_duty_management/g)||[]).length,1);
 assert.equal((sql.match(/create or replace function public\.vasra_duty\(/g)||[]).length,1);
 assert.match(sql,/if action='save_hours' then/);
 assert.match(sql,/if opening>=closing/);
 assert.match(sql,/vasra\.audit/);
 assert.match(sql,/grant execute on function public\.vasra_duty_management/);
 assert.doesNotMatch(sql,/official_ids/);
});
test('Duty editor retains server-confirmed saving and informs about missing migrations',()=>{
 assert.match(duty,/response\?\.ok!==true/);
 assert.match(duty,/I-save at i-publish muna ang officer sa SK Officials/);
 assert.match(duty,/officer-photo at office-hours migrations/);
 assert.match(duty,/Preview lamang\. Hindi pa active/);
});

test('SQL dollar-quoted functions close correctly before activation',()=>{
 const officer=read('supabase/migrations/20261016124500_official_directory_management.sql');
 assert(officer.includes('end $function$;'));
 assert.equal(sql.split('end $$;').length-1,2);
});
