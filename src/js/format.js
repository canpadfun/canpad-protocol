export const DASH = '—';
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function fmtUsd(v) {
  if (!fin(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(2);
}

export function fmtPrice(v) {
  if (!fin(v)) return DASH;
  if (v === 0) return '$0.00';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(3);
  if (v >= 0.01) return '$' + v.toFixed(4);
  const lead = Math.min(12, Math.ceil(-Math.log10(v)));
  return '$' + v.toFixed(lead + 2);
}

export function fmtPct(v) {
  if (!fin(v)) return DASH;
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

export function fmtInt(v) {
  return fin(v) ? String(Math.round(v)) : DASH;
}

export const FORMATTERS = { usd: fmtUsd, price: fmtPrice, pct: fmtPct, int: fmtInt };
