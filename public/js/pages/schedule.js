import { html, mount, $ } from '../utils/dom.js';
import { scheduleEpisodes } from '../services/episode-service.js';
import { emptyState, load } from '../components/states.js';
import { formatDateTime } from '../utils/formatters.js';
import { href } from '../site.js';

const row = (e) => html`<a class="list-row" href="${href.watch(e.id)}"><div class="grow"><strong>${e.animeTitle || 'Anime'}</strong><br><span class="muted">Episode ${e.episodeNumber}${e.title ? ' — ' + e.title : ''}</span></div><time datetime="${e.releaseAt?.toDate?.().toISOString?.() || ''}">${formatDateTime(e.releaseAt)}</time></a>`;

export default async function schedule({ root }) {
  mount(root, html`<div class="page-head"><h1>Schedule</h1><p>Upcoming and recently released episodes, shown in your local time.</p></div>
    <section class="section"><h2>Upcoming</h2><div id="up" class="ep-list"></div></section><section class="section"><h2>Recently released</h2><div id="rec" class="ep-list"></div></section>`);
  const up = $('#up'), rec = $('#rec');
  await load(up, async () => {
    const { upcoming, recent } = await scheduleEpisodes();
    mount(up, upcoming.length ? html`${upcoming.map(row)}` : emptyState('Nothing scheduled', 'No upcoming episodes have been announced.'));
    mount(rec, recent.length ? html`${recent.map(row)}` : emptyState('No releases yet', 'Released episodes will be listed here.'));
  });
}
