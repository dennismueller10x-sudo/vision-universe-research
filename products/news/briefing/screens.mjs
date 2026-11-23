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

// Alle Szenen der Ausgabe als Bildschirme (Story in der App, Fächer auf der Produktseite). Lange Szenen werden ganz
// aufgenommen (Höhe bis 1400 px); die Liste mit id, Titel und Datei steht in bildschirme.json.
export async function writeScreens(editionHtml, outDir) {
  const { chromium } = playwright();
  const browser = await chromium.launch();
  const list = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
    await ctx.addInitScript(() => { try { localStorage.setItem('vu-consent', JSON.stringify({ v: 1, stats: false, t: '2026-01-01' })); localStorage.setItem('vu-nl-popup', '1'); sessionStorage.setItem('vu-nl-popup', '1'); } catch (e) { /* ohne Speicher */ } });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(editionHtml).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Kopf, Fortschrittsbalken der Seite und Hinweise ausblenden: der Bildschirm zeigt nur die Szene.
    await page.addStyleTag({ content: ':root{--mb-head:0px!important}body>header,.nav,.top,.sheet,.mb-bars,.mb-hint,.mb-acts,[data-consent],.cookie,.stickycta{display:none!important}html{scroll-snap-type:none!important}.mb-sc{min-height:844px!important}' });
    const scenes = await page.evaluate(() => [...document.querySelectorAll('.mb-sc')].map((e) => ({ id: e.id, toc: e.getAttribute('aria-label') || '' })));
    for (const sc of scenes) {
      if (sc.id === 'ende') continue; // Schluss mit Knöpfen und Quellen gehört auf die Seite, nicht in die Story
      await page.evaluate((x) => { const e = document.getElementById(x); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY); }, sc.id);
      await page.waitForTimeout(1500);
      const box = await page.locator('#' + sc.id).boundingBox();
      const file = 'bildschirm-' + String(list.length + 1).padStart(2, '0') + '.jpg';
      const h = Math.min(1400, Math.max(844, Math.round(box.height)));
      if (h > 844) await page.setViewportSize({ width: 390, height: h });
      await page.evaluate((x) => { const e = document.getElementById(x); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY); }, sc.id);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, file), type: 'jpeg', quality: 82 });
      if (h > 844) await page.setViewportSize({ width: 390, height: 844 });
      list.push({ id: sc.id, toc: sc.toc, file, height: h });
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(outDir, 'bildschirme.json'), JSON.stringify({ schema: 'vu-marktbriefing-screens-1', width: 390, screens: list }, null, 1) + '\n');
  return list.map((x) => path.join(outDir, x.file)).concat([path.join(outDir, 'bildschirme.json')]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [html, out] = process.argv.slice(2);
  if (!html || !out) { console.error('Aufruf: screens.mjs <ausgabe/index.html> <ordner>'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  console.log((await writeScreens(path.resolve(html), path.resolve(out))).join('\n'));
}
