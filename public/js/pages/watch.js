import { html, raw, mount, $, delegate } from '../utils/dom.js';
import * as A from '../services/anime-service.js';
import * as E from '../services/episode-service.js';
import { getSources, pickDefault, sourceLabel, renderPlayer } from '../services/media-service.js';
import { getProgress, saveProgress, touchProgress } from '../services/progress-service.js';
import { requireDb, addDoc, collection, serverTimestamp } from '../firebase/firestore.js';
import { authReady } from '../firebase/auth.js';
import { imgTag } from '../components/media-img.js';
import { notFoundState, emptyState, load } from '../components/states.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { pathId, href } from '../site.js';
import { formatDuration } from '../utils/formatters.js';

export default async function watch({ root }) {
  const id = pathId();
  mount(root, html`<div class="skeleton" aria-busy="true">&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;</div>`);
  await load(root, async () => {
    const ep = await E.getEpisode(id);
    if (!ep || !ep.isPublished) { mount(root, notFoundState('episode')); return; }
    const anime = await A.getAnime(ep.animeId);
    if (!anime) { mount(root, notFoundState('episode')); return; }
    // No `.catch(() => [])` here: a missing index or a failed read must surface as an error with a retry, not as an empty page.
    const [seasons, all, sources, authUser] = await Promise.all([E.listSeasons(anime.id), E.listEpisodes(anime.id), getSources(id), authReady()]);
    // User data (progress, reports) is protected by Firestore rules for verified emails only.
    const user = authUser?.emailVerified ? authUser : null;
    const ordered = E.sortEpisodes(all, seasons);
    const idx = ordered.findIndex((e) => e.id === id), prev = ordered[idx - 1], next = ordered[idx + 1];
    const sameSeason = ordered.filter((e) => e.seasonId === ep.seasonId);
    document.title = `${anime.title} — Episode ${ep.episodeNumber} — ICF REFLEX`;

    mount(root, html`<div class="layout-grid">
      <div class="watch-main">
        <div class="player" id="player" aria-live="polite"></div>
        <p class="player-hint" id="player-hint" hidden></p>
        <div class="source-list" id="sources" role="group" aria-label="Video sources"></div>
        <div class="watch-bar">
          <label class="sr-only" for="speed">Playback speed</label><select id="speed" hidden><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
          <span class="spacer"></span>
          ${user ? html`<button class="btn btn-sm" id="mark" type="button">Mark as watched</button>` : authUser ? html`<a class="btn btn-sm" href="/verify-email?next=${encodeURIComponent(location.pathname)}">Verify email to save progress</a>` : ''}
          <button class="btn btn-sm" id="report" type="button">Report a problem</button>
        </div>
        <h1>${anime.title} — Episode ${ep.episodeNumber}</h1>
        <p class="muted">${[ep.title, formatDuration(ep.durationSeconds)].filter(Boolean).join(' · ')}</p>
        <p>${ep.description || ''}</p>
        <div class="hero-actions">
          ${prev ? html`<a class="btn" href="${href.watch(prev.id)}" rel="prev">← Previous</a>` : ''}
          <a class="btn" href="${href.anime(anime.id)}">Anime details</a>
          ${next ? html`<a class="btn btn-primary" href="${href.watch(next.id)}" rel="next">Next episode →</a>` : ''}
        </div>
      </div>
      <aside class="watch-side" aria-label="Episodes"><h2>Episodes</h2>
        <ul class="ep-list">${sameSeason.map((e) => html`<li><a class="ep-row" href="${href.watch(e.id)}" ${e.id === id ? raw('aria-current="true"') : ''}><div class="thumb">${imgTag(e.thumbnailUrl, '', 'banner', 192, 108)}</div><div><h3>Episode ${e.episodeNumber}</h3><p>${e.title || ''}</p></div></a></li>`)}</ul>
      </aside></div>`);

    const player = $('#player'), list = $('#sources'), speed = $('#speed');
    const prog = user ? await getProgress(user.uid, id).catch(() => null) : null;
    let current = null, cleanup = () => {}, touched = false;
    const hint = $('#player-hint');

    function play(src) {
      cleanup(); cleanup = () => {};
      current = src;
      list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === src.id)));
      const startAt = prog && !prog.completed ? prog.currentTimeSeconds : 0;
      const p = renderPlayer(player, src, { startAt });
      speed.hidden = p?.kind !== 'direct';
      if (p?.kind === 'direct' && user) cleanup = trackProgress(p.el, user, anime, ep);
      // Embedded players expose no playback time without each provider's own API, so only the "opened" marker is stored for them.
      hint.hidden = p?.kind !== 'embed';
      if (p?.kind === 'embed') {
        hint.replaceChildren('Video not loading? Pick another source above');
        const a = document.createElement('a'); a.href = p.src; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'open this player in a new tab';
        hint.append(' or ', a, '.');
      }
      // Every time an episode is opened, refresh the "last opened" timestamp; position and completed flag are preserved.
      if (user && p && !touched) { touched = true; touchProgress(user.uid, { anime, episode: ep, existing: prog }).catch((e) => console.warn('history not updated', e.code)); }
    }
    speed.addEventListener('change', () => { const v = player.querySelector('video'); if (v) v.playbackRate = Number(speed.value); });

    if (!sources.length) {
      player.replaceChildren(); const d = document.createElement('div'); d.className = 'player-msg'; const m = document.createElement('p'); m.textContent = 'No playable source is available for this episode yet.'; d.append(m); player.append(d);
    } else {
      mount(list, html`${sources.map((s) => html`<button class="chip" type="button" data-id="${s.id}" aria-pressed="false">${sourceLabel(s)}</button>`)}`);
      delegate(list, 'click', 'button', (e, b) => play(sources.find((s) => s.id === b.dataset.id)));
      play(pickDefault(sources));
    }
    $('#mark')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await saveProgress(user.uid, { anime, episode: ep, currentTime: ep.durationSeconds || 0, duration: ep.durationSeconds || 0, completed: true }); toast('Marked as watched.', 'success'); }
      catch { toast('Could not save. Please try again.', 'error'); }
      finally { e.target.disabled = false; }
    });
    $('#report').addEventListener('click', () => reportDialog(user, id));
  });
}

/** Direct video only: embeds do not expose playback time without each provider's own API. */
function trackProgress(video, user, anime, ep) {
  let last = 0;
  const save = (force = false, completed = false) => {
    const now = Date.now();
    if (!force && now - last < 30000) return; last = now;
    const dur = video.duration || ep.durationSeconds || 0;
    const done = completed || (dur > 0 && video.currentTime / dur > 0.92);
    saveProgress(user.uid, { anime, episode: ep, currentTime: video.currentTime, duration: dur, completed: done }).catch((e) => console.warn('progress not saved', e.code));
  };
  const onTime = () => save(false), onPause = () => save(true), onEnd = () => save(true, true), onHide = () => document.visibilityState === 'hidden' && video.currentTime > 5 && save(true);
  video.addEventListener('timeupdate', onTime); video.addEventListener('pause', onPause); video.addEventListener('ended', onEnd);
  document.addEventListener('visibilitychange', onHide);
  return () => { video.removeEventListener('timeupdate', onTime); video.removeEventListener('pause', onPause); video.removeEventListener('ended', onEnd); document.removeEventListener('visibilitychange', onHide); };
}

function reportDialog(user, episodeId) {
  if (!user) { openModal({ title: 'Report a problem', content: html`<p>Please <a href="/login?next=${encodeURIComponent(location.pathname)}">log in</a> to send a report.</p>` }); return; }
  const m = openModal({ title: 'Report a playback problem', content: html`<form class="form" id="rep">
    <div class="field"><label for="r-reason">What is wrong?</label><select id="r-reason" name="reason" required><option value="not_playing">Video does not play</option><option value="wrong_episode">Wrong episode</option><option value="bad_quality">Poor quality</option><option value="subtitles">Subtitle problem</option><option value="other">Something else</option></select></div>
    <div class="field"><label for="r-details">Details (optional)</label><textarea id="r-details" name="details" maxlength="500" rows="3"></textarea></div>
    <p class="form-error" data-error role="alert"></p>
    <div class="form-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Send report</button></div></form>` });
  $('#rep', m.el).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await addDoc(collection(requireDb(), 'reports'), { uid: user.uid, contentType: 'episode', contentId: episodeId, reason: f.reason.value, details: f.details.value.trim().slice(0, 500), status: 'open', createdAt: serverTimestamp() });
      m.close(); toast('Thanks — your report was sent.', 'success');
    } catch (err) { console.error(err); f.querySelector('[data-error]').textContent = 'Could not send the report. Please try again.'; btn.disabled = false; }
  });
}
