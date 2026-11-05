import { html, mount, raw } from '../utils/dom.js';
import { explainError, isMissingIndex, indexLink } from '../utils/errors.js';

const ICON = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4-2.5z"/></svg>');
export const emptyState = (title, text = '', action = '') => html`<div class="state"><div class="state-icon">${ICON}</div><h2>${title}</h2><p>${text}</p>${action}</div>`;
/** `messageOrError` may be a string or the caught Error (preferred: missing-index errors then also show the console link for admins). */
export const errorState = (messageOrError, retry = true) => {
  const err = typeof messageOrError === 'string' ? null : messageOrError;
  const message = err ? explainError(err) : messageOrError, link = err && isMissingIndex(err) ? indexLink(err) : '';
  return html`<div class="state state-error" role="alert"><h2>Something went wrong</h2><p>${message}</p>${link ? html`<p class="help">Admins: <a href="${link}" rel="noopener noreferrer" target="_blank">open the Firebase console index page</a></p>` : ''}${retry ? raw('<button class="btn" data-retry type="button">Try again</button>') : ''}</div>`;
};
export const notFoundState = (what = 'page') => emptyState(`This ${what} could not be found`, 'It may have been removed or is not published yet.', raw('<a class="btn btn-primary" href="/browse">Browse anime</a>'));
export const unauthorizedState = () => emptyState('You do not have access to this page', 'Your account role does not include this area. If you should have access, ask a Super Admin to assign your role.', raw('<a class="btn" href="/">Back to home</a>'));
export const comingSoon = (title, text) => html`<div class="state"><div class="state-icon">${ICON}</div><span class="badge badge-warn">Coming soon</span><h2>${title}</h2><p>${text}</p></div>`;

/** Runs fn(); on failure renders an error state into `el` with a working retry button. */
export async function load(el, fn) {
  try { await fn(); } catch (e) {
    console.error(e);
    mount(el, errorState(e));
    el.querySelector('[data-retry]')?.addEventListener('click', () => load(el, fn));
  }
}
