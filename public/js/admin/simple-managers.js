import { html } from '../utils/dom.js';
import { adminShell, badge } from './shell.js';
import { mountCrud } from './crud.js';
import { audit } from './audit.js';
import { getAnimeDoc } from './scope.js';
import { fetchAll } from '../firebase/paging.js';
import { requireDb, collection, query, orderBy, limit, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { slugify } from '../utils/validators.js';
import { ENUMS } from '../site.js';

export async function genres(ctx) {
  const main = adminShell(ctx), db = requireDb();
  mountCrud(main, {
    title: 'Genres', singular: 'genre', emptyText: 'Create genres so anime can be tagged and browsed.',
    columns: [{ label: 'Name', value: (g) => g.name }, { label: 'Slug', value: (g) => g.slug }, { label: 'Description', value: (g) => g.description }],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, max: 50 },
      { name: 'slug', label: 'Slug', type: 'text', lockOnEdit: true, max: 50, help: 'Blank = generated from the name. Cannot be changed later.' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 2, max: 300 },
    ],
    async fetch() { const docs = await fetchAll(query(collection(db, 'genres'), orderBy('name')), { pageSize: 100 }); return { items: docs.map(snap), cursor: null, done: true }; },
    async validate(v, ex) { if (!ex && !slugify(v.slug || v.name)) return 'Enter a name with letters or numbers.'; },
    async save(v, ex) {
      const id = ex ? ex.id : slugify(v.slug || v.name), ref = doc(db, 'genres', id);
      if (ex) await updateDoc(ref, { name: v.name, description: v.description });
      else { if ((await getDoc(ref)).exists()) throw Object.assign(new Error('exists'), { userMessage: 'A genre with this slug already exists.' }); await setDoc(ref, { name: v.name, slug: id, description: v.description, createdAt: serverTimestamp() }); }
      audit(ex ? 'update' : 'create', 'genre', id);
    },
    deleteMessage: (g) => `Delete the genre "${g.name}"? Anime keep the slug but it will no longer be listed.`,
    async remove(g) { await deleteDoc(doc(db, 'genres', g.id)); audit('delete', 'genre', g.id); },
  });
}

export async function featured(ctx) {
  const main = adminShell(ctx), db = requireDb();
  const titles = new Map();
  const secName = Object.fromEntries(ENUMS.sections);
  mountCrud(main, {
    title: 'Featured content', singular: 'entry', intro: 'These entries drive the homepage hero, Featured, Editor\'s picks and the Trending page. Only anime with visibility "public" are shown to visitors.',
    columns: [{ label: 'Section', value: (f) => secName[f.section] || f.section }, { label: 'Anime', value: (f) => titles.get(f.animeId) || f.animeId }, { label: 'Order', value: (f) => f.sortOrder }, { label: 'Active', value: (f) => badge(f.active) }],
    fields: [
      { name: 'section', label: 'Section', type: 'select', lockOnEdit: true, options: ENUMS.sections },
      { name: 'animeId', label: 'Anime slug (ID)', type: 'text', required: true, lockOnEdit: true, max: 120, help: 'The anime\'s slug, shown on Admin → Anime and in its /anime/<slug> address. It is checked when you save.' },
      { name: 'sortOrder', label: 'Sort order', type: 'number', min: 0, max: 999, step: 1, default: 1 },
      { name: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
    async fetch() {
      const docs = await fetchAll(query(collection(db, 'featuredContent')), { pageSize: 100 });
      const items = docs.map(snap).sort((a, b) => a.section.localeCompare(b.section) || a.sortOrder - b.sortOrder);
      await Promise.all([...new Set(items.map((i) => i.animeId))].filter((id) => !titles.has(id)).map(async (id) => { titles.set(id, (await getAnimeDoc(id).catch(() => null))?.title || `${id} (missing)`); }));
      return { items, cursor: null, done: true };
    },
    async validate(v, ex) { if (!ex && !(await getAnimeDoc(v.animeId))) return `No anime with the slug "${v.animeId}" exists.`; },
    async save(v, ex) {
      const id = ex ? ex.id : `${v.section}_${v.animeId}`;
      await setDoc(doc(db, 'featuredContent', id), { animeId: ex ? ex.animeId : v.animeId, section: ex ? ex.section : v.section, sortOrder: Math.trunc(v.sortOrder ?? 1), active: v.active });
      audit(ex ? 'update' : 'create', 'featuredContent', id);
    },
    async remove(f) { await deleteDoc(doc(db, 'featuredContent', f.id)); audit('delete', 'featuredContent', f.id); },
  });
}
