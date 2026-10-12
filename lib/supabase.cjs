const { fail } = require('./security.cjs');
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
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; }
  async request(path, options = {}) {
    let response;
    try {
      response = await this.fetcher(this.config.url + path, { ...options, headers: { apikey: this.config.key, ...options.headers }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    } catch { fail(503, 'Hindi makonekta ang database o Storage.'); }
    return response;
  }
  async rpc(action, payload = {}, sessionHash = null) {
    const response = await this.request('/rest/v1/rpc/vasra_rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload, session_hash: sessionHash }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (result?.code === '23505') fail(409, 'May existing account o record.');
      if (result?.code === '40P01' || result?.code === '40001') fail(409, 'May kasabay na pagbabago. Subukan muli.');
      if (result?.code === '23514' || result?.code === '22P02') fail(400, 'Invalid record.');
      fail(503, 'Hindi available ang database. Suriin ang migration at server configuration.');
    }
    return result;
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
