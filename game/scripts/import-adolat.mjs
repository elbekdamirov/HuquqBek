// Imports the remaining adolat.zip cases (himoya, nazorat, tergov, yol halls; uz) into src/content/scenarios.json
// in the same "adapted_training" format as the five earlier adolat imports. Owner confirmed rights on 2026-11-21.
// Usage: node scripts/import-adolat.mjs <path-to-extracted>/adolat/reference/data/uz
// Inert JSON only; nothing from the archive is executed. Idempotent by scenario id.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/import-adolat.mjs <adolat/reference/data/uz>'); process.exit(1); }
const read = f => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const REF = {
  jpk: { label: 'Jinoyat-protsessual kodeksi', url: 'https://lex.uz/docs/-111460' },
  jk: { label: 'Jinoyat kodeksi', url: 'https://lex.uz/docs/-111453' },
  konst: { label: 'Jinoyat protsessining konstitutsiyaviy kafolatlari', url: 'https://gov.uz/oz/mfa/sections/view/14475' },
};
const clean = s => String(s ?? '').replace(/\s+\n/g, '\n').trim();
const optsText = q => q ? `${q.q}\n${q.opts.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}` : '';

function build({ hall, id, title, difficulty, facts, issue, client, opponent, evidence, roles, trialReason, duration }) {
  const origin = `adolat.zip · reference/data/uz/${hall}.json · ${id}`;
  const summary = `Manba: ${origin}. O‘quv moslashtirish; haqiqiy sud qarori tasdiqlanmagan.`;
  return {
    id: `SC-${hall}-${id}`, courtType: 'criminal', independent: true, category: 'criminal', title, subtitle: 'Mustaqil sud amaliyoti',
    difficulty: { Oson: 'Oson', "O'rta": 'O‘rta', Qiyin: 'Murakkab' }[difficulty] || difficulty || 'O‘rta', duration: duration || 30, region: 'O‘zbekiston · o‘quv vaziyati',
    source: { url: REF.jpk.url, title: origin, type: 'adapted_training', date: null, summary, outcome: 'Sud qarori manbasi va ish raqami mavjud emas.' },
    facts: facts.filter(Boolean).map(clean), issue, stakes: 'Asosli va xolis xulosa',
    client: { name: client.name, goal: client.goal, privateFact: 'Qo‘shimcha yashirin fakt yo‘q.', opening: client.goal },
    opponent: { name: opponent.name, position: opponent.position, settlement: 'Aniq kelishuv shartlari berilmagan.' },
    evidence: evidence.map((e, i) => ({
      id: 'E' + (i + 1), title: e.title, body: `E${i + 1} · ${e.title}\n${e.kind ? e.kind.toUpperCase() + ' · ' : ''}O‘QUV MATERIALI\n\n${clean(e.text)}\n\nTekshiring: kim tuzgan, qachon, asl nusxa bormi va bu material nimani isbotlay olmaydi?`,
      helps: 'Dalilning daxldorligi va cheklovini mustaqil baholang.', sourceNote: `${summary} Bu asl hujjat yoki video fayli emas, matnli o‘quv tavsifi.`,
      kind: e.kind || 'Matnli o‘quv material', authenticity: 'training_reconstruction', providedBy: 'Ish kartasidagi taraf', origin,
      limitations: 'Asl imzoli hujjat, video yoki ekspertiza fayli berilmagan. Haqiqiy ishda manba va olish tartibi alohida tekshiriladi.',
    })),
    legalRefs: [REF.jpk, REF.jk, REF.konst].map((r, i) => ({ id: 'L' + (i + 1), label: r.label, url: r.url, note: 'Arxivdagi vaziyat uchun umumiy manba. Tegishli sanadagi tahrirni tekshiring.' })),
    clientQuestions: [], decisions: [],
    reviewStatus: `Huquqshunos va o‘qituvchi tahriri kutilmoqda. ${summary}`,
    rolePrompts: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, { opening: v, finalTask: 'Dalillar, qarama-qarshi fikr va manbaga tayangan xulosa yozing.' }])),
    trial: { available: false, reason: trialReason },
  };
}

const out = [];
// Defence (himoya) and supervision (nazorat): document-review cases at the pre-trial stage.
for (const [hall, data, who] of [['himoya', read('himoya.json').CASES, 'himoya'], ['nazorat', read('nazorat.json').CASES, 'nazorat']]) {
  for (const c of Object.values(data)) {
    const questions = [optsText(c.dec), optsText(c.basis), ...(c.procs || []).map(optsText)].filter(Boolean);
    out.push(build({
      hall, id: c.id, title: c.title, difficulty: c.diff,
      facts: [`${c.place} · ${c.date}`, c.brief, questions.length ? `Mashq savollari:\n\n${questions.join('\n\n')}` : ''],
      issue: who === 'himoya' ? 'Himoyachi sifatida hujjatlardagi qoidabuzarliklarni toping, harakatingizni va huquqiy asosini tanlang.' : 'Nazorat qiluvchi prokuror sifatida hujjatlardagi qonunbuzarliklarni toping va qaror qabul qiling.',
      client: who === 'himoya' ? { name: 'Himoya ostidagi shaxs', goal: '«Huquqlarim buzildi. Nima qilish kerakligini tushuntiring.»' } : { name: 'Tuman prokuraturasi (nazorat)', goal: '«Tergov hujjatlari qonuniyligini tekshirishimiz kerak.»' },
      opponent: { name: 'Tergov organi', position: '«Barcha protsessual harakatlar tartib bo‘yicha bajarilgan.»' },
      evidence: c.docs.map(d => ({ title: `${d.no}. ${d.title}`, kind: d.kind, text: d.text })),
      roles: { advokat: 'Hujjatlardagi qoidabuzarliklarni toping va himoya choralarini asoslang.', sudya: 'Protsessual harakatlar qonuniyligini xolis baholang.', prokuror: 'Qonuniylik ustidan nazorat qiluvchi sifatida qaror qabul qiling.' },
      trialReason: `${c.stage ? `Bosqich: ${c.stage}. ` : ''}Sudgacha bo‘lgan bosqich mashqi; sud majlisi bosqichlari qo‘llanmaydi.`,
    }));
  }
}
// Investigation (tergov): detective cases with victim, scene, timeline, suspects and evidence.
for (const c of Object.values(read('tergov.json').CASES)) {
  const timeline = (c.timeline || []).map(([t, e]) => `${t} — ${e}`).join('\n');
  const suspects = (c.suspects || []).map(s => ({ title: `Gumon qilinuvchi: ${s.name}${s.age ? ` (${s.age})` : ''} — ${s.role || ''}`, kind: 'Tushuntirish', text: [s.motive && `Motiv: ${s.motive}`, s.alibi && `Alibi: ${s.alibi}`, s.info].filter(Boolean).join('\n') }));
  out.push(build({
    hall: 'tergov', id: c.id, title: c.title, difficulty: c.diff, duration: 40,
    facts: [`${c.place} · ${c.date}${c.type ? ` · ${c.type}` : ''}`, c.brief, c.victim && `Jabrlanuvchi: ${c.victim.name}${c.victim.age ? `, ${c.victim.age} yosh` : ''}. ${c.victim.info || ''}`, c.scene && `Voqea joyi: ${c.scene}`, timeline && `Vaqt chizig‘i:\n${timeline}`, c.qual && `Kvalifikatsiya variantlari:\n${optsText({ q: 'Qilmishni qanday kvalifikatsiya qilasiz?', opts: c.qual.opts })}`],
    issue: 'Tergovchi sifatida dalillarni bog‘lang, aybdorni asoslang va qilmishni to‘g‘ri kvalifikatsiya qiling.',
    client: { name: 'Tergovchi (o‘quvchi)', goal: '«Kim, qanday va nima uchun? Har bir xulosani dalil bilan bog‘lashim kerak.»' },
    opponent: { name: 'Gumon qilinuvchilar', position: (c.suspects || []).map(s => s.name).join(', ') + ' — har biri o‘z alibisini ilgari suradi.' },
    evidence: [...(c.evidence || []).map(e => ({ title: e.title, kind: e.kind, text: e.text })), ...suspects],
    roles: { advokat: 'Gumon qilinuvchi himoyachisi sifatida dalillar zanjiridagi bo‘shliqlarni toping.', sudya: 'Dalillar yig‘indisini xolis baholang: ayb isbotlanganmi?', prokuror: 'Ayblov versiyasini faqat dalillarga tayanib quring va kvalifikatsiyani asoslang.' },
    trialReason: 'Tergov bosqichi mashqi; sud majlisi bosqichlari qo‘llanmaydi.',
  }));
}
// Case paths (yol): staged criminal case from arrest to court.
for (const c of Object.values(read('yol.json').YOL)) {
  const stages = (c.st || []).map((s, i) => `${i + 1}-bosqich${s.brief ? ': ' + s.brief : ''}\n${(s.qs || []).map(q => `• ${q.q}\n${q.o.map((o, n) => `  ${String.fromCharCode(65 + n)}) ${o.t}`).join('\n')}`).join('\n')}`);
  out.push(build({
    hall: 'yol', id: String(c.id), title: c.t, difficulty: c.d, duration: 40,
    facts: [c.tag, ...String(c.fab || '').split('\n'), stages.length ? `Ish yo‘li bosqichlari:\n\n${stages.join('\n\n')}` : ''],
    issue: 'Ishni ushlashdan sudgacha olib boring: har bosqichda protsessual qarorni tanlang va oqibatini baholang.',
    client: { name: 'Ish yuritayotgan o‘quvchi', goal: '«Har bir bosqichda qonuniy va asosli qaror qabul qilishim kerak.»' },
    opponent: { name: 'Qarama-qarshi taraf', position: 'Har bosqichda tanlangan qaror oqibatlari keyingi bosqichga ta’sir qiladi.' },
    evidence: (c.docs || []).map(([title, text]) => ({ title, kind: 'Hujjat', text })),
    roles: { advokat: 'Himoyachi sifatida har bosqichda mijoz huquqlarini ta’minlang.', sudya: 'Sud bosqichida dalillar va protsessual buzilishlarni xolis baholang.', prokuror: 'Ayblovni har bosqichda qonuniylik doirasida olib boring.' },
    trialReason: 'Bosqichma-bosqich ish yo‘li mashqi; to‘liq sud majlisi alohida tahrir kutmoqda.',
  }));
}

const file = new URL('../src/content/scenarios.json', import.meta.url);
const all = JSON.parse(readFileSync(file, 'utf8'));
for (const s of out) { const i = all.findIndex(x => x.id === s.id); if (i >= 0) all[i] = s; else all.push(s); }
writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
console.log('imported', out.length, '→ scenarios:', all.length);
