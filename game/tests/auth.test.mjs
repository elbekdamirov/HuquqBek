import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createLearningStore } from '../server/learning.mjs';
import { createAuth, verifyGoogleIdToken } from '../server/auth.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(payload, kid = 'k1') {
  const head = b64({ alg: 'RS256', kid }), body = b64(payload);
  return `${head}.${body}.${createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url')}`;
}
const keys = async () => [jwk];
const now = Date.parse('2026-11-21T10:00:00Z');
const good = { iss: 'https://accounts.google.com', aud: 'client-1', sub: '123', email: 'a@example.com', email_verified: true, name: 'Aziza Karimova', exp: now / 1000 + 600 };

test('Google ID token: signature, audience, issuer and expiry are all enforced', async () => {
  assert.equal((await verifyGoogleIdToken(token(good), 'client-1', now, keys)).sub, '123');
  await assert.rejects(verifyGoogleIdToken(token(good), 'other-client', now, keys), /bu ilova/);
  await assert.rejects(verifyGoogleIdToken(token({ ...good, iss: 'evil.com' }), 'client-1', now, keys), /bu ilova/);
  await assert.rejects(verifyGoogleIdToken(token({ ...good, exp: now / 1000 - 600 }), 'client-1', now, keys), /muddati/);
  const t = token(good); const forged = t.split('.'); forged[1] = b64({ ...good, sub: '999' });
  await assert.rejects(verifyGoogleIdToken(forged.join('.'), 'client-1', now, keys), /imzo/);
});

test('signing in links progress to the account and restores it in a new browser', async () => {
  const s = createLearningStore(':memory:');
  try {
    const auth = createAuth(s.db, { env: { GOOGLE_CLIENT_ID: 'client-1' }, verify: async () => ({ sub: '123', email: 'a@example.com', name: 'Aziza Karimova' }) });
    s.ensure('browserA'); s.db.prepare("INSERT INTO completions VALUES('browserA','A-B01','x','2026')").run();
    assert.equal(await auth.google('browserA', { credential: 't' }), 'browserA');
    assert.equal(s.profile('browserA').name, 'Aziza Karimova');
    s.ensure('browserB'); s.db.prepare("INSERT INTO completions VALUES('browserB','S-B01','y','2026')").run();
    const learner = await auth.google('browserB', { credential: 't' });
    assert.equal(learner, 'browserA');
    assert.deepEqual(s.completed('browserA').map(c => c.room).sort(), ['A-B01', 'S-B01']);
    auth.setPath('browserA', 'sudya'); assert.equal(s.profile('browserA').activePath, 'sudya');
    assert.throws(() => auth.setPath('browserA', 'x'), /noto‘g‘ri/);
    await assert.rejects(createAuth(s.db, { env: {} }).google('browserA', { credential: 't' }), /sozlanmagan/);
  } finally { s.db.close(); }
});

test('interest test with a single winner sets the active path; ties leave the choice to the learner', () => {
  const s = createLearningStore(':memory:');
  try {
    s.interests('a', { answers: ['sudya', 'sudya', 'sudya', 'advokat', 'prokuror', 'sudya'] });
    assert.equal(s.profile('a').activePath, 'sudya');
    s.interests('b', { answers: ['advokat', 'sudya', 'prokuror', 'advokat', 'sudya', 'prokuror'] });
    assert.equal(s.profile('b').activePath, null);
  } finally { s.db.close(); }
});
