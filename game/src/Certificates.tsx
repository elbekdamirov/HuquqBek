import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from './services';
import { Icon } from './ui';
import { LEVEL_NAME, LEVEL_ORDER, ROLE_META, ROLE_ORDER, STATE_LABEL, attemptsText } from './commerceTypes';
import type { CertificateSlot, ExamLevel, Role } from './commerceTypes';
import type { IssuedCertificate } from './components/HuquqBekCertificate';
import { ScrollReveal } from './vendor/react-bits/Effects';
const Generator = lazy(() => import('./components/HuquqBekCertificate'));

interface Legacy { id: string; path: Role | string; level: string; name: string; created: string }
const go = (p: string) => { location.hash = '/' + p; };

/** Achievements board: course progress, purchases, exam passes and certificates are shown as different things. */
export default function Certificates({ focus, profileName, legacy, roomProgress, notify }: {
  focus: { role: Role; level: ExamLevel } | null; profileName: string; legacy: Legacy[]; roomProgress: (role: Role, level: ExamLevel) => number; notify: (s: string) => void;
}) {
  const [slots, setSlots] = useState<Record<string, CertificateSlot> | null>(null), [error, setError] = useState('');
  const load = () => api<Record<string, CertificateSlot>>('/api/learning/me/certificates').then(setSlots).catch(e => setError(e.message));
  useEffect(() => { void load(); }, []);
  if (error) return <section className="case-panel" role="alert">{error}</section>;
  if (!slots) return <section className="case-panel" aria-busy="true"><p className="case-muted">Sertifikatlar yuklanmoqda…</p></section>;
  const [first = '', ...rest] = profileName === 'O‘quvchi' ? [] : profileName.trim().split(/\s+/);
  const selected = focus ? slots[`${focus.role}:${focus.level}`] : null;

  return <div className="case-page certificates-page" id="profile-awards">
    {selected && <section className="cert-focus" aria-labelledby="cert-focus-title" style={{ ['--role' as string]: ROLE_META[selected.role].color }}>
      <div className="case-spread"><div><span className="case-docket">SERTIFIKAT · {ROLE_META[selected.role].name.toUpperCase()} · {LEVEL_NAME[selected.level].toUpperCase()}</span><h2 id="cert-focus-title">{ROLE_META[selected.role].name} {LEVEL_NAME[selected.level]}</h2></div><button onClick={() => go('certificates')}>Barcha sertifikatlar</button></div>
      {selected.certificate || selected.state === 'passed_ready'
        ? <Suspense fallback={<p className="case-muted">Generator yuklanmoqda…</p>}>
          <Generator role={selected.role} level={selected.level} issued={selected.certificate as IssuedCertificate | null} defaultFirstName={first} defaultLastName={rest.join(' ')}
            onIssue={async (firstName, lastName) => { await api('/api/learning/certificates/issue', { role: selected.role, level: selected.level, firstName, lastName }); await load(); notify('Sertifikat rasmiylashtirildi. Endi PDF yuklab olishingiz mumkin.'); }} />
        </Suspense>
        : <Gate slot={selected} />}
    </section>}

    <header className="case-heading" data-stamp="Sertifikatlar">
      <span className="case-docket">YUTUQLAR VA SERTIFIKATLAR</span>
      <h1>Sertifikat — imtihon natijasi, xona soni emas.</h1>
      <p>Har bir rol va daraja sertifikati faqat shu daraja paketi xarid qilingan va imtihondan kamida 70/100 ball bilan, qoidabuzarliksiz o‘tilgandan keyin beriladi. Xonalardagi o‘quv natijalari rivojlanishingizni ko‘rsatadi, lekin imtihon o‘rnini bosmaydi.</p>
    </header>
    {ROLE_ORDER.map(role => <section key={role} className="cert-role" style={{ ['--role' as string]: ROLE_META[role].color }} aria-labelledby={'cert-' + role}>
      <div className="exam-role-head"><i /><h2 id={'cert-' + role}>{ROLE_META[role].name}</h2></div>
      <ScrollReveal className="cert-cards">
        {LEVEL_ORDER.map(level => {
          const s = slots[`${role}:${level}`], label = STATE_LABEL[s.state], rooms = roomProgress(role, level);
          const ready = s.state === 'passed_ready' || s.state === 'issued';
          return <article key={level} className={'cert-card state-' + s.state} data-academy-card>
            <div className="cert-seal" aria-hidden="true"><Icon name={ready ? 'star' : 'scales'} size={26} /></div>
            <span className="case-docket">{LEVEL_NAME[level].toUpperCase()}</span>
            <h3>{ROLE_META[role].name} · {LEVEL_NAME[level]}</h3>
            <span className={'case-stamp ' + label.tone}>{label.text}</span>
            <dl className="case-kv">
              <dt>O‘quv</dt><dd>{rooms}/5 xona <small className="case-muted">(rivojlanish, sertifikat sharti emas)</small></dd>
              <dt>Paket</dt><dd>{s.owned ? 'Xarid qilingan' : 'Paket kerak'}</dd>
              <dt>Imtihon</dt><dd>{s.owned ? attemptsText(s.credits) : '—'}{s.lastAttempt?.finalScore != null ? ` · oxirgi ${s.lastAttempt.finalScore}/100` : ''}</dd>
              {s.certificate && <><dt>ID</dt><dd className="mono" data-raw>{s.certificate.id}</dd></>}
            </dl>
            <button className={ready ? 'learn-primary' : 'case-button-sand'} onClick={() => go(ready ? `certificates/${role}/${level}` : s.owned ? `exam/${role}/${level}` : `pricing/${role}`)}>
              {s.state === 'issued' ? 'Ko‘rish / PDF' : s.state === 'passed_ready' ? 'Sertifikatni rasmiylashtirish' : s.owned ? 'Imtihon holati' : 'Paketni ko‘rish'}</button>
          </article>;
        })}
      </ScrollReveal>
    </section>)}
    {legacy.length > 0 && <details className="case-panel"><summary>Avvalgi qoidalar bo‘yicha berilgan o‘quv yakuni qaydlari ({legacy.length})</summary>
      <p className="case-muted">Bu qaydlar imtihonsiz, xonalarni yakunlash orqali berilgan. Ular saqlanadi va bekor qilinmaydi, ammo yangi imtihon sertifikati hisoblanmaydi.</p>
      {legacy.map(c => <p key={c.id}><a href={'/api/learning/certificate/' + c.id} target="_blank" rel="noreferrer">{ROLE_META[c.path as Role]?.name || c.path} · {c.level === 'Path' ? '15 xona' : c.level}</a> <span className="case-stamp sand">Avvalgi qoida</span></p>)}
    </details>}
  </div>;
}

function Gate({ slot }: { slot: CertificateSlot }) {
  const msg = !slot.owned ? { t: 'Paket kerak', p: 'Bu sertifikat uchun avval shu rol va daraja paketini xarid qiling. Paket 2 ta imtihon urinishini beradi.', a: ['Narxlarni ko‘rish', 'pricing/' + slot.role] }
    : slot.state === 'under_review' ? { t: 'Tekshiruvda', p: 'Imtihon natijangiz inson tekshiruvida. Tekshiruv yakunlanmaguncha sertifikat ushlab turiladi.', a: ['Imtihon holati', `exam/${slot.role}/${slot.level}`] }
      : slot.state === 'revoked' ? { t: 'Bekor qilingan', p: 'Sertifikat tekshiruv qarori bilan bekor qilingan.', a: ['Imtihon holati', `exam/${slot.role}/${slot.level}`] }
        : { t: 'Imtihondan o‘tish kerak', p: 'Sertifikat imtihondan kamida 70/100 ball bilan o‘tilgandan keyin ochiladi.', a: ['Imtihonga kirish', `exam/${slot.role}/${slot.level}`] };
  return <div className="case-paper cert-gate"><span className="case-stamp red">{msg.t}</span><p>{msg.p}</p><button className="learn-primary" onClick={() => go(msg.a[1])}>{msg.a[0]}</button></div>;
}

export function VerifyPage({ id }: { id: string }) {
  const [data, setData] = useState<{ valid: boolean; status: string; role?: Role; level?: ExamLevel; issuedAt?: string; name?: string; environment?: string; label: string } | null>(null);
  useEffect(() => { void api<typeof data>('/api/learning/verify-certificate/' + encodeURIComponent(id)).then(setData).catch(() => setData({ valid: false, status: 'error', label: 'HuquqBek educational achievement' })); }, [id]);
  if (!data) return <section className="case-panel" aria-busy="true">Tekshirilmoqda…</section>;
  return <div className="case-page verify-page">
    <header className="case-heading" data-stamp={data.valid ? 'Haqiqiy' : 'Tasdiqlanmadi'}><span className="case-docket">SERTIFIKATNI TEKSHIRISH</span><h1 className="mono-title" data-raw>{id}</h1></header>
    <section className="case-paper">
      <span className={'case-stamp ' + (data.valid ? 'green' : 'red')}>{data.valid ? 'Faol va haqiqiy' : data.status === 'revoked' ? 'Bekor qilingan' : data.status === 'not_found' ? 'Topilmadi' : data.environment === 'development' ? 'Sinov muhiti — haqiqiy emas' : 'Tasdiqlanmadi'}</span>
      {data.role && <dl className="case-kv" style={{ marginTop: 18 }}><dt>Rol</dt><dd>{ROLE_META[data.role].name}</dd><dt>Daraja</dt><dd>{LEVEL_NAME[data.level!]}</dd><dt>Berilgan</dt><dd>{new Date(data.issuedAt!).toLocaleDateString()}</dd><dt>Egasi</dt><dd>{data.name}</dd></dl>}
      <p className="case-muted"><span data-raw>{data.label}</span>. Bu kasbiy litsenziya, advokatlik guvohnomasi yoki davlat malakasi emas.</p>
    </section>
  </div>;
}
