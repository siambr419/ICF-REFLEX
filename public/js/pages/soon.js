import { html, mount } from '../utils/dom.js';
import { comingSoon } from '../components/states.js';

/** Generic "Coming soon" page for Phase 2/3 features. Title/text come from <body data-title data-text>. */
export default async function soon({ root }) {
  const { title = 'Coming soon', text = '' } = document.body.dataset;
  mount(root, html`<div class="page-head"><h1>${title}</h1></div>${comingSoon(title, text)}
    <p class="center"><a class="btn" href="/">Back to home</a></p>`);
}
