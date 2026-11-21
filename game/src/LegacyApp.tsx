import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cancelInspection, choose, closePanel, confirmInspection, dispatch, evaluate, newSession, nodes, restoreSession, saveSession, unmet } from './domain';
import type { Session } from './domain';
import evidenceData from './content/evidence.json';
import legal from './content/legal_registry.json';
import characters from './content/characters.json';
const Scene = lazy(() => import('./Scene'));
const evidence = evidenceData.evidence;
const evidenceById = new Map(evidence.map(e => [e.id, e]));
const people = new Map(characters.characters.map(c => [c.id, c]));
const SAVE_KEY = 'qonunverse-m01-v1';
const phaseNames: Record<string, string> = { preparation: 'Tayyorgarlik', hearing: 'Sud majlisi', evidence_interval: 'Dalillarni to‘ldirish', outcome: 'Hal qiluv qarori', debrief: 'Tahlil', complete: 'Yakunlandi' };
const panelNames: Record<string, string> = { inspection: 'Hujjatni tekshirish', clientEvidence: 'Ish hujjatlari', submitEvidence: 'Dalillarni taqdim etish', examineSubmitted: 'Birgalikda tekshirish', retrieveMissing: 'Yetishmagan hujjatlar', argumentBuilder: 'Yakuniy fikr', sourceCards: 'Huquqiy manbalar', outcomeReasons: 'Qaror asoslari', debrief: 'Mashq tahlili' };
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    scales: <><path d="M12 3v18M5 21h14M4 7h16M6 7l-4 8h8L6 7ZM18 7l-4 8h8l-4-8Z"/></>,
    play: <path d="m9 5 11 7-11 7V5Z"/>, folder: <path d="M3 7V5h7l2 2h9v13H3V7Z"/>,
    book: <><path d="M12 5v16M12 5C8 2 3 4 3 4v15s5-2 9 2c4-4 9-2 9-2V4s-5-2-9 1Z"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, check: <path d="m5 12 4 4L20 5"/>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></>,
    sound: <><path d="m11 4-6 5H2v6h3l6 5V4ZM15 8c3 2 3 6 0 8M18 4c6 4 6 12 0 16"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    person: <><circle cx="12" cy="7" r="4"/><path d="M4 22v-4c0-7 16-7 16 0v4"/></>,
    restart: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></>,
    walk: <><circle cx="14" cy="3" r="2"/><path d="m9 21 3-8 3 3v5M5 11l5-4 4 1 2 4h4M12 8l-2 6-4 3"/></>,
    pin: <><path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    save: <><path d="M4 3h14l3 3v15H3V3h1ZM7 3v6h10V3M7 21v-8h10v8"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.book}</svg>;
}
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
function readSaved(): Session | null { try { const data = localStorage.getItem(SAVE_KEY); return data ? restoreSession(data) : null; } catch { return null; } }
function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a,input,select,textarea,[tabindex="0"]') || []);
      const first = items[0], last = items.at(-1);
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, []);
  return <div className="modal-shade"><div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><header><div><span className="eyebrow">HUQUQBEK / ISH 01</span><h2>{title}</h2></div><button className="icon-button" aria-label="Yopish" onClick={onClose}><Icon name="close"/></button></header>{children}</div></div>;
}
function Sources({ ids }: { ids?: string[] }) {
  return <div className="source-list">{legal.claims.filter(c => !ids || ids.includes(c.id)).map(c => {
    const source = legal.sources.find(s => s.id === c.sourceId)!;
    return <article key={c.id} className="source-card"><div className="eyebrow">{source.title} · {c.article}-modda</div><p>{c.paraphraseUz}</p><div className="fine">Tekshirilgan: {source.checked}. Mahalliy yuridik tahrir kutilmoqda.</div><a href={source.editionUrl} target="_blank" rel="noreferrer">Lex.uz dagi manbani ochish</a></article>;
  })}<p className="fine">Manba ochilmasa ham, yuqoridagi saqlangan matnni o‘qishingiz mumkin.</p></div>;
}
function Findings({ s }: { s: Session }) {
  const result = evaluate(s.case);
  return <><div className="result-banner"><Icon name="scales" size={32}/><div><span className="eyebrow">O‘QUV HOLATI NATIJASI</span><h3>{result.nonterminal ? 'Tekshirish davom etadi' : result.outcome === 'REFUND' ? '2 400 000 so‘mni qaytarish' : 'Tekshirilgan dalillar yetarli emas'}</h3></div></div>{result.findings.map(f => <article className="finding" key={f.issue}><span className={f.established ? 'finding-mark good' : 'finding-mark'}>{f.established ? '✓' : '·'}</span><div><p>{f.textUz}</p><span className="fine">{f.evidence.map(id => evidenceById.get(id)?.titleUz || (id === 'T_PURCHASE' ? 'Xarid haqidagi tan olish' : 'Talab bajarilmagani haqidagi tan olish')).join(' · ')}</span></div></article>)}<p className="fine">{result.limitationUz}</p></>;
}
function EvidencePanel({ s, update, close }: { s: Session; update: (fn: (s: Session) => Session) => void; close: () => void }) {
  const kind = s.modal!.kind;
  const [selected, setSelected] = useState(s.modal?.evidenceId || s.case.owned[0]);
  const [checked, setChecked] = useState<string[]>([]);
  const [zoom, setZoom] = useState(100);
  const [reviewed, setReviewed] = useState(false);
  const [plain, setPlain] = useState(false);
  const [argumentRecord, setArgumentRecord] = useState(s.case.examined[0] || '');
  const [argumentSource, setArgumentSource] = useState('L13');
  const [feedback, setFeedback] = useState('');
  const inspection = kind === 'inspection';
  const list = evidence.filter(e => inspection ? e.id === s.modal?.evidenceId : kind === 'examineSubmitted' ? s.case.submitted.includes(e.id) : kind === 'retrieveMissing' ? e.id === 'E04' || s.case.owned.includes(e.id) : s.case.owned.includes(e.id));
  const item = evidenceById.get(selected) || list[0];
  function event(type: string, id: string) { update(current => dispatch(current, { type, evidenceId: id })); }
  function toggle(id: string) { setChecked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]); }
  const finish = () => update(current => inspection ? confirmInspection(current) : closePanel(current));
  const documentMode = ['inspection', 'clientEvidence', 'submitEvidence', 'examineSubmitted', 'retrieveMissing'].includes(kind);
  return <Dialog title={panelNames[kind]} onClose={close} wide>
    {documentMode ? <><p className="panel-intro">{kind === 'submitEvidence' ? 'Tekshirilgan hujjatlarni sudga taqdim eting. Taqdim etish ularni avtomatik tekshirilgan dalilga aylantirmaydi.' : kind === 'examineSubmitted' ? 'Har bir hujjatni tomonlar bilan birgalikda ko‘rib chiqing va keyin tasdiqlang.' : kind === 'retrieveMissing' ? 'Nusxa oling, so‘ng matnini tekshiring. Sud majlisiga qaytgach uni alohida taqdim etish va tekshirish kerak.' : 'Sana, manba va telefonning seriya raqamini diqqat bilan solishtiring.'}</p>
    <div className="evidence-layout"><nav aria-label="Hujjatlar" className="evidence-list">{list.map(e => <div key={e.id} className={`evidence-row ${item?.id === e.id ? 'active' : ''}`}>{kind === 'submitEvidence' && <input aria-label={`${e.titleUz}ni tanlash`} type="checkbox" disabled={!s.case.inspected.includes(e.id) || s.case.submitted.includes(e.id)} checked={checked.includes(e.id)} onChange={() => toggle(e.id)}/>}<button onClick={() => { setSelected(e.id); setReviewed(false); }}><span className="evidence-id">{e.id}</span><span>{e.titleUz}<small>{s.case.examined.includes(e.id) ? 'Sudda tekshirildi' : s.case.submitted.includes(e.id) ? 'Taqdim etildi' : s.case.inspected.includes(e.id) ? 'O‘qildi' : 'O‘qilmagan'}</small></span></button></div>)}</nav>
    {item ? <article className={`document ${plain ? 'plain' : ''}`}><div className="document-toolbar"><span>{item.id} / O‘quv hujjati</span><div><button onClick={() => setPlain(p => !p)}>{plain ? 'Hujjat ko‘rinishi' : 'Oddiy matn'}</button><select aria-label="Matn kattaligi" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={100}>100%</option><option value={150}>150%</option><option value={200}>200%</option></select></div></div><div className="document-paper" style={{ fontSize: `${zoom}%` }}><div className="document-seal"><Icon name="folder" size={28}/></div><span className="eyebrow">NUQSONLI TELEFON / {item.id}</span><h3>{item.titleUz}</h3><div className="doc-date">Sana: {item.date}</div><p>{item.bodyUz}</p><div className="document-rule"/><p className="fine">O‘quv holati uchun tuzilgan hujjat.</p></div>
    <div className="document-action">{kind === 'retrieveMissing' && !s.case.owned.includes(item.id) ? <button className="primary" onClick={() => event('ACQUIRE', item.id)}>Nusxasini olish</button> : inspection ? <button className="primary" onClick={finish}><Icon name="check"/>O‘qib chiqdim, davom etish</button> : kind === 'examineSubmitted' ? <><p className="fine">Tomonlar hujjatning mazmuni va ishga aloqadorligini muhokama qiladi.{item.id === 'E05' && ' Bu xususiy servis hisoboti, sud tayinlagan ekspert xulosasi emas.'}{item.id === 'E07' && ' Varaqdagi QV26-0481 boshqa telefonga tegishli; bu farqning o‘zi nuqsonni isbotlamaydi.'}</p><label className="review-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>Hujjat va uning chegaralari bilan tanishdim</label><button className="primary" disabled={!reviewed || s.case.examined.includes(item.id)} onClick={() => event('EXAMINE', item.id)}>{s.case.examined.includes(item.id) ? 'Tekshirildi' : 'Sudda tekshirilgan deb qayd etish'}</button></> : <button className="primary" disabled={s.case.inspected.includes(item.id)} onClick={() => event('INSPECT', item.id)}>{s.case.inspected.includes(item.id) ? 'O‘qilgan deb qayd etilgan' : 'O‘qib chiqdim'}</button>}</div></article> : <div className="empty-state">Hozircha taqdim etilgan hujjatlar yo‘q.</div>}</div>
    {!inspection && <footer className="panel-footer"><span className="fine">{s.case.inspected.length} o‘qilgan · {s.case.submitted.length} taqdim etilgan · {s.case.examined.length} sudda tekshirilgan</span>{kind === 'submitEvidence' ? <button className="primary" onClick={() => { update(current => { let next = current; for (const id of checked) next = dispatch(next, { type: 'SUBMIT', evidenceId: id }); return closePanel(next); }); }}>Tanlanganlarni taqdim etish ({checked.length})</button> : <button className="primary" onClick={finish}>Davom etish</button>}</footer>}</> : kind === 'sourceCards' ? <div className="panel-scroll"><Sources ids={s.modal?.claims}/><button className="primary" onClick={finish}>Suhbatga qaytish</button></div> : kind === 'argumentBuilder' ? <div className="panel-scroll"><p className="panel-intro">Tekshirilgan fakt, hujjat va huquqiy manbani bog‘lang. Oddiy tilda fikr bildirish ham mumkin.</p><div className="argument-grid"><label>Tekshirilgan hujjat<select value={argumentRecord} onChange={e => setArgumentRecord(e.target.value)}>{s.case.examined.map(id => <option key={id} value={id}>{evidenceById.get(id)?.titleUz}</option>)}</select></label><label>Huquqiy manba<select value={argumentSource} onChange={e => setArgumentSource(e.target.value)}>{legal.claims.map(c => <option key={c.id} value={c.id}>{c.id} · {c.article}-modda</option>)}</select></label></div><Sources ids={[argumentSource]}/><textarea aria-label="Yakuniy fikr" placeholder="Tekshirilgan dalillar va mijozning pulni qaytarish talabi haqida fikringiz..." rows={4}/><p className="fine">Talab: shartnomani bekor qilish, telefonni qaytarish va 2 400 000 so‘mni qaytarib olish.</p>{feedback && <p className="inline-message" role="status">{feedback}</p>}<div className="button-row"><button className="secondary" onClick={() => setFeedback(`${evidenceById.get(argumentRecord)?.titleUz || 'Tanlangan yozuv'}ni manbaning yuqoridagi mazmuni bilan solishtiring. Hujjat ishning qaysi faktini asoslayotganini tushuntiring.`)}>Bog‘lanishni ko‘rib chiqish</button><button className="primary" onClick={finish}>Oddiy tilda yakuniy fikr bildirish</button></div></div> : <div className="panel-scroll"><Findings s={s}/>{kind === 'debrief' && <><h3>Sudda tekshirilgan yozuv</h3><p>{s.case.examined.map(id => evidenceById.get(id)?.titleUz).join(' · ')}</p><p className="fine">Yordamdan foydalanish natijani o‘zgartirmaydi. Qayta o‘ynash sud majlisi boshlanishidagi alohida nusxadan boshlanadi; avvalgi bilim sizda qoladi.</p></>}<button className="primary" onClick={finish}>Davom etish</button></div>}
  </Dialog>;
}
export default function App() {
  const [session, setSession] = useState<Session>(() => readSaved() || newSession());
  const [hasSave, setHasSave] = useState(() => !!readSaved());
  const [screen, setScreen] = useState<'menu' | 'roles' | 'game'>('menu');
  const [role, setRole] = useState('Advokat');
  const [overlay, setOverlay] = useState<string | null>(null);
  const [dialogueVisible, setDialogueVisible] = useState(true);
  const [textOnly, setTextOnly] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [quality, setQuality] = useState('balanced');
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [seated, setSeated] = useState(false);
  const [voice, setVoice] = useState(false);
  const [uzVoice, setUzVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [notice, setNotice] = useState('');
  const [near, setNear] = useState('');
  const node = nodes.get(session.case.nodeId)!;
  const blocked = screen !== 'game' || !!session.modal || !!overlay || dialogueVisible || session.completed;
  const speaker = people.get(node.speaker);
  function update(fn: (s: Session) => Session) {
    setSession(current => { try { return fn(current); } catch (e) { setNotice(e instanceof Error ? e.message : 'Amal bajarilmadi'); return current; } });
  }
  useEffect(() => { if (screen === 'game') { try { localStorage.setItem(SAVE_KEY, saveSession(session)); setHasSave(true); } catch { setNotice('Brauzer saqlash joyi mavjud emas. Mashqni davom ettirishingiz mumkin.'); } } }, [session, screen]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const refresh = () => setUzVoice(speechSynthesis.getVoices().find(v => /^uz([-_]|$)/i.test(v.lang)) || null);
    refresh(); speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    if (voice && uzVoice && screen === 'game' && dialogueVisible && !session.modal && !overlay && !session.completed) { const line = new SpeechSynthesisUtterance(node.textUz); line.voice = uzVoice; line.lang = uzVoice.lang; line.rate = .92; speechSynthesis.speak(line); }
    return () => speechSynthesis.cancel();
  }, [node.id, voice, uzVoice, screen, dialogueVisible, session.modal, overlay, session.completed]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && screen === 'game' && !session.modal && !overlay) { setOverlay('settings'); }
      if (event.code === 'KeyE' && screen === 'game' && !session.modal && !overlay && !dialogueVisible) { setDialogueVisible(true); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [screen, session.modal, overlay, dialogueVisible]);
  function select(choiceId: string) { update(s => choose(s, node.id, choiceId)); }
  function directModal(kind: string) { update(s => ({ ...s, modal: { kind }, pending: null })); }
  function closeMissionPanel() { update(s => s.modal?.kind === 'inspection' ? cancelInspection(s) : closePanel(s)); }
  function start() { if (role !== 'Advokat') { setOverlay('roleIntro'); return; } setSession(newSession()); setDialogueVisible(true); setScreen('game'); }
  function interact(id: string) {
    if (session.case.nodeId === 'N020') {
      const targets: Record<string, string> = { CH_PLAINTIFF: 'client', CH_RESPONDENT: 'respondent', CH_CLERK: 'clerk', CH_SECURITY: 'public', CH_QONUNAI: 'hint' };
      if (targets[id]) update(s => choose(s, 'N020', targets[id]));
    }
    setDialogueVisible(true);
  }
  const stageIndex = ['preparation', 'hearing', 'outcome', 'debrief', 'complete'].indexOf(session.case.phase);
  return <main className={`app ${reduced ? 'reduced' : ''} ${textOnly ? 'text-mode' : ''}`}>
    <div className="world" style={{ backgroundImage: 'url(/courtroom-preview.png)' }}>
      {!textOnly && <SceneBoundary key={sceneKey} onFailure={() => setSceneFailed(true)}><Suspense fallback={<div className="scene-loading"><span/>Sud zali yuklanmoqda...</div>}><Scene screen={screen} session={session} blocked={blocked} seated={seated} quality={quality} reduced={reduced} onInteract={interact} onNear={setNear} onFailure={() => { setSceneFailed(true); setTextOnly(true); }}/></Suspense></SceneBoundary>}
    </div>
    <div className="scene-vignette"/>
    <header className="topbar"><button className="brand" onClick={() => setScreen('menu')} aria-label="Bosh menyu"><span className="brand-symbol"><img src="/brand/huquqbek-courthouse.svg" width="36" height="36" alt=""/></span><span>Huquq<span className="brand-accent">Bek</span><small>INTERAKTIV SUD SIMULYATORI</small></span></button><div className="top-meta"><span className="language">O‘ZBEKCHA</span><span className="edition">BIRINCHI ISH · FUQAROLIK SUDI</span><button className="icon-button" aria-label="Sozlamalar" onClick={() => setOverlay('settings')}><Icon name="settings"/></button></div></header>
    {screen === 'menu' && <><div className="menu-gradient"/><section className="welcome"><div className="eyebrow"><span className="gold-line"/>HUQUQNI TAJRIBA ORQALI O‘RGANING</div><h1>Sud zalida.<br/><em>Qaror oldida.</em></h1><p>Dalillarni o‘rganing. Savol bering. Huquqiy fikringizni bildiring. O‘zbek tilidagi interaktiv sud tajribasiga kiring.</p><div className="menu-actions"><button className="primary large" onClick={() => setScreen('roles')}><Icon name="play"/>Tajribani boshlash</button>{hasSave && <button className="secondary" onClick={() => { setScreen('game'); setDialogueVisible(true); }}>Saqlangan mashqni davom ettirish</button>}</div><div className="menu-facts"><span><Icon name="person"/>Sizning rolingiz: Advokat</span><span><Icon name="folder"/>Bir ish. Bir nechta yo‘l.</span></div></section><div className="room-caption"><span className="caption-line"/><div><span className="eyebrow">HUQUQBEK SUD ZALI</span><p>Har bir dalilning o‘z o‘rni bor.</p></div></div><footer className="menu-footer"><span>O‘quv simulyatsiyasi · Mahalliy ishlab chiqish talqini</span><button onClick={() => setOverlay('about')}>Loyiha haqida</button></footer></>}
    {screen === 'roles' && <section className="role-screen"><span className="eyebrow">SUD ZALIDAGI O‘RNINGIZ</span><h1>Kim bo‘lib qatnashasiz?</h1><p>Birinchi to‘liq mashq — Advokat roli uchun.</p><div className="roles">{[['Sudya', 'Jarayonni boshqaring va dalillarni baholang.', 'scales'], ['Advokat', 'Dilnozaning manfaatlarini himoya qiling.', 'folder'], ['Prokuror', 'Kelgusi jinoyat ishlari uchun rol.', 'book'], ['Fuqaro', 'Huquqlaringizni va jarayonni o‘rganing.', 'person']].map(([name, description, icon]) => <button key={name} className={`role-card ${role === name ? 'selected' : ''}`} onClick={() => setRole(name)} aria-pressed={role === name}><Icon name={icon} size={32}/><span className="role-number">{name === 'Advokat' ? 'MASHQ MAVJUD' : 'KIRISH'}</span><h2>{name}</h2><p>{description}</p>{name === 'Advokat' && <span className="role-character">Madina Karimova</span>}</button>)}</div><div className="role-bottom"><button className="secondary" onClick={() => setScreen('menu')}>Menyuga qaytish</button><button className="primary large" onClick={start}>{role === 'Advokat' ? 'Ishni boshlash' : 'Rol bilan tanishish'}<Icon name="play"/></button></div></section>}
    {screen === 'game' && <><aside className="case-card"><div className="eyebrow">ISH 01 / FUQAROLIK NIZOSI</div><h2>Nuqsonli telefon</h2><p>Dilnoza Saidova va Navro‘z Mobil MChJ</p><div className="case-divider"/><span className="objective-label">HOZIRGI BOSQICH</span><strong>{phaseNames[session.case.phase]}</strong><div className="chapter-progress">{['Tayyorgarlik', 'Majlis', 'Qaror', 'Tahlil'].map((label, i) => <span key={label} className={i <= Math.max(stageIndex, 0) ? 'done' : ''} title={label}/>)}</div><div className="case-count"><span>Tekshirilgan dalillar</span><span>{session.case.examined.length} / 10</span></div>{session.branch > 0 && <p className="replay-note">Qayta o‘ynash · alohida yozuv. Avvalgi bilim sizda qoladi.</p>}</aside>
    <nav className="game-tools" aria-label="O‘yin vositalari"><button onClick={() => directModal('clientEvidence')}><Icon name="folder"/><span>Hujjatlar</span><kbd>01</kbd></button><button onClick={() => directModal('sourceCards')}><Icon name="book"/><span>Manbalar</span><kbd>02</kbd></button><button onClick={() => setOverlay('history')}><Icon name="save"/><span>Suhbat tarixi</span></button><button onClick={() => { setDialogueVisible(d => !d); }}><Icon name={dialogueVisible ? 'walk' : 'person'}/><span>{dialogueVisible ? 'Zalda yurish' : 'Suhbatga qaytish'}</span></button></nav>
    {!dialogueVisible && !session.completed && <div className="movement-help"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>Yurish</span><span>Sichqonchani bosib burang</span><span><kbd>E</kbd>{near ? 'Gaplashish' : 'Suhbatga qaytish'}</span><button onClick={() => setDialogueVisible(true)}>O‘tirgan holda davom etish</button></div>}
    {(dialogueVisible || textOnly || seated) && !session.completed && <section className="dialogue" aria-label="Suhbat" data-node-id={node.id}><div className="speaker-rail"><div className="speaker-badge">{node.speaker === 'CH_QONUNAI' ? <img src="/assets/characters/qonunai_portrait.png" alt="QonunAI"/> : <Icon name={node.speaker === 'CH_JUDGE' ? 'scales' : node.speaker === 'SYSTEM' ? 'folder' : 'person'} size={26}/>}</div><div><span className="eyebrow">{speaker?.roleUz || 'ISH JARAYONI'}</span><h3>{speaker?.name || 'Sudga tayyorgarlik'}</h3></div><button className="icon-button dialogue-hide" aria-label="Suhbatni vaqtincha yopish" onClick={() => setDialogueVisible(false)}><Icon name="close"/></button></div><p className="dialogue-text" key={node.id}>{node.textUz}</p><div className={`choices ${node.choices.length > 4 ? 'many' : ''}`}>{node.choices.map((c, i) => { const missing = unmet(session.case, c); return <div key={`${node.id}:${c.id}`}><button data-choice-id={c.id} disabled={!!missing.length} onClick={() => select(c.id)}><span className="choice-index">{String(i + 1).padStart(2, '0')}</span>{c.textUz}</button>{missing.length > 0 && <small>Avval hujjatlarni o‘qing: {missing.map(r => evidenceById.get(r.split(':')[1])?.titleUz || r).join(', ')}. <button onClick={() => directModal('clientEvidence')}>Papka</button></small>}</div>; })}</div>{node.sourceClaimIds.length > 0 && <button className="source-link" onClick={() => update(s => ({ ...s, modal: { kind: 'sourceCards', claims: node.sourceClaimIds }, pending: null }))}><Icon name="book" size={14}/>Ushbu suhbatning huquqiy manbalari</button>}</section>}
    <button className="companion-chip" onClick={() => setOverlay('hint')}><img src="/assets/characters/qonunai_portrait.png" alt=""/><span>QonunAI<small>Ixtiyoriy yordam</small></span></button>
    {session.completed && <section className="completion"><span className="eyebrow">BIRINCHI ISH YAKUNLANDI</span><h1>Har bir qaror<br/><em>dalildan boshlanadi.</em></h1><p>Mashqni yakunladingiz. Qaysi dalillar natijaga ta’sir qilganini yana ko‘rib chiqishingiz mumkin.</p><div className="button-row"><button className="primary" onClick={() => directModal('outcomeReasons')}>Qaror asoslari</button><button className="secondary" onClick={() => { setSession(newSession()); setDialogueVisible(true); }}>Yangi mashq</button><button className="secondary" onClick={() => setScreen('menu')}>Bosh menyu</button></div></section>}
    <div className="game-footnote">O‘quv holati · Jarayon moslashtirilgan</div></>}
    {notice && <div className="notice" role="status">{notice}<button aria-label="Xabarni yopish" onClick={() => setNotice('')}><Icon name="close" size={16}/></button></div>}
    {sceneFailed && !overlay && <button className="scene-recovery" onClick={() => setOverlay('settings')}>3D yuklanmadi. Matnli mashq mavjud. Sozlamalar</button>}
    {session.modal && <EvidencePanel key={`${session.modal.kind}:${session.modal.evidenceId || ''}:${session.pending?.target || ''}`} s={session} update={update} close={closeMissionPanel}/>}
    {overlay === 'settings' && <Dialog title="Sozlamalar va pauza" onClose={() => setOverlay(null)}><div className="settings"><label>Grafika<select value={quality} onChange={e => setQuality(e.target.value)}><option value="balanced">Muvozanatli</option><option value="low">Yengil</option><option value="high">Yuqori</option></select></label><label>Harakatni kamaytirish<input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label><label>O‘tirgan holda boshqarish<input type="checkbox" checked={seated} onChange={e => setSeated(e.target.checked)}/></label><label>Matnli rejim<input type="checkbox" checked={textOnly} onChange={e => { setTextOnly(e.target.checked); setDialogueVisible(true); }}/></label><label>Brauzerning o‘zbekcha ovozi<input type="checkbox" checked={voice} disabled={!uzVoice} onChange={e => setVoice(e.target.checked)}/></label><p className="fine">{uzVoice ? `Mavjud ovoz: ${uzVoice.name}. Bu studiya yozuvi emas.` : 'O‘zbekcha brauzer ovozi topilmadi. Barcha suhbatlar matnda mavjud.'}</p><p className="fine">WASD — yurish · Shift — tez yurish · E — suhbat · Esc — pauza. Polga bosish — borish. Sichqonchani bosib surish — kamera.</p>{sceneFailed && <button className="secondary" onClick={() => { setSceneFailed(false); setSceneKey(k => k + 1); setTextOnly(false); setOverlay(null); }}>3D sahnani qayta yuklash</button>}<button className="primary" onClick={() => setOverlay(null)}>Davom etish</button></div></Dialog>}
    {overlay === 'history' && <Dialog title="Suhbat tarixi" onClose={() => setOverlay(null)}><div className="panel-scroll">{session.history.map((id, i) => { const n = nodes.get(id)!; return <article className="history-entry" key={`${i}:${id}`}><span className="eyebrow">{people.get(n.speaker)?.name || 'Jarayon'}</span><p>{n.textUz}</p></article>; })}</div></Dialog>}
    {overlay === 'hint' && <Dialog title="QonunAI yordami" onClose={() => setOverlay(null)}><div className="panel-scroll"><p>Hujjatni olish, o‘qish, sudga taqdim etish va sudda tekshirish — alohida bosqichlar. Telefon raqamlarini va sanalarni solishtiring.</p><p>Agar muhim hujjat yetishmasa, suddan uni olishga yordam yoki dalillarni to‘ldirish uchun tanaffus so‘rashingiz mumkin. Yordamdan foydalanish natijaga ta’sir qilmaydi.</p><button className="primary" onClick={() => setOverlay(null)}>Tushunarli</button></div></Dialog>}
    {overlay === 'roleIntro' && <Dialog title={`${role} roli`} onClose={() => setOverlay(null)}><div className="panel-scroll"><p>{role === 'Sudya' ? 'Sudya tomonlarni tinglaydi, jarayonni boshqaradi va barcha tegishli dalillarni baholaydi.' : role === 'Prokuror' ? 'Prokuror roli kelgusi vazifalar uchun rejalashtirilgan. Bu fuqarolik iste’molchi ishida prokuror qatnashmaydi.' : 'Fuqaro roli sud jarayonidagi huquq va majburiyatlarni o‘rganishga qaratilgan.'}</p><p>Bu rol uchun to‘liq missiya hali ishlab chiqilmagan. Hozir Advokat sifatida Nuqsonli telefon ishini o‘ynashingiz mumkin.</p><button className="primary" onClick={() => { setRole('Advokat'); setOverlay(null); }}>Advokat rolini tanlash</button></div></Dialog>}
    {overlay === 'about' && <Dialog title="HuquqBek haqida" onClose={() => setOverlay(null)}><div className="panel-scroll"><p>O‘zbek tilidagi 3D fuqarolik sudi mashqi. Birinchi ish: Madina Karimova Dilnoza Saidovaning nuqsonli telefoni bo‘yicha manfaatlarini himoya qiladi.</p><p>Bu mahalliy ishlab chiqish talqini. Odamlar dastlabki modellar; kiyim, rasmiy ramzlar va ovozlar bo‘yicha ish davom etadi. Huquqiy matnlar mahalliy mutaxassis tahririni kutmoqda.</p></div></Dialog>}
  </main>;
}
