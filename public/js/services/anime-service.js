import { requireDb, collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc, snap } from '../firebase/firestore.js';
import { fetchAll } from '../firebase/paging.js';
import { serverToken, matchesQuery } from '../utils/search.js';

export const PAGE_SIZE = 24;
export const SORTS = {
  recent: { label: 'Recently added', field: 'createdAt', dir: 'desc' },
  rating: { label: 'Top rated', field: 'rating', dir: 'desc' },
  title: { label: 'A–Z', field: 'titleLower', dir: 'asc' },
};
const cache = new Map();
let genresCache = null;

export async function getAnime(id) {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  try {
    const d = await getDoc(doc(requireDb(), 'anime', id));
    const v = d.exists() ? snap(d) : null;
    cache.set(id, v); return v;
  } catch (e) {
    // Rules deny reads of missing or unpublished documents to non-staff: treat as "not found".
    if (e.code === 'permission-denied') { cache.set(id, null); return null; }
    throw e;
  }
}
export async function getGenres() {
  if (genresCache) return genresCache;
  const docs = await fetchAll(query(collection(requireDb(), 'genres'), orderBy('name')), { pageSize: 100 });
  return (genresCache = docs.map(snap));
}
/**
 * Catalog query. Firestore cannot combine every filter with every sort without a composite index per combination,
 * so ONE filter (genre > year > status > type) runs on the server and the others are applied to each fetched page.
 * Text search uses ONE searchTokens array-contains on the server (still ordered by the chosen sort); remaining words and all filters run client-side.
 */
export async function listAnime({ sort = 'recent', filters = {}, q = '', cursor = null, size = PAGE_SIZE } = {}) {
  const c = [where('visibility', '==', 'public')];
  const server = new Set();
  const token = serverToken(q);
  const s = SORTS[sort] || SORTS.recent;
  if (token) {
    // Search keeps the selected sort: the server orders the token matches (composite indexes searchTokens+visibility+sort field).
    c.push(where('searchTokens', 'array-contains', token));
    c.push(orderBy(s.field, s.dir));
  } else {
    if (filters.genre) { c.push(where('genres', 'array-contains', filters.genre)); server.add('genre'); }
    else if (filters.year) { c.push(where('releaseYear', '==', Number(filters.year))); server.add('year'); }
    else if (filters.status) { c.push(where('status', '==', filters.status)); server.add('status'); }
    else if (filters.type) { c.push(where('animeType', '==', filters.type)); server.add('type'); }
    c.push(orderBy(s.field, s.dir));
  }
  if (cursor) c.push(startAfter(cursor));
  c.push(limit(size));
  const res = await getDocs(query(collection(requireDb(), 'anime'), ...c));
  let items = res.docs.map(snap);
  if (token) items = items.filter((a) => matchesQuery(a, q));
  items = items.filter((a) =>
    (server.has('genre') || !filters.genre || (a.genres || []).includes(filters.genre)) &&
    (server.has('year') || !filters.year || a.releaseYear === Number(filters.year)) &&
    (server.has('status') || !filters.status || a.status === filters.status) &&
    (server.has('type') || !filters.type || a.animeType === filters.type));
  return { items, cursor: res.docs.at(-1) || null, done: res.size < size };
}
export async function getFeatured(section, max = 12) {
  const s = await getDocs(query(collection(requireDb(), 'featuredContent'), where('active', '==', true), where('section', '==', section), orderBy('sortOrder'), limit(max)));
  const items = await Promise.all(s.docs.map((d) => getAnime(d.data().animeId)));
  return items.filter(Boolean);
}
export async function getRelated(anime, max = 8) {
  const g = anime.genres?.[0]; if (!g) return [];
  const s = await getDocs(query(collection(requireDb(), 'anime'), where('visibility', '==', 'public'), where('genres', 'array-contains', g), limit(max + 1)));
  return s.docs.map(snap).filter((a) => a.id !== anime.id).slice(0, max);
}
