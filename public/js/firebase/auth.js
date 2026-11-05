import { app } from './config.js';
import { requireDb, doc, getDoc, runTransaction, serverTimestamp } from './firestore.js';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  sendEmailVerification, updateProfile, verifyPasswordResetCode, confirmPasswordReset,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import { GUARDS } from '../utils/permissions.js';

// Persistence is explicit (IndexedDB, then localStorage). No popup resolver is loaded because social login is not enabled.
export const auth = app ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }) : null;
export { updateProfile };

export const onUser = (cb) => (auth ? onAuthStateChanged(auth, cb) : (cb(null), () => {}));
export const authReady = () => new Promise((res) => { if (!auth) return res(null); const un = onAuthStateChanged(auth, (u) => { un(); res(u); }); });

const MESSAGES = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Choose a stronger password (8+ characters).',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/invalid-action-code': 'This link is invalid or was already used. Request a new one.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled in your Firebase project yet.',
};
export const friendlyAuthError = (e) => MESSAGES[e?.code] || 'Something went wrong. Please try again.';

const TRANSIENT = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted', 'internal']);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const profileError = (e) => Object.assign(new Error('profile'), {
  code: e?.code, userMessage: e?.code === 'permission-denied'
    ? 'Your account was created, but your profile could not be saved (permission denied). Make sure the latest firestore.rules are deployed, then log in again.'
    : 'Your account was created, but your profile could not be saved. Check your connection, then log in again to retry.',
});
/**
 * Idempotent: creates users/{uid} only when it does not exist (transaction), never overwrites an existing profile and is safe to
 * call from several tabs. Transient failures are retried; any other failure is thrown with a user-facing message (never swallowed).
 */
export async function ensureUserDoc(user, extra = {}) {
  const ref = doc(requireDb(), 'users', user.uid);
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await runTransaction(requireDb(), async (tx) => {
        if ((await tx.get(ref)).exists()) return;
        tx.set(ref, {
          uid: user.uid, displayName: (extra.displayName || user.displayName || '').slice(0, 60), email: user.email || '',
          photoURL: '', preferredLanguage: 'en', theme: localStorage.getItem('icf-theme') === 'light' ? 'light' : 'dark',
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(), accountStatus: 'active',
        });
      });
      return;
    } catch (e) {
      last = e;
      if (!TRANSIENT.has(e?.code)) break;
      await wait(400 * 2 ** attempt);
    }
  }
  console.error('ensureUserDoc failed', last?.code, last?.message);
  throw profileError(last);
}
export async function register({ name, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  let verifyError = null;
  try { await sendEmailVerification(cred.user); } catch (e) { verifyError = e; console.warn('Verification email failed:', e.code); }
  await ensureUserDoc(cred.user, { displayName: name }); // throws a user-facing error; the account itself already exists
  return { user: cred.user, verifyError };
}
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred.user);
  return cred.user;
}
/** Re-reads the account from Firebase and refreshes the ID token so the `email_verified` claim used by firestore.rules is current. */
export async function refreshVerification(user = auth?.currentUser) {
  if (!user) return false;
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  return !!auth.currentUser?.emailVerified;
}
export const logout = () => { sessionStorage.removeItem('icf-role'); return signOut(auth); };
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export const resendVerification = () => sendEmailVerification(auth.currentUser);
export const checkResetCode = (code) => verifyPasswordResetCode(auth, code);
export const applyNewPassword = (code, pw) => confirmPasswordReset(auth, code, pw);

/** Role is read from userRoles/{uid}. Cached 5 minutes in sessionStorage for UI only; admin pages always re-read. */
export async function getRole(uid, { force = false } = {}) {
  if (!force) {
    try { const c = JSON.parse(sessionStorage.getItem('icf-role') || 'null'); if (c && c.uid === uid && Date.now() - c.at < 300000) return c.role; } catch { /* ignore */ }
  }
  let role = 'user';
  try { const s = await getDoc(doc(requireDb(), 'userRoles', uid)); if (s.exists()) role = s.data().role || 'user'; } catch (e) { console.warn('role lookup failed', e.code); }
  try { sessionStorage.setItem('icf-role', JSON.stringify({ uid, role, at: Date.now() })); } catch { /* ignore */ }
  return role;
}
/**
 * Signed-in users are required. With `verified` (default) an unverified email is redirected to /verify-email: Firestore rules block
 * their user data writes anyway (UX + defence in depth). Staff screens pass verified:false so legitimate admins are never locked out.
 */
export async function requireAuth({ verified = true } = {}) {
  const user = await authReady();
  if (!user) { location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return null; }
  if (verified && !user.emailVerified) { location.replace(`/verify-email?next=${encodeURIComponent(location.pathname + location.search)}`); return null; }
  return user;
}
/** Returns {user, role} or null after rendering an "unauthorised" state. UX only: Firestore rules enforce the real limit. */
export async function requireRole(guard) {
  const user = await requireAuth({ verified: false });
  if (!user) return null;
  const role = await getRole(user.uid, { force: true });
  if (!(GUARDS[guard] || []).includes(role)) return { user, role, denied: true };
  return { user, role };
}
