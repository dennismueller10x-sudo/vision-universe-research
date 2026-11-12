// Aktienreport Nr. 01 Take-Two: Datenschnappschuss aus den Repo-Artefakten (Discover, SEC-Fundamentaldaten, Kurse,
// Technik-Engine, 13F/Form 4). Schreibt data.js im Report-Ordner und überschreibt einen vorhandenen Schnappschuss nur mit --neu.
//   node docs/publishing/reports/2026-11-take-two/daten.mjs [--neu] [--out <datei>]
import fs from 'node:fs';
import zlib from 'node:zlib';
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
const has = (p) => fs.existsSync(path.join(root, p));

const T = 'TTWO';
const d = J(`discover/data/stocks/US_REAL/${T}.json`);
const f = d.fundamentals, tr = f.journey.tracks;
const daily = J(`quant/data/market/discover-series/${d.securityId}.json`).points;
const weekly = J(`quant/data/market/discover-series-long/${d.securityId}.json`).points;
const tech = J(`technical/data/stock/${T.slice(0, 2)}.json`).stocks[T];
const own = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, `quant/data/product/ownership-signals-v1/current/${T.slice(0, 2)}.json.gz`)))).issuers[T];

const sma = (s, n) => s.map((_, i) => (i + 1 >= n ? s.slice(i + 1 - n, i + 1).reduce((a, p) => a + p[1], 0) / n : null));
const track = (k) => (tr[k] || []).map((x) => [x.fy, x.v]);

// Kurs rund um große Rockstar-Starts (Wochenschlusskurse, split-bereinigt): 26 Wochen vorher bis Start, Start bis +52 Wochen.
const STARTS = [
  ['GTA III', '2001-10-22'], ['GTA: Vice City', '2002-10-29'], ['GTA: San Andreas', '2004-10-26'],
  ['GTA IV', '2008-04-29'], ['GTA V', '2013-09-17'], ['Red Dead Redemption 2', '2018-10-26'],
];
const idxAt = (iso) => { let i = weekly.findIndex((p) => p[0] >= iso); return i < 0 ? weekly.length - 1 : i; };
const starts = STARTS.map(([name, iso]) => {
  const i = idxAt(iso), a = weekly[Math.max(0, i - 26)], s = weekly[i], b = weekly[Math.min(weekly.length - 1, i + 52)], c = weekly[Math.min(weekly.length - 1, i + 4)];
  return { name, datum: iso, woche: s[0], vorher: s[1] / a[1] - 1, monat: c[1] / s[1] - 1, nachher: b[1] / s[1] - 1, kurs: s[1] };
});

const peers = ['RBLX', 'NTES', 'SONY', 'U', 'MSFT', 'NFLX'].filter((t) => has(`discover/data/stocks/US_REAL/${t}.json`)).map((t) => {
  const x = J(`discover/data/stocks/US_REAL/${t}.json`), m = x.metrics;
  return { t, n: x.companyName, ps: m.f_ps ?? null, pe: m.f_pe ?? null, growth: m.f_revenueGrowthTTM ?? null, margin: m.f_netMargin ?? null, r12m: m.return12M ?? null };
});

const m = d.metrics, rv = d.rawValues, L = f.latest, V = f.valuation;
let commit = null; try { commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch {}
const data = {
  generatedAt: new Date().toISOString(),
  snapshot: { datenCommit: commit, kurse: daily.at(-1)[0], fundamentaldaten: f.asOf, ttmBis: f.ttmThrough, technik: tech?.asOf ?? null, eigentuemer13f: own?.institutions?.period ?? null },
  aktie: {
    t: T, n: d.companyName, price: d.price.value, r1m: m.return1M, r3m: m.return3M, r6m: m.return6M, r12m: m.return12M,
    hi: m.distanceTo52wHigh, lo: m.distanceTo52wLow, vol: m.volatility252d, dd: m.maxDrawdown252d, beta: rv.beta252d,
    sma50: rv.distanceToSMA50, sma200: rv.distanceToSMA200, rs: d.ranks, index: (d.indexMemberships || []).map((x) => x.shortLabel),
    themen: d.memberships, plain: d.plain, jahresspanne: d.jahresspanne,
    mcap: d.price.value * L.ttm.shares_outstanding.v, aktien: L.ttm.shares_outstanding.v, ps: V.ps?.value ?? null, fcfYield: V.fcfYield?.value ?? null,
    psMedian: V.context?.psMedian ?? null,
  },
  ttm: Object.fromEntries(Object.entries(L.ttm).map(([k, v]) => [k, v.v])),
  jahr: { fy: L.fiscalYear, ...Object.fromEntries(Object.entries(L.annual).map(([k, v]) => [k, v.v])) },
  tracks: { umsatz: track('revenue'), gewinn: track('net_income'), fcf: track('free_cash_flow'), ocf: track('operating_cash_flow'), cash: track('cash'), schulden: track('debt'), aktien: track('shares'), brutto: (tr.margins?.gross || []).map((x) => [x.fy, x.v]) },
  health: f.health.categories.map((c) => ({ label: c.label.replace('Profitabilitaet', 'Profitabilität'), grade: c.grade, detail: c.detail.replace('Geschaeftsjahr', 'Geschäftsjahr') })),
  tech: tech ? { structure: tech.structure, rsRank: tech.rsRank, formations: tech.formations, trend: tech.trend } : null,
  own: own ? { insider: own.insider, schedules: own.schedules, inst: own.institutions } : null,
  daily, sma50: sma(daily, 50), sma200: sma(daily, 200), weekly, starts, peers,
};
fs.writeFileSync(out, 'window.VU_DATA = ' + JSON.stringify(data) + ';\n');
console.log('geschrieben', path.relative(root, out), 'Kurs', data.aktie.price, 'am', data.snapshot.kurse, 'TTM bis', data.snapshot.ttmBis);
console.table(starts.map((s) => ({ name: s.name, woche: s.woche, vorher: (s.vorher * 100).toFixed(0), monat: (s.monat * 100).toFixed(0), nachher: (s.nachher * 100).toFixed(0) })));
