#!/usr/bin/env node
// Beleg fuer die Buehne der News-Seite (landing/news, landing/web/sub.js + sub.css; Ladezeit 24.11.2026): Folien 2-5 laden ihre Bilder erst
// kurz vor dem Wechsel, und beim Wechsel erscheint nie eine leere oder halb geladene Folie.
// Die echte Seite laeuft im ECHTEN Browser; Anfragen an http://www.test werden im Prozess aus dem Dateisystem beantwortet (page.route),
// mit 150 ms Latenz und einer gemeinsamen Leitung von 1,6 Mbit/s (Handy-Profil des Ladezeit-Monitors), ohne Server.
// Aufruf: node scripts/website/news-buehne-qa.mjs [--engine chromium|webkit|firefox] [--shots <ordner>] [--ohne-cv]
//   --ohne-cv   blendet `content-visibility` aus (simuliert Browser ohne die Eigenschaft): die Wartelogik im Skript muss allein tragen.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const ORIGIN = 'http://www.test';
const TYPEN = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain'};
const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '..', '..');

/** Misst die Buehne. Liefert {engine, ok, pruefungen:[{name,pass,detail}], messung:{...}}. */
export async function pruefeBuehne({engine = 'chromium', shots = null, ohneCv = false, repo = REPO} = {}) {
  const pw = require('playwright');
  const typ = pw[engine];
  if (!typ) throw Error('ENGINE_UNBEKANNT:' + engine);
  const wurzeln = [path.join(repo, 'landing'), repo]; // www-Wurzel = landing/, /assets/... liegt im Repo-Wurzelverzeichnis
  const browser = await typ.launch();
  const out = [];
  const p = (name, pass, detail) => out.push({name, pass: !!pass, detail: detail === undefined ? null : detail});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: engine !== 'firefox', hasTouch: engine !== 'firefox', serviceWorkers: 'block'});
    const page = await ctx.newPage();
    const t0 = Date.now(), anfragen = [];
    let frei = 0;
    await ctx.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.origin !== ORIGIN) return route.abort();
      let f = null;
      for (const w of wurzeln) {
        let q = path.join(w, decodeURIComponent(u.pathname));
        if (fs.existsSync(q) && fs.statSync(q).isDirectory()) q = path.join(q, 'index.html');
        if (fs.existsSync(q)) { f = q; break; }
      }
      if (!f) return route.fulfill({status: 404, body: 'nicht da'});
      let body = fs.readFileSync(f);
      if (ohneCv && f.endsWith('sub.css')) body = Buffer.from(String(body).replace(/content-visibility:hidden/g, 'color:inherit'));
      const jetzt = Date.now(); frei = Math.max(frei, jetzt) + body.length * 8 / 1.6e6 * 1000;
      await new Promise(r => setTimeout(r, Math.max(150, frei - jetzt)));
      if (/\/web\/img\/news\//.test(u.pathname)) anfragen.push({pfad: u.pathname.split('/').pop(), t: Date.now() - t0});
      return route.fulfill({status: 200, contentType: TYPEN[path.extname(f)] || 'application/octet-stream', body});
    });
    // Im Seitenkontext: jede Folie, die ihre Klasse "on" bekommt, meldet, ob ihr Bild dann fertig gezeichnet werden kann.
    await page.addInitScript(() => {
      window.__wechsel = [];
      const spaeter = () => {
        const hero = document.querySelector('.ts-hero'); if (!hero) return setTimeout(spaeter, 20);
        const sl = [...hero.querySelectorAll('.ts-sl')];
        sl.forEach((s, i) => new MutationObserver(() => {
          if (!s.classList.contains('on')) return;
          const im = s.querySelector('img');
          window.__wechsel.push({folie: i + 1, t: Math.round(performance.now()), fertig: !!im && im.complete && im.naturalWidth > 0});
        }).observe(s, {attributes: true, attributeFilter: ['class']}));
      };
      document.addEventListener('DOMContentLoaded', spaeter);
    });
    const fehler = []; page.on('pageerror', e => fehler.push(String(e).slice(0, 160)));
    await page.goto(ORIGIN + '/news/', {waitUntil: 'load', timeout: 60000});
    const tLoad = Date.now() - t0;
    // Folie 2 wird nach dem load-Ereignis freigegeben und geladen; bis dahin (hoechstens 4 s) sind Folien 3-5 nicht angefragt.
    await page.waitForFunction(() => { const im = document.querySelectorAll('.ts-sl')[1].querySelector('img'); return im && im.complete && im.naturalWidth > 0; }, null, {timeout: 4000}).catch(() => {});
    await page.waitForTimeout(150);
    const folienBilder = await page.evaluate(() => [...document.querySelectorAll('.ts-sl')].map(s => { const im = s.querySelector('img'); return im ? (im.currentSrc || im.src).split('/').pop() : null; }));
    const cvZu = async (i) => page.evaluate(n => getComputedStyle(document.querySelectorAll('.ts-sl')[n].querySelector('.ts-art')).contentVisibility, i);
    const imHtml = name => anfragen.find(a => name && a.pfad === name.split('?')[0]);
    const cvUnterstuetzt = await page.evaluate(() => CSS.supports('content-visibility', 'hidden'));
    const cv = !ohneCv && cvUnterstuetzt;

    // A: gleich nach dem load-Ereignis ist nur Folie 1 und die naechste (2) frei; Folien 3-5 sind noch nicht angefragt.
    const fruehe = folienBilder.map((n, i) => ({folie: i + 1, geladen: !!imHtml(n)}));
    p('A Folie 1 geladen, Folie 2 nach dem load-Ereignis freigegeben', fruehe[0].geladen && fruehe[1].geladen, {tLoad, fruehe});
    p('A Folien 3-5 sind angefragt, wenn Folie 2 geladen ist: noch nicht' + (cv ? '' : ' (nur mit content-visibility)'), !cv || fruehe.slice(2).every(f => !f.geladen), fruehe);
    if (cv) p('A content-visibility der Folien 3-5 ist hidden, der Folie 2 sichtbar', (await cvZu(2)) === 'hidden' && (await cvZu(3)) === 'hidden' && (await cvZu(1)) !== 'hidden', {f2: await cvZu(1), f3: await cvZu(2)});

    // B: erster Wechsel (nach ~6 s): Folie 2 ist dann geladen und gezeichnet; Screenshot unmittelbar nach dem Wechsel.
    await page.waitForFunction(() => window.__wechsel.some(w => w.folie === 2), null, {timeout: 20000});
    const marke = engine + (ohneCv ? '-ohne-cv' : '');
    if (shots) {
      fs.mkdirSync(shots, {recursive: true});
      await page.screenshot({path: path.join(shots, marke + '-erster-wechsel-sofort.png')}); // mitten in der Ueberblendung
      await page.waitForTimeout(1200);
      await page.screenshot({path: path.join(shots, marke + '-erster-wechsel.png')}); // Folie 2 ganz sichtbar
    }
    const w2 = await page.evaluate(() => window.__wechsel.filter(w => w.folie === 2).pop());
    p('B Beim ersten Wechsel ist das Bild der Folie 2 fertig geladen', w2.fertig, w2);
    const sichtbar2 = await page.evaluate(() => { const s = document.querySelectorAll('.ts-sl')[1], im = s.querySelector('img'); const r = im.getBoundingClientRect(); return {w: Math.round(r.width), h: Math.round(r.height), nat: im.naturalWidth}; });
    p('B Bild der Folie 2 hat Flaeche und Inhalt (kein leerer Rahmen)', sichtbar2.w > 300 && sichtbar2.h > 150 && sichtbar2.nat > 0, sichtbar2);

    // C: Klick auf den letzten Punkt, bevor Folie 5 freigegeben war: der Wechsel wartet auf das Bild (hoechstens 1,5 s) und zeigt nie eine leere Folie.
    const vorher5 = !!imHtml(folienBilder[4]);
    const tKlick = Date.now();
    await page.locator('.ts-dots button').nth(4).click();
    await page.waitForFunction(() => window.__wechsel.some(w => w.folie === 5), null, {timeout: 6000});
    const dauer = Date.now() - tKlick;
    const w5 = await page.evaluate(() => window.__wechsel.filter(w => w.folie === 5).pop());
    if (shots) await page.screenshot({path: path.join(shots, marke + '-klick-folie-5.png')});
    p('C Klick auf Folie 5 (vorher ' + (vorher5 ? 'schon' : 'noch nicht') + ' angefragt): beim Wechsel ist das Bild fertig', w5.fertig, {dauerMs: dauer, w5});
    p('C Der Wechsel wartet hoechstens 1,5 s (+ Messtoleranz)', dauer <= 2200, {dauerMs: dauer});

    // D: Alle fuenf Wechsel der Folge: nie ein Wechsel ohne fertiges Bild.
    await page.waitForTimeout(500);
    const alle = await page.evaluate(() => window.__wechsel);
    p('D Kein Wechsel auf eine Folie ohne fertiges Bild', alle.every(w => w.fertig), alle);
    p('Keine Seitenfehler', fehler.length === 0, fehler);
    return {engine, cv, ok: out.every(x => x.pass), pruefungen: out, messung: {tLoad, anfragen: anfragen.filter(a => /art-/.test(a.pfad)).slice(0, 12)}};
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
  const r = await pruefeBuehne({engine: arg('--engine') || 'chromium', shots: arg('--shots'), ohneCv: process.argv.includes('--ohne-cv')});
  for (const x of r.pruefungen) console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.pass ? '' : '  ' + JSON.stringify(x.detail)));
  console.log(JSON.stringify({engine: r.engine, contentVisibility: r.cv, ok: r.ok, messung: r.messung}));
  process.exitCode = r.ok ? 0 : 1;
}
