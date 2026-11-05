import { html, raw, mount } from '../utils/dom.js';
import { SITE } from '../site.js';

/** Marks text the site owner must complete. Highlighted so incomplete template content cannot be mistaken for a finished legal document. */
const ph = (what) => html`<mark class="placeholder">[OWNER TO COMPLETE: ${what}]</mark>`;
const REVIEW = html`<div class="alert alert-warn" role="note"><strong>Template — not legal advice, not legally reviewed.</strong> This page is a starting draft supplied with the software. It has <em>not</em> been reviewed by a lawyer and may not satisfy the laws that apply to you. Highlighted <mark class="placeholder">[OWNER TO COMPLETE]</mark> items are blanks the site owner must fill in; remove this notice only after qualified review.</div>`;
const PAGES = {
  about: () => html`<div class="prose"><h1>About ${SITE.name}</h1><p>${SITE.name} is an anime discovery and streaming interface. Browse the catalog, keep a watchlist and pick up where you left off on any device.</p>
    <h2>What we do and do not do</h2><p>We list metadata and link to or embed video that is hosted by third-party providers the site owner is authorised to use. We do not upload video files to our own servers.</p>
    <h2>Content rights</h2><p>Only content the site owner has permission to distribute or embed is published. If you are a rights holder and believe something is listed without permission, please contact us so it can be reviewed and removed.</p></div>`,
  contact: () => html`<div class="prose"><h1>Contact</h1>${SITE.contactEmail ? html`<p>Email us at <a href="mailto:${SITE.contactEmail}">${SITE.contactEmail}</a>.</p>` : html`<div class="alert alert-warn">No contact address is configured yet. The site owner can set <code>contactEmail</code> in <code>public/js/site.js</code>.</div>`}
    <p>For playback problems, use the "Report a problem" button on the episode page — it goes straight to the moderators.</p></div>`,
  privacy: () => html`<div class="prose"><h1>Privacy policy</h1>${REVIEW}
    <h2>What we store</h2><p>When you create an account we store your email address, display name, preferences, watchlist and watch progress in Google Firebase (Authentication and Cloud Firestore). Passwords are handled by Firebase Authentication and are never stored by this site.</p>
    <h2>Third parties</h2><p>Video players embedded from providers such as YouTube, Vimeo, Dailymotion, Google Drive or Abyss.to may set their own cookies and collect data under their own policies. Fonts are loaded from Google Fonts.</p>
    <h2>Your choices</h2><p>You can edit your profile and remove items from your watchlist at any time. To request deletion of your account data, contact the site owner.</p>
    <h2>Operator and contact</h2><p>Operator: ${ph('legal name of the person or company running this site')}. Contact: ${SITE.contactEmail ? SITE.contactEmail : ph('support email in public/js/site.js')}.</p>
    <h2>Retention, rights and jurisdiction</h2><p>${ph('how long data is kept, your lawful basis, user rights (e.g. access/deletion) and governing jurisdiction')}. Effective date: ${ph('date')}.</p></div>`,
  terms: () => html`<div class="prose"><h1>Terms of use</h1>${REVIEW}
    <h2>Using the service</h2><p>Use ${SITE.name} for lawful, personal, non-commercial viewing. Do not attempt to access admin areas, interfere with the service or scrape it at a rate that harms other users.</p>
    <h2>Content</h2><p>Video is provided by third-party hosts. Availability depends on those hosts and may vary by region or browser. We do not guarantee uninterrupted playback.</p>
    <h2>Accounts</h2><p>You are responsible for your account credentials. We may suspend accounts that abuse the service.</p>
    <h2>Operator, law and disputes</h2><p>Operator: ${ph('legal name')}. Governing law and venue: ${ph('jurisdiction')}. Content-removal / copyright contact: ${SITE.contactEmail ? SITE.contactEmail : ph('support email in public/js/site.js')}. Effective date: ${ph('date')}.</p></div>`,
};
export default async function info({ root, page }) {
  document.title = `${page[0].toUpperCase() + page.slice(1)} — ${SITE.name}`;
  mount(root, PAGES[page]());
}
