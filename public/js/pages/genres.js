import { html, mount } from '../utils/dom.js';
import { getGenres } from '../services/anime-service.js';
import { emptyState } from '../components/states.js';
import { href } from '../site.js';
import { load } from '../components/states.js';

export default async function genres({ root }) {
  mount(root, html`<div class="page-head"><h1>Genres</h1><p>Pick a genre to see its anime.</p></div><div id="genre-grid" class="genre-grid"></div>`);
  const box = root.querySelector('#genre-grid');
  await load(box, async () => {
    const g = await getGenres();
    box.className = g.length ? 'genre-grid' : '';
    mount(box, g.length ? html`${g.map((x) => html`<a class="genre-tile" href="${href.genre(x.slug || x.id)}"><h3>${x.name}</h3><p>${x.description || 'Browse anime'}</p></a>`)}` : emptyState('No genres yet', 'An admin can add genres from the admin panel.'));
  });
}
