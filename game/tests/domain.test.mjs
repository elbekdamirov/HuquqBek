import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, choose, closePanel, confirmInspection, cancelInspection, dispatch, evaluate, reduce, replay, restoreSession, saveSession, nodes } from '../src/domain.ts';
import { evaluate as referenceEvaluate } from '../scripts/scenario-reference.mjs';
import { canStand, slide } from '../src/navigation.ts';
const go = (s, id) => choose(s, s.case.nodeId, id);
const event = (s, type, evidenceId) => dispatch(s, { type, evidenceId });
function prepare(inspectAll = true) {
  let s = newSession(); s = go(s, 'quiet'); s = go(s, 'goal'); s = go(s, 'confirm');
  if (inspectAll) for (const id of s.case.owned) s = event(s, 'INSPECT', id);
  return s;
}
function hearing(s) { s = go(s, 'ready'); s = go(s, 'start'); s = go(s, 'listen'); s = go(s, 'claim'); s = go(s, 'continue'); return go(s, 'questions'); }
function submitAndExamine(s, ids) {
  s = go(s, 'submit');
  for (const id of ids) s = event(s, 'SUBMIT', id);
  s = closePanel(s); s = go(s, 'examine');
  for (const id of ids) s = event(s, 'EXAMINE', id);
  s = closePanel(s); return go(s, 'return');
}
function ruling(s) { s = go(s, 'close'); s = go(s, 'closing'); s = go(s, 'build'); s = closePanel(s); s = go(s, 'finish'); return go(s, 'ruling'); }

test('full mission: explicit acquisition, reading, submission, examination, reasoned refund and completion', () => {
  let s = prepare(); s = go(s, 'respondent'); s = go(s, 'records'); s = go(s, 'inspect');
  assert.ok(s.case.owned.includes('E04')); assert.ok(!s.case.inspected.includes('E04'));
  assert.equal(s.modal.kind, 'inspection'); s = confirmInspection(s);
  s = hearing(s); s = submitAndExamine(s, ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07']);
  s = ruling(s); assert.equal(s.case.nodeId, 'O_REFUND');
  assert.equal(evaluate(s.case).amountSom, 2400000);
  assert.ok(evaluate(s.case).findings.some(f => f.issue === 'wrongDevice' && !f.established));
  s = go(s, 'reasons'); s = go(s, 'debrief'); assert.equal(s.modal.kind, 'outcomeReasons');
  s = closePanel(s); s = go(s, 'review'); s = closePanel(s); s = go(s, 'end');
  assert.equal(s.case.phase, 'complete'); assert.ok(s.completed);
});
test('evidence interval recovers a missing document without automatically proving the case', () => {
  let s = hearing(prepare()); s = submitAndExamine(s, ['E01', 'E02', 'E03', 'E05', 'E06']);
  s = go(s, 'close'); s = go(s, 'interval'); s = go(s, 'retrieve');
  assert.equal(s.case.phase, 'evidence_interval'); s = event(s, 'ACQUIRE', 'E04'); s = event(s, 'INSPECT', 'E04');
  assert.ok(!s.case.submitted.includes('E04')); assert.ok(!s.case.examined.includes('E04'));
  s = closePanel(s); s = go(s, 'resume'); assert.equal(s.case.nodeId, 'N110');
  assert.equal(evaluate(s.case).outcome, 'CONTINUE');
  s = submitAndExamine(s, ['E04']); s = ruling(s); assert.equal(evaluate(s.case).outcome, 'REFUND');
});
test('inadequate record only reaches dismissal after clarification and explicit closure', () => {
  let s = hearing(prepare(false)); assert.equal(evaluate(s.case).outcome, 'CONTINUE');
  assert.throws(() => dispatch(s, { type: 'CLOSE_RECORD' }), /Clarification/);
  s = ruling(s); assert.equal(s.case.nodeId, 'O_INSUFFICIENT');
  assert.ok(evaluate(s.case).findings.filter(f => ['defect', 'purchase', 'priorDemand'].includes(f.issue)).every(f => !f.established));
});
test('cancelled inspection never executes the queued submission or examination', () => {
  let s = hearing(prepare()); s = go(s, 'question'); s = go(s, 'serial'); s = go(s, 'record');
  assert.equal(s.modal.kind, 'inspection'); assert.ok(!s.case.submitted.includes('E07'));
  s = cancelInspection(s); assert.equal(s.case.nodeId, 'N110'); assert.ok(!s.case.examined.includes('E07'));
  s = go(s, 'question'); s = go(s, 'serial'); s = go(s, 'record'); s = confirmInspection(s);
  assert.ok(s.case.examined.includes('E07'));
});
test('oral alternatives support the same result; hints and witness absence do not penalize it', () => {
  let s = prepare(); s = go(s, 'respondent'); s = go(s, 'records'); s = go(s, 'inspect'); s = confirmInspection(s); s = hearing(s);
  s = submitAndExamine(s, ['E04', 'E05']);
  for (const question of ['purchase', 'replacement']) { s = go(s, 'question'); s = go(s, question); s = go(s, 'record'); }
  s = dispatch(s, { type: 'SET_FLAG', name: 'guidedHints' });
  s = ruling(s); assert.equal(evaluate(s.case).outcome, 'REFUND');
});
test('duplicate events are harmless; closed records cannot be changed', () => {
  let s = hearing(prepare()); const eventValue = { id: 'handover-once', type: 'SUBMIT', evidenceId: 'E01' };
  const once = reduce(s.case, eventValue); assert.equal(reduce(once, eventValue), once);
  assert.equal(once.submitted.filter(id => id === 'E01').length, 1);
  s = ruling(s); assert.throws(() => event(s, 'SUBMIT', 'E01'), /open hearing/);
});
test('save/restore includes a blocked panel, replay isolates legal state, invalid saves are rejected', () => {
  let s = hearing(prepare()); const before = saveSession(s); s = go(s, 'submit');
  const restored = restoreSession(saveSession(s)); assert.equal(restored.modal.kind, 'submitEvidence');
  s = event(restored, 'SUBMIT', 'E01'); s = closePanel(s);
  const fork = replay(s); assert.equal(fork.branch, 1); assert.ok(!fork.case.submitted.includes('E01'));
  assert.ok(s.case.submitted.includes('E01')); assert.equal(restoreSession(before).case.nodeId, 'N110');
  assert.throws(() => restoreSession('{"saveVersion":2}'));
  const corrupt = JSON.parse(before); corrupt.session.case.examined.push('E99'); assert.throws(() => restoreSession(JSON.stringify(corrupt)));
});
test('every authored choice can open its target or panel with satisfied preconditions', () => {
  for (const node of nodes.values()) for (const choice of node.choices) {
    let s = newSession(); s.case.nodeId = node.id; s.case.phase = node.stage;
    s.case.owned = Array.from({ length: 10 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`);
    s.case.inspected = [...s.case.owned]; s.case.submitted = [...s.case.owned]; s.case.examined = [...s.case.owned];
    s.case.flags.clarificationOffered = true; s.checkpoint = structuredClone(s.case); s.checkpoint.nodeId = 'N100'; s.checkpoint.phase = 'hearing';
    assert.doesNotThrow(() => choose(s, node.id, choice.id), `${node.id}:${choice.id}`);
  }
});
test('evaluator agrees with the supplied domain reference across every examined-document subset', () => {
  for (let mask = 0; mask < 1024; mask++) {
    const s = newSession().case; s.flags = { recordClosed: true, clarificationOffered: true };
    s.examined = Array.from({ length: 10 }, (_, i) => i).filter(i => mask & (1 << i)).map(i => `E${String(i + 1).padStart(2, '0')}`);
    if (mask % 3 === 0) s.oral = ['T_PURCHASE']; if (mask % 5 === 0) s.oral.push('T_UNFULFILLED');
    const expected = referenceEvaluate(s), actual = evaluate(s);
    assert.equal(actual.outcome, expected.outcome); assert.deepEqual(actual.findings, expected.findings); assert.equal(actual.amountSom, expected.amountSom);
  }
});
test('navigation blocks desks and walls and slides along furniture without tunnelling', () => {
  const boxes = [{ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }];
  assert.equal(canStand(.5, .5, boxes), false); assert.equal(canStand(-7.5, 2, boxes), false);
  const [x, z] = slide(-1, .4, 3, .5, boxes); assert.ok(x < -.2); assert.ok(z > .4);
});
