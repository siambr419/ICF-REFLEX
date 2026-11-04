// Run with the emulator:  npm install && npm run test:rules   (needs Java 11+ for the Firestore emulator)
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'icf-reflex-test', firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [['cm', 'content_manager'], ['admin', 'admin'], ['sa', 'super_admin'], ['mod', 'moderator']]) await setDoc(doc(db, 'userRoles', uid), { uid, role });
    await setDoc(doc(db, 'anime', 'pub'), anime('pub', 'public'));
    await setDoc(doc(db, 'anime', 'hid'), anime('hid', 'hidden'));
    await setDoc(doc(db, 'episodes', 'e-pub'), episode(true));
    await setDoc(doc(db, 'episodes', 'e-hid'), episode(false));
    await setDoc(doc(db, 'episodeSources', 's-on'), { isActive: true, episodeId: 'e-pub' });
    await setDoc(doc(db, 'episodeSources', 's-off'), { isActive: false, episodeId: 'e-hid' });
    await setDoc(doc(db, 'users', 'u1'), { uid: 'u1', displayName: 'U', email: 'u1@x.com', photoURL: '', preferredLanguage: 'en', theme: 'dark', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), accountStatus: 'active' });
  });
});
const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.com` }).firestore();
const guest = () => env.unauthenticatedContext().firestore();
const anime = (slug, visibility) => ({ title: 'T', alternativeTitles: [], slug, description: '', posterUrl: '', coverUrl: '', bannerUrl: '', genres: [], releaseYear: 2020, status: 'ongoing', animeType: 'TV', rating: 7.5, featured: false, visibility, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), titleLower: 't', searchTokens: ['t'] });
const episode = (p) => ({ animeId: 'pub', animeTitle: 'T', seasonId: 'pub_s1', episodeNumber: 1, title: '', description: '', thumbnailUrl: '', durationSeconds: 1400, releaseAt: Timestamp.now(), isPublished: p, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });

test('guests read public anime only', async () => {
  await assertSucceeds(getDoc(doc(guest(), 'anime', 'pub')));
  await assertFails(getDoc(doc(guest(), 'anime', 'hid')));
});
test('guests read published episodes and active sources only', async () => {
  await assertSucceeds(getDoc(doc(guest(), 'episodes', 'e-pub')));
  await assertFails(getDoc(doc(guest(), 'episodes', 'e-hid')));
  await assertSucceeds(getDoc(doc(guest(), 'episodeSources', 's-on')));
  await assertFails(getDoc(doc(guest(), 'episodeSources', 's-off')));
});
test('regular users cannot write catalog data', async () => {
  await assertFails(setDoc(doc(as('u1'), 'anime', 'x'), { ...anime('x', 'public'), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(as('u1'), 'anime', 'pub')));
});
test('content manager can write valid anime but not invalid', async () => {
  const d = { ...anime('new', 'hidden'), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('cm'), 'anime', 'new'), d));
  await assertFails(setDoc(doc(as('cm'), 'anime', 'bad'), { ...d, slug: 'bad', visibility: 'secret' }));
  await assertFails(setDoc(doc(as('cm'), 'anime', 'bad2'), { ...d, slug: 'bad2', posterUrl: 'javascript:alert(1)' }));
});
test('content manager can read hidden anime; guest cannot', async () => {
  await assertSucceeds(getDoc(doc(as('cm'), 'anime', 'hid')));
});
test('embed sources must use allowlisted hosts', async () => {
  const base = { episodeId: 'e-pub', sourceName: 'n', displayLabel: 'n', provider: 'youtube', sourceType: 'embed', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', directVideoUrl: '', language: 'ja', qualityLabel: '1080p', tracks: [], isDefault: true, isActive: true, sortOrder: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('cm'), 'episodeSources', 'ok'), base));
  await assertFails(setDoc(doc(as('cm'), 'episodeSources', 'evil'), { ...base, embedUrl: 'https://evil.example/embed/x' }));
  await assertFails(setDoc(doc(as('cm'), 'episodeSources', 'js'), { ...base, embedUrl: 'javascript:alert(1)' }));
});
test('users cannot assign themselves roles', async () => {
  await assertFails(setDoc(doc(as('u1'), 'userRoles', 'u1'), { uid: 'u1', role: 'super_admin', assignedAt: serverTimestamp(), assignedBy: 'u1' }));
  await assertFails(setDoc(doc(as('u1'), 'userRoles', 'u1'), { uid: 'u1', role: 'premium', assignedAt: serverTimestamp(), assignedBy: 'u1' }));
});
test('admin cannot assign roles; super admin can, but not to self', async () => {
  const r = (uid, by, role = 'moderator') => ({ uid, role, assignedAt: serverTimestamp(), assignedBy: by });
  await assertFails(setDoc(doc(as('admin'), 'userRoles', 'u1'), r('u1', 'admin')));
  await assertSucceeds(setDoc(doc(as('sa'), 'userRoles', 'u1'), r('u1', 'sa')));
  await assertFails(setDoc(doc(as('sa'), 'userRoles', 'sa'), r('sa', 'sa', 'admin')));
});
test('users read their own role but not others', async () => {
  await assertSucceeds(getDoc(doc(as('cm'), 'userRoles', 'cm')));
  await assertFails(getDoc(doc(as('u1'), 'userRoles', 'cm')));
});
test('users edit only permitted profile fields', async () => {
  await assertSucceeds(updateDoc(doc(as('u1'), 'users', 'u1'), { displayName: 'New', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('u1'), 'users', 'u1'), { accountStatus: 'suspended', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('u1'), 'users', 'u1'), { email: 'x@y.com', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('other'), 'users', 'u1'), { displayName: 'Hax', updatedAt: serverTimestamp() }));
});
test('users cannot read other profiles; admins can', async () => {
  await assertFails(getDoc(doc(as('other'), 'users', 'u1')));
  await assertSucceeds(getDoc(doc(as('admin'), 'users', 'u1')));
});
test('watchlist and progress are private', async () => {
  await assertSucceeds(setDoc(doc(as('u1'), 'watchlists', 'u1', 'items', 'pub'), { animeId: 'pub', addedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(as('u1'), 'watchlists', 'other', 'items', 'pub'), { animeId: 'pub', addedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(as('other'), 'watchlists', 'u1', 'items', 'pub')));
  const p = { animeId: 'pub', episodeId: 'e-pub', currentTimeSeconds: 10, durationSeconds: 1400, completed: false, updatedAt: serverTimestamp(), episodeNumber: 1, episodeTitle: '', animeTitle: 'T', posterUrl: '' };
  await assertSucceeds(setDoc(doc(as('u1'), 'watchProgress', 'u1', 'episodes', 'e-pub'), p));
  await assertFails(setDoc(doc(as('other'), 'watchProgress', 'u1', 'episodes', 'e-pub'), p));
  await assertFails(setDoc(doc(as('u1'), 'watchProgress', 'u1', 'episodes', 'e-pub'), { ...p, currentTimeSeconds: -5 }));
});
test('users cannot forge subscriptions or payments', async () => {
  await assertFails(setDoc(doc(as('u1'), 'subscriptions', 'u1'), { uid: 'u1', status: 'active' }));
  await assertFails(setDoc(doc(as('u1'), 'payments', 'p1'), { uid: 'u1', status: 'paid' }));
});
test('reports: any user can create their own; only moderators read all', async () => {
  const r = { uid: 'u1', contentType: 'episode', contentId: 'e-pub', reason: 'not_playing', details: '', status: 'open', createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('u1'), 'reports', 'r1'), r));
  await assertFails(setDoc(doc(as('u1'), 'reports', 'r2'), { ...r, uid: 'someone-else' }));
  await assertFails(setDoc(doc(as('u1'), 'reports', 'r3'), { ...r, status: 'resolved' }));
  await assertFails(getDoc(doc(as('other'), 'reports', 'r1')));
  await assertSucceeds(getDoc(doc(as('mod'), 'reports', 'r1')));
});
test('audit logs: staff create own entries, nobody edits, only admins read', async () => {
  const l = { actorUid: 'cm', action: 'create', resourceType: 'anime', resourceId: 'x', createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('cm'), 'auditLogs', 'l1'), l));
  await assertFails(setDoc(doc(as('cm'), 'auditLogs', 'l2'), { ...l, actorUid: 'admin' }));
  await assertFails(setDoc(doc(as('u1'), 'auditLogs', 'l3'), { ...l, actorUid: 'u1' }));
  await assertFails(updateDoc(doc(as('cm'), 'auditLogs', 'l1'), { action: 'x' }));
  await assertFails(getDoc(doc(as('cm'), 'auditLogs', 'l1')));
});
test('unknown collections are denied', async () => {
  await assertFails(getDoc(doc(as('sa'), 'secrets', 'x')));
  await assertFails(setDoc(doc(guest(), 'anything', 'x'), { a: 1 }));
});
