import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { api } from './services';
import { Icon, Modal } from './ui';
import { ROLE_META, ROLE_ORDER, LEVEL_NAME } from './commerceTypes';
import type { Eligibility, Entitlements, Order, Pricing as PricingData, Product, Role } from './commerceTypes';
import { ScrollReveal, ShinyText, SplitText } from './vendor/react-bits/Effects';
import SpotlightCard from './vendor/react-bits/SpotlightCard';

const PREMIUM_FEATURES = ['Har yo‘nalishdagi 3-darsdan boshlab barcha darslar', 'Katalogdagi barcha 45 laboratoriya', 'Obuna davomida yangi qo‘shiladigan o‘quv xonalari'];
const premiumLabel: Record<Entitlements['premium']['state'], string> = { none: 'Obuna yo‘q', active: 'Faol', cancel_at_period_end: 'Davr oxirida bekor qilinadi', expired: 'Muddati tugagan', cancelled: 'Bekor qilingan' };
const date = (s: string | null) => s ? new Date(s).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default function Pricing({ notify, initialRole }: { notify: (s: string) => void; initialRole?: Role }) {
  const [pricing, setPricing] = useState<PricingData | null>(null), [ent, setEnt] = useState<Entitlements | null>(null), [error, setError] = useState(''), [exams, setExams] = useState<Eligibility['exams']>({});
  const [role, setRole] = useState<Role>(initialRole || 'advokat');
  const [busy, setBusy] = useState(''), [pending, setPending] = useState<{ order: Order; product: Product } | null>(null), [retake, setRetake] = useState<Product | null>(null);
  const toggle = useRef<HTMLDivElement>(null), pill = useRef<HTMLSpanElement>(null), cards = useRef<HTMLDivElement>(null);

  const load = () => Promise.all([api<PricingData>('/api/learning/pricing'), api<Entitlements>('/api/learning/me/entitlements'), api<Eligibility>('/api/learning/exams/eligibility').catch(() => null)]).then(([p, e, x]) => { setPricing(p); setEnt(e); if (x) setExams(x.exams); }).catch(e => setError(e.message));
  useEffect(() => { void load(); }, []);

  // Role toggle: sliding pill + card cross-fade.
  useLayoutEffect(() => {
    const btn = toggle.current?.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (!btn || !pill.current) return;
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.to(pill.current, { x: btn.offsetLeft, width: btn.offsetWidth, backgroundColor: ROLE_META[role].color, duration: instant ? 0 : .45, ease: 'expo.out' });
    if (!instant && cards.current) gsap.fromTo(cards.current.children, { y: 18, autoAlpha: 0, rotateX: -8 }, { y: 0, autoAlpha: 1, rotateX: 0, duration: .5, stagger: .06, ease: 'power3.out' });
  }, [role, pricing]);

  async function buy(product: Product, isRetake = false) {
    setBusy(product.sku);
    try {
      const r = await api<{ order: Order; devConfirm: boolean }>('/api/learning/checkout', { sku: product.sku, retake: isRetake || undefined, idempotencyKey: crypto.randomUUID() });
      if (r.devConfirm) setPending({ order: r.order, product });
      else notify('Buyurtma yaratildi. To‘lov provayderi tasdiqlagach huquq beriladi.');
    } catch (e) {
      const err = e as Error & { code?: string };
      notify(err.code === 'PAYMENTS_NOT_CONFIGURED' ? 'To‘lovlar sozlanmagan. Hozircha xarid qilib bo‘lmaydi — hech qanday to‘lov olinmadi.' : err.message);
    } finally { setBusy(''); setRetake(null); }
  }
  async function confirmDev(outcome: 'paid' | 'failed') {
    if (!pending) return;
    setBusy('dev');
    try { setEnt(await api<Entitlements>('/api/learning/billing/dev-confirm', { orderId: pending.order.id, outcome })); notify(outcome === 'paid' ? 'Sinov to‘lovi tasdiqlandi. Huquqlar yangilandi.' : 'Sinov to‘lovi rad etildi. Hech narsa berilmadi.'); setPending(null); }
    catch (e) { notify((e as Error).message); } finally { setBusy(''); }
  }
  async function cancel() {
    setBusy('cancel');
    try { setEnt(await api<Entitlements>('/api/learning/billing/cancel', {})); notify('Obuna joriy davr oxirida to‘xtaydi. Shu sanagacha Premium faol.'); }
    catch (e) { notify((e as Error).message); } finally { setBusy(''); }
  }

  if (error) return <section className="case-panel" role="alert"><p>{error}</p><button onClick={() => { setError(''); void load(); }}>Qayta urinish</button></section>;
  if (!pricing || !ent) return <section className="case-panel" aria-busy="true"><p className="case-muted">Narxlar yuklanmoqda…</p></section>;

  const roleProducts = pricing.packages.filter(p => p.role === role);
  const ownedAll = (p: Product) => p.levels.every(l => ent.packages[role][l].owned);
  const passed = (l: string) => ['passed_ready', 'issued'].includes(exams[`${role}:${l}`]?.state || '');
  // A paid retake is only offered when every covered level is out of attempts and not already passed.
  const exhausted = (p: Product) => p.levels.every(l => ent.packages[role][l].credits.remaining === 0 && !passed(l));

  return <div className="case-page pricing-page">
    <header className="case-heading" data-stamp="Tarif · 2026">
      <span className="case-docket">HUQUQBEK · NARXLAR VA OBUNA</span>
      <h1><SplitText text="Ikki alohida mahsulot. Hech qanday chalkashlik." /></h1>
      <p>Premium obuna — o‘qish va laboratoriyalar uchun (so‘mda, muntazam). Sertifikat paketlari — har rol va daraja bo‘yicha bir martalik, dollarda, ikki imtihon urinishi bilan.</p>
    </header>

    {!pricing.payments.configured && <div className="case-banner-note warn" role="status"><Icon name="close" size={18} /><span><b>To‘lovlar sozlanmagan.</b> Narxlar ko‘rsatiladi, lekin hozircha xarid qilib bo‘lmaydi. Hech qanday to‘lov olinmaydi.</span></div>}
    {pricing.payments.devMock && <div className="case-banner-note" role="status"><Icon name="settings" size={18} /><span><b>Ishlab chiqish rejimi:</b> to‘lovlar sinov provayderi orqali, haqiqiy pul yechilmaydi.</span></div>}

    <section aria-labelledby="premium-title" className="pricing-block">
      <div className="case-spread"><div><span className="case-docket">A · PREMIUM OBUNA · UZS</span><h2 id="premium-title">Darslar va laboratoriyalar</h2></div>
        <span className={'case-stamp ' + (ent.premium.active ? 'green' : 'sand')}>{premiumLabel[ent.premium.state]}{ent.premium.periodEnd && ent.premium.state !== 'none' ? ' · ' + date(ent.premium.periodEnd) : ''}</span></div>
      <ScrollReveal className="case-grid pricing-premium">
        {pricing.premium.map(p => <SpotlightCard key={p.sku} className="pricing-card-spot" spotlightColor="#8b5cf6" intensity={0.22} proximity={0} grain={0}>
          <article className={'dossier-card pricing-card' + (p.period === 'year' ? ' featured' : '')}>
            <div className="case-spread"><span className="case-docket">{p.period === 'year' ? 'YILLIK' : 'OYLIK'}</span>{p.period === 'year' && <span className="case-stamp purple">12 oy · bir to‘lov</span>}</div>
            <h3>{p.title}</h3>
            <p className="pricing-amount"><b>{(p.amountMinor / 100).toLocaleString('ru-RU').replace(/ /g, ' ')}</b> so‘m<span>/{p.period === 'year' ? 'yil' : 'oy'}</span></p>
            <ul className="pricing-list">{PREMIUM_FEATURES.map(f => <li key={f}><Icon name="check" size={16} />{f}</li>)}<li className="neg"><Icon name="close" size={16} />Sertifikat imtihonini ochmaydi</li></ul>
            <button className="learn-primary" disabled={!!busy || ent.premium.state === 'active'} aria-busy={busy === p.sku} onClick={() => void buy(p)}>{ent.premium.state === 'active' ? 'Faol obuna' : ent.premium.active ? 'Muddatni uzaytirish' : 'Obunani boshlash'}<Icon name="play" size={15} /></button>
          </article>
        </SpotlightCard>)}
        <article className="case-panel pricing-free">
          <span className="case-docket">BEPUL KIRISH</span>
          <h3>Ro‘yxatdan o‘tgan har bir o‘quvchiga</h3>
          <ul className="pricing-list"><li><Icon name="check" size={16} />Har yo‘nalishning 1- va 2-darsi</li><li><Icon name="check" size={16} /><span>Butun katalogda jami 3 ta laboratoriya: <b>{ent.freeLabs.join(', ')}</b></span></li><li><Icon name="check" size={16} />Real hayot ssenariylari va QonunAI yordamchisi</li></ul>
          {ent.premium.active && !ent.premium.cancelAtPeriodEnd && <button onClick={() => void cancel()} disabled={!!busy}>Obunani davr oxirida to‘xtatish</button>}
        </article>
      </ScrollReveal>
    </section>

    <section aria-labelledby="packages-title" className="pricing-block">
      <div className="case-spread"><div><span className="case-docket">B · DARAJALAR / SERTIFIKAT PAKETLARI · USD</span><h2 id="packages-title">Rol va daraja paketlari</h2>
        <p className="case-muted">Bir martalik to‘lov. Har bir daraja uchun <b>{pricing.attemptsPerLevel} ta imtihon urinishi</b>. Sertifikat faqat imtihondan kamida 70/100 ball bilan o‘tgandan keyin beriladi.</p></div>
        <div className="role-toggle" ref={toggle} role="radiogroup" aria-label="Rol">
          <span className="role-toggle-pill" ref={pill} aria-hidden="true" />
          {ROLE_ORDER.map(r => <button key={r} data-role={r} role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}
            onKeyDown={e => { const i = ROLE_ORDER.indexOf(r); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = ROLE_ORDER[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3]; setRole(n); (e.currentTarget.parentElement?.querySelector(`[data-role="${n}"]`) as HTMLElement)?.focus(); } }}>
            <i style={{ background: ROLE_META[r].color }} />{ROLE_META[r].name}</button>)}
        </div>
      </div>
      <div className="pricing-packages" ref={cards} style={{ ['--role' as string]: ROLE_META[role].color }}>
        {roleProducts.map(p => {
          const owned = ownedAll(p), canRetake = owned && exhausted(p);
          return <article key={p.sku} className={'dossier-card package-card' + (p.bundle ? ' bundle' : '') + (owned ? ' owned' : '')}>
            <div className="package-tab">{p.bundle ? 'TO‘PLAM' : 'DARAJA'}</div>
            <span className="case-docket">{ROLE_META[role].name.toUpperCase()} · {p.levels.map(l => LEVEL_NAME[l]).join(' + ')}</span>
            <h3>{p.title}</h3>
            <p className="pricing-amount"><b>{p.display}</b> <span>USD · bir marta</span></p>
            <ul className="pricing-list">
              {p.levels.map(l => <li key={l}><Icon name="check" size={16} />{LEVEL_NAME[l]} paketi · {pricing.attemptsPerLevel} ta urinish</li>)}
              <li><Icon name="check" size={16} />Imtihon ichidagi 2 ta amaliy holat (Premium shart emas)</li>
            </ul>
            {p.bundle && <p className="package-note">{p.levels.length === 2 ? 'Beginner va Junior paketlari birga.' : 'Uchala daraja paketi birga.'}</p>}
            {owned && !canRetake ? <button disabled className="owned-cta"><Icon name="check" size={15} />{p.levels.every(passed) ? 'Sizda bor · imtihon o‘tilgan' : 'Sizda bor'}</button>
              : canRetake ? <button className="case-button-sand" disabled={!!busy} onClick={() => setRetake(p)}>Qayta xarid · yana {pricing.attemptsPerLevel} urinish</button>
                : <button className="learn-primary" disabled={!!busy} aria-busy={busy === p.sku} onClick={() => void buy(p)}>Sotib olish · {p.display}</button>}
          </article>;
        })}
      </div>
    </section>

    <section className="case-panel billing-status" aria-labelledby="billing-title">
      <div className="case-spread"><h2 id="billing-title">Hisob va xaridlar tarixi</h2><ShinyText text={ent.payments.configured ? (ent.payments.devMock ? 'Sinov provayderi' : 'Provayder: ' + ent.payments.provider) : 'To‘lov provayderi ulanmagan'} className="purple" /></div>
      {ent.orders.length === 0 ? <p className="case-muted">Hozircha xarid yo‘q.</p> :
        <div className="billing-table" role="table" aria-label="Xaridlar">
          <div role="row" className="head"><span role="columnheader">Buyurtma</span><span role="columnheader">Mahsulot</span><span role="columnheader">Summa</span><span role="columnheader">Holat</span><span role="columnheader">Sana</span></div>
          {ent.orders.map(o => <div role="row" key={o.id}><span role="cell" className="mono" data-raw>{o.id}</span><span role="cell">{pricing.packages.concat(pricing.premium).find(p => p.sku === o.sku)?.title}{o.role ? ' · ' + ROLE_META[o.role].name : ''}</span><span role="cell">{o.price}</span><span role="cell"><span className={'case-stamp ' + (o.status === 'paid' ? 'green' : o.status === 'pending' ? 'sand' : 'red')}>{({ paid: 'To‘langan', pending: 'Kutilmoqda', failed: 'Rad etilgan', refunded: 'Qaytarilgan' } as Record<string, string>)[o.status] || o.status}</span></span><span role="cell">{date(o.paidAt || o.created)}</span></div>)}
        </div>}
    </section>

    {retake && <Modal title="Qayta xaridni tasdiqlang" onClose={() => setRetake(null)}>
      <div className="case-modal-body"><p>Ushbu daraja uchun barcha imtihon urinishlari tugagan. Yangi buyurtma <b>{retake.display}</b> (nashr qilingan narx) bo‘yicha yana {pricing.attemptsPerLevel} ta urinish beradi. Chegirma yoki bepul qayta tiklash yo‘q.</p>
        <div className="case-row"><button className="learn-primary" onClick={() => void buy(retake, true)}>{retake.display} — yangi buyurtma</button><button onClick={() => setRetake(null)}>Bekor qilish</button></div></div>
    </Modal>}
    {pending && <Modal title="Sinov to‘lovi (ishlab chiqish)" onClose={() => setPending(null)}>
      <div className="case-modal-body"><p>Buyurtma <code>{pending.order.id}</code>: <b>{pending.product.title}</b> — {pending.order.price}. Bu haqiqiy provayder emas; tasdiq server tomonidagi imzolangan webhook yo‘li orqali o‘tadi.</p>
        <div className="case-row"><button className="learn-primary" aria-busy={busy === 'dev'} disabled={!!busy} onClick={() => void confirmDev('paid')}>To‘lovni tasdiqlash (sinov)</button><button disabled={!!busy} onClick={() => void confirmDev('failed')}>Rad etish</button></div></div>
    </Modal>}
  </div>;
}
