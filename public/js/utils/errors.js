/** Extracts the "create this index" console link Firestore puts in missing-index errors (only a genuine Firebase console URL is returned). */
export function indexLink(err) {
  const m = String(err?.message || '').match(/https:\/\/console\.firebase\.google\.com\/[^\s"')]+/);
  return m ? m[0] : '';
}
export const isMissingIndex = (err) => err?.code === 'failed-precondition' && /index/i.test(err?.message || '');

export function explainError(err) {
  const code = err?.code || '';
  if (!navigator.onLine || code === 'unavailable') return 'You appear to be offline or Firebase is unreachable. Check your connection and try again.';
  if (code === 'app/not-configured') return 'Firebase is not configured yet. Add your project values to public/js/firebase/config.js.';
  if (code === 'permission-denied') return 'You do not have permission to read this data. If you just deployed, make sure firestore.rules is published.';
  if (code === 'resource-exhausted') return 'The free daily Firebase quota has been reached. Please try again later.';
  if (isMissingIndex(err)) {
    // Never swallow this silently: the console shows the exact index definition Firestore wants.
    console.error('[ICF REFLEX] Missing Firestore index. Run "firebase deploy --only firestore:indexes" (see README). Details:', err.message, indexLink(err) || '');
    return 'A required Firestore index is missing or still building. Deploy firestore.indexes.json with "firebase deploy --only firestore:indexes" (see README), wait a few minutes, then retry.';
  }
  if (code === 'not-found') return 'The requested item was not found.';
  if (code === 'app/too-many') return err.message;
  return err?.message && !code.startsWith('auth/') ? err.message : 'Something went wrong. Please try again.';
}
