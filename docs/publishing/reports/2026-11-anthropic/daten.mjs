// Aktienreport Nr. 02 Anthropic: Datenschnappschuss. Anthropic-Zahlen stehen fest im Skript (Prospekt S-1/A Nr. 3 vom
// 17.11.2026, geprüftes Faktenblatt); Vergleichswerte kommen aus den Discover-Artefakten (Stand 17.11.2026).
// Kurse nur als Veränderung oder Index, nie als Preisreihe. Schreibt data.js im Report-Ordner, überschreibt nur mit --neu.
//   node docs/publishing/reports/2026-11-anthropic/daten.mjs [--neu] [--out <datei>]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const out = oi >= 0 ? path.resolve(argv[oi + 1]) : path.join(here, 'data.js');
if (fs.existsSync(out) && oi < 0 && !argv.includes('--neu')) { console.error('data.js existiert: Report ist eingefroren (--neu bewusst setzen).'); process.exit(1); }
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

// Anthropic laut Prospekt (Mio. $, GAAP, wenn nicht anders vermerkt)
const ANT = {
  aktien: 13086672593, // alle Klassen nach Angebot und Privatplatzierung, bei 74 $
  aktienVoll: 18012993379, // eigene Summe aus „Additional Adjustments“
  spanne: [70, 78],
  quartale: [['Q1 25', 376], ['Q2 25', 787], ['Q3 25', 1382], ['Q4 25', 2040], ['Q1 26', 4731], ['Q2 26', 11555], ['Q3 26', 16956]],
  compute: [944, 1390, 2047, 2945, 3387, 5558, 9863],
  opQuartal: [-935, -1200, -3089, -2836, -1667, 974, -567],
  jahre: [['2023', 41], ['2024', 386], ['2025', 4585], ['9M 2026', 33242]],
  runRate: 81000,
  nettoverlust9M: -104039, zeitwert9M: -94324, sonstiges9M: -10397, op9M: -1260, opAdj9M: 4081, nettoAdj9M: 5591, ocf9M: 6569, capex9M: 925,
  barmittel: 131845, verpflichtungen: 900900,
};
ANT.ttm = ANT.quartale.slice(-4).reduce((a, q) => a + q[1], 0); // Q4 2025 bis Q3 2026, eigene Rechnung
ANT.mcap = ANT.spanne.map((p) => (ANT.aktien * p) / 1e6); // Mio. $
ANT.mcapMitte = (ANT.aktien * 74) / 1e6;

const VERGLEICH = ['NVDA', 'MSFT', 'GOOGL', 'AMZN', 'AVGO', 'META', 'TSLA', 'PLTR', 'SPCX'];
const CYBER = ['CRWD', 'PANW', 'FTNT', 'ZS', 'NET'];
const KURZ = { NVDA: 'Nvidia', MSFT: 'Microsoft', GOOGL: 'Alphabet', AMZN: 'Amazon', AVGO: 'Broadcom', META: 'Meta', TSLA: 'Tesla', PLTR: 'Palantir', SPCX: 'SpaceX', CRWD: 'CrowdStrike', PANW: 'Palo Alto Networks', FTNT: 'Fortinet', ZS: 'Zscaler', NET: 'Cloudflare' };
const karte = (t) => {
  const d = J(`discover/data/stocks/US_REAL/${t}.json`), g = d.geschaeftszahlen || {}, m = d.metrics || {};
  return {
    t, n: KURZ[t] || d.companyName, asOf: d.asOf,
    mcap: d.fundamentals?.valuation?.marketCap?.value ? d.fundamentals.valuation.marketCap.value / 1e6 : null,
    umsatzTTM: g.umsatzTTM ?? null, gewinnTTM: g.gewinnTTM ?? null, kgv: g.kgv ?? null, ttmBis: g.zeitraum?.bis ?? null, ttmDurch: g.zeitraum?.durch ?? null,
    wachstum: g.umsatzWachstum ?? null, ps: m.f_ps ?? null, r12m: m.return12M ?? null, r6m: m.return6M ?? null, r3m: m.return3M ?? null,
    zumHoch: m.distanceTo52wHigh ?? null,
  };
};
const vergleich = Object.fromEntries(VERGLEICH.map((t) => [t, karte(t)]));
const cyber = Object.fromEntries(CYBER.map((t) => [t, karte(t)]));

// Kursverlauf zwölf Monate nur als Index (Start = 100)
const index = (t) => {
  const d = J(`discover/data/stocks/US_REAL/${t}.json`);
  const p = J(`quant/data/market/discover-series/${d.securityId}.json`).points.slice(-252);
  const b = p[0][1];
  return p.map(([dt, v]) => [dt, Math.round((v / b) * 1000) / 10]);
};
const kursindex = Object.fromEntries(['NVDA', 'MSFT', 'GOOGL', 'AMZN'].map((t) => [t, index(t)]));

let commit = null; try { commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch {}
const data = {
  generatedAt: new Date().toISOString(),
  snapshot: { datenCommit: commit, vergleich: vergleich.NVDA.asOf, prospekt: '2026-11-17' },
  ant: ANT, vergleich, cyber, kursindex,
};
fs.writeFileSync(out, 'window.VU_DATA = ' + JSON.stringify(data) + ';\n');
console.log('geschrieben', path.relative(root, out), 'Stand', data.snapshot.vergleich, 'TTM Anthropic', ANT.ttm, 'Börsenwert', ANT.mcap.map((v) => Math.round(v / 1e3)).join('–'), 'Mrd. $');
console.table(Object.values({ ...vergleich, ...cyber }).map((v) => ({ t: v.t, mcap: v.mcap && Math.round(v.mcap / 1e3), umsatz: v.umsatzTTM, kgv: v.kgv, ps: v.ps && v.ps.toFixed(1), r12m: v.r12m && (v.r12m * 100).toFixed(0), bis: v.ttmBis })));
