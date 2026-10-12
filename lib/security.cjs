const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + (await scrypt(password, salt, 64)).toString('hex');
}
async function passwordMatch(password, stored) {
  const valid = typeof stored === 'string' && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored);
  const [salt, expected] = valid ? stored.split(':') : ['0'.repeat(32), '0'.repeat(128)];
  const actual = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex')) && valid;
}
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `Suriin ang ${label}.`);
  return value.trim();
}
function email(value) { const result = text(value, 254, 'email').toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400, 'Invalid email.'); return result; }
function password(value) { if (typeof value !== 'string' || value.length < 12 || value.length > 200) fail(400, 'Gumamit ng password na 12–200 characters.'); return value; }
function uuid(value) { if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) fail(400, 'Invalid record ID.'); return value; }
function safeUser(u) { return u ? { id: u.id, name: u.name, email: u.email, role: u.role, mustChange: u.must_change } : null; }
function imageValid(bytes, mime) {
  if (!bytes.length || bytes.length > 5242880) fail(400, 'Hanggang 5 MB lamang ang larawan.');
  const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mime === 'image/webp' && bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  if (!valid) fail(400, 'Hindi tugma ang file sa image type.');
}
function base64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(400, 'Invalid image data.');
  return Buffer.from(value, 'base64');
}
module.exports = { hash, randomToken, passwordHash, passwordMatch, fail, text, email, password, uuid, safeUser, imageValid, base64 };
