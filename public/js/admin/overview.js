import { html, mount, $ } from '../utils/dom.js';
import { adminShell } from './shell.js';
import { requireDb, collection, query, where, orderBy, limit, getDocs, getCountFromServer, snap } from '../firebase/firestore.js';
import { firebaseConfig } from '../firebase/config.js';
import { GUARDS, ROLE_LABELS } from '../utils/permissions.js';
import { formatDateTime } from '../utils/formatters.js';
import { load } from '../components/states.js';

export default async function overview(ctx) {
  const main = adminShell(ctx), db = requireDb();
  const content = GUARDS.content.includes(ctx.role), admin = GUARDS.admin.includes(ctx.role), mod = GUARDS.mod.includes(ctx.role);
  mount(main, html`<div class="admin-bar"><h1>Overview</h1></div><p class="muted">Signed in as ${ROLE_LABELS[ctx.role]}.</p><div class="stat-grid" id="stats"></div>${content ? html`<section><h2>Recently updated anime</h2><div id="recent"></div></section>` : ''}`);
  const count = (q) => getCountFromServer(q).then((s) => s.data().count).catch(() => null);
  const jobs = [];
  if (content) jobs.push(['Total anime', count(collection(db, 'anime'))], ['Published anime', count(query(collection(db, 'anime'), where('visibility', '==', 'public')))], ['Total episodes', count(collection(db, 'episodes'))]);
  if (admin) jobs.push(['Registered users', count(collection(db, 'users'))]);
  if (mod) jobs.push(['Open reports', count(query(collection(db, 'reports'), where('status', '==', 'open')))]);
  const vals = await Promise.all(jobs.map((j) => j[1]));
  mount($('#stats', main), html`${jobs.map((j, i) => html`<div class="stat"><b>${vals[i] ?? '—'}</b><span>${j[0]}</span></div>`)}<div class="stat"><b>—</b><span>Pending reviews (Phase 2)</span></div>`);
  if (content) {
    const box = $('#recent', main);
    await load(box, async () => {
      const s = await getDocs(query(collection(db, 'anime'), orderBy('updatedAt', 'desc'), limit(8)));
      mount(box, html`<div class="table-wrap"><table><thead><tr><th>Title</th><th>Visibility</th><th>Updated</th></tr></thead><tbody>${s.docs.map(snap).map((a) => html`<tr><td>${a.title}</td><td>${a.visibility}</td><td>${formatDateTime(a.updatedAt)}</td></tr>`)}</tbody></table></div>`);
    });
  }
}
export async function settings(ctx) {
  const main = adminShell(ctx);
  mount(main, html`<div class="admin-bar"><h1>Settings</h1></div>
    <div class="alert">Firebase project: <code>${firebaseConfig.projectId}</code> · Your role: <code>${ctx.role}</code></div>
    <h2>Spark plan reminders</h2><ul><li>Firestore free quota is limited per day (reads, writes, deletes) and per project (storage). Check <em>Firebase Console → Usage</em> regularly.</li>
    <li>Dashboard counts use aggregation queries; each costs reads. Avoid refreshing the overview repeatedly.</li><li>Role changes, account suspension and verified audit logs need a trusted server (Cloud Functions / Admin SDK), which is not part of Spark.</li></ul>
    <h2>Subtitles</h2><p>Subtitle tracks are managed per video source (Video sources → "Subtitle tracks"). They work with direct video files only.</p>`);
}
