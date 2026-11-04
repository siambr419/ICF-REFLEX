/* Title search strategy: every anime stores `searchTokens` (word prefixes, 2–12 chars) built from its title and alternative titles. */
export const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
export const words = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
export function tokenize(...texts) {
  const set = new Set();
  for (const t of texts) for (const w of words(t)) {
    if (w.length === 1) set.add(w);
    for (let i = 2; i <= Math.min(w.length, 12); i++) set.add(w.slice(0, i));
  }
  return [...set].slice(0, 300);
}
/** Picks the most selective word of the query to send to Firestore; the rest is matched client-side. */
export const serverToken = (q) => { const w = words(q).sort((a, b) => b.length - a.length)[0]; return w ? w.slice(0, 12) : ''; };
export const matchesQuery = (anime, q) => { const hay = norm([anime.title, ...(anime.alternativeTitles || [])].join(' ')); return words(q).every((w) => hay.includes(w)); };
