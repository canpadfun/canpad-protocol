import { buildModel } from './model.js';
import { socialIcons, caSlot, recordChips, ICONS } from './templates.js';
import { createFeed } from './feed.js';
import { createBoard } from './board.js';
import { initProgress, initReveal, initParallax, initSpotlight } from './motion.js';

window.__canpad = true;

const reg = JSON.parse(document.getElementById('register').textContent);
const model = buildModel(reg);

const live = document.getElementById('sr-live');
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  live.textContent = '';
  requestAnimationFrame(() => (live.textContent = 'Copied'));
}

// Static slots, rebuilt from the register record so runtime and build agree.
document.querySelector('.social').innerHTML = socialIcons(model);
const caHost = document.getElementById('top');
caHost.innerHTML = caSlot(model);
document.querySelector('.chips-grid').innerHTML = recordChips(model);

caHost.addEventListener('click', (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-copy-ca]') : null;
  if (!btn || !model.ca.live) return;
  copyText(model.ca.value).then(() => {
    btn.setAttribute('data-done', '');
    btn.querySelector('[data-copy-text]').textContent = 'Copied';
    btn.querySelector('[data-ico]').innerHTML = ICONS.check;
    setTimeout(() => {
      btn.removeAttribute('data-done');
      btn.querySelector('[data-copy-text]').textContent = 'Copy';
      btn.querySelector('[data-ico]').innerHTML = ICONS.copy;
    }, 1600);
  });
});

// Optional on-chain confirmation of a stated address. Silent on any failure.
if (model.ca.live && model.chain.rpc) {
  fetch(model.chain.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [model.ca.value, { encoding: 'base64' }] }),
  })
    .then((r) => r.json())
    .then((j) => {
      if (j && j.result && j.result.value) caHost.querySelector('.ca__label').textContent += ' · found at that address';
    })
    .catch(() => {});
}

initProgress(document.getElementById('progress'));
initSpotlight();
initReveal();
initParallax(document.getElementById('hero'));

const board = createBoard(document, copyText);
if (!model.market.live) {
  board.setState('inert');
  board.inert();
} else {
  board.skeleton();
  const feed = createFeed(model.market, {
    onData: (rows) => board.data(rows),
    onFail: () => board.fail(),
    onState: (s) => board.setState(s),
  });
  feed.start();
}
