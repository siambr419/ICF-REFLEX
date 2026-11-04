import { html, raw, mount, $, delegate } from '../utils/dom.js';
import * as A from '../services/anime-service.js';
import * as E from '../services/episode-service.js';
import { inWatchlist, toggleWatchlist } from '../services/watchlist-service.js';
import { animeCard } from '../components/anime-card.js';
import { imgTag } from '../components/media-img.js';
import { notFoundState, emptyState, load } from '../components/states.js';
import { toast } from '../components/toast.js';
import { authReady } from '../firebase/auth.js';
import { pathId, href } from '../site.js';
import { formatDuration, formatDate, cap } from '../utils/formatters.js';

export default async function animePage({ root }) {
  const id = pathId();
  mount(root, html`<div class="skeleton" aria-busy="true">&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;</div>`);
  await load(root, async () => {
    const a = await A.getAnime(id);
    if (!a) { mount(root, notFoundState('anime')); return; }
    document.title = `${a.title} — ICF REFLEX`;
    document.querySelector('meta[name=description]')?.setAttribute('content', (a.description || '').slice(0, 160));
    const [seasons, episodes, genres, related, user] = await Promise.all([
      E.listSeasons(id).catch(() => []), E.listEpisodes(id).catch(() => []), A.getGenres().catch(() => []), A.getRelated(a).catch(() => []), authReady(),
    ]);
    const ordered = E.sortEpisodes(episodes, seasons);
    const first = ordered[0];
    const gname = (s) => genres.find((g) => (g.slug || g.id) === s)?.name || s;
    let saved = user ? await inWatchlist(user.uid, id).catch(() => false) : false;

    mount(root, html`<div class="detail-hero">${imgTag(a.bannerUrl || a.coverUrl, '', 'banner', 1280, 360)}</div>
      <div class="layout-grid">
        <div class="detail-poster"><div class="card-media">${imgTag(a.posterUrl || a.coverUrl, `Poster of ${a.title}`, 'poster', 300, 450, { eager: true })}</div></div>
        <div class="detail-info">
          <h1>${a.title}</h1>
          ${a.alternativeTitles?.length ? html`<p class="alt-titles">Also known as: ${a.alternativeTitles.join(' · ')}</p>` : ''}
          <div class="meta"><span class="badge">${a.animeType}</span><span class="badge">${a.releaseYear}</span><span class="badge">${cap(a.status)}</span>${a.rating > 0 ? html`<span class="badge">★ ${Number(a.rating).toFixed(1)} / 10</span>` : ''}</div>
          <div class="chips">${(a.genres || []).map((g) => html`<a class="chip" href="${href.genre(g)}">${gname(g)}</a>`)}</div>
          
          <p>${a.description}</p>
          <div class="hero-actions">
            ${first ? html`<a class="btn btn-primary btn-lg" href="${href.watch(first.id)}">Watch episode ${first.episodeNumber}</a>` : html`<span class="btn btn-lg" aria-disabled="true">No episodes yet</span>`}
            ${user ? html`<button class="btn btn-lg" id="wl" type="button" aria-pressed="${String(saved)}">${saved ? 'In watchlist ✓' : 'Add to watchlist'}</button>` : html`<a class="btn btn-lg" href="/login?next=${encodeURIComponent(location.pathname)}">Log in to save</a>`}
          </div>
        </div>
      </div>
      <section class="section" aria-labelledby="h-eps"><h2 id="h-eps">Episodes</h2><div id="eps"></div></section>
      ${related.length ? html`<section class="section"><h2>Related anime</h2><div class="rail">${related.map((r) => animeCard(r))}</div></section>` : ''}`);

    const wl = $('#wl');
    wl?.addEventListener('click', async () => {
      wl.disabled = true;
      try { saved = await toggleWatchlist(user.uid, id); wl.textContent = saved ? 'In watchlist ✓' : 'Add to watchlist'; wl.setAttribute('aria-pressed', String(saved)); toast(saved ? 'Added to your watchlist.' : 'Removed from your watchlist.', 'success'); }
      catch (e) { console.error(e); toast('Could not update your watchlist. Please try again.', 'error'); }
      finally { wl.disabled = false; }
    });

    const box = $('#eps');
    if (!ordered.length) { mount(box, emptyState('No episodes yet', 'Episodes will appear here once they are published.')); return; }
    const groups = seasons.length ? seasons.map((s) => ({ s, eps: ordered.filter((e) => e.seasonId === s.id) })).filter((g) => g.eps.length) : [{ s: null, eps: ordered }];
    const list = (eps) => html`<ul class="ep-list">${eps.map((e) => html`<li><a class="ep-row" href="${href.watch(e.id)}"><div class="thumb">${imgTag(e.thumbnailUrl, '', 'banner', 192, 108)}</div><div><h3>Episode ${e.episodeNumber}${e.title ? ' — ' + e.title : ''}</h3><p>${[formatDuration(e.durationSeconds), formatDate(e.releaseAt)].filter(Boolean).join(' · ')}</p></div></a></li>`)}</ul>`;
    const show = (i) => { mount($('#ep-body'), list(groups[i].eps)); box.querySelectorAll('[role=tab]').forEach((t, n) => t.setAttribute('aria-selected', String(n === i))); };
    mount(box, html`${groups.length > 1 || groups[0].s ? html`<div class="tabs" role="tablist" aria-label="Seasons">${groups.map((g, i) => html`<button class="tab" role="tab" type="button" data-i="${i}" aria-selected="${String(i === 0)}">${g.s?.title || 'Season ' + g.s?.seasonNumber}</button>`)}</div>` : ''}<div id="ep-body" role="tabpanel"></div>`);
    delegate(box, 'click', '[role=tab]', (e, t) => show(Number(t.dataset.i)));
    show(0);
  });
}
