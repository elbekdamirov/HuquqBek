import { useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import Select from '../Select';
import { HuquqBekCertificateArt, ROLES } from './HuquqBekCertificateArt';
import type { CertLang, CertLevel, CertRole } from './HuquqBekCertificateArt';
import './HuquqBekCertificate.css';

export interface IssuedCertificate { id: string; role: CertRole; level: CertLevel; issuedAt: string; firstName: string; lastName: string; status: string; environment: string }

async function svgToPngData(svg: SVGSVGElement | null, multiplier = 2) {
  if (!svg) throw new Error('Sertifikat ko‘rinishi topilmadi');
  const data = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Sertifikat rasmini chizib bo‘lmadi')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = 1600 * multiplier; canvas.height = 1000 * multiplier;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('2D canvas mavjud emas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Certificate generator wired to the backend. Before issuance the learner confirms Ism/Familiya and sees a preview with
 * no ID/date; `onIssue` asks the server (which checks package + passed exam). PDF export exists only for an issued record.
 */
export default function HuquqBekCertificate({ role, level, issued, defaultFirstName = '', defaultLastName = '', onIssue }: {
  role: CertRole; level: CertLevel; issued: IssuedCertificate | null; defaultFirstName?: string; defaultLastName?: string;
  onIssue?: (firstName: string, lastName: string) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(issued?.firstName ?? defaultFirstName);
  const [lastName, setLastName] = useState(issued?.lastName ?? defaultLastName);
  const [language, setLanguage] = useState<CertLang>('uz');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = ROLES[role];
  const shownFirst = issued ? issued.firstName : firstName, shownLast = issued ? issued.lastName : lastName;
  const filename = useMemo(() => {
    const slug = `${shownLast}-${shownFirst}`.normalize('NFKD').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '');
    return `HuquqBek-${role}-${level}-${slug || 'certificate'}-${language}`;
  }, [role, level, shownFirst, shownLast, language]);

  async function issue() {
    const f = firstName.trim(), l = lastName.trim();
    if (!f || !l) { setError('Ism va familiyani to‘ldiring.'); return; }
    if (f.length > 48 || l.length > 48) { setError('Ism va familiya 48 belgidan oshmasin.'); return; }
    setBusy(true); setError('');
    try { await onIssue?.(f, l); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function downloadPDF() {
    if (!issued || issued.status !== 'issued') return;
    setBusy(true); setError('');
    try {
      const image = await svgToPngData(svgRef.current);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [320, 200], compress: true });
      pdf.addImage(image, 'PNG', 0, 0, 320, 200);
      pdf.save(`${filename}.pdf`);
    } catch (e) { setError((e as Error).message || 'PDF yaratishda xatolik yuz berdi.'); } finally { setBusy(false); }
  }

  return (
    <div className="hqb-generator" style={{ ['--hqb-accent' as string]: theme.accent }}>
      <div className="hqb-editor">
        <div className="hqb-kicker">HUQUQBEK / SERTIFIKAT</div>
        <h2>{theme.title.uz} · {level.toUpperCase()}</h2>
        {issued ? <p>Sertifikat rasmiylashtirilgan. ID va sana serverdan olingan. Ism-familiya berilgan paytdagi holatda saqlanadi.</p>
          : <p>Imtihondan o‘tganingiz tasdiqlangan. Sertifikatda ko‘rinadigan ism va familiyani tekshiring — berilgandan so‘ng o‘zgarmaydi.</p>}
        {!issued && <>
          <label htmlFor="hqb-first">Ism / First name</label>
          <input id="hqb-first" autoComplete="given-name" maxLength={48} value={firstName} onChange={e => setFirstName(e.target.value)} />
          <label htmlFor="hqb-last">Familiya / Family name</label>
          <input id="hqb-last" autoComplete="family-name" maxLength={48} value={lastName} onChange={e => setLastName(e.target.value)} />
        </>}
        <div style={{ marginTop: 14 }}>
          <Select<CertLang> label="Til / Language" value={language} onChange={setLanguage}
            options={[{ value: 'uz', label: 'Oʻzbekcha', text: 'uzbek' }, { value: 'en', label: 'English', text: 'english' }, { value: 'ru', label: 'Русский', text: 'russian' }]} />
        </div>
        {issued && <dl className="case-kv hqb-meta"><dt>ID</dt><dd data-raw>{issued.id}</dd><dt>Holat</dt><dd>{issued.status === 'issued' ? 'Faol' : 'Bekor qilingan'}{issued.environment === 'development' ? ' · sinov muhiti' : ''}</dd><dt>Tekshirish</dt><dd data-raw><a href={'#/verify/' + issued.id}>#/verify/{issued.id}</a></dd></dl>}
        {error && <p className="hqb-error" role="alert">{error}</p>}
        {issued
          ? <button className="hqb-download" disabled={busy || issued.status !== 'issued'} onClick={() => void downloadPDF()} type="button">{busy ? 'PDF tayyorlanmoqda…' : 'PDF yuklab olish'}</button>
          : <button className="hqb-download" disabled={busy} onClick={() => void issue()} type="button">{busy ? 'Server tekshirmoqda…' : 'Sertifikatni rasmiylashtirish'}</button>}
        <small className="hqb-note"><span data-raw>HuquqBek educational achievement</span> — kasbiy litsenziya yoki davlat malakasi emas.</small>
      </div>
      <div className="hqb-preview" data-raw>
        <div className="hqb-preview-caption">SERTIFIKAT KOʻRINISHI <span>16:10 · {role.toUpperCase()} · {level.toUpperCase()}{issued ? '' : ' · ID BERILMAGAN'}</span></div>
        <HuquqBekCertificateArt svgRef={svgRef} role={role} level={level} lang={language} firstName={shownFirst} lastName={shownLast} certificateId={issued?.id || ''} issuedAt={issued?.issuedAt} />
      </div>
    </div>
  );
}
