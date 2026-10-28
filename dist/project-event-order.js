'use strict';
/* Same sorting helpers as public Projects; kept in sync by regression test. */
(()=>{
// Read a valid date from a project title, including historical stylized captions.
// Records without a valid title date are placed using their actual publish day.
const monthNumber=Object.freeze({
 january:1,jan:1,enero:1,
 february:2,feb:2,pebrero:2,
 march:3,mar:3,marso:3,
 april:4,apr:4,abril:4,
 may:5,mayo:5,
 june:6,jun:6,hunyo:6,
 july:7,jul:7,hulyo:7,
 august:8,aug:8,agosto:8,
 september:9,sept:9,sep:9,setyembre:9,septiyembre:9,
 october:10,oct:10,oktubre:10,
 november:11,nov:11,nobyembre:11,
 december:12,dec:12,disyembre:12
});
const projectDateMonths=Object.keys(monthNumber).sort((a,b)=>b.length-a.length).join('|');
function validActivityTimestamp(year,month,day){
 const y=Number(year),m=Number(month),d=Number(day);
 if(y<2000||y>2100||m<1||m>12||d<1||d>31)return NaN;
 const result=Date.UTC(y,m-1,d),parsed=new Date(result);
 return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()===m-1&&parsed.getUTCDate()===d?result:NaN;
}
function projectActivityTimestamp(project){
 const declared=project?.activity_date;
 if(typeof declared==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(declared)){
  const [year,month,day]=declared.split('-');
  const stamp=validActivityTimestamp(year,month,day);
  if(Number.isFinite(stamp))return stamp;
 }
 const title=String(project?.title||'').normalize('NFKC');
 // ISO-style titles, e.g. "2026-09-27 | Project".
 const iso=title.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
 if(iso){
  const stamp=validActivityTimestamp(iso[1],iso[2],iso[3]);
  if(Number.isFinite(stamp))return stamp;
 }
 // Full and abbreviated Filipino/English dates including Sep, Sept., Oct.
 const named=title.match(new RegExp('\\b('+projectDateMonths+')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(20\\d{2})\\b','i'));
 if(named){
  const stamp=validActivityTimestamp(named[3],monthNumber[named[1].toLowerCase()],named[2]);
  if(Number.isFinite(stamp))return stamp;
 }
 // Tagalog/day-first titles such as "ika-4 ng Oktubre 2026".
 const reversed=title.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th|ng)?\\s+(?:ng\\s+)?('+projectDateMonths+')\\.?\\s*,?\\s*(20\\d{2})\\b','i'));
 if(reversed){
  const stamp=validActivityTimestamp(reversed[3],monthNumber[reversed[2].toLowerCase()],reversed[1]);
  if(Number.isFinite(stamp))return stamp;
 }
 // Unknown event dates are deliberately NOT treated as today's new projects.
 return NaN;
}
// A missing/invalid date at the beginning of a project title falls back to
// the publication CALENDAR DAY in Philippine time, not a separate "unknown" group.
// Comparing calendar days also avoids timezone/time-of-day altering title order.
function projectPublicationDay(project){
 const raw=Date.parse(project?.publish_at||'');
 if(!Number.isFinite(raw))return NaN;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date(raw)).map(x=>[x.type,x.value]));
 return validActivityTimestamp(parts.year,parts.month,parts.day);
}
function projectSortDay(project){
 // Only a valid TITLE date determines event order. Historical activity_date
 // metadata remains readable but must not override the title or publish fallback.
 const fromTitle=projectActivityTimestamp({title:project?.title});
 return Number.isFinite(fromTitle)?fromTitle:projectPublicationDay(project);
}
function sortProjectsNewestFirst(rows){
 return [...rows].sort((a,b)=>{
  const aDate=projectSortDay(a),bDate=projectSortDay(b);
  const aKnown=Number.isFinite(aDate),bKnown=Number.isFinite(bDate);
  if(aKnown!==bKnown)return aKnown?-1:1;
  if(aKnown&&aDate!==bDate)return bDate-aDate;
  const publishedA=Date.parse(a.publish_at||'');
  const publishedB=Date.parse(b.publish_at||'');
  const timeA=Number.isFinite(publishedA)?publishedA:0;
  const timeB=Number.isFinite(publishedB)?publishedB:0;
  return timeB-timeA||String(a.id||'').localeCompare(String(b.id||''));
 });
}


window.SKProjectOrder=Object.freeze({sortProjectsNewestFirst,projectSortDay});
})();
