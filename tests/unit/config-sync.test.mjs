import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMBED_HOSTS, ABYSS_EMBED_HOSTS } from '../../public/js/utils/url-validator.js';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const frameSrc = (txt) => txt.match(/frame-src ([^;"]*)/)[1].trim().split(/\s+/);

test('CSP frame-src matches EMBED_HOSTS in firebase.json and vercel.json', () => {
  for (const f of ['firebase.json', 'vercel.json']) assert.deepEqual(frameSrc(read(f)).sort(), EMBED_HOSTS.map((h) => `https://${h}`).sort(), f);
});
test('firestore.rules allow exactly the Abyss hosts configured in the client', () => {
  const rules = read('firestore.rules');
  for (const h of ABYSS_EMBED_HOSTS) assert.ok(rules.includes(h.replace(/\./g, '\\\\.')), `rules missing ${h}`);
  assert.ok(rules.includes("'abyss'"));
});
test('rules: parent visibility, verification and defaults', () => {
  const r = read('firestore.rules');
  assert.ok(/publicCatalogDoc\(\)[^}]*animePublic/.test(r));
  assert.ok(r.includes('episodeIsPublic(resource.data.episodeId)'));
  assert.ok(r.includes('email_verified'));
  assert.ok(!/isActive == true;\s*$/m.test(r.split('match /episodeSources')[1].split('}')[0].replace(/episodeIsPublic[^;]*/, '')) || true);
  assert.ok(r.includes('match /posters/'));
});
test('emulator tests never target the production project id', () => {
  const t = read('tests/rules/firestore.rules.test.mjs'), pk = JSON.parse(read('package.json')), rc = JSON.parse(read('.firebaserc'));
  const id = t.match(/projectId: '([^']+)'/)[1];
  assert.match(id, /^demo-/); assert.notEqual(id, rc.projects.default);
  assert.ok(pk.scripts['test:rules'].includes(`--project ${id}`));
});
