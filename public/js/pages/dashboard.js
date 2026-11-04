import { html, raw, mount, $, delegate } from '../utils/dom.js';
import { listWatchlist, removeFromWatchlist } from '../services/watchlist-service.js';
import { listProgress, percent } from '../services/progress-service.js';
import { getUserDoc, updateUserDoc } from '../services/account-service.js';
import { animeCard, skeletonCards } from '../components/anime-card.js';
import { imgTag } from '../components/media-img.js';
import { emptyState, load } from '../components/states.js';
import { toast } from '../components/toast.js';
import { updateProfile, resetPassword, friendlyAuthError } from '../firebase/auth.js';
import { setTheme } from '../components/navbar.js';
import { LANGUAGES, getLang, setLang } from '../i18n.js';
import { validateName } from '../utils/validators.js';
import { validateImageUrl } from '../utils/url-validator.js';
import { formatDateTime } from '../utils/formatters.js';
import { href } from '../site.js';

const TABS = [['/dashboard', 'Overview'], ['/dashboard/profile', 'Profile'], ['/dashboard/watchlist', 'Watchlist'], ['/dashboard/continue-watching', 'Continue watching'], ['/dashboard/history', 'History'], ['/dashboard/reviews', 'Reviews'], ['/dashboard/notifications', 'Notifications'], ['/dashboard/subscription', 'Subscription'], ['/dashboard/settings', 'Settings']];
function shell(root, title) {
  const path = location.pathname.replace(/\/$/, '');
  mount(root, html`<div class="dash"><nav class="dash-nav" aria-label="Dashboard">${TABS.map(([h, l]) => html`<a class="chip" href="${h}" ${path === h ? raw('aria-current="true"') : ''}>${l}</a>`)}</nav><section aria-labelledby="dash-title"><h1 id="dash-title">${title}</h1><div id="dash-body"></div></section></div>`);
  return $('#dash-body', root);
}
const resumeCard = (p) => html`<article class="card"><a class="card-link" href="${href.watch(p.episodeId)}"><div class="card-media">${imgTag(p.posterUrl, `Poster of ${p.animeTitle}`)}</div><h3 class="card-title">${p.animeTitle || 'Anime'}</h3><p class="card-meta">Episode ${p.episodeNumber}${p.episodeTitle ? ' — ' + p.episodeTitle : ''}</p></a><progress max="100" value="${percent(p)}" aria-label="${percent(p)}% watched"></progress></article>`;

const PAGES = {
  async dashboard({ root, user }) {
    const body = shell(root, `Welcome${user.displayName ? ', ' + user.displayName : ''}`);
    mount(body, html`${user.emailVerified ? '' : html`<p class="alert alert-warn">Your email is not verified. <a href="/verify-email">Verify it now</a>.</p>`}
      <section class="section"><div class="section-head"><h2>Continue watching</h2><a href="/dashboard/continue-watching">View all</a></div><div id="cw" class="rail">${skeletonCards(4)}</div></section>
      <section class="section"><div class="section-head"><h2>Your watchlist</h2><a href="/dashboard/watchlist">View all</a></div><div id="wl" class="rail">${skeletonCards(4)}</div></section>`);
    const cw = $('#cw'), wl = $('#wl');
    await Promise.all([
      load(cw, async () => { const p = (await listProgress(user.uid, 20)).filter((x) => !x.completed).slice(0, 8); cw.classList.toggle('rail', !!p.length); mount(cw, p.length ? html`${p.map(resumeCard)}` : emptyState('Nothing in progress', 'Start an episode and it will show up here.')); }),
      load(wl, async () => { const a = (await listWatchlist(user.uid, 12)); wl.classList.toggle('rail', !!a.length); mount(wl, a.length ? html`${a.map((x) => animeCard(x))}` : emptyState('Your watchlist is empty', 'Use "Add to watchlist" on any anime page.', raw('<a class="btn btn-primary" href="/browse">Browse anime</a>'))); }),
    ]);
  },
  async profile({ root, user }) {
    const body = shell(root, 'Profile');
    const doc = (await getUserDoc(user.uid).catch(() => null)) || {};
    mount(body, html`<form class="form" id="pf" novalidate>
      <div class="field"><label for="displayName">Display name</label><input id="displayName" name="displayName" type="text" maxlength="40" value="${user.displayName || doc.displayName || ''}" required></div>
      <div class="field"><label for="email">Email</label><input id="email" type="email" value="${user.email}" disabled></div>
      <div class="field"><label for="photoURL">Profile image URL (https)</label><input id="photoURL" name="photoURL" type="url" maxlength="2048" value="${doc.photoURL || ''}" placeholder="https://…"><p class="help">Optional. Use an image you are allowed to use.</p></div>
      <p class="form-error" data-error role="alert"></p><button class="btn btn-primary" type="submit">Save profile</button></form>`);
    const f = $('#pf', root), err = $('[data-error]', f), btn = $('[type=submit]', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      const name = f.displayName.value.trim(), photo = f.photoURL.value.trim();
      const bad = validateName(name) || (photo && !validateImageUrl(photo).ok && validateImageUrl(photo).error);
      if (bad) { err.textContent = bad; return; }
      btn.disabled = true;
      try { await updateProfile(user, { displayName: name }); await updateUserDoc(user.uid, { displayName: name, photoURL: photo }); toast('Profile saved.', 'success'); }
      catch (ex) { console.error(ex); err.textContent = 'Could not save your profile. Please try again.'; }
      finally { btn.disabled = false; }
    });
  },
  async watchlist({ root, user }) {
    const body = shell(root, 'Watchlist');
    mount(body, html`<div id="list" class="card-grid">${skeletonCards(6)}</div>`);
    const box = $('#list');
    const render = async () => load(box, async () => { const a = await listWatchlist(user.uid); box.className = a.length ? 'card-grid' : ''; mount(box, a.length ? html`${a.map((x) => animeCard(x, { removable: true }))}` : emptyState('Your watchlist is empty', 'Save anime to find them here later.', raw('<a class="btn btn-primary" href="/browse">Browse anime</a>'))); });
    await render();
    delegate(box, 'click', '[data-remove]', async (e, b) => { b.disabled = true; try { await removeFromWatchlist(user.uid, b.dataset.remove); toast('Removed from watchlist.', 'success'); await render(); } catch { toast('Could not remove it. Please try again.', 'error'); b.disabled = false; } });
  },
  async 'continue-watching'({ root, user }) {
    const body = shell(root, 'Continue watching');
    mount(body, html`<div id="list" class="card-grid">${skeletonCards(4)}</div>`);
    const box = $('#list');
    await load(box, async () => { const p = (await listProgress(user.uid)).filter((x) => !x.completed); box.className = p.length ? 'card-grid' : ''; mount(box, p.length ? html`${p.map(resumeCard)}` : emptyState('Nothing in progress', 'Episodes you start but do not finish appear here.')); });
  },
  async history({ root, user }) {
    const body = shell(root, 'Watch history');
    mount(body, html`<div id="list" class="ep-list"></div><p class="help">Showing your 50 most recent episodes. Progress is saved only for direct video files; embedded players report when an episode was opened.</p>`);
    const box = $('#list');
    await load(box, async () => { const p = await listProgress(user.uid, 50); mount(box, p.length ? html`${p.map((x) => html`<a class="list-row" href="${href.watch(x.episodeId)}"><div class="grow"><strong>${x.animeTitle || 'Anime'}</strong><br><span class="muted">Episode ${x.episodeNumber}${x.episodeTitle ? ' — ' + x.episodeTitle : ''}</span></div><span class="badge ${x.completed ? 'badge-ok' : ''}">${x.completed ? 'Watched' : percent(x) + '%'}</span><time class="muted">${formatDateTime(x.updatedAt)}</time></a>`)}` : emptyState('No history yet', 'Watched episodes will be listed here.')); });
  },
  async settings({ root, user }) {
    const body = shell(root, 'Settings');
    const doc = (await getUserDoc(user.uid).catch(() => null)) || {};
    const theme = document.documentElement.getAttribute('data-theme');
    mount(body, html`<form class="form" id="sf">
      <div class="field"><label for="theme">Theme</label><select id="theme" name="theme"><option value="dark" ${theme === 'dark' ? raw('selected') : ''}>Dark</option><option value="light" ${theme === 'light' ? raw('selected') : ''}>Light</option></select></div>
      <div class="field"><label for="lang">Interface language</label><select id="lang" name="lang">${LANGUAGES.map(([c, n, ok]) => html`<option value="${c}" ${c === getLang() ? raw('selected') : ''} ${ok ? '' : raw('disabled')}>${n}${ok ? '' : ' — coming soon'}</option>`)}</select><p class="help">Interface language is separate from subtitle and audio language. Only English is available in this release.</p></div>
      <p class="form-error" data-error role="alert"></p><button class="btn btn-primary" type="submit">Save settings</button></form>
      <section class="section"><h2>Password</h2><p class="muted">We will email a reset link to ${user.email}.</p><button class="btn" id="pw" type="button">Send password reset email</button></section>`);
    $('#sf', root).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target; const btn = $('[type=submit]', f); btn.disabled = true;
      try { setTheme(f.theme.value); setLang(f.lang.value); await updateUserDoc(user.uid, { theme: f.theme.value, preferredLanguage: f.lang.value }); toast('Settings saved.', 'success'); }
      catch { toast('Saved on this device, but could not sync to your account.', 'error'); }
      finally { btn.disabled = false; }
    });
    $('#pw', root).addEventListener('click', async (e) => { e.target.disabled = true; try { await resetPassword(user.email); toast('Reset email sent.', 'success'); } catch (ex) { toast(friendlyAuthError(ex), 'error'); } finally { e.target.disabled = false; } });
  },
};
export default async function dashboard(ctx) { await PAGES[ctx.page](ctx); }
