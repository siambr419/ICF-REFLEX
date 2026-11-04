#!/usr/bin/env node
// Usage: node scripts/generate-sitemap.mjs https://your-domain.example
// Lists the static public pages only. Anime pages are dynamic; extend this script (Firestore export) when you need them indexed.
import { writeFile } from 'node:fs/promises';
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https:\/\/.+/.test(base)) { console.error('Pass your site origin, e.g. https://example.com'); process.exit(1); }
const pages = ['/', '/browse', '/genres', '/trending', '/new-releases', '/schedule', '/pricing', '/about', '/contact', '/privacy', '/terms'];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${base}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(new URL('../public/sitemap.xml', import.meta.url), xml);
console.log(`public/sitemap.xml written for ${base}. Add "Sitemap: ${base}/sitemap.xml" to public/robots.txt.`);
