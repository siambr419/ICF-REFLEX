import test from 'node:test';
import assert from 'node:assert/strict';
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const { explainError, indexLink, isMissingIndex } = await import('../../public/js/utils/errors.js');

test('missing-index errors are detected, explained and the console link extracted', () => {
  const e = { code: 'failed-precondition', message: 'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=abc' };
  assert.ok(isMissingIndex(e)); assert.match(explainError(e), /firebase deploy --only firestore:indexes/);
  assert.match(indexLink(e), /^https:\/\/console\.firebase\.google\.com\//);
  assert.equal(indexLink({ message: 'see https://evil.example/x' }), '');
  assert.ok(!isMissingIndex({ code: 'permission-denied', message: 'index' }));
});
test('other error codes keep friendly messages', () => {
  assert.match(explainError({ code: 'permission-denied' }), /permission/);
  assert.match(explainError({ code: 'resource-exhausted' }), /quota/);
});
