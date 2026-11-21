import { migrateCourt } from './court.ts';
import data from './content/case_library.json' with { type: 'json' };
import type { Attempt, CaseFile, Decision, Report, Role, Stage } from './types.ts';
export const library = data as unknown as CaseFile[];
export const roleNames: Record<Role, string> = { advokat: 'Advokat', fuqaro: 'Fuqaro', sudya: 'Sudya', prokuror: 'Prokuror' };
export const categories = { consumer: 'Iste’molchi huquqlari', employment: 'Mehnat nizolari', criminal: 'Jinoyat protsessi' };
export const stageNames: Record<Stage, string> = { interview: 'Suhbat va aniqlashtirish', negotiation: 'Muzokara', hearing: 'Sud majlisi', reasoning: 'Huquqiy asoslash' };
export const avatars = [
  { id: 'madina', name: 'Madina', role: 'advokat' as Role, asset: 'advokat', color: '#bba3d7', initials: 'M', description: 'Tinglash. Tahlil. Himoya.' },
  { id: 'jasur', name: 'Jasur', role: 'advokat' as Role, asset: 'tomoshabin_erkak', color: '#a2b9cd', initials: 'J', description: 'Savol. Dalil. Huquqiy fikr.' },
  { id: 'kamol', name: 'Kamol', role: 'sudya' as Role, asset: 'sudya', color: '#cfbd8c', initials: 'K', description: 'Xolislik. Dalil. Asosli qaror.' },
  { id: 'sardor', name: 'Sardor', role: 'prokuror' as Role, asset: 'prokuror', color: '#98b5b0', initials: 'S', description: 'Asoslangan pozitsiya va adolat.' },
  { id: 'dilnoza', name: 'Dilnoza', role: 'fuqaro' as Role, asset: 'tomoshabin_yosh', color: '#d5aa92', initials: 'D', description: 'Faktlarni bayon qiling.' },
  { id: 'otabek', name: 'Otabek', role: 'fuqaro' as Role, asset: 'davogar', color: '#9bbd9e', initials: 'O', description: 'Huquqingizni tushunib qatnashing.' },
  { id: 'malika', name: 'Malika', role: 'fuqaro' as Role, asset: 'guvoh', color: '#c5a8b5', initials: 'M', description: 'Hujjatlar bilan gapiring.' },
];
export function availableRoles(c: CaseFile): Role[] { return (['advokat', 'fuqaro', 'sudya', 'prokuror'] as Role[]).filter(r => !!c.rolePrompts[r] && (r !== 'prokuror' || c.category === 'criminal' || c.independent)); }
// The context questions are case-specific; the last two questions establish role-specific powers and responsibility.
export function decisionsFor(c: CaseFile, role: Role): Decision[] {
  const legal = c.legalRefs.map(r => r.id);
  const valid = c.decisions.filter(q => role !== 'sudya' || q.stage !== 'negotiation');
  const option = (id: string, text: string, score: number, feedback: string) => ({ id, text, score, feedback, evidenceIds: [], sourceIds: legal.slice(0, 1) });
  const roleQuestion: Decision = {
    id: 'ROLE-RESPONSIBILITY', stage: 'hearing',
    prompt: role === 'sudya' ? 'Siz sudyasiz. Taraflarning qarama-qarshi fikrlarini qanday tekshirasiz?' : role === 'prokuror' ? 'Siz prokurorsiz. Muhim ayblov dalili ishonchsiz chiqsa, nima qilasiz?' : role === 'fuqaro' ? 'Siz ishdagi fuqaro ishtirokchisiz. Aniq bilmagan holat haqida so‘rashdi.' : 'Siz advokatsiz. Mijoz xohlagan natijani dalillar to‘liq tasdiqlamayapti.',
    options: role === 'sudya' ? [option('a', 'Har ikki tarafni tinglab, taqdim etilgan dalillarni tekshiraman va qaror sabablarini yozaman.', 2, 'Xolis eshitish va tekshirilgan dalillar qarorning asosini tashkil etadi.'), option('b', 'Faqat da’vogarning bayonotiga tayanaman.', 0, 'Bir tomonning fikri qarama-qarshi materialni tekshirish o‘rnini bosmaydi.'), option('c', 'Qaysi taraf ishonchliroq gapirganiga qarab qaror qilaman.', 0, 'Nutq uslubi dalil va huquqiy sabab o‘rnini bosmaydi.')] : role === 'prokuror' ? [option('a', 'Nomuvofiqlikni ochiq qayd etib, ayblovning shu qismini qayta baholayman.', 2, 'Asossiz ayblovni tan olish — muvaffaqiyatsizlik emas. Dalilga mos adolatli pozitsiya muhim.'), option('b', 'Har qanday yo‘l bilan ayblov hukmiga erishaman.', 0, 'Ayblov hukmi soni bu mashqda prokuror mahoratining o‘lchovi emas.'), option('c', 'Zid dalilni muhokama qilmasdan qoldiraman.', 0, 'Pozitsiyaga zid material ham ochiq baholanishi kerak.')] : role === 'fuqaro' ? [option('a', 'Aniq bilganimni aytaman, taxminimni alohida ko‘rsataman va hujjatga murojaat qilaman.', 2, 'Kuzatilgan fakt, eshitilgan ma’lumot va taxminni ajratish muhim.'), option('b', 'Yutish uchun ishonchliroq voqea to‘qib aytaman.', 0, 'To‘qilgan ma’lumot o‘quv maqsadiga ham, ishonchli bayonotga ham zid.'), option('c', 'Boshqa taraf nima desa, shuni takrorlayman.', 0, 'Shaxsiy bilimingiz va manbangizni aniq tushuntiring.')] : [option('a', 'Dalil cheklovini tushuntiraman, qo‘shimcha material yoki asosli muqobil talabni ko‘rib chiqaman.', 2, 'Mijoz manfaatini himoya qilish dalillarni buzib ko‘rsatishni anglatmaydi.'), option('b', 'Mijozga albatta yutishini kafolatlayman.', 0, 'Natija kafolati dalil va qonuniy asos o‘rnini bosa olmaydi.'), option('c', 'Qarama-qarshi hujjatni e’tiborsiz qoldiraman.', 0, 'Zid dalilga javob bermaslik pozitsiyani zaiflashtiradi.')]
  };
  return [...valid, roleQuestion];
}
export function newAttempt(c: CaseFile, role: Role, avatar: string): Attempt {
  if (!availableRoles(c).includes(role) || !avatars.some(a => a.id === avatar && a.role === role)) throw Error('Rol yoki personaj mos emas.');
  const now = new Date().toISOString();
  return { version: 2, id: crypto.randomUUID(), caseId: c.id, role, avatar, createdAt: now, updatedAt: now, index: 0, answers: [], evidence: {}, asked: [], turns: [], final: null, completed: false, teacherNote: '' };
}
export function answer(a: Attempt, c: CaseFile, optionId: string): Attempt {
  if (a.completed || a.caseId !== c.id) return a;
  const qs = decisionsFor(c, a.role), q = qs[a.index];
  if (!q?.options.some(o => o.id === optionId)) throw Error('Javob topilmadi.');
  return { ...a, index: a.index + 1, updatedAt: new Date().toISOString(), answers: [...a.answers, { questionId: q.id, optionId }] };
}
export function evidenceAction(a: Attempt, c: CaseFile, id: string, action: 'read' | 'submitted' | 'examined'): Attempt {
  if (a.completed || !c.evidence.some(e => e.id === id)) return a;
  const current = a.evidence[id];
  const stage=decisionsFor(c,a.role)[a.index]?.stage;
  if (action === 'submitted' && (!current || (stage && !['hearing','reasoning'].includes(stage)))) throw Error('Avval hujjatni o‘qing. Dalilni sud majlisi bosqichida taqdim eting.');
  if (action === 'examined' && current !== 'submitted') throw Error('Avval dalilni taqdim eting.');
  if ((current === 'examined') || (current === 'submitted' && action === 'read')) return a;
  return { ...a, evidence: { ...a.evidence, [id]: action }, updatedAt: new Date().toISOString() };
}
export const positions = (role: Role, criminal: boolean) => role === 'sudya' ? ['Talab / ayblov dalillar bilan asoslangan', 'Qisman asoslangan', 'Hozirgi material yetarli emas'] : role === 'prokuror' ? ['Asoslangan ayblovni qo‘llab-quvvatlayman', 'Faqat tasdiqlangan qismini qo‘llab-quvvatlayman', 'Asossiz qismdan voz kechishni taklif qilaman'] : criminal ? ['Himoya pozitsiyasi', 'Qisman e’tiroz va qayta baholash', 'Qo‘shimcha tekshiruv zarur'] : ['Talabni qo‘llab-quvvatlayman', 'Asosli kelishuvni taklif qilaman', 'Qo‘shimcha dalil kerak'];
export function assess(a: Attempt, c: CaseFile): Report {
  if (a.mode === 'immersive') return assessHearing(a, c);
  const qs = decisionsFor(c, a.role);
  const selected = a.answers.map(x => qs.find(q => q.id === x.questionId)?.options.find(o => o.id === x.optionId)).filter(x => !!x);
  const read = Object.keys(a.evidence).length, submitted = Object.values(a.evidence).filter(v => ['submitted','examined'].includes(v)).length;
  const examined = Object.values(a.evidence).filter(v => v === 'examined').length;
  const validEvidence = a.final?.evidenceIds.filter(id => a.evidence[id] === 'examined') || [];
  const validSources = a.final?.sourceIds.filter(id => c.legalRefs.some(s => s.id === id)) || [];
  const roleIndex = a.answers.find(x => x.questionId === 'ROLE-RESPONSIBILITY');
  const roleScore = qs.find(q => q.id === 'ROLE-RESPONSIBILITY')?.options.find(o => o.id === roleIndex?.optionId)?.score || 0;
  const dimensions = [
    { label: 'Vaziyat va protsessual qarorlar', score: selected.reduce((n, o) => n + (o?.score || 0), 0), max: qs.length * 2 },
    { label: 'Dalillarni o‘qish va tekshirish', score: Math.min(read, 4) + Math.min(examined, 4), max: 8 },
    { label: 'Savol berish va aniqlashtirish', score: Math.min(a.asked.length, 3), max: 3 },
    { label: 'Asoslashga tayyorgarlik', score: (validEvidence.length >= 2 ? 2 : validEvidence.length) + (validSources.length ? 2 : 0) + ((a.final?.text.trim().length || 0) >= 100 ? 2 : 0), max: 6 },
  ];
  const score = Math.round(dimensions.reduce((n,d) => n + d.score, 0) / dimensions.reduce((n,d) => n + d.max, 0) * 100);
  const reasoned = validEvidence.length >= 2 && validSources.length > 0 && (a.final?.text.trim().length || 0) >= 100 && roleScore === 2;
  const strengths = selected.filter(o => o && o.score === 2).slice(0, 3).map(o => o!.feedback);
  const mistakes = selected.filter(o => o && o.score < 2).map(o => o!.feedback);
  if (examined < 2) mistakes.push('Yakuniy fikrgacha kamida ikki tegishli dalil birgalikda tekshirilmagan.');
  if (!validSources.length) mistakes.push('Yakuniy fikrda huquqiy manba tanlanmagan.');
  const outcome = !reasoned || score < 55 ? 'insufficient' : score >= 80 ? 'supported' : 'partial';
  const outcomeLabel = a.role === 'sudya' ? (reasoned && score >= 70 ? 'Qarorni asoslash mezonlari bajarildi' : 'Qaror asoslarini qayta ishlang') : a.role === 'prokuror' ? (reasoned && score >= 70 ? 'Dalilga mos pozitsiya shakllandi' : 'Ayblov asoslarini qayta baholang') : outcome === 'supported' ? 'O‘quv natijasi: pozitsiya qo‘llab-quvvatlandi' : outcome === 'partial' ? 'O‘quv natijasi: qisman muvaffaqiyat' : 'O‘quv natijasi: talab tasdiqlanmadi';
  return { score, outcome, outcomeLabel, roleLabel: roleNames[a.role], strengths: [...new Set(strengths)], mistakes: [...new Set(mistakes)], nextSteps: ['Qarama-qarshi dalilga alohida javob yozing.', 'Manbadagi tegishli normani va uning amal qilish davrini o‘qituvchi bilan tekshiring.', submitted > examined ? 'Taqdim etilgan hujjatlarni tekshirish bosqichini yakunlang.' : 'Boshqa rol bilan shu ishga qayting va pozitsiyalarni solishtiring.'], dimensions, reasoned, finalNeedsReview: true };
}
export function parseAttempts(raw: string | null, casePool: CaseFile[] = library): Attempt[] {
  if (!raw) return [];
  try {
    const items = JSON.parse(raw); if (!Array.isArray(items)) return [];
    return items.filter((a: Attempt) => {
      if (a?.version !== 2 || typeof a.id !== 'string' || !casePool.some(c => c.id === a.caseId) || !a.evidence || !Array.isArray(a.answers) || !Array.isArray(a.turns) || !Array.isArray(a.asked) || !Number.isInteger(a.index) || a.index < 0) return false;
      const c = casePool.find(c => c.id === a.caseId)!;
      return availableRoles(c).includes(a.role) && avatars.some(x => x.id === a.avatar && x.role === a.role) && a.index === a.answers.length && a.index <= decisionsFor(c,a.role).length && a.answers.every((x,i) => decisionsFor(c,a.role)[i]?.id === x.questionId && decisionsFor(c,a.role)[i].options.some(o => o.id === x.optionId)) && Object.entries(a.evidence).every(([id,state]) => c.evidence.some(e => e.id === id) && ['read','submitted','examined'].includes(state)) && (!a.completed || !!a.final);
    }).slice(0, 40).map((a: Attempt) => {
      const c = casePool.find(c => c.id === a.caseId)!;
      const court = migrateCourt(a.court, c.evidence.map(e => e.id));
      const turns = a.turns.filter(x => x && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.stage === 'string').slice(-200).map(x => ({ ...x, text: x.text.slice(0, 6000), feedback: x.feedback && typeof x.feedback.summary === 'string' && ['strengths','improvements','sourceIds','evidenceIds'].every(k => Array.isArray((x.feedback as unknown as Record<string, unknown>)[k]) && ((x.feedback as unknown as Record<string, unknown>)[k] as unknown[]).every(v => typeof v === 'string')) ? x.feedback : undefined }));
      const final = a.final && typeof a.final.text === 'string' && typeof a.final.position === 'string' && Array.isArray(a.final.evidenceIds) && Array.isArray(a.final.sourceIds)
        ? { text: a.final.text.slice(0,6000), position: a.final.position.slice(0,200), evidenceIds: a.final.evidenceIds.filter(id => c.evidence.some(e => e.id === id)), sourceIds: a.final.sourceIds.filter(id => c.legalRefs.some(r => r.id === id)) } : null;
      return { ...a, court, turns, final, completed: a.completed === true && !!final,
        teacherNote: typeof a.teacherNote === 'string' ? a.teacherNote.slice(0,6000) : '',
        asked: a.asked.filter(x => Number.isInteger(x) && x >= 0 && x < c.clientQuestions.length),
        sessionId: typeof a.sessionId === 'string' ? a.sessionId.slice(0,100) : undefined,
        courtMessages: Array.isArray(a.courtMessages) ? a.courtMessages.filter(m => m && typeof m.actor === 'string' && /^CH_[A-Z_0-9]+$/.test(m.actor) && ['user','npc','system'].includes(m.who) && typeof m.text === 'string').slice(-80).map(m => ({ ...m, text: m.text.slice(0,6000) })) : undefined };
    });
  } catch { return []; }
}
export function displayText(text: string, alphabet: 'latin' | 'new') {
  if (alphabet === 'latin') return text;
  return text.replace(/[Oo][‘ʻʼ’']/g, s => s[0] === 'O' ? 'Ö' : 'ö').replace(/[Gg][‘ʻʼ’']/g, s => s[0] === 'G' ? 'Ğ' : 'ğ').replace(/Sh|SH|sh/g, s => s[0] === 's' ? 'ş' : 'Ş').replace(/Ch|CH|ch/g, s => s[0] === 'c' ? 'ç' : 'Ç');
}

/** Readiness checklist based on the actual hearing, never fabricated quiz answers or AI verdicts. */
export function assessHearing(a: Attempt, c: CaseFile): Report {
  const court = migrateCourt(a.court, c.evidence.map(e => e.id));
  const examined = court.examined.length;
  const linked = a.final?.evidenceIds.filter(id => court.examined.includes(id)).length || 0;
  const sources = a.final?.sourceIds.filter(id => c.legalRefs.some(r => r.id === id)).length || 0;
  const dimensions = [
    { label: 'Hujjatlarni öqiş', score: Math.min(Object.keys(a.evidence).length,4), max: 4 },
    { label: 'Dalillarni sudda tekşiriş', score: Math.min(examined,4), max: 4 },
    { label: 'Erkin fikrni qayd etiş', score: Math.min(a.turns.filter(t => t.text.trim().length >= 40).length,3), max: 3 },
    { label: 'Yakuniy asoslar: dalil va manba', score: Math.min(linked,2) + (sources ? 2 : 0) + ((a.final?.text.trim().length || 0) >= 100 ? 2 : 0), max: 6 },
    { label: 'Majlis bosqiçlarini yakunlaş', score: court.phase === 'decision' ? 2 : 0, max: 2 },
  ];
  const strengths = a.turns.flatMap(t => t.feedback?.strengths || []);
  if (examined >= 2) strengths.push('Sudda kamida ikki dalil tekşirilgan.');
  if (linked && sources) strengths.push('Yakuniy fikrga tekşirilgan dalil va huquqiy manba bağlangan.');
  const mistakes = a.turns.flatMap(t => t.feedback?.improvements || []);
  if (examined < 2) mistakes.push('Kamida ikki tegishli dalilni soliştirib tekşiring.');
  if (!sources) mistakes.push('Xulosaga tegishli huquqiy manbani bağlang.');
  if (a.role === 'prokuror') mistakes.push('Asossiz ayblovni qayta baholaşni va himoya dalillariga javobni ökituvçi bilan tekşiring.');
  if (a.role === 'sudya') mistakes.push('Qaror sabablarini, xolislikni va har ikki taraf dalillarini ökituvçi baholaydi.');
  return { score: Math.round(100 * dimensions.reduce((n,d) => n+d.score,0) / 19), outcome: 'pending_review',
    outcomeLabel: 'Sud maşqi yakunlandi · huquqiy baho kutilmoqda', roleLabel: roleNames[a.role],
    strengths: [...new Set(strengths)], mistakes: [...new Set(mistakes)], dimensions,
    nextSteps: ['AI kuzatuvlarini asl suhbat bilan soliştiring.', 'Natija va huquqiy sabablarni ökituvçi bilan tekşiring.', 'Boşqa rol bilan qayta maşq qiling.'],
    reasoned: linked >= 2 && sources > 0 && (a.final?.text.trim().length || 0) >= 100, finalNeedsReview: true };
}
