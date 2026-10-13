import { animateSpring } from './spring.js';
import { prefersReduced } from './numbers.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function initProgress(el) {
  let queued = false;
  const paint = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    el.style.transform = `scaleX(${max > 0 ? clamp01(scrollY / max) : 0})`;
  };
  const kick = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(paint);
    }
  };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  paint();
}

// Scroll-reveal: spring (stiffness 170 / damping 19) with a per-batch stagger.
export function initReveal() {
  const items = [...document.querySelectorAll('[data-rv]')];
  const done = (el) => {
    el.style.opacity = '';
    el.style.transform = '';
    el.setAttribute('data-rv-done', '');
  };
  if (prefersReduced() || !('IntersectionObserver' in window)) {
    items.forEach(done);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      const hits = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
      hits.forEach((entry, i) => {
        const el = entry.target;
        io.unobserve(el);
        setTimeout(() => {
          animateSpring({
            from: 0,
            to: 1,
            onUpdate: (p) => {
              el.style.opacity = String(clamp01(p * 1.4));
              el.style.transform = `translate3d(0, ${(1 - p) * 32}px, 0)`;
            },
            onDone: () => done(el),
          });
        }, Math.min(i, 8) * 70);
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -5% 0px' },
  );
  items.forEach((el) => io.observe(el));
}

// Pointer + scroll parallax, eased toward the target each frame.
export function initParallax(hero) {
  if (!hero || prefersReduced()) return;
  const layers = [...hero.querySelectorAll('[data-depth]')].map((el) => ({ el, d: Number(el.dataset.depth) || 0 }));
  const cur = { x: 0, y: 0, s: 0 };
  const tgt = { x: 0, y: 0, s: 0 };
  let raf = 0;
  let visible = true;

  const apply = () => {
    for (const l of layers) {
      const tx = cur.x * l.d * 26;
      const ty = cur.y * l.d * 20 + cur.s * l.d * 0.16;
      l.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
    }
  };
  const loop = () => {
    raf = 0;
    cur.x += (tgt.x - cur.x) * 0.09;
    cur.y += (tgt.y - cur.y) * 0.09;
    cur.s += (tgt.s - cur.s) * 0.12;
    apply();
    const settled = Math.abs(tgt.x - cur.x) + Math.abs(tgt.y - cur.y) + Math.abs(tgt.s - cur.s) < 0.01;
    if (!settled && visible) raf = requestAnimationFrame(loop);
  };
  const kick = () => {
    if (!raf && visible) raf = requestAnimationFrame(loop);
  };

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      const r = hero.getBoundingClientRect();
      tgt.x = clamp01((e.clientX - r.left) / r.width) * 2 - 1;
      tgt.y = clamp01((e.clientY - r.top) / r.height) * 2 - 1;
      kick();
    },
    { passive: true },
  );
  addEventListener(
    'scroll',
    () => {
      tgt.s = scrollY;
      kick();
    },
    { passive: true },
  );
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible) kick();
    }).observe(hero);
  }
  tgt.s = scrollY;
  kick();
}

// Cursor spotlight: writes --mx / --my on whichever .spot is under the pointer.
export function initSpotlight() {
  let queued = null;
  addEventListener(
    'pointermove',
    (e) => {
      const host = e.target instanceof Element ? e.target.closest('.spot') : null;
      if (!host) return;
      queued = { host, x: e.clientX, y: e.clientY };
      requestAnimationFrame(() => {
        if (!queued) return;
        const r = queued.host.getBoundingClientRect();
        queued.host.style.setProperty('--mx', `${queued.x - r.left}px`);
        queued.host.style.setProperty('--my', `${queued.y - r.top}px`);
        queued = null;
      });
    },
    { passive: true },
  );
}
