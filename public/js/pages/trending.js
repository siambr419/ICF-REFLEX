import { html, mount, $ } from '../utils/dom.js';
import { getFeatured } from '../services/anime-service.js';
import { animeCard } from '../components/anime-card.js';
import { emptyState, load } from '../components/states.js';

export default async function trending({ root }) {
  mount(root, html`<div class="page-head"><h1>Trending</h1><p>Hand-picked by our editors. A usage-based trending list needs trusted server-side counters, which are not part of the free Spark setup.</p></div><div id="list" class="card-grid"></div>`);
  const box = $('#list');
  await load(box, async () => {
    const items = await getFeatured('trending', 30);
    box.className = items.length ? 'card-grid' : '';
    mount(box, items.length ? html`${items.map((a) => animeCard(a))}` : emptyState('Nothing trending yet', 'Editors have not picked any anime for this list.'));
  });
}
