import { html, mount } from '../utils/dom.js';
import { toast } from '../components/toast.js';
import { confirmModal } from '../components/modal.js';
import { adminShell, badge } from './shell.js';
import { mountCrud } from './crud.js';
import { audit } from './audit.js';
import { deleteAnimeCascade, cleanupUserReferences } from './cascade.js';
import { syncAnimeVisibility, repairAllVisibility } from './visibility-sync.js';
import { getGenres } from '../services/anime-service.js';
import { requireDb, collection, query, orderBy, limit, startAfter, getDocs, getDoc, setDoc, updateDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { ENUMS } from '../site.js';
import { slugify } from '../utils/validators.js';
import { norm, tokenize } from '../utils/search.js';
import { cap } from '../utils/formatters.js';

export default async function animePage(ctx) {
  const main = adminShell(ctx), db = requireDb();
  const genres = await getGenres().catch(() => []);
  const PAGE = 25;
  mountCrud(main, {
    title: 'Anime', singular: 'anime', searchable: true, emptyText: 'Create your first anime with the button above.',
    intro: 'Images are external HTTPS URLs; nothing is uploaded to Firebase (use Poster Manager to organise and apply images). Visibility "hidden" keeps the anime AND its seasons, episodes and sources out of the public site. Changing visibility re-syncs the visibility flag of all its seasons and episodes.',
    toolbar: [
      {
        label: 'Repair visibility flags',
        async run({ reload }) {
          if (!(await confirmModal('Re-sync the visibility flag of every season and episode of every anime. Run this once after upgrading from an older version (older seasons/episodes stay hidden from visitors until this has run). It only changes documents whose flag is wrong.', { confirmLabel: 'Run repair' }))) return;
          toast('Repair started…', 'info');
          const t = await repairAllVisibility();
          toast(`Checked ${t.anime} anime. Updated ${t.seasons} seasons and ${t.episodes} episodes.`, 'success', 8000); await reload();
        },
      },
      {
        label: 'Clean orphan references',
        async run() {
          const slug = (prompt('Slug of a DELETED anime whose watch history / watchlist entries should be cleaned up:') || '').trim();
          if (!slug) return;
          const r = await cleanupUserReferences(slug);
          toast(`Removed ${r.progress} progress entries and ${r.watchlists} watchlist entries (only possible when the anime no longer exists).`, 'success', 8000);
        },
      },
    ],
    columns: [{ label: 'Title', value: (a) => a.title }, { label: 'Year', value: (a) => a.releaseYear }, { label: 'Type', value: (a) => a.animeType }, { label: 'Status', value: (a) => cap(a.status) }, { label: 'Public', value: (a) => badge(a.visibility === 'public', 'Public', 'Hidden') }],
    fields: (existing) => [
      { name: 'title', label: 'Title', type: 'text', required: true, max: 200 },
      { name: 'alternativeTitles', label: 'Alternative titles', type: 'list', help: 'Comma-separated. Used for search.' },
      { name: 'slug', label: 'Slug (URL id)', type: 'text', lockOnEdit: true, max: 100, help: 'Becomes /anime/<slug>. Leave blank to generate from the title. Cannot be changed later.' },
      { name: 'description', label: 'Description', type: 'textarea', max: 5000, rows: 5 },
      { name: 'posterUrl', label: 'Poster image URL (2:3)', type: 'imageUrl' },
      { name: 'coverUrl', label: 'Cover image URL', type: 'imageUrl' },
      { name: 'bannerUrl', label: 'Banner image URL (16:9, used in the hero)', type: 'imageUrl' },
      { name: 'genres', label: 'Genres', type: 'multi', options: genres.map((g) => [g.slug || g.id, g.name]), emptyText: 'Create genres first (Admin → Genres).' },
      { name: 'releaseYear', label: 'Release year', type: 'number', required: true, min: 1900, max: 2100, step: 1, default: new Date().getFullYear() },
      { name: 'status', label: 'Status', type: 'select', options: ENUMS.status.map((s) => [s, cap(s)]), default: 'ongoing' },
      { name: 'animeType', label: 'Type', type: 'select', options: ENUMS.type, default: 'TV' },
      { name: 'rating', label: 'Rating (0–10, editorial)', type: 'number', min: 0, max: 10, step: 0.1, default: 0, help: 'Entered by staff. This site does not calculate or fake user ratings.' },
      { name: 'featured', label: 'Flag as featured (informational; homepage rows come from the Featured page)', type: 'checkbox' },
      { name: 'visibility', label: 'Visibility', type: 'select', options: ENUMS.visibility.map((s) => [s, cap(s)]), default: 'hidden', help: 'Publish only after you have added episodes and checked the preview.' },
    ],
    async fetch(cursor) {
      const c = [orderBy('createdAt', 'desc'), limit(PAGE)]; if (cursor) c.splice(1, 0, startAfter(cursor));
      const s = await getDocs(query(collection(db, 'anime'), ...c));
      return { items: s.docs.map(snap), cursor: s.docs.at(-1) || null, done: s.size < PAGE };
    },
    async validate(v, existing) { if (!existing && !slugify(v.slug || v.title)) return 'Enter a title (or slug) with letters or numbers.'; },
    async save(v, existing) {
      const slug = existing ? existing.id : slugify(v.slug || v.title), ref = doc(db, 'anime', slug);
      const data = {
        title: v.title, alternativeTitles: v.alternativeTitles.slice(0, 20), slug, description: v.description, posterUrl: v.posterUrl, coverUrl: v.coverUrl, bannerUrl: v.bannerUrl,
        genres: v.genres, releaseYear: Math.trunc(v.releaseYear), status: v.status, animeType: v.animeType, rating: v.rating ?? 0, featured: v.featured, visibility: v.visibility,
        titleLower: norm(v.title), searchTokens: tokenize(v.title, ...v.alternativeTitles), updatedAt: serverTimestamp(),
      };
      if (existing) await updateDoc(ref, data);
      else { if ((await getDoc(ref)).exists()) throw Object.assign(new Error('An anime with this slug already exists.'), { userMessage: 'An anime with this slug already exists. Change the slug.' }); await setDoc(ref, { ...data, createdAt: serverTimestamp() }); }
      audit(existing ? 'update' : 'create', 'anime', slug);
      if (existing && existing.visibility !== v.visibility) {
        try { const r = await syncAnimeVisibility(slug, v.visibility === 'public'); if (r.seasons || r.episodes) toast(`Visibility synced to ${r.seasons} seasons and ${r.episodes} episodes.`, 'success'); }
        catch (e) { console.error(e); throw Object.assign(e, { userMessage: 'The anime was saved, but its seasons/episodes could not be re-synced. Use "Repair visibility flags" before relying on the new visibility.' }); }
      }
    },
    deleteMessage: (a) => `Delete "${a.title}" together with its seasons, episodes, video sources, featured entries, poster records and users' watch history / watchlist entries for it? This cannot be undone.`,
    async remove(a) {
      const r = await deleteAnimeCascade(a.id); audit('delete', 'anime', a.id);
      toast(`Deleted "${a.title}": ${r.episodes} episodes, ${r.seasons} seasons, ${r.progress} progress and ${r.watchlists} watchlist entries.`, 'success', 8000);
      if (r.cleanupError) throw Object.assign(new Error(r.cleanupError), { userMessage: r.cleanupError });
    },
  });
}
