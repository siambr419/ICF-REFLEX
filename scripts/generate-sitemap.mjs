#!/usr/bin/env node
// Usage: node scripts/generate-sitemap.mjs https://your-domain.example [firebase-project-id]
// Builds public/sitemap.xml from the public static pages plus, read through Firestore's public REST API (no credentials),
//   - anime with visibility == "public"            → /anime/<slug>
//   - genres                                        → /genre/<slug>
//   - episodes with isPublished AND animePublic    → /watch/<id>
// Hidden anime, unpublished episodes, admin, dashboard and auth pages are never listed. Run `npm run sitemap -- https://your-domain`.
// Use --static to skip Firestore (static pages only). Project id defaults to .firebaserc "default".
import { writeFile, readFile } from 'node:fs/promises';

export const STATIC_PAGES = ['/', '/browse', '/genres', '/trending', '/new-releases', '/schedule', '/about', '/contact', '/privacy', '/terms'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function buildSitemap(base, { anime = [], genres = [], episodes = [] } = {}) {
  const enc = encodeURIComponent;
  const urls = [...STATIC_PAGES, ...anime.map((s) => `/anime/${enc(s)}`), ...genres.map((s) => `/genre/${enc(s)}`), ...episodes.map((s) => `/watch/${enc(s)}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(urls)].map((p) => `  <url><loc>${esc(base + p)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
/** Pages through a structured query (ordered by document id) and returns the document ids. */
export async function queryIds(project, collectionId, filters, fetchImpl = fetch) {
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`;
  const ids = []; let last = null;
  for (;;) {
    const structuredQuery = {
      from: [{ collectionId }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 300,
      ...(filters.length ? { where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } } : {}),
      ...(last ? { startAt: { values: [{ referenceValue: last }], before: false } } : {}),
      select: { fields: [{ fieldPath: '__name__' }] },
    };
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ structuredQuery }) });
    if (!res.ok) throw new Error(`Firestore REST ${res.status} for ${collectionId}: ${(await res.text()).slice(0, 200)}`);
    const rows = (await res.json()).filter((r) => r.document);
    for (const r of rows) ids.push(r.document.name.split('/').pop());
    if (rows.length < 300) return ids;
    last = rows.at(-1).document.name;
  }
}
const eq = (field, v) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v } } });

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), flags = new Set(args.filter((a) => a.startsWith('--')));
  const [baseArg, projArg] = args.filter((a) => !a.startsWith('--'));
  const base = (baseArg || '').replace(/\/$/, '');
  if (!/^https:\/\/.+/.test(base)) { console.error('Pass your site origin, e.g. node scripts/generate-sitemap.mjs https://example.com'); process.exit(1); }
  let data = {};
  if (!flags.has('--static')) {
    const project = projArg || JSON.parse(await readFile(new URL('../.firebaserc', import.meta.url), 'utf8')).projects?.default;
    try {
      data = {
        anime: await queryIds(project, 'anime', [eq('visibility', 'public')]),
        genres: await queryIds(project, 'genres', []),
        episodes: await queryIds(project, 'episodes', [eq('isPublished', true), eq('animePublic', true)]),
      };
    } catch (e) { console.error(`Could not read Firestore (${e.message}).\nRe-run with --static to list static pages only, or fix access/network.`); process.exit(1); }
  }
  await writeFile(new URL('../public/sitemap.xml', import.meta.url), buildSitemap(base, data));
  console.log(`public/sitemap.xml written for ${base} (${(data.anime || []).length} anime, ${(data.episodes || []).length} episodes). Add "Sitemap: ${base}/sitemap.xml" to public/robots.txt.`);
}
