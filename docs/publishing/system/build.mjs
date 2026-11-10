// Baut eine Ausgabe des Vision Universe Aktienmagazins.
//   node docs/publishing/system/build.mjs <ausgabe-ordner> [--out <ordner>] [--scale 1|2] [--seiten 1-5] [--no-pdf] [--vorschau]
//
// Eingaben je Ausgabe (siehe HANDBUCH.md):
//   ausgabe.json   Nummer, Datum, KW, Redaktionsschluss, Handelsfenster, Seitenfolge
//   seiten/*.html  eine Datei je Seite (Platzhalter siehe unten)
//   inhalt/*.json  Inhalte für Vorlagen (z. B. Aktienseite), Seite verweist mit "vorlage" in ausgabe.json
//   fakten.json    Quellenregister (IDs, Titel, Medium, Datum, URL, Status) und Zitatregister
//   data.js        eingefrorener Datenschnappschuss (system/build-data.mjs)
//
// Platzhalter in Seiten und Inhalten:
//   {{root}} Pfad zur Repo-Wurzel · {{nr}} {{datum}} {{kw}} {{schluss}} · {{seite:<id>}} Seitenzahl · {{seiten}} Gesamtzahl
//
// Prüftor (Exit-Code 1): fehlende Bilder, JS-Fehler, Überlauf über Seiten- oder Fußzeilenrand,
// unbekannte Seiten-IDs oder Quellen-IDs, Seiten ohne Quellenangabe (außer "quellen": false in ausgabe.json).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { renderTemplate } from './templates.mjs';

const require = createRequire(import.meta.url);
const sys = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(sys, '../../..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const valueFlags = ['--out', '--scale', '--seiten'];
const dir = path.resolve(argv.find((a, i) => !a.startsWith('--') && !valueFlags.includes(argv[i - 1])) || '.');
const out = path.resolve(arg('--out', path.join(dir, 'dist')));
const scale = Number(arg('--scale', '1'));
const range = arg('--seiten', null);
fs.mkdirSync(out, { recursive: true });

const fehler = [];
const A = JSON.parse(fs.readFileSync(path.join(dir, 'ausgabe.json'), 'utf8'));
const F = JSON.parse(fs.readFileSync(path.join(dir, 'fakten.json'), 'utf8'));
const root = path.relative(dir, repo).split(path.sep).join('/') + '/';
const sysRel = path.relative(dir, sys).split(path.sep).join('/') + '/';

// 1. Seitenfolge und Nummern
const seiten = A.seiten.map((s, i) => ({ ...s, nr: i + 1 }));
const nrById = Object.fromEntries(seiten.map((s) => [s.id, s.nr]));
const ersetze = (html, ctx) => html
  .replaceAll('{{root}}', root)
  .replaceAll('{{nr}}', String(A.nummer).padStart(2, '0'))
  .replaceAll('{{datum}}', A.datumText)
  .replaceAll('{{kw}}', String(A.kw))
  .replaceAll('{{schluss}}', A.redaktionsschlussText)
  .replaceAll('{{datenstand}}', A.datenstandText)
  .replaceAll('{{datenstandKurz}}', A.datenstandKurz)
  .replaceAll('{{seiten}}', String(seiten.length))
  .replace(/\{\{seite:([a-z0-9-]+)\}\}/g, (m, id) => {
    if (!nrById[id]) { fehler.push(`${ctx}: unbekannte Seiten-ID „${id}“`); return '??'; }
    return String(nrById[id]).padStart(2, '0');
  });

// 2. Quellen je Seite prüfen
const quellen = F.quellen || {};
for (const s of seiten) {
  if (s.quellen === false) continue;
  if (!s.quellen || !s.quellen.length) { fehler.push(`Seite ${s.nr} (${s.id}): keine Quellen-IDs`); continue; }
  for (const q of s.quellen) if (!quellen[q]) fehler.push(`Seite ${s.nr} (${s.id}): unbekannte Quelle „${q}“`);
}

// 3. Seiten zusammensetzen
const teile = seiten.map((s) => {
  let html;
  if (s.vorlage) {
    const inhalt = JSON.parse(fs.readFileSync(path.join(dir, 'inhalt', s.inhalt || `${s.id}.json`), 'utf8'));
    html = renderTemplate(s.vorlage, inhalt, s);
  } else {
    html = fs.readFileSync(path.join(dir, 'seiten', s.datei || `${s.id}.html`), 'utf8');
  }
  html = ersetze(html, `Seite ${s.nr} (${s.id})`);
  // Seiten-ID an die Section heften
  return html.replace(/<section class="/, `<section data-id="${s.id}" data-nr="${s.nr}" class="`);
});
const zusatz = fs.existsSync(path.join(dir, 'seiten', '_kennzahlen.html')) ? ersetze(fs.readFileSync(path.join(dir, 'seiten', '_kennzahlen.html'), 'utf8'), 'Kennzahlen') : '';
const icons = fs.readFileSync(path.join(repo, 'assets/product-icons.svg'), 'utf8').replace(/<svg /, '<svg style="display:none" ');
const meta = { nummer: A.nummer, datumText: A.datumText, kw: A.kw, redaktionsschlussText: A.redaktionsschlussText, seiten: seiten.map(({ id, nr, toc, quellen: q }) => ({ id, nr, toc, quellen: q })), quellen };
const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>Vision Universe Aktienmagazin · Nr. ${String(A.nummer).padStart(2, '0')} · ${A.datumText}</title>
<link rel="stylesheet" href="${sysRel}mag.css">
<script>window.VU_ROOT=${JSON.stringify(root)};window.VU_AUSGABE=${JSON.stringify(meta)};</script>
<script src="data.js"></script><script src="${sysRel}charts.js"></script><script src="${sysRel}lib.js"></script>
</head><body>
${icons}
${teile.join('\n')}
${zusatz}
<script>VUM.finish();</script>
</body></html>
`;
const ziel = path.join(dir, 'magazin.html');
fs.writeFileSync(ziel, html);

// 4. Rendern und prüfen
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: scale });
page.on('pageerror', (e) => fehler.push('JS: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') fehler.push('Konsole: ' + m.text()); });
page.on('requestfailed', (r) => fehler.push('fehlt: ' + decodeURIComponent(r.url()).split('/').slice(-3).join('/')));
await page.goto(pathToFileURL(ziel).href);
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20000 }).catch(() => fehler.push('Seite wurde nicht fertig'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const befunde = await page.evaluate(() => [...document.querySelectorAll('.page')].flatMap((p) => {
  const r = p.getBoundingClientRect(), id = p.dataset.nr + ' (' + p.dataset.id + ')';
  const foot = p.querySelector('.foot'), fb = foot ? foot.getBoundingClientRect() : null;
  return [...p.querySelectorAll('.pad *')]
    .filter((el) => !el.closest('[data-bleed]') && el.children.length === 0 && el.textContent.trim())
    .filter((el) => { const b = el.getBoundingClientRect(); if (!b.height || !b.width) return false;
      return b.bottom > r.bottom - 12 || b.right > r.right - 8 || (fb && b.bottom > fb.top - 1 && b.top < fb.bottom); })
    .slice(0, 2).map((el) => `Überlauf Seite ${id}: „${el.textContent.trim().slice(0, 40)}“`);
}));
fehler.push(...befunde);
const pages = await page.$$('.page');
let [a, b] = range ? range.split('-').map(Number) : [1, pages.length];
b = b || a;
for (let i = a - 1; i < Math.min(b, pages.length); i++) await pages[i].screenshot({ path: path.join(out, `s${String(i + 1).padStart(2, '0')}.png`) });
// Vorschau zum Durchblättern (JPEG je Seite + index.html) direkt aus demselben Lauf
if (argv.includes('--vorschau')) {
  const vd = path.join(dir, 'vorschau'), vp = path.join(vd, 'p');
  fs.rmSync(vp, { recursive: true, force: true }); fs.mkdirSync(vp, { recursive: true });
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(vp, `s${String(i + 1).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 80 });
  const titel = seiten.map((s) => (s.toc ? s.toc.titel : s.id.replace(/-/g, ' ')).replace(/&amp;/g, '&'));
  fs.writeFileSync(path.join(vd, 'index.html'), `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vorschau Aktienmagazin Nr. ${String(A.nummer).padStart(2, '0')}</title><style>body{margin:0;background:#0b0b0b;color:#fff;font-family:system-ui,sans-serif}h1{padding:24px 20px 0;margin:0;font-size:32px}h1 span{color:#c8f531}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;padding:20px}figure{margin:0;background:#161616;border-radius:10px;padding:8px}img{width:100%;display:block}figcaption{font-size:13px;color:#9a9a9a;margin-top:6px}figcaption b{color:#c8f531}</style></head><body><h1>Aktien<span>magazin</span> Nr. ${String(A.nummer).padStart(2, '0')} · ${A.datumText}</h1><div class="g">${seiten.map((s, i) => `<figure><a href="p/s${String(i + 1).padStart(2, '0')}.jpg"><img loading="lazy" src="p/s${String(i + 1).padStart(2, '0')}.jpg" alt="Seite ${i + 1}"></a><figcaption><b>${String(i + 1).padStart(2, '0')}</b> · ${titel[i]}</figcaption></figure>`).join('')}</div></body></html>`);
}
const pdfName = `aktienmagazin-${String(A.nummer).padStart(2, '0')}.pdf`;
if (!argv.includes('--no-pdf')) await page.pdf({ path: path.join(out, pdfName), format: 'A4', printBackground: true, preferCSSPageSize: true, outline: true, tagged: true });
await browser.close();

console.log(`${pages.length} Seiten · ${fehler.length ? 'FEHLER:\n  ' + [...new Set(fehler)].join('\n  ') : 'Prüftor bestanden'}`);
if (fehler.length) process.exitCode = 1;
