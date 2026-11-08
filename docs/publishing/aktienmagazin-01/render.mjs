// Setzt das Aktienmagazin aus pages/*.html zusammen (magazin.html) und rendert PDF und PNG.
// node docs/publishing/aktienmagazin-01/render.mjs [--out <ordner>] [--scale 1|2] [--pages 1-5] [--no-pdf]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(here, 'out')));
const scale = Number(arg('--scale', '1'));
const range = arg('--pages', null);
fs.mkdirSync(out, { recursive: true });

// 1. Zusammensetzen
const files = fs.readdirSync(path.join(here, 'pages')).filter((f) => /^\d\d.*\.html$/.test(f)).sort();
const icons = fs.readFileSync(path.join(here, '../../../assets/product-icons.svg'), 'utf8').replace(/<svg /, '<svg style="display:none" ');
const body = icons + files.map((f) => `<!-- ${f} -->\n` + fs.readFileSync(path.join(here, 'pages', f), 'utf8')).join('\n');
const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>Vision Universe Aktienmagazin · Nr. 01 · 09.11.2026</title>
<link rel="stylesheet" href="mag.css">
<script src="data.js"></script><script src="charts.js"></script><script src="lib.js"></script>
</head><body>
${body}
<script>VUM.finish();</script>
</body></html>
`;
fs.writeFileSync(path.join(here, 'magazin.html'), html);

// 2. Rendern
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: scale });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => errors.push('fehlt: ' + r.url().split('/').slice(-2).join('/')));
await page.goto(pathToFileURL(path.join(here, 'magazin.html')).href);
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 15000 }).catch(() => errors.push('nicht fertig'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].flatMap((p, i) => {
  const r = p.getBoundingClientRect();
  return [...p.querySelectorAll('.pad *')]
    .filter((el) => { const b = el.getBoundingClientRect(); return b.height > 0 && b.width > 0 && (b.bottom > r.bottom - 13 || b.right > r.right - 8); })
    .slice(0, 2).map((el) => `S${i + 1}: ${(el.className || el.tagName).toString().slice(0, 20)} „${el.textContent.trim().slice(0, 30)}“`);
}));
const pages = await page.$$('.page');
let [a, b] = range ? range.split('-').map(Number) : [1, pages.length];
b = b || a;
for (let i = a - 1; i < Math.min(b, pages.length); i++) await pages[i].screenshot({ path: path.join(out, `s${String(i + 1).padStart(2, '0')}.png`) });
if (!process.argv.includes('--no-pdf')) await page.pdf({ path: path.join(out, 'aktienmagazin-01.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
console.log(pages.length, 'Seiten', errors.length ? 'FEHLER ' + [...new Set(errors)].join(' | ') : 'ok', overflow.length ? '\nÜBERLAUF ' + overflow.join(' | ') : '');
await browser.close();
