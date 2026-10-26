'use strict';
// Transactional SK Vasra email layout shared by all Resend notifications.
// Inline tables work in Gmail, Outlook and mobile. User data is HTML-escaped.
const escape=v=>String(v??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[ch]);
const paragraphs=v=>escape(v).replace(/\r\n|\r|\n/g,'<br>');
const allowedLink=v=>{
 try{const u=new URL(String(v||''));
  return u.protocol==='https:'&&!u.username&&!u.password?u.toString():'';
 }catch{return '';}
};
const logo='https://vasra.vercel.app/sk%20logo.jpg';
function renderEmail({subject='',heading='',eyebrow='SK VASRA · OFFICIAL NOTIFICATION',body='',
 actionLabel='',actionUrl='',details=[],notice='',footer='',variant='standard'}={}){
 const c={navy:'#132d53',blue:'#245bb1',red:'#d93443',yellow:'#f3bd2f',
   ink:'#17385f',muted:'#617c9f',line:'#dce6f2',back:'#f1f5fb'};
 const link=allowedLink(actionUrl);
 const rows=Array.isArray(details)?details.slice(0,8):[];
 const parts=[];
 parts.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(subject)+'</title></head>');
 parts.push('<body style="margin:0;padding:0;background:'+c.back+';font-family:Arial,Helvetica,sans-serif;color:'+c.ink+'">');
 parts.push('<div style="display:none;max-height:0;overflow:hidden;opacity:0">'+escape(heading||subject)+'</div>');
 parts.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:'+c.back+'"><tr><td align="center" style="padding:28px 12px 32px">');
 parts.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border:1px solid '+c.line+';border-radius:16px;overflow:hidden">');
 parts.push('<tr><td style="height:6px;padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="55%" style="height:6px;background:'+c.blue+'"></td><td width="22%" style="background:'+c.red+'"></td><td width="23%" style="background:'+c.yellow+'"></td></tr></table></td></tr>');
 parts.push('<tr><td style="padding:22px 30px;background:'+c.navy+'"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>');
 parts.push('<td style="width:55px;vertical-align:middle"><img alt="SK VASRA official logo" src="'+logo+'" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:12px;background:#fff;object-fit:contain;border:1px solid #ffffff44"></td>');
 parts.push('<td style="padding-left:12px;vertical-align:middle"><div style="font-size:19px;font-weight:800;color:#fff;letter-spacing:.5px">SK VASRA</div><div style="font-size:11px;color:#c3d9ef;margin-top:4px">Sangguniang Kabataan · Barangay Vasra</div></td></tr></table></td></tr>');
 parts.push('<tr><td style="padding:28px 30px 8px"><div style="font-size:10px;letter-spacing:1.5px;color:'+(variant==='alert'?c.red:c.blue)+';font-weight:bold">'+escape(eyebrow)+'</div>');
 parts.push('<h1 style="margin:9px 0 0;font-size:25px;line-height:1.25;letter-spacing:-.4px;color:'+c.navy+'">'+escape(heading||subject)+'</h1></td></tr>');
 parts.push('<tr><td style="padding:10px 30px 20px;color:#3f5773;font-size:14px;line-height:1.8;overflow-wrap:anywhere">'+paragraphs(body)+'</td></tr>');
 if(rows.length){
  parts.push('<tr><td style="padding:0 30px 18px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-radius:10px;border:1px solid '+c.line+';background:#f6f9ff">');
  for(const row of rows)parts.push('<tr><td style="padding:9px 12px;width:36%;font-size:12px;line-height:1.5;color:'+c.muted+';vertical-align:top">'+escape(row?.label)+'</td><td style="padding:9px 12px;font-size:12px;line-height:1.5;font-weight:bold;color:'+c.ink+';overflow-wrap:anywhere">'+paragraphs(row?.value)+'</td></tr>');
  parts.push('</table></td></tr>');
 }
 if(link&&actionLabel){
  parts.push('<tr><td style="padding:5px 30px 22px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:9px;background:'+c.blue+'">');
  parts.push('<a href="'+escape(link)+'" target="_blank" style="display:inline-block;background:'+c.blue+';border-radius:9px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;line-height:21px;padding:13px 23px">'+escape(actionLabel)+'</a></td></tr></table></td></tr>');
  parts.push('<tr><td style="padding:0 30px 22px;color:'+c.muted+';font-size:11px;line-height:1.7">If the button does not open, use the link below:<br><a style="color:'+c.blue+';overflow-wrap:anywhere" href="'+escape(link)+'">'+escape(link)+'</a></td></tr>');
 }
 if(notice)parts.push('<tr><td style="padding:0 30px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1e0a0;background:#fff9e9;border-radius:9px"><tr><td style="padding:11px 13px;color:#775c22;font-size:12px;line-height:1.65">'+paragraphs(notice)+'</td></tr></table></td></tr>');
 parts.push('<tr><td style="border-top:1px solid '+c.line+';background:#f8fbff;padding:18px 30px 22px"><div style="font-size:12px;font-weight:bold;color:'+c.navy+'">SK VASRA · QUEZON CITY</div>');
 parts.push('<div style="margin-top:6px;color:'+c.muted+';font-size:11px;line-height:1.7">'+paragraphs(footer||'Official SK Vasra notification. Never share your password or secure reset link.')+'</div>');
 parts.push('<div style="margin-top:11px;color:#7f94ac;font-size:10px">40 Forestry St, Barangay Vasra, Quezon City, Philippines</div></td></tr>');
 parts.push('</table></td></tr></table></body></html>');
 return parts.join('');
}
module.exports={renderEmail,escape,allowedLink};
