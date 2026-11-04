export function explainError(err) {
  const code = err?.code || '';
  if (!navigator.onLine || code === 'unavailable') return 'You appear to be offline or Firebase is unreachable. Check your connection and try again.';
  if (code === 'app/not-configured') return 'Firebase is not configured yet. Add your project values to public/js/firebase/config.js.';
  if (code === 'permission-denied') return 'You do not have permission to read this data. If you just deployed, make sure firestore.rules is published.';
  if (code === 'resource-exhausted') return 'The free daily Firebase quota has been reached. Please try again later.';
  if (code === 'failed-precondition' && /index/i.test(err.message || '')) { console.warn(err.message); return 'A required Firestore index is missing. Deploy firestore.indexes.json (see README) and try again.'; }
  if (code === 'not-found') return 'The requested item was not found.';
  return err?.message && !code.startsWith('auth/') ? err.message : 'Something went wrong. Please try again.';
}
