import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';

export interface SelectOption<T extends string> { value: T; label: ReactNode; hint?: ReactNode; disabled?: boolean; text?: string }

/**
 * Accessible custom dropdown (WAI-ARIA listbox pattern) replacing native <select> across the academy.
 * Keyboard: Enter/Space/ArrowDown open; arrows/Home/End move; type-ahead; Enter selects; Esc/Tab close.
 * Opening animates with GSAP (scale/clip + staggered options); reduced-motion users get an instant menu.
 */
export default function Select<T extends string>({ value, options, onChange, label, hideLabel, ariaLabel, compact, disabled, className = '', placeholder }: {
  value: T | ''; options: SelectOption<T>[]; onChange: (value: T) => void; label?: string; hideLabel?: boolean; ariaLabel?: string;
  compact?: boolean; disabled?: boolean; className?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex(o => o.value === value)));
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null), menu = useRef<HTMLUListElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const id = useId();
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    setUp(innerHeight - box.bottom < Math.min(300, menu.current.scrollHeight + 16) && box.top > innerHeight - box.bottom);
    menu.current.querySelector<HTMLElement>('[data-index="' + active + '"]')?.scrollIntoView({ block: 'nearest' });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(menu.current, { autoAlpha: 0, scaleY: .82, y: -6 }, { autoAlpha: 1, scaleY: 1, y: 0, duration: .26, ease: 'back.out(1.6)' });
      gsap.fromTo(menu.current!.children, { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: .22, stagger: .025, ease: 'power2.out', delay: .04 });
    });
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>('[data-index="' + active + '"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  const move = (from: number, step: number) => {
    let i = from;
    for (let n = 0; n < options.length; n++) { i = (i + step + options.length) % options.length; if (!options[i].disabled) return i; }
    return from;
  };
  const choose = (i: number) => { const o = options[i]; if (!o || o.disabled) return; onChange(o.value); setOpen(false); trigger.current?.focus(); };
  const openMenu = () => { setActive(Math.max(0, options.findIndex(o => o.value === value))); setOpen(true); };

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => move(a, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => move(a, -1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(move(-1, 1)); }
    else if (e.key === 'End') { e.preventDefault(); setActive(move(options.length, -1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const now = Date.now(); typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const hit = options.findIndex(o => !o.disabled && (o.text ?? String(o.label)).toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  }

  return (
    <div ref={root} className={`case-select${compact ? ' compact' : ''}${up ? ' up' : ''} ${className}`} onKeyDown={onKey}>
      {label && <span id={id + '-label'} className={hideLabel ? 'sr-only' : 'case-select-label'}>{label}</span>}
      <button ref={trigger} type="button" className="case-select-trigger" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={id + '-list'}
        aria-labelledby={label ? id + '-label ' + id + '-value' : undefined} aria-label={label ? undefined : ariaLabel}
        aria-activedescendant={open ? id + '-opt-' + active : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}>
        <span id={id + '-value'} className="case-select-value">{selected ? selected.label : <span className="case-muted">{placeholder || 'Tanlang'}</span>}</span>
        <svg className="case-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <ul ref={menu} id={id + '-list'} role="listbox" tabIndex={-1} aria-labelledby={label ? id + '-label' : undefined} aria-label={label ? undefined : ariaLabel} className="case-select-menu">
        {options.map((o, i) => (
          <li key={o.value} id={id + '-opt-' + i} data-index={i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
            className={'case-select-option' + (i === active ? ' active' : '')}
            onPointerEnter={() => !o.disabled && setActive(i)} onPointerDown={e => e.preventDefault()} onClick={() => choose(i)}>
            <span>{o.label}{o.hint && <small>{o.hint}</small>}</span>
          </li>
        ))}
      </ul>}
    </div>
  );
}
