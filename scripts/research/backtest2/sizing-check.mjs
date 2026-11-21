#!/usr/bin/env node
/**
 * Backtest 2.0, Vorprüfung: synthetischer Gegentest der Turtle-Engine (Supertrader C01/C02).
 * Forschung, nicht zertifiziert. Liest keine Produktionsdaten und schreibt nichts ins Repository.
 *
 * Frage: Rechnet die Engine richtig, und wie konzentriert wird ein Aktiendepot unter der Turtle-Positionsgröße?
 * Bekannte Kursprozesse (geometrische Brownsche Bewegung, fester Zufallsstart) mit bekanntem Soll:
 *   Trend -> Gewinn, kein Trend -> leichter Verlust, Abwärtstrend -> Verlust.
 * Befund und Folgen: docs/research/backtest2/BEFUND-POSITIONSGROESSE.md, Protokoll: docs/research/backtest2/PROTOKOLL.md.
 *
 *   node scripts/research/backtest2/sizing-check.mjs [--json]
 */
import { runTurtle } from '../../supertrader/source-faithful/methods/turtle.mjs';

export const CASES = Object.freeze([
  { id: 'TREND_STARK', label: 'starker Aufwärtstrend', mu: 0.40, vol: 0.25 },
  { id: 'TREND_MODERAT', label: 'moderater Trend', mu: 0.12, vol: 0.30 },
  { id: 'KEIN_TREND', label: 'kein Trend', mu: 0, vol: 0.30 },
  { id: 'ABWAERTS', label: 'Abwärtstrend', mu: -0.20, vol: 0.30 },
]);

// mulberry32: gleichmäßig verteilte, unkorrelierte Zufallszahlen je Startwert (ein einfacher LCG erzeugte bei
// einzelnen Startwerten korrelierte Pfade, alle Titel fielen unter die Preisgrenze und es gab keinen Handel)
function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => { let x = 0; while (!x) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
}

export function calendar(n, start = '2016-01-04') {
  const out = []; let d = new Date(start + 'T00:00:00Z');
  while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); }
  return out;
}

export function syntheticSecurities(cal, { mu, vol, count = 60, seed = 7, volume = 2e6 }) {
  const g = rng(seed), m = mu / 252, sg = vol / Math.sqrt(252);
  return Array.from({ length: count }, (_, k) => {
    let p = 50; const bars = [];
    for (const date of cal) {
      const open = p * Math.exp(sg * 0.3 * g()), close = p * Math.exp(m - sg * sg / 2 + sg * g());
      const high = Math.max(open, close) * (1 + Math.abs(g()) * sg * 0.5), low = Math.min(open, close) * (1 - Math.abs(g()) * sg * 0.5);
      bars.push({ date, open, high, low, close, volume, rawClose: close, rawVolume: volume, splitAdj: 1, dividend: 0 });
      p = close;
    }
    return { id: 'SYN' + k, bars, terminal: null, survivor: true, cls: null };
  });
}

export function summarize(run, secs, fromIndex) {
  const eq = run.curve.map((c) => c.equity), years = eq.length / 252;
  let peak = -Infinity, maxDrawdown = 0;
  for (const e of eq) { peak = Math.max(peak, e); maxDrawdown = Math.min(maxDrawdown, e / peak - 1); }
  const mean = (k) => run.curve.reduce((a, c) => a + c[k], 0) / run.curve.length;
  const eqAt = new Map(run.curve.map((c) => [c.date, c.equity]));
  const unitShares = run.ledger.filter((l) => l.side === 'BUY').map((b) => b.gross / eqAt.get(b.date)).sort((a, b) => a - b);
  const stockLog = secs.reduce((a, s) => a + Math.log(s.bars.at(-1).close / s.bars[fromIndex].close), 0) / secs.length;
  return {
    cagr: (eq.at(-1) / eq[0]) ** (1 / years) - 1,
    maxDrawdown,
    avgExposure: mean('exposure'),
    avgPositions: mean('positions'),
    medianUnitShareOfEquity: unitShares.length ? unitShares[unitShares.length >> 1] : null,
    entries: run.counts.entries,
    rejectedNoCash: run.counts.rejectNoCash,
    avgStockCagr: Math.exp(stockLog / years) - 1,
    reconciliation: run.reconciliation.pass,
  };
}

export const SEEDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const median = (xs) => { const a = [...xs].sort((x, y) => x - y), n = a.length; return n % 2 ? a[n >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2; };

export function runCheck({ sessions = 1700, warmup = 300, count = 60, seeds = SEEDS } = {}) {
  const cal = calendar(sessions), rows = [];
  for (const c of CASES) for (const system of ['S1', 'S2']) {
    const runs = seeds.map((seed) => { const secs = syntheticSecurities(cal, { ...c, count, seed }); return summarize(runTurtle({ calendar: cal, securities: secs }, { system, from: cal[warmup] }), secs, warmup); });
    const pick = (k) => runs.map((r) => r[k]);
    rows.push({
      case: c.id, label: c.label, system, seeds: seeds.length,
      cagr: { median: median(pick('cagr')), min: Math.min(...pick('cagr')), max: Math.max(...pick('cagr')) },
      avgStockCagr: median(pick('avgStockCagr')), maxDrawdown: median(pick('maxDrawdown')), avgPositions: median(pick('avgPositions')),
      medianUnitShareOfEquity: median(pick('medianUnitShareOfEquity')), rejectedNoCash: median(pick('rejectedNoCash')),
      reconciliation: runs.every((r) => r.reconciliation),
    });
  }
  return { schema: 'backtest2-sizing-check-1', label: 'Forschung, nicht zertifiziert', rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = runCheck();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(res, null, 1)); process.exit(0); }
  const pct = (x) => (x * 100).toFixed(1).padStart(6) + ' %';
  console.log('Median über ' + SEEDS.length + ' Zufallsstarts, CAGR mit Spannweite (min … max)');
  for (const r of res.rows) console.log(`${r.label.padEnd(22)} ${r.system}  CAGR ${pct(r.cagr.median)} (${pct(r.cagr.min)} … ${pct(r.cagr.max)})  Aktie Ø ${pct(r.avgStockCagr)}  MaxDD ${pct(r.maxDrawdown)}  Ø Positionen ${r.avgPositions.toFixed(2)}  Unit ${pct(r.medianUnitShareOfEquity)} des Depots  abgelehnt ${r.rejectedNoCash}  Abgleich ${r.reconciliation}`);
}
