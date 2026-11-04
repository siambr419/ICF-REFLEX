import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHttpsUrl, resolveEmbed, resolveDirect, resolveSource, isAllowedEmbedSrc, parseTracks, safeHttps } from '../public/js/utils/url-validator.js';
import { tokenize, serverToken, matchesQuery } from '../public/js/utils/search.js';
import { slugify, safeNext } from '../public/js/utils/validators.js';

test('rejects unsafe protocols and malformed URLs', () => {
  for (const u of ['javascript:alert(1)', 'data:text/html,<script>', 'http://example.com/a.mp4', 'ftp://x.com/a', 'not a url', '', 'https://user:pw@host.com/x.mp4'])
    assert.equal(parseHttpsUrl(u).ok, false, u);
  assert.equal(parseHttpsUrl('https://example.com/a').ok, true);
  assert.equal(safeHttps('javascript:alert(1)'), '');
});
test('normalises YouTube URLs to nocookie embeds', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0']) {
    const r = resolveEmbed(u); assert.ok(r.ok, u); assert.equal(r.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'); assert.equal(r.provider, 'youtube');
  }
  assert.equal(resolveEmbed('https://www.youtube.com/watch?v=short').ok, false);
});
test('Vimeo, Dailymotion and Drive', () => {
  assert.equal(resolveEmbed('https://vimeo.com/123456789').src, 'https://player.vimeo.com/video/123456789');
  assert.equal(resolveEmbed('https://player.vimeo.com/video/123456789?h=abcdef123456').src, 'https://player.vimeo.com/video/123456789?h=abcdef123456');
  assert.equal(resolveEmbed('https://www.dailymotion.com/video/x8abcd1').src, 'https://www.dailymotion.com/embed/video/x8abcd1');
  assert.equal(resolveEmbed('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing').src, 'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview');
});
test('unknown hosts and look-alike domains are not transformed', () => {
  for (const u of ['https://evil.example/embed/abc', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://notyoutube.com/watch?v=dQw4w9WgXcQ', 'https://vimeo.com.evil.io/123456789'])
    assert.equal(resolveEmbed(u).ok, false, u);
});
test('direct video URLs need a supported extension', () => {
  assert.ok(resolveDirect('https://cdn.example.com/a/b.mp4?x=1').ok);
  assert.ok(resolveDirect('https://cdn.example.com/a/b.WEBM').ok);
  assert.equal(resolveDirect('https://cdn.example.com/page.html').ok, false);
  assert.equal(resolveDirect('http://cdn.example.com/a.mp4').ok, false);
});
test('resolveSource checks provider match', () => {
  assert.equal(resolveSource({ provider: 'vimeo', sourceType: 'embed', embedUrl: 'https://youtu.be/dQw4w9WgXcQ' }).ok, false);
  assert.ok(resolveSource({ provider: 'youtube', sourceType: 'embed', embedUrl: 'https://youtu.be/dQw4w9WgXcQ' }).ok);
  assert.ok(resolveSource({ provider: 'direct', sourceType: 'direct', directVideoUrl: 'https://cdn.example.com/a.mp4' }).ok);
});
test('iframe allowlist', () => {
  assert.ok(isAllowedEmbedSrc('https://player.vimeo.com/video/1234567'));
  assert.equal(isAllowedEmbedSrc('https://evil.example/x'), false);
  assert.equal(isAllowedEmbedSrc('javascript:alert(1)'), false);
});
test('subtitle track parsing', () => {
  const ok = parseTracks('en|English|https://x.com/a.vtt\nja|日本語|https://x.com/b.vtt');
  assert.equal(ok.tracks.length, 2); assert.equal(ok.tracks[0].isDefault, true); assert.equal(ok.error, '');
  assert.ok(parseTracks('en|English|http://x.com/a.vtt').error);
  assert.ok(parseTracks('en|English|https://x.com/a.srt').error);
});
test('search tokens give prefix matching', () => {
  const t = tokenize('Naruto Shippuden', 'ナルト');
  assert.ok(t.includes('nar') && t.includes('shippu') && !t.includes('n'));
  assert.equal(serverToken('naruto shi'), 'naruto');
  assert.ok(matchesQuery({ title: 'Naruto Shippuden', alternativeTitles: [] }, 'naru shi'));
  assert.equal(matchesQuery({ title: 'One Piece' }, 'naruto'), false);
});
test('slug and redirect helpers', () => {
  assert.equal(slugify(' One Piece: Film Red! '), 'one-piece-film-red');
  assert.equal(safeNext('//evil.com'), '/dashboard'); assert.equal(safeNext('https://evil.com'), '/dashboard'); assert.equal(safeNext('/browse?x=1'), '/browse?x=1');
});
