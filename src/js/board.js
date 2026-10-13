import { rowHTML, skeletonRows, tickerItem, tickerSkeleton, esc } from './templates.js';
import { setNum } from './numbers.js';
import { FORMATTERS, DASH } from './format.js';

const PILL_TEXT = { syncing: 'Connecting', live: 'Live', retry: 'Reconnecting', inert: 'Pending' };
const placeholders = () =>
  Array.from({ length: 10 }, (_, i) => ({ address: `none-${i}`, symbol: '', name: '', price: null, change: null, volume: null, liquidity: null, image: null }));

export function createBoard(root, copyFn) {
  const $ = (s) => root.querySelector(s);
  const body = $('[data-body]');
  const empty = $('[data-empty]');
  const count = $('[data-count]');
  const err = $('[data-error]');
  const track = $('[data-ticker-track]');
  const dirBtn = $('[data-dir]');

  const rowEls = new Map();
  const view = { filter: 'all', q: '', sort: 'volume', dir: 'desc' };
  let data = [];
  let mode = 'skeleton';
  let hasData = false;
  let tickerKey = '';

  const key = { volume: 'volume', liquidity: 'liquidity', price: 'price', change: 'change' };

  function filtered() {
    let v = data.slice();
    if (view.filter === 'up') v = v.filter((r) => r.change > 0);
    if (view.filter === 'down') v = v.filter((r) => r.change < 0);
    const q = view.q.trim().toLowerCase();
    if (q) v = v.filter((r) => `${r.symbol} ${r.name}`.toLowerCase().includes(q));
    const k = key[view.sort];
    const sign = view.dir === 'desc' ? -1 : 1;
    v.sort((a, b) => {
      const av = a[k] == null ? -Infinity : a[k];
      const bv = b[k] == null ? -Infinity : b[k];
      return (av - bv) * sign;
    });
    return v;
  }

  function paintRow(el, r) {
    const num = (k, f) => el.querySelector(`[data-k="${k}"]${f ? `[data-f="${f}"]` : ':not([data-f])'}`);
    setNum(num('price'), r.price, 'price');
    setNum(num('pct'), r.change, 'pct');
    setNum(num('usd', 'volume'), r.volume, 'usd');
    setNum(num('usd', 'liquidity'), r.liquidity, 'usd');
    const btn = el.querySelector('[data-copy-mint]');
    btn.disabled = mode !== 'data';
  }

  function render() {
    const rows = mode === 'data' ? filtered() : data;
    if (mode !== 'skeleton' && !hasData && body.querySelector('.row--skel')) body.innerHTML = '';
    const keep = new Set(rows.map((r) => r.address));
    for (const [addr, el] of rowEls) {
      if (!keep.has(addr)) {
        el.remove();
        rowEls.delete(addr);
      }
    }
    rows.forEach((r, i) => {
      let el = rowEls.get(r.address);
      if (!el) {
        const t = document.createElement('template');
        t.innerHTML = rowHTML(r, i).trim();
        el = t.content.firstElementChild;
        rowEls.set(r.address, el);
      }
      el.style.setProperty('--i', i);
      el.querySelector('.rank').textContent = String(i + 1);
      if (body.children[i] !== el) body.insertBefore(el, body.children[i] || null);
      paintRow(el, r);
    });
    empty.hidden = !(mode === 'data' && rows.length === 0);
    count.textContent = mode === 'data' ? `${rows.length} mints` : '10 mints';
  }

  function buildTicker(rows) {
    const k = rows.map((r) => r.address).join(',');
    if (k !== tickerKey) {
      tickerKey = k;
      const one = rows.map(tickerItem).join('');
      track.innerHTML = one + one;
      // the second copy only exists for the seamless loop
      [...track.children].slice(rows.length).forEach((n) => n.setAttribute('aria-hidden', 'true'));
    }
    for (const r of rows) {
      track.querySelectorAll(`[data-addr="${CSS.escape(r.address)}"]`).forEach((n) => {
        n.querySelector('[data-t="price"]').textContent = FORMATTERS.price(r.price);
        const c = n.querySelector('[data-t="pct"]');
        c.textContent = FORMATTERS.pct(r.change);
        c.dataset.dir = r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat';
      });
    }
  }

  function summary(rows) {
    const flow = rows.reduce((s, r) => s + (r.volume || 0), 0);
    const depth = rows.reduce((s, r) => s + (r.liquidity || 0), 0);
    const set = (name, v, kind) => setNum($(`[data-sum="${name}"]`), v, kind);
    set('count', rows.length, 'int');
    set('flow', flow, 'usd');
    set('depth', depth, 'usd');
    const meter = (name, share) => {
      const s = Math.max(0, Math.min(1, share || 0)) * 100;
      $(`[data-meter="${name}"]`).style.width = s + '%';
      $(`[data-thumb="${name}"]`).style.left = s + '%';
    };
    meter('count', rows.length / 10);
    meter('flow', flow ? rows.slice(0, 3).reduce((s, r) => s + r.volume, 0) / flow : 0);
    meter('depth', depth ? Math.max(...rows.map((r) => r.liquidity)) / depth : 0);

    const best = (fn) => rows.reduce((a, b) => (fn(b) > fn(a) ? b : a), rows[0]);
    const busy = best((r) => r.volume);
    const up = best((r) => (r.change == null ? -Infinity : r.change));
    const deep = best((r) => r.liquidity);
    const tile = (id, row, v, kind) => {
      $(`[data-tile="${id}"]`).textContent = row.symbol ? '$' + row.symbol : DASH;
      setNum($(`[data-tile-sub="${id}"]`), v, kind);
    };
    tile('busy', busy, busy.volume, 'usd');
    tile('up', up, up.change, 'pct');
    tile('deep', deep, deep.liquidity, 'usd');
  }

  function showError(text) {
    err.textContent = text;
    err.hidden = !text;
  }

  root.addEventListener(
    'error',
    (e) => {
      if (e.target instanceof HTMLImageElement && e.target.hasAttribute('data-logo')) e.target.remove();
    },
    true,
  );

  body.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-copy-mint]') : null;
    if (!btn || btn.disabled) return;
    const addr = btn.closest('.row').dataset.addr;
    copyFn(addr).then(() => {
      btn.setAttribute('data-done', '');
      setTimeout(() => btn.removeAttribute('data-done'), 1600);
    });
  });

  root.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      view.filter = b.dataset.filter;
      root.querySelectorAll('[data-filter]').forEach((x) => {
        const on = x === b;
        x.classList.toggle('is-on', on);
        x.setAttribute('aria-pressed', String(on));
      });
      render();
    }),
  );
  $('[data-search]').addEventListener('input', (e) => {
    view.q = e.target.value;
    render();
  });
  $('[data-sort]').addEventListener('change', (e) => {
    view.sort = e.target.value;
    render();
  });
  dirBtn.addEventListener('click', () => {
    view.dir = view.dir === 'desc' ? 'asc' : 'desc';
    dirBtn.setAttribute('aria-pressed', String(view.dir === 'desc'));
    dirBtn.setAttribute('aria-label', view.dir === 'desc' ? 'Descending order' : 'Ascending order');
    render();
  });

  return {
    skeleton() {
      body.innerHTML = skeletonRows(10);
      track.innerHTML = tickerSkeleton(10) + tickerSkeleton(10);
    },
    setState(state) {
      if (hasData && state === 'syncing') return;
      root.querySelectorAll('[data-pill]').forEach((p) => {
        p.dataset.state = state;
        p.querySelector('[data-pill-text]').textContent = PILL_TEXT[state];
      });
    },
    data(rows) {
      data = rows;
      mode = 'data';
      render();
      hasData = true;
      buildTicker(rows);
      summary(rows);
      showError('');
    },
    fail() {
      if (hasData) {
        showError('Refresh failed. The last good rows stay up while retries back off.');
        return;
      }
      showError('The source did not answer. Retrying with backoff.');
      if (mode === 'skeleton') {
        data = placeholders();
        mode = 'dash';
        render();
        track.innerHTML = '<span class="tick"><span class="tick__sym">' + esc(DASH) + '</span></span>';
      }
    },
    inert() {
      data = placeholders();
      mode = 'dash';
      render();
      track.innerHTML = '<span class="tick"><span class="tick__sym">' + esc(DASH) + '</span></span>';
      showError('Feed pending.');
    },
  };
}
