// HuquqBek commerce: canonical price catalog, orders, verified payment events, Premium subscriptions,
// role/level package entitlements, exam attempt credits and the shared lesson/lab access gate.
// Amounts are integers in provider minor units (USD cents, UZS tiyin). The browser only ever sends a SKU.
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from './runtime.mjs';

export const ROLES = ['advokat', 'prokuror', 'sudya'];
export const LEVELS = ['beginner', 'junior', 'senior'];
export const ATTEMPTS_PER_LEVEL = 2;
// Exactly three free laboratories in the whole catalog (stable explicit IDs, sortOrder 1–3).
export const FREE_LABS = ['A-B01', 'S-B01', 'P-B01'];
export const FREE_LESSONS_PER_PATH = 2;
// `order` restarts at 1 in every level, so the first two lessons of a path are Beginner rooms 1 and 2.
export const isFreeLesson = room => room.level === 'Beginner' && room.order <= FREE_LESSONS_PER_PATH;

const PACKAGES = [
  ['beginner', 'Beginner', 1900, ['beginner']],
  ['junior', 'Junior', 2900, ['junior']],
  ['senior', 'Senior', 3900, ['senior']],
  ['beginner_junior', 'Beginner + Junior', 3900, ['beginner', 'junior']],
  ['all', 'Beginner + Junior + Senior', 4900, ['beginner', 'junior', 'senior']],
];
export const CATALOG = [
  ...ROLES.flatMap(role => PACKAGES.map(([key, title, amount, levels]) => ({
    sku: `pkg_${role}_${key}`, family: 'role_package', kind: 'one_time', title, role, levels,
    currency: 'USD', amountMinor: amount, exponent: 2, period: null, bundle: levels.length > 1,
  }))),
  { sku: 'premium_monthly', family: 'premium', kind: 'subscription', title: 'Premium · oylik', role: null, levels: [], currency: 'UZS', amountMinor: 9_900_000, exponent: 2, period: 'month', bundle: false },
  { sku: 'premium_annual', family: 'premium', kind: 'subscription', title: 'Premium · yillik', role: null, levels: [], currency: 'UZS', amountMinor: 99_900_000, exponent: 2, period: 'year', bundle: false },
];
const bySku = new Map(CATALOG.map(p => [p.sku, p]));

export function formatPrice(p) {
  const major = p.amountMinor / 10 ** p.exponent;
  return p.currency === 'USD' ? `$${major}` : `${major.toLocaleString('ru-RU').replace(/ /g, ' ')} so‘m`;
}

export function isDevMode(env = process.env) {
  return env.HUQUQBEK_DEV_MODE === '1' && env.NODE_ENV !== 'production';
}

function addPeriod(iso, period) {
  const d = new Date(iso);
  if (period === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

export function signWebhook(raw, secret) { return createHmac('sha256', secret).update(raw).digest('hex'); }

export function createCommerce(db, { now = () => new Date(), env = process.env } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products(sku TEXT PRIMARY KEY,family TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,role TEXT,levels TEXT NOT NULL,currency TEXT NOT NULL,amount_minor INTEGER NOT NULL,period TEXT,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,owner TEXT NOT NULL,sku TEXT NOT NULL,family TEXT NOT NULL,role TEXT,currency TEXT NOT NULL,amount_minor INTEGER NOT NULL,status TEXT NOT NULL,provider TEXT NOT NULL,provider_ref TEXT,idempotency_key TEXT,created TEXT NOT NULL,paid_at TEXT,refunded_at TEXT,UNIQUE(owner,idempotency_key));
    CREATE TABLE IF NOT EXISTS payment_events(event_id TEXT PRIMARY KEY,order_id TEXT NOT NULL,type TEXT NOT NULL,verified INTEGER NOT NULL,received_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,sku TEXT NOT NULL,order_id TEXT NOT NULL,status TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,cancel_at_period_end INTEGER NOT NULL DEFAULT 0,provider_sub_id TEXT);
    CREATE TABLE IF NOT EXISTS entitlements(id TEXT PRIMARY KEY,owner TEXT NOT NULL,order_id TEXT NOT NULL,scope TEXT NOT NULL,role TEXT,level TEXT,created TEXT NOT NULL,revoked_at TEXT,UNIQUE(order_id,role,level));
    CREATE TABLE IF NOT EXISTS exam_credits(id TEXT PRIMARY KEY,owner TEXT NOT NULL,order_id TEXT NOT NULL,role TEXT NOT NULL,level TEXT NOT NULL,granted INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0,frozen INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,UNIQUE(order_id,role,level));
    CREATE TABLE IF NOT EXISTS commerce_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT,action TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL);`);
  // Seed / refresh the canonical catalog. Prices live here, never in requests.
  const seed = db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(sku) DO UPDATE SET title=excluded.title,amount_minor=excluded.amount_minor,currency=excluded.currency,levels=excluded.levels,period=excluded.period,active=1');
  for (const p of CATALOG) seed.run(p.sku, p.family, p.kind, p.title, p.role, JSON.stringify(p.levels), p.currency, p.amountMinor, p.period);

  const iso = () => now().toISOString();
  const audit = (owner, action, detail) => db.prepare('INSERT INTO commerce_audit(owner,action,detail,at) VALUES(?,?,?,?)').run(owner, action, JSON.stringify(detail), iso());
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

  const dev = () => isDevMode(env);
  const providerName = () => env.HUQUQBEK_PAYMENT_PROVIDER || (dev() ? 'dev_mock' : '');
  const webhookSecret = () => env.HUQUQBEK_BILLING_WEBHOOK_SECRET || (dev() ? 'huquqbek-dev-webhook-secret' : '');

  function premium(owner) {
    const t = iso();
    const subs = db.prepare('SELECT * FROM subscriptions WHERE owner=? ORDER BY period_end DESC').all(owner);
    for (const s of subs) if (s.status === 'active' && s.period_end <= t) db.prepare("UPDATE subscriptions SET status='expired' WHERE id=?").run(s.id);
    const current = db.prepare("SELECT * FROM subscriptions WHERE owner=? AND status IN ('active') AND period_end>? ORDER BY period_end DESC LIMIT 1").get(owner, t);
    const latest = current || db.prepare('SELECT * FROM subscriptions WHERE owner=? ORDER BY period_end DESC LIMIT 1').get(owner);
    const state = !latest ? 'none' : current ? (current.cancel_at_period_end ? 'cancel_at_period_end' : 'active') : latest.status === 'cancelled' ? 'cancelled' : 'expired';
    return { active: !!current, state, plan: latest?.sku || null, periodEnd: latest?.period_end || null, cancelAtPeriodEnd: !!latest?.cancel_at_period_end };
  }

  function packages(owner) {
    return db.prepare('SELECT e.role,e.level,e.order_id,e.created,e.revoked_at,o.sku FROM entitlements e JOIN orders o ON o.id=e.order_id WHERE e.owner=? AND e.scope=?').all(owner, 'role_level_package');
  }
  const ownsPackage = (owner, role, level) => !!db.prepare("SELECT 1 FROM entitlements WHERE owner=? AND scope='role_level_package' AND role=? AND level=? AND revoked_at IS NULL").get(owner, role, level);

  function credits(owner, role, level) {
    const rows = db.prepare('SELECT * FROM exam_credits WHERE owner=? AND role=? AND level=? ORDER BY created').all(owner, role, level);
    const usable = rows.filter(r => !r.frozen);
    const granted = usable.reduce((n, r) => n + r.granted, 0), consumed = rows.reduce((n, r) => n + r.consumed, 0);
    const remaining = usable.reduce((n, r) => n + Math.max(0, r.granted - r.consumed), 0);
    const batch = usable.find(r => r.consumed < r.granted) || usable.at(-1);
    return { granted, consumed, remaining, batch: batch ? { granted: batch.granted, remaining: Math.max(0, batch.granted - batch.consumed) } : null, purchases: rows.length };
  }

  /** Atomically consume one attempt credit. Caller must already be inside a transaction. */
  function consumeCredit(owner, role, level) {
    const row = db.prepare('SELECT * FROM exam_credits WHERE owner=? AND role=? AND level=? AND frozen=0 AND consumed<granted ORDER BY created LIMIT 1').get(owner, role, level);
    if (!row) throw new ApiError(409, 'Bu daraja uchun imtihon imkoniyati qolmagan.', 'NO_ATTEMPTS');
    db.prepare('UPDATE exam_credits SET consumed=consumed+1 WHERE id=? AND consumed<granted').run(row.id);
    audit(owner, 'credit_consumed', { creditId: row.id, role, level });
    return { creditId: row.id, orderId: row.order_id, attemptNumber: row.consumed + 1, granted: row.granted };
  }

  function canAccessLesson(owner, room) {
    if (isFreeLesson(room)) return true;
    return premium(owner).active;
  }
  function canAccessLab(owner, roomId) { return FREE_LABS.includes(roomId) || premium(owner).active; }
  function requireLesson(owner, room) {
    if (!canAccessLesson(owner, room)) throw new ApiError(403, 'Bu dars Premium obuna bilan ochiladi. Har yo‘nalishdagi 1–2-darslar bepul.', 'PREMIUM_REQUIRED', { resourceType: 'lesson', resourceId: room.id, pricingUrl: '#/pricing' });
  }
  function requireLab(owner, roomId) {
    if (!canAccessLab(owner, roomId)) throw new ApiError(403, 'Bu laboratoriya Premium obuna bilan ochiladi. Katalogda faqat 3 ta laboratoriya bepul.', 'PREMIUM_REQUIRED', { resourceType: 'lab', resourceId: roomId, pricingUrl: '#/pricing' });
  }

  function publicOrder(o) {
    return { id: o.id, sku: o.sku, family: o.family, role: o.role, currency: o.currency, amountMinor: o.amount_minor, price: formatPrice({ ...bySku.get(o.sku), amountMinor: o.amount_minor, currency: o.currency, exponent: 2 }), status: o.status, provider: o.provider, created: o.created, paidAt: o.paid_at, refundedAt: o.refunded_at };
  }

  function checkout(owner, body) {
    const product = bySku.get(body?.sku);
    if (!product) throw new ApiError(400, 'Mahsulot topilmadi.', 'UNKNOWN_SKU');
    // Any client-sent amount/currency is ignored on purpose; the catalog is authoritative.
    const provider = providerName();
    if (!provider) throw new ApiError(503, 'To‘lovlar sozlanmagan. Hozircha xarid qilib bo‘lmaydi.', 'PAYMENTS_NOT_CONFIGURED');
    if (provider !== 'dev_mock') throw new ApiError(503, `“${provider}” provayderi uchun integratsiya hali ulanmagan.`, 'PAYMENTS_NOT_CONFIGURED');
    const key = typeof body.idempotencyKey === 'string' && /^[\w-]{8,80}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
    if (key) { const prev = db.prepare('SELECT * FROM orders WHERE owner=? AND idempotency_key=?').get(owner, key); if (prev) return { order: publicOrder(prev), provider, devConfirm: prev.status === 'pending' }; }
    if (product.family === 'role_package') {
      const owned = product.levels.filter(l => ownsPackage(owner, product.role, l));
      const exhausted = product.levels.every(l => credits(owner, product.role, l).remaining === 0);
      if (owned.length === product.levels.length && !body.retake) throw new ApiError(409, 'Bu paket sizda bor. Qayta xarid faqat yangi 2 ta imtihon imkoniyati uchun, “retake” tasdig‘i bilan.', 'ALREADY_OWNED');
      if (body.retake && !exhausted) throw new ApiError(409, 'Qayta xarid faqat barcha imkoniyatlar tugaganda mumkin.', 'ATTEMPTS_REMAIN');
    }
    const id = 'ord_' + randomUUID().replace(/-/g, '').slice(0, 20);
    db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, owner, product.sku, product.family, product.role, product.currency, product.amountMinor, 'pending', provider, null, key, iso(), null, null);
    audit(owner, 'checkout_created', { orderId: id, sku: product.sku });
    return { order: publicOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(id)), provider, devConfirm: provider === 'dev_mock' };
  }

  function grant(order) {
    const product = bySku.get(order.sku);
    if (product.family === 'premium') {
      const t = iso();
      const current = db.prepare("SELECT * FROM subscriptions WHERE owner=? AND status='active' AND period_end>? ORDER BY period_end DESC LIMIT 1").get(order.owner, t);
      const start = current ? current.period_end : t;
      db.prepare('INSERT INTO subscriptions VALUES(?,?,?,?,?,?,?,0,?)').run(randomUUID(), order.owner, order.sku, order.id, 'active', start, addPeriod(start, product.period), order.provider_ref);
      db.prepare('INSERT OR IGNORE INTO entitlements VALUES(?,?,?,?,?,?,?,NULL)').run(randomUUID(), order.owner, order.id, 'premium_learning', null, null, t);
      return;
    }
    for (const level of product.levels) {
      db.prepare('INSERT OR IGNORE INTO entitlements VALUES(?,?,?,?,?,?,?,NULL)').run(randomUUID(), order.owner, order.id, 'role_level_package', product.role, level, iso());
      db.prepare('INSERT OR IGNORE INTO exam_credits VALUES(?,?,?,?,?,?,0,0,?)').run(randomUUID(), order.owner, order.id, product.role, level, ATTEMPTS_PER_LEVEL, iso());
    }
  }

  /** Verified provider event → idempotent grant. `raw` is the exact request body string. */
  function webhook(raw, signature) {
    const secret = webhookSecret();
    if (!secret) throw new ApiError(503, 'Webhook sirri sozlanmagan.', 'PAYMENTS_NOT_CONFIGURED');
    const expected = Buffer.from(signWebhook(raw, secret)), actual = Buffer.from(String(signature || ''));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new ApiError(401, 'Webhook imzosi noto‘g‘ri.', 'BAD_SIGNATURE');
    let event; try { event = JSON.parse(raw); } catch { throw new ApiError(400, 'Webhook JSON noto‘g‘ri.'); }
    if (typeof event?.id !== 'string' || typeof event.orderId !== 'string') throw new ApiError(400, 'Hodisa maydonlari yetarli emas.');
    return tx(() => {
      if (db.prepare('SELECT 1 FROM payment_events WHERE event_id=?').get(event.id)) return { duplicate: true };
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(event.orderId);
      if (!order) throw new ApiError(404, 'Buyurtma topilmadi.');
      db.prepare('INSERT INTO payment_events VALUES(?,?,?,1,?)').run(event.id, order.id, event.type, iso());
      if (event.type === 'order.paid') {
        if (event.amountMinor !== order.amount_minor || event.currency !== order.currency) throw new ApiError(409, 'To‘lov summasi buyurtmaga mos emas.', 'AMOUNT_MISMATCH');
        if (order.status === 'paid') return { duplicate: true };
        db.prepare("UPDATE orders SET status='paid',paid_at=?,provider_ref=? WHERE id=?").run(iso(), event.providerRef || null, order.id);
        grant({ ...order, provider_ref: event.providerRef || null });
        audit(order.owner, 'order_paid', { orderId: order.id, eventId: event.id });
      } else if (event.type === 'order.failed') {
        if (order.status === 'pending') db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(order.id);
      } else if (event.type === 'order.refunded') {
        db.prepare("UPDATE orders SET status='refunded',refunded_at=? WHERE id=?").run(iso(), order.id);
        // Policy: refunded packages stop granting new attempts; past attempts and issued certificates stay for review.
        db.prepare('UPDATE entitlements SET revoked_at=? WHERE order_id=? AND revoked_at IS NULL').run(iso(), order.id);
        db.prepare('UPDATE exam_credits SET frozen=1 WHERE order_id=?').run(order.id);
        db.prepare("UPDATE subscriptions SET status='cancelled',period_end=? WHERE order_id=?").run(iso(), order.id);
        audit(order.owner, 'order_refunded', { orderId: order.id, eventId: event.id });
      } else throw new ApiError(400, 'Hodisa turi qo‘llab-quvvatlanmaydi.');
      return { ok: true };
    });
  }

  /** Development-only stand-in for a provider callback; runs through the same signed webhook path. */
  function devConfirm(owner, orderId, outcome = 'paid') {
    if (providerName() !== 'dev_mock') throw new ApiError(404, 'Topilmadi.');
    const order = db.prepare('SELECT * FROM orders WHERE id=? AND owner=?').get(orderId, owner);
    if (!order) throw new ApiError(404, 'Buyurtma topilmadi.');
    const raw = JSON.stringify({ id: 'evt_dev_' + order.id + '_' + outcome, type: outcome === 'paid' ? 'order.paid' : 'order.failed', orderId: order.id, amountMinor: order.amount_minor, currency: order.currency, providerRef: 'dev_' + order.id });
    webhook(raw, signWebhook(raw, webhookSecret()));
    return entitlements(owner);
  }

  function cancelSubscription(owner) {
    const p = premium(owner);
    if (!p.active) throw new ApiError(409, 'Faol obuna yo‘q.');
    db.prepare("UPDATE subscriptions SET cancel_at_period_end=1 WHERE owner=? AND status='active'").run(owner);
    audit(owner, 'subscription_cancel_at_period_end', {});
    return entitlements(owner);
  }

  function entitlements(owner) {
    const pk = packages(owner);
    const matrix = Object.fromEntries(ROLES.map(role => [role, Object.fromEntries(LEVELS.map(level => [level, { owned: pk.some(p => p.role === role && p.level === level && !p.revoked_at), credits: credits(owner, role, level) }]))]));
    return {
      premium: premium(owner),
      packages: matrix,
      orders: db.prepare('SELECT * FROM orders WHERE owner=? ORDER BY created DESC LIMIT 50').all(owner).map(publicOrder),
      payments: { configured: !!providerName(), provider: providerName() || null, devMock: providerName() === 'dev_mock' },
      freeLabs: FREE_LABS, freeLessonsPerPath: FREE_LESSONS_PER_PATH,
    };
  }

  function pricing() {
    return {
      premium: CATALOG.filter(p => p.family === 'premium').map(p => ({ ...p, display: formatPrice(p) + (p.period === 'year' ? '/yil' : '/oy') })),
      packages: CATALOG.filter(p => p.family === 'role_package').map(p => ({ ...p, display: formatPrice(p) })),
      roles: ROLES, levels: LEVELS, attemptsPerLevel: ATTEMPTS_PER_LEVEL,
      payments: { configured: !!providerName(), devMock: providerName() === 'dev_mock' },
    };
  }

  return { premium, ownsPackage, credits, consumeCredit, canAccessLesson, canAccessLab, requireLesson, requireLab, checkout, webhook, devConfirm, cancelSubscription, entitlements, pricing, tx, audit, dev };
}
