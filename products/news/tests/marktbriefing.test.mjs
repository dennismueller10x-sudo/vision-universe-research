// Marktbriefing (products/news/briefing): Frische, Kartenregeln, Themen Dritter, Darstellung und Build mit --out.
// Alle Eingaben sind synthetisch und entstehen im Test; es wird keine Produktionsdatei gelesen oder geschrieben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);
const Engine = require('../briefing/engine.js');
const Render = require('../briefing/render.js');

const SESSION = '2026-11-20';

/* Werktage rückwärts ab der Sitzung. */
function days(n, end = SESSION) {
  const out = []; let t = Date.parse(end + 'T12:00:00Z');
  while (out.length < n) { const d = new Date(t); if (d.getUTCDay() % 6 !== 0) out.unshift(d.toISOString().slice(0, 10)); t -= 864e5; }
  return out;
}
/* Reihe mit ruhigem Verlauf, zwei großen Verlusttagen (05.11. und Sitzung) und einem frühen Crash zum Vergleich. */
function series(start, lastMove, end = SESSION) {
  const ds = days(3000, end); let v = start; const pts = [];
  ds.forEach((d, i) => {
    if (i > 0) v *= d === '2026-11-05' ? 0.935 : d === '2020-03-16' ? 0.88 : i === ds.length - 1 ? 1 + lastMove : 1 + (i % 7 === 0 ? -0.004 : 0.002);
    pts.push([d, Math.round(v * 100) / 100]);
  });
  return { symbol: 'X', points: pts };
}
function bp(level) { return { points: days(30).map((d, i, a) => [d, i === a.length - 1 ? level - 0.12 : level]) }; }
function stock(t, close, prev, high) {
  const ds = days(250); const pts = ds.map((d, i) => [d, i === ds.length - 1 ? close : i === ds.length - 2 ? prev : i === 100 ? high : prev * 1.05]);
  return { schemaVersion: 'discover-series-1.1.0', status: 'CALCULATED', source: 'tiingo', provider: 'tiingo', ticker: t, dataMode: 'real',
    priceSeriesType: 'SPLIT_ADJUSTED', currency: 'USD', grain: 'daily', publishBasis: 'EOD', asOf: SESSION, points: pts };
}
function sec(eps) { return { ttm: { eps_diluted: { v: eps, end: '2026-09-30', filed: '2026-10-30' } }, annual: {} }; }

export function inputs(over = {}) {
  const intraday = { points: [] };
  for (let m = 0; m < 78; m++) { const t = new Date(Date.parse(SESSION + 'T14:30:00Z') + m * 300e3).toISOString(); intraday.points.push([t, 100 * (1 - 0.0007 * m)]); }
  const ser = {
    SPY: series(400, -0.036), QQQ: series(300, -0.057), DIA: series(350, -0.02), IWM: series(200, -0.029),
    FEZ: series(50, -0.028), EEM: series(40, -0.051), N225: series(30000, -0.05),
    US2Y: bp(4.75), US5Y: bp(4.85), US10Y: bp(5.04), US30Y: bp(5.4), DE10Y: bp(3.45),
    XAUUSD: series(3000, -0.022), XAGUSD: series(40, -0.034), BTCUSD: series(60000, -0.05)
  };
  const prevQ = ser.QQQ.points[ser.QQQ.points.length - 2][1];
  intraday.points = intraday.points.map(([t, v]) => [t, prevQ * v / 100]);
  return Object.assign({
    now: '2026-11-21T00:10:00Z',
    pulse: {
      headline: { text: 'Abwärtstrend – die Mehrheit der Aktien ist schwach' },
      gauges: { TREND: { valueText: '0 von 4 über beiden Linien' }, BREADTH: { valueText: '23 % über der 50-Tage-Linie' } },
      movers: { session: SESSION, complete: true,
        gainers: [{ symbol: 'GAP', name: 'Gap Inc', changePercent: 11.44 }, { symbol: 'GPN', name: 'Global Payments', changePercent: 9.95 }, { symbol: 'EFOR', name: 'ASGN', changePercent: 7.9 }],
        losers: [{ symbol: 'MARA', name: 'MARA', changePercent: -18.56 }, { symbol: 'IREN', name: 'IREN', changePercent: -17.97 }, { symbol: 'APLD', name: 'Applied Digital', changePercent: -17.81 }, { symbol: 'HUT', name: 'Hut 8', changePercent: -17.65 }] }
    },
    pulseHistory: {
      breadthLog: days(20).map((d, i, a) => ({ asOf: d, above50Pct: 40 - i, newHighs: 30, newLows: i === a.length - 1 ? 112 : 50 })),
      advDeclLog: [{ session: SESSION, advancers: 786, decliners: 4171, unchanged: 276, evaluated: 5233, complete: true }]
    },
    series: ser,
    intraday: { QQQ: intraday },
    stocks: { NVDA: stock('NVDA', 125.53, 145.98, 239), MSFT: stock('MSFT', 484.5, 498.3, 555), AAPL: stock('AAPL', 342.6, 349.2, 356), AMZN: stock('AMZN', 246.8, 257.4, 284), META: stock('META', 560.8, 596.2, 778) },
    sec: { NVDA: sec(7.91), MSFT: sec(19.16), AAPL: sec(8.97), AMZN: sec(12.37), META: sec(29.32) },
    radar: null
  }, over);
}

test('MB-1 frische Sitzung: Karten aller Arten, Einordnung und Bewertung als eigene Auswertung', () => {
  const b = Engine.buildBriefing(inputs());
  assert.equal(b.fresh.ok, true, b.fresh.problems.join('; '));
  assert.equal(b.session, SESSION);
  const ids = b.cards.map((c) => c.id);
  for (const id of ['overview', 'indices', 'context', 'megacaps', 'valuation', 'breadth', 'rates', 'movers', 'picture']) assert.ok(ids.includes(id), id);
  assert.equal(b.cards[0].id, 'overview');
  assert.equal(b.cards.find((c) => c.id === 'context').type, 'OWN');
  assert.match(b.cards.find((c) => c.id === 'context').title, /^Zwei Tage mit über 5 % Minus/);
  assert.match(b.cards.find((c) => c.id === 'valuation').title, /^NVDA: KGV/);
  assert.equal(b.cards.find((c) => c.id === 'breadth').pairs[0].sub, '80 % von 5.233 US-Aktien im Minus');
  assert.ok(b.counts.MARKET + b.counts.OWN === b.cards.length);
});

test('MB-2 Frische: hängt eine Pflicht-Eingabe hinterher, entsteht kein Briefing', () => {
  const inp = inputs(); inp.series.SPY.points.pop();
  const b = Engine.buildBriefing(inp);
  assert.equal(b.fresh.ok, false);
  assert.equal(b.cards.length, 0);
  assert.ok(b.fresh.problems.some((p) => p.startsWith('SPY')));
  const inp2 = inputs(); inp2.pulseHistory.breadthLog.pop();
  assert.equal(Engine.buildBriefing(inp2).fresh.ok, false);
  assert.equal(Engine.buildBriefing(inputs({ expectSession: '2026-11-23' })).fresh.ok, false);
});

test('MB-3 Themen Dritter: nur Handelstag, nur Quellenliste, höchstens zwei je Quelle, mit URL', () => {
  const it = (o) => Object.assign({ title: 'T', source: 'Reuters', publisher: 'Reuters', published: SESSION, url: 'https://example.org/a' }, o);
  const r = Engine.thirdCards({ items: [it(), it(), it(), it({ publisher: 'Irgendwer auf X' }), it({ published: '2026-11-18', publisher: 'CNBC' }),
    it({ publisher: 'CNBC', url: '' }), it({ publisher: 'Federal Reserve', published: '2026-11-21' })] }, SESSION, '2026-11-21T00:10:00Z');
  assert.equal(r.kept.length, 3);
  assert.deepEqual(r.kept.map((c) => c.publisher), ['Reuters', 'Reuters', 'Federal Reserve']);
  assert.ok(r.kept.every((c) => c.type === 'THIRD'));
  const reasons = r.dropped.map((d) => d.reason).join(' | ');
  assert.match(reasons, /mehr als 2 Karten von Reuters/);
  assert.match(reasons, /nicht in der Quellenliste/);
  assert.match(reasons, /nicht vom Handelstag \(2026-11-18\)/);
  assert.match(reasons, /keine Quell-URL/);
  const b = Engine.buildBriefing(inputs({ radar: { items: [it()] } }));
  assert.equal(b.counts.THIRD, 1);
});

test('MB-4 Wortwahl: keine Gewinner/Verlierer, keine Empfehlung, kein Signal, kein Datenanbieter (docs/legal/WORTWAHL.md)', () => {
  const text = JSON.stringify(Engine.buildBriefing(inputs()).cards);
  for (const w of ['Gewinner', 'Verlierer', 'Empfehlung', 'Signal', 'Kaufen', 'unterbewertet', 'Top-Pick']) assert.ok(!text.includes(w), w);
  // Owner 22.11.2026: der Kursdaten-Anbieter wird nirgends genannt (Karten, Quellen, Seite).
  const b = Engine.buildBriefing(inputs());
  const all = text + b.cards.map((c, i) => Render.cardSvg(c, i, b.cards.length, b.session)).join('') + Render.page(b, { archive: [SESSION] });
  assert.ok(!/tiingo|\biex\b/i.test(all), 'Anbieter genannt');
});

test('MB-5 Einordnung: letzter vergleichbarer Tag', () => {
  const s = series(300, -0.057).points;
  const r = Engine.lastComparable(s, SESSION, 1);
  assert.equal(r.date, '2026-11-05');
  assert.ok(r.today < -5.6 && r.today > -5.8);
});

test('MB-6 Darstellung: jede Karte ein SVG 1080×1350, Seite noindex mit Pflichthinweis', () => {
  const b = Engine.buildBriefing(inputs());
  b.cards.forEach((c, i) => {
    const svg = Render.cardSvg(c, i, b.cards.length, b.session);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 1080 1350"/);
    assert.ok(!/NaN|undefined/.test(svg), c.id);
  });
  const html = Render.page(b, { archive: [SESSION] });
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.match(html, /keine Anlageberatung/);
  assert.match(html, /<details class="mb-legal"><summary>Quellen und Hinweise<\/summary>/);
  assert.ok(!/<figcaption>/.test(html), 'keine Quelle unter der Grafik');
  assert.equal((html.match(/<figure class="mb-card"/g) || []).length, b.cards.length);
});

test('MB-7 Build mit --data/--out schreibt nur in den Zielordner; nicht frisch -> Exit 3 ohne Dateien', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-'));
  const data = path.join(tmp, 'data'), out = path.join(tmp, 'out');
  const inp = inputs();
  // Gleiche Ordnerstruktur wie im Repo, aber unter der temporären Fixture-Wurzel (synthetische Daten).
  const w = (rel, obj) => { const f = path.join(data, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj)); };
  w('/quant/data/market/intelligence/market-pulse.json', inp.pulse);
  w('/quant/data/market/intelligence/market-pulse-history.json', inp.pulseHistory);
  for (const [k, v] of Object.entries(inp.series)) w('/quant/data/market/multi-asset/series/' + k + '.json', v);
  w('/quant/data/market/multi-asset/intraday/QQQ.json', inp.intraday.QQQ);
  for (const [k, v] of Object.entries(inp.stocks)) w('/quant/data/market/discover-series/ref_' + k + '.json', v);
  w('/quant/data/universe/cik-map.json', { byTicker: { NVDA: { cik: '0000000001' } } });
  w('/quant/data/sec/consumer/CIK0000000001.json', inp.sec.NVDA);
  const run = () => spawnSync(process.execPath, [path.join(root, 'products/news/briefing/build.mjs'), '--data', data, '--out', out, '--now', inp.now,
    '--radar', path.join(tmp, 'kein-radar.json')], { encoding: 'utf8' });
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  for (const f of ['data/latest.json', 'data/archive/' + SESSION + '.json', 'index.html', SESSION + '/index.html']) assert.ok(fs.existsSync(path.join(out, 'news/marktbriefing', f)), f);
  fs.rmSync(out, { recursive: true });
  const spy = path.join(data, '/quant/data/market/multi-asset/series/SPY.json');
  const s = JSON.parse(fs.readFileSync(spy)); s.points.pop(); fs.writeFileSync(spy, JSON.stringify(s));
  const stale = run();
  assert.equal(stale.status, 3);
  assert.match(stale.stderr, /nicht frisch/);
  assert.ok(!fs.existsSync(out));
  fs.rmSync(tmp, { recursive: true });
});

const Www = require('../briefing/www.js');
const CHROME = '<html><body data-x="1"><vu-navigation></vu-navigation><script src="/assets/site-navigation.js"></script><header class="nav"><a href="../news/" aria-current="page">News</a><a href="../marktbriefing/">Marktbriefing</a></header><main id="inhalt">x</main><footer>F</footer>\n</body></html>';

test('MB-8 Kurzfassung: Sätze mit Datum und Zahlen, nur aus den Karten', () => {
  const b = Engine.buildBriefing(inputs());
  assert.ok(b.summary.length >= 4);
  assert.match(b.summary[0], /^Am Freitag, 20\. November 2026 verloren der Nasdaq 100 /);
  assert.ok(b.summary.some((s) => /von 5\.233 US-Aktien schlossen im Minus/.test(s)));
  const ctx = b.cards.find((c) => c.id === 'context');
  assert.ok(ctx.timeline.episodes.length >= 2);
  assert.equal(ctx.timeline.episodes[ctx.timeline.episodes.length - 1].current, true);
});

test('MB-9 www-Seite: alles im HTML, CSP-tauglich, strukturierte Daten, Navigation aus der News-Seite', () => {
  const b = Engine.buildBriefing(inputs());
  const chrome = Www.chromeFrom(CHROME);
  assert.ok(!/vu-navigation|site-navigation/.test(chrome.top), 'research-Navigation entfernt');
  assert.match(chrome.top, /href="\.\.\/marktbriefing\/" aria-current="page"/);
  assert.ok(!/href="\.\.\/news\/" aria-current/.test(chrome.top));
  const html = Www.page(b, { chrome, archive: [SESSION], depth: 2, pdf: 'marktbriefing-2026-11-20.pdf', image: '/marktbriefing/2026-11-20/vorschau.png' });
  assert.match(html, /<h1 class="mb-claim mb-h1">/);
  assert.match(html, /<ol class="mb-sum"><li><svg class="mb-si"[^>]*>[\s\S]*?<\/svg><span>Am Freitag, 20\. November 2026/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.visionuniverse\.de\/marktbriefing\/2026-11-20\/">/);
  assert.match(html, /<a class="mb-back" href="\.\.\/">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/, 'Landing-Build schaltet erst in Produktion auf index');
  // CSP der Website: kein ausführbares Inline-Skript, kein <style>-Block.
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)) assert.match(m[1], /type="application\/(ld\+)?json"/, 'Inline-Skript: ' + m[0]);
  assert.ok(!/<style[\s>]/.test(html));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(ld[0]['@type'], 'NewsArticle');
  assert.equal(ld[1]['@type'], 'BreadcrumbList');
  assert.equal((html.match(/<template data-mb-card=/g) || []).length, b.cards.length);
  assert.match(html, /href="marktbriefing-2026-11-20\.pdf" download/);
  assert.ok(!/tiingo|#ff5a4e/i.test(html));
  const deep = Www.page(b, { chrome, archive: [SESSION, '2026-11-19'], depth: 2 });
  assert.match(deep, /href="\.\.\/\.\.\/marktbriefing\/2026-11-19\/"/);
  assert.match(deep, /href="\.\.\/\.\.\/web\/site\.css"/);
  assert.ok(!/download>PDF/.test(deep), 'ohne PDF kein Knopf');
});

test('MB-10 Startseiten-Teaser ersetzt nur seine Region', () => {
  const b = Engine.buildBriefing(inputs());
  const home = 'A<p>Heute neu</p>\n<!--MB:teaser-->alt<!--/MB:teaser-->\n<!--NEWS:hero-->N<!--/NEWS:hero-->Z';
  const out = Www.withTeaser(home, b);
  assert.match(out, /<!--MB:teaser--><div class="mbt"><div class="mbt-head">/);
  assert.match(out, /<a class="mbt-go" href="\.\/marktbriefing\/">/);
  assert.ok(!/mbt-rail/.test(out), 'ohne Bilder keine Kartenreihe');
  const withCards = Www.withTeaser(home, b, { cover: 'titel.png', cards: [1, 2, 3, 4, 5, 6, 7].map((k) => ({ file: 'karte-0' + (k + 1) + '.png', anchor: 'indizes', title: 'Karte ' + k })) });
  assert.equal((withCards.match(/class="mbt-card/g) || []).length, 7, 'Titelblatt, fünf Karten und „Alle Karten“');
  assert.match(withCards, /href="\.\/marktbriefing\/2026-11-\d\d\/#indizes"/);
  assert.match(withCards, /Alle 8 Karten/);
  assert.ok(out.endsWith('\n<!--NEWS:hero-->N<!--/NEWS:hero-->Z'));
  assert.equal(Www.withTeaser('ohne Region', b), 'ohne Region');
});

test('MB-11 Website-Build findet Ausgabe und Archiv', async () => {
  const { marktbriefingPages } = await import('../../../landing/scripts/build.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mbl-'));
  assert.deepEqual(await marktbriefingPages(tmp), []);
  fs.mkdirSync(path.join(tmp, 'marktbriefing/2026-11-19'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'marktbriefing/2026-11-20'), { recursive: true });
  for (const f of ['marktbriefing/index.html', 'marktbriefing/2026-11-19/index.html', 'marktbriefing/2026-11-20/index.html']) fs.writeFileSync(path.join(tmp, f), 'x');
  assert.deepEqual(await marktbriefingPages(tmp), ['marktbriefing/index.html', 'marktbriefing/2026-11-20/index.html', 'marktbriefing/2026-11-19/index.html']);
  fs.rmSync(tmp, { recursive: true });
});

test('MB-12 Produktseite /marktbriefing/: wie Magazin und Report, führt zur Ausgabe', () => {
  const b = Engine.buildBriefing(inputs());
  const parts = { dot: '<span class="dot"><svg></svg></span>', soon: '<p class="soon">Bald in der App verfügbar</p>', stores: '<div class="stores"><p class="cap">x</p></div>' };
  const html = Www.productPage(b, { chrome: Www.chromeFrom(CHROME), parts, archive: [SESSION, '2026-11-19'], pdf: 'marktbriefing-2026-11-20.pdf',
    img: { story0: 'vorschau.png', cover: 'titel.png', pages: ['seite-02.png', 'seite-03.png', 'seite-04.png'], screens: ['bildschirm-01.jpg', 'bildschirm-02.jpg', 'bildschirm-03.jpg', 'bildschirm-04.jpg'], cards: [{ file: 'karte-03.png', anchor: 'einordnung', title: 'T', kicker: 'Einordnung' }] } });
  assert.match(html, /<h1>Das <mark>Marktbriefing\.<\/mark><\/h1>/);
  assert.match(html, /<a class="btn" href="2026-11-20\/"><span>Neueste Ausgabe ansehen<\/span>/);
  assert.match(html, /<a class="mbpdfbtn" href="2026-11-20\/marktbriefing-2026-11-20\.pdf" download>/);
  // App zuerst und PDF bleibt: Bühne mit PDF-Titelblatt und Handy mit durchlaufenden Story-Karten.
  // Handy und PDF als eigene Blöcke (Owner 22.11.2026): Bühne nur mit dem Handy, PDF als aufklappendes Heft wie beim Magazin.
  // Owner 22.11.2026: kein dunkles Handy-Mockup; echte Bildschirme der Ausgabe als Fächer im Kopf und im Story-Block.
  assert.match(html, /<div class="mbstage"><div class="mbstack"[^>]*><img class="b1" src="2026-11-20\/bildschirm-02\.jpg"[^>]*><img class="b2" src="2026-11-20\/bildschirm-04\.jpg"[^>]*><img class="f" src="2026-11-20\/bildschirm-01\.jpg"/);
  assert.ok(!/mbphone/.test(html), 'mit Bildschirmen kein Handy-Mockup');
  assert.match(html, /<section class="full mbpdf mbstory">[\s\S]*Der Börsentag als <mark>Story\.<\/mark>[\s\S]*<div class="mbscr"[^>]*><img class="mbshot s0" src="2026-11-20\/bildschirm-02\.jpg"/);
  assert.match(html, /<section class="full mbpdf">[\s\S]*<div class="m3 pvm mbfan"[^>]*><span class="pg p1"><img src="2026-11-20\/seite-04\.png"[\s\S]*<span class="cv"><img src="2026-11-20\/titel\.png"/);
  // Zahlenband zu Datenmenge und Quellen, Kartenleiste aus der neuesten Ausgabe.
  assert.match(html, /<section class="mbband">[\s\S]*Aus Millionen Datenpunkten/);
  assert.match(html, /<a class="mbcard" href="2026-11-20\/#einordnung">/);
  assert.equal((html.match(/<img class="mbshot s\d"/g) || []).length, 4);
  // Allgemein: die Ausgabe erscheint nur im Link „Neueste Ausgabe“, nicht in Überschriften oder im Inhalt.
  assert.equal((html.match(new RegExp(b.cards[0].title, 'g')) || []).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.visionuniverse\.de\/marktbriefing\/">/);
  assert.equal((html.match(/<div><svg viewBox="0 0 24 24"[^>]*>[\s\S]*?<\/svg><span>/g) || []).length, 11, 'feste Kapitel des Formats als Kacheln');
  assert.match(html, /<a href="2026-11-19\/">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'CollectionPage');
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)) assert.match(m[1], /type="application\/(ld\+)?json"/);
  assert.ok(!/<style[\s>]/.test(html));
  assert.ok(!/jeden Börsentag|täglich/i.test(html), 'kein Versprechen eines täglichen Erscheinens');
  assert.ok(!/class="soon"|Bald in der App verfügbar/.test(html), 'läuft schon im Browser, kein „Bald in der App verfügbar“');
});

test('MB-13 Ausblick: nur kommende Handelstage mit Quelle, Karte, Szene und Kurzfassung', () => {
  const u = 'https://www.bea.gov/news/schedule';
  const agenda = [
    { date: '2026-11-23', kind: 'zahlen', label: 'Zoom', time: 'nach US-Börsenschluss', source: 'Unternehmensangaben', url: u },
    { date: '2026-11-25', kind: 'daten', label: 'US-Wachstum 3. Quartal', time: '14:30 Uhr', source: 'BEA', url: u },
    { date: '2026-11-24', kind: 'dividende', label: 'Johnson & Johnson', sub: 'Ex-Tag', source: 'Johnson & Johnson', url: u },
    { date: '2026-11-20', kind: 'zahlen', label: 'Alt', source: 'X', url: u },
    { date: '2026-11-22', kind: 'zahlen', label: 'Sonntag', source: 'X', url: u },
    { date: '2026-12-10', kind: 'daten', label: 'Zu weit', source: 'X', url: u },
    { date: '2026-11-24', kind: 'gerücht', label: 'Unbekannt', source: 'X', url: u },
    { date: '2026-11-24', kind: 'zahlen', label: 'Ohne Link', source: 'X', url: 'http://x' }
  ];
  const inp = inputs(); inp.radar = Object.assign({}, inp.radar || {}, { agenda });
  const b = Engine.buildBriefing(inp);
  const c = b.cards.find((x) => x.id === 'agenda');
  assert.equal(c.type, 'AGENDA');
  assert.deepEqual(c.agenda.days.map((d) => d.date), ['2026-11-23', '2026-11-24', '2026-11-25']);
  assert.equal(b.cards[b.cards.length - 1].id, 'agenda', 'Ausblick schließt das Briefing ab');
  assert.equal(b.counts.AGENDA, 1);
  const why = b.dropped.filter((d) => /^Ausblick/.test(d.reason)).map((d) => d.reason);
  assert.equal(why.length, 5);
  assert.ok(why.some((r) => /Wochenende/.test(r)) && why.some((r) => /keine Quell-URL/.test(r)) && why.some((r) => /unbekannte Art/.test(r)));
  assert.match(b.summary[b.summary.length - 1], /^Als Nächstes: Montag Quartalszahlen von Zoom; Mittwoch US-Wachstum 3\. Quartal\.$/);
  const svg = Render.cardSvg(c, b.cards.length - 1, b.cards.length, b.session);
  assert.match(svg, />MO<\/text>/); assert.match(svg, /Johnson &amp; Johnson/);
  const html = Www.page(b, { chrome: Www.chromeFrom(CHROME), archive: [SESSION], depth: 2 });
  assert.match(html, /<section class="mb-sc w" id="ausblick"/);
  assert.match(html, /<li class="k-dividende"><svg class="mb-ai"/);
  assert.match(html, /<a href="https:\/\/www\.bea\.gov\/news\/schedule" rel="noopener">Unternehmensangaben<\/a>/);
  // Ohne Agenda keine Karte.
  assert.ok(!Engine.buildBriefing(inputs()).cards.some((x) => x.id === 'agenda'));
});

test('MB-14 App-Story aus der Ausgabe', () => {
  const b = Engine.buildBriefing(inputs());
  const url = 'https://www.visionuniverse.de/marktbriefing/2026-11-20/';
  const app = Www.appStory(b, { url, pdf: url + 'marktbriefing-2026-11-20.pdf', screens: [{ id: 'start', toc: 'T', image: url + 'bildschirm-01.jpg' }] });
  assert.equal(app.schema, 'vu-marktbriefing-app-1');
  assert.equal(app.title, b.cards[0].title);
  assert.deepEqual(app.screens, [{ id: 'start', title: 'T', image: url + 'bildschirm-01.jpg' }]);
});

test('MB-15 kein Bezug auf Vorbilder: weder Personenname noch „Closing Bell“ in Erzeugern, Seiten und Registern', () => {
  const files = ['products/news/briefing/engine.js', 'products/news/briefing/render.js', 'products/news/briefing/www.js', 'products/news/briefing/pdf.mjs',
    'landing/marktbriefing/mb.css', 'landing/marktbriefing/mb.js', 'landing/index.html', 'willkommen/app.js', 'insights/marktbriefing/index.html',
    'core/registry/domains.json', 'core/registry/schedule.json', 'docs/publishing/HANDBUCH.md', '.github/workflows/content.yml'];
  const rx = new RegExp(['Mar' + 'kus', 'Ko' + 'ch\\b', 'Closing ' + 'Bell'].join('|'), 'i');
  for (const f of files) assert.doesNotMatch(fs.readFileSync(new URL('../../../' + f, import.meta.url), 'utf8'), rx, f);
  for (const d of fs.readdirSync(new URL('../../../landing/marktbriefing/', import.meta.url))) {
    const p = new URL('../../../landing/marktbriefing/' + d + '/index.html', import.meta.url);
    if (fs.existsSync(p)) assert.doesNotMatch(fs.readFileSync(p, 'utf8'), rx, d);
  }
});
