import { requireDb, collection, query, where, orderBy, limit, getDocs, getDoc, doc, snap, Timestamp } from '../firebase/firestore.js';

const guard = async (fn) => { try { return await fn(); } catch (e) { if (e.code === 'permission-denied') return null; throw e; } };

export const getEpisode = (id) => guard(async () => { const d = await getDoc(doc(requireDb(), 'episodes', id)); return d.exists() ? snap(d) : null; });
export async function listSeasons(animeId) {
  const s = await getDocs(query(collection(requireDb(), 'seasons'), where('animeId', '==', animeId), where('isPublished', '==', true), orderBy('sortOrder'), limit(50)));
  return s.docs.map(snap);
}
export async function listEpisodes(animeId) {
  const s = await getDocs(query(collection(requireDb(), 'episodes'), where('animeId', '==', animeId), where('isPublished', '==', true), orderBy('episodeNumber'), limit(500)));
  return s.docs.map(snap);
}
/** Orders by season sortOrder, then episode number. */
export function sortEpisodes(episodes, seasons) {
  const order = new Map(seasons.map((s) => [s.id, s.sortOrder ?? s.seasonNumber ?? 0]));
  return [...episodes].sort((a, b) => (order.get(a.seasonId) ?? 0) - (order.get(b.seasonId) ?? 0) || a.episodeNumber - b.episodeNumber);
}
export async function recentEpisodes(n = 12) {
  const s = await getDocs(query(collection(requireDb(), 'episodes'), where('isPublished', '==', true), orderBy('createdAt', 'desc'), limit(n)));
  return s.docs.map(snap);
}
export async function scheduleEpisodes() {
  const now = Timestamp.now(), col = collection(requireDb(), 'episodes');
  const [up, rec] = await Promise.all([
    getDocs(query(col, where('isPublished', '==', true), where('releaseAt', '>', now), orderBy('releaseAt', 'asc'), limit(30))),
    getDocs(query(col, where('isPublished', '==', true), where('releaseAt', '<=', now), orderBy('releaseAt', 'desc'), limit(30))),
  ]);
  return { upcoming: up.docs.map(snap), recent: rec.docs.map(snap) };
}
