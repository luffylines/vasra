'use strict';
(() => {
 const $=selector=>document.querySelector(selector);
 const escVal=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const request=(path,body)=>api('./api/kk/staff'+(path?'/'+path:''),body?{method:'POST',body:JSON.stringify(body)}:{});
 let members=[],sitios=[],perks=[],redemptions=[];
 let loading=false;
 const status=(message='',error=false)=>{const target=$('#kk-staff-message');if(!target)return;target.textContent=message;target.dataset.kind=error?'error':'info';};
 const initials=m=>[m.first_name,m.middle_name,m.last_name].filter(Boolean).join(' ');
 const stats=()=>{
  const states=['draft','pending','verified','rejected'];
  $('#kk-staff-stats').innerHTML=states.map(state=>'<div class="kk-stat"><span>'+state+'</span><b>'+members.filter(x=>x.status===state).length+'</b></div>').join('');
 };
 const sitioName=id=>sitios.find(s=>String(s.id)===String(id))?.name||'Not selected';
 const sitioCounts=id=>{
  const matches=members.filter(m=>String(m.profile?.sitio_id||'')===String(id));
  return {registered:matches.length,verified:matches.filter(m=>m.status==='verified').length};
 };
 const displaySitios=()=>{
  const list=$('#kk-sitio-list');if(!list)return;
  const search=$('#kk-sitio-search')?.value.trim().toLocaleLowerCase()||'';
  const ordered=sitios.filter(s=>s.name.toLocaleLowerCase().includes(search))
   .sort((a,b)=>Number(a.sort_order||100)-Number(b.sort_order||100)||a.name.localeCompare(b.name));
  const total=members.filter(m=>m.profile?.sitio_id).length;
  $('#kk-sitio-totals').textContent=sitios.length+' sitios · '+total+' residents assigned';
  list.innerHTML=ordered.length?ordered.map(s=>{
   const counts=sitioCounts(s.id);
   return '<article class="kk-sitio-item"><div class="kk-sitio-label"><strong>'+escVal(s.name)+'</strong><small>'+
    escVal(s.active?'Active · KK dropdown':'Inactive · hidden from youth')+'</small></div>'+
    '<div class="kk-sitio-counts"><span><b>'+counts.registered+'</b> Registered</span><span><b>'+counts.verified+'</b> Verified</span></div>'+
    '<div class="kk-sitio-buttons"><button type="button" data-sitio-action="edit" data-id="'+escVal(s.id)+'">Edit</button>'+
    '<button type="button" data-sitio-action="toggle" data-id="'+escVal(s.id)+'">'+(s.active?'Disable':'Enable')+'</button></div></article>';
  }).join(''):'<p class="kk-muted">'+(search?'Walang sitio na tumutugma sa search.':'Wala pang official Sitio/Purok. Pindutin ang + Add Sitio.')+'</p>';
 };
 const memberCard=m=>{
  const full=initials(m),info=m.profile||{};
  const attributes=[['KK ID',m.kk_id||'For verification'],['Date of birth',m.birthdate||''],
   ['Phone',m.phone],['Email',m.email],['Region','NCR'],['City','Quezon City'],['Barangay','Barangay Vasra'],
   ['Sitio/Purok',sitioName(info.sitio_id)],
   ['Street',info.street],['Religion',info.religion],['Civil status',info.civil_status],
   ['Gender',info.gender],['Solo Parent',info.solo_parent],['Family members',info.family_count],
   ['Siblings',info.siblings],['Education',info.education],['School',info.school_name],
   ['Year Level',info.year_level],['Employment',info.employment],['Voter status',info.voter],
   ['Skills/Interests',info.interests],['Emergency contact',info.emergency_name],
   ['Emergency number',info.emergency_phone],['Emergency relation',info.emergency_relation]];
  return '<details class="kk-member"><summary><span class="kk-avatar">'+escVal((m.first_name||'?').slice(0,1)+(m.last_name||'').slice(0,1))+'</span><span class="kk-member-heading"><strong>'+escVal(full)+'</strong><small>'+escVal(m.email)+' · '+escVal(m.kk_id||'No KK ID yet')+'</small></span>'+
   '<span class="kk-state kk-state-'+escVal(m.status)+'">'+escVal(m.status)+'</span><b>'+escVal(m.points||0)+' pts</b></summary>'+
   '<div class="kk-member-content"><div class="kk-member-details">'+attributes.filter(([,v])=>v!==undefined&&v!==null).map(([label,v])=>'<div><span>'+escVal(label)+'</span><strong>'+escVal(v||'—')+'</strong></div>').join('')+'</div>'+
   (m.review_note?'<p class="kk-note">Review Note: '+escVal(m.review_note)+'</p>':'')+
   '<div class="kk-member-actions">'+
    (m.status==='pending'?'<button type="button" class="primary" data-review="verified" data-id="'+escVal(m.id)+'">Verify Profile</button><button type="button" class="secondary" data-review="rejected" data-id="'+escVal(m.id)+'">Reject / Request Correction</button>':'')+
    (m.status==='verified'?'<span class="kk-verification-reward">✓ Verified · 50 welcome points awarded once</span>':'')+
   '</div></div></details>';
 };
 const displayMembers=()=>{
  const text=$('#kk-staff-search').value.trim().toLowerCase(),state=$('#kk-staff-filter').value;
  const showing=members.filter(m=>(state==='all'||m.status===state)&&
   (!text||(initials(m)+' '+m.email+' '+(m.kk_id||'')+' '+sitioName(m.profile?.sitio_id)).toLowerCase().includes(text)));
  $('#kk-staff-list').innerHTML=showing.length?showing.map(memberCard).join(''):
   '<p class="kk-muted">Walang KK records na tumutugma sa filter.</p>';
 };
 async function refresh(){
  if(loading)return;loading=true;status('Loading KK Profiling records…');
  try{
   // Separate calls avoid falsely claiming that the KK schema is missing
   // when a different, optional endpoint fails.
   const [result,sitioResult]=await Promise.all([request(''),request('sitios')]);
   if(!Array.isArray(result?.members)||!Array.isArray(sitioResult?.sitios))
    throw Error('Invalid KK staff response.');
   members=result.members;sitios=sitioResult.sitios;
   stats();displayMembers();displaySitios();
   status('Updated · '+members.length+' KK members · '+sitios.length+' official sitios.');
  }catch(e){
   status('Hindi ma-load ang KK records: '+e.message+' I-check ang staff session at kung sa tamang preview domain ka naka-login.',true);
  }finally{loading=false;}
 }
 window.loadKKStaff=refresh;
 const bind=async(button,task)=>{
  button.disabled=true;
  try{await task();await refresh();}
  catch(e){status(e.message,true);}
  finally{button.disabled=false;}
 };
 document.addEventListener('click',e=>{
  if(!e.target.closest('#panel-kk-profiling'))return;
  const target=e.target.closest('[data-review],[data-sitio-action]');
  if(!target)return;
  if(target.dataset.review){
   const decision=target.dataset.review;
   const note=decision==='rejected'?prompt('Dahilan o kailangang itama ng applicant (required):'):prompt('Optional review note para sa verified profile:','');
   if(note===null||decision==='rejected'&&note.trim().length<5)return;
   if(!confirm((decision==='verified'?'Verify':'Reject')+' this KK profile?'))return;
   bind(target,()=>request('review',{id:target.dataset.id,status:decision,note}));
  }
  if(target.dataset.sitioAction){
   const entry=sitios.find(item=>item.id===target.dataset.id);
   if(!entry)return;
   if(target.dataset.sitioAction==='toggle'){
    if(!confirm(entry.active?'Huwag na ipakita ang '+entry.name+' sa youth dropdown?':'I-enable ang '+entry.name+'?'))return;
    bind(target,()=>request('sitios',{intent:'save',id:entry.id,name:entry.name,
     sort_order:entry.sort_order,active:!entry.active}));
   }else{
    const name=prompt('Bagong opisyal na pangalan ng Sitio/Purok:',entry.name);
    if(name===null||name.trim().length<2)return;
    bind(target,()=>request('sitios',{intent:'save',id:entry.id,name:name.trim(),
     sort_order:entry.sort_order,active:entry.active}));
   }
  }

 });
 $('#kk-sitio-form')?.addEventListener('submit',e=>{
  e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  const button=form.querySelector('button[type="submit"]');
  bind(button,async()=>{await request('sitios',{intent:'save',name:data.name.trim(),
   sort_order:Number(data.sort_order),active:true});form.reset();$('#kk-sitio-editor').hidden=true;$('#kk-sitio-add-toggle').setAttribute('aria-expanded','false');});
 });
 $('#kk-sitio-add-toggle')?.addEventListener('click',()=>{
  const editor=$('#kk-sitio-editor'),button=$('#kk-sitio-add-toggle');
  editor.hidden=!editor.hidden;button.setAttribute('aria-expanded',String(!editor.hidden));
  if(!editor.hidden)editor.querySelector('input[name="name"]')?.focus();
 });
 $('#kk-sitio-add-cancel')?.addEventListener('click',()=>{
  $('#kk-sitio-editor').hidden=true;$('#kk-sitio-add-toggle').setAttribute('aria-expanded','false');
  $('#kk-sitio-form').reset();
 });
 $('#kk-sitio-search')?.addEventListener('input',displaySitios);
 $('#kk-staff-search')?.addEventListener('input',displayMembers);
 $('#kk-staff-filter')?.addEventListener('change',displayMembers);
 $('#kk-staff-refresh')?.addEventListener('click',refresh);
})();
