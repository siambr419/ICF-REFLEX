import { html, mount, $ } from '../utils/dom.js';
import { listAnime } from '../services/anime-service.js';
import { recentEpisodes } from '../services/episode-service.js';
import { animeCard, skeletonCards } from '../components/anime-card.js';
import { imgTag } from '../components/media-img.js';
import { emptyState, load } from '../components/states.js';
import { href } from '../site.js';
import { formatDate } from '../utils/formatters.js';

export default async function newReleases({ root }) {
  mount(root, html`<div class="page-head"><h1>New releases</h1><p>The latest anime added to the catalog and the most recently published episodes.</p></div>
    <section class="section"><h2>New anime</h2><div id="new-anime" class="card-grid">${skeletonCards(6)}</div></section>
    <section class="section"><h2>New episodes</h2><div id="new-eps" class="ep-grid"></div></section>`);
  const a = $('#new-anime'), e = $('#new-eps');
  await Promise.all([
    load(a, async () => { const { items } = await listAnime({ sort: 'recent', size: 18 }); a.className = items.length ? 'card-grid' : ''; mount(a, items.length ? html`${items.map((x) => animeCard(x))}` : emptyState('No anime yet', 'Check back soon.')); }),
    load(e, async () => { const eps = await recentEpisodes(16); e.className = eps.length ? 'ep-grid' : ''; mount(e, eps.length ? html`${eps.map((x) => html`<a class="ep-card" href="${href.watch(x.id)}"><div class="thumb">${imgTag(x.thumbnailUrl, '', 'banner', 320, 180)}</div><h3>${x.animeTitle || 'Episode'}</h3><p class="card-meta">Episode ${x.episodeNumber}${x.title ? ' — ' + x.title : ''} · ${formatDate(x.createdAt)}</p></a>`)}` : emptyState('No episodes yet', 'Published episodes will show up here.')); }),
  ]);
}
