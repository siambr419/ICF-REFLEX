// Run with the emulator:  npm install && npm run test:rules   (needs Java 21+; uses the demo-icf-reflex project, never production)
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, collection, collectionGroup, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-icf-reflex', firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [['cm', 'content_manager'], ['admin', 'admin'], ['sa', 'super_admin'], ['mod', 'moderator']]) await setDoc(doc(db, 'userRoles', uid), { uid, role });
    await setDoc(doc(db, 'anime', 'pub'), anime('pub', 'public'));
    await setDoc(doc(db, 'anime', 'hid'), anime('hid', 'hidden'));
    await setDoc(doc(db, 'seasons', 'pub_s1'), season('pub', true, true));
    await setDoc(doc(db, 'seasons', 'hid_s1'), season('hid', true, false));
    await setDoc(doc(db, 'episodes', 'e-pub'), episode('pub', true, true));
    await setDoc(doc(db, 'episodes', 'e-unpub'), episode('pub', false, true));
    await setDoc(doc(db, 'episodes', 'e-hid'), episode('hid', true, false)); // published episode of a HIDDEN anime
    await setDoc(doc(db, 'episodeSources', 's-on'), { isActive: true, episodeId: 'e-pub' });
    await setDoc(doc(db, 'episodeSources', 's-off'), { isActive: false, episodeId: 'e-pub' });
    await setDoc(doc(db, 'episodeSources', 's-unpub'), { isActive: true, episodeId: 'e-unpub' });
    await setDoc(doc(db, 'episodeSources', 's-hid'), { isActive: true, episodeId: 'e-hid' });
    await setDoc(doc(db, 'users', 'u1'), { uid: 'u1', displayName: 'U', email: 'u1@x.com', photoURL: '', preferredLanguage: 'en', theme: 'dark', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), accountStatus: 'active' });
  });
});
// email_verified defaults to true; pass false for an unverified account.
const as = (uid, verified = true) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: verified }).firestore();
const guest = () => env.unauthenticatedContext().firestore();
const anime = (slug, visibility) => ({ title: 'T', alternativeTitles: [], slug, description: '', posterUrl: '', coverUrl: '', bannerUrl: '', genres: [], releaseYear: 2020, status: 'ongoing', animeType: 'TV', rating: 7.5, featured: false, visibility, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), titleLower: 't', searchTokens: ['t'] });
const season = (animeId, isPublished, animePublic) => ({ animeId, seasonNumber: 1, title: 'S1', description: '', releaseYear: 2020, sortOrder: 1, isPublished, animePublic });
const episode = (animeId, isPublished, animePublic) => ({ animeId, animeTitle: 'T', seasonId: `${animeId}_s1`, episodeNumber: 1, title: '', description: '', thumbnailUrl: '', durationSeconds: 1400, releaseAt: Timestamp.now(), isPublished, animePublic, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
const source = (over = {}) => ({ episodeId: 'e-pub', sourceName: 'n', displayLabel: 'n', provider: 'abyss', sourceType: 'embed', embedUrl: 'https://abysscdn.com/?v=K8R6OOjS7', directVideoUrl: '', language: 'ja', qualityLabel: '1080p', tracks: [], isDefault: false, isActive: false, sortOrder: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over });

test('guests read public anime only', async () => {
  await assertSucceeds(getDoc(doc(guest(), 'anime', 'pub')));
  await assertFails(getDoc(doc(guest(), 'anime', 'hid')));
});
test('hidden anime: no episode/season/source leakage, public ones readable', async () => {
  const g = guest();
  await assertSucceeds(getDoc(doc(g, 'episodes', 'e-pub')));
  await assertFails(getDoc(doc(g, 'episodes', 'e-unpub')));   // unpublished
  await assertFails(getDoc(doc(g, 'episodes', 'e-hid')));     // published, but parent anime is hidden
  await assertSucceeds(getDoc(doc(g, 'seasons', 'pub_s1')));
  await assertFails(getDoc(doc(g, 'seasons', 'hid_s1')));
  await assertSucceeds(getDoc(doc(g, 'episodeSources', 's-on')));
  await assertFails(getDoc(doc(g, 'episodeSources', 's-off')));    // inactive
  await assertFails(getDoc(doc(g, 'episodeSources', 's-unpub')));  // episode unpublished
  await assertFails(getDoc(doc(g, 'episodeSources', 's-hid')));    // anime hidden
});
test('public list queries only succeed when constrained to public content', async () => {
  const g = guest();
  await assertSucceeds(getDocs(query(collection(g, 'episodes'), where('animeId', '==', 'pub'), where('isPublished', '==', true), where('animePublic', '==', true))));
  await assertFails(getDocs(query(collection(g, 'episodes'), where('animeId', '==', 'hid'), where('isPublished', '==', true))));
  await assertFails(getDocs(query(collection(g, 'episodes'), where('isPublished', '==', true))));
  await assertSucceeds(getDocs(query(collection(g, 'episodeSources'), where('episodeId', '==', 'e-pub'), where('isActive', '==', true))));
  await assertFails(getDocs(query(collection(g, 'episodeSources'), where('isActive', '==', true)))); // enumeration blocked
});
test('staff still read hidden content', async () => {
  await assertSucceeds(getDoc(doc(as('cm'), 'episodes', 'e-hid')));
  await assertSucceeds(getDoc(doc(as('cm'), 'episodeSources', 's-off')));
});
test('catalog writes keep animePublic consistent with the anime', async () => {
  const cm = as('cm'), now = { createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(cm, 'episodes', 'n1'), { ...episode('pub', true, true), ...now }));
  await assertFails(setDoc(doc(cm, 'episodes', 'n2'), { ...episode('hid', true, true), ...now })); // claims public for a hidden anime
  await assertSucceeds(setDoc(doc(cm, 'seasons', 'pub_s2'), season('pub', true, true)));
  await assertFails(setDoc(doc(cm, 'seasons', 'hid_s2'), season('hid', true, true)));
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
test('embed sources: allowlisted hosts only, Abyss.to supported, provider must match URL', async () => {
  const cm = as('cm');
  await assertSucceeds(setDoc(doc(cm, 'episodeSources', 'abyss'), source()));
  await assertSucceeds(setDoc(doc(cm, 'episodeSources', 'yt'), source({ provider: 'youtube', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' })));
  await assertSucceeds(setDoc(doc(cm, 'episodeSources', 'mp4'), source({ provider: 'direct', sourceType: 'direct', embedUrl: '', directVideoUrl: 'https://cdn.example.com/a.mp4' })));
  await assertFails(setDoc(doc(cm, 'episodeSources', 'dash'), source({ embedUrl: 'https://dash.abyss.to/' })));
  await assertFails(setDoc(doc(cm, 'episodeSources', 'evil'), source({ embedUrl: 'https://evil.example/embed/x' })));
  await assertFails(setDoc(doc(cm, 'episodeSources', 'mix'), source({ provider: 'youtube' }))); // abyss URL labelled youtube
  await assertFails(setDoc(doc(cm, 'episodeSources', 'js'), source({ embedUrl: 'javascript:alert(1)' })));
  await assertFails(setDoc(doc(as('u1'), 'episodeSources', 'user'), source()));
});
test('staff can activate and deactivate a source', async () => {
  const cm = as('cm');
  await assertSucceeds(setDoc(doc(cm, 'episodeSources', 'x'), source()));
  await assertSucceeds(updateDoc(doc(cm, 'episodeSources', 'x'), { isActive: true, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(cm, 'episodeSources', 'x'), { isActive: false, updatedAt: serverTimestamp() }));
});
test('posters: staff manage, others cannot', async () => {
  const p = { title: 'P', animeId: 'pub', imageUrl: 'https://img.example/p.jpg', type: 'poster', altText: '', isPublished: true, displayOrder: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: 'cm' };
  await assertSucceeds(setDoc(doc(as('cm'), 'posters', 'p1'), p));
  await assertFails(setDoc(doc(as('cm'), 'posters', 'p2'), { ...p, imageUrl: 'data:image/png;base64,AAAA' }));
  await assertFails(setDoc(doc(as('cm'), 'posters', 'p3'), { ...p, type: 'weird' }));
  await assertFails(setDoc(doc(as('cm'), 'posters', 'p4'), { ...p, animeId: 'nope' }));
  await assertFails(setDoc(doc(as('u1'), 'posters', 'p5'), { ...p, createdBy: 'u1' }));
  await assertFails(getDoc(doc(guest(), 'posters', 'p1')));
  await assertSucceeds(deleteDoc(doc(as('cm'), 'posters', 'p1')));
});
test('unverified users cannot use watchlist, progress, reports or edit their profile; they can create it', async () => {
  const u = as('u2', false);
  await assertFails(setDoc(doc(u, 'watchlists', 'u2', 'items', 'pub'), { animeId: 'pub', addedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(u, 'reports', 'r'), { uid: 'u2', contentType: 'episode', contentId: 'e-pub', reason: 'other', details: '', status: 'open', createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(u, 'users', 'u2'), { uid: 'u2', displayName: 'N', email: 'u2@x.com', photoURL: '', preferredLanguage: 'en', theme: 'dark', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), accountStatus: 'active' }));
  await assertFails(updateDoc(doc(u, 'users', 'u2'), { displayName: 'M', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as('u1'), 'users', 'u1'), { displayName: 'M', updatedAt: serverTimestamp() }));
});
test('staff are not locked out by email verification', async () => {
  const d = { ...anime('unv', 'hidden'), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('cm', false), 'anime', 'unv'), d));
});
test('orphan cleanup: staff may read/delete user references only when the anime is gone', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const prog = (animeId) => ({ animeId, episodeId: 'x', currentTimeSeconds: 1, durationSeconds: 2, completed: false, updatedAt: Timestamp.now(), episodeNumber: 1, episodeTitle: '', animeTitle: '', posterUrl: '' });
    await setDoc(doc(db, 'watchProgress', 'u1', 'episodes', 'gone-1'), prog('gone'));
    await setDoc(doc(db, 'watchProgress', 'u1', 'episodes', 'live-1'), prog('pub'));
  });
  const cm = as('cm');
  await assertSucceeds(getDocs(query(collectionGroup(cm, 'episodes'), where('animeId', '==', 'gone'))));
  await assertFails(getDocs(query(collectionGroup(cm, 'episodes'), where('animeId', '==', 'pub'))));
  await assertSucceeds(deleteDoc(doc(cm, 'watchProgress', 'u1', 'episodes', 'gone-1')));
  await assertFails(deleteDoc(doc(cm, 'watchProgress', 'u1', 'episodes', 'live-1')));
  await assertFails(deleteDoc(doc(as('u1'), 'watchProgress', 'u2', 'episodes', 'x')));
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
