import { requireDb, collection, query, orderBy, limit, getDocs, getDoc, setDoc, deleteDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
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
export async function listWatchlist(uid, max = 60) {
  const s = await getDocs(query(collection(requireDb(), 'watchlists', uid, 'items'), orderBy('addedAt', 'desc'), limit(max)));
  return (await Promise.all(s.docs.map((d) => getAnime(snap(d).animeId)))).filter(Boolean);
}
