import { app } from './config.js';
import { requireDb, doc, getDoc, setDoc, serverTimestamp } from './firestore.js';
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

export async function ensureUserDoc(user, extra = {}) {
  const ref = doc(requireDb(), 'users', user.uid);
  const s = await getDoc(ref);
  if (s.exists()) return;
  await setDoc(ref, {
    uid: user.uid, displayName: (extra.displayName || user.displayName || '').slice(0, 60), email: user.email || '',
    photoURL: '', preferredLanguage: 'en', theme: localStorage.getItem('icf-theme') === 'light' ? 'light' : 'dark',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), accountStatus: 'active',
  });
}
export async function register({ name, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  try { await ensureUserDoc(cred.user, { displayName: name }); } catch (e) { console.warn('Profile document not created:', e.code); }
  try { await sendEmailVerification(cred.user); } catch (e) { console.warn('Verification email failed:', e.code); }
  return cred.user;
}
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  try { await ensureUserDoc(cred.user); } catch (e) { console.warn('ensureUserDoc', e.code); }
  return cred.user;
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
export async function requireAuth() {
  const user = await authReady();
  if (!user) { location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return null; }
  return user;
}
/** Returns {user, role} or null after rendering an "unauthorised" state. UX only: Firestore rules enforce the real limit. */
export async function requireRole(guard) {
  const user = await requireAuth();
  if (!user) return null;
  const role = await getRole(user.uid, { force: true });
  if (!(GUARDS[guard] || []).includes(role)) return { user, role, denied: true };
  return { user, role };
}
