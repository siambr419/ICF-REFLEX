import { requireDb, collection, query, where, getDocs, limit, startAfter, orderBy, writeBatch, serverTimestamp } from '../firebase/firestore.js';
import { fetchAll } from '../firebase/paging.js';

/*
 * Seasons and episodes carry `animePublic` (a copy of "is the parent anime public?"). firestore.rules use it to stop hidden anime
 * from leaking their episode lists. Whenever an anime's visibility changes, or after migrating older data, this re-syncs the flag.
 * Updates are batched (<= 400 per commit) and only touch documents whose flag is wrong, so it is cheap to run again.
 */
async function syncCollection(name, animeId, isPublic, extra) {
  const docs = (await fetchAll(query(collection(requireDb(), name), where('animeId', '==', animeId)), { pageSize: 200 })).filter((d) => d.data().animePublic !== isPublic);
  for (let i = 0; i < docs.length; i += 400) {
    const b = writeBatch(requireDb());
    docs.slice(i, i + 400).forEach((d) => b.update(d.ref, { animePublic: isPublic, ...extra() }));
    await b.commit();
  }
  return docs.length;
}
export async function syncAnimeVisibility(animeId, isPublic) {
  const seasons = await syncCollection('seasons', animeId, isPublic, () => ({}));
  const episodes = await syncCollection('episodes', animeId, isPublic, () => ({ updatedAt: serverTimestamp() }));
  return { seasons, episodes };
}
/** One-time migration for data created before `animePublic` existed (also a safe repair tool). */
export async function repairAllVisibility(onProgress = () => {}) {
  const total = { anime: 0, seasons: 0, episodes: 0 }; let cursor = null;
  for (;;) {
    const c = [orderBy('createdAt', 'desc')]; if (cursor) c.push(startAfter(cursor)); c.push(limit(50));
    const s = await getDocs(query(collection(requireDb(), 'anime'), ...c));
    for (const d of s.docs) {
      const r = await syncAnimeVisibility(d.id, d.data().visibility === 'public');
      total.anime++; total.seasons += r.seasons; total.episodes += r.episodes; onProgress(total);
    }
    if (s.size < 50) return total;
    cursor = s.docs.at(-1);
  }
}
