import { FORMATTERS, DASH } from './format.js';

export const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const frames = new WeakMap();
const easeOutQuart = (p) => 1 - (1 - p) ** 4;

function flash(el, dir) {
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(dir === 'up' ? 'flash-up' : 'flash-down');
}

// Count-up on first value, tween + flash on later changes. Reduced motion: write the final text, nothing else.
export function setNum(el, value, kind) {
  const fmt = FORMATTERS[kind];
  const prevFrame = frames.get(el);
  if (prevFrame) cancelAnimationFrame(prevFrame);

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    el.textContent = DASH;
    el._v = null;
    el.removeAttribute('data-dir');
    return;
  }
  const prev = el._v == null ? null : el._v;
  el._v = value;
  if (el.classList.contains('chg')) el.dataset.dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

  if (prefersReduced() || prev === value) {
    el.textContent = fmt(value);
    return;
  }
  if (prev != null) flash(el, value > prev ? 'up' : 'down');
  const from = prev == null ? 0 : prev;
  const dur = prev == null ? 900 : 600;
  let t0 = null;
  const frame = (t) => {
    if (t0 === null) t0 = t;
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(from + (value - from) * easeOutQuart(p));
    if (p < 1) frames.set(el, requestAnimationFrame(frame));
    else el.textContent = fmt(value);
  };
  frames.set(el, requestAnimationFrame(frame));
}
