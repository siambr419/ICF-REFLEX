import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUERIES, deriveIndex, needsComposite, buildIndexFile } from '../../scripts/query-manifest.mjs';

const file = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'));
const key = (i) => JSON.stringify([i.collectionGroup, i.queryScope, i.fields]);

test('every query that needs a composite index is covered by firestore.indexes.json', () => {
  const have = new Set(file.indexes.map(key));
  for (const q of QUERIES) { const i = deriveIndex(q); if (i) assert.ok(have.has(key(i)), `missing index for ${q.src}: ${key(i)}`); }
});
test('no unused or duplicate indexes', () => {
  const need = new Set(QUERIES.map(deriveIndex).filter(Boolean).map(key));
  const seen = new Set();
  for (const i of file.indexes) { assert.ok(need.has(key(i)), `unused index ${key(i)}`); assert.ok(!seen.has(key(i)), `duplicate ${key(i)}`); seen.add(key(i)); }
});
test('committed file equals the generated file (run `npm run indexes`)', () => assert.deepEqual(file, buildIndexFile()));
test('collection-group queries have field overrides; public episode/season queries filter on animePublic', () => {
  for (const c of ['episodes', 'items']) assert.ok(file.fieldOverrides.some((o) => o.collectionGroup === c && o.fieldPath === 'animeId' && o.indexes.some((x) => x.queryScope === 'COLLECTION_GROUP')));
  for (const q of QUERIES.filter((x) => /^episode-service/.test(x.src))) assert.ok(q.eq.includes('animePublic') && q.eq.includes('isPublished'), q.src);
});
test('search queries keep a sort (index exists for each sort)', () => {
  for (const f of ['createdAt', 'rating', 'titleLower']) assert.ok(file.indexes.some((i) => i.collectionGroup === 'anime' && i.fields.some((x) => x.fieldPath === 'searchTokens') && i.fields.at(-1).fieldPath === f));
});
test('needsComposite basics', () => {
  assert.equal(needsComposite({ eq: ['a', 'b'], order: [] }), false);
  assert.equal(needsComposite({ eq: ['a'], order: [['b', 'asc']] }), true);
  assert.equal(needsComposite({ eq: [], order: [['b', 'asc']] }), false);
});
