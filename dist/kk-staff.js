'use strict';
(() => {
 const $=selector=>document.querySelector(selector);
 const escVal=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const request=(path,body)=>api('./api/kk/staff'+(path?'/'+path:''),body?{method:'POST',body:JSON.stringify(body)}:{});
 let members=[],sitios=[],perks=[],redemptions=[],participation=[];
 let loading=false, selectedMemberId=null, detailTab='profile';
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
 const pretty=(value,kind='')=>{
   if(value===undefined||value===null||value==='')return '—';
   if(kind==='yesno')return String(value).toLowerCase()==='yes'?'Yes':String(value).toLowerCase()==='no'?'No':'—';
   const dictionary={single:'Single',married:'Married','college':'College','year-1':'1st Year College',
    male:'Male',female:'Female',student:'Student','junior-high':'Junior High School',
    'senior-high':'Senior High School',yes:'Yes',no:'No'};
   return dictionary[String(value)]||String(value).replace(/-/g,' ').replace(/^./,c=>c.toUpperCase());
 };
 const detailPairs=entries=>'<dl class="kk-child-pairs">'+entries.map(([key,value,kind])=>
   '<div><dt>'+escVal(key)+'</dt><dd>'+escVal(pretty(value,kind))+'</dd></div>').join('')+'</dl>';
 const detailCard=(heading,icon,entries)=>'<section class="kk-child-card"><header><span class="kk-child-icon" aria-hidden="true">'+icon+'</span><h4>'+
  escVal(heading)+'</h4></header>'+detailPairs(entries)+'</section>';
 const selectedMember=()=>members.find(m=>m.id===selectedMemberId);
 const memberCard=m=>{
   const full=initials(m),active=m.id===selectedMemberId;
   return '<button type="button" class="kk-applicant-row'+(active?' active':'')+'" data-open-member="'+escVal(m.id)+
    '" aria-pressed="'+String(active)+'"><span class="kk-applicant-avatar">'+escVal((m.first_name||'?')[0]+(m.last_name||'?')[0])+
    '</span><span class="kk-applicant-main"><strong>'+escVal(full)+'</strong><small>'+escVal(m.email)+
    '</small><small>KK ID: '+escVal(m.kk_id||'For verification')+' · '+escVal(m.birthdate||'—')+
    ' · '+escVal(m.profile?.residence_city||'Quezon City')+'</small></span><span class="kk-applicant-meta">'+
    '<span class="kk-state kk-state-'+escVal(m.status)+'">'+escVal(m.status)+'</span><b>'+
    escVal(m.points||0)+' pts</b></span><span class="kk-row-arrow" aria-hidden="true">›</span></button>';
 };
 const renderMemberDetail=()=>{
  const container=$('#kk-staff-detail');
  if(!container)return;
  const m=selectedMember();
  if(!m){container.innerHTML='<div class="kk-child-empty"><strong>Select an applicant</strong><p>Pumili ng pangalan sa kaliwa para makita ang personal details at SK verification status.</p></div>';return;}
  const p=m.profile||{},full=initials(m),short=(m.first_name||'?')[0]+(m.last_name||'?')[0];
  const tab='<div class="kk-child-tabs" role="tablist" aria-label="Applicant details">'+
   [['profile','Profile Details'],['history','Activity Log'],['documents','Documents']].map(([value,label])=>
    '<button type="button" role="tab" data-child-tab="'+value+'" aria-selected="'+String(detailTab===value)+'">'+label+'</button>').join('')+'</div>';
  let details='';
  if(detailTab==='documents'){
   details='<section class="kk-child-card"><header><span class="kk-child-icon">▣</span><h4>Uploaded Valid ID</h4></header>'+
    (m.document?.exists?'<div class="kk-document-summary"><div><strong>'+escVal(m.document.name||'Submitted ID')+'</strong><small>Uploaded: '+escVal(m.document.uploaded_at||'—')+
    '</small></div><button type="button" data-view-id="'+escVal(m.id)+'">View Valid ID securely</button></div>':
    '<p class="kk-muted">Wala pang valid ID sa secured document storage. Huwag mag-verify kung kailangan pa ng identity proof.</p>')+'</section>';
  }else if(detailTab==='history'){
   details='<section class="kk-child-card"><header><span class="kk-child-icon">◷</span><h4>Review Activity</h4></header><p class="kk-muted">'+
    (m.status==='rejected'?'For correction · '+escVal(m.review_note||'No explanation'):
    m.status==='verified'?'SK verification approved.':'Application status: '+escVal(m.status))+'</p>'+
    '<p class="kk-muted">Full audit records are in the staff Activity Log workspace.</p></section>';
  }else{
   details='<div class="kk-child-grid">'+
    detailCard('Personal Information','♙',[
     ['Full Name',full],['Date of Birth',m.birthdate],['Gender',p.gender],['Civil Status',p.civil_status],
     ['Religion',p.religion],['Solo Parent',p.solo_parent,'yesno'],['Family Members',p.family_count],['Siblings',p.siblings]])+
    detailCard('Address','⌖',[
     ['Region',p.residence_region||'NCR'],['Province',p.residence_province||'Metro Manila'],
     ['City / Municipality',p.residence_city||'Quezon City'],['Barangay',p.residence_barangay||'Vasra'],
     ['Sitio/Purok',sitioName(p.sitio_id)],['House No./Street',p.street],['Address Line 2',p.address_line_2]])+
    detailCard('Education','▤',[
     ['Educational Status',p.education_status],['Educational Attainment',p.education],
     ['School',p.school_name],['Year Level',p.year_level],['Course / Program',p.course_program],
     ['Employment',p.employment]])+
    detailCard('Additional Information','≡',[
     ['Registered SK Voter?',p.sk_voter||p.voter,'yesno'],
     ['Registered National Voter?',p.national_voter,'yesno'],
     ['Voted Last Election?',p.voted_last_election,'yesno'],
     ['Attended KK Assembly?',p.kk_assembly,'yesno'],
     ['Skills/Interests',p.interests]])+
    detailCard('Emergency Contact','☏',[
     ['Contact Person',p.emergency_name],['Contact Number',p.emergency_phone],
     ['Relationship',p.emergency_relation]])+
    '<section class="kk-child-card"><header><span class="kk-child-icon">▣</span><h4>Uploaded Valid ID</h4></header>'+
    (m.document?.exists?'<p><strong>'+escVal(m.document.name||'Valid ID')+'</strong></p><button type="button" data-view-id="'+escVal(m.id)+'">View File</button>':
    '<p class="kk-muted">No document uploaded</p>')+'</section></div>';
  }
  container.innerHTML='<div class="kk-child-heading"><span class="kk-child-avatar">'+escVal(short)+'</span>'+
   '<div class="kk-child-title"><h3>'+escVal(full)+' <span class="kk-state kk-state-'+escVal(m.status)+'">'+escVal(m.status)+'</span></h3>'+
   '<p>'+escVal(m.email)+' · KK ID: '+escVal(m.kk_id||'For verification')+'</p></div>'+
   '<div class="kk-child-points"><strong>'+escVal(m.points||0)+' pts</strong><small>Current points</small></div>'+
   '<button type="button" class="kk-child-close" data-close-member aria-label="Close member details">×</button></div>'+
   tab+details+
   (m.review_note?'<p class="kk-note">Review Note: '+escVal(m.review_note)+'</p>':'')+
   (m.status==='pending'?'<div class="kk-child-actions"><button type="button" class="primary" data-review="verified" data-id="'+escVal(m.id)+
    '">✓ Verify Profile</button><button type="button" class="secondary" data-review="rejected" data-id="'+escVal(m.id)+
    '">✕ Reject / Request Correction</button></div>':'');
 };
 const displayParticipants=()=>{
  const target=$('#kk-participant-list');if(!target)return;
  const search=String($('#kk-participant-search')?.value||'').trim().toLowerCase();
  const list=participation.filter(entry=>(entry.project_title+' '+entry.member_name).toLowerCase().includes(search));
  $('#kk-participant-total').textContent=participation.length+' registration(s) saved · '+list.length+' matching';
  target.innerHTML=list.length?list.map(r=>'<article class="kk-sitio-item"><div class="kk-sitio-label"><strong>'+
   escVal(r.project_title)+'</strong><small>'+escVal(r.member_name)+' · Joined '+
   escVal(new Date(r.joined_at).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}))+
   '</small></div><div>✓ Registered</div></article>').join(''):
   '<p class="kk-muted">Wala pang registered KK participants para sa mga proyekto.</p>';
 };
 const displayRewards=()=>{
  const container=$('#kk-staff-reward-list');
  if(container)container.innerHTML=perks.length?perks.map(p=>
   '<article class="kk-sitio-item"><div class="kk-sitio-label"><strong>'+escVal(p.title)+'</strong>'+
   '<small>'+escVal(p.description||'')+' · '+escVal(p.cost)+' points · '+(p.active?'Active':'Inactive')+
   '</small></div><div class="kk-sitio-buttons">'+
   '<button type="button" data-perk-edit="'+escVal(p.id)+'">Edit</button>'+
   '<button type="button" data-perk-toggle="'+escVal(p.id)+'">'+(p.active?'Disable':'Publish')+'</button></div></article>').join(''):
   '<p class="kk-muted">Wala pang SK-approved rewards.</p>';
  const redemptionsContainer=$('#kk-staff-redemption-list');
  if(redemptionsContainer)redemptionsContainer.innerHTML=redemptions.length?
   redemptions.map(r=>'<article class="kk-sitio-item"><div class="kk-sitio-label"><strong>'+escVal(r.name)+'</strong><small>'+
    escVal(r.perk)+' · '+escVal(r.cost)+' pts · '+escVal(r.status)+'</small></div>'+
    (r.status==='pending'?'<div class="kk-sitio-buttons"><button type="button" data-redemption="approved" data-id="'+escVal(r.id)+'">Approve</button>'+
    '<button type="button" data-redemption="rejected" data-id="'+escVal(r.id)+'">Reject</button></div>':'')+'</article>').join(''):
   '<p class="kk-muted">Wala pang redemption requests.</p>';
 };
 const displayMembers=()=>{
  const text=$('#kk-staff-search').value.trim().toLowerCase(),state=$('#kk-staff-filter').value;
  const showing=members.filter(m=>(state==='all'||m.status===state)&&
   (!text||(initials(m)+' '+m.email+' '+(m.kk_id||'')+' '+sitioName(m.profile?.sitio_id)).toLowerCase().includes(text)));
  const list=$('#kk-staff-list');
  $('#kk-applicant-count').textContent='Applicants ('+showing.length+')';
  const chosen=$('#kk-staff-order')?.value||'new';
  showing.sort((a,b)=>chosen==='name'?initials(a).localeCompare(initials(b)):
    chosen==='old'?(a.created_at||'').localeCompare(b.created_at||''):
    (b.created_at||'').localeCompare(a.created_at||''));
  list.innerHTML=showing.length?showing.map(memberCard).join(''):
   '<p class="kk-muted">Walang KK records na tumutugma sa filter.</p>';
  renderMemberDetail();
 };
 async function refresh(){
  if(loading)return;loading=true;status('Loading KK Profiling records…');
  try{
   // Separate calls avoid falsely claiming that the KK schema is missing
   // when a different, optional endpoint fails.
   const [result,sitioResult,catalog]=await Promise.all([request(''),request('sitios'),request('catalog')]);
   if(!Array.isArray(result?.members)||!Array.isArray(sitioResult?.sitios))
    throw Error('Invalid KK staff response.');
   members=result.members;sitios=sitioResult.sitios;
   perks=Array.isArray(catalog?.perks)?catalog.perks:[];
   redemptions=Array.isArray(result?.redemptions)?result.redemptions:[];
   participation=Array.isArray(result?.participation)?result.participation:[];
   stats();displayMembers();displaySitios();displayParticipants();displayRewards();
   status('Updated · '+members.length+' KK members · '+sitios.length+' official sitios.');
  }catch(e){
   status('Hindi ma-load ang KK records: '+e.message+' I-check ang staff session at kung sa tamang preview domain ka naka-login.',true);
  }finally{loading=false;}
 }
 window.loadKKStaff=refresh;
 const bind=async(button,task)=>{
  button.disabled=true;
  try{
   const result=await task();await refresh();
   if(result?.notification){
    status(result.notification.status==='provider_accepted'
     ?'SK review saved. Notification accepted by email provider (delivery to inbox is not yet confirmed).'+(result.notification.reference?' Tracking ID: '+result.notification.reference:'')
     :'SK review saved, pero hindi pa naipadala ang email. I-check ang Resend configuration at contact the member through an authorized channel.',
     result.notification.status!=='provider_accepted');
   }
  }
  catch(e){status(e.message,true);}
  finally{button.disabled=false;}
 };
 document.addEventListener('click',e=>{
  if(!e.target.closest('#panel-kk-profiling'))return;
  const target=e.target.closest('[data-open-member],[data-close-member],[data-child-tab],[data-view-id],[data-review],[data-sitio-action],[data-perk-edit],[data-perk-toggle],[data-redemption]');
  if(!target)return;
  if(target.dataset.openMember){
   selectedMemberId=target.dataset.openMember;detailTab='profile';displayMembers();
   if(matchMedia('(max-width:950px)').matches)$('#kk-staff-detail')?.scrollIntoView({behavior:'smooth',block:'start'});
   return;
  }
  if(target.hasAttribute('data-close-member')){selectedMemberId=null;displayMembers();return;}
  if(target.dataset.childTab){detailTab=target.dataset.childTab;renderMemberDetail();return;}
  if(target.dataset.viewId){
   const id=encodeURIComponent(target.dataset.viewId);
   // Same-origin authenticated document route. This URL is never publicly listed.
   window.open('./api/kk/staff/id/'+id,'_blank','noopener,noreferrer');
   return;
  }
  if(target.dataset.perkEdit){
   const perk=perks.find(item=>item.id===target.dataset.perkEdit);
   if(!perk)return;
   const form=$('#kk-perk-form');for(const key of ['id','title','cost','description'])
    form.elements[key].value=perk[key]??'';
   form.scrollIntoView({behavior:'smooth',block:'center'});
   form.elements.title.focus();return;
  }
  if(target.dataset.perkToggle){
   const perk=perks.find(item=>item.id===target.dataset.perkToggle);
   if(!perk||!confirm((perk.active?'Disable':'Publish')+' '+perk.title+'?'))return;
   bind(target,()=>request('perks',{id:perk.id,title:perk.title,cost:perk.cost,
     description:perk.description,active:!perk.active}));return;
  }
  if(target.dataset.redemption){
   const approved=target.dataset.redemption==='approved';
   const note=prompt(approved?'Optional redemption approval note:':'Reason for rejecting this redemption:','');
   if(note===null||!confirm((approved?'Approve':'Reject')+' redemption request?'))return;
   bind(target,()=>request('redemption',{id:target.dataset.id,status:target.dataset.redemption,note}));return;
  }
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
 $('#kk-perk-form')?.addEventListener('submit',e=>{
  e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
  const v=Object.fromEntries(new FormData(form)),btn=form.querySelector('[type=submit]');
  bind(btn,async()=>{
   await request('perks',{id:v.id||null,title:v.title.trim(),
     description:v.description.trim(),cost:Number(v.cost),active:true});
   form.reset();
  });
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
 $('#kk-participant-search')?.addEventListener('input',displayParticipants);
 $('#kk-staff-search')?.addEventListener('input',displayMembers);
 $('#kk-staff-filter')?.addEventListener('change',displayMembers);
 $('#kk-staff-order')?.addEventListener('change',displayMembers);
 $('#kk-staff-refresh')?.addEventListener('click',refresh);
})();
