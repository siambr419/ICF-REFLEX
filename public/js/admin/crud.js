import { html, raw, mount, $, $$, delegate } from '../utils/dom.js';
import { openModal, confirmModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { errorState, emptyState } from '../components/states.js';
import { explainError } from '../utils/errors.js';
import { validateImageUrl } from '../utils/url-validator.js';
import { toLocalInput } from '../utils/formatters.js';

const initial = (f, item) => {
  const v = item ? item[f.name] : f.default;
  if (f.type === 'list') return Array.isArray(v) ? v.join(', ') : v ?? '';
  if (f.type === 'datetime') return toLocalInput(v);
  if (f.type === 'tracks') return Array.isArray(v) ? v.map((t) => `${t.language}|${t.label}|${t.url}`).join('\n') : '';
  return v ?? '';
};

export function fieldHtml(f, item) {
  const v = initial(f, item), id = `f-${f.name}`, locked = f.lockOnEdit && item ? raw(' disabled') : '', req = f.required ? raw(' required') : '';
  const help = f.help ? html`<p class="help">${f.help}</p>` : '';
  const label = html`<label for="${id}">${f.label}${f.required ? raw(' <span aria-hidden="true">*</span>') : ''}</label>`;
  switch (f.type) {
    case 'checkbox': return html`<div class="field"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? raw('checked') : ''}> <span>${f.label}</span></label>${help}</div>`;
    case 'multi': return html`<fieldset class="field"><legend>${f.label}</legend><div class="check-grid">${f.options.length ? f.options.map(([val, lab]) => html`<label class="check"><input type="checkbox" name="${f.name}" value="${val}" ${(item?.[f.name] || []).includes(val) ? raw('checked') : ''}> ${lab}</label>`) : html`<span class="help">${f.emptyText || 'No options yet.'}</span>`}</div>${help}</fieldset>`;
    case 'select': return html`<div class="field">${label}<select id="${id}" name="${f.name}"${req}${locked}>${f.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return html`<option value="${val}" ${String(v) === String(val) ? raw('selected') : ''}>${lab}</option>`; })}</select>${help}</div>`;
    case 'textarea': case 'tracks': return html`<div class="field">${label}<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" maxlength="${f.max || 5000}"${req}>${v}</textarea>${help}</div>`;
    case 'number': return html`<div class="field">${label}<input id="${id}" name="${f.name}" type="number" value="${v}" ${f.min != null ? raw(`min="${f.min}"`) : ''} ${f.max != null ? raw(`max="${f.max}"`) : ''} step="${f.step || 'any'}"${req}${locked}>${help}</div>`;
    case 'datetime': return html`<div class="field">${label}<input id="${id}" name="${f.name}" type="datetime-local" value="${v}"${req}>${help}</div>`;
    case 'imageUrl': return html`<div class="field">${label}<input id="${id}" name="${f.name}" type="url" maxlength="2048" value="${v}" placeholder="https://…" data-preview="${id}-img"${req}>${help}<img class="url-preview" id="${id}-img" alt="Image preview" ${validateImageUrl(v).ok ? raw(`src="${validateImageUrl(v).href.replace(/"/g, '%22')}"`) : raw('hidden')} referrerpolicy="no-referrer"></div>`;
    case 'preview': return html`<div class="field"><button class="btn btn-sm" type="button" id="preview-btn">Preview this source</button><p class="form-error" id="preview-err" role="alert"></p><div class="player preview-box" id="preview-player" hidden></div></div>`;
    default: return html`<div class="field">${label}<input id="${id}" name="${f.name}" type="${f.type === 'url' ? 'url' : 'text'}" maxlength="${f.max || 300}" value="${v}"${f.placeholder ? raw(` placeholder="${String(f.placeholder).replace(/"/g, '&quot;')}"`) : ''}${req}${locked}>${help}</div>`;
  }
}
export function readForm(form, fields, existing) {
  const fd = new FormData(form), out = {};
  for (const f of fields) {
    if (f.type === 'preview') continue;
    if (f.lockOnEdit && existing) { out[f.name] = existing[f.name]; continue; }
    switch (f.type) {
      case 'checkbox': out[f.name] = form.elements[f.name].checked; break;
      case 'multi': out[f.name] = fd.getAll(f.name); break;
      case 'number': { const r = fd.get(f.name); out[f.name] = r === '' || r == null ? null : Number(r); break; }
      case 'list': out[f.name] = String(fd.get(f.name) || '').split(',').map((s) => s.trim()).filter(Boolean); break;
      case 'datetime': { const r = fd.get(f.name); out[f.name] = r ? new Date(r) : null; break; }
      default: out[f.name] = String(fd.get(f.name) ?? '').trim();
    }
  }
  return out;
}

/**
 * Generic admin table + modal form.
 * cfg: { title, singular, columns:[{label,value(item)}], fields | fields(existing), fetch(cursor)->{items,cursor,done},
 *        save(values, existing), remove(item), validate?(values, existing), afterForm?(form, existing), rowActions?, readOnly?, canCreate?, canDelete?, searchable?, intro? }
 */
export function mountCrud(root, cfg) {
  const st = { items: [], cursor: null, done: true, filter: '' };
  mount(root, html`<div class="admin-bar"><h1>${cfg.title}</h1><div class="admin-bar-actions">
      ${cfg.searchable ? html`<label class="sr-only" for="crud-filter">Filter loaded rows</label><input id="crud-filter" type="search" placeholder="Filter loaded rows…">` : ''}
      ${(cfg.toolbar || []).map((t, n) => html`<button class="btn" type="button" data-tool="${n}">${t.label}</button>`)}
      ${cfg.readOnly || cfg.canCreate === false ? '' : html`<button class="btn btn-primary" id="crud-new" type="button">New ${cfg.singular}</button>`}</div></div>
    ${cfg.intro ? html`<p class="help">${cfg.intro}</p>` : ''}<div id="crud-table"></div><div class="center"><button id="crud-more" class="btn" type="button" hidden>Load more</button></div>`);
  const tbl = $('#crud-table', root), more = $('#crud-more', root);
  const text = (i) => cfg.columns.map((c) => String(c.value(i)).replace(/<[^>]*>/g, ' ')).join(' ').toLowerCase();
  const rows = () => (st.filter ? st.items.filter((i) => text(i).includes(st.filter)) : st.items);

  function draw() {
    const r = rows();
    if (!r.length) { mount(tbl, emptyState(st.filter ? 'No matching rows' : cfg.emptyTitle || `No ${cfg.title.toLowerCase()} yet`, st.filter ? 'Clear the filter or load more rows.' : cfg.emptyText || '')); return; }
    const editable = !cfg.readOnly && (typeof cfg.fields === 'function' || cfg.fields?.length);
    mount(tbl, html`<div class="table-wrap stack-sm"><table><caption class="sr-only">${cfg.title}</caption><thead><tr>${cfg.columns.map((c) => html`<th scope="col">${c.label}</th>`)}<th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${r.map((i) => html`<tr data-id="${i.id}">${cfg.columns.map((c) => html`<td data-label="${c.label}">${c.value(i)}</td>`)}<td class="actions-cell"><div class="row-actions">
        ${(cfg.rowActions || []).map((a, n) => (a.when && !a.when(i) ? '' : html`<button class="btn btn-sm" type="button" data-act="${n}">${typeof a.label === 'function' ? a.label(i) : a.label}</button>`))}
        ${editable ? html`<button class="btn btn-sm" type="button" data-edit>${cfg.editLabel || 'Edit'}</button>` : ''}
        ${cfg.readOnly || cfg.canDelete === false ? '' : html`<button class="btn btn-sm btn-danger" type="button" data-del>Delete</button>`}</div></td></tr>`)}</tbody></table></div>`);
  }
  async function fetchMore(reset) {
    if (reset) { st.items = []; st.cursor = null; mount(tbl, html`<div class="skeleton" aria-busy="true">&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;</div>`); }
    try { const r = await cfg.fetch(st.cursor); st.items = st.items.concat(r.items); st.cursor = r.cursor; st.done = r.done; draw(); more.hidden = st.done; }
    catch (e) { console.error(e); mount(tbl, errorState(e)); $('[data-retry]', tbl)?.addEventListener('click', () => fetchMore(true)); }
  }
  function openForm(existing) {
    const fields = typeof cfg.fields === 'function' ? cfg.fields(existing) : cfg.fields;
    const m = openModal({ title: existing ? `${cfg.editLabel || 'Edit'} ${cfg.singular}` : `New ${cfg.singular}`, wide: true, content: html`<form class="form">${fields.map((f) => fieldHtml(f, existing))}<p class="form-error" data-error role="alert"></p><div class="form-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>` });
    const form = $('form', m.el), err = $('[data-error]', form), btn = $('[type=submit]', form);
    form.addEventListener('input', (e) => {
      const id = e.target.dataset?.preview; if (!id) return;
      const img = document.getElementById(id), r = validateImageUrl(e.target.value);
      if (r.ok) { img.src = r.href; img.hidden = false; } else img.hidden = true;
    });
    cfg.afterForm?.(form, existing);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (form.dataset.busy) return; err.textContent = '';
      if (!form.reportValidity()) return;
      const v = readForm(form, fields, existing);
      for (const f of fields) if (f.type === 'imageUrl' && v[f.name] && !validateImageUrl(v[f.name]).ok) { err.textContent = `${f.label}: ${validateImageUrl(v[f.name]).error}`; return; }
      try {
        const problem = await cfg.validate?.(v, existing); if (problem) { err.textContent = problem; return; }
        form.dataset.busy = '1'; btn.disabled = true; btn.textContent = 'Saving…';
        await cfg.save(v, existing);
        toast(`${cfg.singular[0].toUpperCase() + cfg.singular.slice(1)} saved.`, 'success'); m.close(); await fetchMore(true);
      } catch (ex) { console.error(ex); err.textContent = ex.userMessage || explainError(ex); }
      finally { delete form.dataset.busy; btn.disabled = false; btn.textContent = 'Save'; }
    });
  }
  $('#crud-new', root)?.addEventListener('click', () => openForm(null));
  delegate(root, 'click', '[data-tool]', async (e, b) => { b.disabled = true; try { await cfg.toolbar[Number(b.dataset.tool)].run({ reload: () => fetchMore(true) }); } catch (ex) { console.error(ex); toast(ex.userMessage || explainError(ex), 'error'); } finally { b.disabled = false; } });
  $('#crud-filter', root)?.addEventListener('input', (e) => { st.filter = e.target.value.trim().toLowerCase(); draw(); });
  more.addEventListener('click', () => fetchMore(false));
  delegate(tbl, 'click', 'button', async (e, b) => {
    const item = st.items.find((i) => i.id === b.closest('tr')?.dataset.id); if (!item) return;
    if (b.hasAttribute('data-edit')) openForm(item);
    else if (b.dataset.act != null) {
      b.disabled = true;
      try { const r = await cfg.rowActions[Number(b.dataset.act)].run(item); if (r === 'reload') await fetchMore(true); }
      catch (ex) { console.error(ex); toast(ex.userMessage || explainError(ex), 'error'); } finally { b.disabled = false; }
    }
    else if (b.hasAttribute('data-del')) {
      if (!(await confirmModal(cfg.deleteMessage ? cfg.deleteMessage(item) : `Delete this ${cfg.singular}? This cannot be undone.`, { confirmLabel: 'Delete', danger: true }))) return;
      try { await cfg.remove(item); toast(`${cfg.singular[0].toUpperCase() + cfg.singular.slice(1)} deleted.`, 'success'); await fetchMore(true); }
      catch (ex) { console.error(ex); toast(explainError(ex), 'error'); }
    }
  });
  fetchMore(true);
  return { reload: () => fetchMore(true) };
}
