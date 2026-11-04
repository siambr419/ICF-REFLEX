import { app } from './config.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
export * from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

export const db = app ? getFirestore(app) : null;
export const snap = (d) => ({ id: d.id, ...d.data() });
export function requireDb() {
  if (!db) throw Object.assign(new Error('Firebase is not configured yet.'), { code: 'app/not-configured' });
  return db;
}
