import { html, raw, mount, $, $$ } from '../utils/dom.js';
import * as A from '../services/anime-service.js';
import * as E from '../services/episode-service.js';
import { animeCard, skeletonCards } from '../components/anime-card.js';
import { imgTag } from '../components/media-img.js';
import { emptyState, errorState } from '../components/states.js';
import { explainError } from '../utils/errors.js';
import { truncate, formatDate } from '../utils/formatters.js';
import { href, SITE } from '../site.js';

const rail = (id, title, more) => html`<section class="section" id="sec-${id}" aria-labelledby="h-${id}"><div class="section-head"><h2 id="h-${id}">${title}</h2><a href="${more}">View all</a></div><div class="rail" id="rail-${id}">${skeletonCards(6)}</div></section>`;

export default async function home({ root }) {
  mount(root, html`<h1 class="sr-only">${SITE.name} — ${SITE.tagline}</h1>
    <section id="hero" class="hero" aria-roledescription="carousel" aria-label="Featured anime" tabindex="-1"><div class="hero-skel skeleton"></div></section>
    ${rail('featured', 'Featured anime', '/browse')}
    ${rail('popular', 'Top rated', '/browse?sort=rating')}
    ${rail('latest', 'Latest releases', '/new-releases')}
    <section class="section" aria-labelledby="h-eps"><div class="section-head"><h2 id="h-eps">Recently updated episodes</h2><a href="/new-releases">View all</a></div><div id="rail-episodes" class="ep-grid">${skeletonCards(4)}</div></section>
    <section class="section" aria-labelledby="h-genres"><h2 id="h-genres">Browse by genre</h2><div id="genre-chips" class="chips"></div></section>
    ${rail('recommended', "Editor's picks", '/browse')}`);

  const fill = async (id, fn, hide = false) => {
    const sec = $('#sec-' + id), box = $('#rail-' + id);
    try {
      const items = await fn();
      if (!items.length) { if (hide) sec.hidden = true; else mount(box, emptyState('Nothing here yet', 'New anime will appear here once an admin publishes it.')); box.classList.remove('rail'); return; }
      box.classList.add('rail'); mount(box, html`${items.map((a) => animeCard(a))}`);
    } catch (e) {
      console.error(e); box.classList.remove('rail'); mount(box, errorState(e));
      box.querySelector('[data-retry]')?.addEventListener('click', () => { mount(box, skeletonCards(6)); box.classList.add('rail'); fill(id, fn, hide); });
    }
  };
  const latest = A.listAnime({ sort: 'recent', size: 12 }).then((r) => r.items);
  const heroP = A.getFeatured('hero', 5).catch((e) => { console.warn('hero featured unavailable', e.code, e.message); return []; }).then(async (h) => (h.length ? h : (await latest.catch(() => [])).slice(0, 4)));

  await Promise.all([
    heroP.then(renderHero).catch(() => renderHero([])),
    fill('featured', () => A.getFeatured('featured'), true),
    fill('popular', async () => (await A.listAnime({ sort: 'rating', size: 12 })).items),
    fill('latest', () => latest),
    fill('recommended', () => A.getFeatured('recommended'), true),
    renderEpisodes(),
    renderGenres(),
  ]);
}

function renderHero(items) {
  const el = $('#hero');
  if (!items.length) {
    mount(el, html`<div class="hero-slide"><img src="/assets/placeholders/banner.svg" alt="" width="1280" height="720"><div class="hero-shade"></div>
      <div class="hero-content"><p class="hero-meta">Welcome</p><h2>${SITE.tagline}</h2><p class="hero-desc">Discover anime, build your watchlist and pick up where you left off.</p>
      <div class="hero-actions"><a class="btn btn-primary btn-lg" href="/browse">Browse anime</a><a class="btn btn-lg" href="/register">Create account</a></div></div></div>`);
    return;
  }
  mount(el, html`${items.map((a, i) => html`<article class="hero-slide" data-slide ${i ? raw('hidden') : ''} aria-roledescription="slide" aria-label="${i + 1} of ${items.length}">
      ${imgTag(a.bannerUrl || a.coverUrl || a.posterUrl, '', 'banner', 1280, 720, { eager: i === 0 })}<div class="hero-shade"></div>
      <div class="hero-content"><p class="hero-meta">${[a.animeType, a.releaseYear].filter(Boolean).join(' · ')}</p><h2>${a.title}</h2><p class="hero-desc">${truncate(a.description, 220)}</p>
      <div class="hero-actions"><a class="btn btn-primary btn-lg" href="${href.anime(a.id)}">View details</a></div></div></article>`)}
    ${items.length > 1 ? html`<div class="hero-dots">${items.map((_, i) => html`<button type="button" data-dot="${i}" aria-label="Show slide ${i + 1}" ${i === 0 ? raw('aria-current="true"') : ''}></button>`)}</div>` : ''}`);
  if (items.length < 2) return;
  let cur = 0, timer = null, paused = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.insertAdjacentHTML('beforeend', '<button type="button" class="hero-pause" data-pause aria-pressed="false" aria-label="Pause automatic slide rotation"><svg viewBox="0 0 24 24" aria-hidden="true"><path data-icon d="M8 5v14M16 5v14"/></svg></button>');
  const pauseBtn = $('[data-pause]', el), icon = $('[data-icon]', el);
  const show = (i) => { cur = i; $$('[data-slide]', el).forEach((s, n) => (s.hidden = n !== i)); $$('[data-dot]', el).forEach((d, n) => d.setAttribute('aria-current', String(n === i))); };
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => { if (!reduce && !paused && !timer) timer = setInterval(() => show((cur + 1) % items.length), 8000); };
  const setPaused = (p) => {
    paused = p; pauseBtn.setAttribute('aria-pressed', String(p));
    pauseBtn.setAttribute('aria-label', p ? 'Resume automatic slide rotation' : 'Pause automatic slide rotation');
    icon.setAttribute('d', p ? 'M7 5l12 7-12 7z' : 'M8 5v14M16 5v14');
    el.setAttribute('aria-live', p || reduce ? 'polite' : 'off');
    p ? stop() : start();
  };
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  el.addEventListener('click', (e) => { const d = e.target.closest('[data-dot]'); if (d) show(Number(d.dataset.dot)); });
  el.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show((cur + 1) % items.length); else if (e.key === 'ArrowLeft') show((cur - 1 + items.length) % items.length); });
  el.addEventListener('mouseenter', stop); el.addEventListener('mouseleave', start); el.addEventListener('focusin', stop); el.addEventListener('focusout', start);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (reduce) setPaused(true); else { el.setAttribute('aria-live', 'off'); start(); }
}

async function renderEpisodes() {
  const box = $('#rail-episodes');
  try {
    const eps = await E.recentEpisodes(8);
    if (!eps.length) { mount(box, emptyState('No episodes yet', 'Published episodes will appear here.')); box.classList.remove('ep-grid'); return; }
    mount(box, html`${eps.map((e) => html`<a class="ep-card" href="${href.watch(e.id)}"><div class="thumb">${imgTag(e.thumbnailUrl, '', 'banner', 320, 180)}</div><h3>${e.animeTitle || 'Episode'}</h3><p class="card-meta">Episode ${e.episodeNumber}${e.title ? ' — ' + e.title : ''}</p></a>`)}`);
  } catch (err) {
    console.error(err); box.classList.remove('ep-grid'); mount(box, errorState(err));
    box.querySelector('[data-retry]')?.addEventListener('click', () => { box.classList.add('ep-grid'); mount(box, skeletonCards(4)); renderEpisodes(); });
  }
}
async function renderGenres() {
  const box = $('#genre-chips');
  try {
    const g = await A.getGenres();
    mount(box, g.length ? html`${g.map((x) => html`<a class="chip" href="${href.genre(x.slug || x.id)}">${x.name}</a>`)}` : html`<p class="muted">Genres will appear once an admin creates them.</p>`);
  } catch (err) { mount(box, html`<p class="muted">${explainError(err)}</p>`); }
}
