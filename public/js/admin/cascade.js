import { requireDb, collection, query, where, getDocs, doc, writeBatch, deleteDoc } from '../firebase/firestore.js';

/* Firestore has no cascading deletes and Spark has no Cloud Functions, so related documents are removed from the client. */
async function batchDelete(refs) {
  for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(requireDb()); refs.slice(i, i + 400).forEach((r) => b.delete(r)); await b.commit(); }
}
const where_ = async (col, field, value) => (await getDocs(query(collection(requireDb(), col), where(field, '==', value)))).docs;
export async function deleteSourcesOf(episodeIds) {
  const refs = []; for (const id of episodeIds) (await where_('episodeSources', 'episodeId', id)).forEach((d) => refs.push(d.ref));
  await batchDelete(refs);
}
export async function deleteEpisodesWhere(field, value) {
  const eps = await where_('episodes', field, value);
  await deleteSourcesOf(eps.map((d) => d.id)); await batchDelete(eps.map((d) => d.ref));
}
export async function deleteAnimeCascade(id) {
  await deleteEpisodesWhere('animeId', id);
  await batchDelete([...(await where_('seasons', 'animeId', id)), ...(await where_('featuredContent', 'animeId', id))].map((d) => d.ref));
  await deleteDoc(doc(requireDb(), 'anime', id));
}
