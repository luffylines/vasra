'use strict';
(async()=>{
 const view=document.body.dataset.view;
 const $=s=>document.querySelector(s);
 const feedback=(message,kind='info')=>{const el=$('#kk-feedback');if(!el)return;el.textContent=message;el.dataset.kind=kind;el.hidden=!message;};
 const busy=(form,on)=>{const btn=form.querySelector('[type="submit"]');if(btn){btn.disabled=on;btn.setAttribute('aria-busy',String(on));}};
 // Fixed +63 9 is outside the editable box. Paste supports 09..., +639... or
 // the remaining nine digits, while typed content never exceeds nine digits.
 const kkMobileTail=value=>{
  let digits=String(value||'').replace(/\D/g,'');
  if(digits.startsWith('63')&&digits.length>=12)digits=digits.slice(2);
  if(digits.startsWith('0')&&digits.length>=11)digits=digits.slice(1);
  if(digits.startsWith('9')&&digits.length>=10)digits=digits.slice(1);
  return digits.slice(0,9);
 };
 const kkNormalizePhoneInput=input=>{
  if(!input||!input.matches('input[name="phone"]'))return;
  const tail=kkMobileTail(input.value);
  if(input.value!==tail)input.value=tail;
 };
 const kkPhilippineMobile=value=>'+639'+kkMobileTail(value);
 const getApi=async path=>api('./api/kk/'+path);
 const send=async(path,data)=>api('./api/kk/'+path,{method:'POST',body:JSON.stringify(data)});
 if(view==='login'){
  const google=$('#kk-google-login'),note=$('#kk-google-note');
  // Password visibility for KK youth only; independent of the SK staff login.
  const password=$('#kk-login-password'),reveal=$('.kk-password-toggle');
  if(password&&reveal)reveal.addEventListener('click',()=>{
   const visible=password.type==='text';
   password.type=visible?'password':'text';
   reveal.textContent=visible?'Show':'Hide';
   reveal.setAttribute('aria-label',visible?'Show password':'Hide password');
   reveal.setAttribute('aria-pressed',String(!visible));
  });

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
  const submit=form.querySelector('button[type="submit"]');
  const readiness=$('#kk-registration-readiness');
  const readinessTitle=$('#kk-readiness-title');
  const readinessDescription=$('#kk-readiness-description');
  const retry=$('#kk-readiness-retry');
  let databaseReady=false,checking=false;
  async function checkKKRegistration(){
   if(checking)return;
   checking=true;databaseReady=false;
   submit.disabled=true;submit.setAttribute('aria-disabled','true');
   submit.textContent='Checking KK Registration…';
   readiness.hidden=true;  // Only errors need a visible status card.
   readiness.dataset.status='checking';
   readinessTitle.textContent='Checking registration service…';
   readinessDescription.textContent='Tinitingnan kung active ang secure KK registration database.';
   retry.hidden=true;
   try{
    // This is a public, non-sensitive directory lookup and verifies that the
    // dedicated KK database RPC actually exists. A READY HTML preview alone
    // does NOT mean the KK migration has been applied.
    const result=await getApi('sitios');
    if(!Array.isArray(result?.sitios))throw Error('Invalid KK service response.');
    databaseReady=true;readiness.dataset.status='ready';
    readiness.hidden=true;
    readinessTitle.textContent='KK registration service is available';
    readinessDescription.textContent=result.sitios.length?
      'Available ang secure KK database. Maaari nang gumawa ng account.':
      'Available ang KK database; kailangan pang ilagay ng SK ang official Sitio/Purok list bago makumpleto ang profiling.';
    submit.disabled=false;submit.removeAttribute('aria-disabled');
    submit.textContent='Create KK Account →';
   }catch{
    readiness.dataset.status='unavailable';
    readiness.hidden=false;
    readinessTitle.textContent='KK registration is not yet available';
    readinessDescription.textContent='Hindi pa available ang KK database migration. Walang registration na mai-save sa preview. Hindi ka pa nakagawa ng account. Ipa-activate muna ito sa authorized SK administrator.';
    submit.textContent='Registration temporarily unavailable';
    retry.hidden=false;
   }finally{checking=false;}
  }
  retry.addEventListener('click',checkKKRegistration);
  // Existing authenticated KK members must resume the five-step profile,
  // not try to create a second account with the same email.
  getApi('me').then(result=>{
   if(result?.member?.id)location.replace('./kk-profile');
  }).catch(()=>{});
  checkKKRegistration();
  const phone=form.elements.namedItem('phone');
  phone.addEventListener('input',()=>kkNormalizePhoneInput(phone));
  phone.addEventListener('paste',e=>{
   const pasted=e.clipboardData?.getData('text')||'';
   if(pasted && (pasted.replace(/\D/g,'').length>=10)){
    e.preventDefault();phone.value=kkMobileTail(pasted);
   }
  });
  form.addEventListener('submit',async e=>{
   e.preventDefault();
   if(!databaseReady){feedback('Hindi pa active ang KK database. Walang na-create na account. Pindutin ang Retry o ipaalam sa SK administrator.','error');return;}
   if(!form.reportValidity())return;
   const f=Object.fromEntries(new FormData(form));
   if(f.email.trim().toLowerCase()!==f.confirm_email.trim().toLowerCase())return feedback('Hindi magkatugma ang email at confirm email.','error');
   if(f.password!==f.confirm_password)return feedback('Hindi magkatugma ang password.','error');
   const data={...f,email:f.email.trim().toLowerCase(),confirm_email:f.confirm_email.trim().toLowerCase(),phone:kkPhilippineMobile(f.phone),agree:form.agree.checked,confirm_email_correct:form.confirm_email_correct.checked};
   busy(form,true);feedback('Creating your protected KK account…');
   try{
    const result=await send('register',data);
    if(result?.ok)location.replace('./kk-profile');
    else throw Error('Hindi makumpleto ang KK registration. Subukang mag-login.');
   }catch(err){
    const duplicate=/existing|registered|record o kailangang i-review|already/i.test(String(err.message||''));
    if(duplicate){
     feedback('Hindi makagawa ng panibagong KK account gamit ang email na ito. Kung may account ka na, mag-login para magpatuloy sa Step 1–5.','error');
     const link=document.createElement('a');
     link.href='./kk-login';link.textContent='Pumunta sa KK Login at ipagpatuloy ang profiling →';
     link.className='kk-existing-login-link';
     $('#kk-feedback')?.append(link);
    }else feedback(err.message,'error');
   }finally{busy(form,false);}
  });
 }
 if(view!=='profile')return;
 const loading=$('#kk-loading'),content=$('#kk-content');
 let account=null,profile={},data={},current=1,sitios=[];
 const titles=['Personal Information','Education','Additional Information','Emergency Contact','Review & Submit'];
 const subtitles=['Basic details and address','School and employment','Voter status and other details','Guardian information','Confirm all details'];
 let validID=null,idBusy=false;
 const field=(name,label,opt={})=>{
  const value=data[name]??'',req=opt.required?' required':'';
  const labelText=esc(label)+(opt.required?' <span class="kk-required" aria-label="required">*</span>':'');
  if(opt.select){
   return '<label><span class="kk-label-title">'+labelText+'</span><select name="'+name+'"'+req+'><option value="">Pumili…</option>'+
    opt.select.map(v=>{const [val,text]=Array.isArray(v)?v:[v,v];return '<option value="'+esc(val)+'"'+(value===val?' selected':'')+'>'+esc(text)+'</option>';}).join('')+'</select></label>';
  }
  if(name==='phone'){
   const tail=kkMobileTail(value);
   return '<label>'+esc(label)+' *<span class="kk-ph-number"><span class="kk-ph-prefix" aria-hidden="true">+63 9</span><input name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="9" minlength="9" pattern="[0-9]{9}" placeholder="XXXXXXXXX" value="'+esc(tail)+'" required></span></label>';
  }
  if(opt.type==='number'){
   const min=name==='family_count'?1:0;
   const num=value===''?(name==='family_count'?1:0):value;
   return '<label><span class="kk-label-title">'+labelText+'</span>'+
    '<span class="kk-count-field"><button type="button" data-adjust="-1" aria-label="Decrease '+esc(label)+'">−</button>'+
    '<input name="'+name+'" type="number" inputmode="numeric" min="'+min+'" max="99" step="1" value="'+esc(num)+'"'+req+'>'+
    '<button type="button" data-adjust="1" aria-label="Increase '+esc(label)+'">+</button></span></label>';
  }
  const type=opt.type||'text';
  return '<label><span class="kk-label-title">'+labelText+'</span><input name="'+name+'" type="'+type+'" maxlength="'+(opt.max||150)+'" placeholder="'+esc(opt.placeholder||'')+'" value="'+esc(value)+'"'+req+'></label>';
 };
 const sitioSelect=()=>{
  const current=String(data.sitio_id||'');
  const selectedExists=sitios.some(x=>String(x.id)===current);
  return '<label><span class="kk-label-title">Sitio / Purok <span class="kk-required">*</span></span><select name="sitio_id" required>'+
   '<option value="">'+(sitios.length?'Piliin ang inyong Sitio / Purok':'Wala pang sitio na nilagay ang SK')+'</option>'+
   sitios.map(s=>'<option value="'+esc(s.id)+'"'+(current===String(s.id)?' selected':'')+'>'+esc(s.name)+'</option>').join('')+
   (!selectedExists&&current?'<option value="'+esc(current)+'" selected disabled>Hindi na available ang dating sitio — makipag-ugnay sa SK</option>':'')+
   '</select></label>';
 };
 const options={
  civil:[['single','Single'],['married','Married'],['divorced','Divorced'],['widowed','Widowed'],['separated','Separated'],['other','Other / prefer not to say']],
  religion:['Roman Catholic','Christian','Born Again','Islam','Iglesia Ni Cristo','Seventh Day Adventist','Bible Baptist Church','Others'],
  gender:[['male','Male'],['female','Female'],['lesbian','Lesbian'],['gay','Gay'],['bisexual','Bisexual'],['transgender','Transgender'],['queer','Queer'],['other','Others'],['undisclosed','Prefer not to say']],
  solo:[['no','No'],['yes','Yes'],['undisclosed','Prefer not to say']],
  edu:[['no-formal','No Formal Schooling'],['elementary','Elementary'],['junior-high','Junior High School'],['senior-high','Senior High School'],['als','Alternative Learning System (ALS)'],['vocational','TVET / Vocational'],['college','College / Undergraduate'],['graduate','Postgraduate (Masteral / Doctoral)'],['out-of-school','Out-of-School Youth']],
  educationStatus:[['student','Student'],['graduate','Graduate'],['osy','Out of School Youth (OSY)']],
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
 // NCR geographic options use PSGC v2; all official KK affiliation fields
 // continue to be separately verified as Barangay Vasra by the server.
 const metroCities=['Caloocan','Las Piñas','Makati','Malabon','Mandaluyong','Manila',
  'Marikina','Muntinlupa','Navotas','Parañaque','Pasay','Pasig','Pateros',
  'Quezon City','San Juan','Taguig','Valenzuela'];
 const metroCodes={'Caloocan':'1380100000','Las Piñas':'1380200000','Makati':'1380300000',
  'Malabon':'1380400000','Mandaluyong':'1380500000','Manila':'1380600000',
  'Marikina':'1380700000','Muntinlupa':'1380800000','Navotas':'1380900000',
  'Parañaque':'1381000000','Pasay':'1381100000','Pasig':'1381200000',
  'Pateros':'1381700000','Quezon City':'1381300000','San Juan':'1381400000',
  'Taguig':'1381500000','Valenzuela':'1381600000'};
 const regionOptions=[['NCR','National Capital Region (NCR)'],['CAR','CAR'],['I','Region I'],
  ['II','Region II'],['III','Region III'],['IV-A','Region IV-A'],['IV-B','Region IV-B'],
  ['V','Region V'],['VI','Region VI'],['VII','Region VII'],['VIII','Region VIII'],
  ['IX','Region IX'],['X','Region X'],['XI','Region XI'],['XII','Region XII'],
  ['XIII','Region XIII'],['BARMM','BARMM']];
 // Fallback is intentionally limited to the supplied Quezon City reference;
 // when PSGC loads, the official locality list replaces it.
 const qcFallback='Alicia|Amihan|Apolonio Samson|Aurora|Baesa|Bagbag|Bagong Pag-asa|Bagong Silangan|Bagumbayan|Bahay Toro|Balingasa|Balong Bato|Batasan Hills|Blue Ridge A|Blue Ridge B|Bungad|Camp Aguinaldo|Commonwealth|Culiat|Damayan|Del Monte|Don Manuel|Duyan-duyan|Fairview|Greater Lagro|Holy Spirit|Immaculate Concepcion|Kaligayahan|Kamuning|Katipunan|Krus na Ligas|Laging Handa|Libis|Loyola Heights|Matandang Balara|Milagrosa|Nagkaisang Nayon|New Era|North Fairview|Novaliches Proper|Pasong Putik Proper|Pasong Tamo|Payatas|Phil-Am|Pinyahan|Project 6|Ramon Magsaysay|Roxas|San Bartolome|San Roque|Santa Lucia|Sauyo|Sikatuna Village|Socorro|Tandang Sora|Teachers Village East|Teachers Village West|U.P. Campus|U.P. Village|Vasra|Veterans Village|White Plains'.split('|');
 const regionValue=()=>data.residence_region||'NCR';
 const cityValue=()=>data.residence_city||'Quezon City';
 let barangayList=qcFallback.map(n=>[n,n]),addressLoading=false,addressError=false,addressRequest=0,address2Expanded=false;
 const cachedBarangays=new Map();
 const isVasraAddress=()=>regionValue()==='NCR'&&cityValue()==='Quezon City'&&String(data.residence_barangay||'').toLowerCase()==='vasra';
 const addressFields=()=>{
  const province=regionValue()==='NCR'?[['Metro Manila','Metro Manila']]:[];
  const city=regionValue()==='NCR'?metroCities.map(n=>[n,n]):[];
  const saved=String(data.residence_barangay||'');
  const barangays=barangayList.slice();
  if(saved&&!barangays.some(([n])=>n===saved))barangays.push([saved,saved+' (saved; check against official list)']);
  return '<div class="kk-section-heading kk-section-with-icon kk-address-heading"><span class="kk-heading-icon">⌖</span><span><b>Address Information</b><small>RESIDENT ADDRESS · Provide your complete residential address</small></span></div>'+
   field('residence_region','Region',{select:regionOptions,required:true})+
   field('residence_province','Province',{select:province,required:true})+
   field('residence_city','City / Municipality',{select:city,required:true})+
   field('residence_barangay','Barangay',{select:barangays,required:true})+
   (isVasraAddress()?sitioSelect():
    '<p class="kk-residency-notice kk-full-span">Ang opisyal na KK verification ay para sa mga kwalipikadong kabataan ng Barangay Vasra. Puwedeng i-save ang address para sa SK residency review, pero kailangan ang Vasra Sitio/Purok upang makumpleto ang verification request.</p>')+
   field('street','House No. / Street',{required:true,placeholder:'Hal. 20 Yakal Street'})+
   '<div class="kk-full-span kk-addline-controls"><button type="button" id="kk-toggle-address2" aria-expanded="'+String(address2Expanded||!!data.address_line_2)+'">'+(address2Expanded||data.address_line_2?'− Remove Address Line 2':'+ Add Address Line 2')+'</button></div>'+
   (address2Expanded||data.address_line_2?'<div class="kk-full-span">'+field('address_line_2','Address Line 2 (Optional)')+'</div>':'')+
   '<p class="kk-full-span kk-address-status" role="status">'+
   (regionValue()!=='NCR'?'Para sa KK Vasra, NCR lamang ang kasalukuyang sinusuportahang registration address. Makipag-ugnay sa SK para sa ibang region.':
   addressLoading?'Loading official barangay choices…':
   addressError?'Limited offline Quezon City barangay choices. Subukang i-refresh kapag may internet.':
   'Piliin ang City / Municipality upang makita ang kaukulang mga barangay.')+'</p>';
 };
 const parsePsgc=body=>{
  const list=Array.isArray(body)?body:Array.isArray(body?.data)?body.data:
   Array.isArray(body?.items)?body.items:[];
  return [...new Set(list.map(v=>String(v.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 };
 const preserveOtherFields=()=>{
  if(current!==1)return;
  const form=$('#kk-step-form');if(!form)return;
  for(const [name,value] of new FormData(form)){
   if(!['residence_region','residence_province','residence_city','residence_barangay','sitio_id'].includes(name))
    data[name]=value;
  }
 };
 async function refreshAddressBarangays(){
  const seq=++addressRequest,city=cityValue(),code=metroCodes[city];
  if(regionValue()!=='NCR'||!code){barangayList=[];addressLoading=false;addressError=false;renderStep();return;}
  if(cachedBarangays.has(city)){barangayList=cachedBarangays.get(city);addressError=false;addressLoading=false;renderStep();return;}
  addressLoading=true;addressError=false;
  try{
   const request=await fetch('https://psgc.cloud/api/v2/cities-municipalities/'+code+'/barangays',{mode:'cors',credentials:'omit'});
   if(!request.ok)throw Error('PSGC unavailable');
   const names=parsePsgc(await request.json());
   if(!names.length)throw Error('Empty barangay list');
   if(seq!==addressRequest)return;
   barangayList=names.map(n=>[n,n]);
   cachedBarangays.set(city,barangayList);
  }catch{
   if(seq!==addressRequest)return;
   addressError=true;
   barangayList=city==='Quezon City'?qcFallback.map(n=>[n,n]):[];
  }finally{
   if(seq===addressRequest){addressLoading=false;preserveOtherFields();if(current===1)renderStep();}
  }
 }
 const values=(container)=>Object.fromEntries(new FormData(container));
 const render=()=>{
  $('#kk-status').textContent=(profile.status||'draft').toUpperCase();
  $('#kk-id').textContent=profile.kk_id||'After verification';
  $('#kk-points').textContent=String(account.points||0);
  const review=$('#kk-review-note');review.hidden=!profile.review_note;
  if(profile.review_note){review.textContent=(profile.status==='rejected'?'Rejected by SK Officer — maaari mong itama at i-submit muli. Dahilan: ':'Review Note: ')+profile.review_note;review.dataset.kind=profile.status==='rejected'?'error':'info';}
  const edit=profile.status!=='pending'&&profile.status!=='verified';
  $('#kk-profile-area').hidden=!edit;
  if(edit){renderStep();if(current===1)refreshAddressBarangays();}
 };
 const savedFields=(form)=>{
  for(const [name,value] of new FormData(form)){
   if(name==='consent'||name==='guardian_consent')continue;
   data[name]=String(value);
  }
  if(current===5){data.consent=!!form.querySelector('[name="consent"]')?.checked;data.guardian_consent=!!form.querySelector('[name="guardian_consent"]')?.checked;}
  renderPreview();
 };
 const validIDSection=()=>'<section class="kk-id-upload kk-full-span" aria-label="Valid ID upload"><div class="kk-form-section-head"><span class="kk-form-section-icon">▣</span><div><h3>Valid ID <span class="kk-required">*</span></h3>'+
  '<p>Upload a clear image or PDF of a valid ID (PSA, QCID, Voter ID, Driver’s License, Passport, National ID). Maximum 2.5 MB.</p></div></div>'+
  '<label class="kk-id-drop"><span class="kk-upload-symbol" aria-hidden="true">☁</span><strong>'+ (validID?.exists?'Replace Valid ID':'Choose a file / Drag & Drop')+'</strong>'+
  '<span id="kk-id-upload-status">'+(validID?.exists?'Uploaded: '+esc(validID.name||'Valid ID'):'Accepted: JPG, PNG or PDF · 2.5 MB maximum')+'</span>'+
  '<input type="file" name="kk_valid_id" id="kk-valid-id-file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"'+(validID?.exists?'':' required')+'></label>'+
  '<div class="kk-id-chip-row"><span>PSA / Birth Certificate</span><span>QCID</span><span>Voter’s ID</span><span>Driver’s License</span><span>Passport</span><span>National ID</span></div></section>';
 const yesNoField=(name,label)=>'<fieldset class="kk-yn-field"><legend>'+esc(label)+' <span class="kk-required">*</span></legend>'+
  '<label><input type="radio" name="'+name+'" value="yes" required'+(data[name]==='yes'?' checked':'')+'> Yes</label>'+
  '<label><input type="radio" name="'+name+'" value="no" required'+(data[name]==='no'?' checked':'')+'> No</label></fieldset>';
 const previewSection=(heading,items)=>'<section class="kk-preview-card"><h4>'+esc(heading)+'</h4><dl>'+
  items.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v||'—')+'</dd></div>').join('')+'</dl></section>';
 const renderPreview=()=>{
  const node=$('#kk-profile-preview');if(!node)return;
  node.innerHTML='<div class="kk-preview-title"><span aria-hidden="true">♙</span><div><h3>Profile Preview</h3><p>Information will be updated as you complete the form.</p></div></div>'+
   previewSection('Personal Information',[['Name',[account.member.first_name,account.member.last_name].join(' ')],['Date of Birth',account.member.birthdate],['Gender',data.gender],['Civil Status',data.civil_status]])+
   previewSection('Address',[['Sitio/Purok',sitios.find(s=>String(s.id)===String(data.sitio_id))?.name],['House No./Street',data.street],['Barangay',data.residence_barangay]])+
   previewSection('Education',[['Attainment',data.education],['School',data.school_name],['Year Level',data.year_level]])+
   previewSection('Additional Information',[['Registered SK Voter',data.sk_voter],['National Voter',data.national_voter],['Voted Last Election',data.voted_last_election],['KK Assembly',data.kk_assembly]])+
   previewSection('Emergency Contact',[['Name',data.emergency_name],['Contact Number',data.emergency_phone]])+
   previewSection('Valid ID',[['Document',validID?.exists?'Uploaded · '+(validID.name||'Valid ID'):'Required']]);
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
  if(current===1)return '<div class="kk-form-fields kk-step-one">'+
   '<div class="kk-section-heading kk-section-with-icon"><span class="kk-heading-icon">♙</span><span><b>Personal Information</b><small>Basic information for your KK membership</small></span></div>'+
   field('religion','Religion',{select:options.religion,required:true})+
   field('civil_status','Civil Status',{select:options.civil,required:true})+
   field('gender','Gender',{select:options.gender,required:true})+
   '<fieldset class="kk-solo-field"><legend>Are you a solo parent? <span class="kk-required">*</span></legend>'+
   '<label><input type="radio" name="solo_parent" value="yes" required'+(data.solo_parent==='yes'?' checked':'')+'> Yes</label>'+
   '<label><input type="radio" name="solo_parent" value="no" required'+(data.solo_parent==='no'?' checked':'')+'> No</label></fieldset>'+
   field('family_count','Number of Family Members',{required:true,type:'number',placeholder:'1'})+
   field('siblings','Number of Siblings',{required:true,type:'number',placeholder:'0'})+
   addressFields()+validIDSection()+'</div>'+
   '<p class="kk-helper">Personal details are only accessible to authorized SK staff during KK verification.</p>';
  if(current===2){
   const schoolRequired=!['no-formal','out-of-school'].includes(data.education)&&data.education_status!=='osy';
   const courseRequired=['senior-high','vocational','college','graduate'].includes(data.education)&&data.education_status!=='osy';
   return '<div class="kk-form-fields">'+
    '<div class="kk-section-heading kk-section-with-icon"><span class="kk-heading-icon">▤</span><span><b>Educational Status</b><small>School, course and grade or year level</small></span></div>'+
    field('education_status','Current Educational Status',{select:options.educationStatus,required:true})+
    field('education','Educational Level',{select:options.edu,required:true})+
    field('year_level','Year / Grade Level',{select:yearLevelOptions[data.education]||[],required:true})+
    field('course_program','Course / Program',{required:courseRequired,placeholder:'Hal. BSIT, STEM, TVET NC II'})+
    field('school_name','School / Institution',{required:schoolRequired,placeholder:'Ilagay ang paaralan o institution'})+
    '</div><p class="kk-helper">Piliin muna ang Educational Level. Nakaayon dito ang mga Year / Grade Level choices. Required ang Course/Program para sa senior high, vocational, college o postgraduate kapag naaangkop.</p>';
  }
  if(current===3)return '<div class="kk-form-fields">'+
   '<div class="kk-section-heading kk-section-with-icon"><span class="kk-heading-icon">ⓘ</span><span><b>Additional Information</b><small>Answer these four voter and KK Assembly questions</small></span></div>'+
   yesNoField('sk_voter','Are you a Registered SK Voter?')+
   yesNoField('national_voter','Registered National Voter?')+
   yesNoField('voted_last_election','Did You Vote Last Election?')+
   yesNoField('kk_assembly','Have you already attended a KK Assembly?')+
   field('employment','Occupation / Status',{select:options.employment,required:true})+
   field('interests','Interests / Skills / Youth Organization (Optional)')+'</div>';
  if(current===4)return '<div class="kk-form-fields">'+
   field('emergency_name','Emergency contact full name',{required:true})+
   field('emergency_phone','Emergency contact number',{required:true,placeholder:'+639XXXXXXXXX'})+
   field('emergency_relation','Relationship',{required:true})+'</div>'+
   '<p class="kk-helper">Ito ay gagamitin lamang sa naaangkop na emergency at hindi ilalathala.</p>';
  const items=[['Full Name',[account.member.first_name,account.member.middle_name,account.member.last_name].filter(Boolean).join(' ')],['Birthdate',account.member.birthdate],
   ['Email',account.member.email],['Resident Address',[data.residence_region||'NCR',data.residence_province||'Metro Manila',data.residence_city||'Quezon City',data.residence_barangay||''].filter(Boolean).join(' · ')],['Sitio / Purok',sitios.find(s=>String(s.id)===String(data.sitio_id))?.name||'—'],['Street',data.street||'—'],['Educational Status',data.education_status||'—'],['Education',data.education||'—'],['Course / Program',data.course_program||'—'],['Year / Grade Level',data.year_level||'—'],
   ['SK Voter',data.sk_voter||'—'],['National Voter',data.national_voter||'—'],['Voted Last Election',data.voted_last_election||'—'],['Attended KK Assembly',data.kk_assembly||'—'],['Valid ID',validID?.exists?'Uploaded':'Not uploaded'],['Emergency Contact',data.emergency_name||'—']];
  const age=(()=>{const now=new Date(),bd=new Date(account.member.birthdate+'T00:00:00Z');return now.getUTCFullYear()-bd.getUTCFullYear()-Number((now.getUTCMonth()*100+now.getUTCDate())<(bd.getUTCMonth()*100+bd.getUTCDate()));})();
  return '<div class="kk-review">'+items.map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
  '<label class="kk-checkbox"><input name="consent" type="checkbox"'+(data.consent?' checked':'')+' required><span>I certify that the details are accurate and consent to confidential SK KK profiling verification.</span></label>'+
  (age<18?'<label class="kk-checkbox"><input name="guardian_consent" type="checkbox"'+(data.guardian_consent?' checked':'')+' required><span>I confirm that a parent or legal guardian has permitted this minor’s KK registration.</span></label>':'')+
  '<p class="kk-helper">Magtatapos ito sa Pending status. SK Officers lamang ang maaaring mag-verify o mag-reject.</p>';
 };
 const renderStep=()=>{
  $('#kk-steps').innerHTML=titles.map((title,i)=>'<div class="kk-step '+(current===i+1?'active':current>i+1?'done':'')+'"><span>'+(i+1)+'</span><strong>'+esc(title)+'</strong><small>'+esc(subtitles[i])+'</small></div>').join('');
  $('#kk-step-fields').innerHTML=stepBody();
  $('#kk-back').disabled=current<=1;$('#kk-back').hidden=current<=1;
  $('#kk-next').textContent=current===5?'Submit for SK Review →':'Save & Next →';
  renderPreview();
  if(current===0){$('#kk-step-label').textContent='GOOGLE ACCOUNT SETUP';$('#kk-step-title').textContent='Complete your registration';$('#kk-next').textContent='Save & Continue →';}
 };
 async function load(){
  let result;
  try{result=await getApi('me');}
  catch(err){
   // A missing KK database RPC cannot be repaired by logging in again. Keep
   // setup/service failures separate from real authentication failures.
   const reason=String(err?.message||'Hindi ma-load ang KK account.');
   const setupUnavailable=/Hindi available ang database|migration|server configuration/i.test(reason);
   const guidance=setupUnavailable
    ? 'Hindi pa ready ang KK Profiling database para sa preview na ito. Kailangang i-verify ng SK administrator ang database migration at server settings bago makapag-save ng KK records.'
    : 'Kung expired ang session, mag-login muli gamit ang parehong website domain. Kung paulit-ulit ang error, ipasuri ang KK service.';
   loading.innerHTML='<div class="kk-load-error" role="alert"><strong>'+ (setupUnavailable?'KK Profiling database is not ready':'Hindi ma-load ang KK profile')+'</strong><p>'+esc(reason)+
    '</p><p>'+esc(guidance)+'</p>'+
    (setupUnavailable?'':'<a href="./kk-login">Go to KK Login</a> · ')+
    '<button type="button" id="kk-retry-load">Retry</button></div>';
   $('#kk-retry-load')?.addEventListener('click',()=>{loading.textContent='Checking your KK account…';load();});
   return;
  }
  if(!result.member){location.replace('./kk-login');return;}
  account=result;profile=result.profile||{};data={...(profile.data||{})};
  if(profile.status==='verified'){location.replace('./kk-dashboard');return;}
  validID=result.document||null;
  data.region='NCR';data.province='N/A (NCR)';data.city='Quezon City';data.barangay='Vasra';
  data.residence_region=data.residence_region||'NCR';data.residence_province=data.residence_province||'Metro Manila';
  data.residence_city=data.residence_city||'Quezon City';
  address2Expanded=!!data.address_line_2;
  try{const directory=await getApi('sitios');sitios=Array.isArray(directory.sitios)?directory.sitios:[];}
  catch{sitios=[];}

  current=profile.status==='rejected'?1:Math.max(1,Math.min(5,Number(profile.step)||1));
  loading.hidden=true;content.hidden=false;render();
 }
 $('#kk-logout').onclick=async()=>{try{await send('logout',{});}finally{location.replace('./kk-login');}};
 $('#kk-back').onclick=()=>{if(current>1){savedFields($('#kk-step-form'));current--;feedback('');renderStep();}};
 $('#kk-step-form').addEventListener('click',event=>{
  const adjustment=event.target.closest('button[data-adjust]');
  if(adjustment){
   const numberInput=adjustment.parentElement.querySelector('input[type="number"]');
   if(numberInput){
    const minimum=Number(numberInput.min||0),maximum=Number(numberInput.max||99);
    const next=Math.min(maximum,Math.max(minimum,Number(numberInput.value||minimum)+Number(adjustment.dataset.adjust)));
    numberInput.value=String(next);numberInput.dispatchEvent(new Event('input',{bubbles:true}));
   }
   return;
  }
  if(event.target.closest('#kk-toggle-address2')){
   savedFields($('#kk-step-form'));
   address2Expanded=!(address2Expanded||!!data.address_line_2);
   if(!address2Expanded)data.address_line_2='';
   renderStep();if(address2Expanded)$('#kk-step-form [name="address_line_2"]')?.focus();
  }
 });
 $('#kk-step-form').addEventListener('change',async event=>{
  if(event.target.id!=='kk-valid-id-file')return;
  const file=event.target.files?.[0];if(!file)return;
  const feedbackEl=$('#kk-feedback');
  if(file.size>2_500_000 || file.size<100 || !['image/jpeg','image/png','application/pdf'].includes(file.type)){
    feedback('JPG, PNG o PDF lamang, minimum 100 bytes at maximum 2.5 MB.');event.target.value='';return;
  }
  idBusy=true;feedback('Uploading Valid ID securely…');
  try{
    const bytes=await new Promise((resolve,reject)=>{const reader=new FileReader();
      reader.onerror=()=>reject(Error('Cannot read file'));reader.onload=()=>resolve(String(reader.result||''));reader.readAsDataURL(file);});
    const payload={name:file.name.slice(0,120),mime:file.type,data:bytes.split(',')[1]};
    const reply=await send('id/upload',payload);
    validID=reply.document;
    feedback('Valid ID uploaded securely. SK Officers can view it during verification.','success');
    if(feedbackEl)feedbackEl.hidden=false;
    renderStep();
  }catch(err){feedback('Valid ID upload failed: '+err.message);}
  finally{idBusy=false;}
});
 $('#kk-step-form').addEventListener('input',event=>{
  if(event.target.matches('input[name="phone"]'))kkNormalizePhoneInput(event.target);
 });
 $('#kk-step-form').addEventListener('paste',event=>{
  if(!event.target.matches('input[name="phone"]'))return;
  const pasted=event.clipboardData?.getData('text')||'';
  if(pasted && pasted.replace(/\D/g,'').length>=10){
   event.preventDefault();event.target.value=kkMobileTail(pasted);
  }
 });
 $('#kk-step-form').addEventListener('change',event=>{
  if(current===1 && ['residence_region','residence_province','residence_city','residence_barangay'].includes(event.target.name)){
   const changed=event.target.name;
   savedFields($('#kk-step-form'));
   if(changed==='residence_region'){
    data.residence_province=data.residence_region==='NCR'?'Metro Manila':'';
    data.residence_city=data.residence_region==='NCR'?'Quezon City':'';
    data.residence_barangay='';data.sitio_id='';
   }else if(changed==='residence_city'){
    data.residence_barangay='';data.sitio_id='';
   }else if(changed==='residence_barangay'&&!isVasraAddress())data.sitio_id='';
   if(changed==='residence_region'||changed==='residence_city'){
    barangayList=[];addressLoading=true;renderStep();refreshAddressBarangays();
   }
   else renderStep();
   return;
  }
  if(current!==2||!['education','education_status'].includes(event.target.name))return;
  savedFields($('#kk-step-form'));
  if(event.target.name==='education')data.year_level='';
  renderStep(); // Update Year Level, Course and School requirements for the selected status.
 });
 $('#kk-step-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  // The secure Valid ID upload is only part of Step 1, never account registration.
  if(current===1&&!validID?.exists){
   feedback(idBusy?'Hindi pa tapos ang Valid ID upload.':'Mag-upload muna ng Valid ID bago mag-Save & Next.','error');
   if(!idBusy)$('#kk-valid-id-file')?.focus();
   return;
  }
  if(idBusy){feedback('Hindi pa tapos ang Valid ID upload.','error');return;}
  if(!form.reportValidity())return;
  const identityRequired=!account.member.first_name||!account.member.birthdate;
  const identity=identityRequired?values(form):{};
  if(identityRequired && identity.phone)identity.phone=kkPhilippineMobile(identity.phone);
  savedFields(form);
  busy(form,true);feedback('Saving securely to your KK account…');
  try{
   const step=current===0?1:current;
   // SK jurisdiction/eligibility identity stays fixed on the server;
   // residence_* fields preserve the applicant's real selected address.
   data.region='NCR';data.province='N/A (NCR)';data.city='Quezon City';data.barangay='Vasra';
   if(current===1){
    if(data.residence_region!=='NCR')throw Error('KK Vasra registration supports NCR addresses only. Makipag-ugnay sa SK para sa ibang region.');
    // Other NCR residents may save a draft, but cannot claim Vasra eligibility.
    if(!/^[0-9]+$/.test(String(data.family_count))||Number(data.family_count)<1 ||
       !/^[0-9]+$/.test(String(data.siblings))||Number(data.siblings)<0)
      throw Error('Ilagay ang tamang bilang ng family members at siblings.');
   }
   if(current===1&&isVasraAddress()&&!sitios.some(s=>String(s.id)===String(data.sitio_id))){
    throw Error('Pumili ng Sitio / Purok na nasa opisyal na listahan ng SK. Kung wala pa, ipalagay muna sa SK Sitio Management.');
   }
   if(current===3 && ['sk_voter','national_voter','voted_last_election','kk_assembly'].some(key=>!['yes','no'].includes(data[key])))
    throw Error('Piliin ang Yes o No sa lahat ng required voter at KK Assembly questions.');
   if(current===2 && (!data.education_status || !yearLevelOptions[data.education] ||
      !yearLevelOptions[data.education].some(([value])=>value===data.year_level))){
     throw Error('Pumili ng Educational Status at Year / Grade Level na tugma sa iyong Educational Level.');
   }
   if(current===2 && ['senior-high','vocational','college','graduate'].includes(data.education)&&data.education_status!=='osy'&&!String(data.course_program||'').trim())
     throw Error('Kailangan ang Course / Program para sa educational level na ito.');
   if(current===5 && (!isVasraAddress()||!sitios.some(s=>String(s.id)===String(data.sitio_id))))
    throw Error('Ang official KK Vasra application ay para sa Barangay Vasra. Piliin ang wastong Sitio/Purok at i-review ang address, o makipag-ugnay sa SK para sa residency verification.');
   await send('profile',{profile:data,step,...identity});
   if(current===5){await send('submit',{});await load();feedback('Profile submitted for SK Officer verification.','success');}
   else{if(current===0){await load();}else{current=Math.min(5,current+1);profile.step=current;renderStep();feedback('Step saved to your account.','success');}}
  }catch(err){feedback(err.message,'error');}finally{busy(form,false);}
 });
 load();
})();
