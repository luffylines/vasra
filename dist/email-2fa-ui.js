/* SK VASRA email 2FA — shared, accessible staff and KK interface.
 * No OTPs or credentials are placed in browser storage. */
(function () {
 'use strict';
 const $ = (selector, root=document) => root.querySelector(selector);
 const isKK = Boolean($('#kk-login-form') || $('#kk-dash-password'));
 const kind = isKK ? 'kk' : 'staff';
 const prefix = isKK ? './api/kk/security/2fa' : './api/security/2fa';

 async function request(url, payload) {
  const response = await fetch(url, {
   method: payload === undefined ? 'GET' : 'POST',
   credentials: 'same-origin',
   headers: payload === undefined ? {} : {'Content-Type':'application/json'},
   body: payload === undefined ? undefined : JSON.stringify(payload),
   cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(
   typeof result.error === 'string' ? result.error :
   typeof result.message === 'string' ? result.message :
   'Verification failed. Please try again.'
  );
  return result;
 }

 const shield = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4.5 5v6c0 5.1 3 8.6 7.5 11 4.5-2.4 7.5-5.9 7.5-11V5L12 2Z"/><path d="m9.2 12 2 2 3.7-4.1"/></svg>';
 const mail = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>';

 function feedback(target, text, state='info') {
  if (!target) return;
  target.textContent = String(text || '');
  target.dataset.state = state;
  target.hidden = !text;
  target.setAttribute('role', state === 'error' ? 'alert' : 'status');
  target.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
 }

 function codeMarkup(id) {
  const boxes = Array.from({length:6}, () => '<span class="vasra-mfa-digit" aria-hidden="true"></span>').join('');
  return '<div class="vasra-mfa-code-field">' +
   '<label class="vasra-mfa-field-label" for="' + id + '">6-digit verification code</label>' +
   '<div class="vasra-mfa-code-group" data-otp-group>' +
   '<input id="' + id + '" class="vasra-mfa-code-input" name="verification_code" type="text" inputmode="numeric" ' +
   'autocomplete="one-time-code" enterkeyhint="done" pattern="[0-9]{6}" minlength="6" maxlength="6" required ' +
   'aria-label="Enter the six-digit verification code" aria-describedby="' + id + '-hint">' +
   boxes + '</div>' +
   '<small id="' + id + '-hint" class="vasra-mfa-input-hint">Enter all 6 numbers from your email</small>' +
   '</div>';
 }

 function initCodeField(input, status) {
  if (!input) return () => {};
  const group = input.closest('[data-otp-group]');
  const slots = Array.from(group.querySelectorAll('.vasra-mfa-digit'));
  function draw(state) {
   const value = input.value.replace(/[^0-9]/g, '').slice(0,6);
   if (input.value !== value) input.value = value;
   const active = Math.min(value.length,5);
   slots.forEach((slot, index) => {
    slot.textContent = value[index] || '';
    slot.classList.toggle('is-filled', index < value.length);
    slot.classList.toggle('is-current', document.activeElement === input && index === active && state !== 'success');
   });
   group.dataset.state = state || (value.length === 6 ? 'ready' : 'idle');
   input.setAttribute('aria-invalid', state === 'error' ? 'true' : 'false');
  }
  input.addEventListener('input', () => {
   if (group.dataset.state === 'error' || group.dataset.state === 'success') {
    feedback(status, '', 'info');
   }
   draw('idle');
  });
  input.addEventListener('focus', () => draw(group.dataset.state === 'error' ? 'error' : 'idle'));
  input.addEventListener('blur', () => draw(group.dataset.state === 'error' ? 'error' : 'idle'));
  group.addEventListener('click', () => input.focus());
  draw();
  return draw;
 }

 function setBusy(form, busy) {
  form.dataset.busy = String(Boolean(busy));
  form.querySelectorAll('button').forEach(button => {button.disabled = Boolean(busy);});
 }

 function loginPanel() {
  const original = $(isKK ? '#kk-login-form' : '#auth-form');
  if (!original) return null;
  let panel = $('#email-mfa-login-challenge');
  if (!panel) {
   panel = document.createElement('section');
   panel.id = 'email-mfa-login-challenge';
   panel.className = 'vasra-mfa-panel vasra-mfa-login';
   panel.setAttribute('aria-labelledby', 'vasra-mfa-login-heading');
   panel.innerHTML =
    '<div class="vasra-mfa-icon">' + mail + '</div>' +
    '<span class="vasra-mfa-eyebrow">ACCOUNT SECURITY</span>' +
    '<h3 id="vasra-mfa-login-heading">Check your email</h3>' +
    '<p class="vasra-mfa-intro">We sent a six-digit verification code to your registered email address.</p>' +
    '<div class="vasra-mfa-expiry"><span class="vasra-mfa-clock" aria-hidden="true">◷</span> Code expires in <strong>5 minutes</strong></div>' +
    '<form id="email-mfa-login-form" class="vasra-mfa-form">' +
    codeMarkup('email-mfa-login-code') +
    '<div class="vasra-mfa-actions">' +
    '<button class="vasra-mfa-button vasra-mfa-primary" type="submit">Verify &amp; Sign In</button>' +
    '<button class="vasra-mfa-button vasra-mfa-secondary" id="email-mfa-back" type="button">Back to login</button>' +
    '</div></form>' +
    '<p class="vasra-mfa-feedback" id="email-mfa-login-status" role="status" aria-live="polite" hidden></p>' +
    '<p class="vasra-mfa-privacy">' + shield + '<span>For your security, never share this code with anyone.</span></p>';
   original.after(panel);
  }
  return {original,panel};
 }

 window.VasraEmail2FA = {
  beginLogin(type, challenge, after) {
   if (type !== kind || typeof challenge?.challenge_id !== 'string') return;
   const ui = loginPanel();
   if (!ui) return;
   const {original,panel} = ui;
   original.hidden = true;
   panel.hidden = false;
   const form = $('#email-mfa-login-form');
   const input = $('#email-mfa-login-code');
   const status = $('#email-mfa-login-status');
   const draw = input._vasraMfaDraw || initCodeField(input, status);
   input._vasraMfaDraw = draw;
   input.value = '';
   draw('idle');
   feedback(status, '', 'info');
   setBusy(form, false);
   input.focus();

   $('#email-mfa-back').onclick = () => {
    panel.hidden = true;
    original.hidden = false;
    original.reset();
    feedback(status, '', 'info');
   };

   form.onsubmit = async event => {
    event.preventDefault();
    if (form.dataset.busy === 'true') return;
    if (!input.reportValidity()) return;
    setBusy(form, true);
    draw('checking');
    feedback(status, 'Checking your verification code…', 'info');
    try {
     const receipt = await request(prefix + '/login/verify', {
      challenge_id: challenge.challenge_id,
      code: input.value
     });
     draw('success');
     feedback(status, 'Code verified! Signing you in securely…', 'success');
     await new Promise(resolve => setTimeout(resolve, 450));
     await after(receipt);
    } catch (error) {
     draw('error');
     feedback(status, error.message || 'Incorrect or expired code. Please try again.', 'error');
     input.focus();
     input.select();
    } finally {
     setBusy(form, false);
    }
   };
  }
 };

 function resumeGoogleChallenge() {
  const challenge = new URLSearchParams(location.search).get('mfa_challenge');
  if (!challenge || !$(isKK ? '#kk-login-form' : '#auth-form') || !/^[a-f0-9-]{36}$/i.test(challenge)) return;
  history.replaceState(null, '', location.pathname);
  window.VasraEmail2FA.beginLogin(kind, {challenge_id:challenge}, async () => {
   location.replace(isKK ? './kk-profile' : './account');
  });
 }

 function attachSettings() {
  const target = $(isKK ? '[data-section="settings"] .kk-settings-grid' : '#panel-settings .settings-layout');
  if (!target || $('#vasra-mfa-settings-card')) return;
  const card = document.createElement('article');
  card.id = 'vasra-mfa-settings-card';
  card.className = (isKK ? 'kk-settings-card ' : 'settings-card ') + 'vasra-mfa-panel vasra-mfa-settings';
  card.innerHTML =
   '<div class="vasra-mfa-setting-header">' +
   '<div class="vasra-mfa-setting-icon">' + shield + '</div>' +
   '<div class="vasra-mfa-heading"><span class="vasra-mfa-eyebrow">EXTRA ACCOUNT PROTECTION</span>' +
   '<h3>Email Two-Factor Authentication</h3>' +
   '<p>Protect your SK VASRA account with a code sent to your email every time you sign in.</p></div>' +
   '<span class="vasra-mfa-badge" id="vasra-mfa-badge" data-state="loading">Checking…</span></div>' +
   '<div class="vasra-mfa-toggle-row">' +
   '<span class="vasra-mfa-toggle-label"><strong>Email verification</strong><small>Require a code at sign-in</small></span>' +
   '<label class="vasra-mfa-switch-wrap"><input id="vasra-mfa-switch" type="checkbox" role="switch" aria-label="Enable email two-factor authentication" disabled><span class="vasra-mfa-track" aria-hidden="true"></span></label>' +
   '</div>' +
   '<p id="vasra-mfa-setting-status" class="vasra-mfa-feedback" role="status" aria-live="polite"></p>' +
   '<form id="vasra-mfa-setting-form" class="vasra-mfa-form vasra-mfa-confirm" hidden>' +
   '<div class="vasra-mfa-confirm-head"><span class="vasra-mfa-confirm-icon">' + mail + '</span>' +
   '<div><strong>Confirm your security change</strong><small>We sent a code to your registered email. Valid for 5 minutes.</small></div></div>' +
   codeMarkup('vasra-mfa-setting-code') +
   '<div class="vasra-mfa-actions">' +
   '<button type="submit" class="vasra-mfa-button vasra-mfa-primary">Confirm change</button>' +
   '<button type="button" class="vasra-mfa-button vasra-mfa-secondary" id="vasra-mfa-setting-cancel">Cancel</button>' +
   '</div></form>';
  target.append(card);
  const control = $('#vasra-mfa-switch');
  const status = $('#vasra-mfa-setting-status');
  const form = $('#vasra-mfa-setting-form');
  const code = $('#vasra-mfa-setting-code');
  const badge = $('#vasra-mfa-badge');
  const draw = initCodeField(code, status);
  let enabled = false;
  let pending = null;

  function displayEnabled(value) {
   enabled = Boolean(value);
   control.checked = enabled;
   control.setAttribute('aria-checked', String(enabled));
   badge.textContent = enabled ? 'Enabled' : 'Disabled';
   badge.dataset.state = enabled ? 'on' : 'off';
  }

  async function refresh() {
   try {
    const state = await request(prefix + '/status');
    displayEnabled(state.enabled);
    control.disabled = !state.available;
    feedback(status, state.available ?
     (enabled ? 'Your account is protected with email verification.' : 'Email verification is off. Turn it on to secure your sign-ins.') :
     'Email 2FA is unavailable until the email service is configured.', state.available ? 'info' : 'error');
   } catch {
    control.disabled = true;
    badge.dataset.state = 'loading';
    badge.textContent = 'Unavailable';
    feedback(status, 'Unable to load your security settings. Please sign in again.', 'error');
   }
  }

  control.addEventListener('change', async () => {
   const next = control.checked;
   control.checked = enabled;
   control.disabled = true;
   feedback(status, 'Requesting your verification code…', 'info');
   try {
    pending = await request(prefix + '/start', {enabled:next});
    form.hidden = false;
    code.value = '';
    draw('idle');
    code.focus();
    feedback(status, 'Verification email requested. Check your inbox and enter the six-digit code.', 'info');
   } catch (error) {
    pending = null;
    form.hidden = true;
    feedback(status, error.message || 'Unable to send verification code.', 'error');
   } finally {
    control.disabled = false;
   }
  });

  $('#vasra-mfa-setting-cancel').addEventListener('click', () => {
   pending = null;
   form.hidden = true;
   code.value = '';
   draw('idle');
   feedback(status, 'Change cancelled. Your 2FA setting remains unchanged.', 'info');
  });

  form.addEventListener('submit', async event => {
   event.preventDefault();
   if (!pending || form.dataset.busy === 'true' || !code.reportValidity()) return;
   setBusy(form, true);
   draw('checking');
   feedback(status, 'Verifying your code…', 'info');
   try {
    const result = await request(prefix + '/verify', {
     challenge_id:pending.challenge_id, code:code.value
    });
    draw('success');
    displayEnabled(result.enabled);
    pending = null;
    feedback(status, enabled ? 'Success! Email 2FA is now enabled.' : 'Success! Email 2FA is now disabled.', 'success');
    await new Promise(resolve => setTimeout(resolve, 650));
    form.hidden = true;
    code.value = '';
    draw('idle');
    await refresh();
    feedback(status, enabled ? 'Success! Email 2FA is now enabled.' : 'Success! Email 2FA is now disabled.', 'success');
   } catch (error) {
    draw('error');
    feedback(status, error.message || 'Incorrect or expired code. Please try again.', 'error');
    code.focus();
    code.select();
   } finally {
    setBusy(form, false);
   }
  });

  if (isKK) {
   refresh();
  } else {
   const observed = $('#panel-settings');
   if (observed) {
    const monitor = new MutationObserver(() => { if (!observed.hidden) refresh(); });
    monitor.observe(observed, {attributes:true, attributeFilter:['hidden']});
    document.addEventListener('click', event => {
     if (event.target.closest('#header-settings,[data-tab="settings"]')) setTimeout(refresh, 100);
    });
   }
  }
 }

 function initialize() { attachSettings(); resumeGoogleChallenge(); }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
 else initialize();
})();
