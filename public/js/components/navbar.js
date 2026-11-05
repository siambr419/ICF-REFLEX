import { html, raw, mount, $, $$ } from '../utils/dom.js';
import { t } from '../i18n.js';
import { configured } from '../firebase/config.js';

const ICON = {
  menu: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'),
  search: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'),
  theme: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'),
};
const LINKS = [['/', 'nav.home'], ['/browse', 'nav.browse'], ['/genres', 'nav.genres'], ['/trending', 'nav.trending'], ['/new-releases', 'nav.newReleases'], ['/schedule', 'nav.schedule']];

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('icf-theme', theme); } catch { /* ignore */ }
}

export function renderNavbar() {
  const el = $('#site-header'); if (!el) return;
  const path = location.pathname.replace(/\/$/, '') || '/';
  mount(el, html`<header class="site-header"><div class="header-inner container">
    <a class="brand" href="/" aria-label="ICF REFLEX home"><img src="/assets/icons/logo.svg" alt="" width="36" height="36"><span class="brand-text">ICF REFLEX</span></a>
    <button class="icon-btn nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="${t('nav.menu')}">${ICON.menu}</button>
    <nav id="primary-nav" class="primary-nav" aria-label="Primary">
      <ul>${LINKS.map(([h, k]) => html`<li><a href="${h}" ${path === h ? raw('aria-current="page"') : ''}>${t(k)}</a></li>`)}</ul>
      <form class="nav-search" role="search" action="/search" method="get">
        <label class="sr-only" for="nav-q">${t('nav.search')}</label>
        <input id="nav-q" name="q" type="search" placeholder="${t('nav.search')}" autocomplete="off" maxlength="60">
        <button class="icon-btn" type="submit" aria-label="Search">${ICON.search}</button>
      </form>
      <div class="nav-auth" id="nav-auth"></div>
    </nav>
    <div class="header-actions">
      <button class="icon-btn" id="theme-toggle" type="button" aria-label="${t('nav.theme')}">${ICON.theme}</button>
      <div id="auth-area"></div>
    </div>
  </div></header>`);

  const toggle = $('#nav-toggle'), nav = $('#primary-nav'), main = $('#main');
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);
    if (main) main.inert = open;
    $('#site-footer') && ($('#site-footer').inert = open);
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); toggle.focus(); } });
  matchMedia('(min-width:1024px)').addEventListener('change', (m) => m.matches && setOpen(false));

  $('#theme-toggle').addEventListener('click', async () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.dispatchEvent(new CustomEvent('icf:theme', { detail: next }));
  });
  renderAuthArea();
}

async function renderAuthArea() {
  const area = $('#auth-area'); if (!area) return;
  const guestLinks = html`<a class="btn btn-sm" href="/login">${t('nav.login')}</a> <a class="btn btn-sm btn-primary" href="/register">${t('nav.register')}</a>`;
  // Guests: buttons in the header from 640px up; on phones they live inside the menu so the header never overflows.
  const guestHtml = html`<div class="guest-actions">${guestLinks}</div>`;
  const showGuest = () => { mount(area, guestHtml); const na = $('#nav-auth'); if (na) mount(na, guestLinks); };
  if (!configured) { showGuest(); return; }
  const { onUser, getRole, logout } = await import('../firebase/auth.js');
  const { isStaff } = await import('../utils/permissions.js');
  onUser(async (user) => {
    if (!user) { showGuest(); return; }
    const na = $('#nav-auth'); if (na) mount(na, html``);
    const role = await getRole(user.uid);
    const initial = (user.displayName || user.email || '?')[0].toUpperCase();
    mount(area, html`<div class="menu-wrap"><button class="icon-btn" id="user-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Account menu"><span class="avatar" aria-hidden="true">${initial}</span></button>
      <div class="menu-panel" id="user-menu" hidden><div class="who">${user.displayName || 'Signed in'}<br>${user.email}</div>
        <a href="/dashboard">${t('nav.dashboard')}</a><a href="/dashboard/watchlist">Watchlist</a><a href="/dashboard/settings">Settings</a>
        ${isStaff(role) ? html`<a href="/admin">${t('nav.admin')}</a>` : ''}
        <button type="button" id="logout-btn">${t('nav.logout')}</button></div></div>`);
    const btn = $('#user-btn'), menu = $('#user-menu');
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', () => { const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', (e) => { if (!area.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
    $('#logout-btn').addEventListener('click', async () => { await logout(); location.href = '/'; });
  });
}
