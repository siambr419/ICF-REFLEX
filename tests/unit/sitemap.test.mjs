import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemap, queryIds, STATIC_PAGES } from '../../scripts/generate-sitemap.mjs';

test('sitemap lists public pages and given content only', () => {
  const x = buildSitemap('https://ex.com', { anime: ['one-piece'], genres: ['action'], episodes: ['one-piece_s1e1'] });
  for (const p of ['/', '/anime/one-piece', '/genre/action', '/watch/one-piece_s1e1']) assert.ok(x.includes(`<loc>https://ex.com${p}</loc>`), p);
  assert.ok(!/admin|dashboard|login|register/.test(x));
  assert.equal(STATIC_PAGES.includes('/pricing'), false);
});
test('queryIds pages through results and sends only public filters', async () => {
  const bodies = []; let call = 0;
  const mk = (n, off) => Array.from({ length: n }, (_, i) => ({ document: { name: `projects/p/databases/(default)/documents/anime/a${off + i}` } }));
  const fake = async (_u, init) => { bodies.push(JSON.parse(init.body)); call++; return { ok: true, json: async () => (call === 1 ? mk(300, 0) : mk(5, 300)) }; };
  const ids = await queryIds('p', 'anime', [{ fieldFilter: { field: { fieldPath: 'visibility' }, op: 'EQUAL', value: { stringValue: 'public' } } }], fake);
  assert.equal(ids.length, 305); assert.equal(bodies.length, 2); assert.ok(bodies[1].structuredQuery.startAt);
  assert.equal(bodies[0].structuredQuery.where.fieldFilter.value.stringValue, 'public');
});
