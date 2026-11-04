import { html, mount, raw } from '../utils/dom.js';
import { explainError } from '../utils/errors.js';

const ICON = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4-2.5z"/></svg>');
export const emptyState = (title, text = '', action = '') => html`<div class="state"><div class="state-icon">${ICON}</div><h2>${title}</h2><p>${text}</p>${action}</div>`;
export const errorState = (message, retry = true) => html`<div class="state state-error" role="alert"><h2>Something went wrong</h2><p>${message}</p>${retry ? raw('<button class="btn" data-retry type="button">Try again</button>') : ''}</div>`;
export const notFoundState = (what = 'page') => emptyState(`This ${what} could not be found`, 'It may have been removed or is not published yet.', raw('<a class="btn btn-primary" href="/browse">Browse anime</a>'));
export const unauthorizedState = () => emptyState('You do not have access to this page', 'Your account role does not include this area. If you should have access, ask a Super Admin to assign your role.', raw('<a class="btn" href="/">Back to home</a>'));
export const comingSoon = (title, text) => html`<div class="state"><div class="state-icon">${ICON}</div><span class="badge badge-warn">Coming soon</span><h2>${title}</h2><p>${text}</p></div>`;

/** Runs fn(); on failure renders an error state into `el` with a working retry button. */
export async function load(el, fn) {
  try { await fn(); } catch (e) {
    console.error(e);
    mount(el, errorState(explainError(e)));
    el.querySelector('[data-retry]')?.addEventListener('click', () => load(el, fn));
  }
}
