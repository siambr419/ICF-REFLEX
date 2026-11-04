import { html, mount, $ } from '../utils/dom.js';
import { adminShell, badge } from './shell.js';
import { mountCrud } from './crud.js';
import { audit } from './audit.js';
import { loadAnimeOptions, loadEpisodes, selectField } from './scope.js';
import { emptyState } from '../components/states.js';
import { renderPlayer } from '../services/media-service.js';
import { requireDb, collection, query, where, limit, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { PROVIDERS, resolveSource, parseTracks } from '../utils/url-validator.js';

const asSource = (v) => ({ provider: v.provider, sourceType: v.provider === 'direct' ? 'direct' : 'embed', embedUrl: v.embedUrl, directVideoUrl: v.directVideoUrl });

export default async function sources(ctx) {
  const main = adminShell(ctx), db = requireDb();
  const animes = await loadAnimeOptions();
  mount(main, html`<div class="scope">${selectField('scope-anime', 'Anime', animes.map((a) => [a.id, a.title]), '', 'Select an anime…')}<div id="ep-slot"></div></div><div id="crud">${emptyState('Choose an anime and episode', 'Video sources belong to a single episode.')}</div>`);
  const holder = $('#crud', main);
  let episodes = [];
  $('#scope-anime', main).addEventListener('change', async (e) => {
    mount(holder, emptyState('Choose an episode', 'Select an episode to manage its sources.'));
    if (!e.target.value) { mount($('#ep-slot', main), html``); return; }
    episodes = await loadEpisodes(e.target.value);
    mount($('#ep-slot', main), selectField('scope-ep', 'Episode', episodes.map((x) => [x.id, `S${x.seasonId.split('_s')[1]?.split('e')[0] || '?'} · Episode ${x.episodeNumber}${x.title ? ' — ' + x.title : ''}`]), '', 'Select an episode…'));
    $('#scope-ep', main).addEventListener('change', (ev) => ev.target.value ? build(ev.target.value) : mount(holder, emptyState('Choose an episode', 'Select an episode to manage its sources.')));
  });

  function build(episodeId) {
    mountCrud(holder, {
      title: 'Video sources', singular: 'source',
      intro: 'Only add media you are authorised to embed or link. Keep sources inactive until the episode is ready to publish: active sources are readable by anyone who knows the episode id.',
      columns: [{ label: 'Name', value: (s) => s.displayLabel || s.sourceName }, { label: 'Provider', value: (s) => PROVIDERS[s.provider]?.label || s.provider }, { label: 'Quality', value: (s) => s.qualityLabel }, { label: 'Lang', value: (s) => s.language }, { label: 'Order', value: (s) => s.sortOrder }, { label: 'Default', value: (s) => badge(s.isDefault) }, { label: 'Active', value: (s) => badge(s.isActive) }],
      fields: () => [
        { name: 'sourceName', label: 'Source name (internal)', type: 'text', required: true, max: 80 },
        { name: 'displayLabel', label: 'Display label (shown to viewers)', type: 'text', max: 60, help: 'Defaults to the source name.' },
        { name: 'provider', label: 'Provider', type: 'select', options: Object.entries(PROVIDERS).map(([k, p]) => [k, p.label]), default: 'youtube' },
        { name: 'embedUrl', label: 'Embed URL (YouTube / Vimeo / Dailymotion / Drive link)', type: 'url', max: 2048, help: 'Normal watch or share links are converted to the official embed format on save.' },
        { name: 'directVideoUrl', label: 'Direct video URL (https, .mp4 / .webm / .ogv / .m4v)', type: 'url', max: 2048, help: 'The host must allow hot-linking and send the right headers; playback is not guaranteed.' },
        { name: 'language', label: 'Audio language', type: 'text', max: 30, default: 'Japanese' },
        { name: 'qualityLabel', label: 'Quality label', type: 'text', max: 20, default: '1080p' },
        { name: 'tracks', label: 'Subtitle tracks (direct video only)', type: 'tracks', rows: 3, max: 2000, help: 'One per line: language|label|https://…/file.vtt   e.g. en|English|https://example.com/ep1-en.vtt  (host must send CORS headers)' },
        { name: 'sortOrder', label: 'Sort order', type: 'number', min: 0, max: 999, step: 1, default: 1 },
        { name: 'isDefault', label: 'Default source', type: 'checkbox' },
        { name: 'isActive', label: 'Active (visible to the public)', type: 'checkbox', default: true },
        { type: 'preview', name: '_preview' },
      ],
      afterForm(form) {
        const btn = $('#preview-btn', form), err = $('#preview-err', form), box = $('#preview-player', form);
        btn.addEventListener('click', () => {
          err.textContent = ''; const v = Object.fromEntries(new FormData(form)); const s = asSource(v), r = resolveSource(s);
          if (!r.ok) { box.hidden = true; box.replaceChildren(); err.textContent = r.error; return; }
          box.hidden = false; renderPlayer(box, s);
        });
      },
      async fetch() {
        const r = await getDocs(query(collection(db, 'episodeSources'), where('episodeId', '==', episodeId), limit(50)));
        return { items: r.docs.map(snap).sort((a, b) => a.sortOrder - b.sortOrder), cursor: null, done: true };
      },
      validate(v) {
        const s = asSource(v), r = resolveSource(s); if (!r.ok) return r.error;
        if (s.sourceType === 'embed' && v.tracks) return 'Subtitle tracks only work with direct video files.';
        return parseTracks(v.tracks).error;
      },
      async save(v, existing) {
        const s = asSource(v), r = resolveSource(s);
        const data = {
          episodeId, sourceName: v.sourceName, displayLabel: v.displayLabel || v.sourceName, provider: v.provider, sourceType: s.sourceType,
          embedUrl: s.sourceType === 'embed' ? r.src : '', directVideoUrl: s.sourceType === 'direct' ? r.src : '', language: v.language, qualityLabel: v.qualityLabel,
          tracks: parseTracks(v.tracks).tracks, isDefault: v.isDefault, isActive: v.isActive, sortOrder: Math.trunc(v.sortOrder ?? 1), updatedAt: serverTimestamp(),
        };
        let id = existing?.id;
        if (existing) await updateDoc(doc(db, 'episodeSources', id), data); else id = (await addDoc(collection(db, 'episodeSources'), { ...data, createdAt: serverTimestamp() })).id;
        if (v.isDefault) { // only one default per episode
          const others = (await getDocs(query(collection(db, 'episodeSources'), where('episodeId', '==', episodeId), limit(50)))).docs.filter((d) => d.id !== id && d.data().isDefault);
          if (others.length) { const b = writeBatch(db); others.forEach((d) => b.update(d.ref, { isDefault: false })); await b.commit(); }
        }
        audit(existing ? 'update' : 'create', 'episodeSource', id);
      },
      async remove(s) { await deleteDoc(doc(db, 'episodeSources', s.id)); audit('delete', 'episodeSource', s.id); },
    });
  }
}
