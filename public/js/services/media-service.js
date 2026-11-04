import { requireDb, collection, query, where, orderBy, limit, getDocs, snap } from '../firebase/firestore.js';
import { resolveSource, isAllowedEmbedSrc, safeHttps } from '../utils/url-validator.js';
import { PROVIDERS } from '../utils/url-validator.js';

export async function getSources(episodeId) {
  const s = await getDocs(query(collection(requireDb(), 'episodeSources'), where('episodeId', '==', episodeId), where('isActive', '==', true), orderBy('sortOrder'), limit(20)));
  return s.docs.map(snap);
}
export const pickDefault = (sources) => sources.find((s) => s.isDefault) || sources[0] || null;
export const sourceLabel = (s) => [s.displayLabel || s.sourceName || PROVIDERS[s.provider]?.label || 'Source', s.qualityLabel, s.language].filter(Boolean).join(' · ');

function message(container, text) {
  const d = document.createElement('div'); d.className = 'player-msg'; d.setAttribute('role', 'alert');
  const p = document.createElement('p'); p.textContent = text; d.append(p); container.append(d);
}
/**
 * Builds the player with DOM APIs only (never innerHTML). Embeds go into a sandboxed iframe whose host is re-checked
 * against the allowlist; direct files use the native <video> element.
 */
export function renderPlayer(container, source, { startAt = 0 } = {}) {
  container.replaceChildren();
  const r = resolveSource(source);
  if (!r.ok) { message(container, r.error); return null; }
  if (r.type === 'embed') {
    if (!isAllowedEmbedSrc(r.src)) { message(container, 'This embed host is not allowed.'); return null; }
    const f = document.createElement('iframe');
    f.src = r.src; f.title = 'Video player'; f.allowFullscreen = true;
    f.allow = 'fullscreen; picture-in-picture; encrypted-media';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    container.append(f);
    return { kind: 'embed', el: f };
  }
  const v = document.createElement('video');
  v.controls = true; v.preload = 'metadata'; v.playsInline = true;
  const tracks = (source.tracks || []).filter((t) => safeHttps(t.url));
  if (tracks.length) v.crossOrigin = 'anonymous'; // required for cross-origin .vtt; the video host must send CORS headers
  tracks.forEach((t) => { const el = document.createElement('track'); el.kind = t.kind || 'subtitles'; el.label = t.label; el.srclang = t.language; el.src = safeHttps(t.url); if (t.isDefault) el.default = true; v.append(el); });
  v.src = r.src;
  v.addEventListener('error', () => { container.replaceChildren(); message(container, 'This video could not be played. The host may block playback, the file may be unavailable, or the format may not be supported by your browser. Try another source.'); }, { once: true });
  if (startAt > 5) v.addEventListener('loadedmetadata', () => { v.currentTime = startAt; }, { once: true });
  container.append(v);
  return { kind: 'direct', el: v };
}
