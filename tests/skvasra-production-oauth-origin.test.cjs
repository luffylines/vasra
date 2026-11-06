'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getConfig}=require('../lib/supabase.cjs');
const Google=require('../lib/google-auth.cjs');

test('Production Google OAuth uses canonical SK VASRA domain even with legacy PUBLIC_ORIGIN',()=>{
 const cfg=getConfig({
  SUPABASE_URL:'https://xetghdlwtqfnrdhdijfy.supabase.co',
  SUPABASE_SECRET_KEY:'sb_secret_testing_only',
  VERCEL_ENV:'production',VERCEL:'1',
  PUBLIC_ORIGIN:'https://vasra.vercel.app'
 });
 assert.equal(cfg.origin,'https://www.skvasra.app');
 const google=Google.googleConfig(cfg,{
  GOOGLE_CLIENT_ID:'example.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET:'test-only',
  GOOGLE_REDIRECT_URI:'https://www.skvasra.app/api/auth/google/callback'
 });
 assert.equal(google.enabled,true);
 assert.equal(Google.googleConfig(cfg,{
  GOOGLE_CLIENT_ID:'example.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET:'test-only',
  GOOGLE_REDIRECT_URI:'https://vasra.vercel.app/api/auth/google/callback'
 }).enabled,false);
});

test('Preview origin remains isolated from production Google OAuth origin',()=>{
 const cfg=getConfig({
  SUPABASE_URL:'https://xetghdlwtqfnrdhdijfy.supabase.co',
  SUPABASE_SECRET_KEY:'sb_secret_testing_only',
  VERCEL_ENV:'preview',VERCEL:'1',
  VERCEL_URL:'vasra-preview.example.vercel.app',
  PUBLIC_ORIGIN:'https://www.skvasra.app'
 });
 assert.equal(cfg.origin,'https://vasra-preview.example.vercel.app');
});


test('both old and custom production domains pass the exact trusted-origin allowlist',()=>{
 const cfg=getConfig({
  SUPABASE_URL:'https://xetghdlwtqfnrdhdijfy.supabase.co',
  SUPABASE_SECRET_KEY:'sb_secret_testing_only',
  VERCEL_ENV:'production',VERCEL:'1',PUBLIC_ORIGIN:'https://vasra.vercel.app'
 });
 assert.deepEqual(cfg.allowedOrigins,[
  'https://www.skvasra.app','https://vasra.vercel.app','https://skvasra.app'
 ]);
 assert.ok(!cfg.allowedOrigins.includes('https://some-preview.vercel.app'));
 assert.ok(!cfg.allowedOrigins.includes('https://fake.skvasra.app'));
});
