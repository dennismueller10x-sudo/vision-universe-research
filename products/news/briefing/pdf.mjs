// Marktbriefing als PDF (A4), Gestaltung nach dem Aktienreport (docs/publishing/system): schwarzes Titelblatt mit
// „MARKTBRIEFING“, Zahlen auf einen Blick, Kurzfassung mit Inhalt, je Kapitel eine Seite mit der Karte, Quellen, Rückseite.
//   node products/news/briefing/pdf.mjs <briefing.json> <ziel.pdf> [--png <ordner>]   (--png: Karten zusätzlich als PNG)
// Braucht Playwright mit Chromium (in CI über npm installiert, nicht Teil der Seite).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);
const Render = require('./render.js');
const Www = require('./www.js');

const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MO = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const esc = (s) => String(s ?? '').replace(/(\d) %/g, '$1 %').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (x, d = 1) => Math.abs(x).toFixed(d).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const sg = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');
const pct = (x, d = 1) => sg(x) + num(x, d) + ' %';
const dmy = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);

const CSS = (font) => `
@font-face{font-family:Inter;src:url(${font}) format("woff2");font-weight:100 900}
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;color:#000}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;padding:14mm;break-after:page;background:#fff}
.dark{background:#000;color:#fff}.lime{background:#c8f531;color:#000}
.run{position:absolute;top:8mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-size:7.5pt;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.run span:first-child b{font-weight:900;letter-spacing:.02em;margin-right:8px}
.foot{position:absolute;bottom:8mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-size:6.5pt;color:#8c8c8c}
.foot b{color:inherit;font-weight:900}
.dark .foot{color:#9b9b9b}
.ressort{display:inline-block;background:#000;color:#c8f531;font-size:7.5pt;font-weight:900;letter-spacing:.14em;text-transform:uppercase;padding:2px 7px;border-radius:2px}
.dark .ressort{background:#c8f531;color:#000}
.h1{font-size:34pt;font-weight:900;letter-spacing:-.045em;line-height:1;margin:5mm 0 0}
.cover .brand{font-size:13pt;font-weight:900;letter-spacing:.02em}
.cover .brand sup{font-size:7pt}
.cover .word{font-size:52pt;font-weight:900;letter-spacing:-.04em;line-height:.9;margin-top:1mm}
.cover .word span{color:#c8f531}
.cover .date{position:absolute;top:22mm;right:14mm;text-align:right;font-size:8pt;font-weight:900;letter-spacing:.14em;color:#c8f531}
.cover .art{position:absolute;left:0;right:0;top:70mm;height:115mm}
.cover .art svg{width:100%;height:100%}
.cover .badge{position:absolute;right:16mm;top:120mm;width:40mm;height:40mm;border-radius:50%;background:#c8f531;color:#000;display:grid;place-items:center;text-align:center;font-weight:900;font-size:11pt;line-height:1.05;transform:rotate(8deg);box-shadow:0 0 0 2mm #000}
.cover .badge small{display:block;font-size:7.5pt;font-weight:700}
.cover .head{position:absolute;left:14mm;right:14mm;top:172mm}
.cover .head h1{margin:0;font-size:42pt;font-weight:900;letter-spacing:-.045em;line-height:.95;text-transform:uppercase}
.cover .head h1 em{font-style:normal;color:#c8f531}
.cover .head p{margin:4mm 0 0;font-size:13pt;font-weight:700;line-height:1.3;max-width:160mm}
.tiles{position:absolute;left:14mm;right:14mm;bottom:14mm;display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}
.tile{border-radius:3mm;padding:3.5mm;background:#fff;color:#000;min-height:24mm}
.tile.l{background:#c8f531}
.tile small{display:block;font-size:6.5pt;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:1.5mm}
.tile b{font-size:10pt;font-weight:900;line-height:1.15;letter-spacing:-.01em}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:6mm}
.stat{border-radius:3mm;background:#121212;border:1px solid #2a2a2a;padding:5mm;min-height:31mm}
.stat.l{background:#c8f531;color:#000;border-color:#c8f531}
.stat .v{font-size:22pt;font-weight:900;letter-spacing:-.04em;line-height:1}
.stat .n{font-size:8.5pt;font-weight:800;margin-top:2.5mm}
.stat .s{font-size:7pt;opacity:.7;margin-top:1mm}
.charts{display:grid;grid-template-columns:1.2fr 1fr;gap:4mm;margin-top:4mm}
.cbox{border-radius:3mm;border:1px solid #2a2a2a;padding:4mm;height:72mm;display:flex;flex-direction:column}
.cbox .t{font-size:7pt;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#9b9b9b;margin-bottom:3mm}
.cbox svg{flex:1;width:100%}
.sum{list-style:none;margin:6mm 0 0;padding:0;display:grid;gap:4mm;counter-reset:s}
.sum li{counter-increment:s;display:grid;grid-template-columns:11mm 1fr;gap:4mm;font-size:13pt;font-weight:700;line-height:1.3}
.sum li::before{content:counter(s);width:9mm;height:9mm;border-radius:50%;background:#c8f531;box-shadow:inset 0 0 0 .6mm #000;display:grid;place-items:center;font-size:10pt;font-weight:900}
.toc{margin-top:9mm;display:grid;grid-template-columns:1fr 1fr;gap:0 8mm}
.toc div{display:grid;grid-template-columns:10mm 1fr;gap:3mm;padding:2.6mm 0;border-bottom:1px solid #e6e6e6;font-size:9.5pt;font-weight:800;line-height:1.25}
.toc div b{font-weight:900}
.note{position:absolute;left:14mm;right:14mm;bottom:20mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.note div{border-radius:3mm;padding:4mm;font-size:8pt;line-height:1.4}
.note .k{background:#000;color:#fff}.note .l{background:#c8f531}
.note small{display:block;font-size:6.5pt;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:1.5mm}
.cardpage .card{margin:7mm auto 0;width:182mm}
.cardpage .card svg{width:100%;height:auto;display:block;border-radius:3mm}
.src ul{margin:6mm 0 0;padding-left:5mm;font-size:8.5pt;line-height:1.5}
.src p{font-size:8.5pt;line-height:1.5;margin:4mm 0 0;max-width:170mm}
.back .big{position:absolute;left:14mm;right:14mm;top:70mm;font-size:46pt;font-weight:900;letter-spacing:-.05em;line-height:.95}
.back .url{position:absolute;left:14mm;bottom:40mm;font-size:16pt;font-weight:900;background:#000;color:#c8f531;border-radius:99px;padding:3mm 7mm}
`;

/* Linienbild (Tagesverlauf) als SVG, wahlweise als Titelbild. */
function lineSvg(points, { w = 600, h = 300, fill = '#c8f531', stroke = '#c8f531', axis = true, ink = '#fff' } = {}) {
  if (!points || points.length < 2) return '';
  const v = points.map((p) => p[1]), lo = Math.min(...v, 0), hi = Math.max(...v, 0);
  const x = (i) => i / (points.length - 1) * w, y = (val) => 6 + (hi - val) / (hi - lo || 1) * (h - 12);
  const d = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p[1]).toFixed(1)).join('');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}L${w},${h}L0,${h}Z" fill="${fill}" fill-opacity=".9"/>` +
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="3" vector-effect="non-scaling-stroke"/>` +
    (axis ? `<line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" stroke="${ink}" stroke-opacity=".5" stroke-dasharray="4 6" vector-effect="non-scaling-stroke"/>` : '') + '</svg>';
}
function barsSvg(rows, { w = 300, h = 220 } = {}) {
  const mx = Math.max(...rows.map((r) => Math.abs(r.value))) || 1, rh = h / rows.length;
  return `<svg viewBox="0 0 ${w} ${h}">` + rows.map((r, i) => {
    const bw = Math.abs(r.value) / mx * (w - 150), yy = i * rh;
    return `<text x="0" y="${yy + rh * .62}" font-size="11" font-weight="800" fill="#fff">${esc(r.label)}</text>` +
      `<rect x="96" y="${yy + rh * .22}" width="${bw}" height="${rh * .5}" rx="3" fill="${r.value > 0 ? '#c8f531' : '#fff'}"/>` +
      `<text x="${w}" y="${yy + rh * .62}" font-size="11" font-weight="900" fill="#fff" text-anchor="end">${pct(r.value)}</text>`; }).join('') + '</svg>';
}

export function pdfHtml(b, { font }) {
  const C = Object.fromEntries(b.cards.map((c) => [c.id, c]));
  const d = new Date(b.session + 'T12:00:00Z'), day = `${WD[d.getUTCDay()]}, ${d.getUTCDate()}. ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const IX = Object.fromEntries((C.indices?.bars.rows || []).map((r) => [r.label, r.value]));
  const firstCardPage = 4, pageOf = (id) => firstCardPage + b.cards.findIndex((c) => c.id === id);
  const total = 3 + b.cards.length + 2;
  const run = (n, right) => `<div class="run"><span><b>VISION UNIVERSE®</b>Marktbriefing · ${dmy(b.session)}</span><span>${esc(right)}</span></div>`;
  const foot = (n) => `<div class="foot"><span><b>${String(n).padStart(2, '0')}</b> · Vision Universe Marktbriefing · ${dmy(b.session)}</span><span>Keine Anlageberatung · Quellen S. ${String(total - 1).padStart(2, '0')}</span></div>`;
  const words = C.overview.title.split(' '), cut = Math.ceil(words.length / 2);
  const teasers = b.cards.filter((c) => c.id !== 'overview').slice(0, 8);
  const pick = [teasers.find((c) => c.type === 'THIRD'), C.valuation, C.breadth, C.context].filter(Boolean).slice(0, 4).sort((x, y) => pageOf(x.id) - pageOf(y.id));

  const cover = `<section class="page dark cover"><div class="brand">VISION UNIVERSE<sup>®</sup></div><div class="word">MARKT<span>BRIEFING</span></div>
    <div class="date">BÖRSENSCHLUSS<br>${dmy(b.session)}</div>
    <div class="art">${lineSvg(C.overview.chart?.points, { w: 800, h: 300, fill: '#c8f531', stroke: '#c8f531', axis: false })}</div>
    <div class="badge"><div>${b.cards.length} KARTEN<small>${b.counts.OWN} eigene Auswertungen</small></div></div>
    <div class="head"><h1>${esc(words.slice(0, cut).join(' '))}<br><em>${esc(words.slice(cut).join(' '))}</em></h1><p>${esc(C.overview.sub || b.summary?.[0] || '')}</p></div>
    <div class="tiles">${pick.map((c, i) => `<div class="tile${i > 1 ? ' l' : ''}"><small>Seite ${String(pageOf(c.id)).padStart(2, '0')}</small><b>${esc(c.title)}</b></div>`).join('')}</div></section>`;

  const st = [];
  if (IX['Nasdaq 100'] != null) st.push(['Nasdaq 100', IX['Nasdaq 100'], 'Tagesschluss, ETF-Proxy']);
  if (IX['S&P 500'] != null) st.push(['S&P 500', IX['S&P 500'], 'Tagesschluss, ETF-Proxy']);
  if (IX['Dow Jones'] != null) st.push(['Dow Jones', IX['Dow Jones'], 'Tagesschluss, ETF-Proxy']);
  if (C.megacaps) st.push([C.megacaps.bars.rows[0].label, C.megacaps.bars.rows[0].value, 'größte Bewegung der Schwergewichte']);
  const statHtml = st.map(([n, v, s]) => `<div class="stat${v > 0 ? ' l' : ''}"><div class="v">${pct(v)}</div><div class="n">${esc(n)}</div><div class="s">${esc(s)}</div></div>`);
  if (C.breadth) { const p = C.breadth.pairs[0], t = p.total || p.a + p.b; statHtml.push(`<div class="stat"><div class="v">${Math.round(p.b / t * 100)} %</div><div class="n">der US-Aktien im Minus</div><div class="s">${num(p.b, 0)} von ${num(t, 0)}</div></div>`);
    statHtml.push(`<div class="stat"><div class="v">${C.breadth.pairs[1].b}</div><div class="n">neue 52-Wochen-Tiefs</div><div class="s">${C.breadth.pairs[1].a} neue Hochs</div></div>`); }
  if (C.rates) { const r = C.rates.bars.rows.find((x) => x.label === 'US 10 Jahre'); if (r) statHtml.push(`<div class="stat"><div class="v">${sg(r.value)}${num(r.value, 0)} bp</div><div class="n">US-Rendite 10 Jahre</div><div class="s">auf ${esc(r.sub)}</div></div>`);
    (C.rates.bars2?.rows || []).slice(0, 2).forEach((r) => statHtml.push(`<div class="stat${r.value > 0 ? ' l' : ''}"><div class="v">${pct(r.value)}</div><div class="n">${esc(r.label)}</div><div class="s">${esc(r.sub)}</div></div>`)); }
  const glance = `<section class="page dark">${run(2, 'Auf einen Blick')}<div style="margin-top:6mm"><span class="ressort">Auf einen Blick</span><h2 class="h1">Der Börsentag in ${statHtml.slice(0, 9).length} Zahlen</h2></div>
    <div class="stats">${statHtml.slice(0, 9).join('')}</div>
    <div class="charts"><div class="cbox"><div class="t">Nasdaq 100 im Tagesverlauf</div>${lineSvg(C.overview.chart?.points, { w: 400, h: 200, fill: '#c8f531', stroke: '#fff' })}</div>
    <div class="cbox"><div class="t">Indizes, Tagesveränderung</div>${C.indices ? barsSvg(C.indices.bars.rows) : ''}</div></div>${foot(2)}</section>`;

  const inhalt = `<section class="page">${run(3, 'Das Wichtigste in Kürze')}<div style="margin-top:6mm"><span class="ressort">Das Wichtigste in Kürze</span><h2 class="h1">${esc(C.overview.title)}</h2></div>
    <ol class="sum">${(b.summary || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
    <div class="toc">${b.cards.map((c, i) => `<div><b>${String(firstCardPage + i).padStart(2, '0')}</b><span>${esc(c.title)}</span></div>`).join('')}</div>
    <div class="note"><div class="k"><small>Eigene Auswertung</small>Marktbreite, Einordnung, Bewertung und Marktbild rechnet Vision Universe selbst aus Kursen und SEC-Meldungen.</div><div class="l"><small>Angabe Dritter</small>Nachrichten, Umfragen und Wahrscheinlichkeiten geben die genannte Quelle vom Handelstag wieder.</div></div>${foot(3)}</section>`;

  const cardPages = b.cards.map((c, i) => `<section class="page dark cardpage">${run(firstCardPage + i, c.kicker)}<div class="card">${Render.cardSvg(c, i, b.cards.length, b.session)}</div>${foot(firstCardPage + i)}</section>`).join('');

  const srcN = total - 1;
  const sources = `<section class="page src">${run(srcN, 'Quellen und Hinweise')}<div style="margin-top:6mm"><span class="ressort">Quellen und Hinweise</span><h2 class="h1">Woher die Zahlen kommen</h2></div>
    <ul>${b.cards.map((c) => `<li><b>${esc(c.title)}:</b> ${esc(c.source)}${c.url ? ` (${esc(c.url)})` : ''}</li>`).join('')}</ul>
    <p>Marktbriefing zum US-Handelstag ${esc(day)}. Indizes über ETF-Proxies, Kurse zum Tagesschluss und im Tagesverlauf verzögert. Renditen: US Treasury und Bundesbank. Fundamentaldaten: SEC EDGAR. Marktbreite, Einordnung, Bewertung und Marktbild: eigene Auswertungen von Vision Universe. Angaben Dritter geben die genannte Quelle wieder.</p>
    <p><b>Wichtiger Hinweis:</b> Redaktionelle Einordnung, keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. ${esc(b.notes.forecast)} Vergangene Entwicklungen sind kein verlässlicher Hinweis auf künftige.</p>
    <p>Herausgeber: Vision Universe · www.visionuniverse.de · Impressum: www.visionuniverse.de/impressum/</p>${foot(srcN)}</section>`;
  const back = `<section class="page lime back"><div class="brand" style="font-size:13pt;font-weight:900">VISION UNIVERSE®</div><div class="big">Jeden Börsentag neu.<br>Als Story, als PDF und in der App.</div><div class="url">www.visionuniverse.de/marktbriefing</div></section>`;
  return `<!doctype html><html lang="de"><meta charset="utf-8"><title>Marktbriefing ${dmy(b.session)}</title><style>${CSS(font)}</style><body>${cover}${glance}${inhalt}${cardPages}${sources}${back}</body></html>`;
}

function playwright() {
  try { return require('playwright'); } catch { /* global */ }
  const prefixes = [process.env.PLAYWRIGHT_PREFIX, process.env.NODE_PATH, '/usr/lib/node_modules', '/usr/local/lib/node_modules'].filter(Boolean);
  for (const p of prefixes) { try { return createRequire(path.join(p, 'x.js'))('playwright'); } catch { /* weiter */ } try { return createRequire(path.join(p, 'node_modules', 'x.js'))('playwright'); } catch { /* weiter */ } }
  throw new Error('Playwright fehlt (PLAYWRIGHT_PREFIX oder NODE_PATH setzen).');
}

export async function writePdf(b, out, { png = null } = {}) {
  const font = pathToFileURL(path.join(root, 'landing/assets/fonts/inter-latin.woff2')).href;
  const tmp = path.join(path.dirname(out), '.mb-pdf-' + process.pid + '.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(tmp, pdfHtml(b, { font }));
  const { chromium } = playwright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(tmp).href);
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, outline: true, tagged: true });
    if (png) {
      fs.mkdirSync(png, { recursive: true });
      const p2 = await browser.newPage({ viewport: { width: Render.W, height: Render.H } });
      await p2.setContent('<!doctype html><meta charset=utf-8><style>@font-face{font-family:Inter;src:url(' + font + ') format("woff2");font-weight:100 900}body{margin:0}svg{display:block}</style>' + Render.cardSvg(b.cards[0], 0, b.cards.length, b.session));
      await p2.evaluate(() => document.fonts.ready);
      await p2.locator('svg').first().screenshot({ path: path.join(png, 'karte-01.png') });
    }
  } finally { await browser.close(); fs.rmSync(tmp, { force: true }); }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, out] = process.argv.slice(2);
  const i = process.argv.indexOf('--png');
  if (!file || !out) { console.error('Aufruf: pdf.mjs <briefing.json> <ziel.pdf> [--png <ordner>]'); process.exit(2); }
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  await writePdf(b, path.resolve(out), { png: i > 0 ? path.resolve(process.argv[i + 1]) : null });
  console.log('PDF ' + out);
}
void Www;
