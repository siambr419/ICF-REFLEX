export const truncate = (s, n = 200) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
export const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null);
export const formatDate = (v, opts = { year: 'numeric', month: 'short', day: 'numeric' }) => { const d = toDate(v); return d && !isNaN(d) ? d.toLocaleDateString(undefined, opts) : ''; };
export const formatDateTime = (v) => { const d = toDate(v); return d && !isNaN(d) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''; };
export const formatDuration = (sec) => { sec = Math.round(Number(sec) || 0); if (!sec) return ''; const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
export const toLocalInput = (v) => { const d = toDate(v); if (!d || isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
