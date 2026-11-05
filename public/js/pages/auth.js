import { html, mount, $ } from '../utils/dom.js';
import { auth, authReady, register, login, resetPassword, resendVerification, refreshVerification, friendlyAuthError, checkResetCode, applyNewPassword } from '../firebase/auth.js';
import { isEmail, validatePassword, validateName, safeNext } from '../utils/validators.js';
import { toast } from '../components/toast.js';
import { sleep } from '../utils/dom.js';

const field = (id, label, type, extra = '') => html`<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" required ${extra}></div>`;
const card = (title, body, links = '') => html`<section class="auth-card" aria-labelledby="auth-title"><h1 id="auth-title">${title}</h1>${body}${links}</section>`;

/** Wires submit: blocks double submits, shows loading + errors. handler returns a promise. */
function bind(form, handler) {
  const err = $('[data-error]', form), btn = $('[type=submit]', form), label = btn.textContent;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.busy) return;
    err.textContent = ''; form.dataset.busy = '1'; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Please wait…';
    try { await handler(Object.fromEntries(new FormData(form))); }
    catch (ex) { err.textContent = ex.userMessage || friendlyAuthError(ex); if (!ex.userMessage) console.warn(ex.code); }
    finally { delete form.dataset.busy; btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = label; }
  });
}
const fail = (m) => Object.assign(new Error(m), { userMessage: m });

export default async function authPage({ root, page }) {
  const q = new URLSearchParams(location.search);
  const next = safeNext(q.get('next'));
  const user = await authReady();
  if (user && ['login', 'register', 'forgot-password'].includes(page)) { location.replace(user.emailVerified ? next : `/verify-email?next=${encodeURIComponent(next)}`); return; }

  if (page === 'login') {
    mount(root, card('Log in', html`<form class="form" novalidate>${field('email', 'Email', 'email', 'autocomplete="email"')}${field('password', 'Password', 'password', 'autocomplete="current-password"')}<p class="form-error" data-error role="alert"></p><button class="btn btn-primary" type="submit">Log in</button></form>`,
      html`<div class="auth-links"><a href="/forgot-password">Forgot password?</a><a href="/register${next !== '/dashboard' ? '?next=' + encodeURIComponent(next) : ''}">Create an account</a></div>`));
    bind($('form', root), async (v) => {
      if (!isEmail(v.email)) throw fail('Enter a valid email address.');
      if (!v.password) throw fail('Enter your password.');
      const u = await login(v.email.trim(), v.password);
      location.replace(u.emailVerified ? next : `/verify-email?next=${encodeURIComponent(next)}`);
    });
  } else if (page === 'register') {
    mount(root, card('Create your account', html`<form class="form" novalidate>${field('name', 'Display name', 'text', 'autocomplete="nickname" maxlength="40"')}${field('email', 'Email', 'email', 'autocomplete="email"')}${field('password', 'Password', 'password', 'autocomplete="new-password"')}<p class="help">At least 8 characters, with a letter and a number.</p>${field('confirm', 'Confirm password', 'password', 'autocomplete="new-password"')}
      <label class="check"><input type="checkbox" name="terms" required> <span>I agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.</span></label><p class="form-error" data-error role="alert"></p><button class="btn btn-primary" type="submit">Create account</button></form>`,
      html`<div class="auth-links"><span>Already registered?</span><a href="/login">Log in</a></div>`));
    bind($('form', root), async (v) => {
      const e = validateName(v.name) || (!isEmail(v.email) && 'Enter a valid email address.') || validatePassword(v.password) || (v.password !== v.confirm && 'Passwords do not match.') || (!v.terms && 'Please accept the terms to continue.');
      if (e) throw fail(e);
      await register({ name: v.name.trim(), email: v.email.trim(), password: v.password });
      location.replace(`/verify-email${next !== '/dashboard' ? '?next=' + encodeURIComponent(next) : ''}`);
    });
  } else if (page === 'forgot-password') {
    mount(root, card('Reset your password', html`<form class="form" novalidate>${field('email', 'Email', 'email', 'autocomplete="email"')}<p class="form-error" data-error role="alert"></p><button class="btn btn-primary" type="submit">Send reset link</button></form>`, html`<div class="auth-links"><a href="/login">Back to log in</a></div>`));
    bind($('form', root), async (v) => {
      if (!isEmail(v.email)) throw fail('Enter a valid email address.');
      try { await resetPassword(v.email.trim()); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
      mount($('form', root), html`<p class="alert alert-ok" role="status">If an account exists for that email, a reset link is on its way. Check your spam folder too.</p>`);
    });
  } else if (page === 'reset-password') {
    const code = q.get('oobCode');
    if (!code) { mount(root, card('Reset password', html`<p>This page opens from the link in your password-reset email. <a href="/forgot-password">Request a new link</a>.</p>`)); return; }
    let email = '';
    try { email = await checkResetCode(code); } catch (e) { mount(root, card('Link problem', html`<p class="alert alert-bad">${friendlyAuthError(e)}</p><p><a class="btn" href="/forgot-password">Request a new link</a></p>`)); return; }
    mount(root, card('Choose a new password', html`<p class="muted">For ${email}</p><form class="form" novalidate>${field('password', 'New password', 'password', 'autocomplete="new-password"')}${field('confirm', 'Confirm password', 'password', 'autocomplete="new-password"')}<p class="form-error" data-error role="alert"></p><button class="btn btn-primary" type="submit">Save password</button></form>`));
    bind($('form', root), async (v) => {
      const e = validatePassword(v.password) || (v.password !== v.confirm && 'Passwords do not match.'); if (e) throw fail(e);
      await applyNewPassword(code, v.password); mount(root, card('Password updated', html`<p class="alert alert-ok">You can now log in with your new password.</p><a class="btn btn-primary" href="/login">Log in</a>`));
    });
  } else if (page === 'verify-email') {
    if (!user) { location.replace('/login?next=/verify-email'); return; }
    if (user.emailVerified) { mount(root, card('Email verified', html`<p class="alert alert-ok">Your email address is verified.</p><a class="btn btn-primary" href="${next}">Continue</a>`)); return; }
    mount(root, card('Verify your email', html`<p>We sent a verification link to <strong>${user.email}</strong>. Open it, then come back here. This page checks automatically, or press the button below.</p><p class="form-error" data-error role="alert"></p><p class="muted" id="verify-status" role="status"></p>
      <div class="hero-actions"><button class="btn btn-primary" id="checked" type="button">I have verified</button><button class="btn" id="resend" type="button">Resend email</button></div>`));
    const err = $('[data-error]', root), status = $('#verify-status', root);
    const done = () => location.replace(next);
    const check = async (manual) => {
      try { if (await refreshVerification(user)) return done(); if (manual) err.textContent = 'Not verified yet. Open the link in the email first (check spam).'; }
      catch (ex) { if (manual) err.textContent = friendlyAuthError(ex); }
    };
    $('#checked').addEventListener('click', () => { err.textContent = ''; check(true); });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check(false));
    const timer = setInterval(() => check(false), 10000); addEventListener('pagehide', () => clearInterval(timer));
    $('#resend').addEventListener('click', async (e) => {
      const b = e.target; b.disabled = true; err.textContent = '';
      try { await resendVerification(); toast('Verification email sent.', 'success'); status.textContent = 'Email sent. You can request another in 60 seconds.'; }
      catch (ex) { err.textContent = friendlyAuthError(ex); }
      await sleep(60000); b.disabled = false; status.textContent = '';
    });
  }
}
