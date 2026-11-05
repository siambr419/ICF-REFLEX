import { requireDb, collection, collectionGroup, query, where, getDocs, limit, doc, writeBatch, deleteDoc } from '../firebase/firestore.js';
import { deleteAllMatching } from '../firebase/paging.js';

/*
 * Firestore has no cascading deletes and the Spark plan has no Cloud Functions, so related documents are removed from the browser.
 * Everything is paged (batches <= 400) and idempotent: if a step fails, the error names the step and nothing further is deleted,
 * so the same delete can simply be run again. The anime document itself is removed only after all its children are gone.
 */
const IN_LIMIT = 30; // Firestore `in` query limit
const step = async (name, fn) => {
  try { return await fn(); } catch (e) {
    console.error(`cascade step failed: ${name}`, e);
    throw Object.assign(new Error(`${name} failed`), { code: e.code, userMessage: `Deleting ${name} failed (${e.code || e.message}). Nothing after this step was deleted; run the delete again to continue.` });
  }
};

export async function deleteSourcesOf(episodeIds) {
  let n = 0;
  for (let i = 0; i < episodeIds.length; i += IN_LIMIT) {
    const chunk = episodeIds.slice(i, i + IN_LIMIT);
    n += await deleteAllMatching(() => query(collection(requireDb(), 'episodeSources'), where('episodeId', 'in', chunk)));
  }
  return n;
}
/** Deletes all episodes (and their sources) whose `field` equals `value`, 300 episodes at a time. */
export async function deleteEpisodesWhere(field, value) {
  let n = 0;
  for (;;) {
    const s = await getDocs(query(collection(requireDb(), 'episodes'), where(field, '==', value), limit(300)));
    if (!s.size) return n;
    await deleteSourcesOf(s.docs.map((d) => d.id));
    const b = writeBatch(requireDb()); s.docs.forEach((d) => b.delete(d.ref)); await b.commit();
    n += s.size;
  }
}
const byAnime = (name, id) => () => query(collection(requireDb(), name), where('animeId', '==', id));

/**
 * Removes user references (watch progress + watchlist entries) that point at an anime which NO LONGER EXISTS. firestore.rules only let
 * staff read/delete such documents when the referenced anime is gone, and the path filter below guarantees that only
 * watchProgress/* and watchlists/* documents are touched (collection-group queries also match the catalog's own `episodes`).
 */
export async function cleanupUserReferences(animeId) {
  const progress = await deleteAllMatching(() => query(collectionGroup(requireDb(), 'episodes'), where('animeId', '==', animeId)), { filter: (d) => d.ref.path.startsWith('watchProgress/') });
  const lists = await deleteAllMatching(() => query(collectionGroup(requireDb(), 'items'), where('animeId', '==', animeId)), { filter: (d) => d.ref.path.startsWith('watchlists/') });
  return { progress, watchlists: lists };
}

/** Returns a summary; throws an Error with `userMessage` describing what failed. */
export async function deleteAnimeCascade(id) {
  if (!id) throw Object.assign(new Error('no id'), { userMessage: 'Missing anime id.' });
  const out = { episodes: 0, seasons: 0, featured: 0, posters: 0, progress: 0, watchlists: 0, cleanupError: '' };
  out.episodes = await step('episodes and video sources', () => deleteEpisodesWhere('animeId', id));
  out.seasons = await step('seasons', () => deleteAllMatching(byAnime('seasons', id)));
  out.featured = await step('featured entries', () => deleteAllMatching(byAnime('featuredContent', id)));
  out.posters = await step('poster records', () => deleteAllMatching(byAnime('posters', id)));
  await step('the anime', () => deleteDoc(doc(requireDb(), 'anime', id)));
  try { Object.assign(out, await cleanupUserReferences(id)); }
  catch (e) {
    console.error('user reference cleanup failed', e);
    out.cleanupError = `The anime was deleted, but cleaning user watch history / watchlist references failed (${e.code || e.message}). Use "Clean orphan references" on the Anime page with the slug "${id}".`;
  }
  return out;
}
