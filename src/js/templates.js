// Isomorphic string templates: used at build time (static markup) and in the browser.
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const X_PATH =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const GH_PATH =
  'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';

export const ICONS = {
  x: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="${X_PATH}"/></svg>`,
  github: `<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="${GH_PATH}"/></svg>`,
  copy: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><rect x="5.25" y="5.25" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.75 3.75v-.5a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  check: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="m3 8.5 3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tick: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="m3 8.5 3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function socialIcons(model) {
  return model.social
    .map((s) => {
      if (s.live) {
        const name = s.handle ? `${s.label} ${s.handle}` : s.label;
        return `<a class="icon-btn" data-social="${s.id}" href="${esc(s.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(name)}">${ICONS[s.id]}</a>`;
      }
      return `<span class="icon-btn is-inert" data-social="${s.id}" role="img" aria-disabled="true" aria-label="${esc(s.label)}, pending" title="${esc(s.label)} · pending">${ICONS[s.id]}</span>`;
    })
    .join('');
}

export function caSlot(model) {
  const { ca } = model;
  if (!ca.live) {
    return `<div class="ca__in" data-ca="inert"><span class="ca__label">${esc(ca.label)}</span><span class="ca__value ca__value--pending">pending</span></div>`;
  }
  return `<div class="ca__in" data-ca="live"><span class="ca__label">${esc(ca.label)}</span><button class="ca__btn" type="button" data-copy-ca aria-label="Copy contract address"><span class="ca__value">${esc(ca.value)}</span><span class="ca__act"><span class="ca__ico" data-ico>${ICONS.copy}</span><span data-copy-text>Copy</span></span></button></div>`;
}

export function recordChips(model) {
  return model.records
    .map(
      (r) =>
        `<li class="chip spot${r.live ? ' is-live' : ' is-inert'}" data-rv data-record="${r.id}"><span class="chip__label">${esc(r.label)}</span><span class="chip__text">${esc(r.text)}</span></li>`,
    )
    .join('');
}

export function logoTile(row) {
  const letter = (String(row.symbol || row.name || '?').match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase();
  const img = row.image
    ? `<img src="${esc(row.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-logo>`
    : '';
  return `<span class="logo" aria-hidden="true"><b>${esc(letter)}</b>${img}</span>`;
}

export function rowHTML(row, i) {
  const sym = row.symbol ? '$' + row.symbol : '—';
  return `<div class="row spot" role="row" data-addr="${esc(row.address)}" style="--i:${i}">
<div class="cell cell--rank" role="cell"><span class="rank">${i + 1}</span></div>
<div class="cell cell--asset" role="cell">${logoTile(row)}<span class="asset"><span class="asset__sym">${esc(sym)}</span><span class="asset__name">${esc(row.name || '')}</span></span></div>
<div class="cell cell--price" role="cell" data-label="Price"><span class="num" data-k="price"></span></div>
<div class="cell cell--chg" role="cell" data-label="Δ 24h"><span class="num chg" data-k="pct"></span></div>
<div class="cell cell--vol" role="cell" data-label="Turnover"><span class="num" data-k="usd" data-f="volume"></span></div>
<div class="cell cell--liq" role="cell" data-label="Depth"><span class="num" data-k="usd" data-f="liquidity"></span></div>
<div class="cell cell--act" role="cell"><button class="copy" type="button" data-copy-mint aria-label="Copy mint address for ${esc(sym)}">${ICONS.copy}</button></div>
</div>`;
}

export function skeletonRows(n = 10) {
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += `<div class="row row--skel" role="row" aria-hidden="true" style="--i:${i}"><div class="cell cell--rank"><span class="sk sk--s"></span></div><div class="cell cell--asset"><span class="sk sk--c"></span><span class="sk sk--l"></span></div><div class="cell cell--price" data-label="Price"><span class="sk sk--m"></span></div><div class="cell cell--chg" data-label="Δ 24h"><span class="sk sk--m"></span></div><div class="cell cell--vol" data-label="Turnover"><span class="sk sk--m"></span></div><div class="cell cell--liq" data-label="Depth"><span class="sk sk--m"></span></div><div class="cell cell--act"><span class="sk sk--b"></span></div></div>`;
  }
  return out;
}

export function tickerItem(row) {
  const sym = row.symbol ? '$' + row.symbol : '—';
  return `<span class="tick" data-addr="${esc(row.address)}">${logoTile(row)}<span class="tick__sym">${esc(sym)}</span><span class="tick__px" data-t="price"></span><span class="tick__chg chg" data-t="pct"></span></span>`;
}

export function tickerSkeleton(n = 8) {
  let out = '';
  for (let i = 0; i < n; i += 1) out += '<span class="tick tick--skel" aria-hidden="true"><span class="sk sk--c"></span><span class="sk sk--m"></span><span class="sk sk--s"></span></span>';
  return out;
}
