import { html, mount, $ } from '../utils/dom.js';
import { adminShell, badge } from './shell.js';
import { mountCrud } from './crud.js';
import { audit } from './audit.js';
import { deleteEpisodesWhere, deleteSourcesOf } from './cascade.js';
import { mountAnimePicker, loadSeasons, loadEpisodes, getAnimeDoc } from './scope.js';
import { emptyState } from '../components/states.js';
import { requireDb, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from '../firebase/firestore.js';
import { formatDateTime } from '../utils/formatters.js';

const oops = (m) => Object.assign(new Error(m), { userMessage: m });

async function scoped(ctx, build) {
  const main = adminShell(ctx);
  mount(main, html`<div class="scope" id="picker"></div><div id="crud">${emptyState('Choose an anime', 'Search for an anime above to manage its content.')}</div>`);
  mountAnimePicker($('#picker', main), {
    onSelect: async (anime) => {
      const holder = $('#crud', main);
      if (!anime) { mount(holder, emptyState('Choose an anime', 'Search for an anime above to manage its content.')); return; }
      await build(holder, anime);
    },
  });
}
/** Reads the CURRENT visibility (the picker copy may be stale) so seasons/episodes get a correct `animePublic` flag. */
const animePublicNow = async (animeId) => {
  const a = await getAnimeDoc(animeId);
  if (!a) throw oops('This anime no longer exists.');
  return a.visibility === 'public';
};

export const seasons = (ctx) => scoped(ctx, async (holder, anime) => {
  const db = requireDb();
  mountCrud(holder, {
    title: `Seasons — ${anime.title}`, singular: 'season', intro: 'Reorder seasons by changing "Sort order" (lowest first).',
    columns: [{ label: '#', value: (s) => s.seasonNumber }, { label: 'Title', value: (s) => s.title }, { label: 'Sort', value: (s) => s.sortOrder }, { label: 'Published', value: (s) => badge(s.isPublished) }],
    fields: () => [
      { name: 'seasonNumber', label: 'Season number', type: 'number', required: true, min: 1, max: 99, step: 1, lockOnEdit: true },
      { name: 'title', label: 'Title', type: 'text', required: true, max: 120, default: 'Season 1' },
      { name: 'description', label: 'Description', type: 'textarea', max: 2000, rows: 3 },
      { name: 'releaseYear', label: 'Release year', type: 'number', min: 1900, max: 2100, step: 1, default: anime.releaseYear },
      { name: 'sortOrder', label: 'Sort order', type: 'number', min: 0, max: 999, step: 1, default: 1 },
      { name: 'isPublished', label: 'Published', type: 'checkbox' },
    ],
    fetch: async () => ({ items: await loadSeasons(anime.id), cursor: null, done: true }),
    async save(v, existing) {
      const num = existing ? existing.seasonNumber : Math.trunc(v.seasonNumber), id = existing ? existing.id : `${anime.id}_s${num}`, ref = doc(db, 'seasons', id);
      if (!existing && (await getDoc(ref)).exists()) throw oops(`Season ${num} already exists for this anime.`);
      await setDoc(ref, { animeId: anime.id, seasonNumber: num, title: v.title, description: v.description, releaseYear: Math.trunc(v.releaseYear ?? anime.releaseYear), sortOrder: Math.trunc(v.sortOrder ?? num), isPublished: v.isPublished, animePublic: await animePublicNow(anime.id) });
      audit(existing ? 'update' : 'create', 'season', id);
    },
    deleteMessage: (s) => `Delete "${s.title}" and all of its episodes and video sources?`,
    async remove(s) { await deleteEpisodesWhere('seasonId', s.id); await deleteDoc(doc(db, 'seasons', s.id)); audit('delete', 'season', s.id); },
  });
});

export const episodes = (ctx) => scoped(ctx, async (holder, anime) => {
  const db = requireDb(), seasonList = await loadSeasons(anime.id);
  if (!seasonList.length) { mount(holder, emptyState('Add a season first', 'Episodes belong to a season. Create one on the Seasons page.')); return; }
  const sname = (id) => seasonList.find((s) => s.id === id)?.title || id;
  mountCrud(holder, {
    title: `Episodes — ${anime.title}`, singular: 'episode', searchable: true,
    columns: [{ label: 'Season', value: (e) => sname(e.seasonId) }, { label: '#', value: (e) => e.episodeNumber }, { label: 'Title', value: (e) => e.title }, { label: 'Release', value: (e) => formatDateTime(e.releaseAt) }, { label: 'Published', value: (e) => badge(e.isPublished) }],
    fields: () => [
      { name: 'seasonId', label: 'Season', type: 'select', required: true, lockOnEdit: true, options: seasonList.map((s) => [s.id, s.title]) },
      { name: 'episodeNumber', label: 'Episode number', type: 'number', required: true, min: 1, max: 9999, step: 1, lockOnEdit: true },
      { name: 'title', label: 'Title', type: 'text', max: 200 },
      { name: 'description', label: 'Description', type: 'textarea', max: 2000, rows: 3 },
      { name: 'thumbnailUrl', label: 'Thumbnail image URL (16:9)', type: 'imageUrl' },
      { name: 'durationSeconds', label: 'Duration (seconds)', type: 'number', min: 0, max: 86400, step: 1, default: 1440 },
      { name: 'releaseAt', label: 'Release date & time', type: 'datetime', help: 'Leave empty to use now. Future dates appear on the Schedule page.' },
      { name: 'isPublished', label: 'Published (visible to the public)', type: 'checkbox' },
    ],
    fetch: async () => ({ items: await loadEpisodes(anime.id), cursor: null, done: true }),
    async save(v, existing) {
      const season = seasonList.find((s) => s.id === (existing ? existing.seasonId : v.seasonId));
      if (!season) throw oops('Choose a season.');
      const num = existing ? existing.episodeNumber : Math.trunc(v.episodeNumber), id = existing ? existing.id : `${anime.id}_s${season.seasonNumber}e${num}`, ref = doc(db, 'episodes', id);
      const data = { animeId: anime.id, animeTitle: anime.title, seasonId: season.id, episodeNumber: num, title: v.title, description: v.description, thumbnailUrl: v.thumbnailUrl, durationSeconds: Math.trunc(v.durationSeconds ?? 0), releaseAt: v.releaseAt ? Timestamp.fromDate(v.releaseAt) : Timestamp.now(), isPublished: v.isPublished, animePublic: await animePublicNow(anime.id), updatedAt: serverTimestamp() };
      if (existing) await updateDoc(ref, data);
      else { if ((await getDoc(ref)).exists()) throw oops('This episode number already exists in the season.'); await setDoc(ref, { ...data, createdAt: serverTimestamp() }); }
      audit(existing ? 'update' : 'create', 'episode', id);
    },
    deleteMessage: (e) => `Delete episode ${e.episodeNumber} and its video sources?`,
    async remove(e) { await deleteSourcesOf([e.id]); await deleteDoc(doc(db, 'episodes', e.id)); audit('delete', 'episode', e.id); },
  });
});
