import { solanaAddresses, collapsePairs, backoffDelay } from './market-core.js';

const TIMEOUT_MS = 12000;

// deps are injectable so the scheduler can be proven without a browser.
export function createFeed(market, handlers, deps = {}) {
  const fetchFn = deps.fetch || ((...a) => fetch(...a));
  const setT = deps.setTimeout || ((f, ms) => setTimeout(f, ms));
  const clearT = deps.clearTimeout || ((id) => clearTimeout(id));
  const doc = deps.document || document;
  const AC = deps.AbortController || AbortController;

  let timer = null;
  let ctl = null;
  let fails = 0;
  let gen = 0;
  let started = false;

  async function getJson(url, signal) {
    const killer = setT(() => ctl && ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn(url, { signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('status ' + res.status);
      return await res.json();
    } finally {
      clearT(killer);
    }
  }

  async function pull(signal) {
    const boosts = await getJson(market.boostsUrl, signal);
    const addrs = solanaAddresses(boosts);
    if (!addrs.length) throw new Error('empty boost list');
    const pairs = await getJson(market.pairsUrl.replace('{addresses}', addrs.join(',')), signal);
    const rows = collapsePairs(pairs);
    if (!rows.length) throw new Error('no pairs');
    return rows;
  }

  function schedule(ms) {
    clearT(timer);
    timer = setT(tick, ms);
  }

  async function tick() {
    if (doc.hidden || !started) return;
    const mine = ++gen;
    ctl = new AC();
    handlers.onState(fails ? 'retry' : 'syncing');
    try {
      const rows = await pull(ctl.signal);
      if (mine !== gen) return;
      fails = 0;
      handlers.onData(rows);
      handlers.onState('live');
      schedule(market.intervalMs);
    } catch (err) {
      if (mine !== gen) return;
      fails += 1;
      handlers.onFail(err, fails);
      handlers.onState('retry');
      schedule(backoffDelay(fails));
    }
  }

  function onVisibility() {
    if (!started) return;
    if (doc.hidden) {
      gen += 1;
      clearT(timer);
      timer = null;
      if (ctl) ctl.abort();
    } else {
      tick();
    }
  }

  return {
    start() {
      started = true;
      doc.addEventListener('visibilitychange', onVisibility);
      tick();
    },
    stop() {
      started = false;
      gen += 1;
      clearT(timer);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
    get fails() {
      return fails;
    },
  };
}
