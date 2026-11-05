/* Media URL validation. HTTPS only, provider allowlist, no blind transformation of unknown hosts. */
export const PROVIDERS = {
  youtube: { label: 'YouTube (embed)', kind: 'embed' },
  vimeo: { label: 'Vimeo (embed)', kind: 'embed' },
  dailymotion: { label: 'Dailymotion (embed)', kind: 'embed' },
  gdrive: { label: 'Google Drive preview (embed)', kind: 'embed' },
  abyss: { label: 'Abyss.to (embed)', kind: 'embed' },
  direct: { label: 'Direct video file (MP4/WebM)', kind: 'direct' },
};
export const DIRECT_EXT = ['mp4', 'webm', 'ogv', 'm4v'];
/**
 * Abyss.to playback (embed) hosts. The Abyss.to DASHBOARD (dash.abyss.to / abyss.to) is NOT a playback URL and is always rejected.
 * Publicly documented player URLs use the form  https://abysscdn.com/?v=<VIDEO_ID>  (verified only from third-party sources;
 * Abyss.to publishes no public embed documentation that could be fetched). If the Embed URL shown in YOUR Abyss dashboard
 * uses a different host, add it here AND in firebase.json + vercel.json (CSP frame-src) AND firestore.rules (see README).
 * tests/unit/config-sync.test.mjs fails if these places drift apart.
 */
export const ABYSS_EMBED_HOSTS = ['abysscdn.com'];
export const ABYSS_DASHBOARD_HOSTS = ['abyss.to', 'dash.abyss.to'];
const ABYSS_ID = /^[A-Za-z0-9_-]{5,40}$/;
/** Hosts that may ever appear in an iframe src. Keep in sync with firebase.json CSP frame-src. */
export const EMBED_HOSTS = ['www.youtube-nocookie.com', 'player.vimeo.com', 'www.dailymotion.com', 'drive.google.com', ...ABYSS_EMBED_HOSTS];
/** Sandbox tokens for every embed iframe. Popups and top-navigation are deliberately NOT granted. */
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-forms';

/**
 * Admins may paste either a plain URL or the provider's <iframe …> snippet. Only the src attribute is extracted
 * (never the HTML) and it is then validated like any other URL.
 */
export function extractEmbedSrc(input) {
  const s = String(input ?? '').trim();
  if (!/^</.test(s)) return s;
  const m = s.match(/^<iframe\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return m ? (m[1] ?? m[2] ?? '').trim() : '';
}

export function parseHttpsUrl(input) {
  const s = String(input ?? '').trim();
  if (!s) return { ok: false, error: 'Enter a URL.' };
  if (s.length > 2048) return { ok: false, error: 'URL is too long (max 2048 characters).' };
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: 'This is not a valid URL.' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'Only https:// URLs are allowed.' };
  if (u.username || u.password) return { ok: false, error: 'URLs with embedded credentials are not allowed.' };
  return { ok: true, url: u };
}
export function validateImageUrl(input) {
  const r = parseHttpsUrl(input);
  return r.ok ? { ok: true, href: r.url.href } : r;
}
/** Returns a safe https URL or '' (for rendering stored values defensively). */
export const safeHttps = (input) => { const r = parseHttpsUrl(input); return r.ok ? r.url.href : ''; };

const YT_ID = /^[\w-]{11}$/;
const bareHost = (u) => u.hostname.toLowerCase().replace(/^www\./, '');

export function resolveEmbed(rawInput) {
  const input = extractEmbedSrc(rawInput);
  if (!input && String(rawInput ?? '').trim()) return { ok: false, error: 'Could not find an https src in the pasted HTML. Paste the Embed URL itself.' };
  const r = parseHttpsUrl(input);
  if (!r.ok) return r;
  const u = r.url, host = bareHost(u), parts = u.pathname.split('/').filter(Boolean);
  const bad = (m) => ({ ok: false, error: m });
  if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
    let id = '';
    if (host === 'youtu.be') id = parts[0] || '';
    else if (parts[0] === 'watch') id = u.searchParams.get('v') || '';
    else if (parts[0] === 'embed') id = parts[1] || '';
    if (!YT_ID.test(id)) return bad('Could not find a valid YouTube video ID in this URL.');
    return { ok: true, type: 'embed', provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }
  if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
    const i = parts[0] === 'video' ? 1 : 0;
    const id = parts[i] || '';
    if (!/^\d{4,12}$/.test(id)) return bad('Could not find a valid Vimeo video ID in this URL.');
    const hash = u.searchParams.get('h') || (parts[i + 1] && /^[a-f0-9]{6,20}$/i.test(parts[i + 1]) ? parts[i + 1] : '');
    return { ok: true, type: 'embed', provider: 'vimeo', src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}` };
  }
  if (['dailymotion.com', 'dai.ly'].includes(host)) {
    const id = host === 'dai.ly' ? parts[0] : parts[0] === 'embed' ? parts[2] : parts[0] === 'video' ? parts[1] : '';
    if (!/^[a-z0-9]{5,12}$/i.test(id || '')) return bad('Could not find a valid Dailymotion video ID in this URL.');
    return { ok: true, type: 'embed', provider: 'dailymotion', src: `https://www.dailymotion.com/embed/video/${id}` };
  }
  if (host === 'drive.google.com') {
    const i = parts.indexOf('d');
    const id = i >= 0 ? parts[i + 1] : '';
    if (!/^[\w-]{10,}$/.test(id || '')) return bad('Use a Google Drive "file/d/<id>" link.');
    return { ok: true, type: 'embed', provider: 'gdrive', src: `https://drive.google.com/file/d/${id}/preview` };
  }
  if (ABYSS_DASHBOARD_HOSTS.includes(u.hostname.toLowerCase())) return bad('This is an Abyss.to dashboard link, not a playback URL. Open the video in the dashboard and copy its Embed URL.');
  if (ABYSS_EMBED_HOSTS.includes(u.hostname.toLowerCase())) {
    const id = u.searchParams.get('v') || '';
    if (u.pathname !== '/' || !ABYSS_ID.test(id)) return bad('Abyss.to embed URLs look like https://abysscdn.com/?v=VIDEO_ID. Copy the Embed URL from your Abyss.to dashboard.');
    return { ok: true, type: 'embed', provider: 'abyss', src: `https://${u.hostname.toLowerCase()}/?v=${id}` };
  }
  return bad('Unsupported embed provider. Supported: YouTube, Vimeo, Dailymotion, Google Drive, Abyss.to.');
}
export function resolveDirect(input) {
  const r = parseHttpsUrl(input);
  if (!r.ok) return r;
  const ext = r.url.pathname.split('.').pop().toLowerCase();
  if (!DIRECT_EXT.includes(ext)) return { ok: false, error: `Direct video URLs must end in ${DIRECT_EXT.map((e) => '.' + e).join(', ')}.` };
  return { ok: true, type: 'direct', provider: 'direct', src: r.url.href };
}
/** source = { provider, sourceType, embedUrl, directVideoUrl } */
export function resolveSource(source) {
  if (!source) return { ok: false, error: 'No source.' };
  const r = source.sourceType === 'direct' ? resolveDirect(source.directVideoUrl) : resolveEmbed(source.embedUrl);
  if (!r.ok) return r;
  if (source.provider && source.provider !== r.provider) {
    return { ok: false, error: `The URL belongs to "${r.provider}" but the provider is set to "${source.provider}".` };
  }
  return r;
}
/** Defence in depth: re-check before putting anything into an iframe. */
export function isAllowedEmbedSrc(src) {
  const r = parseHttpsUrl(src);
  return r.ok && EMBED_HOSTS.includes(r.url.hostname.toLowerCase());
}
export function parseTracks(text) {
  // One per line: language|label|https://url.vtt
  const tracks = []; const errors = [];
  String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const [lang, label, url] = line.split('|').map((s) => s.trim());
    const u = parseHttpsUrl(url);
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(lang || '') || !label || !u.ok || !/\.(vtt)$/i.test(u.url.pathname)) {
      errors.push(`Line ${i + 1}: use  language|label|https://…/file.vtt`);
    } else tracks.push({ language: lang, label, url: u.url.href, kind: 'subtitles', isDefault: tracks.length === 0 });
  });
  return { tracks, error: errors[0] || '' };
}
