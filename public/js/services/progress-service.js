import { requireDb, collection, query, orderBy, limit, getDocs, getDoc, setDoc, doc, serverTimestamp, snap } from '../firebase/firestore.js';
import { safeHttps } from '../utils/url-validator.js';

const ref = (uid, epId) => doc(requireDb(), 'watchProgress', uid, 'episodes', epId);
export async function getProgress(uid, epId) { const s = await getDoc(ref(uid, epId)); return s.exists() ? s.data() : null; }
/** Writes are throttled by the caller (every ~30 s, on pause, on end, on page hide). */
export function saveProgress(uid, { anime, episode, currentTime = 0, duration = 0, completed = false }) {
  const clamp = (n) => Math.max(0, Math.min(86400, Math.floor(Number(n) || 0)));
  return setDoc(ref(uid, episode.id), {
    animeId: anime.id, episodeId: episode.id, currentTimeSeconds: clamp(currentTime), durationSeconds: clamp(duration), completed: !!completed,
    updatedAt: serverTimestamp(), episodeNumber: episode.episodeNumber, episodeTitle: String(episode.title || '').slice(0, 200),
    animeTitle: String(anime.title || '').slice(0, 200), posterUrl: safeHttps(anime.posterUrl || anime.coverUrl),
  });
}
export async function listProgress(uid, max = 50) {
  const s = await getDocs(query(collection(requireDb(), 'watchProgress', uid, 'episodes'), orderBy('updatedAt', 'desc'), limit(max)));
  return s.docs.map(snap);
}
export const percent = (p) => (p.durationSeconds > 0 ? Math.min(100, Math.round((p.currentTimeSeconds / p.durationSeconds) * 100)) : 0);
