import { requireDb, collection, query, where, orderBy, limit, getDocs, getDoc, doc, snap, Timestamp } from '../firebase/firestore.js';
import { fetchAll } from '../firebase/paging.js';

/*
 * Public reads must satisfy firestore.rules: a season/episode is readable only when `isPublished == true` AND its parent anime
 * is public. The parent state is denormalised into `animePublic` (kept in sync by the admin panel), so every public query
 * MUST constrain both fields. See firestore.indexes.json for the composite indexes these queries need.
 */
const PUBLIC = () => [where('isPublished', '==', true), where('animePublic', '==', true)];
const guard = async (fn) => { try { return await fn(); } catch (e) { if (e.code === 'permission-denied') return null; throw e; } };

export const getEpisode = (id) => guard(async () => { const d = await getDoc(doc(requireDb(), 'episodes', id)); return d.exists() ? snap(d) : null; });

/** All published seasons of a public anime (paged, never truncated). */
export async function listSeasons(animeId) {
  const docs = await fetchAll(query(collection(requireDb(), 'seasons'), where('animeId', '==', animeId), ...PUBLIC(), orderBy('sortOrder')), { pageSize: 50 });
  return docs.map(snap);
}
/** All published episodes of a public anime (paged, never truncated). */
export async function listEpisodes(animeId) {
  const docs = await fetchAll(query(collection(requireDb(), 'episodes'), where('animeId', '==', animeId), ...PUBLIC(), orderBy('episodeNumber')), { pageSize: 100 });
  return docs.map(snap);
}
/** Orders by season sortOrder, then episode number. */
export function sortEpisodes(episodes, seasons) {
  const order = new Map(seasons.map((s) => [s.id, s.sortOrder ?? s.seasonNumber ?? 0]));
  return [...episodes].sort((a, b) => (order.get(a.seasonId) ?? 0) - (order.get(b.seasonId) ?? 0) || a.episodeNumber - b.episodeNumber);
}
export async function recentEpisodes(n = 12) {
  const s = await getDocs(query(collection(requireDb(), 'episodes'), ...PUBLIC(), orderBy('createdAt', 'desc'), limit(n)));
  return s.docs.map(snap);
}
export async function scheduleEpisodes() {
  const now = Timestamp.now(), col = collection(requireDb(), 'episodes');
  const [up, rec] = await Promise.all([
    getDocs(query(col, ...PUBLIC(), where('releaseAt', '>', now), orderBy('releaseAt', 'asc'), limit(30))),
    getDocs(query(col, ...PUBLIC(), where('releaseAt', '<=', now), orderBy('releaseAt', 'desc'), limit(30))),
  ]);
  return { upcoming: up.docs.map(snap), recent: rec.docs.map(snap) };
}
