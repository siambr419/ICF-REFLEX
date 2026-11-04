import { html } from '../utils/dom.js';
import { adminShell, badge } from './shell.js';
import { mountCrud } from './crud.js';
import { audit } from './audit.js';
import { auth } from '../firebase/auth.js';
import { requireDb, collection, query, orderBy, limit, startAfter, getDocs, updateDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { formatDateTime } from '../utils/formatters.js';
import { href } from '../site.js';

const PAGE = 25;
export default async function reports(ctx) {
  const main = adminShell(ctx), db = requireDb();
  mountCrud(main, {
    title: 'Reports', singular: 'report', editLabel: 'Update status', canCreate: false, canDelete: false, searchable: true,
    emptyText: 'Playback problem reports from viewers appear here.',
    columns: [{ label: 'Date', value: (r) => formatDateTime(r.createdAt) }, { label: 'Episode', value: (r) => (r.contentType === 'episode' ? html`<a href="${href.watch(r.contentId)}">${r.contentId}</a>` : r.contentId) }, { label: 'Reason', value: (r) => r.reason }, { label: 'Details', value: (r) => r.details || '' }, { label: 'Status', value: (r) => badge(r.status !== 'open', r.status, 'open') }],
    fields: [{ name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed']] }],
    async fetch(cursor) {
      const c = [orderBy('createdAt', 'desc'), limit(PAGE)]; if (cursor) c.splice(1, 0, startAfter(cursor));
      const s = await getDocs(query(collection(db, 'reports'), ...c));
      return { items: s.docs.map(snap), cursor: s.docs.at(-1) || null, done: s.size < PAGE };
    },
    async save(v, r) { await updateDoc(doc(db, 'reports', r.id), { status: v.status, reviewedBy: auth.currentUser.uid, reviewedAt: serverTimestamp() }); audit('review', 'report', r.id); },
  });
}
