// QonunVerse M01, educational authored case only. Not a legal decision engine.
// Run: node handoff/verify-package.mjs from the package directory.

export const initialState = () => ({
  schemaVersion: 1, contentVersion: '1.0.0', phase: 'preparation', nodeId: 'N001',
  owned: ['E01', 'E02', 'E03', 'E05', 'E06', 'E07', 'E10'],
  inspected: ['E10'], submitted: ['E10'], examined: ['E10'], oral: [],
  flags: {}, learning: [], handledEventIds: [],
});

const validIds = new Set(Array.from({ length: 10 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`));
const oralIds = new Set(['T_PURCHASE', 'T_UNFULFILLED', 'E09']);
const add = (a, x) => a.includes(x) ? a : [...a, x];
const requireId = id => { if (!validIds.has(id)) throw Error(`Unknown evidence ${id}`); };

export function reduce(state, event) {
  if (!event.id) throw Error('An idempotency ID is required');
  if (state.handledEventIds.includes(event.id)) return state;
  const s = structuredClone(state);
  const id = event.evidenceId;
  if (['ACQUIRE', 'INSPECT', 'SUBMIT', 'EXAMINE'].includes(event.type)) requireId(id);
  switch (event.type) {
    case 'ACQUIRE': s.owned = add(s.owned, id); break;
    case 'INSPECT':
      if (!s.owned.includes(id)) throw Error('Acquire before inspection');
      s.inspected = add(s.inspected, id); break;
    case 'SUBMIT':
      if (s.phase !== 'hearing') throw Error('Submission requires a hearing turn');
      if (!s.inspected.includes(id)) throw Error('Inspect before submission');
      s.submitted = add(s.submitted, id); break;
    case 'EXAMINE':
      if (s.phase !== 'hearing') throw Error('Examination requires hearing');
      if (!s.submitted.includes(id)) throw Error('Submit before examination');
      s.examined = add(s.examined, id); break;
    case 'RECORD_ORAL':
      if (s.phase !== 'hearing' || !oralIds.has(event.statementId)) throw Error('Invalid oral statement');
      s.oral = add(s.oral, event.statementId); break;
    case 'SET_PHASE':
      if (!['preparation', 'hearing', 'evidence_interval', 'outcome', 'debrief', 'complete'].includes(event.value)) throw Error('Invalid phase');
      s.phase = event.value; break;
    case 'SET_FLAG':
      if (event.name === 'recordClosed') throw Error('Use CLOSE_RECORD for record closure');
      s.flags[event.name] = event.value ?? true; break;
    case 'LEARNING': s.learning = add(s.learning, event.name); break;
    case 'CLOSE_RECORD':
      if (s.phase !== 'hearing' || !s.flags.clarificationOffered) throw Error('Clarification required before closing');
      s.flags.recordClosed = true; break;
    default: throw Error(`Unknown event ${event.type}`);
  }
  s.handledEventIds.push(event.id);
  return s;
}

export function evaluate(state) {
  if (!state.flags.recordClosed || !state.flags.clarificationOffered) {
    return { outcome: 'CONTINUE', nextNode: 'N160', reasons: [], nonterminal: true };
  }
  const e = new Set(state.examined), o = new Set(state.oral);
  const purchase = (e.has('E01') && e.has('E02')) || o.has('T_PURCHASE');
  // These combinations are sufficient only in this deliberately bounded fictional case.
  // No document has predetermined force in actual civil proceedings.
  const defect = e.has('E04') && e.has('E05');
  const priorDemand = (e.has('E03') && e.has('E06')) || o.has('T_UNFULFILLED');
  const remedy = e.has('E10');
  const findings = [
    { issue: 'purchase', established: purchase, evidence: purchase ? (o.has('T_PURCHASE') ? ['T_PURCHASE'] : ['E01', 'E02']) : [],
      textUz: purchase ? 'Xarid, telefon raqami va kafolat muddati ishdagi tekshirilgan ma’lumotlar bilan bog‘landi.' : 'Xarid va kafolat haqidagi hal qiluvchi ma’lumotlar ushbu mashqning tekshirilgan yozuvida yetishmaydi.' },
    { issue: 'defect', established: defect, evidence: defect ? ['E04', 'E05'] : [],
      textUz: defect ? 'Qabul hujjati va usullari ko‘rsatilgan servis hisoboti aynan QV26-0418 telefonidagi nuqson haqidagi xulosani birga asoslaydi.' : 'Aynan shu telefonning nuqsonini texnik ma’lumot va qabul zanjiri bilan bog‘lash ushbu yozuvda yetarli emas.' },
    { issue: 'priorDemand', established: priorDemand, evidence: priorDemand ? (o.has('T_UNFULFILLED') ? ['T_UNFULFILLED'] : ['E03', 'E06']) : [],
      textUz: priorDemand ? 'Avvalgi almashtirish talabi va uning bajarilmagani tekshirildi.' : 'Avvalgi almashtirish talabi va uning natijasi ushbu yozuvda to‘liq tasdiqlanmagan.' },
    { issue: 'remedy', established: remedy, evidence: remedy ? ['E10'] : [],
      textUz: remedy ? 'Bekor qilish talabi va o‘zgarmagan 2 400 000 so‘mlik narx ish materialida belgilangan.' : 'So‘ralgan huquqiy natija va narx ushbu yozuvda aniqlashtirilishi kerak.' },
  ];
  if (e.has('E07')) findings.push({ issue: 'wrongDevice', established: false, evidence: ['E07'],
    textUz: 'Namlik haqidagi varaq QV26-0481 raqamli boshqa telefonga tegishli. U Dilnozaning telefonida namlik bo‘lganini isbotlamaydi; farqning o‘zi zavod nuqsonini ham isbotlamaydi.' });
  if (o.has('E09')) findings.push({ issue: 'witnessLimit', established: true, evidence: ['E09'],
    textUz: 'Aziz o‘chib qolishni ko‘rgan, lekin texnik sababni bilmaydi. Ko‘rsatma shu chegarada boshqa dalillar bilan birga baholandi.' });
  const success = purchase && defect && priorDemand && remedy;
  return { outcome: success ? 'REFUND' : 'INSUFFICIENT_RECORD', nextNode: success ? 'O_REFUND' : 'O_INSUFFICIENT',
    amountSom: success ? 2400000 : null, returnDevice: success, findings, nonterminal: false,
    legalClaimIds: success ? ['L13', 'L16', 'L17', 'P80'] : ['P72', 'P80'],
    limitationUz: 'Bu mualliflar tuzgan o‘quv holati. Haqiqiy sud barcha tegishli dalillarni mustaqil baholaydi.' };
}
