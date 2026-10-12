// One-time chairman provisioning for the VASRA Supabase backend.
// Run only from a trusted terminal after the serverless SQL migration is verified.
// Never commit generated credentials or use them as command-line arguments.
const { randomBytes, scryptSync } = require('node:crypto');
const { getConfig, SupabaseBackend } = require('../lib/supabase.cjs');
const EMAIL = 'christianaring6@gmail.com';
async function main() {
  const cfg = getConfig();
  const db = new SupabaseBackend(cfg);
  const temporary = randomBytes(24).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const hashed = salt + ':' + scryptSync(temporary, salt, 64).toString('hex');
  const response = await db.rpc('provision', { email: EMAIL, password: hashed });
  if (response?.error) throw new Error('Provisioning rejected: ' + response.error);
  if (response?.email !== EMAIL || response?.role !== 'chairman') throw new Error('Unexpected provisioning response; verify on Supabase.');
  process.stdout.write('Chairman: ' + EMAIL + '\n');
  process.stdout.write('One-time temporary password: ' + temporary + '\n');
  process.stdout.write('Save it privately now. Change it on first login. Do not share or commit it.\n');
}
main().catch(err => { console.error('Could not provision chairman:', err.message); process.exitCode = 1; });
