// Erzeugt /index.html aus scripts/home/index.template.html.
// Setzt die HUD-Icons ein und zeichnet Chart (NVIDIA, Technik & Elliott) und
// Sparklines aus den Produktdaten unter quant/data/product/technical-signals-v1.
// Aufruf: node scripts/home/build-home.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const load = t => JSON.parse(gunzipSync(readFileSync(new URL(`quant/data/product/technical-signals-v1/${t.slice(0, 2)}.json.gz`, root)))).instruments[t];
const f = n => n.toFixed(1);

// Hauptchart: 600 x 260 Zeichenflaeche, Preisachse 150–280 USD
const nvda = load('NVDA'), b = nvda.bundle, close = nvda.bars.close, ts = nvda.bars.timestamps;
const W = 600, H = 260, TOP = 280, BOT = 150;
const x = k => k / (close.length - 1) * W, y = v => (TOP - v) / (TOP - BOT) * H;
const path = a => a.map((v, k) => v == null ? null : `${f(x(k))} ${f(y(v))}`).filter(Boolean).map((p, k) => (k ? 'L' : 'M') + p).join(' ');

// Elliott: Wellen der Primaerzaehlung im Anzeigefenster (Startpunkt der ersten Welle als "0")
const waves = b.elliott.primaryCount.waves.filter(w => ts.includes(w.fromTime) && ts.includes(w.toTime));
const pts = waves.length ? [[waves[0].fromTime, waves[0].fromPrice, '0'], ...waves.map(w => [w.toTime, w.toPrice, w.label])] : [];
const nodes = pts.map(([d, p, l], i) => {
  const px = x(ts.indexOf(d)), py = y(p), below = i > 0 && pts[i - 1][1] > p || (i === 0 && pts[1] && pts[1][1] > p);
  const lx = Math.min(px, W - 12), ly = below ? py + 20 : py - 12;
  return `<circle cx="${f(px)}" cy="${f(py)}" r="4" fill="#0b0d10" stroke="#f4f5f1" stroke-width="1.6"/><text x="${f(lx)}" y="${f(ly)}" text-anchor="middle" fill="#f4f5f1" font-size="13" font-weight="900" font-family="Inter,sans-serif">(${l})</text>`;
}).join('');
const setup = b.tradeSetup || {};
const inv = setup.analysisInvalidation?.price ?? 206;
const tgt = (setup.targets || []).at(-1);
const [tLo, tHi] = tgt ? [tgt.low ?? tgt.zoneLow ?? 270, tgt.high ?? tgt.zoneHigh ?? 279] : [270, 279];
const ent = setup.entry || {}; const [eLo, eHi] = [ent.low ?? ent.zoneLow ?? 225, ent.high ?? ent.zoneHigh ?? 228];

// Sparklines: letzte 66 Handelstage, 60 x 24
const spark = t => { const c = load(t).bars.close.slice(-66), mn = Math.min(...c), mx = Math.max(...c);
  return { d: c.map((v, k) => (k ? 'L' : 'M') + f(k / (c.length - 1) * 60) + ' ' + f(2 + (mx - v) / (mx - mn) * 20)).join(''),
    chg: ((c.at(-1) / c[0] - 1) * 100).toFixed(1).replace('.', ',').replace(/^(?!-)/, '+') + ' %' }; };

const values = {
  HUD_SYMBOLS: read('scripts/home/hud-symbols.html').trimEnd(),
  CLOSE: path(close), AREA: path(close) + ` L${W} ${H} L0 ${H}Z`,
  S50: path(b.chartSeries.sma50), S200: path(b.chartSeries.sma200),
  WAVE: pts.map(([d, p], i) => (i ? 'L' : 'M') + f(x(ts.indexOf(d))) + ' ' + f(y(p))).join(' '), WAVE_NODES: nodes,
  T1: f(y(tHi)), TH: f(y(tLo) - y(tHi)), T_LABEL: f(y(tLo) + 13),
  E1: f(y(eHi)), EH: f(y(eLo) - y(eHi)),
  T_TEXT: `${tLo}–${tHi}`, INV_TEXT: String(inv),
  INV: f(y(inv)), INV_LABEL: f(y(inv) + 14),
};
for (const t of ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'META']) { const s = spark(t); values['SPK_' + t] = s.d; values['CHG_' + t] = s.chg; }

const out = read('scripts/home/index.template.html').replace(/%%([A-Z0-9_]+)%%/g, (m, k) => {
  if (!(k in values)) throw new Error('Unbekannter Platzhalter ' + m);
  return values[k];
});
writeFileSync(new URL('index.html', root), out);
console.log(`index.html geschrieben · Datenstand ${b.dataCutoff} · Elliott-Punkte ${pts.map(p => p[2]).join(',')} · Invalidierung ${inv} · Ziel ${tLo}–${tHi}`);
