'use strict';
(() => {
 const $=selector=>document.querySelector(selector);
 const escVal=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const request=(path,body)=>api('./api/kk/staff'+(path?'/'+path:''),body?{method:'POST',body:JSON.stringify(body)}:{});
 let members=[],sitios=[],perks=[],redemptions=[],participation=[];
 let loading=false, selectedMemberId=null, detailTab='profile', pendingDeleteMemberId=null;
 const status=(message='',error=false,success=false)=>{const target=$('#kk-staff-message');if(!target)return;if(message&&(error||success)){target.textContent='';window.showVasraToast(message,error?'error':'success');return;}target.textContent=message;target.dataset.kind='info';};
 const initials=m=>[m.first_name,m.middle_name,m.last_name].filter(Boolean).join(' ');
 // Parse YYYY-MM-DD as a calendar date. Date.parse() UTC conversion can make
 // birthdays inaccurate near midnight; compare against today's Manila date.
 const memberAge=birthdate=>{
  if(typeof birthdate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birthdate))return null;
  const [year,month,day]=birthdate.split('-').map(Number);
  const birthday=new Date(Date.UTC(year,month-1,day));
  if(birthday.getUTCFullYear()!==year||birthday.getUTCMonth()+1!==month||birthday.getUTCDate()!==day)return null;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'})
   .formatToParts(new Date());
  const now=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const age=now.year-year-(now.month<month||(now.month===month&&now.day<day)?1:0);
  return age>=0&&age<=120?age:null;
 };
 const nameWithAge=m=>{
  const age=memberAge(m.birthdate);
  return initials(m)+(age===null?'':' ('+age+')');
 };
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
 const svgIcon=name=>{
  const shapes={
   person:'<circle cx="12" cy="7" r="3.4"/><path d="M5 21v-2.5a7 7 0 0 1 14 0V21"/>',
   pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.4"/>',
   school:'<path d="m2 10 10-6 10 6-10 6-10-6Z"/><path d="M6 13v5c3 2 9 2 12 0v-5M22 10v7"/>',
   note:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
   phone:'<path d="M7 3h3l2 5-2 2a14 14 0 0 0 4 4l2-2 5 2v3a3 3 0 0 1-3 3C10 20 4 14 4 6a3 3 0 0 1 3-3Z"/>',
   document:'<path d="M5 2h9l5 5v15H5z"/><path d="M14 2v6h5M8 13h8M8 17h6"/>',
   clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
   shield:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
   trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[name]||shapes.note)+'</svg>';
 };
 const detailPairs=entries=>'<dl class="kk-child-pairs">'+entries.map(([key,value,kind])=>
  '<div><dt>'+escVal(key)+'</dt><dd>'+escVal(pretty(value,kind))+'</dd></div>').join('')+'</dl>';
 const detailCard=(heading,icon,entries,section)=>
  '<section class="kk-child-card"><header><span class="kk-child-icon" aria-hidden="true">'+svgIcon(icon)+'</span><h4>'+
  escVal(heading)+'</h4>'+(section?'<button type="button" class="kk-card-edit" data-edit-section="'+escVal(section)+'" aria-label="Edit '+escVal(heading)+'">Edit</button>':'')+
  '</header>'+detailPairs(entries)+'</section>';
 const yesNoRow=(label,value)=>{
  const selected=pretty(value,'yesno');
  return '<div class="kk-binary-row"><span class="kk-binary-label">'+escVal(label)+'</span><span class="kk-binary-values" aria-label="'+escVal(label)+': '+escVal(selected==='—'?'Not provided':selected)+'">'+
   '<span class="kk-choice'+(selected==='Yes'?' selected':'')+'">Yes</span>'+
   '<span class="kk-choice'+(selected==='No'?' selected':'')+'">No</span></span></div>';
 };
 const verifiedIdCard=m=>{
  const doc=m.document;
  const image=doc?.exists&&(doc.mime==='image/jpeg'||doc.mime==='image/png'||/\.(jpg|jpeg|png)$/i.test(doc.name||''));
  return '<section class="kk-child-card kk-validid-card"><header><span class="kk-child-icon" aria-hidden="true">'+svgIcon('document')+'</span><h4>Uploaded Valid ID</h4></header>'+
   (doc?.exists?'<div class="kk-document-summary">'+
    '<div class="kk-document-thumbnail" aria-label="Private uploaded ID document">'+
    (image?'<img loading="lazy" src="./api/kk/staff/id/'+encodeURIComponent(m.id)+'/preview" alt="Protected thumbnail of uploaded Valid ID">':svgIcon('shield'))+'</div>'+
    '<div class="kk-document-info"><strong>'+escVal(doc.name||'Submitted Valid ID')+'</strong>'+
    '<small>Uploaded: '+escVal(doc.uploaded_at?new Date(doc.uploaded_at).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}):'Date not provided')+'</small>'+
    '<small>Secured file · staff-only access</small></div>'+
    '<button type="button" data-view-id="'+escVal(m.id)+'" aria-label="View secured valid ID for '+escVal(initials(m))+'">'+svgIcon('document')+' View File</button></div>':
    '<p class="kk-muted">No document uploaded. Identity proof must be reviewed before verification, if required.</p>')+'</section>';
 };

 // A child edit view overlays only the selected applicant detail (parent stays
 // mounted). This preserves the active selection, original section/tab and sidebar.
 const editSchema={
  personal:[['gender','Gender','select',['male','female','lesbian','gay','bisexual','transgender','queer','other','undisclosed']],
   ['civil_status','Civil Status','select',['single','married','divorced','widowed','separated','other']],
   ['solo_parent','Solo Parent','select',['yes','no','undisclosed']],
   ['family_count','Family Members','number'],['religion','Religion','text'],['siblings','Siblings','number']],
  address:[['residence_region','Region','text'],['residence_city','City','text'],
   ['residence_province','Province','text'],['residence_barangay','Barangay','text'],
   ['sitio_id','Sitio / Purok','sitio'],['street','House No. / Street','text'],['address_line_2','Address Line 2','text']],
  education:[['education','Educational Attainment','text'],['school_name','School','text'],
   ['year_level','Year Level','text'],['employment','Employment Status','text'],
   ['education_status','Educational Status','text'],['course_program','Course / Program','text']],
  additional:[['sk_voter','Are you a Registered SK Voter?','yesno'],['national_voter','Registered National Voter?','yesno'],
   ['voted_last_election','Did You Vote Last Election?','yesno'],['kk_assembly','Have you already attended a KK Assembly?','yesno'],
   ['interests','Skills / Interests','text']],
  emergency:[['emergency_name','Contact Person','text'],['emergency_phone','Contact Number','tel'],
   ['emergency_relation','Relationship','text']]
 };
 const editLabels={personal:'Personal Information',address:'Address',education:'Education',
  additional:'Additional Information',emergency:'Emergency Contact'};
 let editingSection=null;
 const editField=([key,label,type,options],data)=>{
  const val=String(data[key]??(key==='sk_voter'?data.voter??'':''));
  let field='';
  if(type==='select'||type==='yesno'||type==='sitio'){
   const choices=type==='yesno'?[['yes','Yes'],['no','No']]:type==='sitio'?
    [['','Select Sitio / Purok'],...sitios.map(o=>[o.id,o.name])]:
    [['','Select…'],...options.map(v=>[v,pretty(v)])];
   field='<select name="'+escVal(key)+'"'+(type==='yesno'?' required':'')+'>'+
    (type==='yesno'?'<option value="">Select Yes or No</option>':'')+
    choices.map(([v,t])=>'<option value="'+escVal(v)+'"'+(v===val?' selected':'')+'>'+escVal(t)+'</option>').join('')+'</select>';
  }else if(type==='tel'){
   const digits=String(val).replace(/[^0-9]/g,'');
   const local=digits.startsWith('63')?digits.slice(2):digits.startsWith('0')?digits.slice(1):digits;
   field='<span class="kk-ph-number"><span class="kk-ph-prefix">+63</span>'+
    '<input name="'+escVal(key)+'" data-ph-mobile type="tel" inputmode="numeric" minlength="10" maxlength="10"'+
    ' pattern="9[0-9]{9}" value="'+escVal(local)+'" placeholder="9XXXXXXXXX" required></span>';
  }else field='<input name="'+escVal(key)+'" type="'+(type==='number'?'number':'text')+
   '" maxlength="160"'+(type==='number'?' min="'+(key==='family_count'?1:0)+'" max="99"':'')+
   ' value="'+escVal(val)+'" autocomplete="off">';
  return '<label class="kk-edit-field"><span>'+escVal(label)+'</span>'+field+'</label>';
 };
 const openChildEditor=section=>{
  const m=selectedMember(),fields=editSchema[section];
  if(!m||!fields)return;
  editingSection=section;
  const area=$('#kk-staff-detail');
  area.querySelector('.kk-child-edit-view')?.remove();
  const child=document.createElement('div');child.className='kk-child-edit-view';
  child.setAttribute('role','region');child.setAttribute('aria-label','Edit '+editLabels[section]);
  const hint=section==='personal'?'Official name and birthdate are kept read-only for identity protection. Other details can be corrected with an audit trail.':
   'Changes are saved to the official KK record with an audit entry. Confirm the information before saving.';
  child.innerHTML='<div class="kk-edit-heading"><button type="button" class="kk-edit-back" data-cancel-edit aria-label="Back to applicant">← Back to Profile</button>'+
   '<span class="kk-tag">KK PROFILE · EDIT DETAILS</span><h3>Edit '+escVal(editLabels[section])+'</h3>'+
   '<p>'+escVal(initials(m))+' · '+escVal(m.kk_id||'For verification')+'</p></div>'+
   '<form class="kk-child-edit-form" id="kk-child-edit-form"><p class="kk-edit-help">'+escVal(hint)+'</p>'+
   '<div class="kk-edit-fields">'+fields.map(f=>editField(f,m.profile||{})).join('')+'</div>'+
   '<p class="kk-edit-response" role="status" aria-live="polite"></p>'+
   '<div class="kk-edit-actions"><button type="button" class="secondary" data-cancel-edit>Cancel</button>'+
   '<button type="submit" class="primary">Save Changes</button></div></form>';
  area.append(child);
  area.classList.add('kk-editing-child');
  area.scrollTop=0;
  child.querySelector('[data-cancel-edit]')?.focus();
 };
 const closeChildEditor=()=>{
  editingSection=null;
  const area=$('#kk-staff-detail');
  area?.classList.remove('kk-editing-child');
  area?.querySelector('.kk-child-edit-view')?.remove();
  area?.querySelector('[data-edit-section]')?.focus();
 };
 const selectedMember=()=>members.find(m=>m.id===selectedMemberId);
 const memberCard=m=>{
   const full=nameWithAge(m),active=m.id===selectedMemberId;
   return '<button type="button" class="kk-applicant-row'+(active?' active':'')+'" data-open-member="'+escVal(m.id)+
    '" aria-pressed="'+String(active)+'"><span class="kk-applicant-avatar">'+escVal((m.first_name||'?')[0]+(m.last_name||'?')[0])+
    '</span><span class="kk-applicant-main"><strong>'+escVal(full)+'</strong><small>'+escVal(m.email)+
    '</small><small>KK ID: '+escVal(m.kk_id||'For verification')+' · '+escVal(m.birthdate||'—')+
    ' · '+escVal(m.profile?.residence_city||'Not provided')+'</small></span><span class="kk-applicant-meta">'+
    '<span class="kk-state kk-state-'+escVal(m.status)+'">'+escVal(m.status)+'</span><b>'+
    escVal(m.points||0)+' pts</b></span><span class="kk-row-arrow" aria-hidden="true">›</span></button>';
 };
 const renderMemberDetail=()=>{
  const container=$('#kk-staff-detail');
  if(!container)return;
  const m=selectedMember();
  if(!m){container.innerHTML='<div class="kk-child-empty"><strong>Select an applicant</strong><p>Pumili ng pangalan sa kaliwa para makita ang personal details at SK verification status.</p></div>';return;}
  const p=m.profile||{},full=nameWithAge(m),short=(m.first_name||'?')[0]+(m.last_name||'?')[0];
  const tab='<div class="kk-child-tabs" role="tablist" aria-label="Applicant details">'+
   [['profile','Profile Details','person'],['history','Activity Log','clock'],['documents','Documents','document']].map(([value,label,icon])=>
    '<button type="button" role="tab" data-child-tab="'+value+'" aria-selected="'+String(detailTab===value)+'">'+svgIcon(icon)+
    '<span>'+label+'</span></button>').join('')+
   (['chairman','sk'].includes(window.kkStaffRole)?'<button type="button" class="kk-delete-tab" data-delete-profile aria-label="Delete KK Profile">'+svgIcon('trash')+
    '<span>Delete KK Profile</span></button>':'')+'</div>';
  let details='';
  if(detailTab==='documents'){
   details='<section class="kk-document-workspace" aria-label="KK applicant documents">'+
    '<div class="kk-document-intro"><h4>Uploaded Valid ID</h4><p>Secure full-size view for authorized SK staff only. Huwag i-share ang dokumento.</p></div>'+
    verifiedIdCard(m)+(m.document?.exists?'<div class="kk-document-inline-viewer">'+
    '<div class="kk-document-preview-toolbar"><strong>Private Document Preview</strong><div>'+
    '<button type="button" data-view-id="'+escVal(m.id)+'">Open Full View</button>'+
    '<a href="./api/kk/staff/id/'+encodeURIComponent(m.id)+'" download>Download File</a></div></div>'+
    (m.document.mime==='application/pdf'?
      '<iframe title="Full size uploaded Valid ID PDF" loading="lazy" src="./api/kk/staff/id/'+encodeURIComponent(m.id)+'/preview"></iframe>':
      '<img class="kk-validid-full-image" alt="Full uploaded valid ID for '+escVal(initials(m))+'" loading="lazy" src="./api/kk/staff/id/'+encodeURIComponent(m.id)+'/preview">')+
    '<p class="kk-document-error" hidden>Hindi na-load ang preview. Subukan ang Open Full View o Download File.</p>'+
    '</div>':'')+'</section>';
  }else if(detailTab==='history'){
   details='<section class="kk-child-card"><header><span class="kk-child-icon">'+svgIcon('clock')+'</span><h4>Review Activity</h4></header><p class="kk-muted">'+
    (m.status==='rejected'?'For correction · '+escVal(m.review_note||'No explanation'):
    m.status==='verified'?'SK verification approved.':'Application status: '+escVal(m.status))+'</p>'+
    '<p class="kk-muted">Detailed entries remain in the authorized staff Activity Log workspace. No activity is invented.</p></section>';
  }else{
   details='<div class="kk-child-grid">'+
    detailCard('Personal Information','person',[
     ['Full Name',initials(m)],['Date of Birth',m.birthdate],['Gender',p.gender],['Civil Status',p.civil_status],
     ['Solo Parent',p.solo_parent,'yesno'],['Family Members',p.family_count],['Religion',p.religion],['Siblings',p.siblings]],'personal')+
    detailCard('Address','pin',[
     ['Region',p.residence_region],['City',p.residence_city],
     ['Barangay',p.residence_barangay],['Sitio/Purok',p.sitio_id?sitioName(p.sitio_id):null],
     ['House No./Street',p.street],['Province',p.residence_province],['Address Line 2',p.address_line_2]],'address')+
    detailCard('Education','school',[
     ['Educational Attainment',p.education],['School',p.school_name],
     ['Year Level',p.year_level],['Employment Status',p.employment],
     ['Educational Status',p.education_status],['Course / Program',p.course_program]],'education')+
    '<section class="kk-child-card kk-binary-card"><header><span class="kk-child-icon" aria-hidden="true">'+svgIcon('note')+
    '</span><h4>Additional Information</h4><button type="button" class="kk-card-edit" data-edit-section="additional">Edit</button></header>'+
    yesNoRow('Are you a Registered SK Voter?',p.sk_voter||p.voter)+
    yesNoRow('Registered National Voter?',p.national_voter)+
    yesNoRow('Did You Vote Last Election?',p.voted_last_election)+
    yesNoRow('Have you already attended a KK Assembly?',p.kk_assembly)+
    (p.interests?'<p class="kk-binary-interests"><strong>Skills / Interests:</strong> '+escVal(p.interests)+'</p>':'')+
    '</section>'+
    detailCard('Emergency Contact','phone',[
     ['Contact Person',p.emergency_name],['Contact Number',p.emergency_phone],['Relationship',p.emergency_relation]],'emergency')+
    verifiedIdCard(m)+'</div>';
  }
  container.innerHTML='<div class="kk-child-heading"><span class="kk-child-avatar">'+escVal(short)+'</span>'+
   '<div class="kk-child-title"><h3>'+escVal(full)+' <span class="kk-state kk-state-'+escVal(m.status)+'">'+escVal(m.status)+'</span></h3>'+
   '<p>'+escVal(m.email)+' <span aria-hidden="true"> · </span> KK ID: '+escVal(m.kk_id||'For verification')+'</p></div>'+
   '<div class="kk-child-points"><strong>'+escVal(m.points||0)+' pts</strong><small>Current Points</small></div>'+
   '<button type="button" class="kk-child-close" data-close-member aria-label="Close member details">×</button></div>'+
   tab+details+
   (m.review_note?'<p class="kk-note">Review Note: '+escVal(m.review_note)+'</p>':'')+
   (m.status==='pending'?'<div class="kk-child-actions"><button type="button" class="primary" data-review="verified" data-id="'+escVal(m.id)+
    '">'+svgIcon('shield')+' Verify Profile</button><button type="button" class="secondary" data-review="rejected" data-id="'+escVal(m.id)+
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
  const createdKey=m=>Date.parse(m.created_at||m.submitted_at||m.updated_at||'1970-01-01T00:00:00Z')||0;
  showing.sort((a,b)=>{
   if(chosen==='name')return initials(a).localeCompare(initials(b))||String(a.id).localeCompare(String(b.id));
   const delta=createdKey(a)-createdKey(b);
   return (chosen==='old'?delta:-delta)||String(a.id).localeCompare(String(b.id));
  });
  if(!selectedMemberId&&showing.length)selectedMemberId=showing[0].id;
  if(selectedMemberId&&!showing.some(m=>m.id===selectedMemberId))selectedMemberId=showing[0]?.id||null;
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
   if(result?.deletion)status(result.storage_cleanup_pending
    ?'KK profile deleted; private ID file still requires storage cleanup.'
    :'KK profile deleted, session revoked, related KK records removed and audit saved.',!!result.storage_cleanup_pending,true);
   if(result?.notification){
    status(result.notification.status==='provider_accepted'
     ?'SK review saved. Notification accepted by email provider (delivery to inbox is not yet confirmed).'+(result.notification.reference?' Tracking ID: '+result.notification.reference:'')
     :'SK review saved, pero hindi pa naipadala ang email. I-check ang Resend configuration at contact the member through an authorized channel.',
     result.notification.status!=='provider_accepted',true);
   }
  }
  catch(e){status(e.message,true);}
  finally{button.disabled=false;}
 };
 document.addEventListener('click',e=>{
  if(!e.target.closest('#panel-kk-profiling'))return;
  const target=e.target.closest('[data-open-member],[data-close-member],[data-child-tab],[data-view-id],[data-delete-profile],[data-review],[data-sitio-action],[data-perk-edit],[data-perk-toggle],[data-redemption],[data-edit-section],[data-cancel-edit]');
  if(!target)return;
  if(target.dataset.cancelEdit!==undefined){closeChildEditor();return;}
  if(target.dataset.editSection){openChildEditor(target.dataset.editSection);return;}
  if(target.dataset.openMember){
   selectedMemberId=target.dataset.openMember;detailTab='profile';displayMembers();
   if(matchMedia('(max-width:950px)').matches)$('#kk-staff-detail')?.scrollIntoView({behavior:'smooth',block:'start'});
   return;
  }
  if(target.hasAttribute('data-close-member')){selectedMemberId=null;displayMembers();return;}
  if(target.dataset.childTab){detailTab=target.dataset.childTab;renderMemberDetail();return;}
  if(target.hasAttribute('data-delete-profile')){
   const member=selectedMember();
   if(!member||!['chairman','sk'].includes(window.kkStaffRole))return;
   const dialog=$('#kk-delete-dialog'),form=$('#kk-delete-confirm-form');
   pendingDeleteMemberId=member.id;
   form.reset();
   $('#kk-delete-target-name').textContent=initials(member);
   $('#kk-delete-target-id').textContent='KK ID: '+(member.kk_id||'For verification')+
      ' · '+member.id.slice(0,8);
   $('#kk-delete-challenge').value='DELETE KK '+member.id.slice(0,8).toUpperCase();
   $('#kk-delete-dialog-status').textContent='';
   $('#kk-delete-submit').disabled=true;
   if(typeof dialog.showModal==='function')dialog.showModal();
   return;
  }
  if(target.dataset.viewId){
   const id=encodeURIComponent(target.dataset.viewId);
   // Same-origin authenticated document route. This URL is never publicly listed.
   window.open('./api/kk/staff/id/'+id+'/preview','_blank','noopener,noreferrer');
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
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='kk-child-edit-form')return;
  e.preventDefault();
  const form=e.target,m=selectedMember(),section=editingSection;
  if(!m||!section||!form.reportValidity())return;
  const changes=Object.fromEntries(new FormData(form));
  if(changes.emergency_phone){
   if(!/^9[0-9]{9}$/.test(changes.emergency_phone))return;
   changes.emergency_phone='+63'+changes.emergency_phone;
  }
  const button=form.querySelector('[type=submit]'),response=form.querySelector('.kk-edit-response');
  button.disabled=true;response.textContent='Saving verified staff changes…';
  try{
   const data=await request('profile-edit',{id:m.id,section,changes});
   if(data?.ok!==true)throw Error('Hindi na-save ang profile.');
   // Keep the same selected applicant and tab, reload from the database.
   closeChildEditor();
   await refresh();
   status('Profile updated by SK staff. Changes recorded in Activity Log.',false,true);
  }catch(error){response.textContent='Hindi na-save: '+String(error.message||'Unknown error');}
  finally{button.disabled=false;}
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
 document.addEventListener('error',e=>{
  if(e.target.matches('#kk-staff-detail .kk-validid-full-image')){
   e.target.hidden=true;
   e.target.closest('.kk-document-inline-viewer')?.querySelector('.kk-document-error')?.removeAttribute('hidden');
  }
 },true);
 const deleteDialog=$('#kk-delete-dialog');
 const validateDelete=()=>{
  const member=members.find(m=>m.id===pendingDeleteMemberId),confirmBtn=$('#kk-delete-submit');
  if(!member||!confirmBtn)return;
  confirmBtn.disabled=$('#kk-delete-confirm-code').value.trim()!==$('#kk-delete-challenge').value||
   $('#kk-delete-confirm-name').value.trim()!==initials(member)||
   !$('#kk-delete-acknowledge').checked;
 };
 for(const id of ['kk-delete-confirm-code','kk-delete-confirm-name','kk-delete-acknowledge'])
  $('#'+id)?.addEventListener('input',validateDelete);
 $('#kk-delete-cancel')?.addEventListener('click',()=>deleteDialog.close());
 $('#kk-delete-copy')?.addEventListener('click',async()=>{
  const input=$('#kk-delete-challenge'),notice=$('#kk-delete-dialog-status');
  try{await navigator.clipboard.writeText(input.value);notice.textContent='Code copied. Paste it in Step 2.';}
  catch{input.focus();input.select();notice.textContent='Select the code, press Ctrl+C, then paste in Step 2.';}
 });
 deleteDialog?.addEventListener('close',()=>{pendingDeleteMemberId=null;$('#kk-delete-dialog-status').textContent='';});
 $('#kk-delete-confirm-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  validateDelete();
  const target=$('#kk-delete-submit'),member=members.find(m=>m.id===pendingDeleteMemberId);
  if(!member||target.disabled)return;
  if(!confirm('Final confirmation: Permanently delete '+initials(member)+' and their KK account, points, requests and ID?'))return;
  target.disabled=true;
  $('#kk-delete-dialog-status').textContent='Securely deleting the selected KK record…';
  try{
   const result=await request('profile-delete',{
    id:member.id,confirm_name:initials(member),confirm_code:$('#kk-delete-confirm-code').value.trim()
   });
   if(result?.ok!==true)throw Error('Deletion was not confirmed by the server.');
   deleteDialog.close();
   selectedMemberId=null;detailTab='profile';editingSection=null;
   await refresh();
   status(result.storage_cleanup_pending
    ?'KK profile deleted. Private ID file cleanup is still pending.'
    :'Duplicate KK profile deleted with audit trail and related data removed.',!!result.storage_cleanup_pending);
  }catch(error){
   $('#kk-delete-dialog-status').textContent='Hindi nabura ang account: '+String(error.message||'Unknown error');
  }finally{validateDelete();}
 });
 $('#kk-staff-order')?.addEventListener('change',displayMembers);
 $('#kk-staff-refresh')?.addEventListener('click',refresh);
})();
