import { requireDb, collection, query, orderBy, limit, startAfter, getDocs, getDoc, setDoc, deleteDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { getAnime } from './anime-service.js';

const ref = (uid, animeId) => doc(requireDb(), 'watchlists', uid, 'items', animeId);
export const inWatchlist = async (uid, animeId) => (await getDoc(ref(uid, animeId))).exists();
/** Document id == animeId, so duplicates are impossible. Returns the new state. */
export async function toggleWatchlist(uid, animeId) {
  if (await inWatchlist(uid, animeId)) { await deleteDoc(ref(uid, animeId)); return false; }
  await setDoc(ref(uid, animeId), { animeId, addedAt: serverTimestamp() });
  return true;
}
export const removeFromWatchlist = (uid, animeId) => deleteDoc(ref(uid, animeId));
/** One page of the watchlist (newest first). Entries whose anime was deleted or hidden are skipped, never shown broken. */
export async function listWatchlistPage(uid, { size = 24, cursor = null } = {}) {
  const c = [orderBy('addedAt', 'desc')]; if (cursor) c.push(startAfter(cursor)); c.push(limit(size));
  const s = await getDocs(query(collection(requireDb(), 'watchlists', uid, 'items'), ...c));
  const items = (await Promise.all(s.docs.map((d) => getAnime(snap(d).animeId)))).filter(Boolean);
  return { items, cursor: s.docs.at(-1) || null, done: s.size < size };
}
export const listWatchlist = async (uid, max = 60) => (await listWatchlistPage(uid, { size: max })).items;
