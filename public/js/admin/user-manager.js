import { html } from '../utils/dom.js';
import { adminShell, badge } from './shell.js';
import { mountCrud } from './crud.js';
import { audit } from './audit.js';
import { openModal } from '../components/modal.js';
import { auth } from '../firebase/auth.js';
import { requireDb, collection, query, orderBy, limit, startAfter, getDocs, setDoc, deleteDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { fetchAll } from '../firebase/paging.js';
import { ROLES, ROLE_LABELS } from '../utils/permissions.js';
import { formatDateTime } from '../utils/formatters.js';

const PAGE = 25;
function source(db) {
  let roles = null;
  return async (cursor) => {
    if (!roles) { const r = await fetchAll(query(collection(db, 'userRoles')), { pageSize: 200 }); roles = new Map(r.map((d) => [d.id, d.data().role])); }
    const c = [orderBy('createdAt', 'desc'), limit(PAGE)]; if (cursor) c.splice(1, 0, startAfter(cursor));
    const s = await getDocs(query(collection(db, 'users'), ...c));
    return { items: s.docs.map((d) => ({ ...snap(d), role: roles.get(d.id) || 'user' })), cursor: s.docs.at(-1) || null, done: s.size < PAGE };
  };
}
const cols = [{ label: 'Name', value: (u) => u.displayName || '—' }, { label: 'Email', value: (u) => u.email }, { label: 'Role', value: (u) => ROLE_LABELS[u.role] || u.role }, { label: 'Status', value: (u) => badge(u.accountStatus === 'active', 'Active', u.accountStatus) }, { label: 'Joined', value: (u) => formatDateTime(u.createdAt) }];

export async function users(ctx) {
  const main = adminShell(ctx), db = requireDb();
  mountCrud(main, {
    title: 'Users', singular: 'user', readOnly: true, searchable: true, columns: cols, fetch: source(db),
    intro: 'Read-only. Suspending accounts needs the Admin SDK or Cloud Functions, which Spark does not include. Roles are managed on the Roles page by a Super Admin.',
    rowActions: [{ label: 'Details', run: (u) => openModal({ title: u.displayName || u.email, content: html`<dl><dt>UID</dt><dd><code>${u.id}</code></dd><dt>Email</dt><dd>${u.email}</dd><dt>Role</dt><dd>${ROLE_LABELS[u.role]}</dd><dt>Language</dt><dd>${u.preferredLanguage}</dd><dt>Theme</dt><dd>${u.theme}</dd><dt>Joined</dt><dd>${formatDateTime(u.createdAt)}</dd></dl>` }) }],
  });
}
export async function roles(ctx) {
  const main = adminShell(ctx), db = requireDb();
  mountCrud(main, {
    title: 'Roles', singular: 'user', editLabel: 'Change role', canCreate: false, canDelete: false, searchable: true, columns: cols, fetch: source(db),
    intro: 'Only a Super Admin can change roles, and Firestore rules block changing your own. The first Super Admin must be created manually in the Firebase Console (see README). Premium should only be granted by a verified payment process.',
    fields: [{ name: 'role', label: 'Role', type: 'select', options: ROLES.map((r) => [r, ROLE_LABELS[r]]) }],
    async validate(v, u) { if (u.id === auth.currentUser.uid) return 'You cannot change your own role.'; },
    async save(v, u) {
      if (v.role === 'user') await deleteDoc(doc(db, 'userRoles', u.id));
      else await setDoc(doc(db, 'userRoles', u.id), { uid: u.id, role: v.role, assignedAt: serverTimestamp(), assignedBy: auth.currentUser.uid });
      audit('set-role', 'userRoles', `${u.id}:${v.role}`);
    },
  });
}
