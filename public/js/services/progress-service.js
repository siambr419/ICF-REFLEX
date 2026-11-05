import { requireDb, collection, query, orderBy, limit, startAfter, getDocs, getDoc, setDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { safeHttps } from '../utils/url-validator.js';

const ref = (uid, epId) => doc(requireDb(), 'watchProgress', uid, 'episodes', epId);
const clamp = (n) => Math.max(0, Math.min(86400, Math.floor(Number(n) || 0)));
export async function getProgress(uid, epId) { const s = await getDoc(ref(uid, epId)); return s.exists() ? s.data() : null; }

/** Full progress document (rules require every key). */
function progressDoc({ anime, episode, currentTime = 0, duration = 0, completed = false }) {
  return {
    animeId: anime.id, episodeId: episode.id, currentTimeSeconds: clamp(currentTime), durationSeconds: clamp(duration), completed: !!completed,
    updatedAt: serverTimestamp(), episodeNumber: episode.episodeNumber, episodeTitle: String(episode.title || '').slice(0, 200),
    animeTitle: String(anime.title || '').slice(0, 200), posterUrl: safeHttps(anime.posterUrl || anime.coverUrl),
  };
}
/** Writes are throttled by the caller (every ~30 s, on pause, on end, on page hide). */
export const saveProgress = (uid, args) => setDoc(ref(uid, args.episode.id), progressDoc(args));

/**
 * "Opened" marker. Refreshes `updatedAt` (and display metadata) every time an episode is opened while PRESERVING the stored
 * playback position and completion flag. Without a stored document it creates one at position 0. Third-party embeds do not
 * expose playback time, so no position is ever invented for them.
 */
export function touchProgress(uid, { anime, episode, existing = null }) {
  return setDoc(ref(uid, episode.id), progressDoc({
    anime, episode,
    currentTime: existing?.currentTimeSeconds ?? 0,
    duration: existing?.durationSeconds ?? episode.durationSeconds ?? 0,
    completed: existing?.completed ?? false,
  }));
}
/** One page of history, newest first. Pass the returned `cursor` back in for the next page. */
export async function listProgressPage(uid, { size = 50, cursor = null } = {}) {
  const c = [orderBy('updatedAt', 'desc')]; if (cursor) c.push(startAfter(cursor)); c.push(limit(size));
  const s = await getDocs(query(collection(requireDb(), 'watchProgress', uid, 'episodes'), ...c));
  return { items: s.docs.map(snap), cursor: s.docs.at(-1) || null, done: s.size < size };
}
export const listProgress = async (uid, max = 50) => (await listProgressPage(uid, { size: max })).items;
export const percent = (p) => (p.durationSeconds > 0 ? Math.min(100, Math.round((p.currentTimeSeconds / p.durationSeconds) * 100)) : 0);
