import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { api } from './services';
import { Icon, Modal } from './ui';
import { LEVEL_NAME, LEVEL_ORDER, ROLE_META, ROLE_ORDER, STATE_LABEL, attemptsText } from './commerceTypes';
import type { Eligibility, ExamAttempt, ExamLevel, ExamSlot, Pricing, Role, Rules } from './commerceTypes';
import { CountUp, Magnet, ScrollReveal, SplitText } from './vendor/react-bits/Effects';
import './exams.css';

type ApiErr = Error & { code?: string; status?: number };
const go = (path: string) => { location.hash = '/' + path; };

/* =============================== HUB =============================== */
export function ExamHub() {
  const [data, setData] = useState<Eligibility | null>(null), [pricing, setPricing] = useState<Pricing | null>(null), [error, setError] = useState('');
  useEffect(() => { void Promise.all([api<Eligibility>('/api/learning/exams/eligibility'), api<Pricing>('/api/learning/pricing')]).then(([e, p]) => { setData(e); setPricing(p); }).catch(e => setError(e.message)); }, []);
  if (error) return <section className="case-panel" role="alert">{error}</section>;
  if (!data || !pricing) return <section className="case-panel" aria-busy="true"><p className="case-muted">Imtihon ma’lumotlari yuklanmoqda…</p></section>;
  const price = (r: Role, l: ExamLevel) => pricing.packages.find(p => p.role === r && p.levels.length === 1 && p.levels[0] === l)?.display;
  return <div className="case-page exam-hub">
    <header className="case-heading" data-stamp="Imtihon rejimi">
      <span className="case-docket">HUQUQBEK · SERTIFIKATLASH IMTIHONLARI</span>
      <h1><SplitText text="Sud zaliga kirishdan oldin — imtihon." /></h1>
      <p>Har bir rol va daraja uchun alohida imtihon: {data.rules.questions} ta test savoli ({data.rules.testMinutes} daqiqa) va {data.rules.cases} ta amaliy holat ({data.rules.caseMinutes} daqiqa, jami). O‘tish bali — {data.rules.pass}/{data.rules.max}. Kamera butun imtihon davomida yoqilgan bo‘lishi shart.</p>
    </header>
    <section className="exam-facts" aria-label="Imtihon tuzilmasi">
      <div><b><CountUp to={data.rules.questions} /></b><span>test savoli · 1 balldan</span></div>
      <div><b><CountUp to={data.rules.cases} /></b><span>amaliy holat · 25 balldan</span></div>
      <div><b><CountUp to={120} /></b><span>daqiqa · ikki bo‘lim</span></div>
      <div><b><CountUp to={data.rules.pass} /></b><span>/100 · o‘tish bali</span></div>
    </section>
    <IdentityStrip data={data} />
    {data.dev && <div className="case-banner-note"><Icon name="settings" size={18} /><span><b>Ishlab chiqish rejimi.</b> Tasdiqlangan savollar banki tayyor bo‘lmagan darajalar o‘quv dasturidagi savollardan iborat sinov bankida ishlaydi va ularning sertifikatlari “DEV” bilan belgilanadi, haqiqiy emas.</span></div>}
    {ROLE_ORDER.map(role => <section key={role} className="exam-role" style={{ ['--role' as string]: ROLE_META[role].color }} aria-labelledby={'exam-' + role}>
      <div className="exam-role-head"><i /><h2 id={'exam-' + role}>{ROLE_META[role].name}</h2><span className="case-docket">3 daraja · har biri alohida paket</span></div>
      <ScrollReveal className="exam-dossiers">
        {LEVEL_ORDER.map(level => <Dossier key={level} slot={data.exams[`${role}:${level}`]} price={price(role, level)} />)}
      </ScrollReveal>
    </section>)}
    <p className="case-muted exam-fineprint">Premium obuna imtihonni ochmaydi; imtihon faqat shu rol va daraja paketini xarid qilganlarga. To‘lov, qoidalarni o‘qish yoki kamera tekshiruvi urinishni sarflamaydi — urinish faqat “Imtihonni boshlash” bosilganda bir marta hisoblanadi.</p>
  </div>;
}

function IdentityStrip({ data }: { data: Eligibility }) {
  const s = data.identity.status;
  return <div className={'case-banner-note ' + (s === 'verified' ? '' : s === 'rejected' ? 'danger' : 'warn')}>
    <Icon name={s === 'verified' ? 'check' : 'users'} size={18} />
    <span><b>Shaxsni tasdiqlash: </b>{s === 'verified' ? `tasdiqlangan (${data.identity.method === 'dev_attestation' ? 'sinov rejimi' : 'qo‘lda tekshiruv'})` : s === 'pending' ? 'tekshiruvda — administrator tasdiqlashi kutilmoqda' : s === 'rejected' ? 'rad etilgan. Profil ma’lumotlarini tekshirib qayta yuboring.' : data.identityMethod ? 'hali yuborilmagan. Imtihon sahifasida rozilik bilan yuborasiz.' : 'Shaxsni tasdiqlash sozlanmagan. Imtihonni boshlash hozircha bloklangan.'}</span>
  </div>;
}

function Dossier({ slot, price }: { slot: ExamSlot; price?: string }) {
  const label = STATE_LABEL[slot.state], meta = ROLE_META[slot.role];
  const enter = slot.owned || slot.credits.remaining > 0;
  return <article className={'exam-dossier state-' + slot.state} data-academy-card>
    <div className="dossier-tab">{LEVEL_NAME[slot.level].toUpperCase()}</div>
    <div className="case-spread"><span className="case-docket">ISH № {meta.name.slice(0, 3).toUpperCase()}-{slot.level.slice(0, 1).toUpperCase()}</span><span className={'case-stamp ' + label.tone}>{label.text}</span></div>
    <h3>{meta.name} · {LEVEL_NAME[slot.level]}</h3>
    <dl className="case-kv">
      <dt>Paket</dt><dd>{slot.owned ? 'Xarid qilingan' : 'Yo‘q · ' + (price || '')}</dd>
      <dt>Urinish</dt><dd>{slot.owned || slot.credits.purchases ? attemptsText(slot.credits) : '—'}</dd>
      {slot.lastAttempt && <><dt>Oxirgi</dt><dd>{slot.lastAttempt.finalScore ?? '—'}/100 · {slot.lastAttempt.status}</dd></>}
      <dt>Materiallar</dt><dd>{slot.material.mode === 'certified' ? 'Tasdiqlangan bank' : slot.material.mode === 'practice' ? 'Sinov banki (DEV)' : `Tayyor emas · ${slot.material.reviewedQuestions}/50`}</dd>
    </dl>
    <div className="dossier-actions">
      {slot.state === 'passed_ready' || slot.state === 'issued' ? <button className="learn-primary" onClick={() => go(`certificates/${slot.role}/${slot.level}`)}>Sertifikat<Icon name="star" size={15} /></button>
        : enter ? <button className="learn-primary" onClick={() => go(`exam/${slot.role}/${slot.level}`)}>{slot.state === 'in_progress' ? 'Imtihonni davom ettirish' : slot.credits.remaining ? 'Imtihonga kirish' : 'Holatni ko‘rish'}<Icon name="play" size={15} /></button>
          : <button className="case-button-sand" onClick={() => go('pricing/' + slot.role)}>Paket · {price}</button>}
    </div>
  </article>;
}

/* =============================== CAMERA =============================== */
interface CameraState { status: 'off' | 'starting' | 'active' | 'lost' | 'denied' | 'unsupported'; message: string }
function useCamera() {
  const [state, setState] = useState<CameraState>({ status: typeof navigator !== 'undefined' && 'mediaDevices' in navigator ? 'off' : 'unsupported', message: '' });
  const stream = useRef<MediaStream | null>(null), video = useRef<HTMLVideoElement | null>(null), frames = useRef(0);
  const listeners = useRef(new Set<(active: boolean) => void>());
  const emit = (active: boolean) => listeners.current.forEach(f => f(active));
  const attach = useCallback((el: HTMLVideoElement | null) => { video.current = el; if (el && stream.current && el.srcObject !== stream.current) { el.srcObject = stream.current; void el.play().catch(() => {}); } }, []);
  const start = useCallback(async () => {
    if (!('mediaDevices' in navigator)) { setState({ status: 'unsupported', message: 'Bu brauzer kamerani qo‘llamaydi. Kompyuterda Chrome, Edge yoki Firefox’dan foydalaning.' }); return; }
    setState({ status: 'starting', message: '' });
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      stream.current?.getTracks().forEach(t => t.stop());
      stream.current = s; frames.current = 0;
      const track = s.getVideoTracks()[0];
      track.addEventListener('ended', () => { setState({ status: 'lost', message: 'Kamera uzildi.' }); emit(false); });
      track.addEventListener('mute', () => { setState({ status: 'lost', message: 'Kamera tasviri to‘xtadi.' }); emit(false); });
      track.addEventListener('unmute', () => { setState({ status: 'active', message: '' }); emit(true); });
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setState({ status: 'active', message: '' }); emit(true);
    } catch (e) {
      const name = (e as DOMException).name;
      setState({ status: 'denied', message: name === 'NotAllowedError' ? 'Kameraga ruxsat berilmadi. Brauzer manzil satridagi kamera belgisidan ruxsat bering.' : name === 'NotFoundError' ? 'Kamera topilmadi.' : 'Kamerani yoqib bo‘lmadi.' });
    }
  }, []);
  const stop = useCallback(() => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setState(s => ({ ...s, status: 'off' })); }, []);
  /** Wait for real decoded frames (not just a permission grant). */
  const measure = useCallback(async () => {
    const v = video.current, track = stream.current?.getVideoTracks()[0];
    if (!v || !track) return null;
    let count = 0;
    const deadline = performance.now() + 2500;
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.bind(v);
    while (count < 5 && performance.now() < deadline) {
      await new Promise<void>(res => rvfc ? rvfc(() => res()) : setTimeout(res, 120));
      if (v.videoWidth > 0 && v.readyState >= 2) count++;
    }
    return { width: v.videoWidth, height: v.videoHeight, frames: count, liveTrack: track.readyState === 'live' && !track.muted };
  }, []);
  const isActive = () => { const t = stream.current?.getVideoTracks()[0]; return !!t && t.readyState === 'live' && !t.muted && (video.current?.videoWidth || 0) > 0; };
  useEffect(() => () => stream.current?.getTracks().forEach(t => t.stop()), []);
  return { state, start, stop, attach, measure, isActive, onChange: (f: (a: boolean) => void) => { listeners.current.add(f); return () => listeners.current.delete(f); } };
}
type Camera = ReturnType<typeof useCamera>;

function CameraDock({ camera, floating }: { camera: Camera; floating?: boolean }) {
  const s = camera.state.status;
  return <figure className={'camera-dock ' + (floating ? 'floating ' : '') + s} aria-live="polite">
    <video ref={camera.attach} muted playsInline autoPlay aria-label="Kamera ko‘rinishi (faqat sizda ko‘rinadi)" />
    {s !== 'active' && <div className="camera-off"><Icon name="close" size={22} /></div>}
    <figcaption><span className="rec-dot" />{s === 'active' ? 'Kamera faol' : s === 'starting' ? 'Yoqilmoqda…' : s === 'lost' ? 'Kamera uzildi' : s === 'denied' ? 'Ruxsat yo‘q' : 'Kamera o‘chiq'}</figcaption>
  </figure>;
}

/* =============================== TIMER =============================== */
function useServerClock(serverNow?: string) {
  const offset = useRef(0);
  useEffect(() => { if (serverNow) offset.current = Date.parse(serverNow) - Date.now(); }, [serverNow]);
  return () => Date.now() + offset.current;
}
function Countdown({ endsAt, now, onExpire, label }: { endsAt: string; now: () => number; onExpire: () => void; label: string }) {
  const [left, setLeft] = useState(() => Math.max(0, Date.parse(endsAt) - now()));
  const fired = useRef(false), warned = useRef<Set<number>>(new Set());
  useEffect(() => {
    fired.current = false;
    const id = setInterval(() => {
      const l = Math.max(0, Date.parse(endsAt) - now()); setLeft(l);
      if (l === 0 && !fired.current) { fired.current = true; onExpire(); }
    }, 250);
    return () => clearInterval(id);
  }, [endsAt, now, onExpire]);
  const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
  const warn = left < 5 * 60000;
  useEffect(() => { for (const mark of [5, 1]) if (left < mark * 60000 && left > 0 && !warned.current.has(mark)) { warned.current.add(mark); } }, [left]);
  return <div className={'exam-clock' + (warn ? ' warn' : '') + (left < 60000 ? ' critical' : '')} role="timer" aria-label={`${label}: ${m} daqiqa ${s} soniya qoldi`}>
    <Icon name="clock" size={17} /><span>{label}</span><b>{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</b>
    {warn && <span className="sr-only" aria-live="assertive">{left < 60000 ? '1 daqiqadan kam vaqt qoldi' : '5 daqiqadan kam vaqt qoldi'}</span>}
  </div>;
}

/* =============================== EXAM MODE =============================== */
type Step = 'overview' | 'identity' | 'rules' | 'camera' | 'start';
export function ExamMode({ role, level, profileName, notify, onLiveChange }: { role: Role; level: ExamLevel; profileName: string; notify: (s: string) => void; onLiveChange: (live: boolean) => void }) {
  const [rules, setRules] = useState<Rules | null>(null), [elig, setElig] = useState<Eligibility | null>(null), [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [step, setStep] = useState<Step>('overview'), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const camera = useCamera();
  const meta = ROLE_META[role];
  const live = !!attempt && ['TEST_IN_PROGRESS', 'CASES_IN_PROGRESS'].includes(attempt.status);
  useEffect(() => { onLiveChange(live); return () => onLiveChange(false); }, [live, onLiveChange]);

  const load = useCallback(async () => {
    try {
      const [r, e] = await Promise.all([api<Rules>(`/api/learning/exams/${role}/${level}/rules`), api<Eligibility>('/api/learning/exams/eligibility')]);
      setRules(r); setElig(e);
      const slot = e.exams[`${role}:${level}`];
      const id = slot.activeAttemptId || (slot.lastAttempt && ['REVIEW_REQUIRED', 'PASSED', 'FAILED', 'DISQUALIFIED'].includes(slot.lastAttempt.status) && sessionStorageGet('hb-exam-last') === slot.lastAttempt.id ? slot.lastAttempt.id : null);
      if (id) setAttempt(await api<ExamAttempt>('/api/learning/exam-attempts/' + id));
    } catch (e) { setError((e as Error).message); }
  }, [role, level]);
  useEffect(() => { void load(); }, [load]);

  const act = async <T,>(key: string, fn: () => Promise<T>) => { setBusy(key); try { return await fn(); } catch (e) { const err = e as ApiErr; notify(err.message); if (err.code === 'IDENTITY_REQUIRED') setStep('identity'); if (err.code === 'RULES_REQUIRED') setStep('rules'); if (err.code === 'CAMERA_REQUIRED' && !live) setStep('camera'); return null; } finally { setBusy(''); } };

  if (error) return <section className="case-panel" role="alert"><p>{error}</p><button onClick={() => go('exams')}>Imtihonlar ro‘yxatiga</button></section>;
  if (!rules || !elig) return <section className="case-panel" aria-busy="true"><p className="case-muted">Imtihon holati yuklanmoqda…</p></section>;
  const slot = elig.exams[`${role}:${level}`];

  if (attempt) return <div className="exam-shell" style={{ ['--role' as string]: meta.color }}>
    <ExamHeader attempt={attempt} camera={camera} />
    {attempt.status === 'TEST_IN_PROGRESS' ? <TestSection attempt={attempt} setAttempt={setAttempt} camera={camera} notify={notify} />
      : attempt.status === 'CASES_IN_PROGRESS' ? <CaseSection attempt={attempt} setAttempt={setAttempt} camera={camera} notify={notify} />
        : <ResultView attempt={attempt} notify={notify} onReload={async () => setAttempt(await api<ExamAttempt>('/api/learning/exam-attempts/' + attempt.id))} />}
    {live && <Proctor attempt={attempt} camera={camera} setAttempt={setAttempt} />}
  </div>;

  const steps: [Step, string][] = [['overview', 'Holat'], ['identity', 'Shaxs'], ['rules', 'Qoidalar'], ['camera', 'Kamera'], ['start', 'Boshlash']];
  const done: Record<Step, boolean> = { overview: slot.credits.remaining > 0 && slot.material.mode !== 'unavailable', identity: rules.identity.status === 'verified', rules: !!rules.acceptedAt, camera: !!rules.cameraCheckedAt && camera.state.status === 'active', start: false };
  const canStart = done.overview && done.identity && done.rules && done.camera && !busy;

  return <div className="case-page exam-precheck" style={{ ['--role' as string]: meta.color }}>
    <div className="learn-breadcrumb"><button onClick={() => go('exams')}>Barcha imtihonlar</button><span>{meta.name} / {LEVEL_NAME[level]}</span></div>
    <header className="case-heading exam-heading" data-stamp={LEVEL_NAME[level]}>
      <span className="case-docket">IMTIHON REJIMI · {meta.name.toUpperCase()} · {LEVEL_NAME[level].toUpperCase()}</span>
      <h1>{meta.name} — {LEVEL_NAME[level]} imtihoni</h1>
      <p>Imtihon boshlanishidan oldin: shaxs tasdig‘i, qoidalarga rozilik va jonli kamera tekshiruvi. Taymer faqat “Imtihonni boshlash” tugmasi bosilganda ishga tushadi.</p>
    </header>
    <ol className="exam-steps" aria-label="Tayyorgarlik bosqichlari">
      {steps.map(([id, text], i) => <li key={id}><button className={(step === id ? 'current ' : '') + (done[id] ? 'done' : '')} aria-current={step === id ? 'step' : undefined} onClick={() => setStep(id)}><span>{done[id] ? <Icon name="check" size={14} /> : i + 1}</span>{text}</button></li>)}
    </ol>
    <StepPanel key={step}>
      {step === 'overview' && <section className="case-paper exam-overview">
        <div className="case-spread"><span className="case-docket">IMTIHONGA KIRISH HUQUQI</span><span className={'case-stamp ' + STATE_LABEL[slot.state].tone}>{STATE_LABEL[slot.state].text}</span></div>
        <h2>{attemptsText(slot.credits)}</h2>
        <dl className="case-kv">
          <dt>Paket</dt><dd>{slot.owned ? 'Xarid qilingan (tasdiqlangan to‘lov)' : 'Xarid qilinmagan'}</dd>
          <dt>1-bo‘lim</dt><dd>{rules.questions} ta test savoli · {rules.testMinutes} daqiqa · har biri 1 ball (maks. 50)</dd>
          <dt>2-bo‘lim</dt><dd>{rules.cases} ta amaliy holat · {rules.caseMinutes} daqiqa jami · har biri 25 ball (maks. 50)</dd>
          <dt>O‘tish</dt><dd>Kamida {rules.pass}/100. 69 — o‘tilmaydi.</dd>
          <dt>Davomiylik</dt><dd>Ko‘pi bilan 120 daqiqa, test vaqti keyingi bo‘limga o‘tmaydi</dd>
          <dt>Qurilma</dt><dd>Kamerali kompyuter, zamonaviy brauzer, barqaror internet</dd>
          <dt>Maxfiylik</dt><dd>Kamera tasviri faqat sizning brauzeringizda ko‘rsatiladi va yozib olinmaydi. Serverga faqat holat signallari (kamera faol/uzildi, sahifadan chiqish) yuboriladi.</dd>
        </dl>
        {slot.material.mode === 'unavailable' && <div className="case-banner-note danger"><Icon name="close" size={18} /><span><b>Imtihon materiallari tayyor emas.</b> Tasdiqlangan bankda {slot.material.reviewedQuestions}/50 savol va {slot.material.reviewedCases}/2 amaliy holat bor. Urinishingiz sarflanmaydi.</span></div>}
        {slot.material.mode === 'practice' && <div className="case-banner-note warn"><Icon name="settings" size={18} /><span>Sinov banki (ishlab chiqish rejimi): natija haqiqiy sertifikat bermaydi.</span></div>}
        <div className="case-row">
          {!slot.owned && slot.credits.remaining === 0 ? <button className="learn-primary" onClick={() => go('pricing/' + role)}>Paketni xarid qilish</button>
            : slot.credits.remaining === 0 ? <><span className="case-stamp red">2 ta imkoniyat tugadi</span><button onClick={() => go('pricing/' + role)}>Qayta xarid shartlari</button></>
              : <button className="learn-primary" onClick={() => setStep('identity')}>Davom etish<Icon name="play" size={15} /></button>}
        </div>
      </section>}

      {step === 'identity' && <IdentityStep rules={rules} method={elig.identityMethod} profileName={profileName} busy={busy} onSubmit={async () => { const r = await act('id', () => api('/api/learning/exams/identity', { consent: true })); if (r) { await load(); setStep('rules'); } }} />}

      {step === 'rules' && <RulesStep rules={rules} busy={busy} onAccept={async () => { const r = await act('rules', () => api<Rules>(`/api/learning/exams/${role}/${level}/rules`, { accept: true })); if (r) { setRules(r); setStep('camera'); } }} />}

      {step === 'camera' && <section className="case-paper camera-step">
        <span className="case-docket">JONLI KAMERA TEKSHIRUVI</span>
        <h2>Kamerangizni yoqing</h2>
        <p>Imtihon ikkala bo‘limida kamera doimo yoqilgan bo‘lishi shart. Biz faqat kamera ishlayotganini (haqiqiy kadrlar kelayotganini) tekshiramiz; mikrofon so‘ralmaydi, ekran yozilmaydi, video saqlanmaydi.</p>
        <div className="camera-check"><CameraDock camera={camera} />
          <div>
            {camera.state.message && <div className="case-banner-note danger">{camera.state.message}</div>}
            {camera.state.status === 'active' ? <button className="learn-primary" aria-busy={busy === 'cam'} disabled={!!busy} onClick={async () => {
              const m = await camera.measure();
              if (!m || m.frames < 3) { notify('Kamera kadrlari aniqlanmadi. Kamera qopqog‘ini oching va qayta urinib ko‘ring.'); return; }
              const r = await act('cam', () => api<Rules>(`/api/learning/exams/${role}/${level}/camera`, m)); if (r) { setRules(r); setStep('start'); }
            }}>Kadrlarni tekshirish<Icon name="check" size={15} /></button>
              : <button className="learn-primary" disabled={camera.state.status === 'starting' || camera.state.status === 'unsupported'} onClick={() => void camera.start()}>Kamerani yoqish</button>}
            {rules.cameraCheckedAt && camera.state.status === 'active' && <p className="case-stamp green">Kamera tekshirildi</p>}
          </div>
        </div>
      </section>}

      {step === 'start' && <section className="case-paper start-step">
        <span className="case-docket">YAKUNIY TASDIQ</span>
        <h2>Imtihonni boshlashga tayyormisiz?</h2>
        <ul className="pricing-list">
          <li className={done.identity ? '' : 'neg'}><Icon name={done.identity ? 'check' : 'close'} size={16} />Shaxs tasdiqlangan</li>
          <li className={done.rules ? '' : 'neg'}><Icon name={done.rules ? 'check' : 'close'} size={16} />Qoidalarga rozilik bildirilgan</li>
          <li className={done.camera ? '' : 'neg'}><Icon name={done.camera ? 'check' : 'close'} size={16} />Kamera faol va tekshirilgan</li>
          <li><Icon name="clock" size={16} />Bosilgach 1-bo‘lim taymeri (60:00) darhol boshlanadi va 1 ta urinish sarflanadi ({attemptsText(slot.credits)})</li>
        </ul>
        <div className="case-row"><Magnet padding={40} strength={4}><button className="learn-primary exam-start" disabled={!canStart} aria-busy={busy === 'start'} onClick={async () => {
          const r = await act('start', () => api<{ attempt: ExamAttempt; resumed: boolean }>(`/api/learning/exams/${role}/${level}/start`, {}));
          if (r) { sessionStorageSet('hb-exam-last', r.attempt.id); setAttempt(r.attempt); if (r.resumed) notify('Faol urinish tiklandi — asl muddatlar saqlangan.'); }
        }}>Imtihonni boshlash<Icon name="play" size={16} /></button></Magnet>
          {!canStart && <span className="case-muted">Avvalgi bosqichlarni yakunlang.</span>}</div>
      </section>}
    </StepPanel>
  </div>;
}
const sessionStorageGet = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sessionStorageSet = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } };

function StepPanel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (!ref.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return; const t = gsap.fromTo(ref.current, { autoAlpha: 0, y: 22, rotateX: -6 }, { autoAlpha: 1, y: 0, rotateX: 0, duration: .5, ease: 'power3.out' }); return () => { t.kill(); }; }, []);
  return <div ref={ref} className="exam-step-panel">{children}</div>;
}

function IdentityStep({ rules, method, profileName, busy, onSubmit }: { rules: Rules; method: string | null; profileName: string; busy: string; onSubmit: () => void }) {
  const [consent, setConsent] = useState(false);
  const status = rules.identity.status;
  const nameOk = profileName.trim().length >= 3 && profileName !== 'O‘quvchi';
  return <section className="case-paper">
    <span className="case-docket">SHAXSNI TASDIQLASH</span>
    <h2>{status === 'verified' ? 'Shaxsingiz tasdiqlangan' : 'Imtihon topshiruvchini tasdiqlash'}</h2>
    {status === 'verified' ? <p>Tasdiq usuli: {rules.identity.method === 'dev_attestation' ? 'ishlab chiqish rejimidagi o‘z-o‘zini tasdiqlash (haqiqiy tekshiruv emas)' : 'administrator tomonidan qo‘lda tekshirilgan'}. Ism: <b>{rules.identity.fullName}</b>.</p>
      : !method ? <div className="case-banner-note danger"><b>Shaxsni tasdiqlash sozlanmagan.</b> Ishonchli tekshiruv usuli ulanmaguncha imtihonni boshlash bloklangan. Bu holat urinishingizni sarflamaydi.</div>
        : status === 'pending' ? <div className="case-banner-note warn">So‘rovingiz tekshiruvda. Administrator tasdiqlagach shu sahifani yangilang.</div>
          : <>
            <p>Tasdiqlash to‘lovni amalga oshirgan hisob egasiga bog‘lanadi. Hujjat rasmi yoki biometrik yuz moslashtirish so‘ralmaydi. {method === 'manual_review' ? 'Profil ismingiz administrator tomonidan qo‘lda tekshiriladi.' : 'Ishlab chiqish rejimida tasdiq avtomatik va haqiqiy emas.'}</p>
            <dl className="case-kv"><dt>Profil ismi</dt><dd>{nameOk ? profileName : <span className="case-stamp red">Profil sahifasida to‘liq ism-familiyani saqlang</span>}</dd></dl>
            <label className="learn-checkbox exam-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Ism-familiyamni imtihon topshiruvchini tasdiqlash uchun ishlatishga roziman. Ma’lumotlar faqat sertifikatlash jarayonida saqlanadi.</label>
            <div className="case-row"><button className="learn-primary" disabled={!consent || !nameOk || !!busy} aria-busy={busy === 'id'} onClick={onSubmit}>Tasdiqlashga yuborish</button>{!nameOk && <a href="#/profile">Profilga o‘tish</a>}</div>
          </>}
  </section>;
}

function RulesStep({ rules, busy, onAccept }: { rules: Rules; busy: string; onAccept: () => void }) {
  const [ok, setOk] = useState(!!rules.acceptedAt);
  const items = [
    `1-bo‘lim: ${rules.questions} ta test savoli, ${rules.testMinutes} daqiqa. Har to‘g‘ri javob 1 ball; noto‘g‘ri yoki javobsiz — 0.`,
    `2-bo‘lim: ${rules.cases} ta amaliy holat, ikkalasi uchun jami ${rules.caseMinutes} daqiqa. To‘liq to‘g‘ri hal qilingan holat 25 ball.`,
    `O‘tish bali ${rules.pass}/100. Test bo‘limidan qolgan vaqt keyingi bo‘limga o‘tmaydi; muddat tugasa javoblar avtomatik topshiriladi.`,
    'Kamera ikkala bo‘lim davomida yoqilgan bo‘lishi shart. Kamera uzilsa, qayta yoqilguncha javob kiritish bloklanadi, taymer esa to‘xtamaydi.',
    'Yolg‘iz bo‘ling. Begona yordam, boshqa telefon, qaydlar, AI vositalari, hamkorlik, boshqa oyna yoki ilovaga o‘tish va taqiqlangan materiallar man etiladi. QonunAI imtihon davomida o‘chiriladi.',
    'Tizim g‘ayrioddiy harakatlarni (sahifadan chiqish, kamera uzilishi, bir nechta oyna) belgilashi mumkin. Belgilar avtomatik ravishda ayblov emas — ular faqat inson tekshiruvchisiga yuboriladi.',
    'Tekshiruvda tasdiqlangan qoidabuzarlik diskvalifikatsiyaga olib keladi, urinish sarflanadi va sertifikat berilmaydi. Qaror ustidan apellyatsiya berish mumkin.',
    `Qolgan urinishlar: ${attemptsText(rules.credits)}. Urinish faqat “Imtihonni boshlash” bosilganda sarflanadi.`,
    'Maxfiylik: hujjat rasmi va video saqlanmaydi; faqat holat signallari va natijalar sertifikatlash uchun saqlanadi.',
  ];
  return <section className="case-paper rules-doc">
    <span className="case-docket">IMTIHON QOIDALARI · BAYONNOMA</span>
    <h2>Iltimos, diqqat bilan o‘qing</h2>
    <ol className="rules-list">{items.map((t, i) => <li key={i}>{t}</li>)}</ol>
    <label className="learn-checkbox exam-consent"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /><b>Qoidalarga roziman</b></label>
    <button className="learn-primary" disabled={!ok || !!busy} aria-busy={busy === 'rules'} onClick={onAccept}>Tasdiqlash va davom etish</button>
  </section>;
}

/* ---------------- live exam ---------------- */
function ExamHeader({ attempt, camera }: { attempt: ExamAttempt; camera: Camera }) {
  const meta = ROLE_META[attempt.role];
  return <header className="exam-header">
    <div><span className="case-docket">{meta.name.toUpperCase()} · {LEVEL_NAME[attempt.level].toUpperCase()} · {attempt.attemptNumber}-urinish ({attempt.attemptsGranted} dan)</span>
      <h1>{attempt.status === 'TEST_IN_PROGRESS' ? '1-bo‘lim · Test' : attempt.status === 'CASES_IN_PROGRESS' ? '2-bo‘lim · Amaliy holatlar' : 'Imtihon natijasi'}</h1></div>
    {attempt.practice && <span className="case-stamp sand">Sinov banki · DEV</span>}
    {['TEST_IN_PROGRESS', 'CASES_IN_PROGRESS'].includes(attempt.status) && <CameraDock camera={camera} floating />}
  </header>;
}

function Proctor({ attempt, camera, setAttempt }: { attempt: ExamAttempt; camera: Camera; setAttempt: (a: ExamAttempt) => void }) {
  const send = useCallback((type: string, detail?: unknown) => api<{ camera: ExamAttempt['camera'] }>(`/api/learning/exam-attempts/${attempt.id}/proctor-events`, { type, detail, at: new Date().toISOString() }).catch(() => null), [attempt.id]);
  useEffect(() => {
    if (!camera.isActive()) void send('camera_lost', { reason: 'not_active_on_load' });
    const off = camera.onChange(active => void send(active ? 'camera_restored' : 'camera_lost'));
    const vis = () => void send(document.hidden ? 'visibility_hidden' : 'visibility_visible');
    const blur = () => void send('window_blur');
    const offline = () => void send('network_offline'), online = () => void send('network_online');
    document.addEventListener('visibilitychange', vis); addEventListener('blur', blur); addEventListener('offline', offline); addEventListener('online', online);
    const beat = setInterval(() => void send('camera_heartbeat', { active: camera.isActive() }), 15000);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('huquqbek-exam'); const me = Math.random().toString(36).slice(2);
      channel.onmessage = e => { if (e.data?.attempt === attempt.id && e.data.from !== me) { void send('multiple_tabs'); if (e.data.type === 'hello') channel?.postMessage({ type: 'here', attempt: attempt.id, from: me }); } };
      channel.postMessage({ type: 'hello', attempt: attempt.id, from: me });
    } catch { /* BroadcastChannel unsupported */ }
    return () => { off(); document.removeEventListener('visibilitychange', vis); removeEventListener('blur', blur); removeEventListener('offline', offline); removeEventListener('online', online); clearInterval(beat); channel?.close(); };
  }, [attempt.id, camera, send]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); }; addEventListener('beforeunload', warn); return () => removeEventListener('beforeunload', warn); }, []);
  const lost = camera.state.status !== 'active';
  return lost ? <div className="camera-lock" role="alertdialog" aria-modal="true" aria-labelledby="cam-lock-title">
    <div className="case-paper"><span className="case-stamp red">Kamera talab qilinadi</span><h2 id="cam-lock-title">Kamera o‘chgan</h2>
      <p>Javob kiritish kamera qayta yoqilguncha to‘xtatildi. <b>Taymer davom etmoqda.</b> Uzilish nazorat signali sifatida qayd etiladi va kerak bo‘lsa inson tomonidan ko‘rib chiqiladi.</p>
      {camera.state.message && <p className="case-muted">{camera.state.message}</p>}
      <button className="learn-primary" onClick={async () => { await camera.start(); setAttempt(await api<ExamAttempt>('/api/learning/exam-attempts/' + attempt.id)); }}>Kamerani qayta yoqish</button></div>
  </div> : null;
}

function TestSection({ attempt, setAttempt, camera, notify }: { attempt: ExamAttempt; setAttempt: (a: ExamAttempt) => void; camera: Camera; notify: (s: string) => void }) {
  const qs = attempt.test!.questions;
  const [answers, setAnswers] = useState<Record<string, string>>(attempt.test!.answers || {});
  const [index, setIndex] = useState(() => Math.max(0, qs.findIndex((_, i) => !attempt.test!.answers?.[i])));
  const [confirm, setConfirm] = useState(false), [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pending = useRef<Record<string, string | null>>({}), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const now = useServerClock(attempt.serverNow);
  const card = useRef<HTMLDivElement>(null);
  const flush = useCallback(async () => {
    const batch = pending.current; if (!Object.keys(batch).length) return;
    pending.current = {}; setSaving('saving');
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      try { await api(`/api/learning/exam-attempts/${attempt.id}/answers`, { answers: batch }); setSaving('saved'); return; }
      catch (e) { const err = e as ApiErr; if (err.code === 'SECTION_CLOSED') { setAttempt(await api<ExamAttempt>('/api/learning/exam-attempts/' + attempt.id)); return; } if (err.code === 'CAMERA_REQUIRED') { notify(err.message); pending.current = { ...batch, ...pending.current }; setSaving('error'); return; } await new Promise(r => setTimeout(r, 800 * (tryNo + 1))); }
    }
    pending.current = { ...batch, ...pending.current }; setSaving('error');
  }, [attempt.id, notify, setAttempt]);
  const pick = (i: number, opt: string) => {
    if (camera.state.status !== 'active') return;
    setAnswers(a => ({ ...a, [i]: opt })); pending.current[i] = opt;
    clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), 400);
  };
  useLayoutEffect(() => { if (card.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo(card.current, { x: 24, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .35, ease: 'power3.out' }); }, [index]);
  const expire = useCallback(async () => { await flush(); setAttempt(await api<ExamAttempt>('/api/learning/exam-attempts/' + attempt.id)); notify('1-bo‘lim vaqti tugadi. Javoblar avtomatik topshirildi.'); }, [attempt.id, flush, notify, setAttempt]);
  const submit = async () => { await flush(); try { setAttempt(await api<ExamAttempt>(`/api/learning/exam-attempts/${attempt.id}/tests/submit`, {})); } catch (e) { notify((e as Error).message); } setConfirm(false); };
  const answered = qs.filter((_, i) => answers[i]).length, q = qs[index];
  const locked = camera.state.status !== 'active';
  return <div className="exam-section">
    <div className="exam-toolbar">
      <Countdown endsAt={attempt.testEndsAt} now={now} onExpire={expire} label="1-bo‘lim" />
      <span className="exam-progress"><b>{index + 1}/{qs.length}</b> savol · {answered} javob berilgan</span>
      <span className={'autosave ' + saving}>{saving === 'saving' ? 'Saqlanmoqda…' : saving === 'saved' ? 'Saqlandi' : saving === 'error' ? 'Saqlanmadi — qayta urinilmoqda' : 'Avto-saqlash yoqilgan'}</span>
    </div>
    <div className="exam-test-layout">
      <nav className="question-map" aria-label="Savollar xaritasi">{qs.map((_, i) => <button key={i} className={(i === index ? 'current ' : '') + (answers[i] ? 'answered' : 'empty')} aria-current={i === index ? 'true' : undefined} aria-label={`${i + 1}-savol${answers[i] ? ', javob berilgan' : ', javobsiz'}`} onClick={() => setIndex(i)}>{i + 1}</button>)}</nav>
      <div className="case-paper question-card" ref={card}>
        <span className="case-docket">SAVOL {index + 1} / {qs.length} · 1 BALL</span>
        <h2>{q.prompt}</h2>
        <div className="answer-list" role="radiogroup" aria-label={`${index + 1}-savol javoblari`}>
          {q.options.map((o, n) => <button key={o.id} role="radio" aria-checked={answers[index] === o.id} disabled={locked} className={answers[index] === o.id ? 'chosen' : ''} onClick={() => pick(index, o.id)}><span>{String.fromCharCode(65 + n)}</span>{o.text}</button>)}
        </div>
        <div className="case-spread question-nav">
          <button disabled={index === 0} onClick={() => setIndex(i => i - 1)}>← Oldingi</button>
          {index < qs.length - 1 ? <button className="learn-primary" onClick={() => setIndex(i => i + 1)}>Keyingi →</button> : <button className="learn-primary" onClick={() => setConfirm(true)}>Testni topshirish</button>}
        </div>
      </div>
    </div>
    <div className="case-row"><button className="case-button-sand" onClick={() => setConfirm(true)}>Testni topshirish ({answered}/{qs.length})</button></div>
    {confirm && <Modal title="Testni topshirasizmi?" onClose={() => setConfirm(false)}><div className="case-modal-body">
      <p>{qs.length - answered > 0 ? <><b>{qs.length - answered} ta savol javobsiz.</b> Javobsiz savollar 0 ball. </> : 'Barcha savollarga javob berilgan. '}Topshirgach 1-bo‘limga qaytib bo‘lmaydi va 2-bo‘lim taymeri (60:00) darhol boshlanadi.</p>
      <div className="case-row"><button className="learn-primary" onClick={() => void submit()}>Ha, topshirish</button><button onClick={() => setConfirm(false)}>Qaytish</button></div></div></Modal>}
  </div>;
}

function CaseSection({ attempt, setAttempt, camera, notify }: { attempt: ExamAttempt; setAttempt: (a: ExamAttempt) => void; camera: Camera; notify: (s: string) => void }) {
  const [tab, setTab] = useState(0), [doc, setDoc] = useState<string | null>(null), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false);
  const now = useServerClock(attempt.serverNow);
  const cases = attempt.cases!, c = cases[Math.min(tab, cases.length - 1)];
  const locked = camera.state.status !== 'active' || c.submitted;
  const event = async (caseId: string, body: Record<string, unknown>) => {
    try { setAttempt(await api<ExamAttempt>(`/api/learning/exam-attempts/${attempt.id}/cases/${caseId}/event`, body)); }
    catch (e) { const err = e as ApiErr; notify(err.message); if (err.code === 'SECTION_CLOSED') setAttempt(await api<ExamAttempt>('/api/learning/exam-attempts/' + attempt.id)); }
  };
  const move = (i: number, d: -1 | 1) => { const order = c.workflow.map(w => w.id); const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; void event(c.id, { type: 'order', order }); };
  const expire = useCallback(async () => { setAttempt(await api<ExamAttempt>('/api/learning/exam-attempts/' + attempt.id)); notify('2-bo‘lim vaqti tugadi. Imtihon avtomatik yakunlandi.'); }, [attempt.id, notify, setAttempt]);
  const finish = async () => { setBusy(true); try { setAttempt(await api<ExamAttempt>(`/api/learning/exam-attempts/${attempt.id}/finish`, {})); } catch (e) { notify((e as Error).message); } finally { setBusy(false); setConfirm(false); } };
  const openDoc = c.documents.find(d => d.id === doc);
  return <div className="exam-section">
    <div className="exam-toolbar">
      <Countdown endsAt={attempt.casesEndsAt!} now={now} onExpire={expire} label="2-bo‘lim" />
      <div className="case-tabs" role="tablist" aria-label="Amaliy holatlar">{cases.map((x, i) => <button key={x.id} role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => { setTab(i); setDoc(null); }}>Holat {i + 1}{x.submitted && <Icon name="check" size={14} />}</button>)}</div>
      <span className="exam-progress">{cases.filter(x => x.submitted).length}/{cases.length} topshirilgan</span>
    </div>
    <div className="case-lab" role="tabpanel">
      <section className="case-paper case-brief">
        <span className="case-docket">ISH MATERIALLARI · {c.id}</span>
        <h2>{c.title}</h2><p>{c.scenario}</p>
        <div className="case-files">{c.documents.map(d => <button key={d.id} className={'case-file' + (c.opened.includes(d.id) ? ' read' : '') + (doc === d.id ? ' open' : '')} disabled={locked && !c.opened.includes(d.id)} onClick={() => { setDoc(d.id); if (!c.opened.includes(d.id)) void event(c.id, { type: 'open', documentId: d.id }); }}><span>{d.id}</span>{d.title}{c.opened.includes(d.id) && <Icon name="check" size={14} />}</button>)}</div>
        {openDoc && <article className="case-document"><header><span className="case-docket">{openDoc.id} · {openDoc.synthetic ? 'O‘QUV HUJJATI' : 'HUJJAT'}</span><b>{openDoc.title}</b></header><p>{openDoc.body ?? 'Yuklanmoqda…'}</p></article>}
      </section>
      <section className="case-paper case-work">
        <span className="case-docket">PROTSESSUAL QARORLAR</span>
        {c.decisions.map((d, n) => <fieldset key={d.id} className="case-decision" disabled={locked}><legend>{n + 1}. {d.prompt}</legend>
          {d.options.map(o => <label key={o.id} className={d.selected === o.id ? 'chosen' : ''}><input type="radio" name={c.id + d.id} checked={d.selected === o.id} onChange={() => void event(c.id, { type: 'decision', decisionId: d.id, optionId: o.id })} />{o.text}</label>)}
        </fieldset>)}
        <span className="case-docket">ISH KETMA-KETLIGI · TO‘G‘RI TARTIBGA KELTIRING</span>
        <ol className="workflow">{c.workflow.map((w, i) => <li key={w.id}><span className="mono">{i + 1}</span><p>{w.text}</p><div><button aria-label="Yuqoriga" disabled={locked || i === 0} onClick={() => move(i, -1)}>↑</button><button aria-label="Pastga" disabled={locked || i === c.workflow.length - 1} onClick={() => move(i, 1)}>↓</button></div></li>)}</ol>
        <div className="case-row">{c.submitted ? <span className="case-stamp green">Holat topshirilgan</span> : <button className="case-button-sand" disabled={locked} onClick={async () => { try { setAttempt(await api<ExamAttempt>(`/api/learning/exam-attempts/${attempt.id}/cases/${c.id}/submit`, {})); if (tab < cases.length - 1) setTab(tab + 1); } catch (e) { notify((e as Error).message); } }}>Holatni topshirish</button>}
          <button className="learn-primary" onClick={() => setConfirm(true)}>Imtihonni yakunlash</button></div>
      </section>
    </div>
    {confirm && <Modal title="Imtihonni yakunlaysizmi?" onClose={() => setConfirm(false)}><div className="case-modal-body"><p>Topshirilmagan holatlar ham joriy javoblar bilan baholanadi. Yakunlagach o‘zgartirib bo‘lmaydi.</p><div className="case-row"><button className="learn-primary" aria-busy={busy} disabled={busy} onClick={() => void finish()}>Ha, yakunlash</button><button onClick={() => setConfirm(false)}>Qaytish</button></div></div></Modal>}
  </div>;
}

function ResultView({ attempt, notify, onReload }: { attempt: ExamAttempt; notify: (s: string) => void; onReload: () => Promise<void> }) {
  const r = attempt.result!;
  const [appeal, setAppeal] = useState(''), [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tone = attempt.status === 'PASSED' ? 'green' : attempt.status === 'REVIEW_REQUIRED' ? 'sand' : 'red';
  const title = attempt.status === 'PASSED' ? 'O‘tdi' : attempt.status === 'REVIEW_REQUIRED' ? 'Tekshiruvda' : attempt.status === 'DISQUALIFIED' ? 'Diskvalifikatsiya' : 'O‘tilmadi';
  useLayoutEffect(() => { if (ref.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.from(ref.current.querySelector('.verdict-stamp'), { scale: 2.4, rotate: -24, autoAlpha: 0, duration: .7, ease: 'back.out(1.8)', delay: .3 }); }, []);
  return <div className="exam-result" ref={ref}>
    <section className="case-paper verdict">
      <div className="case-spread"><span className="case-docket">IMTIHON NATIJASI · {attempt.id}</span><span className={'case-stamp verdict-stamp ' + tone}>{title}</span></div>
      <div className="score-board">
        <div><span>Test</span><b><CountUp to={r.testScore} />/50</b></div>
        <div><span>Amaliy holatlar</span><b><CountUp to={r.caseScore} />/50</b></div>
        <div className="total"><span>Jami</span><b><CountUp to={r.finalScore} />/100</b><small>O‘tish bali {r.pass}</small></div>
      </div>
      {r.cases.map(c => <p key={c.id} className="case-feedback"><b>{c.title}: {c.score}/{c.max}.</b> {c.feedback}</p>)}
      {r.timedOut && <p className="case-muted">Bo‘lim muddati tugagani sababli avtomatik topshirilgan.</p>}
      {attempt.status === 'REVIEW_REQUIRED' && <div className="case-banner-note warn">Nazorat signallari ({r.reviewReason}) inson tekshiruvchisiga yuborildi. Bu ayblov emas. Tekshiruv yakunlanmaguncha sertifikat ushlab turiladi — dastlabki ball yakuniy o‘tish hisoblanmaydi.</div>}
      {attempt.status === 'DISQUALIFIED' && <div className="case-banner-note danger">Tekshiruvda qoidabuzarlik tasdiqlangan. Urinish sarflangan, sertifikat berilmaydi. Quyida apellyatsiya yuborishingiz mumkin.</div>}
      {r.decisions.map((d, i) => <p key={i} className="case-muted">Tekshiruv qarori: <b>{d.decision}</b> — {d.reason}</p>)}
      <dl className="case-kv"><dt>Urinish</dt><dd>{attempt.attemptNumber}/{attempt.attemptsGranted} · {attemptsText(attempt.credits)} qoldi</dd><dt>Buyurtma</dt><dd className="mono" data-raw>{attempt.orderRef}</dd></dl>
      <div className="case-row">
        {attempt.status === 'PASSED' && <button className="learn-primary" onClick={() => go(`certificates/${attempt.role}/${attempt.level}`)}>Sertifikatni olish<Icon name="star" size={15} /></button>}
        {attempt.status === 'FAILED' && attempt.credits.remaining > 0 && <button className="learn-primary" onClick={() => location.reload()}>Ikkinchi urinishga tayyorlanish</button>}
        {attempt.status === 'FAILED' && attempt.credits.remaining === 0 && <><span className="case-stamp red">2 ta imkoniyat tugadi</span><button onClick={() => go('pricing/' + attempt.role)}>Yangi xarid shartlari</button></>}
        <button onClick={() => go('exams')}>Imtihonlar ro‘yxati</button>
      </div>
    </section>
    {['DISQUALIFIED', 'REVIEW_REQUIRED', 'FAILED'].includes(attempt.status) && <section className="case-panel">
      <h3>Apellyatsiya</h3>
      {r.appeal ? <p>Apellyatsiya yuborilgan ({new Date(r.appeal.at).toLocaleString()}) · holat: {r.appeal.status}</p> : <>
        <p className="case-muted">Natija yoki tekshiruv bo‘yicha e’tirozingizni yozing (20–4000 belgi). U inson tomonidan ko‘rib chiqiladi.</p>
        <textarea rows={4} value={appeal} maxLength={4000} onChange={e => setAppeal(e.target.value)} aria-label="Apellyatsiya matni" style={{ width: '100%' }} />
        <button disabled={busy || appeal.trim().length < 20} onClick={async () => { setBusy(true); try { await api(`/api/learning/exam-attempts/${attempt.id}/appeal`, { text: appeal }); await onReload(); notify('Apellyatsiya yuborildi.'); } catch (e) { notify((e as Error).message); } finally { setBusy(false); } }}>Apellyatsiya yuborish</button></>}
    </section>}
  </div>;
}

export function useExamRoute(view?: string, arg?: string, arg2?: string) {
  return useMemo(() => view === 'exam' && ROLE_ORDER.includes(arg as Role) && LEVEL_ORDER.includes(arg2 as ExamLevel) ? { role: arg as Role, level: arg2 as ExamLevel } : null, [view, arg, arg2]);
}
