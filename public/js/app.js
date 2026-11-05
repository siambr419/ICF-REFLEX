import { configured } from './firebase/config.js';
import { renderNavbar } from './components/navbar.js';
import { renderFooter } from './components/footer.js';
import { html, mount, $, raw } from './utils/dom.js';
import { errorState, unauthorizedState } from './components/states.js';
import { explainError } from './utils/errors.js';
import { PLACEHOLDER } from './site.js';
import { GUARDS } from './utils/permissions.js';

/** page name (body[data-page]) → module under /js/pages or [module, exportName] */
const ROUTES = {
  home: 'home', browse: 'browse', search: 'browse', genre: 'browse', genres: 'genres', trending: 'trending',
  'new-releases': 'new-releases', schedule: 'schedule', anime: 'anime', watch: 'watch',
  about: 'info', contact: 'info', privacy: 'info', terms: 'info', soon: 'soon',
  login: 'auth', register: 'auth', 'forgot-password': 'auth', 'reset-password': 'auth', 'verify-email': 'auth',
  dashboard: 'dashboard', profile: 'dashboard', watchlist: 'dashboard', 'continue-watching': 'dashboard', history: 'dashboard', settings: 'dashboard',
  admin: ['admin/overview', 'default'], 'admin-anime': ['admin/anime-manager', 'default'],
  'admin-seasons': ['admin/episode-manager', 'seasons'], 'admin-episodes': ['admin/episode-manager', 'episodes'],
  'admin-video': ['admin/source-manager', 'default'], 'admin-posters': ['admin/poster-manager', 'default'], 'admin-genres': ['admin/simple-managers', 'genres'],
  'admin-featured': ['admin/simple-managers', 'featured'], 'admin-users': ['admin/user-manager', 'users'],
  'admin-roles': ['admin/user-manager', 'roles'], 'admin-reports': ['admin/report-manager', 'default'],
  'admin-settings': ['admin/overview', 'settings'],
};
const STATIC_PAGES = new Set(['about', 'privacy', 'terms', 'soon', 'contact']);

function setupNotice() {
  return html`<div class="state state-error"><h2>Firebase is not configured yet</h2>
    <p>Open <code>public/js/firebase/config.js</code> and paste the web-app values from your own Firebase project, then reload. Step-by-step instructions are in the README.</p></div>`;
}

async function boot() {
  renderNavbar(); renderFooter();
  // Broken image → fallback placeholder (error events do not bubble, so use capture; inline handlers are blocked by CSP)
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.dataset.fallback && !img.dataset.failed) { img.dataset.failed = '1'; img.src = PLACEHOLDER[img.dataset.fallback] || PLACEHOLDER.poster; }
  }, true);
  const setOnline = () => {
    $('#offline-banner')?.remove();
    if (!navigator.onLine) $('#site-header').insertAdjacentHTML('afterend', '<div id="offline-banner" class="offline-banner" role="status">You are offline. Some content may be unavailable.</div>');
  };
  addEventListener('online', setOnline); addEventListener('offline', setOnline); setOnline();

  const page = document.body.dataset.page, guard = document.body.dataset.guard, root = $('#app');
  if (!configured && !STATIC_PAGES.has(page)) { mount(root, setupNotice()); return; }
  try {
    const ctx = { page, root, user: null, role: 'user' };
    if (guard) {
      const auth = await import('./firebase/auth.js');
      if (guard === 'auth') { ctx.user = await auth.requireAuth(); if (!ctx.user) return; }
      else if (GUARDS[guard]) {
        const r = await auth.requireRole(guard); if (!r) return;
        if (r.denied) { mount(root, unauthorizedState()); return; }
        Object.assign(ctx, r);
      }
    }
    const [path, name = 'default'] = [].concat(ROUTES[page] || []);
    if (!path) throw new Error(`Unknown page "${page}"`);
    const mod = await import(`./${path.includes('/') ? path : 'pages/' + path}.js`);
    await mod[name](ctx);
  } catch (e) {
    console.error(e);
    mount(root, errorState(e));
    $('[data-retry]', root)?.addEventListener('click', () => location.reload());
  }
}
boot();
