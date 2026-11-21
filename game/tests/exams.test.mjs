import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningStore, curriculum, labs, theoryChecks } from '../server/learning.mjs';
import { createCommerce, CATALOG, signWebhook, FREE_LABS } from '../server/commerce.mjs';
import { createExams, buildBanks, decideResult, SECTION_MS } from '../server/exams.mjs';

const SECRET = 'test-webhook-secret';
function setup({ dev = false, reviewed = true } = {}) {
  let clock = Date.parse('2026-11-21T09:00:00Z');
  const now = () => new Date(clock);
  const env = { HUQUQBEK_BILLING_WEBHOOK_SECRET: SECRET, HUQUQBEK_PAYMENT_PROVIDER: dev ? '' : 'dev_mock', HUQUQBEK_ADMIN_TOKEN: 'admin-token', ...(dev ? { HUQUQBEK_DEV_MODE: '1' } : {}) };
  let commerce;
  const gate = { lesson: (o, r) => commerce.requireLesson(o, r), lab: (o, id) => commerce.requireLab(o, id), canLesson: (o, r) => commerce.canAccessLesson(o, r), canLab: (o, id) => commerce.canAccessLab(o, id) };
  const s = createLearningStore(':memory:', { access: gate });
  commerce = createCommerce(s.db, { now, env });
  const banks = buildBanks({ curriculum, labs, theoryChecks });
  if (reviewed) for (const bank of Object.values(banks)) {
    // Synthetic *test-only* reviewed items so the engine can be exercised end to end.
    for (let i = 0; i < 50; i++) bank.questions.push({ id: `T-${bank.role}-${bank.level}-${i}`, prompt: `${bank.role} ${bank.level} q${i}`, options: ['right', 'wrong-a', 'wrong-b'], correct: 0, reviewed: true });
    bank.cases.forEach(c => { c.reviewed = true; });
  }
  const exams = createExams(s.db, commerce, { banks, now, env });
  const pay = (owner, sku, opts = {}) => {
    const { order } = commerce.checkout(owner, { sku, ...opts });
    const raw = JSON.stringify({ id: 'evt_' + order.id, type: 'order.paid', orderId: order.id, amountMinor: order.amountMinor, currency: order.currency });
    commerce.webhook(raw, signWebhook(raw, SECRET));
    return { order, raw };
  };
  const ready = (owner, role, level) => {
    s.ensure(owner); s.name(owner, 'Aziza Karimova');
    exams.submitIdentity(owner, { consent: true });
    if (exams.identity(owner).status !== 'verified') exams.decideIdentity('admin-token', owner, { approve: true, reviewer: 'qa' });
    exams.acceptRules(owner, role, level, { accept: true });
    exams.cameraCheck(owner, role, level, { width: 640, height: 480, frames: 5, liveTrack: true });
  };
  return { s, commerce, exams, pay, ready, env, tick: ms => { clock += ms; }, now };
}
// Answer `correct` MCQs right using server internals (tests only), solve `cases` case labs fully.
function play(t, owner, id, { correct = 50, cases = 2 } = {}) {
  const raw = () => t.s.db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(id);
  const snap = JSON.parse(raw().snapshot);
  const answers = {};
  snap.questions.forEach((q, i) => { const want = i < correct ? q.correct : (q.correct + 1) % q.options.length; answers[i] = q.options.find(o => o.index === want).token; });
  t.exams.answers(owner, id, { answers });
  t.exams.submitTest(owner, id);
  snap.cases.forEach((c, n) => {
    for (const d of c.documents) t.exams.caseEvent(owner, id, c.id, { type: 'open', documentId: d.id });
    for (const d of c.decisions) { const want = n < cases ? d.correct : (d.correct + 1) % d.options.length; t.exams.caseEvent(owner, id, c.id, { type: 'decision', decisionId: d.id, optionId: d.options.find(o => o.index === want).token }); }
    t.exams.caseEvent(owner, id, c.id, { type: 'order', order: [...c.workflow].sort((a, b) => a.index - b.index).map(w => w.token) });
  });
  return t.exams.finish(owner, id);
}

test('catalog has exact USD packages for every role and two UZS Premium plans', () => {
  for (const role of ['advokat', 'prokuror', 'sudya']) {
    const price = k => CATALOG.find(p => p.sku === `pkg_${role}_${k}`).amountMinor;
    assert.deepEqual(['beginner', 'junior', 'senior', 'beginner_junior', 'all'].map(price), [3900, 5900, 9900, 7900, 14900]);
    assert.ok(CATALOG.filter(p => p.role === role).every(p => p.currency === 'USD' && p.kind === 'one_time'));
  }
  assert.equal(CATALOG.filter(p => p.family === 'role_package').length, 15);
  const m = CATALOG.find(p => p.sku === 'premium_monthly'), y = CATALOG.find(p => p.sku === 'premium_annual');
  assert.deepEqual([m.currency, m.amountMinor / 100, m.period, y.amountMinor / 100, y.period], ['UZS', 99000, 'month', 999000, 'year']);
});

test('checkout ignores client amounts; webhook is signed, amount-checked and idempotent', () => {
  const t = setup();
  const { order } = t.commerce.checkout('u', { sku: 'pkg_advokat_all', amountMinor: 1, currency: 'UZS' });
  assert.equal(order.amountMinor, 14900); assert.equal(order.currency, 'USD');
  const raw = JSON.stringify({ id: 'evt1', type: 'order.paid', orderId: order.id, amountMinor: 14900, currency: 'USD' });
  assert.throws(() => t.commerce.webhook(raw, 'bad'), /imzo/);
  const tampered = JSON.stringify({ id: 'evt0', type: 'order.paid', orderId: order.id, amountMinor: 100, currency: 'USD' });
  assert.throws(() => t.commerce.webhook(tampered, signWebhook(tampered, SECRET)), /mos emas/);
  t.commerce.webhook(raw, signWebhook(raw, SECRET));
  assert.deepEqual(t.commerce.webhook(raw, signWebhook(raw, SECRET)), { duplicate: true });
  for (const level of ['beginner', 'junior', 'senior']) assert.equal(t.commerce.credits('u', 'advokat', level).remaining, 2);
  assert.equal(t.commerce.credits('u', 'sudya', 'beginner').remaining, 0);
  assert.throws(() => t.commerce.checkout('u', { sku: 'pkg_advokat_beginner' }), /sizda bor/);
});

test('bundles grant exactly their levels; packages survive Premium expiry; Premium grants no exam credits', () => {
  const t = setup();
  t.pay('b', 'pkg_prokuror_beginner_junior');
  assert.equal(t.commerce.ownsPackage('b', 'prokuror', 'beginner'), true);
  assert.equal(t.commerce.ownsPackage('b', 'prokuror', 'junior'), true);
  assert.equal(t.commerce.ownsPackage('b', 'prokuror', 'senior'), false);
  t.pay('b', 'premium_monthly');
  assert.equal(t.commerce.premium('b').active, true);
  t.tick(32 * 86400000);
  assert.equal(t.commerce.premium('b').active, false);
  assert.equal(t.commerce.ownsPackage('b', 'prokuror', 'junior'), true);
  t.pay('p', 'premium_annual');
  assert.equal(t.commerce.credits('p', 'advokat', 'beginner').remaining, 0);
  t.ready('p', 'advokat', 'beginner');
  assert.throws(() => t.exams.start('p', 'advokat', 'beginner'), /Premium obuna imtihonni ochmaydi/);
});

test('first two lessons per path and exactly three labs are free; Premium unlocks; expiry re-locks', () => {
  const t = setup();
  t.s.ensure('f');
  for (const path of ['advokat', 'sudya', 'prokuror']) {
    const rooms = curriculum.rooms.filter(r => r.path === path && r.level === 'Beginner');
    assert.equal(t.s.room('f', rooms[0].id).access.lesson, true);
    assert.equal(t.s.room('f', rooms[1].id).access.lesson, true);
    const third = t.s.room('f', curriculum.rooms.find(r => r.path === path && r.order === 3).id);
    assert.equal(third.access.lesson, false); assert.equal(third.theory.length, 0); assert.equal(third.knowledge.length, 0);
    for (const level of ['Junior', 'Senior']) assert.equal(t.s.room('f', curriculum.rooms.find(r => r.path === path && r.level === level && r.order === 1).id).access.lesson, false);
  }
  assert.equal(curriculum.rooms.filter(r => t.commerce.canAccessLesson('f', r)).length, 6);
  assert.equal(curriculum.rooms.filter(r => t.commerce.canAccessLab('f', r.id)).length, 3);
  assert.deepEqual(FREE_LABS.length, 3);
  assert.throws(() => t.s.start('f', 'A-B02'), e => e.code === 'PREMIUM_REQUIRED' && e.details.resourceType === 'lab');
  assert.doesNotThrow(() => t.s.start('f', 'A-B01'));
  t.pay('f', 'premium_monthly');
  assert.equal(curriculum.rooms.filter(r => t.commerce.canAccessLab('f', r.id)).length, 45);
  assert.equal(t.s.room('f', 'A-J03').access.lesson, true);
  t.tick(40 * 86400000);
  assert.equal(t.s.room('f', 'A-J03').access.lesson, false);
});

test('prechecks gate start without consuming credits; start is idempotent and consumes one credit', () => {
  const t = setup();
  t.pay('e', 'pkg_sudya_senior');
  t.s.ensure('e'); t.s.name('e', 'Aziza Karimova');
  assert.throws(() => t.exams.start('e', 'sudya', 'senior'), /shaxsingiz/);
  t.exams.submitIdentity('e', { consent: true });
  assert.equal(t.exams.identity('e').status, 'pending');
  assert.throws(() => t.exams.start('e', 'sudya', 'senior'), /shaxsingiz/);
  t.exams.decideIdentity('admin-token', 'e', { approve: true, reviewer: 'qa' });
  assert.throws(() => t.exams.start('e', 'sudya', 'senior'), /qoidalarini/);
  t.exams.acceptRules('e', 'sudya', 'senior', { accept: true });
  assert.throws(() => t.exams.cameraCheck('e', 'sudya', 'senior', { width: 0, height: 0, frames: 0, liveTrack: false }), /Kamera/);
  assert.throws(() => t.exams.start('e', 'sudya', 'senior'), /Kamera/);
  assert.equal(t.commerce.credits('e', 'sudya', 'senior').remaining, 2);
  t.exams.cameraCheck('e', 'sudya', 'senior', { width: 640, height: 480, frames: 4, liveTrack: true });
  const a = t.exams.start('e', 'sudya', 'senior');
  assert.equal(a.attempt.test.questions.length, 50);
  assert.ok(!JSON.stringify(a).includes('"correct"'));
  assert.equal(Date.parse(a.attempt.testEndsAt) - Date.parse(a.attempt.testStartedAt), SECTION_MS);
  const again = t.exams.start('e', 'sudya', 'senior');
  assert.equal(again.resumed, true); assert.equal(again.attempt.id, a.attempt.id);
  assert.equal(t.commerce.credits('e', 'sudya', 'senior').remaining, 1);
  assert.throws(() => t.exams.start('e', 'advokat', 'senior'), /paketini/);
});

test('scoring: 50+50=100, 69 fails, 70 passes; exactly two 25-point cases', () => {
  assert.equal(decideResult(44, 25).status, 'FAILED');
  assert.equal(decideResult(45, 25).status, 'PASSED');
  assert.equal(decideResult(50, 50).finalScore, 100);
  assert.equal(decideResult(50, 50, { reviewHold: true }).status, 'REVIEW_REQUIRED');
  const t = setup();
  t.pay('s', 'pkg_advokat_beginner'); t.ready('s', 'advokat', 'beginner');
  let r = play(t, 's', t.exams.start('s', 'advokat', 'beginner').attempt.id, { correct: 44, cases: 1 });
  assert.deepEqual([r.result.testScore, r.result.caseScore, r.result.finalScore, r.status], [44, 25, 69, 'FAILED']);
  assert.equal(r.result.cases.length, 2);
  t.ready('s', 'advokat', 'beginner');
  r = play(t, 's', t.exams.start('s', 'advokat', 'beginner').attempt.id, { correct: 45, cases: 1 });
  assert.deepEqual([r.result.finalScore, r.status], [70, 'PASSED']);
  assert.equal(t.commerce.credits('s', 'advokat', 'beginner').remaining, 0);
  assert.equal(t.exams.eligibility('s').exams['advokat:beginner'].state, 'passed_ready');
});

test('server deadlines: test auto-closes at 60 min, cases get their own 60 min, then auto-finalize', () => {
  const t = setup();
  t.pay('d', 'pkg_prokuror_junior'); t.ready('d', 'prokuror', 'junior');
  const { attempt } = t.exams.start('d', 'prokuror', 'junior');
  t.tick(SECTION_MS - 1000);
  assert.equal(t.exams.getAttempt('d', attempt.id).status, 'TEST_IN_PROGRESS');
  t.tick(10000);
  const mid = t.exams.getAttempt('d', attempt.id);
  assert.equal(mid.status, 'CASES_IN_PROGRESS');
  assert.equal(mid.casesStartedAt, attempt.testEndsAt);
  assert.throws(() => t.exams.answers('d', attempt.id, { answers: {} }), /yopilgan/);
  t.tick(SECTION_MS);
  const done = t.exams.getAttempt('d', attempt.id);
  assert.equal(done.status, 'FAILED'); assert.equal(done.result.timedOut, true); assert.equal(done.result.finalScore, 0);
  assert.equal(t.commerce.credits('d', 'prokuror', 'junior').remaining, 1);
});

test('camera loss locks input and flags review; review can clear or disqualify; certificate gated', () => {
  const t = setup();
  t.pay('c', 'pkg_sudya_beginner'); t.ready('c', 'sudya', 'beginner');
  const { attempt } = t.exams.start('c', 'sudya', 'beginner');
  t.exams.proctorEvent('c', attempt.id, { type: 'camera_lost' });
  t.tick(25000);
  assert.throws(() => t.exams.answers('c', attempt.id, { answers: {} }), e => e.code === 'CAMERA_REQUIRED');
  t.exams.proctorEvent('c', attempt.id, { type: 'camera_restored' });
  let r = play(t, 'c', attempt.id, { correct: 50, cases: 2 });
  assert.equal(r.status, 'REVIEW_REQUIRED');
  assert.equal(r.result.finalScore, 100);
  assert.throws(() => t.exams.issueCertificate('c', { role: 'sudya', level: 'beginner', firstName: 'Aziza', lastName: 'Karimova' }), /70\/100/);
  assert.throws(() => t.exams.decide('wrong', attempt.id, { decision: 'CLEAR', reason: 'ok', reviewer: 'x' }), /Ruxsat/);
  assert.equal(t.exams.decide('admin-token', attempt.id, { decision: 'CLEAR', reason: 'Kamera uzilishi texnik', reviewer: 'qa' }).status, 'PASSED');
  const cert = t.exams.issueCertificate('c', { role: 'sudya', level: 'beginner', firstName: ' Aziza ', lastName: 'Karimova' });
  assert.match(cert.id, /^HQB-SUD-B-[0-9A-F]{10}$/); assert.equal(cert.firstName, 'Aziza');
  assert.equal(t.exams.issueCertificate('c', { role: 'sudya', level: 'beginner', firstName: 'X', lastName: 'Y' }).id, cert.id);
  assert.throws(() => t.exams.issueCertificate('c', { role: 'sudya', level: 'junior', firstName: 'A', lastName: 'B' }), /paketi/);
  const v = t.exams.verifyCertificate(cert.id);
  assert.equal(v.valid, true); assert.equal(v.label, 'HuquqBek educational achievement'); assert.ok(!('attemptId' in v)); assert.equal(v.name, 'Aziza K.');
  assert.equal(t.exams.verifyCertificate('HQB-NOPE-0000').valid, false);
  t.exams.decide('admin-token', attempt.id, { decision: 'DISQUALIFY', reason: 'Tasdiqlangan begona yordam', reviewer: 'qa' });
  assert.equal(t.exams.verifyCertificate(cert.id).status, 'revoked');
});

test('signals alone never disqualify; two failures exhaust; a new verified purchase grants two more', () => {
  const t = setup();
  t.pay('x', 'pkg_advokat_junior');
  for (let i = 0; i < 2; i++) {
    t.ready('x', 'advokat', 'junior');
    const { attempt } = t.exams.start('x', 'advokat', 'junior');
    t.exams.proctorEvent('x', attempt.id, { type: 'visibility_hidden' });
    const r = play(t, 'x', attempt.id, { correct: 10, cases: 0 });
    assert.equal(r.status, 'FAILED');
  }
  assert.equal(t.exams.eligibility('x').exams['advokat:junior'].state, 'exhausted');
  t.ready('x', 'advokat', 'junior');
  assert.throws(() => t.exams.start('x', 'advokat', 'junior'), /qolmagan/);
  assert.throws(() => t.commerce.checkout('x', { sku: 'pkg_advokat_junior' }), /sizda bor/);
  t.pay('x', 'pkg_advokat_junior', { retake: true });
  assert.equal(t.commerce.credits('x', 'advokat', 'junior').remaining, 2);
});

test('materials not ready → exam blocked without consuming a credit; dev practice bank never certifies as production', () => {
  const t = setup({ reviewed: false });
  t.pay('m', 'pkg_advokat_senior'); t.ready('m', 'advokat', 'senior');
  assert.throws(() => t.exams.start('m', 'advokat', 'senior'), e => e.code === 'MATERIALS_NOT_READY');
  assert.equal(t.commerce.credits('m', 'advokat', 'senior').remaining, 2);
  const d = setup({ dev: true, reviewed: false });
  d.pay('m', 'pkg_advokat_senior'); d.ready('m', 'advokat', 'senior');
  const { attempt } = d.exams.start('m', 'advokat', 'senior');
  assert.equal(attempt.practice, true); assert.equal(attempt.test.questions.length, 50);
  const r = play(d, 'm', attempt.id);
  assert.equal(r.status, 'PASSED');
  const cert = d.exams.issueCertificate('m', { role: 'advokat', level: 'senior', firstName: 'Aziza', lastName: 'Karimova' });
  assert.match(cert.id, /^DEV-HQB-ADV-S-/);
  assert.equal(d.exams.verifyCertificate(cert.id).valid, false);
});
