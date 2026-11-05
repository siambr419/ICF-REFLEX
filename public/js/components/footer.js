import { html, mount, $ } from '../utils/dom.js';
import { SITE } from '../site.js';
import { t } from '../i18n.js';

export function renderFooter() {
  const el = $('#site-footer'); if (!el) return;
  const col = (title, links) => html`<div><h2>${title}</h2><ul>${links.map(([h, l]) => html`<li><a href="${h}">${l}</a></li>`)}</ul></div>`;
  mount(el, html`<footer class="site-footer"><div class="container">
    <div class="footer-grid">
      <div><a class="brand" href="/"><img src="/assets/icons/logo.svg" alt="" width="36" height="36"><span class="brand-text">${SITE.name}</span></a><p class="muted">${SITE.tagline}</p></div>
      ${col('Explore', [['/browse', 'Browse anime'], ['/genres', 'Genres'], ['/trending', 'Trending'], ['/schedule', 'Schedule']])}
      ${col('Account', [['/login', 'Log in'], ['/register', 'Sign up'], ['/dashboard', 'Dashboard'], ['/pricing', 'Premium']])}
      ${col('Company', [['/about', 'About'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']])}
    </div>
    <p class="footer-note">© ${new Date().getFullYear()} ${SITE.name}. ${t('footer.rights')}</p>
  </div></footer>`);
}
