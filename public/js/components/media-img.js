import { html, raw } from '../utils/dom.js';
import { safeHttps } from '../utils/url-validator.js';
import { PLACEHOLDER } from '../site.js';

/** Lazy image with validated HTTPS URL and a fallback (handled globally in app.js). kind: poster | banner */
export function imgTag(url, alt, kind = 'poster', w = 300, h = 450, { eager = false } = {}) {
  const src = safeHttps(url) || PLACEHOLDER[kind];
  return html`<img src="${src}" alt="${alt}" width="${w}" height="${h}" data-fallback="${kind}" ${eager ? raw('fetchpriority="high"') : raw('loading="lazy" decoding="async"')} referrerpolicy="no-referrer">`;
}
