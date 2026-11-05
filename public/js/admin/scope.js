import { html, raw, mount, $, debounce } from '../utils/dom.js';
import { requireDb, collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc, snap } from '../firebase/firestore.js';
import { fetchAll } from '../firebase/paging.js';
import { norm } from '../utils/search.js';

/* Admin scope loaders. Everything is paged to completion (no silent caps like 100 seasons / 500 episodes). */
export async function loadSeasons(animeId) {
  const docs = await fetchAll(query(collection(requireDb(), 'seasons'), where('animeId', '==', animeId)), { pageSize: 100 });
  return docs.map(snap).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
export async function loadEpisodes(animeId) {
  const docs = await fetchAll(query(collection(requireDb(), 'episodes'), where('animeId', '==', animeId)), { pageSize: 200 });
  return docs.map(snap).sort((a, b) => a.seasonId.localeCompare(b.seasonId, undefined, { numeric: true }) || a.episodeNumber - b.episodeNumber);
}
export async function getAnimeDoc(id) { const d = await getDoc(doc(requireDb(), 'anime', id)); return d.exists() ? snap(d) : null; }
export const selectField = (id, label, options, selected, placeholder) => html`<div class="field"><label for="${id}">${label}</label><select id="${id}"><option value="">${placeholder}</option>${options.map(([v, l]) => html`<option value="${v}" ${v === selected ? raw('selected') : ''}>${l}</option>`)}</select></div>`;

const PAGE = 25;
/**
 * Searchable, paged anime selector for admin screens (replaces the old "first 200 anime" dropdown).
 * Title-prefix search runs on the server (titleLower range query, single-field index only), results load 25 at a time.
 */
export function mountAnimePicker(host, { onSelect, label = 'Anime' } = {}) {
  mount(host, html`<div class="field"><label for="pick-q">Find ${label.toLowerCase()} by title</label><input id="pick-q" type="search" maxlength="60" placeholder="Start typing a title…" autocomplete="off"></div>
    <div class="field"><label for="scope-anime">${label}</label><select id="scope-anime"><option value="">Select an anime…</option></select><button class="btn btn-sm" id="pick-more" type="button" hidden>Load more</button><p class="help" id="pick-note" role="status"></p></div>`);
  const q = $('#pick-q', host), sel = $('#scope-anime', host), more = $('#pick-more', host), note = $('#pick-note', host);
  let items = [], cursor = null, seq = 0, term = '';
  async function load(reset) {
    const my = ++seq;
    if (reset) { items = []; cursor = null; }
    const c = [];
    if (term) c.push(where('titleLower', '>=', term), where('titleLower', '<=', term + '\uf8ff'));
    c.push(orderBy('titleLower')); if (cursor) c.push(startAfter(cursor)); c.push(limit(PAGE));
    try {
      const s = await getDocs(query(collection(requireDb(), 'anime'), ...c));
      if (my !== seq) return; // a newer search superseded this one
      items = items.concat(s.docs.map(snap)); cursor = s.docs.at(-1) || null;
      const keep = sel.value;
      sel.replaceChildren(new Option('Select an anime…', ''), ...items.map((a) => new Option(`${a.title}${a.visibility === 'public' ? '' : ' (hidden)'}`, a.id, false, a.id === keep)));
      more.hidden = s.size < PAGE; note.textContent = items.length ? `${items.length} loaded${s.size < PAGE ? '' : ' — more available'}.` : 'No anime match.';
    } catch (e) { console.error(e); note.textContent = 'Could not load anime. Check your connection and permissions.'; }
  }
  q.addEventListener('input', debounce(() => { term = norm(q.value.trim()); load(true); }, 300));
  more.addEventListener('click', () => load(false));
  sel.addEventListener('change', () => onSelect(items.find((a) => a.id === sel.value) || null));
  load(true);
  return { reload: () => load(true), selected: () => items.find((a) => a.id === sel.value) || null };
}
