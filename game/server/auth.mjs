// Google sign-in for HuquqBek. The browser obtains a Google ID token (Google Identity Services); the server verifies
// its RS256 signature against Google's published keys, audience, issuer and expiry, then links the Google account to a
// learner record so progress follows the account across browsers. No Google secret is needed for ID-token sign-in.
import { createPublicKey, createVerify } from 'node:crypto';
import { ApiError } from './runtime.mjs';
import { isDevMode } from './commerce.mjs';

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
let jwks = { keys: [], fetched: 0 };
async function googleKeys(force = false) {
  if (!force && jwks.keys.length && Date.now() - jwks.fetched < 3600_000) return jwks.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new ApiError(502, 'Google kalitlarini olish imkoni bo‘lmadi.');
  jwks = { keys: (await r.json()).keys || [], fetched: Date.now() };
  return jwks.keys;
}
const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export async function verifyGoogleIdToken(token, clientId, now = Date.now(), keyLoader = googleKeys) {
  if (typeof token !== 'string' || token.split('.').length !== 3 || token.length > 4096) throw new ApiError(400, 'Google tokeni noto‘g‘ri.');
  const [h, p, sig] = token.split('.');
  let header, payload;
  try { header = JSON.parse(b64(h)); payload = JSON.parse(b64(p)); } catch { throw new ApiError(400, 'Google tokeni o‘qilmadi.'); }
  if (header.alg !== 'RS256') throw new ApiError(401, 'Token algoritmi qo‘llab-quvvatlanmaydi.');
  let jwk = (await keyLoader()).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await keyLoader(true)).find(k => k.kid === header.kid);
  if (!jwk) throw new ApiError(401, 'Google kaliti topilmadi.');
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), b64(sig));
  if (!ok) throw new ApiError(401, 'Google imzosi tasdiqlanmadi.');
  if (!ISSUERS.includes(payload.iss) || payload.aud !== clientId) throw new ApiError(401, 'Token bu ilova uchun berilmagan.');
  if (!(payload.exp * 1000 > now - 30_000)) throw new ApiError(401, 'Google token muddati tugagan.');
  if (payload.email && payload.email_verified === false) throw new ApiError(401, 'Google email tasdiqlanmagan.');
  return { sub: String(payload.sub), email: payload.email || null, name: payload.name || null, picture: payload.picture || null };
}

export function createAuth(db, { env = process.env, verify = verifyGoogleIdToken } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS accounts(provider_sub TEXT PRIMARY KEY,learner TEXT NOT NULL UNIQUE,email TEXT,name TEXT,picture TEXT,created TEXT NOT NULL,last_login TEXT NOT NULL);`);
  const cols = db.prepare('PRAGMA table_info(learners)').all().map(c => c.name);
  if (!cols.includes('active_path')) db.exec('ALTER TABLE learners ADD COLUMN active_path TEXT');
  if (!cols.includes('onboarding')) db.exec('ALTER TABLE learners ADD COLUMN onboarding TEXT');
  const clientId = () => env.GOOGLE_CLIENT_ID || '';

  function account(owner) {
    const a = db.prepare('SELECT provider_sub,email,name,picture FROM accounts WHERE learner=?').get(owner);
    return a ? { provider: a.provider_sub.startsWith('dev:') ? 'dev' : 'google', email: a.email, name: a.name, picture: a.picture } : null;
  }
  /** Copy guest progress into the signed-in learner without overwriting anything the account already has. */
  function merge(from, to) {
    if (from === to) return;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT OR IGNORE INTO completions SELECT ?,room,attempt,created FROM completions WHERE owner=?').run(to, from);
      db.prepare('INSERT OR IGNORE INTO reading_checks SELECT ?,room,question,passed FROM reading_checks WHERE owner=?').run(to, from);
      const src = db.prepare('SELECT interests,active_path FROM learners WHERE id=?').get(from), dst = db.prepare('SELECT interests,active_path FROM learners WHERE id=?').get(to);
      if (src && dst) db.prepare('UPDATE learners SET interests=COALESCE(interests,?),active_path=COALESCE(active_path,?) WHERE id=?').run(src.interests, src.active_path, to);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function link(owner, profile) {
    const existing = db.prepare('SELECT learner FROM accounts WHERE provider_sub=?').get(profile.sub);
    const now = new Date().toISOString();
    let learner = owner;
    if (existing) { learner = existing.learner; merge(owner, learner); db.prepare('UPDATE accounts SET email=?,name=?,picture=?,last_login=? WHERE provider_sub=?').run(profile.email, profile.name, profile.picture, now, profile.sub); }
    else {
      if (db.prepare('SELECT 1 FROM accounts WHERE learner=?').get(owner)) { learner = null; }
      if (!learner) throw new ApiError(409, 'Bu brauzer boshqa hisobga ulangan. Avval hisobdan chiqing.');
      db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?)').run(profile.sub, learner, profile.email, profile.name, profile.picture, now, now);
    }
    const l = db.prepare('SELECT name FROM learners WHERE id=?').get(learner);
    if (profile.name && (!l?.name || l.name === 'O‘quvchi')) db.prepare('UPDATE learners SET name=? WHERE id=?').run(profile.name.slice(0, 80), learner);
    db.prepare("UPDATE learners SET onboarding='account' WHERE id=?").run(learner);
    return learner;
  }
  return {
    config: () => ({ googleClientId: clientId() || null, devLogin: isDevMode(env) }),
    account,
    async google(owner, body) {
      if (!clientId()) throw new ApiError(503, 'Google orqali kirish sozlanmagan (GOOGLE_CLIENT_ID).', 'GOOGLE_NOT_CONFIGURED');
      return link(owner, await verify(body?.credential, clientId()));
    },
    dev(owner, body) {
      if (!isDevMode(env)) throw new ApiError(404, 'Topilmadi.');
      const email = String(body?.email || '').trim().toLowerCase();
      if (!/^[^@\s]{1,64}@[^@\s]{1,120}$/.test(email)) throw new ApiError(400, 'Email noto‘g‘ri.');
      return link(owner, { sub: 'dev:' + email, email, name: String(body?.name || email.split('@')[0]).slice(0, 80), picture: null });
    },
    guest(owner) { db.prepare("UPDATE learners SET onboarding=COALESCE(onboarding,'guest') WHERE id=?").run(owner); },
    setPath(owner, path) {
      if (!['advokat', 'sudya', 'prokuror'].includes(path)) throw new ApiError(400, 'Yo‘nalish noto‘g‘ri.');
      db.prepare('UPDATE learners SET active_path=? WHERE id=?').run(path, owner);
    },
  };
}
