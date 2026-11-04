/* Safe templating: every interpolated value is HTML-escaped unless it was produced by html`` or raw(). */
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
export const raw = (s) => new Safe(s);
const part = (v) => (v == null || v === false ? '' : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
export const html = (strings, ...vals) => new Safe(strings.reduce((o, s, i) => o + s + (i < vals.length ? part(vals[i]) : ''), ''));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const mount = (el, safe) => { el.innerHTML = String(safe); return el; };
export function delegate(root, type, sel, fn) {
  root.addEventListener(type, (e) => { const t = e.target.closest?.(sel); if (t && root.contains(t)) fn(e, t); });
}
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
