import { html, raw, mount, $, $$, delegate, debounce } from '../utils/dom.js';
import { adminShell, badge } from './shell.js';
import { audit } from './audit.js';
import { mountAnimePicker, getAnimeDoc } from './scope.js';
import { openModal, confirmModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { emptyState, errorState } from '../components/states.js';
import { imgTag } from '../components/media-img.js';
import { auth } from '../firebase/auth.js';
import { requireDb, collection, query, where, orderBy, limit, startAfter, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { validateImageUrl } from '../utils/url-validator.js';
import { explainError } from '../utils/errors.js';
import { formatDateTime } from '../utils/formatters.js';

/*
 * Poster Manager. Collection `posters` (admin-only): { title, animeId, imageUrl, type, altText, isPublished, displayOrder, createdAt, updatedAt, createdBy }.
 * Images are EXTERNAL https URLs: Firebase Storage is not configured in this project, and image data is never stored in Firestore.
 * "Apply to anime" copies imageUrl into the anime's EXISTING field (posterUrl / coverUrl / bannerUrl), which is what every public page already
 * reads, so nothing else needs to change and existing anime images keep working. Deleting a poster record never removes an anime's image.
 */
export const POSTER_TYPES = [['poster', 'Anime Poster'], ['backdrop', 'Anime Backdrop'], ['banner', 'Anime Banner'], ['thumbnail', 'Thumbnail']];
export const TYPE_LABEL = Object.fromEntries(POSTER_TYPES);
/** Which existing anime field each poster type feeds. Thumbnails are not applied to an anime field. */
export const APPLY_FIELD = { poster: 'posterUrl', backdrop: 'coverUrl', banner: 'bannerUrl' };
const FIELD_LABEL = { posterUrl: 'poster', coverUrl: 'cover/backdrop', bannerUrl: 'banner' };
const PAGE = 24;

export function posterDoc(v, anime) {
  return { title: v.title, animeId: anime?.id ?? v.animeId ?? '', imageUrl: v.imageUrl, type: v.type, altText: v.altText || '', isPublished: !!v.isPublished, displayOrder: Math.trunc(Number(v.displayOrder) || 0) };
}

export default async function posters(ctx) {
  const main = adminShell(ctx), db = requireDb();
  const st = { items: [], cursor: null, done: true, type: '', animeId: '', published: '', q: '', busy: false };
  const titles = new Map();
  mount(main, html`<div class="admin-bar"><h1>Poster Manager</h1><div class="admin-bar-actions"><button class="btn btn-primary" id="p-new" type="button">Add poster</button></div></div>
    <p class="help">Manage poster, backdrop, banner and thumbnail images. Images are external HTTPS URLs (nothing is uploaded; Firebase Storage is not configured). “Apply to anime” sets the anime’s poster, cover or banner field used across the site.</p>
    <form class="poster-filters" id="p-filters" role="search" novalidate>
      <div class="field"><label for="p-q">Search loaded posters</label><input id="p-q" type="search" maxlength="60" placeholder="Title, alt text or anime…"></div>
      <div class="field"><label for="p-type">Type</label><select id="p-type"><option value="">All types</option>${POSTER_TYPES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></div>
      <div class="field"><label for="p-anime">Anime slug</label><input id="p-anime" type="text" maxlength="120" placeholder="exact slug, e.g. one-piece"></div>
      <div class="field"><label for="p-pub">Status</label><select id="p-pub"><option value="">Any</option><option value="1">Published</option><option value="0">Unpublished</option></select></div>
    </form>
    <p class="muted" id="p-note" role="status" aria-live="polite"></p>
    <div id="p-grid" class="poster-grid"></div><div class="center"><button class="btn" id="p-more" type="button" hidden>Load more</button></div>`);
  const grid = $('#p-grid', main), more = $('#p-more', main), note = $('#p-note', main);

  const animeName = (id) => (id ? titles.get(id) || id : 'Unassigned');
  const visible = () => st.items.filter((p) =>
    (st.published === '' || String(p.isPublished ? 1 : 0) === st.published) &&
    (!st.q || [p.title, p.altText, animeName(p.animeId), p.animeId].join(' ').toLowerCase().includes(st.q)));

  function draw() {
    const rows = visible();
    note.textContent = st.items.length ? `Showing ${rows.length} of ${st.items.length} loaded${st.done ? '' : ' (more available)'}.` : '';
    if (!rows.length) { grid.className = ''; mount(grid, emptyState(st.items.length ? 'No matching posters' : 'No posters yet', st.items.length ? 'Clear the search or filters, or load more.' : 'Add your first poster with the button above.')); return; }
    grid.className = 'poster-grid';
    mount(grid, html`${rows.map((p) => html`<article class="poster-card" data-id="${p.id}">
      <div class="poster-thumb ${p.type === 'poster' ? 'is-portrait' : 'is-wide'}">${imgTag(p.imageUrl, p.altText || p.title, p.type === 'poster' ? 'poster' : 'banner', p.type === 'poster' ? 200 : 320, p.type === 'poster' ? 300 : 180)}</div>
      <div class="poster-body"><h3>${p.title}</h3>
        <p class="muted">${TYPE_LABEL[p.type] || p.type} · ${animeName(p.animeId)}</p>
        <p>${badge(p.isPublished, 'Published', 'Unpublished')} <span class="badge">Order ${p.displayOrder ?? 0}</span></p>
        <div class="row-actions poster-actions">
          <button class="btn btn-sm" type="button" data-act="view">Details</button>
          <button class="btn btn-sm" type="button" data-act="edit">Edit</button>
          ${APPLY_FIELD[p.type] && p.animeId ? html`<button class="btn btn-sm" type="button" data-act="apply">Apply to anime</button>` : ''}
          <button class="btn btn-sm btn-danger" type="button" data-act="del">Delete</button>
        </div></div></article>`)}`);
  }
  async function resolveTitles(items) {
    const ids = [...new Set(items.map((p) => p.animeId).filter((id) => id && !titles.has(id)))];
    await Promise.all(ids.map(async (id) => { titles.set(id, (await getAnimeDoc(id).catch(() => null))?.title || `${id} (missing)`); }));
  }
  async function fetchMore(reset) {
    if (st.busy) return; st.busy = true; more.setAttribute('aria-busy', 'true');
    if (reset) { st.items = []; st.cursor = null; grid.className = ''; mount(grid, html`<div class="poster-grid">${Array.from({ length: 6 }, () => html`<div class="poster-card" aria-hidden="true"><div class="skeleton poster-thumb is-wide"></div><div class="skeleton line"></div></div>`)}</div>`); }
    try {
      const c = [];
      if (st.animeId) c.push(where('animeId', '==', st.animeId)); else if (st.type) c.push(where('type', '==', st.type));
      c.push(orderBy('createdAt', 'desc')); if (st.cursor) c.push(startAfter(st.cursor)); c.push(limit(PAGE));
      const s = await getDocs(query(collection(db, 'posters'), ...c));
      let items = s.docs.map(snap);
      if (st.animeId && st.type) items = items.filter((p) => p.type === st.type); // second filter runs on the loaded page
      await resolveTitles(items);
      st.items = st.items.concat(items); st.cursor = s.docs.at(-1) || null; st.done = s.size < PAGE; more.hidden = st.done; draw();
    } catch (e) {
      console.error(e); grid.className = ''; mount(grid, errorState(e)); $('[data-retry]', grid)?.addEventListener('click', () => { st.busy = false; fetchMore(true); });
    } finally { st.busy = false; more.removeAttribute('aria-busy'); }
  }

  function form(existing) {
    const p = existing || { type: 'poster', isPublished: true, displayOrder: 0, title: '', imageUrl: '', altText: '', animeId: '' };
    let chosen = null, removeAssign = false;
    const m = openModal({ title: existing ? 'Edit poster' : 'Add poster', wide: true, content: html`<form class="form" id="pf" novalidate>
      <div class="field"><label for="pf-title">Title <span aria-hidden="true">*</span></label><input id="pf-title" name="title" type="text" maxlength="120" required value="${p.title}"></div>
      <div class="field"><label for="pf-type">Type</label><select id="pf-type" name="type">${POSTER_TYPES.map(([v, l]) => html`<option value="${v}" ${p.type === v ? raw('selected') : ''}>${l}</option>`)}</select></div>
      <div class="field"><label for="pf-url">Image URL (https) <span aria-hidden="true">*</span></label><input id="pf-url" name="imageUrl" type="url" maxlength="2048" required placeholder="https://…" value="${p.imageUrl}"><p class="help">Upload to an image host you control and paste the direct link. Firebase Storage upload is not configured in this project.</p>
        <div class="poster-preview" id="pf-preview" aria-live="polite"><img id="pf-img" alt="Image preview" referrerpolicy="no-referrer" hidden><p class="help" id="pf-img-note">Preview appears when the URL is valid.</p></div></div>
      <div class="field"><label for="pf-alt">Alt text</label><input id="pf-alt" name="altText" type="text" maxlength="200" value="${p.altText}"></div>
      <fieldset class="field"><legend>Assigned anime</legend><p class="help" id="pf-current">${p.animeId ? `Currently assigned to: ${animeName(p.animeId)} (${p.animeId}). Pick another below to change it.` : 'Not assigned to an anime yet.'}</p><div class="scope" id="pf-picker"></div>
        ${p.animeId ? html`<label class="check"><input type="checkbox" id="pf-unassign"> <span>Remove the assignment</span></label>` : ''}</fieldset>
      <div class="field"><label for="pf-order">Display order</label><input id="pf-order" name="displayOrder" type="number" step="1" min="0" max="9999" value="${p.displayOrder ?? 0}"></div>
      <label class="check"><input type="checkbox" name="isPublished" ${p.isPublished ? raw('checked') : ''}> <span>Published (only published posters can be applied to an anime)</span></label>
      <label class="check" id="pf-apply-wrap" hidden><input type="checkbox" name="applyNow" id="pf-apply"> <span id="pf-apply-text"></span></label>
      <p class="form-error" data-error role="alert"></p>
      <div class="form-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save poster</button></div></form>` });
    const f = $('#pf', m.el), err = $('[data-error]', f), btn = $('[type=submit]', f), img = $('#pf-img', f), imgNote = $('#pf-img-note', f);
    const refreshApply = () => {
      const field = APPLY_FIELD[f.elements.type.value], target = chosen?.id || (removeAssign ? '' : p.animeId), wrap = $('#pf-apply-wrap', f);
      wrap.hidden = !(field && target);
      if (!wrap.hidden) $('#pf-apply-text', f).textContent = `Also use this image as the anime’s ${FIELD_LABEL[field]} image now (replaces the current one).`;
    };
    const preview = () => {
      const r = validateImageUrl(f.elements.imageUrl.value);
      if (r.ok) { img.src = r.href; img.hidden = false; imgNote.textContent = 'If the image does not appear, the host may block hot-linking.'; } else { img.hidden = true; img.removeAttribute('src'); imgNote.textContent = f.elements.imageUrl.value ? r.error : 'Preview appears when the URL is valid.'; }
    };
    f.elements.imageUrl.addEventListener('input', debounce(preview, 250)); preview();
    f.elements.type.addEventListener('change', refreshApply);
    $('#pf-unassign', f)?.addEventListener('change', (e) => { removeAssign = e.target.checked; refreshApply(); });
    mountAnimePicker($('#pf-picker', f), { label: 'Anime', onSelect: (a) => { chosen = a; refreshApply(); } });
    refreshApply();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (f.dataset.busy) return; err.textContent = '';
      const title = f.elements.title.value.trim(), url = validateImageUrl(f.elements.imageUrl.value);
      if (!title) { err.textContent = 'Enter a title.'; return; }
      if (!url.ok) { err.textContent = `Image URL: ${url.error}`; return; }
      const animeId = removeAssign ? '' : chosen?.id || p.animeId || '';
      const data = posterDoc({ title, type: f.elements.type.value, imageUrl: url.href, altText: f.elements.altText.value.trim(), isPublished: f.elements.isPublished.checked, displayOrder: f.elements.displayOrder.value }, { id: animeId });
      f.dataset.busy = '1'; btn.disabled = true; btn.textContent = 'Saving…';
      try {
        if (existing) await updateDoc(doc(db, 'posters', existing.id), { ...data, updatedAt: serverTimestamp() });
        else await addDoc(collection(db, 'posters'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: auth.currentUser.uid });
        audit(existing ? 'update' : 'create', 'poster', existing?.id || data.title);
        if (f.elements.applyNow.checked && data.animeId && APPLY_FIELD[data.type]) {
          if (!data.isPublished) toast('Saved, but unpublished posters are not applied to an anime.', 'info');
          else await applyToAnime({ ...data, id: existing?.id }, { confirm: false });
        }
        toast('Poster saved.', 'success'); m.close(); fetchMore(true);
      } catch (ex) { console.error(ex); err.textContent = ex.userMessage || explainError(ex); }
      finally { delete f.dataset.busy; btn.disabled = false; btn.textContent = 'Save poster'; }
    });
  }

  async function applyToAnime(p, { confirm = true } = {}) {
    const field = APPLY_FIELD[p.type];
    if (!field || !p.animeId) throw Object.assign(new Error('not applicable'), { userMessage: 'This poster type cannot be applied to an anime.' });
    if (!p.isPublished) throw Object.assign(new Error('unpublished'), { userMessage: 'Publish the poster before applying it to an anime.' });
    const anime = await getAnimeDoc(p.animeId);
    if (!anime) throw Object.assign(new Error('missing'), { userMessage: `The anime “${p.animeId}” no longer exists.` });
    if (confirm && !(await confirmModal(`Replace the ${FIELD_LABEL[field]} image of “${anime.title}” with this poster? The previous image URL is not kept.`, { confirmLabel: 'Apply' }))) return false;
    await updateDoc(doc(requireDb(), 'anime', anime.id), { [field]: p.imageUrl, updatedAt: serverTimestamp() });
    audit('apply-poster', 'anime', `${anime.id}:${field}`);
    return true;
  }

  delegate(grid, 'click', '[data-act]', async (e, b) => {
    const p = st.items.find((i) => i.id === b.closest('.poster-card')?.dataset.id); if (!p) return;
    const act = b.dataset.act;
    if (act === 'edit') form(p);
    else if (act === 'view') openModal({ title: p.title, wide: true, content: html`<div class="poster-detail"><div class="poster-thumb ${p.type === 'poster' ? 'is-portrait' : 'is-wide'}">${imgTag(p.imageUrl, p.altText || p.title, p.type === 'poster' ? 'poster' : 'banner', 300, 450)}</div>
      <dl><dt>Type</dt><dd>${TYPE_LABEL[p.type] || p.type}</dd><dt>Anime</dt><dd>${animeName(p.animeId)}${p.animeId ? html` (<code>${p.animeId}</code>)` : ''}</dd><dt>Image URL</dt><dd class="wrap-anywhere"><code>${p.imageUrl}</code></dd><dt>Alt text</dt><dd>${p.altText || '—'}</dd><dt>Status</dt><dd>${p.isPublished ? 'Published' : 'Unpublished'}</dd><dt>Display order</dt><dd>${p.displayOrder ?? 0}</dd><dt>Created</dt><dd>${formatDateTime(p.createdAt)}</dd><dt>Updated</dt><dd>${formatDateTime(p.updatedAt)}</dd><dt>Created by</dt><dd><code>${p.createdBy || '—'}</code></dd></dl></div>` });
    else if (act === 'apply') { b.disabled = true; try { if (await applyToAnime(p)) toast('Applied. The anime now uses this image.', 'success'); } catch (ex) { console.error(ex); toast(ex.userMessage || explainError(ex), 'error'); } finally { b.disabled = false; } }
    else if (act === 'del') {
      if (!(await confirmModal(`Delete the poster record “${p.title}”? If its image is currently applied to an anime, that anime keeps showing it. No image files are deleted (images are external URLs).`, { confirmLabel: 'Delete', danger: true }))) return;
      try { await deleteDoc(doc(db, 'posters', p.id)); audit('delete', 'poster', p.id); toast('Poster deleted.', 'success'); await fetchMore(true); }
      catch (ex) { console.error(ex); toast(explainError(ex), 'error'); }
    }
  });
  $('#p-new', main).addEventListener('click', () => form(null));
  more.addEventListener('click', () => fetchMore(false));
  $('#p-filters', main).addEventListener('submit', (e) => e.preventDefault());
  $('#p-q', main).addEventListener('input', debounce((e) => { st.q = e.target.value.trim().toLowerCase(); draw(); }, 200));
  $('#p-pub', main).addEventListener('change', (e) => { st.published = e.target.value; draw(); });
  $('#p-type', main).addEventListener('change', (e) => { st.type = e.target.value; fetchMore(true); });
  $('#p-anime', main).addEventListener('change', (e) => { st.animeId = e.target.value.trim(); fetchMore(true); });
  fetchMore(true);
}
