import { html, raw } from '../utils/dom.js';
import { imgTag } from './media-img.js';
import { href } from '../site.js';

export function animeCard(a, { progress = null, removable = false } = {}) {
  const meta = [a.releaseYear, a.status && a.status[0].toUpperCase() + a.status.slice(1), a.rating > 0 ? `★ ${Number(a.rating).toFixed(1)}` : ''].filter(Boolean).join(' · ');
  return html`<article class="card">
    <a class="card-link" href="${href.anime(a.id)}">
      <div class="card-media">${imgTag(a.posterUrl || a.coverUrl, `Poster of ${a.title}`)}<span class="badge">${a.animeType}</span></div>
      <h3 class="card-title">${a.title}</h3><p class="card-meta">${meta}</p>
    </a>
    ${progress != null ? html`<progress max="100" value="${progress}" aria-label="Watched ${progress}%"></progress>` : ''}
    ${removable ? html`<button class="icon-btn card-remove" type="button" data-remove="${a.id}" aria-label="Remove ${a.title} from watchlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
  </article>`;
}
export const skeletonCards = (n = 8) => html`${Array.from({ length: n }, () => html`<div class="card" aria-hidden="true"><div class="skeleton poster-skel"></div><div class="skeleton line"></div><div class="skeleton line short"></div></div>`)}`;
export const skeletonRows = (n = 4) => html`${Array.from({ length: n }, () => html`<div class="skeleton" aria-hidden="true">&nbsp;<br>&nbsp;<br>&nbsp;</div>`)}`;
export const gridOf = (items, opts) => html`${items.map((a) => animeCard(a, opts))}`;
export const raw_ = raw;
