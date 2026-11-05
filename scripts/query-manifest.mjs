/*
 * Every Firestore query shape the app runs, written down once. `scripts/generate-indexes.mjs` derives firestore.indexes.json from it and
 * tests/unit/indexes.test.mjs fails when the committed index file and this list disagree. When you add or change a query in
 * public/js, update this list (the `src` field says where each query lives) and run:  npm run indexes
 *
 *   eq   = equality filters        arr = array-contains filters      ineq = range filter field (first order field must match it)
 *   order = [[field, 'asc'|'desc']]   scope 'GROUP' = collection-group query
 */
const SORTS = [['createdAt', 'desc'], ['rating', 'desc'], ['titleLower', 'asc']];
const ANIME_FILTERS = [
  ['none', {}], ['genre', { arr: ['genres'] }], ['year', { eq: ['releaseYear'] }], ['status', { eq: ['status'] }], ['type', { eq: ['animeType'] }], ['search', { arr: ['searchTokens'] }],
];

export const QUERIES = [
  // services/anime-service.js listAnime(): public + one server filter (genre > year > status > type) OR one search token, always ordered by the chosen sort
  ...ANIME_FILTERS.flatMap(([name, f]) => SORTS.map(([field, dir]) => ({
    src: `anime-service.listAnime filter=${name} sort=${field}`, collection: 'anime', eq: ['visibility', ...(f.eq || [])], arr: f.arr || [], order: [[field, dir]],
  }))),
  { src: 'anime-service.getFeatured', collection: 'featuredContent', eq: ['active', 'section'], order: [['sortOrder', 'asc']] },
  { src: 'anime-service.getRelated (no composite needed: equality + array-contains merge)', collection: 'anime', eq: ['visibility'], arr: ['genres'], order: [] },
  { src: 'anime-service.getGenres', collection: 'genres', eq: [], order: [['name', 'asc']] },
  { src: 'episode-service.listSeasons', collection: 'seasons', eq: ['animeId', 'animePublic', 'isPublished'], order: [['sortOrder', 'asc']] },
  { src: 'episode-service.listEpisodes', collection: 'episodes', eq: ['animeId', 'animePublic', 'isPublished'], order: [['episodeNumber', 'asc']] },
  { src: 'episode-service.recentEpisodes', collection: 'episodes', eq: ['animePublic', 'isPublished'], order: [['createdAt', 'desc']] },
  { src: 'episode-service.scheduleEpisodes (upcoming)', collection: 'episodes', eq: ['animePublic', 'isPublished'], ineq: 'releaseAt', order: [['releaseAt', 'asc']] },
  { src: 'episode-service.scheduleEpisodes (recent)', collection: 'episodes', eq: ['animePublic', 'isPublished'], ineq: 'releaseAt', order: [['releaseAt', 'desc']] },
  { src: 'media-service.getSources', collection: 'episodeSources', eq: ['episodeId', 'isActive'], order: [['sortOrder', 'asc']] },
  { src: 'progress-service.listProgressPage', collection: 'episodes', parent: 'watchProgress/{uid}', eq: [], order: [['updatedAt', 'desc']] },
  { src: 'watchlist-service.listWatchlistPage', collection: 'items', parent: 'watchlists/{uid}', eq: [], order: [['addedAt', 'desc']] },
  // admin
  { src: 'admin/poster-manager (type filter)', collection: 'posters', eq: ['type'], order: [['createdAt', 'desc']] },
  { src: 'admin/poster-manager (anime filter)', collection: 'posters', eq: ['animeId'], order: [['createdAt', 'desc']] },
  { src: 'admin/poster-manager (all)', collection: 'posters', eq: [], order: [['createdAt', 'desc']] },
  { src: 'admin/scope loadSeasons / cascade seasons', collection: 'seasons', eq: ['animeId'], order: [] },
  { src: 'admin/scope loadEpisodes / cascade episodes', collection: 'episodes', eq: ['animeId'], order: [] },
  { src: 'admin/source-manager allSources', collection: 'episodeSources', eq: ['episodeId'], order: [] },
  { src: 'admin/cascade sources by episode (in)', collection: 'episodeSources', eq: ['episodeId'], order: [] },
  { src: 'admin/scope mountAnimePicker (title prefix range)', collection: 'anime', eq: [], ineq: 'titleLower', order: [['titleLower', 'asc']] },
  { src: 'admin/anime-manager list + overview recent', collection: 'anime', eq: [], order: [['createdAt', 'desc']] },
  { src: 'admin/cascade posters/featured by anime', collection: 'posters', eq: ['animeId'], order: [] },
  // collection-group queries used to clean orphaned user data (need a COLLECTION_GROUP single-field index on animeId)
  { src: 'admin/cascade cleanupUserReferences (watchProgress)', collection: 'episodes', scope: 'GROUP', eq: ['animeId'], order: [] },
  { src: 'admin/cascade cleanupUserReferences (watchlists)', collection: 'items', scope: 'GROUP', eq: ['animeId'], order: [] },
];

/** Single-field indexes are automatic; a composite index is needed for equality/array-contains combined with ordering or a range on another field. */
export function needsComposite(q) {
  const filters = (q.eq || []).length + (q.arr || []).length;
  const orderFields = (q.order || []).map(([f]) => f);
  const rangeOrOrder = new Set([...(q.ineq ? [q.ineq] : []), ...orderFields]);
  if (q.scope === 'GROUP') return false;
  if (filters === 0) return rangeOrOrder.size > 1;
  return rangeOrOrder.size > 0;
}
/** Canonical composite index definition for a query (fields: equality ASC, array-contains CONTAINS, then order/range fields in order). */
export function deriveIndex(q) {
  if (!needsComposite(q)) return null;
  const fields = [
    ...[...(q.eq || [])].sort().map((fieldPath) => ({ fieldPath, order: 'ASCENDING' })),
    ...[...(q.arr || [])].sort().map((fieldPath) => ({ fieldPath, arrayConfig: 'CONTAINS' })),
  ];
  const orders = q.order?.length ? q.order : [[q.ineq, 'asc']];
  for (const [f, d] of orders) fields.push({ fieldPath: f, order: d === 'desc' ? 'DESCENDING' : 'ASCENDING' });
  return { collectionGroup: q.collection, queryScope: 'COLLECTION', fields };
}
const key = (i) => JSON.stringify([i.collectionGroup, i.queryScope, i.fields]);
export function buildIndexFile() {
  const seen = new Map();
  for (const q of QUERIES) { const i = deriveIndex(q); if (i && !seen.has(key(i))) seen.set(key(i), i); }
  const order = (c) => ['anime', 'episodes', 'seasons', 'episodeSources', 'featuredContent', 'posters'].indexOf(c);
  const indexes = [...seen.values()].sort((a, b) => order(a.collectionGroup) - order(b.collectionGroup));
  const groupField = (collectionGroup) => ({ collectionGroup, fieldPath: 'animeId', indexes: [
    { order: 'ASCENDING', queryScope: 'COLLECTION' }, { order: 'DESCENDING', queryScope: 'COLLECTION' }, { arrayConfig: 'CONTAINS', queryScope: 'COLLECTION' }, { order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' },
  ] });
  const fieldOverrides = [...new Set(QUERIES.filter((q) => q.scope === 'GROUP').map((q) => q.collection))].map(groupField);
  return { indexes, fieldOverrides };
}
