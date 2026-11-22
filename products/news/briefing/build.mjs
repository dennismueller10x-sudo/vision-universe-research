// Marktbriefing: lädt die veröffentlichten Artefakte, rechnet das Briefing (engine.js) und schreibt
//   news/marktbriefing/data/latest.json, news/marktbriefing/data/archive/<sitzung>.json,
//   news/marktbriefing/index.html und news/marktbriefing/<sitzung>/index.html.
//
//   node products/news/briefing/build.mjs                        liest Daten aus dem Repo, schreibt ins Repo
//   node products/news/briefing/build.mjs --data <ordner>        liest Daten aus <ordner> (z. B. Checkout von data/live)
//   node products/news/briefing/build.mjs --out <ordner>         schreibt in <ordner> (Tests)
//   node products/news/briefing/build.mjs --radar <datei>        Themen Dritter (Radar), sonst news/marktbriefing/radar/<sitzung>.json
//   node products/news/briefing/build.mjs --now <ISO>            fester Zeitpunkt (Tests)
//   node products/news/briefing/build.mjs --www <landing-ordner>  schreibt zusätzlich die Seite für www.visionuniverse.de:
//        <landing>/marktbriefing/index.html (Produktseite) und <landing>/marktbriefing/<sitzung>/index.html (Ausgabe);
//        Kopf, Menü und Fuß aus <landing>/news/index.html. Mit --pdf zusätzlich PDF, Titelbild und Karten als Bilder im
//        Ordner der Ausgabe, dazu echte Handy-Bildschirme der Ausgabe (bildschirm-NN.jpg, screens.mjs; Playwright nötig).
//
// Ist das Briefing nicht frisch (engine: fresh.ok = false), wird nichts geschrieben; Exit-Code 3 mit Begründung.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);
const Engine = require('./engine.js');
const Render = require('./render.js');
const Www = require('./www.js');

export const MEGACAPS = ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'META', 'AVGO', 'GOOGL', 'ORCL'];
export const SERIES = ['SPY', 'QQQ', 'DIA', 'IWM', 'FEZ', 'EEM', 'N225', 'US2Y', 'US5Y', 'US10Y', 'US30Y', 'DE10Y', 'XAUUSD', 'XAGUSD', 'BTCUSD'];

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
function readJson(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }

/* CIK je Ticker aus der SEC-Zuordnung des Repos (quant/data/universe/cik-map.json). */
let cikMap = null;
function cikFor(dataRoot, ticker) {
  if (!cikMap) cikMap = (readJson(path.join(dataRoot, 'quant/data/universe/cik-map.json')) || {}).byTicker || {};
  const e = cikMap[ticker];
  const cik = e && (typeof e === 'string' ? e : e.cik);
  return cik ? path.join(dataRoot, 'quant/data/sec/consumer', 'CIK' + String(cik).padStart(10, '0') + '.json') : null;
}

export function loadInputs(dataRoot, { radarFile, now } = {}) {
  const ma = path.join(dataRoot, 'quant/data/market/multi-asset');
  const series = {}, intraday = {}, stocks = {}, sec = {};
  for (const s of SERIES) { const j = readJson(path.join(ma, 'series', s + '.json')); if (j) series[s] = j; }
  for (const s of ['QQQ', 'SPY']) { const j = readJson(path.join(ma, 'intraday', s + '.json')); if (j) intraday[s] = j; }
  for (const t of MEGACAPS) {
    const j = readJson(path.join(dataRoot, 'quant/data/market/discover-series/ref_' + t + '.json')); if (j) stocks[t] = j;
    const f = cikFor(dataRoot, t); const b = f && readJson(f); if (b) sec[t] = b;
  }
  const pulse = readJson(path.join(dataRoot, 'quant/data/market/intelligence/market-pulse.json'));
  const pulseHistory = readJson(path.join(dataRoot, 'quant/data/market/intelligence/market-pulse-history.json'));
  const session = pulse && pulse.movers && pulse.movers.session;
  const radarPath = radarFile || (session && path.join(root, 'news/marktbriefing/radar', session + '.json'));
  const radar = radarPath ? readJson(radarPath) : null;
  return { pulse, pulseHistory, series, intraday, stocks, sec, radar, editorial: radar && radar.editorial || null, now };
}

export function writeBriefing(briefing, outRoot) {
  const base = path.join(outRoot, 'news/marktbriefing');
  const files = [];
  const put = (rel, text) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); files.push(f); };
  const json = JSON.stringify(briefing, null, 1) + '\n';
  put('data/latest.json', json);
  put('data/archive/' + briefing.session + '.json', json);
  const archive = fs.existsSync(path.join(base, 'data/archive'))
    ? fs.readdirSync(path.join(base, 'data/archive')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse() : [briefing.session];
  put('index.html', Render.page(briefing, { canonical: '/news/marktbriefing/', archive }));
  put(briefing.session + '/index.html', Render.page(briefing, { canonical: '/news/marktbriefing/' + briefing.session + '/', archive }));
  return files;
}

/* Website: /marktbriefing/ ist die Produktseite (wie Magazin und Aktienreport), jede Ausgabe steht unter
   /marktbriefing/<sitzung>/ mit eigenem PDF und eigenen Bildern. Kopf, Menü und Fuß aus landing/news, Bausteine aus landing/report. */
// Alle Karten außer der ersten (die ist vorschau.png) als Bilder für „Ein Blick hinein“ und das Handy auf der Produktseite.
const ANCHOR = { agenda: 'ausblick', indices: 'indizes', context: 'einordnung', megacaps: 'schwergewichte', valuation: 'bewertung', breadth: 'marktbreite', rates: 'zinsen', movers: 'bewegungen', picture: 'marktbild' };
export async function writeWww(briefing, landingDir, { pdf = false } = {}) {
  const dir = path.join(landingDir, 'marktbriefing'), ed = path.join(dir, briefing.session);
  const chrome = Www.chromeFrom(fs.readFileSync(path.join(landingDir, 'news/index.html'), 'utf8'));
  const parts = Www.partsFrom(fs.readFileSync(path.join(landingDir, 'report/index.html'), 'utf8'));
  fs.mkdirSync(ed, { recursive: true });
  const files = [];
  const put = (rel, html) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); files.push(f); };
  const pdfName = 'marktbriefing-' + briefing.session + '.pdf';
  const peekIdx = briefing.cards.map((c, i) => i).filter((i) => i > 0);
  let havePdf = false;
  if (pdf) {
    // PDF und Bilder mit Playwright; fehlt es, entstehen die Seiten ohne beides.
    try {
      const { writePdf } = await import('./pdf.mjs');
      await writePdf(briefing, path.join(ed, pdfName), { png: ed, cards: peekIdx });
      fs.renameSync(path.join(ed, 'karte-01.png'), path.join(ed, 'vorschau.png'));
      havePdf = true;
      files.push(path.join(ed, pdfName));
    } catch (e) { console.error('PDF übersprungen: ' + e.message); }
  }
  const has = (f) => fs.existsSync(path.join(ed, f));
  if (has(pdfName)) havePdf = true;
  const archive = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && fs.existsSync(path.join(dir, f, 'index.html')) || f === briefing.session).sort().reverse();
  put(briefing.session + '/index.html', Www.page(briefing, { chrome, archive, depth: 2, pdf: havePdf ? pdfName : null,
    image: has('vorschau.png') ? '/marktbriefing/' + briefing.session + '/vorschau.png' : null }));
  // Echte Handy-Bildschirme der Ausgabe für die Produktseite (nur mit Playwright, wie PDF).
  if (pdf) {
    try { const { writeScreens } = await import('./screens.mjs'); files.push(...await writeScreens(path.join(ed, 'index.html'), ed)); }
    catch (e) { console.error('Bildschirme übersprungen: ' + e.message); }
  }
  if (briefing.session === archive[0]) {
    const cards = peekIdx.map((i) => ({ file: 'karte-' + String(i + 1).padStart(2, '0') + '.png', anchor: ANCHOR[briefing.cards[i].id] || 'start',
      title: briefing.cards[i].title, kicker: briefing.cards[i].kicker })).filter((c) => has(c.file));
    put('index.html', Www.productPage(briefing, { chrome, parts, archive, pdf: havePdf ? pdfName : null,
      img: { story0: has('vorschau.png') ? 'vorschau.png' : null, cover: has('titel.png') ? 'titel.png' : null, cards,
        pages: ['seite-02.png', 'seite-03.png', 'seite-04.png'].filter(has),
        screens: ['bildschirm-01.jpg', 'bildschirm-02.jpg', 'bildschirm-03.jpg', 'bildschirm-04.jpg'].filter(has) } }));
    const home = path.join(landingDir, 'index.html');
    if (fs.existsSync(home)) { const before = fs.readFileSync(home, 'utf8'), after = Www.withTeaser(before, briefing); if (after !== before) { fs.writeFileSync(home, after); files.push(home); } }
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataRoot = path.resolve(arg('--data') || root);
  const outRoot = path.resolve(arg('--out') || root);
  const now = arg('--now') || new Date().toISOString();
  const inputs = loadInputs(dataRoot, { radarFile: arg('--radar'), now });
  const briefing = Engine.buildBriefing(inputs);
  if (!briefing.fresh.ok) {
    console.error('Marktbriefing nicht frisch, nichts geschrieben: ' + briefing.fresh.problems.join('; '));
    process.exit(3);
  }
  const files = writeBriefing(briefing, outRoot);
  if (arg('--www')) files.push(...await writeWww(briefing, path.resolve(arg('--www')), { pdf: process.argv.includes('--pdf') }));
  console.log('Marktbriefing ' + briefing.session + ': ' + briefing.cards.length + ' Karten (' +
    Object.entries(briefing.counts).map(([k, v]) => k + ' ' + v).join(', ') + '), ' + files.length + ' Dateien' +
    (briefing.dropped.length ? '; verworfen: ' + briefing.dropped.map((d) => d.reason).join('; ') : ''));
}
