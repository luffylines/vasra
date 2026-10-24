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
 const displaySitios=()=>{
  const list=$('#kk-sitio-list');if(!list)return;
  list.innerHTML=sitios.length?sitios.map(s=>'<div class="kk-sitio-item"><div><strong>'+escVal(s.name)+'</strong><small>'+escVal(s.active?'Active · visible in KK dropdown':'Inactive · hidden from youth')+'</small></div><div class="kk-sitio-buttons">'+
   '<button type="button" data-sitio-action="edit" data-id="'+escVal(s.id)+'">Edit</button>'+
   '<button type="button" data-sitio-action="toggle" data-id="'+escVal(s.id)+'">'+(s.active?'Disable':'Enable')+'</button></div></div>').join(''):
   '<p class="kk-muted">Wala pang official Sitio/Purok. Mag-add muna upang makapili ang youth applicants.</p>';
 };
 const displayPerks=()=>{
  const root=$('#kk-perk-list');if(!root)return;
  root.innerHTML=perks.length?perks.map(perk=>'<div class="kk-perk-row"><b>'+escVal(perk.title)+'</b><small>'+escVal(perk.cost)+' points · '+(perk.active?'Active':'Inactive')+'</small></div>').join(''):
  '<p class="kk-muted">Wala pang configured perks.</p>';
 };
 const memberCard=m=>{
  const full=initials(m),info=m.profile||{};
  const attributes=[['KK ID',m.kk_id||'For verification'],['Date of birth',m.birthdate||''],
   ['Phone',m.phone],['Email',m.email],['Region','NCR'],['City','Quezon City'],['Barangay','Barangay Vasra'],
   ['Sitio/Purok',sitios.find(s=>s.id===info.sitio_id)?.name||'(No official selection)'],
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
    (m.status==='verified'?'<button type="button" class="secondary" data-award="'+escVal(m.id)+'">Award Points</button>':'')+
   '</div></div></details>';
 };
 const displayMembers=()=>{
  const text=$('#kk-staff-search').value.trim().toLowerCase(),state=$('#kk-staff-filter').value;
  const showing=members.filter(m=>(state==='all'||m.status===state)&&
   (!text||(initials(m)+' '+m.email+' '+(m.kk_id||'')).toLowerCase().includes(text)));
  $('#kk-staff-list').innerHTML=showing.length?showing.map(memberCard).join(''):
   '<p class="kk-muted">Walang KK records na tumutugma sa filter.</p>';
 };
 const displayRedemptions=()=>{
  $('#kk-redemption-list').innerHTML=redemptions.length?redemptions.map(r=>
   '<div class="kk-redemption"><div><b>'+escVal(r.name)+'</b><span>'+escVal(r.perk)+' · '+escVal(r.cost)+' points · '+escVal(r.status)+'</span></div>'+
   (r.status==='pending'?'<div><button data-redemption="approved" data-id="'+escVal(r.id)+'" type="button">Approve</button> <button data-redemption="rejected" data-id="'+escVal(r.id)+'" type="button">Reject</button></div>':'')+'</div>').join(''):
   '<p class="kk-muted">Wala pang redemption requests.</p>';
 };
 async function refresh(){
  if(loading)return;loading=true;status('Loading SK KK records…');
  try{
   const [result,sitioResult,catalog]=await Promise.all([request(''),request('sitios'),request('catalog')]);
   members=Array.isArray(result.members)?result.members:[];
   redemptions=Array.isArray(result.redemptions)?result.redemptions:[];
   sitios=Array.isArray(sitioResult.sitios)?sitioResult.sitios:[];
   perks=Array.isArray(catalog.perks)?catalog.perks:[];
   stats();displayMembers();displaySitios();displayPerks();displayRedemptions();
   status('Records loaded · '+members.length+' KK profile(s). Only SK staff can access these records.');
  }catch(e){
   status('KK database is not active yet. Approved KK migration is required before records or Sitio settings can be saved. '+e.message,true);
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
  const target=e.target.closest('[data-review],[data-award],[data-sitio-action],[data-redemption]');
  if(!target)return;
  if(target.dataset.review){
   const decision=target.dataset.review;
   const note=decision==='rejected'?prompt('Dahilan o kailangang itama ng applicant (required):'):prompt('Optional review note para sa verified profile:','');
   if(note===null||decision==='rejected'&&note.trim().length<5)return;
   if(!confirm((decision==='verified'?'Verify':'Reject')+' this KK profile?'))return;
   bind(target,()=>request('review',{id:target.dataset.id,status:decision,note}));
  }
  if(target.dataset.award){
   const points=prompt('Ilang points ang ibibigay? (1–500)','10');
   if(points===null)return;
   const reason=prompt('Dahilan ng points (required, 5+ characters):','');
   if(reason===null||!Number.isInteger(Number(points))||Number(points)<1||Number(points)>500||reason.trim().length<5){
    status('Suriin ang points at reason.',true);return;
   }
   bind(target,()=>request('points',{id:target.dataset.award,points:Number(points),reason:reason.trim()}));
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
  if(target.dataset.redemption){
   const choice=target.dataset.redemption;
   if(!confirm((choice==='approved'?'Approve':'Reject')+' this perk request?'))return;
   bind(target,()=>request('redemption',{id:target.dataset.id,status:choice,note:''}));
  }
 });
 $('#kk-sitio-form')?.addEventListener('submit',e=>{
  e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  const button=form.querySelector('button[type="submit"]');
  bind(button,async()=>{await request('sitios',{intent:'save',name:data.name.trim(),
   sort_order:Number(data.sort_order),active:true});form.reset();});
 });
 $('#kk-perk-form')?.addEventListener('submit',e=>{
  e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  const button=form.querySelector('button[type="submit"]');
  bind(button,async()=>{await request('perks',{title:data.title.trim(),description:data.description||'',
   cost:Number(data.cost),active:true});form.reset();});
 });
 $('#kk-staff-search')?.addEventListener('input',displayMembers);
 $('#kk-staff-filter')?.addEventListener('change',displayMembers);
 $('#kk-staff-refresh')?.addEventListener('click',refresh);
})();
