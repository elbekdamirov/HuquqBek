import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject, PointerEvent as RPointerEvent } from 'react';
import { positions, roleNames } from './training';
import { avatars } from './training';
import type { Attempt, CaseFile, Services, TurnFeedback } from './types';
import { SourcePanel } from './services';
import { Icon, Modal } from './ui';
import { startRecording, retryLast } from './voice';
import type { Recording } from './voice';
import { availableActions, courtAction, flow, migrateCourt, phaseNames } from './court';
import type { CourtState } from './court';
import { speech } from './speech';
import type { SpeechState } from './speech';
import { languageText as toRevised,translateText } from './i18n';
import './immersive.css';

const Scene = lazy(() => import('./Scene'));

export const names: Record<string, string> = {
  CH_QONUNAI: 'QonunAI', CH_JUDGE: 'Sudya', CH_PLAINTIFF: 'Daʼvogar', CH_VICTIM: 'Jabrlanuvçi', CH_RESPONDENT: 'Javobgar', CH_PROSECUTOR: 'Prokuror',
  CH_ADVOCATE: 'Advokat', CH_WITNESS: 'Guvoh', CH_CLERK: 'Sud kotibi', CH_SECURITY: 'Zal xodimi',
};
type Msg = { actor: string; who: 'user' | 'npc' | 'system'; text: string; provider?: string };
type Reply = TurnFeedback & { grounding?: { unverifiedArticles?: string[]; unknownEvidence?: string[] }; text: string; reply: string; intent: string; evidenceId: string | null; ruling: 'sustained' | 'overruled' | null; emotion: string; gesture: string; animation: string; contradiction: string | null; notice?: string; route?: { provider: string; reason: string } };
type EvState = 'read' | 'submitted' | 'examined';
const evLabel = (s?: string, challenged?: string) => challenged === 'sustained' ? 'Eʼtiroz qanoatlantirilgan' : s === 'examined' ? 'Sudda tekşirildi' : s === 'submitted' ? 'Taqdim etilgan' : s === 'read' ? 'Öqildi' : 'Öqilmagan';
const EV_TYPES: [RegExp, string, string][] = [
  [/şartnoma|kontrakt|bitim|kelişuv/i, 'Şartnoma', 'contract'], [/çek|kvitansiya|tölov|hisob-faktura|to‘lov|tölangan/i, 'Tölov hujjati', 'receipt'],
  [/foto|surat|rasm/i, 'Fotosurat', 'photo'], [/video|kamera|kuzatuv/i, 'Video yozuv', 'video'], [/audio|ovozli/i, 'Audio yozuv', 'audio'],
  [/ekspert|xulosa|dalolatnoma|servis/i, 'Ekspert / servis xulosasi', 'report'], [/körsatma|tuşuntiriş|bayonnoma|ariza|guvoh/i, 'Körsatma / ariza', 'statement'],
  [/sms|xabar|elektron|ilova|jurnal|baza|telegram/i, 'Raqamli yozuv', 'digital'], [/buyum|qurilma|telefon|predmet/i, 'Ashyoviy dalil', 'object'],
];
const evType = (title: string) => EV_TYPES.find(([re]) => re.test(title)) || [null, 'Hujjat', 'document'] as const;

// Offline understanding of a typed request (used when no AI provider is configured or reachable).
function localIntent(text: string, ids: string[]): { intent: string; evidenceId: string | null } {
  const t = toRevised(text).toLowerCase(); const id = ids.find(x => new RegExp(`\\b${x.toLowerCase()}\\b`).test(t)) || null;
  if (/majlis.*(boşla|oç)|boşla.*majlis|davom ettir/.test(t)) return { intent: 'begin_hearing', evidenceId: null };
  if (/guvoh.*çaqir|çaqir.*guvoh/.test(t)) return { intent: 'call_witness', evidenceId: null };
  if (/eʼtiroz|e'tiroz|etiroz|qarşiman/.test(t)) return { intent: 'objection', evidenceId: id };
  if (/taqdim/.test(t)) return { intent: 'submit_evidence', evidenceId: id };
  if (/tekşir/.test(t) && id) return { intent: 'examine_evidence', evidenceId: id };
  if (/tanaffus/.test(t)) return { intent: 'request_break', evidenceId: null };
  if (/yakuniy söz/.test(t)) return { intent: 'final_statement', evidenceId: null };
  if (/nutq|münozara|xulosa qil/.test(t)) return { intent: 'closing_argument', evidenceId: null };
  if (/qaror|hukm/.test(t)) return { intent: 'request_decision', evidenceId: null };
  return { intent: 'question', evidenceId: id };
}
const REQUEST_TEXT: Record<string, (id?: string | null) => string> = {
  begin_hearing: () => 'Hurmatli sud, taraflar tayyor. Sud majlisini boşlaşni sörayman.',
  call_witness: () => 'Hurmatli sud, guvohni sörov uçun çaqirişni iltimos qilaman.',
  submit_evidence: id => `Hurmatli sud, ${id} dalilini ish hujjatlariga taqdim etişga ruxsat sörayman.`,
  examine_evidence: id => `Hurmatli sud, taqdim etilgan ${id} dalilini sudda tekşirişni sörayman.`,
  objection: id => `Eʼtirozim bor, hurmatli sud${id ? `: ${id} dalilining maqbulligi şubhali` : ''}.`,
  request_break: () => 'Hurmatli sud, qisqa tanaffus eʼlon qiliş mumkinmi?',
  closing_argument: () => 'Dalillar tekşirildi. Taraflar nutqiga ötişni sörayman.',
  final_statement: () => 'Hurmatli sud, yakuniy söz sörayman.',
  request_decision: () => 'Hurmatli sud, ish böyiça qaror çiqarişingizni sörayman.',
};

class Guard extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? <div className="ig-failure">3D sahna yuklanmadi. Suhbat, hujjatlar va sud harakatlari işlaydi.</div> : this.props.children; }
}

export default function Immersive({ a, c, update, back, review, services }: { a: Attempt; c: CaseFile; update: (a: Attempt) => void; back: () => void; review: () => void; services: Services }) {
  const saved = a as Attempt & { court?: unknown; courtMessages?: Msg[]; sessionId?: string };
  const sessionId = useMemo(() => saved.sessionId || crypto.randomUUID(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ai = services.groq.configured;
  const voice = services.voicelab.configured;
  const independent = !!c.independent;
  const criminal = c.category === 'criminal';
  const [court, setCourt] = useState<CourtState>(() => migrateCourt(saved.court, c.evidence.map(e => e.id)));
  const [messages, setMessages] = useState<Msg[]>(() => saved.courtMessages || [{ actor: 'CH_QONUNAI', who: 'npc', text: independent ? toRevised(`${c.title}. ${c.facts.join(' ')} Mustaqil mashq: hujjatlar va manbalarni tekshiring, jarayonni o‘zingiz boshqaring. QonunAI yordamiga istalgan payt murojaat qilishingiz mumkin.`) : toRevised(`HuquqBek sud zaliga xush kelibsiz! Siz ${roleNames[a.role]} rolidasiz. Iş: ${c.title}. Avval "Dalillar" bölimida hujjatlarni öqing. ${a.role === 'sudya' ? 'Siz sudya sifatida öz örningizda qolasiz; ishtirokçilarni röyxatdan tanlang.' : 'W A S D yoki ekrandagi joystik bilan yuring, ishtirokçiga yaqinlaşib E tugmasini bosing.'} Majlisni boşlaş uçun sudyaga murojaat qiling.`) }]);
  const [actor, setActor] = useState('CH_QONUNAI');
  const [chatOpen, setChatOpen] = useState(!independent);
  const [near, setNear] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<{ phase: 'idle' | 'listening' | 'transcribing'; level: number; seconds: number; error: string; mode: string }>({ phase: 'idle', level: 0, seconds: 0, error: '', mode: '' });
  const [panel, setPanel] = useState<'' | 'evidence' | 'sources' | 'decision'>('');
  const [say, setSay] = useState<SpeechState>(speech.state());
  const [style, setStyle] = useState<{ gesture: string | null; emotion: string | null; animation: string | null }>({ gesture: null, emotion: null, animation: null });
  const [presented, setPresented] = useState<{ id: string; title: string; at: number } | null>(null);
  const [notice, setNotice] = useState('');

  const [drawer, setDrawer] = useState(false);
  const [playerTalking, setPlayerTalking] = useState(false);
  const recRef = useRef<Recording | null>(null);
  const joystick = useRef({ x: 0, y: 0 });
  const live = useRef({ a, court, messages }); live.current = { a, court, messages };
  const mounted = useRef(true);
  const transcript = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  useEffect(() => { if (followTranscript.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages, busy, actor, chatOpen]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => { document.documentElement.style.setProperty('--court-height', `${viewport?.height || window.innerHeight}px`); };
    resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); document.documentElement.style.removeProperty('--court-height'); };
  }, []);
  const coarse = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches, []);

  useEffect(() => speech.subscribe(setSay), []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recRef.current?.cancel(); speech.stop(false); }; }, []);
  useEffect(() => { if (!independent && !a.turns.length && messages.length === 1) void speech.say({ actor: 'CH_QONUNAI', text: messages[0].text }, voice); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const read = Object.keys(a.evidence);
  const actions = availableActions(court, read).filter(x=>!independent || (x.intent!=="call_witness" && (criminal || x.intent!=="final_statement") && !(criminal && court.phase==="arguments" && x.intent==="request_decision")));
  const cast = independent ? ['CH_QONUNAI','CH_JUDGE',...(a.role==='advokat'?[]:['CH_ADVOCATE']),...(a.role==='prokuror'?[]:['CH_PROSECUTOR'])] : ['CH_QONUNAI', ...(a.role === 'sudya' ? [] : ['CH_JUDGE']), 'CH_CLERK', ...(criminal && a.role !== 'prokuror' ? ['CH_PROSECUTOR'] : []),
    ...(a.role === 'advokat' ? [] : ['CH_ADVOCATE']), ...(a.role === 'fuqaro' ? [] : [criminal ? 'CH_VICTIM' : 'CH_PLAINTIFF']), 'CH_RESPONDENT', 'CH_WITNESS', 'CH_SECURITY'];
  const respondentName = criminal ? 'Sudlanuvçi' : 'Javobgar';
  const nameOf = (id: string) => independent && a.role==='sudya' && id==='CH_JUDGE' ? 'Majlisni boshqarish' : id === 'CH_RESPONDENT' ? respondentName : names[id] || 'Ishtirokçi';

  const persist = (next: CourtState, msgs: Msg[], extra: Partial<Attempt> = {}, evidence = live.current.a.evidence) => {
    const ev: Record<string, EvState> = { ...evidence };
    for (const id of next.submitted) ev[id] = ev[id] === 'examined' ? 'examined' : 'submitted';
    for (const id of next.examined) ev[id] = 'examined';
    update({ ...live.current.a, mode: 'immersive', ...extra, evidence: ev, court: next, courtMessages: msgs.slice(-80), sessionId, updatedAt: new Date().toISOString() } as Attempt);
  };

  const speak = (line: Msg, s: { gesture?: string | null; emotion?: string | null; animation?: string | null } = {}) => {
    setStyle({ gesture: s.gesture ?? null, emotion: s.emotion ?? null, animation: s.animation ?? null });
    void speech.say({ actor: line.actor, text: line.text }, voice);
  };

  /** Core turn: learner text (+ optional explicit court intent) -> AI router or offline script -> state machine -> voice. */
  const send = async (value: string, to = actor, intentHint?: string, evidenceId?: string | null) => {
    const clean = toRevised(value.trim());
    if (busy || clean.length < 2) return;
    setBusy(true); setNotice(''); setText(''); speech.stop(false);
    setPlayerTalking(true); setTimeout(() => mounted.current && setPlayerTalking(false), 1800);
    const before = live.current.messages;
    const history = [...before, { actor: to, who: 'user' as const, text: clean }];
    setMessages(history);
    const ids = c.evidence.map(e => e.id);
    let reply: Msg; let result = { state: live.current.court, ok: false, line: '' };
    let feedback: Reply | null = null;
    try {
      if (ai) {
        feedback = await fetch('/api/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          caseId: c.id, role: a.role, sessionId, actor: to, text: clean, intentHint, history: history.slice(-30), courtState: live.current.court, evidence: live.current.a.evidence, stage: live.current.court.phase,
        }) }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(Error(j.error || 'AI javob bermadi.'), { status: r.status }); return j; });
      }
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 400 || status === 429) { setNotice((e as Error).message); setMessages(before); setText(value); setBusy(false); return; } // bug #16: no orphan message
      setNotice(`${(e as Error).message} Oflayn ssenariy bilan davom etilmoqda.`);
    }
    if (!mounted.current) return;
    const intent = intentHint || (feedback?.intent && feedback.intent !== 'none' ? feedback.intent : !feedback ? localIntent(clean, ids).intent : 'none');
    const evId = evidenceId || feedback?.evidenceId || (!feedback ? localIntent(clean, ids).evidenceId : null);
    const authoriser = to;
    if (independent && criminal && intent==='request_decision' && live.current.court.phase!=='final') result={state:live.current.court,ok:false,line:'Sudlanuvchining oxirgi so‘zi bosqichini yakunlang.'};
    else if (intent && intent !== 'none' && intent !== 'question') result = courtAction(live.current.court, intent, evId, authoriser, Object.keys(live.current.a.evidence), ids, a.role, feedback?.ruling, independent ? c.courtType : undefined);
    if (feedback) {
      // The AI may phrase acceptance, but only the state machine decides: on refusal append the rule.
      const t = !result.ok && result.line && to === 'CH_JUDGE' ? `${feedback.text} ${result.line}` : feedback.text;
      reply = { actor: to, who: 'npc', text: t, provider: feedback.provider };
      if (feedback.notice) setNotice(feedback.notice);
      if (feedback.grounding && (feedback.grounding as { unverifiedArticles?: string[] }).unverifiedArticles?.length) setNotice(`Diqqat: javobdagi ${(feedback.grounding as { unverifiedArticles: string[] }).unverifiedArticles.join(', ')}-modda ish manbalarida tasdiqlanmagan. Ökituvçi bilan tekşiring.`);
    } else {
      reply = { actor: to, who: 'npc', text: offlineReply(to, clean, result, intent) };
    }
    if (result.ok && intent === 'submit_evidence' && evId) setPresented({ id: evId, title: c.evidence.find(e => e.id === evId)?.title || '', at: Date.now() });
    if (result.ok && intent === 'request_decision') setTimeout(() => mounted.current && setPanel('decision'), 400);
    const msgs = [...history, reply];
    setCourt(result.state); setMessages(msgs);
    persist(result.state, msgs, { turns: [...live.current.a.turns, { id: crypto.randomUUID(), stage: result.state.phase, text: clean, createdAt: new Date().toISOString(), ...(feedback ? { feedback } : {}) }] });
    speak(reply, { gesture: feedback?.gesture || (result.ok ? 'formal_hand' : null), emotion: feedback?.emotion || (result.ok ? 'serious' : null), animation: feedback?.animation || (to === 'CH_JUDGE' && result.ok && ['begin_hearing', 'request_decision'].includes(intent) ? 'stand_and_speak' : to === 'CH_JUDGE' ? 'speak_seated' : 'stand_and_speak') });
    setBusy(false);
  };

  function offlineReply(to: string, q: string, result: { ok: boolean; line: string }, intent: string): string {
    if (to === 'CH_JUDGE') return result.line || 'Sud sizni eşitdi. Sörovingizni aniq ifodalang yoki "Sud harakatlari" tugmalaridan foydalaning.';
    if (to === 'CH_CLERK' && a.role === 'sudya' && result.line) return `Qayd etildi. ${result.line}`;
    if (to === 'CH_QONUNAI') return toRevised(`Keyingi qadam: ${actions[0]?.label || 'qarorni tahlil qiling'}. ${court.phase === 'preparation' ? 'Avval dalillarni öqing, keyin sudyadan majlisni boşlaşni söreng.' : 'Har bir dalil uçun: öqiş → taqdim etiş → tekşiriş.'} (AI ulanmagan: oflayn maslahat.)`);
    if ((to === 'CH_PLAINTIFF' || to === 'CH_VICTIM') && c.clientQuestions.length) {
      const words = toRevised(q).toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const best = c.clientQuestions.map(x => ({ x, s: words.filter(w => toRevised(x.ask).toLowerCase().includes(w)).length })).sort((m, n) => n.s - m.s)[0];
      return toRevised(best && best.s ? best.x.answer : c.client.opening);
    }
    if (to === 'CH_WITNESS') return court.witnessCalled ? toRevised(`Men faqat körgan narsamni aytaman: ${c.facts[0] || ''}`) : 'Meni hali sud çaqirmadi. Avval sudyadan guvohni çaqirişni söreng.';
    if (to === 'CH_RESPONDENT') return toRevised(c.opponent.position);
    if (intent && intent !== 'question') return 'Bu masala böyiça sudyaga murojaat qiling.';
    return 'AI ulanmagan. Sud harakatlari tugmalaridan yoki dalillar bölimidan foydalaning.';
  }

  const choose = (id: string) => { if (busy) return; followTranscript.current=true; setActor(id); setChatOpen(true); setDrawer(false); };
  const doAction = (intent: string, evId?: string | null) => {
    const ask = translateText(REQUEST_TEXT[intent]?.(evId) || intent);
    const to = a.role === 'sudya' && !independent ? 'CH_CLERK' : 'CH_JUDGE';
    setActor(to); setChatOpen(true);
    void send(ask, to, intent, evId);
  };

  const mic = async () => {
    if (rec.phase === 'listening') { recRef.current?.stop(); return; }
    if (rec.phase === 'transcribing' || busy) return;
    speech.stop();
    const started = Date.now();
    try {
      recRef.current = await startRecording({
        onFinal: (t, mode) => { if (!mounted.current) return; setText(old => (old ? old + ' ' : '') + t); setRec({ phase: 'idle', level: 0, seconds: 0, error: '', mode: mode === 'realtime' ? 'Realtime STT' : 'Yuklangan STT' }); },
        onError: m => mounted.current && setRec({ phase: 'idle', level: 0, seconds: 0, error: m, mode: '' }),
        onStopped: () => mounted.current && setRec(r => r.phase === 'listening' ? { ...r, phase: 'transcribing' } : r),
        onLevel: l => mounted.current && setRec(r => ({ ...r, level: l, seconds: Math.round((Date.now() - started) / 1000) })),
        onPhase: p => mounted.current && setRec(r => ({ ...r, phase: p })),
      });
      setRec({ phase: 'listening', level: 0, seconds: 0, error: '', mode: '' });
    } catch (e) { setRec({ phase: 'idle', level: 0, seconds: 0, error: (e as Error).message, mode: '' }); }
  };
  const retry = async () => { setRec(r => ({ ...r, phase: 'transcribing', error: '' })); try { const t = await retryLast(); setText(old => (old ? old + ' ' : '') + t); setRec({ phase: 'idle', level: 0, seconds: 0, error: '', mode: 'Qayta yuborildi' }); } catch (e) { setRec({ phase: 'idle', level: 0, seconds: 0, error: (e as Error).message, mode: '' }); } };
  const cancelRec = () => { recRef.current?.cancel(); setRec({ phase: 'idle', level: 0, seconds: 0, error: '', mode: '' }); };

  const markRead = (id: string) => { if (a.evidence[id]) return; const ev = { ...a.evidence, [id]: 'read' as const }; update({ ...a, evidence: ev }); };
  const onWitnessArrived = () => { const line: Msg = { actor: 'CH_WITNESS', who: 'npc', text: 'Hurmatli sud, men guvohman. Bilgan narsalarimni rost aytişga tayyorman.' }; const msgs = [...live.current.messages, line]; setMessages(msgs); persist(live.current.court, msgs); speak(line, { gesture: 'nod', emotion: 'nervous', animation: 'stand_and_speak' }); };

  const visible = messages.filter(m => m.actor === actor).slice(-12);
  const words = say.line ? say.line.text.split(' ') : [];
  // Word-synced subtitle; long lines show a rolling window of the most recent words.
  const spoken = say.line ? words.slice(0, Math.max(1, Math.ceil(words.length * Math.min(1, say.progress * 1.08)))) : [];
  const shown = (spoken.length > 26 ? '… ' : '') + spoken.slice(-26).join(' ');
  const phaseLabel=(p: keyof typeof phaseNames)=>independent && criminal && p==='final'?'Sudlanuvchining oxirgi so‘zi':phaseNames[p];
  const stage = flow.indexOf(court.phase === 'paused' ? (court.resumeTo || 'opening') : court.phase);
  const player = avatars.find(x => x.id === a.avatar);

  return <div className={'ig' + (chatOpen ? ' ig-chat-open' : '')}>
    <div className="ig-world"><Guard onFail={() => setNotice('3D sahna yuklanmadi; suhbat va harakatlar işlaydi.')}><Suspense fallback={<div className="ig-failure ig-loading"><span className="ig-spinner"/>HuquqBek sud zali yuklanmoqda…</div>}>
      <Scene screen="immersive" learningCast={independent} lessonTitle={independent?translateText(c.title):undefined} playerRole={a.role} playerAsset={player?.asset || 'advokat'} criminal={criminal} blocked={chatOpen || !!panel} quality={coarse ? 'low' : 'balanced'} reduced={false}
        activeActor={actor} speakerId={say.line?.actor || ''} speaking={say.playing || say.loading} gesture={style.gesture} emotion={style.emotion} animation={style.animation}
        witnessCalled={!independent && court.witnessCalled} phase={court.phase} presented={presented} joystick={joystick} playerTalking={playerTalking}
        onInteract={choose} onNear={setNear} onFailure={() => setNotice('3D grafika qayta yuklanişi kerak.')} onWitnessArrived={onWitnessArrived}/>
    </Suspense></Guard></div>

    <header className="ig-top">
      <button className="ig-brand" onClick={back} aria-label="HuquqBek kutubxonasiga qaytiş"><img src="/brand/huquqbek-courthouse.svg" width="26" height="26" alt=""/>HuquqBek</button>
      <div className="ig-title"><b>{c.title}</b><small>{roleNames[a.role]} · {phaseLabel(court.phase)}</small></div>
      <nav className="ig-topnav">
        <button onClick={() => setPanel('evidence')}><Icon name="cases" size={16}/>Dalillar</button>
        <button onClick={() => setPanel('sources')}><Icon name="book" size={16}/>Manbalar</button>
        <button onClick={() => court.phase === 'decision' ? setPanel('decision') : independent ? setPanel('sources') : review()}><Icon name="chart" size={16}/>{court.phase === 'decision' ? 'Hisobot' : independent ? 'Ish ma’lumoti' : 'Alohida test'}</button>
      </nav>
    </header>
    <ol className="ig-steps" aria-label="Sud jarayoni bosqiçlari">{flow.filter(p=>!independent || (p!=='testimony' && (criminal || p!=='final'))).map((p) => <li key={p} className={flow.indexOf(p) < stage ? 'done' : flow.indexOf(p) === stage ? 'now' : ''}>{phaseLabel(p)}</li>)}{court.phase === 'paused' && <li className="now">Tanaffus</li>}</ol>

    <button className="ig-drawer-toggle" onClick={() => setDrawer(!drawer)} aria-expanded={drawer}><Icon name="users" size={18}/>Ishtirokçilar</button>
    <aside className={'ig-contacts' + (drawer ? ' open' : '')}>
      <h3>Ishtirokçilar</h3>
      {cast.map(id => <button className={actor === id && chatOpen ? 'selected' : ''} key={id} onClick={() => choose(id)}>{nameOf(id)}{near === id && <small> · yaqin</small>}</button>)}
      <p>{ai ? 'AI suhbat faol' : 'AI ulanmagan: oflayn ssenariy'}{voice ? ' · VoiceLab ovoz' : ' · ovozsiz'}</p>
    </aside>
    <div className="ig-log" aria-live="polite">{court.log.slice(-3).map((x, i) => <p key={i}>{x}</p>)}</div>

    {!chatOpen && say.line && (say.playing || say.loading || say.progress < 1) && <div className="ig-subtitle" role="status" aria-live="polite">
      <b>{nameOf(say.line.actor)}</b><span>{say.loading ? '…' : shown}</span>
      <div><button onClick={() => speech.replay(voice)} aria-label="Qayta eşitiş"><Icon name="volume" size={15}/></button><button onClick={() => speech.skip()} aria-label="Ötkazib yuboriş">⏭</button></div>
    </div>}

    {chatOpen ? <section className="ig-chat" aria-label={`${nameOf(actor)} bilan suhbat`}>
      <header><h2>{nameOf(actor)}</h2>{(say.playing || say.loading) && <button type="button" onClick={() => speech.skip()} aria-label="Ovozni töxtatiş">Ovozni töxtatiş</button>}<button onClick={() => setChatOpen(false)}>Zalda yuriş</button></header>
      <div className="ig-messages" role="log" ref={transcript} onScroll={e => { const el=e.currentTarget; followTranscript.current=el.scrollHeight-el.scrollTop-el.clientHeight<48; }}>
        {visible.map((m, i) => <p key={i} className={m.who}><b>{m.who === 'user' ? 'Siz' : nameOf(actor)}</b>{m.text}</p>)}
        {busy && <p className="npc pending">{nameOf(actor)} javob tayyorlamoqda…</p>}
      </div>
      {(actor === 'CH_JUDGE' || (a.role === 'sudya' && actor === 'CH_CLERK')) && actions.length > 0 && <div className="ig-actions" aria-label="Sud harakatlari">
        {actions.map(x => x.needsEvidence
          ? <select key={x.intent} disabled={busy} value="" onChange={e => e.target.value && doAction(x.intent, e.target.value)} aria-label={x.label}><option value="">{x.label}…</option>{(x.intent === 'submit_evidence' ? read.filter(id => !court.submitted.includes(id)) : court.submitted.filter(id => !court.examined.includes(id))).map(id => <option key={id} value={id}>{id} · {c.evidence.find(e => e.id === id)?.title}</option>)}</select>
          : <button key={x.intent} disabled={busy} onClick={() => doAction(x.intent)}>{independent && criminal && x.intent==='final_statement'?'Sudlanuvchining oxirgi so‘zi':x.label}</button>)}
      </div>}
      {notice && <p className="ig-notice" role="status">{notice}</p>}
      {rec.error && <p className="ig-error" role="alert">{rec.error} <button onClick={() => void retry()}>Qayta yuboriş</button></p>}
      <form onSubmit={e => { e.preventDefault(); void send(text); }}>
        <textarea aria-label="Xabar yoki tanilgan nutq (tahrirlaş mumkin)" value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={6000} placeholder={rec.phase === 'listening' ? 'Tinglanmoqda…' : 'Savol bering yoki iltimosnomangizni ayting…'}/>
        <div className="ig-controls-row">
          {rec.phase === 'listening'
            ? <><button type="button" className="ig-rec" onClick={() => void mic()}><span className="ig-dot"/>Töxtatiş · {rec.seconds}s</button><span className="ig-meter" aria-hidden="true"><i style={{ width: `${Math.round(rec.level * 100)}%` }}/></span><button type="button" onClick={cancelRec}>Bekor qiliş</button></>
            : <button type="button" disabled={!voice || busy || rec.phase === 'transcribing'} onClick={() => void mic()} title={voice ? 'VoiceLab orqali özbekça nutqni tanib oliş' : 'Mikrofon uçun VoiceLab kaliti kerak'}><Icon name="mic" size={17}/>{rec.phase === 'transcribing' ? 'Matnga aylantirilmoqda…' : 'Gapiriş'}</button>}
          {rec.mode && <small className="ig-muted">{rec.mode} · matnni tekşiring</small>}
          <button type="submit" className="ig-primary" disabled={busy || rec.phase !== 'idle' || text.trim().length < 2}>{busy ? 'Kutilmoqda…' : 'Yuboriş'}</button>
        </div>
      </form>
    </section> : <div className="ig-controls">{a.role === 'sudya' ? 'Siz sudya örindiğidasiz · siçqonça bilan qarang · ishtirokçini röyxatdan tanlang' : <>{coarse ? 'Joystik · yuriş' : 'W A S D · yuriş  |  Siçqonça · qaraş  |  E'} · {near ? `${nameOf(near)} bilan gaplaşiş` : 'ishtirokçiga yaqinlaşing'}</>}<button onClick={() => setChatOpen(true)}>Suhbatga qaytiş</button></div>}

    {coarse && !chatOpen && a.role !== 'sudya' && <Joystick target={joystick}/>}
    <button className="ig-guide" onClick={() => choose('CH_QONUNAI')}><img src="/assets/characters/qonunai_portrait.png" alt=""/>QonunAI</button>

    {panel && <Modal title={panel === 'sources' ? 'Huquqiy manbalar' : panel === 'decision' ? 'Ökuv qarori loyihasi' : 'Dalillar'} onClose={() => setPanel('')} wide>
      <div className="hb-modal-body">
        {panel === 'sources' && <SourcePanel c={c}/>}
        {panel === 'decision' && <Decision a={a} c={c} court={court} messages={messages} finish={final => {
          persist(live.current.court, live.current.messages, { final, completed: true, mode: 'immersive' }); review();
        }} nameOf={nameOf}/>}
        {panel === 'evidence' && <Evidence c={c} a={a} court={court} ai={ai} busy={busy} markRead={markRead}
          act={(intent, id) => { setPanel(''); doAction(intent, id); }}
          askWitness={id => { setPanel(''); setActor(independent ? 'CH_QONUNAI' : 'CH_WITNESS'); setChatOpen(true); setText(toRevised(`${id} dalili haqida nima deya olasiz? ${c.evidence.find(e => e.id === id)?.title || ''}`)); }}/>}
      </div>
    </Modal>}
  </div>;
}

function Decision({ a, c, court, messages, finish, nameOf }: { a: Attempt; c: CaseFile; court: CourtState; messages: Msg[]; finish: (final: NonNullable<Attempt['final']>) => void; nameOf: (id: string) => string }) {
  const [reason, setReason] = useState('');
  const [position, setPosition] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<string[]>([]);
  const last = messages.filter(m => m.actor === (a.role === 'sudya' ? 'CH_CLERK' : 'CH_JUDGE') && m.who === 'npc').at(-1)?.text;
  return <>
    <p className="hb-help">Bu AI yoki ssenariy tuzgan ÖKUV qarori loyihasi, haqiqiy sud qarori emas. Ökituvçi tekşiruvi talab qilinadi.</p>
    <article className="ig-paper"><h3>{c.title}</h3><p>{last || 'Qaror loyihasi uçun sudyaga murojaat qiling.'}</p>
      <h4>Tekşirilgan dalillar</h4><p>{court.examined.map(id => `${id} · ${c.evidence.find(e => e.id === id)?.title}`).join('; ') || 'yöq'}</p>
      {Object.keys(court.challenged).length > 0 && <><h4>Eʼtirozlar</h4><p>{Object.entries(court.challenged).map(([id, r]) => `${id}: ${r === 'sustained' ? 'qanoatlantirildi' : 'rad etildi'}`).join('; ')}</p></>}
    </article>
    <h3>Jarayon qaydlari</h3>{court.log.map((x, i) => <p key={i} className="ig-logline">{x}</p>)}
    <p className="hb-muted">Sözlaşuvçilar: {[...new Set(messages.filter(m => m.who === 'npc').map(m => nameOf(m.actor)))].join(', ')}</p>
    <form onSubmit={e => { e.preventDefault(); if (court.phase === 'decision' && reason.trim().length >= 100 && position && sources.length && evidence.length) finish({ text: reason.trim(), position, sourceIds: sources, evidenceIds: evidence }); }}>
      <h3>Öz xulosangiz</h3><p>{c.rolePrompts[a.role]?.finalTask}</p>
      <label className="hb-field">Pozitsiyangiz<select aria-label="Sud maşqi yakuniy pozitsiyasi" required value={position} onChange={e => setPosition(e.target.value)}><option value="">Tanlang</option>{(c.independent && a.role==='prokuror' && c.category!=='criminal' ? ['Ishtirok uchun protsessual asos mavjud emas','Qonuniylik bo‘yicha asosli fikr','Qo‘shimcha tekshiruv zarur'] : positions(a.role,c.category === 'criminal')).map(p => <option key={p}>{p}</option>)}</select></label>
      <fieldset><legend>Xulosaga asos bölgan tekşirilgan dalillar</legend>{court.examined.map(id => <label className="hb-checkbox" key={id}><input type="checkbox" checked={evidence.includes(id)} onChange={() => setEvidence(v => v.includes(id) ? v.filter(x => x !== id) : [...v,id])}/>{id} · {c.evidence.find(e => e.id === id)?.title}</label>)}</fieldset>
      <fieldset><legend>Huquqiy asoslar</legend>{c.legalRefs.map(r => <label className="hb-checkbox" key={r.id}><input type="checkbox" checked={sources.includes(r.id)} onChange={() => setSources(v => v.includes(r.id) ? v.filter(id => id !== r.id) : [...v,r.id])}/>{r.label}</label>)}</fieldset>
      <label className="hb-field">Sabablaringiz<textarea aria-label="Sud maşqi yakuniy sabablari" required minLength={100} maxLength={6000} rows={4} value={reason} onChange={e => setReason(e.target.value)}/></label>
      <p className="hb-help">Kamida 100 belgi: dalil, qoida, qarama-qarşi fikr va xulosa. Hisobot şu sud suhbatiga asoslanadi. Ball tayyorgarlik mezonlarini körsatadi; huquqiy töğrilikni ökituvçi tekşiradi.</p>
      <button className="hb-button" disabled={court.phase !== 'decision' || reason.trim().length < 100 || !position || !sources.length || !evidence.length}>Sud maşqini yakunlaş va hisobot</button>
    </form>
  </>;
}

function Evidence({ c, a, court, ai, busy, markRead, act, askWitness }: { c: CaseFile; a: Attempt; court: CourtState; ai: boolean; busy: boolean; markRead: (id: string) => void; act: (intent: string, id: string) => void; askWitness: (id: string) => void }) {
  const [doc, setDoc] = useState(c.evidence[0]?.id);
  const [compare, setCompare] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1); const [rot, setRot] = useState(0);
  const [analysis, setAnalysis] = useState<{ summary: string; contradictions: { text: string; evidenceIds: string[] }[]; consistencies: string[]; gaps: string[]; questionsForWitness: string[]; provider: string; notice?: string } | null>(null);
  const [loading, setLoading] = useState(false); const [err, setErr] = useState('');
  const e = c.evidence.find(x => x.id === doc);
  const state = (id: string) => a.evidence[id] as string | undefined;
  const hearing = ['opening', 'testimony', 'evidence'].includes(court.phase);
  const analyse = async () => {
    setLoading(true); setErr(''); setAnalysis(null);
    try { const r = await fetch('/api/evidence/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, evidenceIds: compare }) }); const j = await r.json(); if (!r.ok) throw Error(j.error); setAnalysis(j); }
    catch (x) { setErr((x as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { setZoom(1); setRot(0); }, [doc]);
  const docView = (x: typeof e) => x && <article className="ig-paper" style={{ transform: `scale(${zoom}) rotate(${rot}deg)` }}>
    <span className="hb-kicker">{x.id} · {evType(x.title)[1]} · ÖKUV HUJJATI</span><h3>{x.title}</h3><p className="hb-document-body">{x.body}</p><p className="hb-help">{x.sourceNote}</p></article>;
  return <div className="ig-evidence">
    <nav aria-label="Dalillar röyxati">{c.evidence.map(x => <div key={x.id} className={'ig-ev-item' + (doc === x.id ? ' active' : '')}>
      <button onClick={() => { setDoc(x.id); markRead(x.id); }}><span className={`ig-ev-icon t-${evType(x.title)[2]}`} aria-hidden="true"/>{x.id} · {x.title}<small>{evType(x.title)[1]} · {evLabel(state(x.id), court.challenged[x.id])}</small></button>
      <label className="ig-compare"><input type="checkbox" checked={compare.includes(x.id)} onChange={() => setCompare(v => v.includes(x.id) ? v.filter(y => y !== x.id) : [...v, x.id].slice(-2))}/>Soliştiriş</label>
    </div>)}</nav>
    <section>
      {compare.length === 2 ? <>
        <div className="ig-compare-grid">{compare.map(id => <div key={id}>{docView(c.evidence.find(x => x.id === id))}</div>)}</div>
        <button className="hb-button" disabled={!ai || loading} onClick={() => void analyse()}>{loading ? 'Tahlil qilinmoqda…' : 'Qarama-qarşiliklarni AI bilan tahlil qiliş'}</button>
        {!ai && <p className="hb-help">AI ulanmagan: hujjatlarni yonma-yon soliştiring va ziddiyatlarni özingiz yozib oling.</p>}
        {err && <p className="ig-error">{err}</p>}
        {analysis && <article className="ig-analysis"><span className="hb-kicker">{analysis.provider} · ÖKITUVÇI TEKŞIRUVI KERAK</span>{analysis.notice && <p className="hb-help">{analysis.notice}</p>}<p>{analysis.summary}</p>
          {analysis.contradictions.length > 0 && <><h4>Qarama-qarşiliklar</h4><ul>{analysis.contradictions.map((x, i) => <li key={i}>{x.text} <small>{x.evidenceIds.join(', ')}</small></li>)}</ul></>}
          {analysis.consistencies.length > 0 && <><h4>Mos keladigan faktlar</h4><ul>{analysis.consistencies.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {analysis.gaps.length > 0 && <><h4>Yetişmayotgan maʼlumot</h4><ul>{analysis.gaps.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {analysis.questionsForWitness.length > 0 && <><h4>Guvohga savollar</h4><ul>{analysis.questionsForWitness.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        </article>}
      </> : e && <>
        <div className="ig-viewer-tools"><button onClick={() => setZoom(z => Math.min(2, z + .2))} aria-label="Kattalaştiriş">＋</button><button onClick={() => setZoom(z => Math.max(.6, z - .2))} aria-label="Kiçraytiriş">－</button>{['photo', 'object'].includes(evType(e.title)[2]) && <button onClick={() => setRot(r => r + 90)} aria-label="Aylantiriş">⟳</button>}<span>{Math.round(zoom * 100)}%</span></div>
        <div className="ig-viewer">{docView(e)}</div>
        <div className="hb-button-row">
          <button className="hb-button hb-secondary" disabled={!!state(e.id)} onClick={() => markRead(e.id)}>Öqib çiqdim</button>
          <button className="hb-button" disabled={busy || !hearing || state(e.id) !== 'read' || court.submitted.includes(e.id)} onClick={() => act('submit_evidence', e.id)}>Sudga taqdim etiş</button>
          <button className="hb-button hb-secondary" disabled={busy || !['opening','testimony','evidence'].includes(court.phase) || !court.submitted.includes(e.id) || court.examined.includes(e.id)} onClick={() => act('examine_evidence', e.id)}>Sudda tekşiriş</button>
          <button className="hb-button hb-secondary" disabled={busy || !hearing} onClick={() => act('objection', e.id)}>Maqbulligiga eʼtiroz</button>
          <button className="hb-button hb-secondary" disabled={!!c.independent || !court.witnessCalled} onClick={() => askWitness(e.id)}>Guvohdan söraş</button>
        </div>
        {!hearing && <p className="hb-help">Taqdim etiş va eʼtiroz majlis oçilgandan keyin mumkin. Öqiş, taqdim etiş va tekşiriş alohida amallar.</p>}
        <p className="hb-help">Ikki dalilni "Soliştiriş" bilan belgilab, ularni yonma-yon körib qarama-qarşiliklarni toping.</p>
      </>}
    </section>
  </div>;
}

function Joystick({ target }: { target: RefObject<{ x: number; y: number }> }) {
  const base = useRef<HTMLDivElement>(null); const [k, setK] = useState({ x: 0, y: 0 });
  const move = (e: RPointerEvent) => {
    const r = base.current!.getBoundingClientRect(); const x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y) || 1, v = { x: l > 1 ? x / l : x, y: l > 1 ? y / l : y }; target.current = v; setK(v);
  };
  const end = () => { target.current = { x: 0, y: 0 }; setK({ x: 0, y: 0 }); };
  return <div ref={base} className="ig-joystick" aria-label="Yuriş joystigi" onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); move(e); }} onPointerMove={e => e.buttons && move(e)} onPointerUp={end} onPointerCancel={end}>
    <i style={{ transform: `translate(${k.x * 34}px, ${k.y * 34}px)` }}/>
  </div>;
}
