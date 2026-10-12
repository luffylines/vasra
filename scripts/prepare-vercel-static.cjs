// Static-only emergency deployment: avoids loading the SQLite server on Vercel.
// The staff API is NOT enabled until the Supabase serverless migration passes tests.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'dist');
const output = path.join(root, 'public');
if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error('Missing dist/index.html');
}
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
// Prevent broken staff login from being served until serverless backend is ready.
for (const file of ['account.html', 'account.js']) {
  fs.rmSync(path.join(output, file), { force: true });
}
console.log('VASRA public static site prepared in public/');
