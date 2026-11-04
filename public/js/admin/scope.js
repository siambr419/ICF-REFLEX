import { html, raw } from '../utils/dom.js';
import { requireDb, collection, query, where, orderBy, limit, getDocs, snap } from '../firebase/firestore.js';

export async function loadAnimeOptions() {
  const s = await getDocs(query(collection(requireDb(), 'anime'), orderBy('titleLower'), limit(200)));
  return s.docs.map(snap);
}
export async function loadSeasons(animeId) {
  const s = await getDocs(query(collection(requireDb(), 'seasons'), where('animeId', '==', animeId), limit(100)));
  return s.docs.map(snap).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
export async function loadEpisodes(animeId) {
  const s = await getDocs(query(collection(requireDb(), 'episodes'), where('animeId', '==', animeId), limit(500)));
  return s.docs.map(snap).sort((a, b) => a.seasonId.localeCompare(b.seasonId) || a.episodeNumber - b.episodeNumber);
}
export const selectField = (id, label, options, selected, placeholder) => html`<div class="field"><label for="${id}">${label}</label><select id="${id}"><option value="">${placeholder}</option>${options.map(([v, l]) => html`<option value="${v}" ${v === selected ? raw('selected') : ''}>${l}</option>`)}</select></div>`;
