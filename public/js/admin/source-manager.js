import { html, mount, $ } from '../utils/dom.js';
import { adminShell, badge } from './shell.js';
import { mountCrud } from './crud.js';
import { audit } from './audit.js';
import { mountAnimePicker, loadEpisodes, selectField } from './scope.js';
import { emptyState } from '../components/states.js';
import { renderPlayer } from '../services/media-service.js';
import { requireDb, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { fetchAll } from '../firebase/paging.js';
import { PROVIDERS, resolveSource } from '../utils/url-validator.js';
import { SOURCE_DEFAULTS, asSource, buildSourceData } from '../utils/source-model.js';

const DASH = 'https://dash.abyss.to/';
const allSources = async (db, episodeId) => (await fetchAll(query(collection(db, 'episodeSources'), where('episodeId', '==', episodeId)), { pageSize: 50 })).map(snap).sort((a, b) => a.sortOrder - b.sortOrder);

export default async function sources(ctx) {
  const main = adminShell(ctx), db = requireDb();
  mount(main, html`<div class="scope"><div id="picker" class="scope-part"></div><div id="ep-slot" class="scope-part"></div></div><div id="crud">${emptyState('Choose an anime and episode', 'Video sources belong to a single episode.')}</div>`);
  const holder = $('#crud', main);
  mountAnimePicker($('#picker', main), {
    async onSelect(anime) {
      mount(holder, emptyState('Choose an episode', 'Select an episode to manage its sources.'));
      const slot = $('#ep-slot', main);
      if (!anime) { mount(slot, html``); return; }
      mount(slot, html`<p class="help" role="status">Loading episodes…</p>`);
      let episodes;
      try { episodes = await loadEpisodes(anime.id); } catch (e) { console.error(e); mount(slot, html`<p class="form-error" role="alert">Could not load episodes.</p>`); return; }
      mount(slot, episodes.length
        ? selectField('scope-ep', 'Season & episode', episodes.map((x) => [x.id, `S${x.seasonId.split('_s')[1]?.split('e')[0] || '?'} · Episode ${x.episodeNumber}${x.title ? ' — ' + x.title : ''}${x.isPublished ? '' : ' (unpublished)'}`]), '', 'Select an episode…')
        : html`<p class="help">This anime has no episodes yet. Add one on the Episodes page first.</p>`);
      $('#scope-ep', main)?.addEventListener('change', (ev) => (ev.target.value ? build(ev.target.value) : mount(holder, emptyState('Choose an episode', 'Select an episode to manage its sources.'))));
    },
  });

  function build(episodeId) {
    mountCrud(holder, {
      title: 'Video sources', singular: 'source',
      intro: html`Workflow for <strong>Abyss.to</strong>: upload the video in your own <a href="${DASH}" target="_blank" rel="noopener noreferrer">Abyss.to dashboard</a>, copy its <em>Embed URL</em> (or the iframe snippet), then add a source here with provider “Abyss.to”. Only add media you are authorised to embed. <strong>New sources start inactive</strong>; switch one on with “Activate” when it is ready. Active sources are shown only for published episodes of public anime.`,
      columns: [{ label: 'Name', value: (s) => s.displayLabel || s.sourceName }, { label: 'Provider', value: (s) => PROVIDERS[s.provider]?.label || s.provider }, { label: 'Quality', value: (s) => s.qualityLabel }, { label: 'Lang', value: (s) => s.language }, { label: 'Order', value: (s) => s.sortOrder }, { label: 'Default', value: (s) => badge(s.isDefault) }, { label: 'Active', value: (s) => badge(s.isActive, 'Active', 'Inactive') }],
      rowActions: [{
        label: (s) => (s.isActive ? 'Deactivate' : 'Activate'),
        async run(s) { await updateDoc(doc(db, 'episodeSources', s.id), { isActive: !s.isActive, updatedAt: serverTimestamp() }); audit(s.isActive ? 'deactivate' : 'activate', 'episodeSource', s.id); return 'reload'; },
      }],
      fields: () => [
        { name: 'sourceName', label: 'Source name (internal)', type: 'text', required: true, max: 80, placeholder: 'e.g. Abyss 1080p' },
        { name: 'displayLabel', label: 'Display label (shown to viewers)', type: 'text', max: 60, help: 'Defaults to the source name.' },
        { name: 'provider', label: 'Provider', type: 'select', options: Object.entries(PROVIDERS).map(([k, p]) => [k, p.label]), default: SOURCE_DEFAULTS.provider },
        { name: 'embedUrl', label: 'Embed URL (Abyss.to / YouTube / Vimeo / Dailymotion / Drive)', type: 'text', max: 2048, placeholder: 'https://abysscdn.com/?v=…', help: 'Paste the Embed URL from the provider. For Abyss.to use the player URL from the dashboard’s embed code, not the dashboard page link. Pasting the <iframe> snippet works too: only its https src is used.' },
        { name: 'directVideoUrl', label: 'Direct video URL (https, .mp4 / .webm / .ogv / .m4v)', type: 'url', max: 2048, help: 'The host must allow hot-linking and send the right headers; playback is not guaranteed.' },
        { name: 'language', label: 'Audio language', type: 'text', max: 30, default: SOURCE_DEFAULTS.language },
        { name: 'qualityLabel', label: 'Quality label', type: 'text', max: 20, default: SOURCE_DEFAULTS.qualityLabel },
        { name: 'tracks', label: 'Subtitle tracks (direct video only)', type: 'tracks', rows: 3, max: 2000, help: 'One per line: language|label|https://…/file.vtt   e.g. en|English|https://example.com/ep1-en.vtt  (host must send CORS headers)' },
        { name: 'sortOrder', label: 'Sort order', type: 'number', min: 0, max: 999, step: 1, default: SOURCE_DEFAULTS.sortOrder },
        { name: 'isDefault', label: 'Default source', type: 'checkbox', default: SOURCE_DEFAULTS.isDefault },
        { name: 'isActive', label: 'Active (visible to viewers once the episode and anime are public)', type: 'checkbox', default: SOURCE_DEFAULTS.isActive, help: 'Off by default. An admin must switch a source on explicitly.' },
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
      async fetch() { return { items: await allSources(db, episodeId), cursor: null, done: true }; },
      validate(v) { try { buildSourceData(episodeId, v); return ''; } catch (e) { return e.userMessage || e.message; } },
      async save(v, existing) {
        const data = { ...buildSourceData(episodeId, v), updatedAt: serverTimestamp() };
        let id = existing?.id;
        if (existing) await updateDoc(doc(db, 'episodeSources', id), data); else id = (await addDoc(collection(db, 'episodeSources'), { ...data, createdAt: serverTimestamp() })).id;
        if (data.isDefault) { // only one default per episode
          const others = (await allSources(db, episodeId)).filter((d) => d.id !== id && d.isDefault);
          for (let i = 0; i < others.length; i += 400) { const b = writeBatch(db); others.slice(i, i + 400).forEach((d) => b.update(doc(db, 'episodeSources', d.id), { isDefault: false })); await b.commit(); }
        }
        audit(existing ? 'update' : 'create', 'episodeSource', id);
      },
      async remove(s) { await deleteDoc(doc(db, 'episodeSources', s.id)); audit('delete', 'episodeSource', s.id); },
    });
  }
}
