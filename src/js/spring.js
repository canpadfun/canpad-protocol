// Damped harmonic oscillator, fixed-step semi-implicit Euler.
export const SPRING = { stiffness: 170, damping: 19, mass: 1 };

export function step(s, to, p, dt) {
  const a = (-p.stiffness * (s.x - to) - p.damping * s.v) / p.mass;
  s.v += a * dt;
  s.x += s.v * dt;
  return s;
}

export function settle(from, to, p = SPRING, h = 1 / 240, limit = 20) {
  const s = { x: from, v: 0 };
  let t = 0;
  let peak = from;
  while (t < limit) {
    step(s, to, p, h);
    t += h;
    if ((to >= from && s.x > peak) || (to < from && s.x < peak)) peak = s.x;
    if (Math.abs(s.v) < 0.0005 && Math.abs(s.x - to) < 0.0005) return { time: t, peak, final: s.x };
  }
  return { time: t, peak, final: s.x };
}

export function animateSpring({ from = 0, to = 1, params = SPRING, onUpdate, onDone }) {
  const s = { x: from, v: 0 };
  let last = null;
  let raf = 0;
  let dead = false;
  const h = 1 / 240;
  function frame(t) {
    if (dead) return;
    if (last === null) last = t;
    let acc = Math.min((t - last) / 1000, 0.064);
    last = t;
    while (acc > 0) {
      const d = Math.min(h, acc);
      step(s, to, params, d);
      acc -= d;
    }
    if (Math.abs(s.v) < 0.0005 && Math.abs(s.x - to) < 0.0005) {
      onUpdate(to);
      if (onDone) onDone();
      return;
    }
    onUpdate(s.x);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    dead = true;
    cancelAnimationFrame(raf);
  };
}
