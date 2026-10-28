// Vercel Node.js function adapter for the VASRA Fetch-style API handler.
// Local SQLite server.cjs remains available for local-only development.
const { createHandler } = require('../lib/handler.cjs');
const { isIP } = require('node:net');
const handle = createHandler();

module.exports = async function vercelHandler(req, res) {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const raw = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 4200000) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Masyadong malaki ang request.' }));
        return;
      }
      raw.push(chunk);
    }
    const method = req.method || 'GET';
    const opts = { method, headers: req.headers };
    if (method !== 'GET' && method !== 'HEAD') opts.body = Buffer.concat(raw);
    const url = new URL(req.url, proto + '://' + host);
    const response = await handle(new Request(url, opts), {
      // Vercel's proxy-provided address, not a client-provided form value.
      ip: (()=>{const value=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.headers['x-real-ip']||'').split(',')[0].trim();return isIP(value)?value:null;})()
    });
    res.statusCode = response.status;
    for (const [key, value] of response.headers) res.setHeader(key, value);
    if (response.body) {
      for await (const part of response.body) res.write(Buffer.from(part));
    }
    res.end();
  } catch (error) {
    console.error('VASRA function adapter error:', error.name);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify({ error: 'May error sa server.' }));
  }
};
module.exports.config = { api: { bodyParser: false } };
