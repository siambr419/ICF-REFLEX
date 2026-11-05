import { html, raw, mount, $, debounce } from '../utils/dom.js';
import * as A from '../services/anime-service.js';
import { animeCard, skeletonCards } from '../components/anime-card.js';
import { emptyState, errorState } from '../components/states.js';
import { explainError } from '../utils/errors.js';
import { ENUMS } from '../site.js';
import { cap } from '../utils/formatters.js';

const opt = (v, label, sel) => html`<option value="${v}" ${String(sel) === String(v) ? raw('selected') : ''}>${label}</option>`;

/** Serves /browse, /search and /genre/:slug. */
export default async function browse({ root, page }) {
  const params = new URLSearchParams(location.search);
  const genreSlug = page === 'genre' ? decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '') : params.get('genre') || '';
  const state = { q: params.get('q') || '', genre: genreSlug, year: params.get('year') || '', status: params.get('status') || '', type: params.get('type') || '', sort: params.get('sort') || 'recent' };
  let genres = [];
  try { genres = await A.getGenres(); } catch { /* filters still work without names */ }
  const genreName = genres.find((g) => (g.slug || g.id) === state.genre)?.name || state.genre;
  const title = page === 'genre' ? `${genreName || 'Genre'} anime` : page === 'search' ? 'Search results' : 'Browse anime';
  document.title = `${title} — ICF REFLEX`;
  const years = Array.from({ length: new Date().getFullYear() + 1 - 1969 }, (_, i) => new Date().getFullYear() + 1 - i);

  mount(root, html`<div class="page-head"><h1>${title}</h1><p>Search by title or combine filters. One filter runs on the server; extra filters narrow each loaded page.</p></div>
    <form class="filters" id="filters" role="search">
      <div class="field"><label for="f-q">Search title</label><input id="f-q" name="q" type="search" maxlength="60" value="${state.q}" placeholder="e.g. naruto"></div>
      <div class="field"><label for="f-genre">Genre</label><select id="f-genre" name="genre"><option value="">All</option>${genres.map((g) => opt(g.slug || g.id, g.name, state.genre))}</select></div>
      <div class="field"><label for="f-year">Year</label><select id="f-year" name="year"><option value="">Any</option>${years.map((y) => opt(y, y, state.year))}</select></div>
      <div class="field"><label for="f-status">Status</label><select id="f-status" name="status"><option value="">Any</option>${ENUMS.status.map((s) => opt(s, cap(s), state.status))}</select></div>
      <div class="field"><label for="f-type">Type</label><select id="f-type" name="type"><option value="">Any</option>${ENUMS.type.map((s) => opt(s, s, state.type))}</select></div>
      <div class="field"><label for="f-sort">Sort by</label><select id="f-sort" name="sort">${Object.entries(A.SORTS).map(([k, v]) => opt(k, v.label, state.sort))}</select></div>
      <div class="actions"><button class="btn btn-primary" type="submit">Apply</button><a class="btn" href="/browse">Reset</a></div>
    </form>
    <p id="result-note" class="muted" aria-live="polite"></p>
    <div id="results" class="card-grid"></div><div class="center"><button id="more" class="btn" type="button" hidden>Load more</button></div>`);

  const results = $('#results'), more = $('#more'), note = $('#result-note');
  let cursor = null, count = 0, busy = false;
  const filters = () => ({ genre: state.genre, year: state.year, status: state.status, type: state.type });

  async function load(reset) {
    if (busy) return; busy = true;
    if (reset) { cursor = null; count = 0; mount(results, skeletonCards(8)); more.hidden = true; }
    more.setAttribute('aria-busy', 'true');
    try {
      let items = [], done = false, guard = 0;
      // Client-side filters can empty a page; keep fetching (bounded) until something shows or data ends.
      do {
        const r = await A.listAnime({ sort: state.sort, filters: filters(), q: state.q, cursor });
        items = items.concat(r.items); cursor = r.cursor; done = r.done; guard++;
      } while (!items.length && !done && guard < 4);
      if (reset) results.replaceChildren();
      if (!count && !items.length) { results.classList.remove('card-grid'); mount(results, emptyState('No anime found', 'Try a different title, or clear some filters.', raw('<a class="btn" href="/browse">Clear filters</a>'))); }
      else { results.classList.add('card-grid'); results.insertAdjacentHTML('beforeend', items.map((a) => animeCard(a)).join('')); }
      count += items.length;
      note.textContent = count ? `Showing ${count} result${count === 1 ? '' : 's'}${done ? '' : ' so far'}.` : '';
      more.hidden = done || !cursor;
    } catch (e) {
      console.error(e); results.classList.remove('card-grid'); mount(results, errorState(e));
      $('[data-retry]', results)?.addEventListener('click', () => load(true));
    } finally { busy = false; more.removeAttribute('aria-busy'); }
  }
  $('#filters').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Object.keys(state).forEach((k) => (state[k] = String(fd.get(k) || '').trim()));
    if (page === 'genre') { location.href = state.genre ? `/genre/${encodeURIComponent(state.genre)}` : '/browse'; return; }
    const p = new URLSearchParams(); Object.entries(state).forEach(([k, v]) => v && !(k === 'sort' && v === 'recent') && p.set(k, v));
    history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
    load(true);
  });
  more.addEventListener('click', () => load(false));
  load(true);
}
