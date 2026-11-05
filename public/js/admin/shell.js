import { html, raw, mount, $ } from '../utils/dom.js';
import { GUARDS } from '../utils/permissions.js';

const NAV = [
  ['/admin', 'Overview', 'staff'], ['/admin/anime', 'Anime', 'content'], ['/admin/seasons', 'Seasons', 'content'], ['/admin/episodes', 'Episodes', 'content'],
  ['/admin/video', 'Video sources', 'content'], ['/admin/posters', 'Poster Manager', 'content'], ['/admin/genres', 'Genres', 'content'], ['/admin/featured', 'Featured', 'content'],
  ['/admin/users', 'Users', 'admin'], ['/admin/roles', 'Roles', 'super'], ['/admin/reviews', 'Reviews', 'mod'], ['/admin/reports', 'Reports', 'mod'], ['/admin/settings', 'Settings', 'staff'],
];
/** Renders the admin layout and returns the main content element. Hiding links is UX only; Firestore rules enforce access. */
export function adminShell(ctx) {
  const path = location.pathname.replace(/\/$/, '') || '/admin';
  mount(ctx.root, html`<div class="admin"><nav class="admin-nav" aria-label="Admin">${NAV.filter(([, , g]) => GUARDS[g].includes(ctx.role)).map(([h, l]) => html`<a class="chip" href="${h}" ${h === path ? raw('aria-current="true"') : ''}>${l}</a>`)}</nav><div id="admin-main" tabindex="-1"></div></div>`);
  return $('#admin-main', ctx.root);
}
export const badge = (ok, yes = 'Yes', no = 'No') => html`<span class="badge ${ok ? 'badge-ok' : 'badge-warn'}">${ok ? yes : no}</span>`;
