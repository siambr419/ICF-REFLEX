import { requireDb, addDoc, collection, serverTimestamp } from '../firebase/firestore.js';
import { auth } from '../firebase/auth.js';

/** Client-written audit entries are NOT trustworthy evidence (a malicious staff user could skip or forge them). Spark has no server to verify them. */
export async function audit(action, resourceType, resourceId) {
  try {
    const u = auth?.currentUser; if (!u) return;
    await addDoc(collection(requireDb(), 'auditLogs'), { actorUid: u.uid, action, resourceType, resourceId: String(resourceId), createdAt: serverTimestamp() });
  } catch (e) { console.warn('audit entry skipped:', e.code); }
}
