import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEmbed, resolveSource, extractEmbedSrc, isAllowedEmbedSrc } from '../../public/js/utils/url-validator.js';
import { SOURCE_DEFAULTS, buildSourceData } from '../../public/js/utils/source-model.js';

const ok = 'https://abysscdn.com/?v=K8R6OOjS7';
test('Abyss embed URL is accepted as supplied', () => {
  const r = resolveEmbed(ok); assert.ok(r.ok); assert.equal(r.provider, 'abyss'); assert.equal(r.src, ok);
  assert.ok(isAllowedEmbedSrc(r.src));
});
test('iframe snippets are reduced to the validated src, never stored as HTML', () => {
  assert.equal(extractEmbedSrc(`<IFRAME SRC="${ok}" WIDTH=640 allowfullscreen></IFRAME>`), ok);
  assert.ok(resolveEmbed(`<iframe src='${ok}'></iframe>`).ok);
  assert.equal(resolveEmbed('<iframe src="javascript:alert(1)"></iframe>').ok, false);
  assert.equal(resolveEmbed('<script>alert(1)</script>').ok, false);
  assert.equal(resolveEmbed('<iframe srcdoc="<b>x</b>"></iframe>').ok, false);
});
test('unsafe, dashboard and look-alike URLs are rejected', () => {
  for (const u of ['javascript:alert(1)', 'data:text/html,x', 'http://abysscdn.com/?v=K8R6OOjS7', 'https://dash.abyss.to/', 'https://abyss.to/videos', 'https://abysscdn.com.evil.io/?v=K8R6OOjS7', 'https://evil.io/?v=K8R6OOjS7', 'https://abysscdn.com/?v=', 'https://abysscdn.com/x?v=K8R6OOjS7', 'https://u:p@abysscdn.com/?v=K8R6OOjS7'])
    assert.equal(resolveEmbed(u).ok, false, u);
  assert.match(resolveEmbed('https://dash.abyss.to/').error, /dashboard/i);
});
test('provider mismatch is rejected', () => {
  assert.equal(resolveSource({ provider: 'youtube', sourceType: 'embed', embedUrl: ok }).ok, false);
  assert.ok(resolveSource({ provider: 'abyss', sourceType: 'embed', embedUrl: ok }).ok);
});
test('new sources default to inactive and are built safely', () => {
  assert.equal(SOURCE_DEFAULTS.isActive, false);
  const base = { sourceName: 'A', displayLabel: '', provider: 'abyss', embedUrl: ok, directVideoUrl: '', language: 'ja', qualityLabel: '1080p', tracks: '', sortOrder: 1 };
  const d = buildSourceData('ep1', { ...base, isDefault: false, isActive: undefined });
  assert.equal(d.isActive, false); assert.equal(d.sourceType, 'embed'); assert.equal(d.embedUrl, ok); assert.equal(d.directVideoUrl, ''); assert.equal(d.displayLabel, 'A');
  assert.throws(() => buildSourceData('ep1', { ...base, embedUrl: 'https://dash.abyss.to/' }), /dashboard/i);
  assert.throws(() => buildSourceData('ep1', { ...base, tracks: 'en|English|https://x.com/a.vtt' }), /direct/i);
});
test('existing providers and direct files still resolve', () => {
  assert.ok(resolveSource({ provider: 'direct', sourceType: 'direct', directVideoUrl: 'https://cdn.example.com/a.mp4' }).ok);
  assert.ok(resolveSource({ provider: 'youtube', sourceType: 'embed', embedUrl: 'https://youtu.be/dQw4w9WgXcQ' }).ok);
  assert.equal(resolveSource({ provider: 'direct', sourceType: 'direct', directVideoUrl: 'https://cdn.example.com/a.m3u8' }).ok, false);
});
