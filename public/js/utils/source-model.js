/* Pure helpers for the episodeSources document (no Firebase imports, so they can be unit-tested in Node). */
import { resolveSource, parseTracks } from './url-validator.js';

/** New sources are INACTIVE until an admin explicitly activates them. */
export const SOURCE_DEFAULTS = Object.freeze({
  provider: 'abyss', language: 'Japanese', qualityLabel: '1080p', sortOrder: 1, isDefault: false, isActive: false,
});

export const sourceKind = (provider) => (provider === 'direct' ? 'direct' : 'embed');
export const asSource = (v) => ({ provider: v.provider, sourceType: sourceKind(v.provider), embedUrl: v.embedUrl, directVideoUrl: v.directVideoUrl });

/** Builds the Firestore document (without timestamps). Throws {userMessage} when the URL is not acceptable. */
export function buildSourceData(episodeId, v) {
  const s = asSource(v), r = resolveSource(s);
  if (!r.ok) throw Object.assign(new Error(r.error), { userMessage: r.error });
  const t = parseTracks(v.tracks);
  if (s.sourceType === 'embed' && v.tracks) { const m = 'Subtitle tracks only work with direct video files.'; throw Object.assign(new Error(m), { userMessage: m }); }
  if (t.error) throw Object.assign(new Error(t.error), { userMessage: t.error });
  return {
    episodeId, sourceName: v.sourceName, displayLabel: v.displayLabel || v.sourceName, provider: r.provider, sourceType: s.sourceType,
    embedUrl: s.sourceType === 'embed' ? r.src : '', directVideoUrl: s.sourceType === 'direct' ? r.src : '', language: v.language, qualityLabel: v.qualityLabel,
    tracks: t.tracks, isDefault: !!v.isDefault, isActive: v.isActive === true, sortOrder: Math.trunc(v.sortOrder ?? 1),
  };
}
