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

/* Teilen-Bild (Owner 23.11.2026: Vorschau in WhatsApp sah nicht gut aus): 1200×630 im hellen Vision-Universe-Stil,
   links Titel, Datum und Indizes, rechts drei echte Bildschirme der Ausgabe. teilen.png im Ordner der Ausgabe. */
export async function writeShare(outDir, { title, date, chips = [], shots = [] }) {
  const { chromium } = playwright();
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const font = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../landing/assets/fonts/inter-latin.woff2')).href;
  const img = shots.slice(0, 3).map((f) => pathToFileURL(path.join(outDir, f)).href);
  const html = `<!doctype html><meta charset=utf-8><style>@font-face{font-family:Inter;src:url(${font}) format("woff2");font-weight:100 900}
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;font-family:Inter,sans-serif;background:#c8f531;color:#000;position:relative;overflow:hidden}
.l{position:absolute;left:64px;top:56px;width:640px}.k{font-size:22px;font-weight:900;letter-spacing:.12em;display:flex;align-items:center;gap:12px}
.k i{width:14px;height:14px;border-radius:50%;background:#000}.h{margin:26px 0 18px;font-size:${title.length > 34 ? 62 : 74}px;font-weight:900;letter-spacing:-.05em;line-height:.98}
.d{font-size:24px;font-weight:700;opacity:.7}.c{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}.c span{background:#000;color:#fff;border-radius:999px;padding:9px 16px;font-size:20px;font-weight:800}
.c span b{color:#fff;margin-left:8px}.c span.up b{color:#c8f531}.f{position:absolute;left:64px;bottom:44px;font-size:22px;font-weight:900;letter-spacing:.02em}
.s{position:absolute;right:40px;top:40px;width:430px;height:560px}.s img{position:absolute;width:200px;border-radius:24px;box-shadow:0 24px 50px -18px rgba(0,0,0,.55),0 0 0 3px #000}
.s .a{left:0;top:70px;transform:rotate(-8deg)}.s .b{right:0;top:70px;transform:rotate(8deg)}.s .c2{left:115px;top:20px;z-index:2}</style>
<div class="l"><div class="k"><i></i>MARKTBRIEFING</div><div class="h">${esc(title)}</div><div class="d">${esc(date)}</div>
<div class="c">${chips.map((c) => '<span' + (/^\+/.test(c[1]) ? ' class="up"' : '') + '>' + esc(c[0]) + '<b>' + esc(c[1]) + '</b></span>').join('')}</div></div>
<div class="f">VISION UNIVERSE</div>
<div class="s">${img[1] ? '<img class="a" src="' + img[1] + '">' : ''}${img[2] ? '<img class="b" src="' + img[2] + '">' : ''}${img[0] ? '<img class="c2" src="' + img[0] + '">' : ''}</div>`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const tmp = path.join(outDir, '.teilen-' + process.pid + '.html');
    fs.writeFileSync(tmp, html);
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const f = path.join(outDir, 'teilen.png');
    await page.screenshot({ path: f });
    fs.rmSync(tmp, { force: true });
    return f;
  } finally { await browser.close(); }
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
