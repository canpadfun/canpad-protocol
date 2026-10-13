// Reads brand/ only. Writes src/brand.json (provenance + traced logo) and src/tokens.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = path.join(ROOT, 'brand');
export const OPAQUE = 'LOGO CANPAD PNG.png';
export const ALPHA = 'LOGO CANPAD PNG...png';

// sRGB 0-255 -> oklch string. Brand pixels are grey, so chroma is 0 by construction (checked, not assumed).
function oklchOf(r, g, b) {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  return { L: Number(L.toFixed(4)), C: C < 1e-4 ? 0 : Number(C.toFixed(4)) };
}

export function inspect(file) {
  const { ihdr, out, ch, stride } = decode(path.join(BRAND, file));
  const alpha = { transparent: 0, partial: 0, opaque: 0 };
  const hist = new Map();
  for (let y = 0; y < ihdr.h; y += 1) {
    for (let x = 0; x < ihdr.w; x += 1) {
      const o = y * stride + x * ch;
      const a = ch === 4 ? out[o + 3] : 255;
      alpha[a === 0 ? 'transparent' : a === 255 ? 'opaque' : 'partial'] += 1;
      if (a === 255) {
        const k = `${out[o]},${out[o + 1]},${out[o + 2]}`;
        hist.set(k, (hist.get(k) || 0) + 1);
      }
    }
  }
  const dominant = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ rgb: k.split(',').map(Number), pixels: n }));
  return { file, width: ihdr.w, height: ihdr.h, bitDepth: ihdr.depth, colourType: ihdr.ct, alpha, dominant };
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0;
  let dmax = 0;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > dmax) [dmax, idx] = [d, i];
  }
  if (dmax <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

// Outer outline of the lit pixels (alpha > 127), Moore-neighbour trace on a 2x max-pooled grid, then simplified.
export function traceLogo(file = ALPHA, pool = 2, eps = 7) {
  const { ihdr, out, ch, stride } = decode(path.join(BRAND, file));
  const w = ihdr.w / pool;
  const h = ihdr.h / pool;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < ihdr.h; y += 1) {
    for (let x = 0; x < ihdr.w; x += 1) {
      const o = y * stride + x * ch;
      const lit = ch === 4 ? out[o + 3] > 127 : out[o] > 127;
      if (lit) m[Math.floor(y / pool) * w + Math.floor(x / pool)] = 1;
    }
  }
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? m[y * w + x] : 0);
  // crack-following: directed pixel edges with the lit side on the right, linked into the outer loop
  const next = new Map();
  const key = (x, y) => y * (w + 1) + x;
  const add = (x0, y0, x1, y1) => {
    const k = key(x0, y0);
    if (!next.has(k)) next.set(k, []);
    next.get(k).push([x1, y1]);
  };
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!at(x, y)) continue;
      if (sx < 0) [sx, sy] = [x, y];
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const path_ = [[sx, sy]];
  let [cx, cy] = [sx, sy];
  for (let guard = 0; guard < w * h * 4; guard += 1) {
    const opts = next.get(key(cx, cy));
    if (!opts || !opts.length) break;
    const [nx, ny] = opts.shift();
    [cx, cy] = [nx, ny];
    if (cx === sx && cy === sy) break;
    path_.push([cx, cy]);
  }
  // split the closed loop at its two farthest points, simplify each half
  const pts = path_.map(([x, y]) => [x * pool, y * pool]);
  let far = 0;
  let best = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > best) [best, far] = [d, i];
  }
  const half1 = rdp(pts.slice(0, far + 1), eps);
  const half2 = rdp([...pts.slice(far), pts[0]], eps);
  const poly = [...half1.slice(0, -1), ...half2.slice(0, -1)].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { source: file, canvas: [ihdr.w, ihdr.h], bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], points: poly };
}

export function fitTo(points, size, pad) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const k = (size - 2 * pad) / Math.max(x1 - x0, y1 - y0);
  const ox = (size - (x1 - x0) * k) / 2 - x0 * k;
  const oy = (size - (y1 - y0) * k) / 2 - y0 * k;
  return points.map(([x, y]) => [Number((x * k + ox).toFixed(2)), Number((y * k + oy).toFixed(2))]);
}

export function derive() {
  const files = fs.readdirSync(BRAND);
  const opaque = inspect(OPAQUE);
  const alpha = inspect(ALPHA);
  const black = opaque.dominant[0].rgb;
  const white = opaque.dominant[1].rgb;
  const ink0 = oklchOf(...black);
  const ink1000 = oklchOf(...white);
  const logo = traceLogo();
  return { files, inspected: [opaque, alpha], ink0, ink1000, black, white, logo };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const d = derive();
  const fmt = (o) => `oklch(${o.L} ${o.C} 0)`.replace(/ 0\)$/, ')').replace(/oklch\(1 0\)/, 'oklch(1 0 0)').replace(/oklch\(0 0\)/, 'oklch(0 0 0)');
  const brand = {
    note: 'Written by scripts/brand.mjs from brand/ only. JPG export was inspected with System.Drawing: dominant 0,0,0 and 255,255,255, zero chromatic samples (JPEG is not decoded by this script).',
    files: d.files,
    inspected: d.inspected,
    palette: {
      black: { rgb: d.black, L: d.ink0.L, C: d.ink0.C, from: `${OPAQUE} dominant pixel` },
      white: { rgb: d.white, L: d.ink1000.L, C: d.ink1000.C, from: `${OPAQUE} second dominant pixel` },
    },
    logo: d.logo,
  };
  fs.writeFileSync(path.join(ROOT, 'src/brand.json'), JSON.stringify(brand, null, 2) + '\n');

  // Ramp: the two brand extremes, plus lightness steps interpolated between them. Chroma stays 0.
  const steps = { 50: 0.12, 100: 0.16, 150: 0.2, 200: 0.265, 300: 0.38, 500: 0.52, 600: 0.68, 800: 0.86, 900: 0.96 };
  const ink = { 0: fmt(d.ink0) };
  for (const [k, l] of Object.entries(steps)) ink[k] = `oklch(${l} 0 0)`;
  ink[1000] = fmt(d.ink1000);
  const veil = {};
  for (const a of ['02', '04', '06', '08', '12', '16', '22', '32']) veil[a] = `oklch(1 0 0 / 0.${a})`;
  const tokens = {
    ink,
    veil,
    shade: { 40: 'oklch(0 0 0 / 0.4)', 70: 'oklch(0 0 0 / 0.7)' },
    shadow: { lift: '0 24px 64px oklch(0 0 0 / 0.55)', ring: '0 0 0 1px oklch(1 0 0 / 0.22)' },
  };
  fs.writeFileSync(path.join(ROOT, 'src/tokens.json'), JSON.stringify(tokens, null, 2) + '\n');
  console.log(JSON.stringify({ colourTypes: d.inspected.map((i) => i.colourType), alpha: d.inspected.map((i) => i.alpha), palette: brand.palette, vertices: d.logo.points.length, bbox: d.logo.bbox }, null, 1));
}
