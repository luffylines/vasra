'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig } = require('../lib/supabase.cjs');
const { createHandler } = require('../lib/handler.cjs');

const deployment = 'https://vasra-6ftgt0tko-vasra.vercel.app';
const branch = 'https://vasra-git-feat-email-two-factor-auth-20261103-vasra.vercel.app';
const other = 'https://not-vasra-git-feat-email-two-factor-auth-20261103-attacker.vercel.app';
function previewConfig() {
  return getConfig({
    SUPABASE_URL:'https://xetghdlwtqfnrdhdijfy.supabase.co',
    SUPABASE_SECRET_KEY:'sb_secret_test_placeholder_do_not_use',
    VERCEL:'1',
    VERCEL_ENV:'preview',
    VERCEL_URL:new URL(deployment).host,
    VERCEL_BRANCH_URL:new URL(branch).host
  });
}
test('preview origin config trusts deployment and project branch alias only', () => {
  const config = previewConfig();
  assert.equal(config.origin,deployment);
  assert.deepEqual(config.allowedOrigins,[deployment,branch]);
  assert.equal(config.allowedOrigins.includes(other),false);
});
test('untrusted branch URLs never enter the allowlist', () => {
  const config = getConfig({
    SUPABASE_URL:'https://xetghdlwtqfnrdhdijfy.supabase.co',
    SUPABASE_SECRET_KEY:'sb_secret_test_placeholder_do_not_use',
    VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:new URL(deployment).host,
    VERCEL_BRANCH_URL:'malicious-site.vercel.app'
  });
  assert.deepEqual(config.allowedOrigins,[deployment]);
});
test('production does not trust Vercel preview aliases', () => {
  const config = getConfig({
    SUPABASE_URL:'https://xetghdlwtqfnrdhdijfy.supabase.co',
    SUPABASE_SECRET_KEY:'sb_secret_test_placeholder_do_not_use',
    VERCEL:'1',VERCEL_ENV:'production',
    VERCEL_URL:new URL(deployment).host,
    VERCEL_BRANCH_URL:new URL(branch).host
  });
  assert.deepEqual(config.allowedOrigins,['https://www.skvasra.app','https://vasra.vercel.app','https://skvasra.app']);
});
async function post(requestUrl, origin, config) {
  const handle = createHandler({
    config,
    backend:{ rpc:async() => { throw new Error('Should never call DB for unknown route.'); } }
  });
  const response = await handle(new Request(requestUrl+'/api/origin-regression-test', {
    method:'POST',
    headers: origin ? {'Origin':origin,'Content-Type':'application/json'} :
      {'Content-Type':'application/json'},
    body:'{}'
  }));
  return {status:response.status,body:await response.json()};
}
test('valid same-origin POST is not blocked on stable branch alias', async () => {
  const result=await post(branch,branch,previewConfig());
  assert.equal(result.status,404);
  assert.notEqual(result.body.error,'Hindi pinapayagang request origin.');
});
test('valid same-origin POST is not blocked on immutable deployment URL', async () => {
  assert.equal((await post(deployment,deployment,previewConfig())).status,404);
});
test('cross-site origin on a valid alias is rejected', async () => {
  const result=await post(branch,'https://example.org',previewConfig());
  assert.equal(result.status,403);
  assert.equal(result.body.error,'Hindi pinapayagang request origin.');
});
test('another Vercel domain is not trusted merely because it ends in vercel.app', async () => {
  assert.equal((await post(other,other,previewConfig())).status,403);
});
test('request without Origin is rejected on production and preview', async () => {
  assert.equal((await post(branch,null,previewConfig())).status,403);
});


test('local-only HTTP developer requests continue to pass with no PUBLIC_ORIGIN', async () => {
  const handle = createHandler({
    config:{origin:null,allowedOrigins:[],secure:false},
    backend:{rpc:async () => { throw new Error('unexpected DB access'); }}
  });
  const response = await handle(new Request('http://localhost:3000/api/origin-regression-test', {
    method:'POST',headers:{'Origin':'http://localhost:3000','Content-Type':'application/json'},body:'{}'
  }),{local:true});
  assert.equal(response.status,404);
});


test('known 2FA preview Git ref works without VERCEL_BRANCH_URL', () => {
  const config = getConfig({
    SUPABASE_URL:'https://xetghdlwtqfnrdhdijfy.supabase.co',
    SUPABASE_SECRET_KEY:'sb_secret_test_placeholder_do_not_use',
    VERCEL:'1', VERCEL_ENV:'preview',
    VERCEL_URL:'vasra-preview-vasra.vercel.app',
    VERCEL_GIT_COMMIT_REF:'feat/email-two-factor-auth-20261103'
  });
  assert.equal(config.allowedOrigins.includes(branch),true);
});
test('unrelated Git ref never receives the 2FA branch alias', () => {
  const config = getConfig({
    SUPABASE_URL:'https://xetghdlwtqfnrdhdijfy.supabase.co',
    SUPABASE_SECRET_KEY:'sb_secret_test_placeholder_do_not_use',
    VERCEL:'1', VERCEL_ENV:'preview',
    VERCEL_URL:'vasra-preview-vasra.vercel.app',
    VERCEL_GIT_COMMIT_REF:'some-other-branch'
  });
  assert.equal(config.allowedOrigins.includes(branch),false);
});
