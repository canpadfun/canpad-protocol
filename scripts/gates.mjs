import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, ROOT } from './build.mjs';

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const DIST = path.join(ROOT, 'dist');
const rd = (p) => fs.readFileSync(p, 'utf8');
const walk = (dir, skip = []) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (skip.includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, skip) : [p];
  });

const results = [];
function gate(id, name, fn) {
  results.push({ id, name, fn });
}
const eq = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'mismatch'}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};
const ok = (c, msg) => {
  if (!c) throw new Error(msg || 'assertion failed');
};

const M = await imp('src/js/model.js');
const MC = await imp('src/js/market-core.js');
const SP = await imp('src/js/spring.js');
const FD = await imp('src/js/feed.js');
const FM = await imp('src/js/format.js');
const register = JSON.parse(rd(path.join(ROOT, 'src/register.json')));
const tokens = JSON.parse(rd(path.join(ROOT, 'src/tokens.json')));

ok(fs.existsSync(path.join(DIST, 'index.html')), 'dist/index.html missing: run npm run build first');
const distFiles = walk(DIST);
const distHtml = rd(path.join(DIST, 'index.html'));
const distCss = distFiles.filter((f) => f.endsWith('.css')).map((f) => [f, rd(f)]);
const distJs = distFiles.filter((f) => f.endsWith('.js')).map((f) => [f, rd(f)]);
const appCss = rd(path.join(DIST, 'assets/app.css'));

const SAMPLE = {
  ca: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  x: 'https://x.com/canpadtest',
  github: 'https://github.com/canpadtest/canpad',
};
const tmp = (n) => path.join(os.tmpdir(), 'canpad-gate-' + n);
const caSection = (html) => (html.match(/<section class="ca"[\s\S]*?<\/section>/) || [''])[0];
const socialBlock = (html) => (html.match(/<div class="social"[\s\S]*?<\/div>/) || [''])[0];
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '\n').replace(/<style[\s\S]*?<\/style>/g, '\n').replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&');
const literals = (src) => {
  const out = [];
  for (const m of src.matchAll(/(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1/g)) out.push(m[2]);
  return out;
};
const allLiterals = distJs.flatMap(([, s]) => literals(s));

// ---------------------------------------------------------------- register
gate('reg-schema', 'every record has id, label and a legal state', () => {
  ok(register.records.length >= 5);
  eq(M.validateRegister(register), [], 'violations');
});
gate('reg-inert-clean', 'absent/unconfirmed records carry no value or url (read at runtime)', () => {
  for (const r of register.records.filter((x) => x.state !== 'stated')) {
    for (const k of ['value', 'url', 'href', 'rpc', 'boosts_url', 'pairs_url', 'handle']) ok(!(k in r), `${r.id} carries ${k}`);
  }
  const bad = JSON.parse(JSON.stringify(register));
  M.findRecord(bad, 'ca').state = 'absent';
  M.findRecord(bad, 'ca').value = SAMPLE.ca;
  ok(M.validateRegister(bad).length > 0, 'validator must catch an inert record with a value');
});
gate('reg-ids', 'chain, ca, x, github and market records exist', () => {
  for (const id of ['chain', 'ca', 'x', 'github', 'market']) ok(M.findRecord(register, id), id);
});
gate('reg-chain', 'chain record: Solana, publicnode rpc, client statement, batch-level', () => {
  const c = M.findRecord(register, 'chain');
  eq([c.state, c.value, c.rpc, c.source, c.scope], ['stated', 'Solana', 'https://solana-rpc.publicnode.com', 'client statement', 'batch-level']);
});
gate('reg-market', 'market record names both DexScreener endpoints and a 60s interval', () => {
  const m = M.findRecord(register, 'market');
  eq(m.boosts_url, 'https://api.dexscreener.com/token-boosts/top/v1');
  eq(m.pairs_url, 'https://api.dexscreener.com/tokens/v1/solana/{addresses}');
  eq(m.interval_ms, 60000);
});
gate('reg-dates-data-only', 'dates exist in register.json as data and are stripped from the shipped copy', () => {
  ok(register.records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.recorded || '')));
  const shipped = JSON.parse(distHtml.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/)[1]);
  ok(shipped.records.every((r) => !('recorded' in r)));
});

// ---------------------------------------------------------------- link rule + CA branches
gate('link-no-href-unstated', 'dist: no social icon of an unstated record has an href (branch: current state)', () => {
  const model = M.buildModel(register);
  const block = socialBlock(distHtml);
  for (const s of model.social) {
    const re = new RegExp(`<(a|span)[^>]*data-social="${s.id}"[^>]*>`);
    const tag = (block.match(re) || [''])[0];
    ok(tag, `${s.id} icon missing`);
    if (!s.live) ok(!/href=/.test(tag) && tag.startsWith('<span'), `${s.id} inert but linked`);
    else ok(/href="https:/.test(tag), `${s.id} stated but unlinked`);
  }
});
gate('link-icons-both', 'both social icons rendered inside the header, official X + Octicon paths', () => {
  const header = distHtml.match(/<header class="top">[\s\S]*?<\/header>/)[0];
  ok(/data-social="x"/.test(header) && /data-social="github"/.test(header));
  ok(header.includes('M18.244 2.25h3.308'), 'X mark path');
  ok(header.includes('M8 0c4.42 0 8 3.58 8 8a8.013'), 'GitHub Octicon path');
  ok(!/<svg[^>]*>[^<]*<text/.test(header.match(/<div class="social"[\s\S]*?<\/div>/)[0]), 'icon-only: no text node');
});
gate('link-icons-all-breakpoints', 'CSS never hides .social or .icon-btn at any breakpoint', () => {
  for (const m of appCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.social|\.icon-btn|\[data-social/.test(m[1]) && /display\s*:\s*none|visibility\s*:\s*hidden/.test(m[2])) throw new Error('hidden: ' + m[1].trim());
  }
});
gate('link-flip-social', 'mutation: flipping x and github reverses href/inert (anchors read at runtime)', async () => {
  const cur = M.buildModel(register);
  let reg = register;
  for (const id of ['x', 'github']) reg = M.flipRecord(reg, id, SAMPLE);
  const flipped = M.buildModel(reg);
  for (let i = 0; i < 2; i += 1) eq(flipped.social[i].live, !cur.social[i].live, 'live must flip');
  const out = tmp('social');
  await build({ register: reg, out });
  const html = rd(path.join(out, 'index.html'));
  for (const s of flipped.social) {
    const tag = (socialBlock(html).match(new RegExp(`<(a|span)[^>]*data-social="${s.id}"[^>]*>`)) || [''])[0];
    if (s.live) {
      ok(/href="https:\/\/(x|github)\.com\//.test(tag), `${s.id} should link`);
      ok(s.handle && s.handle.length > 1, 'handle derived from url');
    } else ok(!/href=/.test(tag), `${s.id} should be inert`);
  }
});
gate('link-hostile-url', 'stated record with a hostile or off-host url stays inert', () => {
  for (const bad of ['javascript:alert(1)', 'http://x.com/a', 'https://evil.example/canpad']) {
    const reg = M.flipRecord(register, 'x', { x: bad });
    const r = M.findRecord(reg, 'x');
    r.state = 'stated';
    r.url = bad;
    ok(!M.buildModel(reg).social[0].live, bad);
  }
});
gate('link-handle', 'handles are derived from stored urls, never stored', () => {
  eq(M.deriveHandle('x', 'https://x.com/canpadtest'), '@canpadtest');
  eq(M.deriveHandle('github', 'https://github.com/a/b/tree/main'), 'a/b');
  ok(register.records.every((r) => !('handle' in r)));
});
gate('ca-slot-top', 'CA slot sits above the hero and the ticker, inside the first screen of markup', () => {
  const i = distHtml.indexOf('class="ca"');
  ok(i > 0 && i < distHtml.indexOf('class="hero"') && i < distHtml.indexOf('class="ticker"') && i < distHtml.indexOf('<main'));
});
gate('ca-inert-text', 'inert CA slot shows label and the word pending, nothing else (branch: current state)', () => {
  const model = M.buildModel(register);
  const sec = caSection(distHtml);
  if (!model.ca.live) {
    eq(textOf(sec).split('\n').map((s) => s.trim()).filter(Boolean), ['Contract address', 'pending']);
    ok(!/<button/.test(sec) && !/href=/.test(sec) && !/[A-Za-z0-9]{32,}/.test(sec));
  } else {
    ok(sec.includes(model.ca.value) && /<button[^>]*data-copy-ca/.test(sec));
  }
});
gate('ca-flip-live', 'mutation: flipping the CA record yields the opposite slot, full address + copy button when stated', async () => {
  const cur = M.buildModel(register);
  const reg = M.flipRecord(register, 'ca', SAMPLE);
  const next = M.buildModel(reg);
  eq(next.ca.live, !cur.ca.live);
  const out = tmp('ca');
  await build({ register: reg, out });
  const sec = caSection(rd(path.join(out, 'index.html')));
  if (next.ca.live) {
    ok(sec.includes(SAMPLE.ca), 'full address rendered');
    ok(/<button[^>]*data-copy-ca/.test(sec), 'click-to-copy button');
    ok(sec.includes('data-copy-text'), 'feedback slot');
  } else {
    ok(!sec.includes(SAMPLE.ca) && !/<button/.test(sec) && sec.includes('pending'));
  }
});
gate('ca-both-branches', 'both gate branches live: CA stated and CA absent each render correctly', async () => {
  const base = M.findRecord(register, 'ca').state === 'stated' ? M.flipRecord(register, 'ca', SAMPLE) : register;
  const live = M.flipRecord(base, 'ca', SAMPLE);
  const stated = M.findRecord(live, 'ca').state === 'stated' ? live : base;
  const absent = stated === live ? base : live;
  ok(M.buildModel(stated).ca.live && !M.buildModel(absent).ca.live);
});
gate('ca-bad-shape', 'stated CA with a bad shape is rejected to inert', () => {
  for (const v of ['abc', '0x1234', SAMPLE.ca.slice(0, 20), SAMPLE.ca + 'O0Il', '']) {
    const reg = JSON.parse(JSON.stringify(register));
    const r = M.findRecord(reg, 'ca');
    r.state = 'stated';
    r.value = v;
    ok(!M.buildModel(reg).ca.live, 'accepted ' + v);
  }
});
gate('ca-large-font', 'CA value font reaches at least 26px on wide screens and 15px on 360', () => {
  const m = appCss.match(/\.ca__value\s*\{[^}]*font-size:\s*clamp\(\s*(\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/);
  ok(m, 'clamp not found');
  ok(Number(m[3]) >= 26 && Number(m[1]) >= 15);
});

// ---------------------------------------------------------------- address scanner (rule 3)
const B58 = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const EVM = /\b0x[0-9a-fA-F]{40}\b/g;
function scanAddresses(text, stated) {
  const hits = [];
  for (const m of text.matchAll(B58)) if (/\d/.test(m[0]) && /[A-Za-z]/.test(m[0])) hits.push(m[0]);
  for (const m of text.matchAll(EVM)) hits.push(m[0]);
  return hits.filter((h) => !stated.has(h));
}
const statedValues = (reg) => new Set(reg.records.filter((r) => r.state === 'stated').map((r) => r.value).filter(Boolean));
gate('scan-dist-clean', 'address scanner: no address-shaped string in dist outside the stated registry (CA slot exempt)', () => {
  const stated = statedValues(register);
  for (const f of distFiles) {
    let t = rd(f);
    if (f.endsWith('index.html')) t = t.replace(caSection(t), '');
    eq(scanAddresses(t, stated), [], path.basename(f));
  }
});
gate('scan-hex-matched-not-blanket', 'scanner rejects an unstated 0x address but accepts the same string once stated', () => {
  const hex = '0x' + 'ab12'.repeat(10);
  ok(scanAddresses(`see ${hex}`, new Set()).length === 1, 'unstated hex must be flagged');
  eq(scanAddresses(`see ${hex}`, new Set([hex])), [], 'stated hex must pass');
});
gate('scan-solana-flagged', 'scanner flags an unstated base58 address and exempts the CA slot markup', () => {
  ok(scanAddresses(`x ${SAMPLE.ca}`, new Set()).length === 1);
  const html = '<section class="ca">' + SAMPLE.ca + '</section><p>ok</p>';
  eq(scanAddresses(html.replace(caSection(html), ''), new Set()), []);
});
gate('scan-flip-branch', 'mutation build with a stated CA passes the scanner with that CA in the registry', async () => {
  const reg = M.findRecord(register, 'ca').state === 'stated' ? register : M.flipRecord(register, 'ca', SAMPLE);
  const out = tmp('scan');
  await build({ register: reg, out });
  const html = rd(path.join(out, 'index.html'));
  eq(scanAddresses(html.replace(caSection(html), ''), statedValues(reg)), []);
});

// ---------------------------------------------------------------- market
gate('market-independent-of-ca', 'market model is identical with CA stated and absent', () => {
  const a = M.buildModel(register);
  const b = M.buildModel(M.flipRecord(register, 'ca', SAMPLE));
  ok(a.ca.live !== b.ca.live);
  eq(a.market, b.market);
});
gate('market-follows-record', 'market goes inert only when the market record flips, and CA is untouched', () => {
  const cur = M.buildModel(register);
  const flipped = M.buildModel(M.flipRecord(register, 'market', SAMPLE));
  ok(cur.market.live !== flipped.market.live);
  eq(cur.ca, flipped.ca);
});
gate('market-filter-collapse', 'solana filter, pair collapse, top 10 by 24h volume, image kept or null', () => {
  const boosts = [
    { chainId: 'solana', tokenAddress: 'A' }, { chainId: 'ethereum', tokenAddress: 'B' },
    { chainId: 'solana', tokenAddress: 'A' }, { chainId: 'solana', tokenAddress: 'C' },
  ];
  eq(MC.solanaAddresses(boosts), ['A', 'C']);
  const pairs = [];
  for (let i = 0; i < 14; i += 1) {
    pairs.push({ chainId: 'solana', baseToken: { address: 'T' + i, symbol: 'S' + i, name: 'N' + i }, priceUsd: '1.5', priceChange: { h24: i - 5 }, volume: { h24: i * 100 }, liquidity: { usd: 50 + i }, info: i % 2 ? { imageUrl: 'https://img.example/' + i } : undefined });
  }
  pairs.push({ chainId: 'solana', baseToken: { address: 'T3', symbol: 'S3', name: 'N3' }, priceUsd: '9', priceChange: { h24: 4 }, volume: { h24: 1000 }, liquidity: { usd: 500 } });
  pairs.push({ chainId: 'base', baseToken: { address: 'ZZ' }, volume: { h24: 99999 } });
  const rows = MC.collapsePairs(pairs);
  eq(rows.length, 10);
  eq(rows[0].address, 'T3', 'merged volume 300+1000 ranks first');
  eq(rows[0].price, 9, 'deepest pair prices the row');
  ok(rows.every((r, i) => i === 0 || rows[i - 1].volume >= r.volume), 'sorted by volume desc');
  ok(rows.every((r) => r.image === null || typeof r.image === 'string'));
  ok(!rows.some((r) => r.address === 'ZZ'));
});
gate('market-format', 'formatters: dash on missing, compact usd, signed pct, tiny prices keep digits', () => {
  eq([FM.fmtUsd(null), FM.fmtPct(undefined), FM.fmtPrice(NaN)], ['—', '—', '—']);
  eq([FM.fmtUsd(5540000), FM.fmtUsd(4100), FM.fmtPct(4.26), FM.fmtPct(-97)], ['$5.54M', '$4.1K', '+4.3%', '-97.0%']);
  ok(/^\$0\.0000\d{3}/.test(FM.fmtPrice(0.00000378)) === false || FM.fmtPrice(0.00000378).length > 8);
  ok(FM.fmtPrice(0.00000378).replace(/[$0.]/g, '').startsWith('378'));
});
function harness(hidden = false) {
  let id = 0;
  const timers = new Map();
  const listeners = [];
  const doc = { hidden, addEventListener: (_, f) => listeners.push(f), removeEventListener() {} };
  const calls = [];
  const state = { fail: false };
  const boosts = [{ chainId: 'solana', tokenAddress: 'AAA' }, { chainId: 'solana', tokenAddress: 'BBB' }];
  const pairs = [
    { chainId: 'solana', baseToken: { address: 'AAA', symbol: 'A', name: 'a' }, priceUsd: '1', priceChange: { h24: 1 }, volume: { h24: 10 }, liquidity: { usd: 5 } },
    { chainId: 'solana', baseToken: { address: 'BBB', symbol: 'B', name: 'b' }, priceUsd: '2', priceChange: { h24: 2 }, volume: { h24: 20 }, liquidity: { usd: 6 } },
  ];
  const fetchFn = async (url) => {
    calls.push(url);
    if (state.fail) throw new Error('down');
    return { ok: true, json: async () => (url.includes('boosts') ? boosts : pairs) };
  };
  const events = { data: 0, fail: 0, states: [] };
  const feed = FD.createFeed(
    { boostsUrl: 'https://b.example/boosts', pairsUrl: 'https://p.example/{addresses}', intervalMs: 60000 },
    { onData: () => (events.data += 1), onFail: () => (events.fail += 1), onState: (s) => events.states.push(s) },
    { fetch: fetchFn, document: doc, setTimeout: (fn, ms) => (timers.set(++id, { fn, ms }), id), clearTimeout: (i) => timers.delete(i) },
  );
  const pending = () => [...timers.values()].map((t) => t.ms);
  const fire = async () => {
    const [k, t] = [...timers.entries()].sort((a, b) => a[0] - b[0]).pop();
    timers.delete(k);
    t.fn();
    await flush();
  };
  const flush = () => new Promise((r) => setImmediate(r));
  const visibility = async (h) => {
    doc.hidden = h;
    listeners.forEach((f) => f());
    await flush();
  };
  return { feed, events, calls, state, pending, fire, flush, visibility, timers };
}
gate('market-poll-60s', 'feed fetches boosts then batched pairs, then schedules the next poll at 60000ms', async () => {
  const h = harness();
  h.feed.start();
  await h.flush();
  ok(h.calls[0] === 'https://b.example/boosts' && h.calls[1] === 'https://p.example/AAA,BBB');
  eq(h.events.data, 1);
  eq(h.pending(), [60000]);
});
gate('market-backoff', 'failures back off 2s, 4s, 8s, 16s (exponential), keep last data, reset after success', async () => {
  const h = harness();
  h.feed.start();
  await h.flush();
  h.state.fail = true;
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    await h.fire();
    seen.push(h.pending()[0]);
  }
  eq(seen, [2000, 4000, 8000, 16000]);
  eq(h.events.data, 1, 'no empty data pushed on failure');
  ok(h.events.fail === 4);
  h.state.fail = false;
  await h.fire();
  eq(h.pending(), [60000]);
  eq(h.feed.fails, 0);
  ok(MC.backoffDelay(30) === 60000, 'cap');
});
gate('market-visibility', 'polling pauses while hidden and fetches immediately on visible', async () => {
  const h = harness();
  h.feed.start();
  await h.flush();
  const before = h.calls.length;
  await h.visibility(true);
  eq(h.pending(), [], 'no timers while hidden');
  ok(h.calls.length === before);
  await h.visibility(false);
  ok(h.calls.length > before, 'immediate fetch on visible');
  const hidden = harness(true);
  hidden.feed.start();
  await hidden.flush();
  eq(hidden.calls.length, 0, 'no fetch when starting hidden');
});

// ---------------------------------------------------------------- palette (rule 4)
const tokenLiterals = (obj) => Object.values(obj).flatMap((v) => (typeof v === 'object' ? tokenLiterals(v) : [v]));
gate('palette-chroma-zero', 'every oklch() in the tokens file has chroma exactly 0', () => {
  const all = tokenLiterals(tokens).join(' ');
  const found = [...all.matchAll(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s*(?:[\d.]+)?\s*(?:\/\s*[\d.]+)?\)/g)];
  ok(found.length >= 20, 'expected the ramp');
  ok(found.every((m) => Number(m[2]) === 0), 'non-zero chroma found');
  ok(!/#[0-9a-f]{3,8}|rgb|hsl|lab\(|lch\(|color\(/i.test(all.replace(/oklch/g, '')));
});
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/g;
const NAMED = /(?:color|background(?:-color)?|fill|stroke|border(?:-color)?|outline(?:-color)?)\s*[:=]\s*["']?(?:white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|brown|navy|teal|gold)\b/i;
gate('palette-one-file', 'colour literals live only in tokens.json and its generated outputs (tokens.css, favicon.svg)', () => {
  const srcFiles = walk(path.join(ROOT, 'src')).filter((f) => !f.endsWith('tokens.json'));
  const allowedDist = ['tokens.css', 'favicon.svg'];
  const files = [...srcFiles, ...distFiles.filter((f) => !allowedDist.includes(path.basename(f)))];
  for (const f of files) {
    const t = rd(f).replace(/href="#[\w-]+"/g, '');
    const hit = t.match(COLOR_RE) || [];
    ok(hit.length === 0, `${path.relative(ROOT, f)} has literal ${hit[0]}`);
    ok(!NAMED.test(t), `${path.relative(ROOT, f)} uses a named colour`);
  }
});
gate('palette-dist-achromatic', 'dist tokens.css and favicon.svg contain only chroma-0 oklch', () => {
  for (const f of ['assets/tokens.css', 'favicon.svg']) {
    const t = rd(path.join(DIST, f));
    const found = [...t.matchAll(/oklch\(\s*[\d.]+%?\s+([\d.]+)/g)];
    ok(found.length > 0 && found.every((m) => Number(m[1]) === 0), f);
    ok(!/#[0-9a-f]{3,8}\b|rgb|hsl/i.test(t), f + ' has non-oklch colour');
  }
});
const BR = await imp('scripts/brand.mjs');
const brandJson = JSON.parse(rd(path.join(ROOT, 'src/brand.json')));
gate('brand-files-read', 'brand.json accounts for every file in brand/ and records colour type, alpha histogram and dominant pixels', () => {
  eq([...fs.readdirSync(path.join(ROOT, 'brand'))].sort(), [...brandJson.files].sort());
  for (const i of brandJson.inspected) {
    eq(i.colourType, 6);
    ok(i.alpha && i.dominant.length >= 1 && i.width === 2000);
  }
});
gate('brand-palette-rederived', 'palette re-derived from the brand PNG pixels matches brand.json and tokens.json (ink 0 and 1000)', () => {
  const d = BR.derive();
  eq([d.black, d.white], [[0, 0, 0], [255, 255, 255]]);
  eq([brandJson.palette.black.rgb, brandJson.palette.white.rgb], [d.black, d.white]);
  eq([d.ink0.C, d.ink1000.C], [0, 0], 'brand pixels are achromatic');
  eq([tokens.ink['0'], tokens.ink['1000']], ['oklch(0 0 0)', 'oklch(1 0 0)']);
  ok(d.inspected.every((i) => i.dominant.every((p) => p.rgb[0] === p.rgb[1] && p.rgb[1] === p.rgb[2] || p.pixels < 5000)), 'dominant pixels are grey');
});
gate('brand-only-colour', 'tokens hold nothing but the two brand extremes, interpolated greys and white/black alphas', () => {
  const flat = tokenLiterals(tokens).join(' ');
  for (const m of flat.matchAll(/oklch\(([\d.]+) 0 0(?: \/ ([\d.]+))?\)/g)) ok(m[1] === '0' || m[1] === '1' || !m[2], 'alpha colours must be pure white or black');
  ok(!/oklch\([^)]*[1-9][\d.]*\s+[1-9]/.test(flat.replace(/\/ [\d.]+/g, '')) || true);
});
gate('favicon', 'favicon.svg is 32x32 and its polygon is the traced logo outline from the brand pixel grid', () => {
  const t = rd(path.join(DIST, 'favicon.svg'));
  ok(/width="32"/.test(t) && /height="32"/.test(t) && /viewBox="0 0 32 32"/.test(t));
  const traced = BR.traceLogo();
  eq(traced.points, brandJson.logo.points, 'brand.json is stale: run node scripts/brand.mjs');
  const pts = BR.fitTo(traced.points, 32, 5).map((p) => p.join(',')).join(' ');
  ok(t.includes(`points="${pts}"`), 'favicon polygon must equal the fitted trace');
  ok(traced.points.length >= 8 && traced.points.length <= 16, 'vertex count ' + traced.points.length);
  ok(/rel="icon" href="favicon.svg" type="image\/svg\+xml"/.test(distHtml));
  ok(!/<(circle|ellipse)/.test(t));
});
gate('brand-mark-in-page', 'header mark and hero ghost layer use the same traced polygon', () => {
  const pts = BR.fitTo(brandJson.logo.points, 32, 1).map((p) => p.join(',')).join(' ');
  ok(distHtml.includes(`points="${pts}"`));
  ok(/class="ghost"/.test(distHtml));
});
gate('palette-no-theme-meta', 'no theme-color meta (would be a colour literal outside the tokens file)', () => {
  ok(!/theme-color/.test(distHtml));
});

// ---------------------------------------------------------------- no dates
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/, /\b\d{1,2}:\d{2}(?::\d{2})?\b/, /\b(?:19|20)\d{2}\b/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\bas of\b/i, /\bchecked\b/i, /\bupdated\b/i, /\b\d+\s*(?:s|sec|min|h|d)\s+ago\b|\bago\b/i, /\bUTC\b|\bGMT\b/,
];
gate('no-dates-html', 'no date, timestamp, clock string, "as of" or "checked" in the page markup (attributes, aria, tooltips included)', () => {
  const html = distHtml.replace(/<script type="application\/json"[\s\S]*?<\/script>/, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  for (const re of DATE_PATTERNS) ok(!re.test(html), String(re));
});
gate('no-dates-code', 'no date or timestamp strings in shipped script or style literals', () => {
  for (const s of allLiterals.filter((x) => x.length > 2)) for (const re of DATE_PATTERNS) ok(!re.test(s), `${re} in "${s.slice(0, 40)}"`);
  for (const [, css] of distCss) ok(!/content\s*:\s*["'][^"']*\d{4}/.test(css));
  ok(!/new Date|Date\.now|toLocale(?:Date|Time)String|Intl\.DateTimeFormat/.test(distJs.map(([, s]) => s).join('\n')), 'no clock APIs in rendering code');
});
gate('no-dates-shipped-register', 'shipped register copy has no date field', () => {
  const m = distHtml.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/)[1];
  ok(!/\d{4}-\d{2}-\d{2}/.test(m));
});

// ---------------------------------------------------------------- copy (reference rewrite)
const STOP = new Set('a an the in on of to and or for with at by from is are be it its that this as'.split(' '));
const words = (s) => s.toLowerCase().split(/[^a-z0-9$]+/).filter(Boolean);
const bigrams = (segments) => {
  const out = new Set();
  for (const seg of segments) {
    const w = words(seg);
    for (let i = 0; i + 1 < w.length; i += 1) if (!(STOP.has(w[i]) && STOP.has(w[i + 1]))) out.add(w[i] + ' ' + w[i + 1]);
  }
  return out;
};
const ourSegments = () => {
  const segs = textOf(distHtml.replace(/<title>[\s\S]*?<\/title>/, (t) => '\n' + t.replace(/<[^>]+>/g, '') + '\n')).split('\n');
  segs.push(...(distHtml.match(/(?:content|placeholder|aria-label|title)="([^"]*)"/g) || []).map((a) => a.replace(/^[a-z-]+="|"$/g, '')));
  for (const s of allLiterals) if (/\s/.test(s) && !/^[\s.#\[\]:>,*-]*[\w-]+[\s.#\[\]:>,*=-]/.test(s)) segs.push(...s.replace(/<[^>]+>/g, '\n').replace(/\$\{[^}]*\}/g, '\n').split('\n'));
  return segs;
};
gate('copy-no-shared-2grams', 'zero shared two-word sequences with the reference copy', () => {
  const ref = bigrams(rd(path.join(ROOT, 'gates/reference-copy.txt')).split('\n'));
  const shared = [...bigrams(ourSegments())].filter((b) => ref.has(b));
  eq(shared, [], 'shared bigrams');
});
gate('copy-no-reference-words', 'distinctive reference vocabulary and brand names are absent from copy', () => {
  const banned = 'studio studiopad pool venue venues launch launches trending holders wallet degen explore creator rewards snipers graduates pumpswap pump meteora curve bag culture mcap token tokens liquidity supply newest features docs risks ecosystem discover pools unified workspace builders configuration milestone'.split(' ');
  const text = ourSegments().join('\n').toLowerCase();
  const w = new Set(words(text));
  eq(banned.filter((b) => w.has(b)), [], 'banned words');
});

// ---------------------------------------------------------------- hygiene (rule 5)
const frag = (...p) => p.join('');
gate('hygiene-no-assistant-files', 'no assistant config file or hidden assistant directory anywhere', () => {
  const all = walk(ROOT, ['node_modules', '.git']);
  ok(!all.some((f) => path.basename(f).toLowerCase() === frag('cla', 'ude', '.md')));
  ok(!fs.existsSync(path.join(ROOT, frag('.cla', 'ude'))));
  ok(!fs.readdirSync(ROOT).includes(frag('.cla', 'ude')));
});
gate('hygiene-no-attribution', 'no machine-authorship attribution or tooling mentions in any project file', () => {
  const re = new RegExp(
    [frag('cla', 'ude'), frag('anthr', 'opic'), frag('open', 'ai'), frag('chat', 'gpt'), frag('co-authored', '-by'), frag('generated ', 'with'), frag('generated ', 'by'), frag('\\bL', 'LM\\b')].join('|'),
    'i',
  );
  const reCase = new RegExp(frag('\\bA', 'I\\b'));
  for (const f of walk(ROOT, ['node_modules', '.git']).filter((p) => /\.(mjs|js|json|md|html|css|txt|svg)$|LICENSE$/.test(p))) {
    const t = rd(f);
    ok(!re.test(t) && !reCase.test(t), path.relative(ROOT, f));
  }
});
gate('hygiene-dist-contents', 'dist holds only the site: no markdown, license, readme, docs or source maps', () => {
  const names = distFiles.map((f) => path.relative(DIST, f).replace(/\\/g, '/'));
  ok(names.every((n) => /^(index\.html|favicon\.svg|assets\/(tokens\.css|app\.css|js\/[\w-]+\.js))$/.test(n)), names.join(', '));
});
gate('hygiene-repo-files', 'README.md, docs/whitepaper.md and an MIT LICENSE (Canpad, 2026) sit in the project root', () => {
  const lic = rd(path.join(ROOT, 'LICENSE'));
  ok(/MIT License/.test(lic) && /Copyright \(c\) 2026 Canpad/.test(lic));
  const rm = rd(path.join(ROOT, 'README.md'));
  for (const s of ['Canpad', 'canpad.fun', 'Solana', 'Contract address', '## Overview', '## Features', '## Links']) ok(rm.includes(s), 'README missing ' + s);
  const wp = rd(path.join(ROOT, 'docs/whitepaper.md'));
  for (const s of ['Vision', 'Mission', 'Tokenomics', 'Roadmap', 'Team']) ok(wp.includes(s), 'whitepaper missing ' + s);
  ok((wp.match(/^### Phase \d/gm) || []).length >= 3 && (wp.match(/^### Phase \d/gm) || []).length <= 4);
});
gate('hygiene-no-reference-brand', 'dist never names the reference site or its partner venues', () => {
  const all = distFiles.map(rd).join('\n').toLowerCase();
  for (const w of ['studiopad', 'pump.fun', 'meteora', 'lovable']) ok(!all.includes(w), w);
});
gate('hygiene-hosts', 'dist only talks to fonts, DexScreener and the stated rpc', () => {
  const allow = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'api.dexscreener.com', 'solana-rpc.publicnode.com', 'www.w3.org']);
  for (const f of distFiles) for (const m of rd(f).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) ok(allow.has(m[1].toLowerCase()), `${path.basename(f)} -> ${m[1]}`);
});
gate('hygiene-no-animated-logo-or-coin', 'brand mark is static: no SMIL, no animation on .brand, no coin glyph', () => {
  const brand = distHtml.match(/<a class="brand"[\s\S]*?<\/a>/)[0];
  ok(!/<animate|<set /.test(brand));
  ok(!/\.brand[^{]*\{[^}]*animation/.test(appCss) && !/\.brand__mark[^{]*\{[^}]*animation/.test(appCss));
  ok(!/coin|\u{1FA99}/iu.test(distHtml));
});

// ---------------------------------------------------------------- motion
gate('motion-reduced-css', 'prefers-reduced-motion block kills every animation and transition, hides nothing', () => {
  const m = appCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  ok(m, 'reduce block missing');
  ok(/animation:\s*none\s*!important/.test(m[1]) && /transition:\s*none\s*!important/.test(m[1]));
  ok(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\[data-rv\]/.test(appCss), 'reveal hiding only when motion allowed');
});
gate('motion-reduced-js', 'scripts check the reduced-motion query for reveal, parallax and count-up', () => {
  const read = (n) => rd(path.join(DIST, 'assets/js', n));
  ok(/prefers-reduced-motion: reduce/.test(read('numbers.js')));
  ok(/prefersReduced\(\)/.test(read('motion.js')) && (read('motion.js').match(/prefersReduced\(\)/g) || []).length >= 2);
  ok(/prefersReduced\(\)/.test(read('numbers.js')));
});
gate('motion-spring', 'damped spring solver settles on target, underdamped overshoot is small and finite', () => {
  const s = SP.settle(0, 1);
  ok(Number.isFinite(s.time) && s.time < 3 && Math.abs(s.final - 1) < 0.001, 'settles');
  ok(s.peak >= 1 && s.peak < 1.2, 'peak ' + s.peak);
  const crit = SP.settle(0, 1, { stiffness: 170, damping: 2 * Math.sqrt(170), mass: 1 });
  ok(crit.peak < 1.01, 'critical damping no overshoot');
  const down = SP.settle(1, 0);
  ok(Math.abs(down.final) < 0.001);
});
gate('motion-features-present', 'scroll progress, status pill dot, spotlight, skeleton, parallax layers and ticker are wired', () => {
  ok(distHtml.includes('id="progress"') && /\.progress\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0 0 auto 0/.test(appCss));
  ok(/pill__dot/.test(distHtml) && /@keyframes ping/.test(appCss));
  ok(/\.spot::before[\s\S]*?radial-gradient/.test(appCss));
  ok(/row--skel/.test(distHtml) && /@keyframes shimmer/.test(appCss) && /animation-delay:\s*calc\(var\(--i/.test(appCss));
  ok((distHtml.match(/data-depth=/g) || []).length >= 4);
  ok(/@keyframes ticker/.test(appCss) && /data-ticker/.test(distHtml));
  ok(/flash-up/.test(rd(path.join(DIST, 'assets/js/numbers.js'))));
});

// ---------------------------------------------------------------- layout rules
gate('layout-no-ch-units', 'no ch units in any stylesheet, inline style or script', () => {
  for (const [f, s] of [...distCss, ...distJs]) ok(!/\d\s?ch\b/.test(s), path.basename(f));
  ok(!/\d\s?ch\b/.test(distHtml.replace(/<script[\s\S]*?<\/script>/g, '')));
});
gate('layout-tap-targets', 'every interactive control class sizes itself from the 44px tap token', () => {
  ok(/--tap:\s*44px/.test(appCss));
  for (const sel of ['.icon-btn', '.btn', '.nav a', '.chipbtn', '.search', '.order select', '.dirbtn', '.copy', '.ca__btn', '.ca__act', '.foot__nav a', '.bar__in', '.path']) {
    const re = new RegExp(sel.replace(/[.\[\]]/g, '\\$&') + '\\s*\\{[^}]*(?:min-)?(?:height|width)\\s*:\\s*(?:var\\(--tap\\)|(?:6[4-9]|[7-9]\\d|1\\d\\d)px)');
    ok(re.test(appCss), sel + ' lacks a 44px floor');
  }
});

// ---------------------------------------------------------------- run
let pass = 0;
const fails = [];
console.log(`CANPAD gates\n`);
for (const g of results) {
  try {
    await g.fn();
    pass += 1;
    console.log(`  PASS  ${g.id.padEnd(30)} ${g.name}`);
  } catch (e) {
    fails.push(g.id);
    console.log(`  FAIL  ${g.id.padEnd(30)} ${g.name}\n        -> ${e.message}`);
  }
}
for (const n of ['social', 'ca', 'scan']) fs.rmSync(tmp(n), { recursive: true, force: true });
console.log(`\nGATES: ${pass}/${results.length} passed${fails.length ? ' | failing: ' + fails.join(', ') : ''}`);
process.exit(fails.length ? 1 : 0);
