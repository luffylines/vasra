'use strict';
(()=>{
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const apiCall=(path,body)=>api('./api/kk/staff/id-cards'+path,body?{method:'POST',body:JSON.stringify(body)}:{});
 let rows=[];
 const status=(msg,error=false)=>{const x=$('#kk-id-staff-status');x.textContent=msg;x.dataset.kind=error?'error':'info';};
 const photoUrl=id=>'./api/kk/staff/id-cards/'+encodeURIComponent(id)+'/photo';
 const paint=()=>{
  const q=$('#kk-id-staff-query').value.trim().toLowerCase(),filter=$('#kk-id-staff-filter').value;
  const list=rows.filter(r=>(filter==='all'||r.status===filter)&&
    (!q||[r.name,r.kk_id].some(v=>String(v||'').toLowerCase().includes(q))));
  $('#kk-id-staff-list').innerHTML=list.length?list.map(r=>
   '<article class="kk-id-staff-item"><div class="kk-id-staff-photo">'+
   (r.photo_exists?'<img loading="lazy" src="'+photoUrl(r.member_id)+'" alt="Submitted portrait of '+esc(r.name)+'">':'<span>NO PHOTO</span>')+
   '</div><div class="kk-id-staff-details"><h3>'+esc(r.name)+'</h3><p>'+esc(r.kk_id||'Not issued')+'</p>'+
   '<small>Birthdate: '+esc(r.birthdate||'—')+'</small>'+
   '<span class="kk-id-review-badge" data-state="'+esc(r.status)+'">'+esc(r.status.replace('_',' '))+'</span>'+
   (r.review_note?'<p class="kk-id-staff-reason">SK note: '+esc(r.review_note)+'</p>':'')+
   '</div><div class="kk-id-staff-actions">'+
   (r.status==='pending'?'<button type="button" data-card-approve="'+esc(r.member_id)+'">Approve Photo</button>'+
    '<button type="button" data-card-reject="'+esc(r.member_id)+'">Reject</button>':'')+
   (r.status==='approved'?'<button type="button" class="kk-id-print-button" data-card-print="'+esc(r.member_id)+'">Print Front & Back</button>':'')+
   '</div></article>'
  ).join(''):'<div class="kk-id-empty">Walang KK ID cards na tumutugma sa filter.</div>';
 };
 const load=async()=>{
  status('Loading saved KK member cards…');
  try{const result=await apiCall('');if(result?.ok!==true||!Array.isArray(result.members))throw Error('Invalid card response');
   rows=result.members;paint();status(rows.length+' verified members · '+rows.filter(r=>r.status==='approved').length+' photos approved');
  }catch(e){status('Unable to load KK IDs: '+e.message,true);}
 };
 const cardFace=(m,back=false)=>{
  const name=esc(m.name),code=esc(m.kk_id);
  if(back)return '<div class="kk-physical-card back"><div class="kk-print-back-top"><img src="./sk%20logo.jpg" alt=""><span>SK VASRA</span></div>'+
   '<h2>OFFICIAL KK MEMBER ID</h2><div class="kk-print-back-details"><span>Full Name</span><strong>'+name+'</strong>'+
   '<span>KK ID</span><strong>'+code+'</strong><span>Date of Birth</span><strong>'+esc(m.birthdate||'—')+'</strong></div>'+
   '<p class="kk-print-card-note">Issued for the verified Katipunan ng Kabataan member. For validation, contact SK Vasra · Quezon City. If found, return to SK Vasra Office, 40 Forestry St.</p></div>';
  return '<div class="kk-physical-card front"><div class="kk-print-header"><img src="./sk%20logo.jpg" alt=""><span><strong>SK VASRA</strong><small>SANGGUNIANG KABATAAN · BARANGAY VASRA</small></span></div>'+
   '<div class="kk-print-front-main"><img class="kk-print-member-photo" src="'+photoUrl(m.member_id)+'" alt="Approved KK ID portrait"><div><small>VERIFIED KK MEMBER</small><strong class="kk-print-member-name">'+name+'</strong><span class="kk-print-member-code">'+code+'</span></div></div>'+
   '<div class="kk-print-front-footer">QUEZON CITY · KATIPUNAN NG KABATAAN</div></div>';
 };
 const print=async m=>{
  if(m.status!=='approved'||!m.photo_exists)return;
  const root=$('#kk-id-print-root');
  if(!root)return;
  root.innerHTML='<div class="kk-print-page">'+cardFace(m,false)+'</div><div class="kk-print-page">'+cardFace(m,true)+'</div>';
  const pictures=[...root.querySelectorAll('img')];
  try{await Promise.all(pictures.map(img=>img.complete&&img.naturalWidth>0?Promise.resolve():
      new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(new Error('Unable to load private photo')),{once:true});})));
   status('Printing approved '+m.kk_id+' · Front + back (actual size 85.6 × 54 mm)');
   window.print();
  }catch(e){status('Cannot print without the approved ID photo: '+e.message,true);root.replaceChildren();}
 };
 $('#kk-id-staff-query')?.addEventListener('input',paint);
 $('#kk-id-staff-filter')?.addEventListener('change',paint);
 $('#kk-id-staff-refresh')?.addEventListener('click',load);
 $('#kk-id-staff-list')?.addEventListener('click',async e=>{
  const yes=e.target.closest('[data-card-approve]'),no=e.target.closest('[data-card-reject]'),
   printer=e.target.closest('[data-card-print]');
  const id=yes?.dataset.cardApprove||no?.dataset.cardReject||printer?.dataset.cardPrint;
  const m=rows.find(x=>x.member_id===id);if(!m)return;
  if(printer){await print(m);return;}
  if(m.status!=='pending')return;
  const accepted=!!yes;
  let note='';
  if(accepted){
   if(!confirm('Approve the ID portrait for '+m.name+' ('+m.kk_id+')? This enables official ID printing.'))return;
  }else{
   note=prompt('Reason for rejecting '+m.name+' ID portrait (minimum five characters):')||'';
   if(note.trim().length<5)return;
  }
  const button=yes||no;button.disabled=true;
  try{const res=await apiCall('/review',{id,status:accepted?'approved':'rejected',note:note.trim()});
   if(res?.ok!==true)throw Error('No confirmation from server');
   await load();status('Photo '+(accepted?'approved':'rejected')+' for '+m.kk_id);
  }catch(err){status('Photo review failed: '+err.message,true);button.disabled=false;}
 });
 window.loadKKIDStaff=load;
 window.addEventListener('afterprint',()=>$('#kk-id-print-root')?.replaceChildren());
})();
