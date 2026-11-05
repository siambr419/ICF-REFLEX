import { requireDb, doc, getDoc, updateDoc, serverTimestamp } from '../firebase/firestore.js';

export async function getUserDoc(uid) { const s = await getDoc(doc(requireDb(), 'users', uid)); return s.exists() ? s.data() : null; }
/** Only displayName, photoURL, preferredLanguage and theme may be changed by the owner (enforced by rules). */
export const updateUserDoc = (uid, fields) => updateDoc(doc(requireDb(), 'users', uid), { ...fields, updatedAt: serverTimestamp() });
