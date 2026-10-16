// The public transparency endpoint returns Chairperson-published directory records,
// not private staff accounts. Explicit draft/unverified flags are never displayed.
const officerRoles={chairman:'SK Chairperson',treasurer:'SK Treasurer',secretary:'SK Secretary',kagawad:'SK Kagawad'};
function publishedOfficers(records){
 return (Array.isArray(records)?records:[]).filter(o=>o&&typeof o.name==='string'&&o.name.trim()&&officerRoles[o.position]&&o.published!==false&&o.verified!==false).slice().sort((a,b)=>Object.keys(officerRoles).indexOf(a.position)-Object.keys(officerRoles).indexOf(b.position));
}
function officerPortrait(name,position){
 const normalized=String(name).trim().toLocaleLowerCase();
 for(const d of days){const i=d.names.findIndex(n=>n.toLocaleLowerCase()===normalized);if(i<0)continue;
  const photoRoles={chairman:'SK Chairman',treasurer:'SK Treasurer',secretary:'SK Secretary',kagawad:'SK Kagawad'};
  if(position&&d.roles[i]!==photoRoles[position])continue;
  // Crop the existing square poster in CSS, excluding headings and name banners.
  const crop=d.names.length>1?(i===0?'portrait-left':'portrait-right'):'portrait-single';
  return '<span class="officer-portrait '+crop+'"><img src="./duty/'+d.file+'.jpg" alt="" loading="lazy"></span>';
 }
 return '<span class="trans-avatar" aria-hidden="true">'+esc(String(name).trim().charAt(0).toUpperCase())+'</span>';
}

const dutyPositions={'SK Chairman':'chairman','SK Treasurer':'treasurer','SK Secretary':'secretary','SK Kagawad':'kagawad'};
// Public poster schedule is an explicitly attributed fallback, not an officially published directory.
function dutyOfficers(){
 const roster=[],seen=new Set();
 if(typeof days==='undefined'||!Array.isArray(days))return roster;
 for(const day of days){
  for(let i=0;i<day.names.length;i++){
   const name=String(day.names[i]||'').trim(),position=dutyPositions[day.roles[i]];
   if(!name||!position)continue;
   const key=name.toLocaleLowerCase();
   if(seen.has(key))continue;
   seen.add(key);roster.push({name,position});
  }
 }
 return publishedOfficers(roster);
}
function displayedOfficerRoster(records){
 const published=publishedOfficers(records);
 return published.length?{roster:published,fromDuty:false}:{roster:dutyOfficers(),fromDuty:true};
}
const dutySourceNote='<p class="org-source-note">Batay sa nakapaskil na SK Duty schedule. Hindi pa ito ang opisyal na published SK directory.</p>';

function officerChart(records){
 const {roster,fromDuty}=displayedOfficerRoster(records);
 if(!roster.length)return '<div class="trans-empty">Wala pang available na verified officers.</div>';
 const chairs=roster.filter(o=>o.position==='chairman'),members=roster.filter(o=>o.position!=='chairman');
 const card=o=>'<article class="org-card">'+officerPortrait(o.name,o.position)+'<strong>'+esc(o.name)+'</strong><small>'+esc(officerRoles[o.position])+'</small></article>';
 return (fromDuty?dutySourceNote:'')+'<div class="org-chart'+(chairs.length?' has-chair':'')+'" aria-label="SK organizational hierarchy">'+(chairs.length?'<div class="org-lead">'+chairs.map(card).join('')+'</div>':'<p class="org-note">Wala pang published SK Chairperson sa directory.</p>')+(members.length?'<ul class="org-members">'+members.map(o=>'<li>'+card(o)+'</li>').join('')+'</ul>':'')+'</div>';
}
function officerCard(o){return '<article class="trans-person">'+officerPortrait(o.name,o.position)+'<strong>'+esc(o.name)+'</strong><small>'+esc(officerRoles[o.position])+'</small></article>'}
function officerDirectory(records,grouped=false){
 const {roster,fromDuty}=displayedOfficerRoster(records);
 if(!roster.length)return '<div class="trans-empty">Wala pang available na verified officers.</div>';
 const html=grouped?Object.entries(officerRoles).map(([position,label])=>{const members=roster.filter(o=>o.position===position);return members.length?'<div class="trans-org-group"><h3>'+label+'</h3><div class="trans-roster">'+members.map(officerCard).join('')+'</div></div>':''}).join(''):roster.map(officerCard).join('');
 return (fromDuty?dutySourceNote:'')+html;
}
