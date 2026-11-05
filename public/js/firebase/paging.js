import { getDocs, query, limit, startAfter, writeBatch, requireDb } from './firestore.js';

/**
 * Reads EVERY document of a query by walking it in pages (no silent caps). The base constraints must give a stable order
 * (an explicit orderBy, or none: Firestore then orders by document id). `max` is a safety fuse, not a hidden limit: when it is
 * hit the function throws instead of returning a truncated list.
 */
export async function fetchAll(baseQuery, { pageSize = 100, max = 20000 } = {}) {
  const out = []; let cursor = null;
  for (;;) {
    const s = await getDocs(cursor ? query(baseQuery, startAfter(cursor), limit(pageSize)) : query(baseQuery, limit(pageSize)));
    out.push(...s.docs);
    if (s.size < pageSize) return out;
    cursor = s.docs.at(-1);
    if (out.length >= max) throw Object.assign(new Error(`More than ${max} documents; refusing to load them all at once.`), { code: 'app/too-many' });
  }
}

/**
 * Deletes every document matched by `makeQuery()` page by page (each page is re-queried, so memory stays flat).
 * `filter(docSnapshot)` can exclude documents that must never be deleted (they are skipped by being ignored when the
 * page is smaller than pageSize; a full page of only-excluded documents aborts instead of looping forever).
 * Returns the number of documents deleted.
 */
export async function deleteAllMatching(makeQuery, { pageSize = 400, filter = null } = {}) {
  let total = 0;
  for (;;) {
    const s = await getDocs(query(makeQuery(), limit(pageSize)));
    if (!s.size) return total;
    const docs = filter ? s.docs.filter(filter) : s.docs;
    if (!docs.length) {
      if (s.size < pageSize) return total;
      throw Object.assign(new Error('A full page of documents is not deletable by this client; stopping.'), { code: 'app/stuck' });
    }
    const b = writeBatch(requireDb()); docs.forEach((d) => b.delete(d.ref)); await b.commit();
    total += docs.length;
    if (s.size < pageSize && docs.length === s.size) return total;
    if (s.size < pageSize) return total; // remaining docs were filtered out
  }
}
