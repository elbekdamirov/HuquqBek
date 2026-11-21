// Motion primitives following the React Bits component APIs (SplitText, CountUp, Magnet, ClickSpark, ShinyText,
// ScrollReveal), re-implemented on the project's GSAP stack. React Bits © David Haz, MIT + Commons Clause (see LICENSE.md).
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ElementType, ReactNode } from 'react';
import gsap from 'gsap';
import { SplitText as GsapSplitText } from 'gsap/SplitText';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(GsapSplitText, ScrollTrigger);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Headline that rises in word-by-word (or char-by-char) once it scrolls into view. */
export function SplitText({ text, as: Tag = 'span', className = '', splitType = 'words', delay = 0.045, duration = 0.8, from = { yPercent: 105, opacity: 0, rotate: 3 } }: {
  text: string; as?: ElementType; className?: string; splitType?: 'chars' | 'words' | 'lines'; delay?: number; duration?: number; from?: gsap.TweenVars;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!ref.current || reduced()) return;
    const el = ref.current;
    let split: GsapSplitText | null = null;
    const ctx = gsap.context(() => {
      split = GsapSplitText.create(el, { type: splitType === 'lines' ? 'lines' : `words${splitType === 'chars' ? ',chars' : ''}`, mask: splitType === 'chars' ? undefined : (splitType as 'words' | 'lines'), wordsClass: 'split-word' });
      const targets = splitType === 'chars' ? split.chars : splitType === 'lines' ? split.lines : split.words;
      gsap.from(targets, { ...from, duration, stagger: delay, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
    }, el);
    return () => { ctx.revert(); split?.revert(); };
  }, [text, splitType, delay, duration]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Tag ref={ref} className={'split-parent ' + className} aria-label={text}>{text}</Tag>;
}

/** Number that counts up from `from` when visible. */
export function CountUp({ to, from = 0, duration = 1.4, separator = ' ', className = '', suffix = '' }: { to: number; from?: number; duration?: number; separator?: string; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, separator) + suffix;
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduced()) { el.textContent = format(to); return; }
    const state = { v: from };
    el.textContent = format(from);
    const tween = gsap.to(state, { v: to, duration, ease: 'power2.out', onUpdate: () => { el.textContent = format(state.v); }, scrollTrigger: { trigger: el, start: 'top 95%', once: true } });
    return () => { tween.scrollTrigger?.kill(); tween.kill(); };
  }, [to, from, duration]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className={className}>{format(to)}</span>;
}

/** Element drifts toward the cursor inside a padding radius (fine pointers only). */
export function Magnet({ children, padding = 60, strength = 3, className = '' }: { children: ReactNode; padding?: number; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || reduced() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const x = gsap.quickTo(el, 'x', { duration: .5, ease: 'power3.out' }), y = gsap.quickTo(el, 'y', { duration: .5, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const inside = Math.abs(e.clientX - cx) < b.width / 2 + padding && Math.abs(e.clientY - cy) < b.height / 2 + padding;
      x(inside ? (e.clientX - cx) / strength : 0); y(inside ? (e.clientY - cy) / strength : 0);
    };
    addEventListener('pointermove', move, { passive: true });
    return () => { removeEventListener('pointermove', move); gsap.set(el, { x: 0, y: 0 }); };
  }, [padding, strength]);
  return <div ref={ref} className={'magnet ' + className}>{children}</div>;
}

/** Shimmer sweep across text. */
export function ShinyText({ text, className = '' }: { text: string; className?: string }) {
  return <span className={'shiny-text ' + className}>{text}</span>;
}

/** Global click sparks (purple ink) drawn on one fixed canvas; skipped for reduced motion. */
export function ClickSpark({ color = '#a78bfa', count = 9, radius = 22 }: { color?: string; count?: number; radius?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current; if (!c || reduced()) return;
    const ctx = c.getContext('2d')!; let sparks: { x: number; y: number; a: number; t: number }[] = []; let raf = 0;
    const size = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
    size(); addEventListener('resize', size);
    const draw = (now: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      sparks = sparks.filter(s => now - s.t < 420);
      for (const s of sparks) {
        const p = (now - s.t) / 420, e = p * (2 - p), d = e * radius, len = 9 * (1 - e);
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 1 - p; ctx.beginPath();
        ctx.moveTo(s.x + d * Math.cos(s.a), s.y + d * Math.sin(s.a)); ctx.lineTo(s.x + (d + len) * Math.cos(s.a), s.y + (d + len) * Math.sin(s.a)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = sparks.length ? requestAnimationFrame(draw) : 0;
    };
    const click = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('button, a, [role=option], .case-select-trigger')) return;
      const t = performance.now();
      for (let i = 0; i < count; i++) sparks.push({ x: e.clientX, y: e.clientY, a: (2 * Math.PI * i) / count, t });
      if (!raf) raf = requestAnimationFrame(draw);
    };
    addEventListener('pointerdown', click, { passive: true });
    return () => { removeEventListener('pointerdown', click); removeEventListener('resize', size); cancelAnimationFrame(raf); };
  }, [color, count, radius]);
  return <canvas ref={canvas} className="click-spark-layer" aria-hidden="true" />;
}

/** Children fade/blur up when scrolled into view; `stagger` applies to direct children. */
export function ScrollReveal({ children, className = '', stagger = 0.08, as: Tag = 'div' }: { children: ReactNode; className?: string; stagger?: number; as?: ElementType }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el || reduced()) return;
    const ctx = gsap.context(() => {
      gsap.from(el.children, { y: 34, autoAlpha: 0, filter: 'blur(6px)', duration: .7, stagger, ease: 'power3.out', clearProps: 'filter,opacity,visibility,transform', scrollTrigger: { trigger: el, start: 'top 94%', once: true } });
    }, el);
    return () => ctx.revert();
  }, [stagger]);
  return <Tag ref={ref} className={className}>{children}</Tag>;
}
