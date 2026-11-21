import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import LanguageControl from './LanguageControl';
import { Icon } from './ui';

const destinations = [
  ['dashboard', 'chart', 'Asosiy sahifa'],
  ['paths', 'cases', 'Yo‘nalishlar'],
  ['rooms', 'book', 'Xonalar'],
  ['scenarios', 'scales', 'Ssenariylar'],
  ['exams', 'star', 'Imtihonlar'],
  ['pricing', 'chart', 'Narxlar'],
];

export default function AcademyHeader({ view, name, navigate, signedIn, onLogout }: {
  view: string | undefined;
  name: string;
  navigate: (destination: string) => void;
  signedIn: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const rail = useRef<HTMLSpanElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const active = ({ path: 'paths', room: 'rooms', certificates: 'profile', exam: 'exams', verify: 'profile' } as Record<string, string>)[view || ''] || view || 'dashboard';

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, [open]);

  function highlight(button: HTMLElement | null, immediate = false) {
    if (!rail.current) return;
    const duration = immediate || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.3;
    gsap.to(rail.current, {
      ...(button && { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight }),
      opacity: button ? 1 : 0,
      duration, ease: 'power3.out', overwrite: true,
    });
  }

  useLayoutEffect(() => {
    const menu = nav.current;
    const marker = rail.current;
    if (!menu || !marker) return;
    const sync = () => highlight(menu.querySelector('[aria-current="page"]'), true);
    const observer = new ResizeObserver(sync);
    observer.observe(menu);
    menu.querySelectorAll('button').forEach(button => observer.observe(button));
    sync();
    return () => { observer.disconnect(); gsap.killTweensOf(marker); };
  }, [active, open]);

  function go(destination: string) {
    setOpen(false);
    navigate(destination);
  }

  return (
    <header className="academy-header" onKeyDown={event => {
      if (open && event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
    }}>
      <button className="learn-brand" onClick={() => go('dashboard')}>
        <img className="brand-mark" src="/brand/huquqbek-courthouse.svg" alt=""/>
        <span>HuquqBek<small>HUQUQNI AMALDA O‘RGANING</small></span>
      </button>
      <button ref={toggle} className="academy-menu" aria-label="Navigatsiya" aria-expanded={open}
        aria-controls="academy-destinations" onClick={() => setOpen(!open)}>
        <span className="menu-strokes" aria-hidden="true"><i/><i/></span>
      </button>
      <nav ref={nav} id="academy-destinations" className={open ? 'open' : ''} aria-label="Asosiy navigatsiya"
        onPointerLeave={() => highlight(nav.current?.querySelector('[aria-current="page"]') || null)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) highlight(nav.current?.querySelector('[aria-current="page"]') || null); }}>
        <span className="nav-rail" ref={rail} aria-hidden="true"/>
        {destinations.map(([id, icon, label]) => (
          <button key={id} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined}
            onPointerEnter={event => highlight(event.currentTarget)} onFocus={event => highlight(event.currentTarget)}
            onClick={() => go(id)}><Icon name={icon} size={17}/>{label}</button>
        ))}
      </nav>
      <LanguageControl/>
      <button className="academy-profile" aria-label="Profil" aria-current={active === 'profile' ? 'page' : undefined}
        onClick={() => go('profile')}><span>{name.slice(0, 1).toUpperCase()}</span><b>{name}</b><Icon name="users" size={17}/></button>
      {signedIn
        ? <button className="academy-logout" onClick={onLogout} title="Hisobdan chiqish"><Icon name="logout" size={17}/><span>Chiqish</span></button>
        : <button className="academy-logout" onClick={() => go('login')} title="Google bilan kirish"><Icon name="login" size={17}/><span>Kirish</span></button>}
      <span className="academy-scroll-meter" aria-hidden="true"/>
    </header>
  );
}
