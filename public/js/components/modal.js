import { html, mount, $ } from '../utils/dom.js';

/** Accessible modal built on <dialog>: focus trap, Escape and inert background come from the platform. */
export function openModal({ title, content, wide = false, onClose } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' modal-wide' : '');
  const id = 'm' + Math.random().toString(36).slice(2, 9);
  dlg.setAttribute('aria-labelledby', id);
  mount(dlg, html`<div class="modal-head"><h2 id="${id}">${title}</h2><button class="icon-btn" type="button" data-close aria-label="Close dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="modal-body"></div>`);
  const body = $('.modal-body', dlg);
  if (content instanceof Node) body.append(content); else body.innerHTML = String(content ?? '');
  document.body.append(dlg);
  const prev = document.activeElement;
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  dlg.addEventListener('close', () => { dlg.remove(); prev?.focus?.(); onClose?.(); });
  dlg.showModal();
  return { el: dlg, body, close: () => dlg.open && dlg.close() };
}
export function confirmModal(message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({
      title: 'Please confirm', onClose: () => resolve(ok),
      content: html`<p>${message}</p><div class="form-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${confirmLabel}</button></div>`,
    });
    $('[data-ok]', m.body).addEventListener('click', () => { ok = true; m.close(); });
  });
}
