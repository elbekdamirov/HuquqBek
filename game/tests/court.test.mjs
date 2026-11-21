import test from 'node:test'; import assert from 'node:assert/strict';
import { courtAction, initialCourt, migrateCourt, availableActions } from '../src/court.ts';

test('only the judge authorises court actions; reading, submission and examination gates hold', () => {
  let s = initialCourt();
  assert.equal(courtAction(s, 'begin_hearing', null, 'CH_QONUNAI', [], ['E1']).ok, false);
  assert.equal(courtAction(s, 'begin_hearing', null, 'CH_PLAINTIFF', [], ['E1']).state.phase, 'preparation');
  let r = courtAction(s, 'begin_hearing', null, 'CH_JUDGE', [], ['E1']); assert.ok(r.ok); s = r.state; assert.equal(s.phase, 'opening');
  assert.equal(courtAction(s, 'examine_evidence', 'E1', 'CH_JUDGE', ['E1'], ['E1']).ok, false);
  assert.equal(courtAction(s, 'submit_evidence', 'E1', 'CH_JUDGE', [], ['E1']).ok, false, 'unread evidence cannot be submitted');
  r = courtAction(s, 'submit_evidence', 'E1', 'CH_JUDGE', ['E1'], ['E1']); assert.ok(r.ok); s = r.state; assert.deepEqual(s.submitted, ['E1']); assert.equal(s.phase, 'evidence');
  assert.equal(courtAction(s, 'closing_argument', null, 'CH_JUDGE', ['E1'], ['E1']).ok, false, 'arguments need examined evidence');
  s = courtAction(s, 'examine_evidence', 'E1', 'CH_JUDGE', ['E1'], ['E1']).state; assert.deepEqual(s.examined, ['E1']);
  s = courtAction(s, 'closing_argument', null, 'CH_JUDGE', ['E1'], ['E1']).state; assert.equal(s.phase, 'arguments');
  s = courtAction(s, 'final_statement', null, 'CH_JUDGE', ['E1'], ['E1']).state; assert.equal(s.phase, 'final');
  s = courtAction(s, 'request_decision', null, 'CH_JUDGE', ['E1'], ['E1']).state; assert.equal(s.phase, 'decision');
});

test('break/resume, witness call, objections and player-judge via clerk', () => {
  let s = courtAction(initialCourt(), 'begin_hearing', null, 'CH_JUDGE', [], ['E1', 'E2']).state;
  s = courtAction(s, 'call_witness', null, 'CH_JUDGE', [], ['E1']).state; assert.equal(s.phase, 'testimony'); assert.ok(s.witnessCalled);
  s = courtAction(s, 'request_break', null, 'CH_JUDGE', [], ['E1']).state; assert.equal(s.phase, 'paused');
  s = courtAction(s, 'begin_hearing', null, 'CH_JUDGE', [], ['E1']).state; assert.equal(s.phase, 'testimony');
  s = courtAction(s, 'submit_evidence', 'E2', 'CH_JUDGE', ['E2'], ['E1', 'E2']).state;
  const o = courtAction(s, 'objection', 'E2', 'CH_JUDGE', ['E2'], ['E1', 'E2'], undefined, 'sustained'); assert.ok(o.ok); assert.equal(o.state.challenged.E2, 'sustained');
  assert.equal(courtAction(o.state, 'examine_evidence', 'E2', 'CH_JUDGE', ['E2'], ['E1', 'E2']).ok, false, 'sustained objection blocks examination');
  const viaClerk = courtAction(initialCourt(), 'begin_hearing', null, 'CH_CLERK', [], ['E1'], 'sudya'); assert.ok(viaClerk.ok);
});

test('0.3 saves migrate and the action bar follows the phase', () => {
  assert.equal(migrateCourt({ phase: 'hearing', submitted: [], examined: [], witnessCalled: false, log: [] }).phase, 'opening');
  assert.equal(migrateCourt({ phase: 'closing' }).phase, 'arguments');
  assert.deepEqual(availableActions(initialCourt(), []).map(a => a.intent), ['begin_hearing']);
  const open = courtAction(initialCourt(), 'begin_hearing', null, 'CH_JUDGE', [], ['E1']).state;
  assert.ok(availableActions(open, ['E1']).some(a => a.intent === 'submit_evidence'));
});
