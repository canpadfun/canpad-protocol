// Pure transforms for the DexScreener payloads.
export function solanaAddresses(boosts, cap = 30) {
  const seen = new Set();
  const out = [];
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (!b || b.chainId !== 'solana' || typeof b.tokenAddress !== 'string') continue;
    if (seen.has(b.tokenAddress)) continue;
    seen.add(b.tokenAddress);
    out.push(b.tokenAddress);
    if (out.length >= cap) break;
  }
  return out;
}

export function collapsePairs(pairs, limit = 10) {
  const map = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    if (!p || p.chainId !== 'solana' || !p.baseToken || !p.baseToken.address) continue;
    const addr = p.baseToken.address;
    const vol = Number(p.volume && p.volume.h24) || 0;
    const liq = Number(p.liquidity && p.liquidity.usd) || 0;
    let e = map.get(addr);
    if (!e) {
      e = { address: addr, symbol: p.baseToken.symbol || '', name: p.baseToken.name || '', price: null, change: null, volume: 0, liquidity: 0, image: null, depth: -1 };
      map.set(addr, e);
    }
    e.volume += vol;
    e.liquidity += liq;
    if (liq > e.depth) {
      e.depth = liq;
      e.price = p.priceUsd != null && p.priceUsd !== '' ? Number(p.priceUsd) : null;
      e.change = p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null;
    }
    if (!e.image && p.info && typeof p.info.imageUrl === 'string' && p.info.imageUrl) e.image = p.info.imageUrl;
  }
  return [...map.values()]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit)
    .map(({ depth, ...row }) => row);
}

export const backoffDelay = (fails, base = 2000, cap = 60000) => Math.min(cap, base * 2 ** Math.max(0, fails - 1));
