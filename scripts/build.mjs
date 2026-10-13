import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fitTo } from './brand.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

export function tokensCss(tokens) {
  const lines = [];
  for (const [group, vals] of Object.entries(tokens)) {
    for (const [k, v] of Object.entries(vals)) lines.push(`  --${group}-${k}: ${v};`);
  }
  return `:root {\n${lines.join('\n')}\n}\n`;
}

const brand = () => JSON.parse(read('src/brand.json'));
const poly = (pts) => pts.map((p) => p.join(',')).join(' ');

// 32x32 favicon: the traced logo outline on the brand black, colours straight from tokens.
export function faviconSvg(tokens) {
  const pts = fitTo(brand().logo.points, 32, 5);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" fill="${tokens.ink['0']}"/>` +
    `<polygon points="${poly(pts)}" fill="${tokens.ink['1000']}"/>` +
    `</svg>
`
  );
}

export function markSvg(size = 28, cls = 'brand__mark') {
  const pts = fitTo(brand().logo.points, 32, 1);
  return `<svg class="${cls}" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false"><polygon points="${poly(pts)}" fill="currentColor"/></svg>`;
}

export function ghostSvg() {
  const pts = fitTo(brand().logo.points, 100, 0);
  return `<svg class="ghost" data-depth="0.7" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><polygon points="${poly(pts)}" fill="currentColor"/></svg>`;
}

// Dates live in register.json as data only; the shipped copy drops them.
export function runtimeRegister(reg) {
  const copy = JSON.parse(JSON.stringify(reg));
  for (const r of copy.records) delete r.recorded;
  return copy;
}

function safeClean(out) {
  const abs = path.resolve(out);
  const inRoot = abs === path.join(ROOT, 'dist');
  const inTmp = abs.startsWith(path.resolve(os.tmpdir()) + path.sep);
  if (!inRoot && !inTmp) throw new Error('refusing to clean ' + abs);
  fs.rmSync(abs, { recursive: true, force: true });
}

export async function build({ register, out = path.join(ROOT, 'dist') } = {}) {
  const reg = register || JSON.parse(read('src/register.json'));
  const tokens = JSON.parse(read('src/tokens.json'));
  const modelUrl = pathToFileURL(path.join(ROOT, 'src/js/model.js')).href;
  const tplUrl = pathToFileURL(path.join(ROOT, 'src/js/templates.js')).href;
  const { buildModel, validateRegister } = await import(modelUrl);
  const tpl = await import(tplUrl);

  const problems = validateRegister(reg);
  if (problems.length) throw new Error('register invalid: ' + problems.join('; '));
  const model = buildModel(reg);

  safeClean(out);
  fs.mkdirSync(path.join(out, 'assets', 'js'), { recursive: true });

  const json = JSON.stringify(runtimeRegister(reg)).replace(/</g, '\\u003c');
  let html = read('src/index.html');
  html = html
    .replace('<!--@register-->', json)
    .replace('<!--@mark-->', markSvg())
    .replace('<!--@ghost-->', ghostSvg())
    .replace('<!--@social-->', tpl.socialIcons(model))
    .replace('<!--@ca-->', tpl.caSlot(model))
    .replace('<!--@ticker-->', tpl.tickerSkeleton(10) + tpl.tickerSkeleton(10))
    .replace('<!--@skeleton-->', tpl.skeletonRows(10))
    .replace('<!--@records-->', tpl.recordChips(model));

  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'favicon.svg'), faviconSvg(tokens));
  fs.writeFileSync(path.join(out, 'assets', 'tokens.css'), tokensCss(tokens));
  fs.copyFileSync(path.join(ROOT, 'src/styles.css'), path.join(out, 'assets', 'app.css'));
  for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
    fs.copyFileSync(path.join(ROOT, 'src/js', f), path.join(out, 'assets', 'js', f));
  }
  return { out, model };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build()
    .then(({ out }) => console.log('built ->', path.relative(ROOT, out) || out))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
