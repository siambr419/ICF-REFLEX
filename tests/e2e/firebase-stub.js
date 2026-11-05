/* In-memory stand-in for the Firebase web SDK (tests only). Evaluates queries and FAILS with `failed-precondition` (missing index)
   when a query needs a composite index that firestore.indexes.json does not define, so runtime queries are checked against the index file. */
const DATA = window.__DATA__, INDEXES = window.__INDEXES__;
const sentinel = Symbol('serverTimestamp');
export class Timestamp { constructor(s, n = 0) { this.seconds = s; this.nanoseconds = n; } toDate() { return new Date(this.seconds * 1000); } toMillis() { return this.seconds * 1000; } static now() { return new Timestamp(Math.floor(Date.now() / 1000)); } static fromDate(d) { return new Timestamp(Math.floor(d.getTime() / 1000)); } }
export const serverTimestamp = () => sentinel;
const resolve = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === sentinel ? Timestamp.now() : v]));
const val = (v) => (v instanceof Timestamp ? v.seconds : v);
export const getFirestore = () => ({ __db: true });
export const collection = (_db, ...p) => ({ type: 'collection', path: p.join('/'), id: p.at(-1) });
export const collectionGroup = (_db, id) => ({ type: 'group', id, path: id });
export const doc = (a, ...p) => { const path = a.type === 'collection' ? [a.path, ...p].join('/') : p.join('/'); return { type: 'doc', path, id: path.split('/').at(-1) }; };
export const where = (field, op, value) => ({ k: 'where', field, op, value });
export const orderBy = (field, dir = 'asc') => ({ k: 'order', field, dir });
export const limit = (n) => ({ k: 'limit', n });
export const startAfter = (snap) => ({ k: 'after', snap });
export const query = (base, ...c) => ({ ...base, constraints: [...(base.constraints || []), ...c] });
const mkSnap = (path, data) => ({ id: path.split('/').at(-1), ref: { path, id: path.split('/').at(-1), type: 'doc' }, exists: () => !!data, data: () => data });
const err = (code, message) => Object.assign(new Error(message), { code });

function needsIndex(cs) {
  const w = cs.filter((c) => c.k === 'where'), o = cs.filter((c) => c.k === 'order');
  const eq = w.filter((c) => c.op === '==').map((c) => c.field), arr = w.filter((c) => c.op === 'array-contains').map((c) => c.field), rng = w.filter((c) => ['<', '<=', '>', '>='].includes(c.op)).map((c) => c.field);
  const orderFields = new Set([...rng, ...o.map((c) => c.field)]), filters = eq.length + arr.length;
  if (filters === 0 ? orderFields.size <= 1 : orderFields.size === 0) return null;
  const fields = [...eq.sort().map((f) => ({ fieldPath: f, order: 'ASCENDING' })), ...arr.sort().map((f) => ({ fieldPath: f, arrayConfig: 'CONTAINS' }))];
  const ord = o.length ? o : rng.slice(0, 1).map((f) => ({ field: f, dir: 'asc' }));
  ord.forEach((c) => fields.push({ fieldPath: c.field, order: c.dir === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
  return fields;
}
export async function getDocs(q) {
  const cs = q.constraints || [], fields = q.type === 'group' ? null : needsIndex(cs);
  if (fields) {
    const hit = INDEXES.indexes.some((i) => i.collectionGroup === q.id && JSON.stringify(i.fields) === JSON.stringify(fields));
    if (!hit) { const e = err('failed-precondition', `The query requires an index. ${JSON.stringify({ c: q.id, fields })}`); window.__INDEX_ERRORS__ = [...(window.__INDEX_ERRORS__ || []), e.message]; throw e; }
  }
  window.__QUERIES__ = [...(window.__QUERIES__ || []), { c: q.path, cs: cs.map((c) => (c.k === 'where' ? `${c.field}${c.op}${val(c.value)}` : c.k === 'order' ? `order:${c.field}:${c.dir}` : c.k)) }];
  let rows = Object.entries(DATA).filter(([p]) => (q.type === 'group' ? p.split('/').at(-2) === q.id : p.split('/').slice(0, -1).join('/') === q.path)).map(([p, d]) => [p, d]);
  for (const c of cs.filter((x) => x.k === 'where')) {
    rows = rows.filter(([, d]) => { const v = d[c.field]; const w = val(c.value), x = val(v);
      return c.op === '==' ? x === w : c.op === 'array-contains' ? Array.isArray(v) && v.includes(c.value) : c.op === 'in' ? c.value.includes(v) : c.op === '>' ? x > w : c.op === '>=' ? x >= w : c.op === '<' ? x < w : x <= w; });
  }
  const ords = cs.filter((x) => x.k === 'order');
  rows.sort((a, b) => { for (const o of ords) { const x = val(a[1][o.field]), y = val(b[1][o.field]); if (x !== y) return (x > y ? 1 : -1) * (o.dir === 'desc' ? -1 : 1); } return a[0] < b[0] ? -1 : 1; });
  const after = cs.find((x) => x.k === 'after'); if (after) { const i = rows.findIndex(([p]) => p === after.snap.ref.path); rows = rows.slice(i + 1); }
  const lim = cs.find((x) => x.k === 'limit'); if (lim) rows = rows.slice(0, lim.n);
  const docs = rows.map(([p, d]) => mkSnap(p, d));
  return { docs, size: docs.length, empty: !docs.length };
}
export async function getDoc(ref) { const d = DATA[ref.path]; return mkSnap(ref.path, d); }
export async function setDoc(ref, d) { DATA[ref.path] = resolve(d); window.__WRITES__ = [...(window.__WRITES__ || []), ['set', ref.path]]; }
export async function updateDoc(ref, d) { DATA[ref.path] = { ...DATA[ref.path], ...resolve(d) }; window.__WRITES__ = [...(window.__WRITES__ || []), ['update', ref.path]]; }
export async function addDoc(col, d) { const id = 'gen' + Math.random().toString(36).slice(2, 8); DATA[`${col.path}/${id}`] = resolve(d); window.__WRITES__ = [...(window.__WRITES__ || []), ['add', `${col.path}/${id}`]]; return { id }; }
export async function deleteDoc(ref) { delete DATA[ref.path]; }
export const writeBatch = () => { const ops = []; return { update: (r, d) => ops.push(() => updateDoc(r, d)), delete: (r) => ops.push(() => deleteDoc(r)), set: (r, d) => ops.push(() => setDoc(r, d)), commit: async () => { for (const o of ops) await o(); } }; };
export const runTransaction = async (_db, fn) => fn({ get: async (r) => getDoc(r), set: (r, d) => { DATA[r.path] = resolve(d); } });
export const getCountFromServer = async (q) => { const n = (await getDocs(q)).size; return { data: () => ({ count: n }) }; };

/* ---- auth ---- */
const mode = localStorage.getItem('stub-user') || 'guest';
const USERS = { admin: { uid: 'admin1', email: 'admin@x.com', emailVerified: true, displayName: 'Admin' }, user: { uid: 'u1', email: 'u1@x.com', emailVerified: true, displayName: 'User One' }, unverified: { uid: 'u2', email: 'u2@x.com', emailVerified: false, displayName: 'New User' } };
const base = USERS[mode] ? { ...USERS[mode], reload: async () => {}, getIdToken: async () => 't' } : null;
export const initializeApp = () => ({});
export const initializeAuth = () => ({ currentUser: base });
export const indexedDBLocalPersistence = {}, browserLocalPersistence = {};
export const onAuthStateChanged = (_a, cb) => { setTimeout(() => cb(base), 0); return () => {}; };
const nope = async () => { throw Object.assign(new Error('stub'), { code: 'auth/operation-not-allowed' }); };
export { nope as createUserWithEmailAndPassword, nope as signInWithEmailAndPassword };
export const signOut = async () => {}, sendPasswordResetEmail = async () => {}, sendEmailVerification = async () => {}, updateProfile = async () => {}, verifyPasswordResetCode = async () => 'a@b.c', confirmPasswordReset = async () => {};
