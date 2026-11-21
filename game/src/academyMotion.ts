import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);

const motionAllowed = '(prefers-reduced-motion: no-preference)';

export function useAcademyMotion(root: RefObject<HTMLElement | null>, page: string | null) {
  useLayoutEffect(() => {
    if (page === null || !root.current) return;
    const scope = root.current;
    const media = gsap.matchMedia();

    media.add(motionAllowed, () => {
      const scroll = new Lenis({
        lerp: 0.11,
        prevent: element => !!element.closest('.qonun-panel, .hb-modal-shade, .scenario-overlay, textarea, select'),
      });
      const tick = (seconds: number) => scroll.raf(seconds * 1000);
      scroll.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(tick);

      const hero = scope.querySelector('.academy-hero');
      if (hero) {
        gsap.timeline({ defaults: { ease: 'power3.out' } })
          .from('.academy-hero-photo', { scale: 1.23, xPercent: 8, duration: 1.8 }, 0)
          .fromTo('.academy-shutter', { scaleX: 1 }, {
            scaleX: 0, duration: 0.9, stagger: 0.1, ease: 'power4.inOut',
          }, 0)
          .from('.academy-title-line > *', { yPercent: 110, skewY: 7, duration: 0.9, stagger: 0.13 }, 0.1)
          .from('.academy-hero-copy > :not(h1), .academy-hero-preview', {
            autoAlpha: 0, y: 22, duration: 0.55, stagger: 0.1,
          }, 0.25)
          .fromTo('.academy-hero-beam', { xPercent: -120, autoAlpha: 0.6 }, {
            xPercent: 420, autoAlpha: 0, duration: 1.3, ease: 'power1.inOut',
          }, 0.24)
          .from('.academy-hero-frame', { scale: 1.24, autoAlpha: 0, duration: 0.9 }, 0.65);

        gsap.to('.academy-hero-photo', {
          yPercent: 11,
          ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
        });
      }

      const intro = scope.querySelector('[data-academy-intro]');
      if (intro) {
        gsap.timeline({ defaults: { ease: 'power3.out' } })
          .from(intro.querySelectorAll('[data-academy-enter]'), {
            y: 30, autoAlpha: 0.6, duration: 0.65, stagger: 0.085,
          });
        const art = intro.querySelector('.academy-banner-art');
        if (art) gsap.from(art, { scale: 1.16, clipPath: 'inset(0 0 0 70%)', duration: 1.05, ease: 'power3.out' });
      }

      const stats = scope.querySelector('.learning-stats');
      if (stats) {
        gsap.from(stats.children, {
          yPercent: 17, opacity: 0.6, stagger: 0.08, duration: 0.6,
          ease: 'power3.out', scrollTrigger: { trigger: stats, start: 'top 98%', once: true },
        });
      }

      return () => {
        gsap.ticker.remove(tick);
        scroll.destroy();
      };
    }, scope);

    media.add(`${motionAllowed} and (hover: hover) and (pointer: fine)`, () => {
      const targets = scope.querySelectorAll<HTMLElement>('.academy-hero, [data-academy-tilt]');
      const cleanups = [...targets].map(target => {
        const surface = target.querySelector('.academy-hero-photo') || target;
        const isHero = surface !== target;
        const x = gsap.quickTo(surface, isHero ? 'x' : 'rotationY', { duration: 0.45, ease: 'power3.out' });
        const y = gsap.quickTo(surface, isHero ? 'y' : 'rotationX', { duration: 0.45, ease: 'power3.out' });
        const move = (event: PointerEvent) => {
          if (event.pointerType !== 'mouse') return;
          const box = target.getBoundingClientRect();
          const px = (event.clientX - box.left) / box.width - 0.5;
          const py = (event.clientY - box.top) / box.height - 0.5;
          x(px * (isHero ? 26 : 11));
          y(py * (isHero ? 16 : -11));
        };
        const reset = () => { x(0); y(0); };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerleave', reset);
        return () => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerleave', reset);
        };
      });
      function moveLight(event: PointerEvent) {
        const card = event.target instanceof Element && event.target.closest<HTMLElement>(
          '.room-file, .certificate-card, .learn-room-row, .interest-option, .scenario-card, .hb-case-card',
        );
        if (!card || event.pointerType !== 'mouse') return;
        const bounds = card.getBoundingClientRect();
        card.style.setProperty('--light-x', (event.clientX - bounds.left) + 'px');
        card.style.setProperty('--light-y', (event.clientY - bounds.top) + 'px');
      }
      scope.addEventListener('pointermove', moveLight, { passive: true });
      return () => {
        scope.removeEventListener('pointermove', moveLight);
        cleanups.forEach(cleanup => cleanup());
      };
    }, scope);

    return () => media.revert();
  }, [page, root]);
}

export function useAcademyReveals(root: RefObject<HTMLElement | null>, layout: string | null) {
  useLayoutEffect(() => {
    if (layout === null || !root.current) return;
    const scope = root.current;
    const media = gsap.matchMedia();

    media.add(motionAllowed, context => {
      const sections = scope.querySelectorAll<HTMLElement>('[data-academy-reveal]');
      for (const section of sections) {
        gsap.from(section, {
          y: 26,
          duration: 0.65,
          ease: 'power2.out',
          scrollTrigger: { trigger: section, start: 'top 96%', once: true },
        });
      }

      const cards = [...scope.querySelectorAll<HTMLElement>('[data-academy-card]')];
      ScrollTrigger.batch(cards, {
        start: 'top 98%',
        once: true,
        batchMax: 6,
        onEnter: batch => context.add(() => {
          gsap.from(batch, {
            y: 29,
            autoAlpha: 0.65,
            scale: 0.965,
            duration: 0.62,
            stagger: 0.06,
            ease: 'power3.out',
            clearProps: 'opacity,visibility',
          });
        }),
      });
    }, scope);

    return () => media.revert();
  }, [layout, root]);
}
