// Rendert die Konzeptseiten zu PDF und PNG-Vorschauen.
// node docs/publishing/konzept-2026-11/render.mjs [--out <ordner>] [--scale 1|2] [--only magazin]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(here, 'out')));
const scale = Number(arg('--scale', '1'));
const only = arg('--only', null);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const name of ['magazin', 'report-amd'].filter((n) => !only || n === only)) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(path.join(here, name + '.html')).href);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 10000 }).catch(() => errors.push('nicht fertig'));
  await page.evaluate(() => document.fonts.ready);
  // Überlauf: kein Element in .pad darf über den Seitenrand ragen
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].flatMap((p, i) => {
    const r = p.getBoundingClientRect();
    return [...p.querySelectorAll('.pad *')]
      .filter((el) => { const b = el.getBoundingClientRect(); return b.height > 0 && (b.bottom > r.bottom - 14 || b.right > r.right - 8); })
      .slice(0, 3)
      .map((el) => `S${i + 1}: ${el.className || el.tagName} „${el.textContent.trim().slice(0, 40)}“`);
  }));
  const pages = await page.$$('.page');
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(out, `${name}-${String(i + 1).padStart(2, '0')}.png`) });
  await page.pdf({ path: path.join(out, name + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log(name, pages.length, 'Seiten', errors.length ? 'FEHLER ' + errors.join(' | ') : 'ok', overflow.length ? 'ÜBERLAUF ' + overflow.join(' | ') : '');
  await page.close();
}
await browser.close();
