// Marktbriefing: echte Handy-Bildschirme der Ausgabe für die Produktseite (Owner 22.11.2026: das Mockup soll wie das
// Marktbriefing selbst aussehen, nicht wie die dunklen Karten). Nimmt landing/marktbriefing/<sitzung>/index.html über
// file:// mit Playwright auf (390×844, ohne Kopf der Website) und schreibt bildschirm-NN.jpg in den Ordner der Ausgabe.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function playwright() {
  // wie pdf.mjs: lokal global, im Lauf über PLAYWRIGHT_PREFIX
  try { return require('playwright'); } catch { /* global */ }
  const prefixes = [process.env.PLAYWRIGHT_PREFIX, process.env.NODE_PATH, '/usr/lib/node_modules', '/usr/local/lib/node_modules'].filter(Boolean);
  for (const p of prefixes) { try { return createRequire(path.join(p, 'x.js'))('playwright'); } catch { /* weiter */ } try { return createRequire(path.join(p, 'node_modules', 'x.js'))('playwright'); } catch { /* weiter */ } }
  throw new Error('Playwright fehlt (PLAYWRIGHT_PREFIX oder NODE_PATH setzen).');
}

// Szenen für die Bildschirme, in dieser Reihenfolge, soweit vorhanden.
export const SCREEN_SCENES = ['start', 'indizes', 'marktbreite', 'ausblick'];

export async function writeScreens(editionHtml, outDir, { scenes = SCREEN_SCENES } = {}) {
  const { chromium } = playwright();
  const browser = await chromium.launch();
  const files = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
    await ctx.addInitScript(() => { try { localStorage.setItem('vu-consent', JSON.stringify({ v: 1, stats: false, t: '2026-01-01' })); localStorage.setItem('vu-nl-popup', '1'); sessionStorage.setItem('vu-nl-popup', '1'); } catch (e) { /* ohne Speicher */ } });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(editionHtml).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Kopf, Fortschrittsbalken der Seite und Hinweise ausblenden: der Bildschirm zeigt nur die Szene.
    await page.addStyleTag({ content: ':root{--mb-head:0px!important}body>header,.nav,.top,.sheet,.mb-bars,.mb-hint,[data-consent],.cookie,.mbt-float,.stickycta{display:none!important}html{scroll-snap-type:none!important}.mb-sc{min-height:844px!important}' });
    const ids = scenes.filter(Boolean);
    let n = 0;
    for (const id of ids) {
      const el = page.locator('#' + id);
      if (!(await el.count())) continue;
      await page.evaluate((x) => { const e = document.getElementById(x); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY); }, id);
      await page.waitForTimeout(1600);
      const f = path.join(outDir, 'bildschirm-' + String(++n).padStart(2, '0') + '.jpg');
      await page.screenshot({ path: f, type: 'jpeg', quality: 84 });
      files.push(f);
    }
  } finally { await browser.close(); }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [html, out] = process.argv.slice(2);
  if (!html || !out) { console.error('Aufruf: screens.mjs <ausgabe/index.html> <ordner>'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  console.log((await writeScreens(path.resolve(html), path.resolve(out))).join('\n'));
}
