import missionData from './content/mission_01.json' with { type: 'json' };

export type Phase = 'preparation' | 'hearing' | 'evidence_interval' | 'outcome' | 'debrief' | 'complete';
export interface Choice { id: string; textUz: string; next: string; effects: string[]; requires: string[] }
export interface DialogueNode { id: string; speaker: string; textUz: string; stage: string; choices: Choice[]; sourceClaimIds: string[]; camera: string; onEnter: string[]; voiceAsset: string | null }
export const mission = missionData;
export const nodes = new Map<string, DialogueNode>(mission.nodes.map(n => [n.id, n]));
export interface CaseState {
  schemaVersion: 1; contentVersion: string; phase: Phase; nodeId: string;
  owned: string[]; inspected: string[]; submitted: string[]; examined: string[];
  oral: string[]; flags: Record<string, boolean>; learning: string[]; handledEventIds: string[];
}
export interface Finding { issue: string; established: boolean; evidence: string[]; textUz: string }
export interface Outcome { outcome: 'CONTINUE' | 'REFUND' | 'INSUFFICIENT_RECORD'; nextNode: string; nonterminal: boolean; findings: Finding[]; amountSom: number | null; returnDevice: boolean; legalClaimIds: string[]; limitationUz: string }
export interface Event { id: string; type: string; evidenceId?: string; statementId?: string; value?: string | boolean; name?: string }
export interface Modal { kind: string; evidenceId?: string; claims?: string[] }
export interface Session {
  case: CaseState; revision: number; branch: number; completed: boolean;
  history: string[]; checkpoint: CaseState | null;
  pending: { target: string; effects: string[] } | null; modal: Modal | null;
}
const phases = ['preparation', 'hearing', 'evidence_interval', 'outcome', 'debrief', 'complete'];
const evidenceIds = new Set(Array.from({ length: 10 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`));
const oralIds = new Set(['T_PURCHASE', 'T_UNFULFILLED', 'E09']);
const add = (a: string[], value: string) => a.includes(value) ? a : [...a, value];
export const initialState = (): CaseState => ({
  schemaVersion: 1, contentVersion: mission.version, phase: 'preparation', nodeId: mission.startNode,
  owned: [...mission.initialOwnedEvidence], inspected: ['E10'], submitted: ['E10'], examined: ['E10'],
  oral: [], flags: {}, learning: [], handledEventIds: [],
});
export function reduce(state: CaseState, event: Event): CaseState {
  if (!event.id) throw Error('An idempotency ID is required');
  if (state.handledEventIds.includes(event.id)) return state;
  const s = structuredClone(state), id = event.evidenceId!;
  if (['ACQUIRE', 'INSPECT', 'SUBMIT', 'EXAMINE'].includes(event.type) && !evidenceIds.has(id)) throw Error('Unknown evidence');
  switch (event.type) {
    case 'ACQUIRE': s.owned = add(s.owned, id); break;
    case 'INSPECT':
      if (!s.owned.includes(id)) throw Error('Acquire before inspection');
      s.inspected = add(s.inspected, id); break;
    case 'SUBMIT':
      if (s.phase !== 'hearing' || s.flags.recordClosed) throw Error('Submission requires an open hearing');
      if (!s.inspected.includes(id)) throw Error('Inspect before submission');
      s.submitted = add(s.submitted, id); break;
    case 'EXAMINE':
      if (s.phase !== 'hearing' || s.flags.recordClosed) throw Error('Examination requires an open hearing');
      if (!s.submitted.includes(id)) throw Error('Submit before examination');
      s.examined = add(s.examined, id); break;
    case 'RECORD_ORAL':
      if (s.phase !== 'hearing' || s.flags.recordClosed || !oralIds.has(event.statementId!)) throw Error('Invalid oral statement');
      s.oral = add(s.oral, event.statementId!); break;
    case 'SET_PHASE':
      if (!phases.includes(String(event.value))) throw Error('Invalid phase');
      s.phase = event.value as Phase; break;
    case 'SET_FLAG':
      if (event.name === 'recordClosed') throw Error('Use CLOSE_RECORD');
      if (!event.name) throw Error('Flag name is required');
      s.flags[event.name] = typeof event.value === 'boolean' ? event.value : true; break;
    case 'LEARNING': s.learning = add(s.learning, event.name!); break;
    case 'CLOSE_RECORD':
      if (s.phase !== 'hearing' || !s.flags.clarificationOffered) throw Error('Clarification required before closing');
      s.flags.recordClosed = true; break;
    default: throw Error(`Unknown event ${event.type}`);
  }
  s.handledEventIds.push(event.id);
  return s;
}
export function evaluate(s: CaseState): Outcome {
  const base = { findings: [] as Finding[], amountSom: null, returnDevice: false, legalClaimIds: [] as string[], limitationUz: 'Bu mualliflar tuzgan o‘quv holati. Haqiqiy sud barcha tegishli dalillarni mustaqil baholaydi.' };
  if (!s.flags.recordClosed || !s.flags.clarificationOffered) return { ...base, outcome: 'CONTINUE', nextNode: 'N160', nonterminal: true };
  const e = new Set(s.examined), o = new Set(s.oral);
  const purchase = (e.has('E01') && e.has('E02')) || o.has('T_PURCHASE');
  const defect = e.has('E04') && e.has('E05');
  const priorDemand = (e.has('E03') && e.has('E06')) || o.has('T_UNFULFILLED');
  const remedy = e.has('E10');
  const findings: Finding[] = [
    { issue: 'purchase', established: purchase, evidence: purchase ? (o.has('T_PURCHASE') ? ['T_PURCHASE'] : ['E01', 'E02']) : [], textUz: purchase ? 'Xarid, telefon raqami va kafolat muddati ishdagi tekshirilgan ma’lumotlar bilan bog‘landi.' : 'Xarid va kafolat haqidagi hal qiluvchi ma’lumotlar ushbu mashqning tekshirilgan yozuvida yetishmaydi.' },
    { issue: 'defect', established: defect, evidence: defect ? ['E04', 'E05'] : [], textUz: defect ? 'Qabul hujjati va usullari ko‘rsatilgan servis hisoboti aynan QV26-0418 telefonidagi nuqson haqidagi xulosani birga asoslaydi.' : 'Aynan shu telefonning nuqsonini texnik ma’lumot va qabul zanjiri bilan bog‘lash ushbu yozuvda yetarli emas.' },
    { issue: 'priorDemand', established: priorDemand, evidence: priorDemand ? (o.has('T_UNFULFILLED') ? ['T_UNFULFILLED'] : ['E03', 'E06']) : [], textUz: priorDemand ? 'Avvalgi almashtirish talabi va uning bajarilmagani tekshirildi.' : 'Avvalgi almashtirish talabi va uning natijasi ushbu yozuvda to‘liq tasdiqlanmagan.' },
    { issue: 'remedy', established: remedy, evidence: remedy ? ['E10'] : [], textUz: remedy ? 'Bekor qilish talabi va o‘zgarmagan 2 400 000 so‘mlik narx ish materialida belgilangan.' : 'So‘ralgan huquqiy natija va narx ushbu yozuvda aniqlashtirilishi kerak.' },
  ];
  if (e.has('E07')) findings.push({ issue: 'wrongDevice', established: false, evidence: ['E07'], textUz: 'Namlik haqidagi varaq QV26-0481 raqamli boshqa telefonga tegishli. U Dilnozaning telefonida namlik bo‘lganini isbotlamaydi; farqning o‘zi zavod nuqsonini ham isbotlamaydi.' });
  if (o.has('E09')) findings.push({ issue: 'witnessLimit', established: true, evidence: ['E09'], textUz: 'Aziz o‘chib qolishni ko‘rgan, lekin texnik sababni bilmaydi. Ko‘rsatma shu chegarada boshqa dalillar bilan birga baholandi.' });
  const success = purchase && defect && priorDemand && remedy;
  return { ...base, outcome: success ? 'REFUND' : 'INSUFFICIENT_RECORD', nextNode: success ? 'O_REFUND' : 'O_INSUFFICIENT', nonterminal: false, amountSom: success ? 2400000 : null, returnDevice: success, findings, legalClaimIds: success ? ['L13', 'L16', 'L17', 'P80'] : ['P72', 'P80'] };
}
export const newSession = (): Session => ({ case: initialState(), revision: 0, branch: 0, completed: false, history: [mission.startNode], checkpoint: null, pending: null, modal: null });
export function dispatch(session: Session, event: Omit<Event, 'id'>): Session {
  const revision = session.revision + 1;
  return { ...session, revision, case: reduce(session.case, { ...event, id: `${session.branch}:${revision}` }) };
}
function visit(session: Session, target: string): Session {
  if (target === 'ROUTE_OUTCOME') return visit(session, evaluate(session.case).nextNode);
  if (target === 'REPLAY_CHECKPOINT') return replay(session);
  if (target === 'END') return { ...session, completed: true, case: { ...session.case, phase: 'complete' } };
  const node = nodes.get(target);
  if (!node) throw Error(`Unknown node ${target}`);
  const next = { ...session, case: { ...session.case, nodeId: target, phase: node.stage as Phase }, history: [...session.history, target].slice(-300), modal: null, pending: null };
  if (target === 'N100' && !next.checkpoint) next.checkpoint = structuredClone(next.case);
  return advance(next, target, node.onEnter, true);
}
function advance(session: Session, target: string, effects: string[], entered = false): Session {
  let s = session;
  for (let i = 0; i < effects.length; i++) {
    const [kind, value] = effects[i].split(':');
    const pending = { target, effects: effects.slice(i + 1) };
    if (kind === 'panel') return { ...s, modal: { kind: value }, pending };
    if (kind === 'inspect') return { ...s, modal: { kind: 'inspection', evidenceId: value }, pending };
    if (kind === 'source') {
      const claims = [value];
      while (effects[i + 1]?.startsWith('source:')) claims.push(effects[++i].split(':')[1]);
      return { ...s, modal: { kind: 'sourceCards', claims }, pending: { target, effects: effects.slice(i + 1) } };
    }
    const types: Record<string, string> = { acquire: 'ACQUIRE', submit: 'SUBMIT', examine: 'EXAMINE' };
    if (types[kind]) s = dispatch(s, { type: types[kind], evidenceId: value });
    else if (kind === 'oral') s = dispatch(s, { type: 'RECORD_ORAL', statementId: value });
    else if (kind === 'flag') s = dispatch(s, { type: 'SET_FLAG', name: value });
    else if (kind === 'learning') s = dispatch(s, { type: 'LEARNING', name: value });
    else if (kind === 'hints') s = dispatch(s, { type: 'SET_FLAG', name: 'guidedHints', value: value === 'on' });
    else if (kind === 'phase') s = dispatch(s, { type: 'SET_PHASE', value });
    else if (kind === 'record' && value === 'close') s = dispatch(s, { type: 'CLOSE_RECORD' });
    else if (kind !== 'route') throw Error(`Unsupported effect ${effects[i]}`);
  }
  return entered ? s : visit(s, target);
}
export function unmet(s: CaseState, choice: Choice): string[] {
  return choice.requires.filter(rule => {
    const [kind, value] = rule.split(':');
    if (kind === 'flag') return !s.flags[value];
    if (['owned', 'inspected', 'submitted', 'examined'].includes(kind)) return !s[kind as 'owned'].includes(value);
    return true;
  });
}
export function choose(session: Session, nodeId: string, choiceId: string): Session {
  if (session.modal || session.completed || session.case.nodeId !== nodeId) throw Error('Stale or blocked choice');
  const choice = nodes.get(nodeId)?.choices.find(c => c.id === choiceId);
  if (!choice || unmet(session.case, choice).length) throw Error('Choice is unavailable');
  return advance(session, choice.next, choice.effects);
}
export function closePanel(session: Session): Session {
  if (session.modal?.kind === 'inspection') throw Error('Inspection requires acknowledgment');
  const pending = session.pending;
  return pending ? advance({ ...session, modal: null, pending: null }, pending.target, pending.effects) : { ...session, modal: null };
}
export function confirmInspection(session: Session): Session {
  if (session.modal?.kind !== 'inspection') throw Error('No inspection to confirm');
  const s = dispatch(session, { type: 'INSPECT', evidenceId: session.modal.evidenceId });
  const pending = s.pending;
  return pending ? advance({ ...s, modal: null, pending: null }, pending.target, pending.effects) : { ...s, modal: null };
}
export function cancelInspection(s: Session): Session {
  return s.pending ? visit({ ...s, modal: null, pending: null }, s.pending.target) : { ...s, modal: null };
}
export function replay(session: Session): Session {
  if (!session.checkpoint) throw Error('No hearing checkpoint');
  return { ...session, case: structuredClone(session.checkpoint), branch: session.branch + 1, revision: 0, modal: null, pending: null, history: [session.checkpoint.nodeId], completed: false };
}
export function saveSession(s: Session): string { return JSON.stringify({ saveVersion: 1, session: s }); }
export function restoreSession(text: string): Session {
  const parsed = JSON.parse(text), s = parsed.session as Session;
  if (parsed.saveVersion !== 1 || !s || !Number.isSafeInteger(s.revision) || !Number.isSafeInteger(s.branch) || !Array.isArray(s.history)) throw Error('Invalid save');
  function validateCase(c: CaseState) {
    if (!c || c.schemaVersion !== 1 || c.contentVersion !== mission.version || !nodes.has(c.nodeId) || !phases.includes(c.phase)) throw Error('Incompatible save');
    for (const field of ['owned', 'inspected', 'submitted', 'examined'] as const) if (!Array.isArray(c[field]) || c[field].some(x => !evidenceIds.has(x))) throw Error('Invalid evidence');
    if (c.inspected.some(x => !c.owned.includes(x)) || c.submitted.some(x => !c.inspected.includes(x)) || c.examined.some(x => !c.submitted.includes(x))) throw Error('Inconsistent record');
    if (!Array.isArray(c.oral) || c.oral.some(x => !oralIds.has(x)) || !Array.isArray(c.handledEventIds) || !Array.isArray(c.learning) || !c.flags || typeof c.flags !== 'object') throw Error('Invalid record');
  }
  validateCase(s.case);
  if (s.checkpoint) validateCase(s.checkpoint);
  if (s.history.some(x => !nodes.has(x))) throw Error('Invalid history');
  const modalKinds = ['inspection', ...Object.keys(mission.panels)];
  if (s.modal && (!modalKinds.includes(s.modal.kind) || (s.modal.kind === 'inspection' && !evidenceIds.has(s.modal.evidenceId!)))) throw Error('Invalid panel');
  if (s.pending && (!nodes.has(s.pending.target) || !Array.isArray(s.pending.effects))) throw Error('Invalid continuation');
  return s;
}
