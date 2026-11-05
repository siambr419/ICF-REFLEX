#!/usr/bin/env node
// Tiny static server that mimics firebase.json (clean URLs + rewrites). No dependencies. Usage: node scripts/dev-server.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const port = Number(process.argv[2]) || 5000;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };
const rewrites = [['/anime/', 'anime.html'], ['/watch/', 'watch.html'], ['/genre/', 'genre.html']];

async function resolve(path) {
  const clean = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  for (const [prefix, dest] of rewrites) if (clean.startsWith(prefix)) return join(root, dest);
  const cands = [clean, clean + '.html', join(clean, 'index.html')];
  for (const c of cands) { try { const p = join(root, c); if ((await stat(p)).isFile()) return p; } catch { /* next */ } }
  return null;
}
http.createServer(async (req, res) => {
  const file = await resolve(new URL(req.url, 'http://x').pathname);
  if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(await readFile(file));
}).listen(port, () => console.log(`ICF REFLEX dev server: http://localhost:${port}  (no CSP headers here; use "firebase emulators:start --only hosting" to test them)`));
