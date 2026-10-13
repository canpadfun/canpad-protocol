// Register -> view model. Pure: no DOM, no network.
export const STATES = ['stated', 'absent', 'unconfirmed'];
export const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const VALUE_KEYS = ['value', 'url', 'href', 'rpc', 'boosts_url', 'pairs_url', 'handle'];
const SOCIAL_HOSTS = { x: ['x.com', 'twitter.com'], github: ['github.com'] };

export const findRecord = (reg, id) => reg.records.find((r) => r.id === id);

export function addressShapeOk(chainValue, value) {
  if (typeof value !== 'string') return false;
  if (String(chainValue).toLowerCase() === 'solana') return SOL_ADDR.test(value);
  return SOL_ADDR.test(value) || EVM_ADDR.test(value);
}

export function safeUrl(raw, hosts) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.replace(/^www\./, '');
    if (hosts && !hosts.includes(h)) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function deriveHandle(id, url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (id === 'x') return parts[0] ? '@' + parts[0] : null;
    if (id === 'github') return parts.length ? parts.slice(0, 2).join('/') : null;
  } catch {
    /* fall through */
  }
  return null;
}

export function validateRegister(reg) {
  const out = [];
  for (const r of reg.records || []) {
    if (!r.id || !r.label) out.push('record missing id or label');
    if (!STATES.includes(r.state)) out.push(`${r.id}: bad state`);
    if (r.state !== 'stated') {
      for (const k of VALUE_KEYS) if (k in r) out.push(`${r.id}: inert record carries ${k}`);
    }
  }
  return out;
}

export function buildModel(reg) {
  const chain = findRecord(reg, 'chain');
  const chainLive = !!chain && chain.state === 'stated' && !!chain.value;
  const chainName = chainLive ? chain.value : null;

  const caRec = findRecord(reg, 'ca');
  const caLive = !!caRec && caRec.state === 'stated' && addressShapeOk(chainName || 'solana', caRec.value);
  const ca = { label: caRec ? caRec.label : 'Contract address', live: caLive, value: caLive ? caRec.value : null };

  const social = ['x', 'github'].map((id) => {
    const r = findRecord(reg, id);
    const href = r && r.state === 'stated' ? safeUrl(r.url, SOCIAL_HOSTS[id]) : null;
    return { id, label: r ? r.label : id, live: !!href, href, handle: href ? deriveHandle(id, href) : null };
  });

  const m = findRecord(reg, 'market');
  const marketLive =
    !!m &&
    m.state === 'stated' &&
    !!safeUrl(m.boosts_url) &&
    typeof m.pairs_url === 'string' &&
    m.pairs_url.includes('{addresses}');
  const market = {
    live: marketLive,
    label: m ? m.label : 'Feed',
    source: marketLive ? m.value : null,
    boostsUrl: marketLive ? m.boosts_url : null,
    pairsUrl: marketLive ? m.pairs_url : null,
    intervalMs: marketLive ? Number(m.interval_ms) || 60000 : 60000,
  };

  const records = [
    { id: 'ca', label: ca.label, live: ca.live, text: ca.live ? 'stated' : 'pending' },
    ...social.map((s) => ({ id: s.id, label: s.label, live: s.live, text: s.live ? s.handle : 'pending' })),
    { id: 'chain', label: chain ? chain.label : 'Chain', live: chainLive, text: chainLive ? chainName : 'pending' },
    { id: 'market', label: market.label, live: marketLive, text: marketLive ? market.source : 'pending' },
  ];

  return { chain: { live: chainLive, name: chainName, rpc: chainLive ? chain.rpc : null }, ca, social, market, records };
}

// Mutation helper: flips a record to its opposite state, reading the current one at call time.
export function flipRecord(reg, id, samples = {}) {
  const next = JSON.parse(JSON.stringify(reg));
  const r = findRecord(next, id);
  if (r.state === 'stated') {
    r.state = 'absent';
    for (const k of VALUE_KEYS) delete r[k];
    return next;
  }
  r.state = 'stated';
  if (id === 'ca') r.value = samples.ca;
  else if (id === 'x' || id === 'github') r.url = samples[id];
  return next;
}
