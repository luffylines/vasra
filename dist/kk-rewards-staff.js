'use strict';
(()=>{
 const $=selector=>document.querySelector(selector);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const service=async(body)=>api('./api/kk/staff/rewards',body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
 const flash=(message,isError=false)=>{
   const el=$('#kk-rewards-status');el.textContent='';el.dataset.kind='info';
   window.showVasraToast?.(message,isError?'error':'success');
 };
 const photoUrl=p=>'./api/kk/rewards/image/'+encodeURIComponent(p.id);
 let state={rewards:[],claims:[],projects:[],members:[],registrations:[],attendance:[],officer:{}},loading=false,working=false;
 const rewardCard=p=>{
  const available=Number(p.available||0),total=Number(p.quantity||0),claimed=Number(p.claimed||0),reserved=Number(p.pending||0);
  return '<article class="kk-reward-product'+(p.active?' is-published':'')+'"><div class="kk-reward-image">'+
   (p.image?'<img src="'+photoUrl(p)+'" alt="Reward photo: '+esc(p.title)+'" loading="lazy">':
     '<div class="kk-reward-no-image" aria-label="Reward photo not added yet">Add reward photo</div>')+'</div>'+
   '<div class="kk-reward-product-body"><div class="kk-reward-topline"><strong>'+esc(p.title)+'</strong>'+
   '<span class="kk-reward-state '+(p.active?'is-active':'')+'">'+(p.active?'Published':'Unpublished')+'</span></div>'+
   '<p>'+esc(p.description||'SK-approved reward')+'</p>'+
   '<div class="kk-reward-numbers"><span>'+esc(p.cost)+' points</span><span>'+available+' available / '+total+' total</span></div>'+
   '<small>'+claimed+' claimed · '+reserved+' pending claim(s)</small>'+
   (state.officer.chairman?
    '<div class="kk-reward-actions"><button type="button" class="secondary" data-reward-edit="'+esc(p.id)+'">Edit</button>'+
    (p.active?'':'<button type="button" class="secondary" data-reward-publish="'+esc(p.id)+'">Publish</button>')+
    '<button type="button" class="kk-reward-danger" data-reward-delete="'+esc(p.id)+'"'+
      (claimed+reserved>0?' disabled title="May redemption history: hindi maaaring i-delete."':'')+
      '>Delete</button></div>':'')+
   '</div></article>';
 };
 const renderClaims=()=>{
  const sorted=[...state.claims].sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1));
  $('#kk-rewards-claims').innerHTML=sorted.length?sorted.map(c=>
   '<article class="kk-reward-claim"><div><small>'+esc(c.kk_id||'KK Member')+' · '+esc(c.status)+'</small>'+
   '<h4>'+esc(c.name)+'</h4><p>'+esc(c.title)+' · '+esc(c.cost)+' points</p>'+
   (c.reviewed_by?'<small>Reviewed by '+esc(c.reviewed_by)+'</small>':'')+'</div>'+
   (c.status==='pending'?'<div class="kk-reward-actions">'+
    '<button type="button" class="primary" data-claim-decision="approved" data-id="'+esc(c.id)+'">Approve & Deduct Points</button>'+
    '<button type="button" class="secondary" data-claim-decision="rejected" data-id="'+esc(c.id)+'">Reject</button></div>':
    '<span class="kk-reward-state">'+esc(c.status)+'</span>')+'</article>').join(''):
   '<p class="kk-reward-empty">Wala pang redemption requests.</p>';
 };
 const render=()=>{
  $('#kk-rewards-active-count').textContent=String(state.rewards.filter(p=>p.active).length);
  $('#kk-rewards-pending-count').textContent=String(state.claims.filter(c=>c.status==='pending').length);
  $('#kk-rewards-claimed-count').textContent=String(state.claims.filter(c=>c.status==='approved').length);
  $('#kk-rewards-attendance-count').textContent=String(state.attendance.length);
  $('#kk-reward-editor').hidden=!state.officer.chairman;
  $('#kk-reward-catalog').innerHTML=state.rewards.length?state.rewards.map(rewardCard).join(''):
   '<p class="kk-reward-empty">Wala pang SK-approved rewards. Chairman can create a draft reward with photo and available stock.</p>';
  renderClaims();
 };
 const refresh=async()=>{
  if(loading)return;
  loading=true;
  try{
   const result=await service();
   for(const key of ['rewards','claims','projects','members','registrations','attendance'])
    state[key]=Array.isArray(result[key])?result[key]:[];
   state.officer=result.officer||{};
   render();
   $('#kk-rewards-status').textContent='';
  }catch(error){flash('Unable to load KK Rewards: '+error.message,true);}
  finally{loading=false;}
 };
 window.loadKKRewardsStaff=refresh;
 const form=$('#kk-reward-editor');
 const readPhoto=async file=>{
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2000000)
    throw Error('Use JPG, PNG or WEBP image under 2 MB.');
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
   reader.onerror=()=>reject(Error('Unable to read the reward photo.'));
   reader.readAsDataURL(file);
  });
 };
 const busy=async(button,task)=>{
  if(working)return;
  working=true;
  if(button)button.disabled=true;
  try{await task();await refresh();}catch(e){flash(e.message,true);}
  finally{working=false;if(button)button.disabled=false;}
 };
 form.addEventListener('submit',e=>{
  e.preventDefault();
  if(!state.officer.chairman||!form.reportValidity())return;
  const data=new FormData(form),photo=$('#kk-reward-photo').files?.[0],button=form.querySelector('[type=submit]');
  busy(button,async()=>{
   const result=await service({action:'save',id:data.get('id')||null,title:data.get('title'),
     description:data.get('description'),cost:Number(data.get('cost')),quantity:Number(data.get('quantity'))});
   // Keep the saved draft ID if the photo cannot be uploaded, so retry is safe.
   form.elements.id.value=result.id;
   if(photo){
    const bytes=await readPhoto(photo);
    try {
     await api('./api/kk/staff/rewards/image',{method:'POST',body:JSON.stringify({
      id:result.id,mime:photo.type,data:bytes
     })});
    } catch (error) {
     throw Error('Reward draft saved, but photo upload failed. Retry Save Reward to attach the photo. '+error.message);
    }
   }
   form.reset();
   flash('Reward saved as draft or updated. Publish when photo and stock are ready.');
  });
 });
 form.addEventListener('reset',()=>{form.elements.id.value='';});
 document.querySelector('#panel-kk-rewards').addEventListener('click',e=>{
  const edit=e.target.closest('[data-reward-edit]');
  if(edit){
   if(!state.officer.chairman)return;
   const p=state.rewards.find(x=>x.id===edit.dataset.rewardEdit);if(!p)return;
   for(const name of ['id','title','description','cost','quantity'])form.elements[name].value=p[name]??'';
   $('#kk-reward-photo').value='';
   form.scrollIntoView({behavior:'smooth',block:'start'});
   form.elements.title.focus();return;
  }
  const publish=e.target.closest('[data-reward-publish]');
  if(publish){
   const p=state.rewards.find(x=>x.id===publish.dataset.rewardPublish);
   if(!p||p.active||!state.officer.chairman||!confirm('Publish '+p.title+'?'))return;
   busy(publish,async()=>{
    await service({action:'toggle',id:p.id,active:!p.active});
    flash(p.active?'Reward disabled.':'Reward published.');
   });return;
  }
  const remove=e.target.closest('[data-reward-delete]');
  if(remove){
   const p=state.rewards.find(x=>x.id===remove.dataset.rewardDelete);
   if(!p||!state.officer.chairman)return;
   if(Number(p.claimed||0)+Number(p.pending||0)>0){
    flash('May redemption history ang reward. Hindi maaaring burahin ito upang mapanatili ang records.',true);
    return;
   }
   if(!confirm('Delete reward "'+p.title+'"? This cannot be undone.'))return;
   busy(remove,async()=>{
    await service({action:'delete',id:p.id});
    if(form.elements.id.value===p.id)form.reset();
    flash('Reward deleted successfully.');
   });return;
  }
  const claim=e.target.closest('[data-claim-decision]');
  if(claim){
   const c=state.claims.find(x=>x.id===claim.dataset.id);
   if(!c)return;
   const approved=claim.dataset.claimDecision==='approved';
   const note=prompt(approved?'Optional pickup/approval note:':'Reason for rejecting the request:', '');
   if(note===null)return;
   if(!approved&&note.trim().length<3){flash('Provide a rejection reason.',true);return;}
   if(!confirm((approved?'Approve and deduct '+c.cost+' points from ':'Reject request of ')+c.name+'?'))return;
   busy(claim,async()=>{
    await service({action:'review',id:c.id,decision:claim.dataset.claimDecision,note});
    flash('Redemption reviewed. Member balance and inventory have been refreshed.');
   });return;
  }

 });
 document.querySelector('#panel-kk-rewards').addEventListener('error',event=>{
  const img=event.target;
  if(!(img instanceof HTMLImageElement)||!img.matches('.kk-reward-image img'))return;
  const fallback=document.createElement('div');
  fallback.className='kk-reward-no-image';
  fallback.textContent='Hindi ma-load ang reward photo. I-check ang upload.';
  img.replaceWith(fallback);
 },true);
 $('#kk-rewards-refresh').addEventListener('click',refresh);
})();
