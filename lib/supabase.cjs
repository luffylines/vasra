const { fail } = require('./security.cjs');
const { isIP } = require('node:net');
const PROJECT_ID = 'xetghdlwtqfnrdhdijfy';
const BUCKET = 'vasra-project-images';
function getConfig(env = process.env) {
  const url = env.SUPABASE_URL;
  if (url !== `https://${PROJECT_ID}.supabase.co`) fail(503, 'SUPABASE_URL must target the dedicated VASRA project.');
  if (!env.SUPABASE_SECRET_KEY || !env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) fail(503, 'Configure the server-only SUPABASE_SECRET_KEY.');
  // Use one exact trusted origin for each deployment, rather than disabling CSRF checks.
  // The production alias is stable even when Vercel exposes a deployment-specific URL.
  let origin = env.PUBLIC_ORIGIN;
  if (env.VERCEL_ENV === 'production') origin = 'https://vasra.vercel.app';
  else if (env.VERCEL_ENV === 'preview' && env.VERCEL_URL) origin = 'https://' + env.VERCEL_URL;
  if (origin) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || (!origin.startsWith('https:') && (env.VERCEL || env.NODE_ENV === 'production' || !['localhost','127.0.0.1'].includes(parsed.hostname)))) fail(503, 'Invalid PUBLIC_ORIGIN.');
  }
  return { url, key: env.SUPABASE_SECRET_KEY, origin, secure: !!env.VERCEL || env.NODE_ENV === 'production' || origin?.startsWith('https:') };
}
class SupabaseBackend {
  constructor(config, fetcher = fetch, clientIp = null) { this.config = config; this.fetcher = fetcher; this.clientIp = clientIp && isIP(clientIp) ? clientIp : null; }
  async request(path, options = {}) {
    let response;
    try {
      response = await this.fetcher(this.config.url + path, { ...options, headers: { apikey: this.config.key, ...(this.clientIp ? { 'x-vasra-client-ip':this.clientIp } : {}), ...options.headers }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    } catch { fail(503, 'Hindi makonekta ang database o Storage.'); }
    return response;
  }
  async rpc(action, payload = {}, sessionHash = null) {
    const response = await this.request(((action === 'duty_status' || action === 'duty_set') ? '/rest/v1/rpc/vasra_duty' : action.startsWith('gallery_') ? '/rest/v1/rpc/vasra_gallery' : action.startsWith('awards_') ? '/rest/v1/rpc/vasra_awards' : action.startsWith('accounts_') ? '/rest/v1/rpc/vasra_staff_accounts' : action.startsWith('kk_password_reset_') ? '/rest/v1/rpc/vasra_kk_password_reset' : action.startsWith('kk_event_') ? '/rest/v1/rpc/vasra_kk_event_attendance' : action.startsWith('kk_reward_delete_') ? '/rest/v1/rpc/vasra_kk_reward_delete' : action.startsWith('kk_rewards_') ? '/rest/v1/rpc/vasra_kk_rewards' : action.startsWith('kk_card_') ? '/rest/v1/rpc/vasra_kk_card' : action.startsWith('resolutions_import_') ? '/rest/v1/rpc/vasra_sk_resolutions_import' : action.startsWith('resolutions_') ? '/rest/v1/rpc/vasra_sk_resolutions' : action.startsWith('disclosure_') ? '/rest/v1/rpc/vasra_disclosure' : action.startsWith('kk_service_scan_') ? '/rest/v1/rpc/vasra_kk_service_scan' : action.startsWith('kk_service_archive_') ? '/rest/v1/rpc/vasra_kk_service_archive' : action.startsWith('kk_service_workflow_') ? '/rest/v1/rpc/vasra_kk_service_workflow' : action.startsWith('kk_profile_delete_') ? '/rest/v1/rpc/vasra_kk_profile_delete' : action.startsWith('kk_profile_editor_') ? '/rest/v1/rpc/vasra_kk_profile_editor' : action.startsWith('kk_services_') ? '/rest/v1/rpc/vasra_kk_services' : action.startsWith('kk_') ? '/rest/v1/rpc/vasra_kk' : action.startsWith('officer_contacts_') ? '/rest/v1/rpc/vasra_officer_contacts' : action.startsWith('officer_profile_') ? '/rest/v1/rpc/vasra_officer_profile' : action.startsWith('duty_management_') ? '/rest/v1/rpc/vasra_duty_management' : action === 'project_delete' ? '/rest/v1/rpc/vasra_project_delete' : action === 'project_progress' ? '/rest/v1/rpc/vasra_project_progress' : action.startsWith('google_') ? '/rest/v1/rpc/vasra_google_login' : action.startsWith('account_') ? '/rest/v1/rpc/vasra_account' : action.startsWith('transparency_') ? '/rest/v1/rpc/vasra_transparency' : '/rest/v1/rpc/vasra_rpc'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action === 'duty_status' ? 'status' : action === 'duty_set' ? 'set' : action.startsWith('gallery_') ? action.slice(8) : action.startsWith('awards_') ? action.slice(7) : action.startsWith('accounts_') ? action.slice(9) : action.startsWith('kk_password_reset_') ? action.slice(18) : action.startsWith('kk_event_') ? action.slice(9) : action.startsWith('kk_reward_delete_') ? action.slice(17) : action.startsWith('kk_rewards_') ? action.slice(11) : action.startsWith('kk_card_') ? action.slice(8) : action.startsWith('resolutions_import_') ? action.slice(19) : action.startsWith('resolutions_') ? action.slice(12) : action.startsWith('disclosure_') ? action.slice(11) : action.startsWith('kk_service_scan_') ? action.slice(16) : action.startsWith('kk_service_archive_') ? action.slice(19) : action.startsWith('kk_service_workflow_') ? action.slice(20) : action.startsWith('kk_profile_delete_') ? action.slice(18) : action.startsWith('kk_profile_editor_') ? action.slice(18) : action.startsWith('kk_services_') ? action.slice(12) : action.startsWith('kk_') ? action.slice(3) : action.startsWith('officer_contacts_') ? action.slice(17) : action.startsWith('officer_profile_') ? action.slice(16) : action.startsWith('duty_management_') ? action.slice(16) : action === 'project_delete' ? 'delete' : action === 'project_progress' ? 'update' : action.startsWith('transparency_') ? action.slice(13) : action.startsWith('account_') ? action.slice(8) : action.startsWith('google_') ? action.slice(7) : action, payload, session_hash: sessionHash }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      // Keep raw SQL errors private; log only the action and database error code.
      console.warn('SK VASRA RPC failed',{action,status:response.status,
        code:typeof result?.code==='string'?result.code.slice(0,20):'unknown'});
      if (result?.code === '23505') fail(409, 'May existing account o record.');
      if (result?.code === '40P01' || result?.code === '40001') fail(409, 'May kasabay na pagbabago. Subukan muli.');
      if (result?.code === '23514' || result?.code === '22P02') fail(400, 'Invalid record.');
      fail(503, 'Hindi available ang database. Suriin ang migration at server configuration.');
    }
    return result;
  }
  // Reward art is not an identity document. Store immutable reward images in the
  // private project-images bucket, which explicitly permits JPEG, PNG and WEBP.
  async putReward(path,bytes,mime){
    if(typeof path!=='string'||!/^rewards\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(path)||
      !['image/jpeg','image/png','image/webp'].includes(mime)||
      !Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>2000000)
      fail(400,'Invalid reward image.');
    await this.put(path,bytes,mime);
  }
  async getReward(path){
    // Only paths returned by a caller-authorized reward RPC are allowed here.
    if(typeof path!=='string'||!/^rewards\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(path))
      fail(400,'Invalid reward image path.');
    const uploaded=await this.request('/storage/v1/object/authenticated/'+BUCKET+'/'+path);
    if(uploaded.ok){
      const bytes=Buffer.from(await uploaded.arrayBuffer());
      if(bytes.length<100||bytes.length>2000000)fail(413,'Invalid reward photo size.');
      return bytes;
    }
    if(uploaded.status!==404)fail(503,'Hindi ma-access ang reward photo storage.');
    // Historical bug: earlier deployments wrote reward photos to the private
    // Valid ID bucket. Repair only an exact rewards/UUID/UUID.ext image, and
    // copy verified image bytes to the correct bucket without touching identity files.
    const legacy=await this.request('/storage/v1/object/authenticated/vasra-kk-identity/'+path);
    if(!legacy.ok)fail(503,'Reward photo not found in the approved private storage.');
    const bytes=Buffer.from(await legacy.arrayBuffer());
    const ext=path.split('.').at(-1).toLowerCase();
    const mime=({jpg:'image/jpeg',png:'image/png',webp:'image/webp'})[ext];
    if(!mime||bytes.length<100||bytes.length>2000000||
      (ext==='jpg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))||
      (ext==='png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
      (ext==='webp'&&!(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')))
      fail(400,'Invalid legacy reward image.');
    await this.putReward(path,bytes,mime);
    return bytes;
  }
  async deletePrivate(path) {
    // Restrict removal to private UUID-named identity uploads only.
    if(typeof path!=='string'||!/^ids\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|pdf)$/i.test(path))
      fail(400,'Invalid private identity file path.');
    const resource='/storage/v1/object/vasra-kk-identity/'+path.split('/').map(encodeURIComponent).join('/');
    const response=await this.request(resource,{method:'DELETE'});
    if(!response.ok&&response.status!==404)fail(503,'Private Valid ID cleanup failed.');
  }
  async putPrivate(path,bytes,mime){
    const r=await this.request('/storage/v1/object/vasra-kk-identity/'+path,{
      method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes});
    if(!r.ok)fail(503,'Hindi na-save ang Valid ID sa private storage.');
  }
  async getPrivate(path){
    const r=await this.request('/storage/v1/object/authenticated/vasra-kk-identity/'+path);
    if(!r.ok)fail(r.status===404?404:503,'Hindi ma-access ang private Valid ID.');
    const bytes=Buffer.from(await r.arrayBuffer());
    if(bytes.length>3000000)fail(413,'Invalid ID document size.');
    return bytes;
  }
  async put(path, bytes, mime) {
    const r = await this.request(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': mime, 'x-upsert': 'false' }, body: bytes });
    if (r.ok) return;
    // Immutable object names: retries must match exactly, never silently overwrite.
    if (r.status === 409 || r.status === 400) { const existing = await this.get(path); if (existing.equals(bytes)) return; fail(409, 'Upload conflict. Magsimula ng bagong upload.'); }
    fail(503, 'Hindi natuloy ang pag-upload.');
  }
  async get(path) {
    const r = await this.request(`/storage/v1/object/authenticated/${BUCKET}/${path}`);
    if (!r.ok) fail(503, 'Hindi mabasa ang larawan sa Storage.');
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 5242880) fail(413, 'Masyadong malaki ang larawan.');
    return bytes;
  }
  async remove(paths) {
    if (!paths.length) return;
    const r = await this.request(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
    if (!r.ok) fail(503, 'Storage cleanup failed.');
  }
}
module.exports = { getConfig, SupabaseBackend, PROJECT_ID, BUCKET };
