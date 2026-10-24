'use strict';
(async()=>{
 const view=document.body.dataset.view;
 const $=s=>document.querySelector(s);
 const feedback=(message,kind='info')=>{const el=$('#kk-feedback');if(!el)return;el.textContent=message;el.dataset.kind=kind;el.hidden=!message;};
 const busy=(form,on)=>{const btn=form.querySelector('[type="submit"]');if(btn){btn.disabled=on;btn.setAttribute('aria-busy',String(on));}};
 const getApi=async path=>api('./api/kk/'+path);
 const send=async(path,data)=>api('./api/kk/'+path,{method:'POST',body:JSON.stringify(data)});
 if(view==='login'){
  const google=$('#kk-google-login'),note=$('#kk-google-note');
  try{
   const status=await getApi('google/status');
   if(status.enabled===true){google.href='./api/kk/google/start';google.classList.remove('disabled');google.setAttribute('aria-disabled','false');note.textContent='Google account login is available for KK members.';}
   else note.textContent='Google Sign-In needs a dedicated youth OAuth configuration. Email/password login works independently.';
  }catch{note.textContent='Hindi ma-check ang Google Sign-In ngayon. Gamitin muna ang email/password.';}
  const query=new URLSearchParams(location.search);
  if(query.get('google_error'))feedback(query.get('google_error')==='link_required'?'May existing password account sa email na ito. Mag-login gamit ang password; hindi awtomatikong ili-link ang Google.':'Hindi natuloy ang Google Sign-In.','error');
  const form=$('#kk-login-form');
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!form.reportValidity())return;
   busy(form,true);feedback('Verifying your KK account…');
   try{
    const b=await send('login',{email:form.email.value.trim(),password:form.password.value});
    if(b.ok)location.assign('./kk-profile');
   }catch(err){feedback(err.message,'error');}finally{busy(form,false);}
  });
 }
 if(view==='register'){
  const form=$('#kk-registration-form');
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!form.reportValidity())return;
   const f=Object.fromEntries(new FormData(form));
   if(f.email.trim().toLowerCase()!==f.confirm_email.trim().toLowerCase())return feedback('Hindi magkatugma ang email at confirm email.','error');
   if(f.password!==f.confirm_password)return feedback('Hindi magkatugma ang password.','error');
   const data={...f,email:f.email.trim().toLowerCase(),confirm_email:f.confirm_email.trim().toLowerCase(),agree:form.agree.checked,confirm_email_correct:form.confirm_email_correct.checked};
   busy(form,true);feedback('Creating your protected KK account…');
   try{const r=await send('register',data);if(r.ok)location.assign('./kk-profile');}
   catch(err){feedback(err.message,'error');}finally{busy(form,false);}
  });
 }
 if(view!=='profile')return;
 const loading=$('#kk-loading'),content=$('#kk-content');
 let account=null,profile={},data={},current=1,sitios=[];
 const titles=['Personal Information','Education','Additional Information','Emergency Contact','Review & Submit'];
 const field=(name,label,opt={})=>{
  const value=data[name]??'',req=opt.required?' required':'';
  if(opt.select){
   return '<label>'+esc(label)+(opt.required?' *':'')+'<select name="'+name+'"'+req+'><option value="">Pumili…</option>'+
    opt.select.map(v=>{const [val,text]=Array.isArray(v)?v:[v,v];return '<option value="'+esc(val)+'"'+(value===val?' selected':'')+'>'+esc(text)+'</option>';}).join('')+'</select></label>';
  }
  const type=opt.type||'text';
  return '<label>'+esc(label)+(opt.required?' *':'')+'<input name="'+name+'" type="'+type+'" maxlength="'+(opt.max||150)+'" placeholder="'+esc(opt.placeholder||'')+'" value="'+esc(value)+'"'+req+'></label>';
 };
 const sitioSelect=()=>{
  const current=String(data.sitio_id||'');
  const selectedExists=sitios.some(x=>String(x.id)===current);
  return '<label>Sitio / Purok *<select name="sitio_id" required>'+
   '<option value="">'+(sitios.length?'Piliin ang inyong Sitio / Purok':'Wala pang sitio na nilagay ang SK')+'</option>'+
   sitios.map(s=>'<option value="'+esc(s.id)+'"'+(current===String(s.id)?' selected':'')+'>'+esc(s.name)+'</option>').join('')+
   (!selectedExists&&current?'<option value="'+esc(current)+'" selected disabled>Hindi na available ang dating sitio — makipag-ugnay sa SK</option>':'')+
   '</select></label>';
 };
 const options={
  civil:[['single','Single'],['married','Married'],['other','Other / prefer not to say']],
  gender:[['male','Male'],['female','Female'],['other','Other'],['undisclosed','Prefer not to say']],
  solo:[['no','No'],['yes','Yes'],['undisclosed','Prefer not to say']],
  edu:[['no-formal','No Formal Schooling'],['elementary','Elementary'],['junior-high','Junior High School'],['senior-high','Senior High School'],['als','Alternative Learning System (ALS)'],['vocational','TVET / Vocational'],['college','College / Undergraduate'],['graduate','Postgraduate (Masteral / Doctoral)'],['out-of-school','Out-of-School Youth']],
  employment:[['student','Student'],['employed','Employed'],['self-employed','Self-employed'],['unemployed','Unemployed'],['other','Other']],
  voter:[['yes','Yes'],['no','No'],['unsure','Not sure']]
 };
 // DepEd school grades; college/postgraduate durations vary by degree program.
 const yearLevelOptions={
  'no-formal':[['na','Not Applicable']],
  elementary:[['grade-1','Grade 1'],['grade-2','Grade 2'],['grade-3','Grade 3'],['grade-4','Grade 4'],['grade-5','Grade 5'],['grade-6','Grade 6'],['completed','Elementary Graduate / Completed']],
  'junior-high':[['grade-7','Grade 7'],['grade-8','Grade 8'],['grade-9','Grade 9'],['grade-10','Grade 10'],['completed','Junior High Graduate / Completed']],
  'senior-high':[['grade-11','Grade 11'],['grade-12','Grade 12'],['completed','Senior High Graduate / Completed']],
  als:[['elementary','ALS Elementary'],['junior-high','ALS Junior High'],['senior-high','ALS Senior High'],['completed','ALS Completed']],
  vocational:[['level-1','1st Year / Level 1'],['level-2','2nd Year / Level 2'],['level-3','3rd Year / Level 3'],['completed','NC / TVET Completed']],
  college:[['year-1','1st Year College'],['year-2','2nd Year College'],['year-3','3rd Year College'],['year-4','4th Year College'],['year-5','5th Year College'],['year-6','6th Year (when applicable)'],['completed','College Graduate / Completed']],
  graduate:[['master-1','Masteral 1st Year'],['master-2','Masteral 2nd Year'],['doctorate-1','Doctoral 1st Year'],['doctorate-2','Doctoral 2nd Year'],['doctorate-3','Doctoral 3rd Year or Higher'],['completed','Postgraduate Completed']],
  'out-of-school':[['na','Not Currently Enrolled']]
 };
 const values=(container)=>Object.fromEntries(new FormData(container));
 const showPerks=()=>{
  const el=$('#kk-perks-list'),records=Array.isArray(account.perks)?account.perks:[];
  el.innerHTML=records.length?records.map(perk=>'<article class="kk-perk"><h3>'+esc(perk.title)+'</h3><p>'+esc(perk.description||'')+'</p><strong>'+esc(perk.cost)+' points</strong><button type="button" class="kk-btn" data-perk="'+esc(perk.id)+'"'+(profile.status!=='verified'||Number(account.points)<Number(perk.cost)?' disabled':'')+'>Request redemption</button></article>').join(''):'<p class="kk-helper">Wala pang active perks na inilathala ng SK Vasra. Mananatili ang iyong points balance.</p>';
  $('#kk-redemptions').innerHTML=(account.redemptions||[]).map(r=>'<p class="kk-helper">'+esc(r.perk)+' · '+esc(r.cost)+' points · <b>'+esc(r.status)+'</b></p>').join('')||'<p class="kk-helper">Wala pang redemption requests.</p>';
  el.querySelectorAll('[data-perk]').forEach(btn=>btn.onclick=async()=>{
   if(!confirm('I-request ang perk na ito? Ire-review muna ito ng SK officer.'))return;
   btn.disabled=true;
   try{await send('redeem',{id:btn.dataset.perk});await load();}catch(e){alert(e.message);btn.disabled=false;}
  });
 };
 const render=()=>{
  $('#kk-status').textContent=(profile.status||'draft').toUpperCase();
  $('#kk-id').textContent=profile.kk_id||'After verification';
  $('#kk-points').textContent=String(account.points||0);
  const review=$('#kk-review-note');review.hidden=!profile.review_note;
  if(profile.review_note){review.textContent=profile.review_note;review.dataset.kind=profile.status==='rejected'?'error':'info';}
  showPerks();
  const edit=profile.status!=='pending'&&profile.status!=='verified';
  $('#kk-profile-area').hidden=!edit;
  if(edit)renderStep();
 };
 const savedFields=(form)=>{
  for(const [name,value] of new FormData(form)){
   if(name==='consent'||name==='guardian_consent')continue;
   data[name]=String(value);
  }
  if(current===5){data.consent=!!form.querySelector('[name="consent"]')?.checked;data.guardian_consent=!!form.querySelector('[name="guardian_consent"]')?.checked;}
 };
 const stepBody=()=>{
  if(!account.member.first_name||!account.member.birthdate){
   current=0;$('#kk-step-label').textContent='GOOGLE ACCOUNT SETUP';$('#kk-step-title').textContent='Complete your registration';
   return '<p class="kk-helper">Ilagay muna ang iyong personal identity. Hindi ito kinukuha mula sa public Google profile.</p><div class="kk-form-fields">'+
    field('first_name','First Name',{required:true})+field('middle_name','Middle Name (Optional)')+
    field('last_name','Last Name',{required:true})+field('birthdate','Birthdate',{type:'date',required:true})+
    field('phone','Phone Number',{required:true,placeholder:'+639XXXXXXXXX'})+'</div>';
  }
  $('#kk-step-label').textContent='STEP '+current+' OF 5';
  $('#kk-step-title').textContent=titles[current-1];
  if(current===1)return '<div class="kk-form-fields">'+
   field('religion','Religion (Optional)')+field('civil_status','Civil Status',{select:options.civil})+
   field('gender','Gender (Optional)',{select:options.gender})+field('solo_parent','Solo parent?',{select:options.solo})+
   field('family_count','Number of family members',{type:'number'})+field('siblings','Number of siblings',{type:'number'})+
   field('region','Region',{select:[['NCR','National Capital Region (NCR)']],required:true})+
   field('province','Province / Area',{select:[['N/A (NCR)','Not Applicable — Metro Manila (NCR)']],required:true})+
   field('city','City / Municipality',{select:[['Quezon City','Quezon City']],required:true})+
   field('barangay','Barangay',{select:[['Vasra','Barangay Vasra']],required:true})+
   sitioSelect()+
   field('street','Street / House Number (Optional)',{placeholder:'Address detail, kung mayroon'})+
   '</div><p class="kk-helper">Sensitibong personal details ay para lamang sa authorized SK validation.</p>';
  if(current===2)return '<div class="kk-form-fields">'+
   field('education','Educational Level',{select:options.edu,required:true})+
   field('year_level','Year / Grade Level',{select:yearLevelOptions[data.education]||[],required:true})+
   field('school_name','School / Institution (Optional)')+'</div>'+
   '<p class="kk-helper">Piliin ang Educational Level muna; ang Year / Grade Level dropdown ay aayon sa napili. Para sa mga graduate, piliin ang Completed.</p>';
  if(current===3)return '<div class="kk-form-fields">'+field('employment','Occupation / Status',{select:options.employment})+
   field('voter','Registered voter? (Optional)',{select:options.voter})+
   field('interests','Interests / skills / youth organization (Optional)')+'</div>';
  if(current===4)return '<div class="kk-form-fields">'+
   field('emergency_name','Emergency contact full name',{required:true})+
   field('emergency_phone','Emergency contact number',{required:true,placeholder:'+639XXXXXXXXX'})+
   field('emergency_relation','Relationship',{required:true})+'</div>'+
   '<p class="kk-helper">Ito ay gagamitin lamang sa naaangkop na emergency at hindi ilalathala.</p>';
  const items=[['Full Name',[account.member.first_name,account.member.middle_name,account.member.last_name].filter(Boolean).join(' ')],['Birthdate',account.member.birthdate],
   ['Email',account.member.email],['Barangay','Barangay Vasra'],['Sitio / Purok',sitios.find(s=>String(s.id)===String(data.sitio_id))?.name||'—'],['Street',data.street||'—'],['Education',data.education||'—'],['Year / Grade Level',data.year_level||'—'],
   ['Emergency Contact',data.emergency_name||'—']];
  const age=(()=>{const now=new Date(),bd=new Date(account.member.birthdate+'T00:00:00Z');return now.getUTCFullYear()-bd.getUTCFullYear()-Number((now.getUTCMonth()*100+now.getUTCDate())<(bd.getUTCMonth()*100+bd.getUTCDate()));})();
  return '<div class="kk-review">'+items.map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
  '<label class="kk-checkbox"><input name="consent" type="checkbox"'+(data.consent?' checked':'')+' required><span>I certify that the details are accurate and consent to confidential SK KK profiling verification.</span></label>'+
  (age<18?'<label class="kk-checkbox"><input name="guardian_consent" type="checkbox"'+(data.guardian_consent?' checked':'')+' required><span>I confirm that a parent or legal guardian has permitted this minor’s KK registration.</span></label>':'')+
  '<p class="kk-helper">Magtatapos ito sa Pending status. SK Officers lamang ang maaaring mag-verify o mag-reject.</p>';
 };
 const renderStep=()=>{
  $('#kk-steps').innerHTML=titles.map((title,i)=>'<div class="kk-step '+(current===i+1?'active':current>i+1?'done':'')+'"><span>'+(i+1)+'</span>'+esc(title)+'</div>').join('');
  $('#kk-step-fields').innerHTML=stepBody();
  $('#kk-back').disabled=current<=1;
  $('#kk-next').textContent=current===5?'Submit for SK Review →':'Save & Next →';
  if(current===0){$('#kk-step-label').textContent='GOOGLE ACCOUNT SETUP';$('#kk-step-title').textContent='Complete your registration';$('#kk-next').textContent='Save & Continue →';}
 };
 async function load(){
  let result;
  try{result=await getApi('me');}
  catch(err){loading.textContent='Hindi pa available ang KK database. Kailangang ma-approve at ma-apply muna ang KK migration. '+err.message;return;}
  if(!result.member){location.replace('./kk-login');return;}
  account=result;profile=result.profile||{};data={...(profile.data||{})};
  data.region='NCR';data.province='N/A (NCR)';data.city='Quezon City';data.barangay='Vasra';
  try{const directory=await getApi('sitios');sitios=Array.isArray(directory.sitios)?directory.sitios:[];}
  catch{sitios=[];}

  current=Math.max(1,Math.min(5,Number(profile.step)||1));
  loading.hidden=true;content.hidden=false;render();
 }
 $('#kk-logout').onclick=async()=>{try{await send('logout',{});}finally{location.replace('./kk-login');}};
 $('#kk-back').onclick=()=>{if(current>1){savedFields($('#kk-step-form'));current--;feedback('');renderStep();}};
 $('#kk-step-form').addEventListener('change',event=>{
  if(current!==2 || event.target.name!=='education')return;
  savedFields($('#kk-step-form'));
  data.education=event.target.value;
  data.year_level='';
  renderStep(); // Recreate the grade/year dropdown using the chosen education level.
 });
 $('#kk-step-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  if(!form.reportValidity())return;
  const identityRequired=!account.member.first_name||!account.member.birthdate;
  const identity=identityRequired?values(form):{};
  savedFields(form);
  busy(form,true);feedback('Saving securely to your KK account…');
  try{
   const step=current===0?1:current;
   data.region='NCR';data.province='Metro Manila';data.city='Quezon City';data.barangay='Vasra';
   if(current===1&&!sitios.some(s=>String(s.id)===String(data.sitio_id))){
    throw Error('Pumili ng Sitio / Purok na nasa opisyal na listahan ng SK. Kung wala pa, ipalagay muna sa SK Sitio Management.');
   }
   if(current===2 && (!yearLevelOptions[data.education] ||
      !yearLevelOptions[data.education].some(([value])=>value===data.year_level))){
     throw Error('Pumili ng Year / Grade Level na tugma sa iyong Educational Level.');
   }
   await send('profile',{profile:data,step,...identity});
   if(current===5){await send('submit',{});await load();feedback('Profile submitted for SK Officer verification.','success');}
   else{if(current===0){await load();}else{current=Math.min(5,current+1);profile.step=current;renderStep();feedback('Step saved to your account.','success');}}
  }catch(err){feedback(err.message,'error');}finally{busy(form,false);}
 });
 load();
})();
