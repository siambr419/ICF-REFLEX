// Browser smoke + responsive test (Playwright). Firebase is replaced by tests/e2e/firebase-stub.js with an in-memory dataset.
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/e2e/run.mjs   → writes tests/e2e/report.json and screenshots/
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(process.env.PW_REQUIRE_FROM || import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../..', import.meta.url)), here = fileURLToPath(new URL('.', import.meta.url));
const INDEXES = JSON.parse(readFileSync(root + 'firestore.indexes.json', 'utf8'));
const stub = readFileSync(here + 'firebase-stub.js', 'utf8');
const T = (s) => ({ seconds: s, toDate: () => new Date(s * 1000) });
const now = Math.floor(Date.now() / 1000);
const mkAnime = (id, title, vis, extra = {}) => ({ title, alternativeTitles: [], slug: id, description: `${title} is a very long description `.repeat(8), posterUrl: '', coverUrl: '', bannerUrl: '', genres: ['action'], releaseYear: 2020, status: 'ongoing', animeType: 'TV', rating: 8, featured: false, visibility: vis, createdAt: T(now), updatedAt: T(now), titleLower: title.toLowerCase(), searchTokens: ['n', 'na', 'nar', 'naru', 'naruto'], ...extra });
const DATA = {
  'anime/naruto': mkAnime('naruto', 'Naruto Shippuden: A Very Long Title That Must Wrap On Small Screens', 'public'),
  'anime/bleach': mkAnime('bleach', 'Bleach', 'public', { rating: 9, titleLower: 'bleach', searchTokens: ['b', 'bl', 'ble', 'blea', 'bleac', 'bleach'] }),
  'anime/secret': mkAnime('secret', 'Secret', 'hidden'),
  'genres/action': { name: 'Action', slug: 'action', description: 'Fights', createdAt: T(now) },
  'userRoles/admin1': { uid: 'admin1', role: 'super_admin' },
  'users/u1': { uid: 'u1', displayName: 'User One', email: 'u1@x.com', photoURL: '', preferredLanguage: 'en', theme: 'dark', createdAt: T(now), updatedAt: T(now), accountStatus: 'active' },
  'featuredContent/hero_naruto': { animeId: 'naruto', section: 'hero', sortOrder: 1, active: true },
  'featuredContent/hero_bleach': { animeId: 'bleach', section: 'hero', sortOrder: 2, active: true },
  'seasons/naruto_s1': { animeId: 'naruto', seasonNumber: 1, title: 'Season 1', description: '', releaseYear: 2020, sortOrder: 1, isPublished: true, animePublic: true },
  'episodeSources/abyss1': { episodeId: 'naruto_s1e1', sourceName: 'Abyss', displayLabel: 'Abyss', provider: 'abyss', sourceType: 'embed', embedUrl: 'https://abysscdn.com/?v=K8R6OOjS7', directVideoUrl: '', language: 'Japanese', qualityLabel: '1080p', tracks: [], isDefault: true, isActive: true, sortOrder: 1, createdAt: T(now), updatedAt: T(now) },
  'episodeSources/mp4': { episodeId: 'naruto_s1e1', sourceName: 'MP4', displayLabel: 'MP4', provider: 'direct', sourceType: 'direct', embedUrl: '', directVideoUrl: 'https://cdn.example.com/a.mp4', language: 'Japanese', qualityLabel: '720p', tracks: [], isDefault: false, isActive: true, sortOrder: 2, createdAt: T(now), updatedAt: T(now) },
  'posters/p1': { title: 'Naruto key art', animeId: 'naruto', imageUrl: 'https://img.example/p.jpg', type: 'poster', altText: 'Key art', isPublished: true, displayOrder: 0, createdAt: T(now), updatedAt: T(now), createdBy: 'admin1' },
  'watchProgress/u1/episodes/naruto_s1e1': { animeId: 'naruto', episodeId: 'naruto_s1e1', currentTimeSeconds: 120, durationSeconds: 1400, completed: false, updatedAt: T(now - 5000), episodeNumber: 1, episodeTitle: 'Homecoming', animeTitle: 'Naruto', posterUrl: '' },
};
for (let i = 1; i <= 12; i++) DATA[`episodes/naruto_s1e${i}`] = { animeId: 'naruto', animeTitle: 'Naruto', seasonId: 'naruto_s1', episodeNumber: i, title: `Episode title number ${i} that is quite long`, description: 'd', thumbnailUrl: '', durationSeconds: 1400, releaseAt: T(now - i * 1000), isPublished: true, animePublic: true, createdAt: T(now - i), updatedAt: T(now) };
DATA['episodes/secret_s1e1'] = { ...DATA['episodes/naruto_s1e1'], animeId: 'secret', seasonId: 'secret_s1', animePublic: false };

const server = spawn('node', [root + 'scripts/dev-server.mjs', '5057'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const VIEWPORTS = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440];
const PAGES = [
  ['/', 'guest'], ['/browse', 'guest'], ['/search?q=naru&sort=title', 'guest'], ['/search?q=naru&sort=rating', 'guest'], ['/genres', 'guest'], ['/genre/action', 'guest'], ['/anime/naruto', 'guest'], ['/anime/secret', 'guest'],
  ['/watch/naruto_s1e1', 'user'], ['/watch/secret_s1e1', 'guest'], ['/login', 'guest'], ['/register', 'guest'], ['/verify-email', 'unverified'], ['/schedule', 'guest'], ['/new-releases', 'guest'], ['/trending', 'guest'], ['/privacy', 'guest'],
  ['/dashboard', 'user'], ['/dashboard/watchlist', 'user'], ['/dashboard/history', 'user'], ['/dashboard/profile', 'user'], ['/dashboard/settings', 'user'],
  ['/admin', 'admin'], ['/admin/anime', 'admin'], ['/admin/seasons', 'admin'], ['/admin/episodes', 'admin'], ['/admin/video', 'admin'], ['/admin/posters', 'admin'], ['/admin/featured', 'admin'], ['/admin/genres', 'admin'],
];
const results = [], failures = [];
mkdirSync(here + 'screenshots', { recursive: true });
for (const w of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 800 : 900 }, isMobile: w < 700, hasTouch: w < 700 });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '/__stub/fb.js';` }));
  await ctx.route('**/__stub/fb.js', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/^https:\/\/(img|cdn)\.example\.com|abysscdn\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<html><body style="background:#123">player</body></html>' }));
  for (const [path, who] of PAGES) {
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
    await page.addInitScript(([d, i, u]) => { window.__DATA__ = d; window.__INDEXES__ = i; localStorage.setItem('stub-user', u); }, [DATA, INDEXES, who]);
    await page.goto('http://localhost:5057' + path, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      wide: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 && r.width > 0 && !e.closest('.table-wrap,.rail,.admin-nav,.dash-nav,.primary-nav,.toast-region,.skip-link,[hidden],.sr-only') && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map((e) => e.tagName + '.' + e.className),
      idx: window.__INDEX_ERRORS__ || [], text: document.querySelector('#app')?.innerText.slice(0, 120).replace(/\s+/g, ' '),
      err: !!document.querySelector('#app .state-error'), denied: /do not have access to this page/.test(document.querySelector('#app')?.innerText || ''),
    }));
    const row = { w, path, who, ...m, errors };
    if (m.overflow > 0 || m.wide.length || errors.length || m.idx.length) failures.push(row);
    if (m.err && !['/anime/secret', '/watch/secret_s1e1'].includes(path)) failures.push({ ...row, why: 'error state shown' });
    if (m.denied && who === 'admin') failures.push({ ...row, why: 'admin denied access' });
    results.push(row);
    if ([320, 390, 1280].includes(w) && ['/', '/anime/naruto', '/watch/naruto_s1e1', '/admin/posters', '/admin/video', '/admin/anime'].includes(path)) await page.screenshot({ path: `${here}screenshots/${w}-${path.replace(/\W+/g, '_')}.png` });
    await page.close();
  }
  // mobile menu, player and admin interactions
  const page = await ctx.newPage();
  await page.addInitScript(([d, i]) => { window.__DATA__ = d; window.__INDEXES__ = i; localStorage.setItem('stub-user', 'guest'); }, [DATA, INDEXES]);
  await page.goto('http://localhost:5057/', { waitUntil: 'load' }); await page.waitForTimeout(500);
  if (w < 1024) {
    await page.click('#nav-toggle'); await page.waitForTimeout(350);
    const box = await page.evaluate(() => { const r = document.querySelector('#primary-nav').getBoundingClientRect(); const l = [...document.querySelectorAll('#primary-nav a')].map((a) => a.getBoundingClientRect().height); return { h: r.height, top: r.top, links: l.length, minLink: Math.min(...l), auth: !!document.querySelector('#nav-auth a') }; });
    if (box.h < 200 || box.top < 60) failures.push({ w, why: 'mobile menu not visible', box });
    if (w < 640 && !box.auth) failures.push({ w, why: 'no auth links in mobile menu' });
    await page.keyboard.press('Escape');
    const open = await page.evaluate(() => document.querySelector('#primary-nav').classList.contains('open')); if (open) failures.push({ w, why: 'menu did not close on Escape' });
  }
  await page.close(); await ctx.close();
}
// player assertions (desktop + phone)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => r.fulfill({ contentType: 'text/javascript', body: `export * from '/__stub/fb.js';` }));
  await ctx.route('**/__stub/fb.js', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await ctx.route(/fonts\.|abysscdn|example\.com/, (r) => r.fulfill({ contentType: 'text/html', body: 'x' }));
  const page = await ctx.newPage();
  await page.addInitScript(([d, i]) => { window.__DATA__ = d; window.__INDEXES__ = i; localStorage.setItem('stub-user', 'user'); }, [DATA, INDEXES]);
  await page.goto('http://localhost:5057/watch/naruto_s1e1'); await page.waitForTimeout(700);
  const p = await page.evaluate(() => { const f = document.querySelector('#player iframe'); const r = document.querySelector('#player').getBoundingClientRect(); return { src: f?.src, sandbox: f?.getAttribute('sandbox'), fs: f?.hasAttribute('allowfullscreen'), allow: f?.allow, ratio: +(r.width / r.height).toFixed(2), hint: document.querySelector('#player-hint')?.textContent, writes: window.__WRITES__, btns: [...document.querySelectorAll('#sources button')].map((b) => b.textContent) }; });
  results.push({ player: p });
  if (p.src !== 'https://abysscdn.com/?v=K8R6OOjS7' || !p.fs || /popups|top-navigation/.test(p.sandbox) || Math.abs(p.ratio - 1.78) > 0.05) failures.push({ why: 'abyss player', p });
  if (!p.writes?.some(([, path]) => path === 'watchProgress/u1/episodes/naruto_s1e1')) failures.push({ why: 'history timestamp not updated on open', p });
  const kept = await page.evaluate(() => 0);
  await page.click('#sources button:nth-child(2)'); await page.waitForTimeout(200);
  const v = await page.evaluate(() => ({ video: !!document.querySelector('#player video') || /could not be played/.test(document.querySelector('#player')?.innerText || ''), iframe: !!document.querySelector('#player iframe') })); if (!v.video || v.iframe) failures.push({ why: 'mp4 source not switching', v });
  await ctx.close();
}
await browser.close(); server.kill();
writeFileSync(here + 'report.json', JSON.stringify({ checked: results.length, failures }, null, 1));
console.log(`checked ${results.length} page loads; failures: ${failures.length}`);
for (const f of failures.slice(0, 25)) console.log(JSON.stringify(f).slice(0, 400));
