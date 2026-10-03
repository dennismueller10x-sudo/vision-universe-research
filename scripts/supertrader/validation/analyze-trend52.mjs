#!/usr/bin/env node
// Supertrader R12 - VU Trendfolge 52W (PREREGISTRATION-R12.json): Vollportfolio 2016-2026 auf dem
// bereinigten Point-in-Time-Universum inklusive delisteter Titel. Primaer PP (Clenow-Rang), Sensitivitaeten
// BASE und PP-RS, Referenz PP-RANDOM (20 Zufallsreihenfolgen). Ausgabe nur verschluesselt; Log nur Zaehlwerte.
//
//   node scripts/supertrader/validation/analyze-trend52.mjs --out DIR [--limit N]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { loadPitData } from './analyze-methods.mjs';
import { cagrBetween, maxDrawdown } from './portfolio.mjs';
import { simulateRotation, PARAMS } from '../engine/rotation-52w.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const W = L.WINDOW;
const SPLIT = [['2016-01-04', '2020-12-31'], ['2021-01-01', W.to]];
const PHASES = [['Q4_2018', '2018-09-20', '2018-12-24'], ['COVID_2020', '2020-02-19', '2020-03-23'], ['BEAR_2022', '2022-01-03', '2022-10-12'], ['BULL_2023_2024', '2023-01-03', '2024-12-31']];

export function metrics(run, spyTR, from = W.from, to = W.to) {
  const eq = run.equity.filter((p) => p.date >= from && p.date <= to);
  const yrs = (Date.parse(eq[eq.length - 1].date) - Date.parse(eq[0].date)) / (365.25 * 864e5);
  const cagr = (eq[eq.length - 1].equity / eq[0].equity) ** (1 / yrs) - 1;
  const spy = cagrBetween(spyTR, eq[0].date, eq[eq.length - 1].date, 'value');
  const rets = []; for (let i = 1; i < eq.length; i++) rets.push(eq[i].equity / eq[i - 1].equity - 1);
  const mu = rets.reduce((a, b) => a + b, 0) / rets.length, sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length);
  const tr = run.trades.filter((t) => t.entry.date >= from && t.entry.date <= to);
  const hold = tr.map((t) => (Date.parse(t.exits[t.exits.length - 1].date) - Date.parse(t.entry.date)) / 864e5);
  const annual = {}; for (const y of [...new Set(eq.map((p) => p.date.slice(0, 4)))]) { const c = cagrBetween(eq, `${y}-01-01`, `${y}-12-31`); const pts = eq.filter((p) => p.date.slice(0, 4) === y); const before = eq.filter((p) => p.date < `${y}-01-01`); const a = before.length ? before[before.length - 1] : pts[0]; annual[y] = pts[pts.length - 1].equity / a.equity - 1; void c; }
  const at = (curve, d, key) => { let v = null; for (const p of curve) { if (p.date > d) break; v = p[key]; } return v; };
  return {
    cagr, spyCagr: spy, excessCagr: cagr - spy, maxDrawdown: maxDrawdown(eq), volatility: sd * Math.sqrt(252), sharpe: sd > 0 ? ((mu * 252) - 0.02) / (sd * Math.sqrt(252)) : null,
    meanExposure: eq.reduce((a, p) => a + p.exposure, 0) / eq.length, meanPositions: eq.reduce((a, p) => a + p.positions, 0) / eq.length,
    trades: tr.length, hitRate: tr.filter((t) => t.returnPct > 0).length / (tr.length || 1), meanTradeReturn: tr.reduce((a, t) => a + t.returnPct, 0) / (tr.length || 1),
    medianHoldDays: hold.sort((a, b) => a - b)[Math.floor(hold.length / 2)] ?? null, annual,
    subperiods: SPLIT.map(([a, b]) => { const c = cagrBetween(run.equity, a, b), s = cagrBetween(spyTR, a, b, 'value'); return { from: a, to: b, cagr: c, spy: s, excess: c != null && s != null ? c - s : null }; }),
    phases: PHASES.map(([id, a, b]) => { const s0 = at(run.equity, a, 'equity'), s1 = at(run.equity, b, 'equity'), b0 = at(spyTR, a, 'value'), b1 = at(spyTR, b, 'value'); return { id, strategy: s0 && s1 ? s1 / s0 - 1 : null, spy: b0 && b1 ? b1 / b0 - 1 : null }; }),
    skippedByReason: run.skipped.reduce((a, x) => ((a[x.reason] = (a[x.reason] || 0) + 1), a), {}), terminalCount: run.book.terminalCount,
  };
}

// Kontrollen: Endwert = Start + Ergebnisse + Dividenden + offener Wert; jeder Kauf/Verkauf gegen die Eroeffnung.
export function controls(run, stocks, opts) {
  const slip = (opts.slippageBps ?? 10) / 1e4;
  const byId = new Map(stocks.map((s) => [s.id, s]));
  let bad = 0, checked = 0;
  for (const t of [...run.trades, ...run.openAtEnd.map((o) => ({ listingId: o.listingId, entry: { date: o.entryDate, price: o.entryPrice }, exits: o.exits }))]) {
    const s = byId.get(t.listingId); const i = s.bars.date.indexOf(t.entry.date);
    checked++; if (!(i >= 0 && Math.abs(s.bars.open[i] * (1 + slip) / t.entry.price - 1) < 1e-9)) bad++;
    for (const x of t.exits) { if (x.ruleId === 'DELISTED') continue; const k = s.bars.date.indexOf(x.date); checked++; if (!(k >= 0 && Math.abs(s.bars.open[k] * (1 - slip) / x.price - 1) < 1e-9)) bad++; }
  }
  const realized = run.trades.reduce((a, t) => a + t.returnPct, 0); void realized;
  const openVal = run.openAtEnd.reduce((a, o) => a + o.shares * (o.lastPrice ?? o.entryPrice), 0);
  const end = run.equity[run.equity.length - 1].equity;
  return { pricesChecked: checked, priceMismatches: bad, endEquity: end, cashPlusOpen: run.cashEnd + openVal, reconcileRelDiff: Math.abs(end / (run.cashEnd + openVal) - 1) };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT = arg('--out', path.join(os.tmpdir(), 'trend52'));
  const LIMIT = Number(arg('--limit', '0'));
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[trend52 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const { segs, spyTR, spyAdj, calendar, nonEquityExcluded } = await loadPitData({ LIMIT, log, excludeNonEquity: true });
  const stocks = segs.map((seg) => {
    const a = L.adjustSeries(seg.raw); const n = a.date.length;
    return { id: seg.id, symbol: seg.id.split(':')[2] || seg.id, survivor: seg.survivor, delisted: seg.delisted,
      bars: { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume }, divAdj: a.divAdj, rs: seg.cross?.rs || null,
      terminal: seg.delisted ? { date: a.date[n - 1], lastClose: a.close[n - 1], distress: L.distressSignature(a.rawClose), kind: 'DELISTED' } : null };
  });
  for (const s of segs) { s.raw = null; }
  log(`Aktien ${stocks.length}, delistet ${stocks.filter((s) => s.delisted).length}`);
  const spy = { date: spyAdj.date, close: spyAdj.close };
  const runs = {}, ctl = {};
  const go = (key, list, opts) => { const r = simulateRotation(list, calendar, spy, { from: W.from, to: W.to, ...opts }); runs[key] = metrics(r, spyTR); ctl[key] = controls(r, list, opts); log(`${key}: Trades ${r.trades.length}, offen ${r.openAtEnd.length}`); return r; };
  const pp = go('PP_S0', stocks, { variant: 'PP', rank: 'CLENOW', scenario: 'S0_LAST_PRICE' });
  const ppS1 = go('PP_S1', stocks, { variant: 'PP', rank: 'CLENOW', scenario: 'S1_MINUS_30' });
  go('PP_S2', stocks, { variant: 'PP', rank: 'CLENOW', scenario: 'S2_DISTRESS_ZERO' });
  go('PP_COST2_S1', stocks, { variant: 'PP', rank: 'CLENOW', scenario: 'S1_MINUS_30', slippageBps: 20, commissionBps: 2 });
  go('PP_SURVIVORS', stocks.filter((s) => s.survivor), { variant: 'PP', rank: 'CLENOW', scenario: 'S0_LAST_PRICE' });
  const base = go('BASE_S1', stocks, { variant: 'BASE', rank: 'CLENOW', scenario: 'S1_MINUS_30' });
  go('PP_RS_S1', stocks, { variant: 'PP', rank: 'RS', scenario: 'S1_MINUS_30' });
  const seeds = [];
  for (let s = 1; s <= 20; s++) { const r = simulateRotation(stocks, calendar, spy, { from: W.from, to: W.to, variant: 'PP', rank: 'RANDOM', seed: s, scenario: 'S1_MINUS_30' }); const m = metrics(r, spyTR); seeds.push({ seed: s, excessCagr: m.excessCagr, cagr: m.cagr, maxDrawdown: m.maxDrawdown }); }
  log('Zufallsreihenfolgen fertig');
  const s1 = runs.PP_S1;
  const judgement = { R1: s1.excessCagr > 0, R2: s1.subperiods.every((x) => x.excess > 0), R3: seeds.filter((x) => x.excessCagr > 0).length >= 16, R4: runs.PP_COST2_S1.excessCagr > 0, seedsPositive: seeds.filter((x) => x.excessCagr > 0).length };
  judgement.verdict = judgement.R1 && judgement.R2 && judgement.R3 && judgement.R4 ? 'CRITERIA_MET' : 'TESTED_NO_EDGE';
  // Rohdaten fuer die Fallpruefung und das Produkt: Trades, Entscheidungen (alle Kandidaten je Monat)
  const slim = (r) => ({ trades: r.trades.map((t) => ({ listingId: t.listingId, entry: t.entry, exits: t.exits.map((x) => ({ date: x.date, ruleId: x.ruleId, fraction: x.fraction })), returnPct: t.returnPct, weightAtEntry: t.weightAtEntry, rankAtEntry: t.rankAtEntry })),
    openAtEnd: r.openAtEnd.map((o) => ({ listingId: o.listingId, entryDate: o.entryDate, exits: o.exits.map((x) => ({ date: x.date, ruleId: x.ruleId })) })), skipped: r.skipped.filter((x) => x.decision).map((x) => [x.date, x.listingId, x.reason]),
    decisions: r.decisions.map((d) => ({ date: d.date, green: d.green, universe: d.universe, candidates: d.candidates, sells: d.sells, buys: d.buys, top: d.top.map((x) => [x.listingId, x.rank, x.score, x.perf]) })) });
  const result = { schema: 'supertrader-validation-trend52-1.0.0', prereg: 'supertrader-validation-prereg-r12-1.0.0', at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, limit: LIMIT || null,
    params: PARAMS, universe: { stocks: stocks.length, delisted: stocks.filter((s) => s.delisted).length, nonEquityExcluded: Array.isArray(nonEquityExcluded) ? nonEquityExcluded.length : nonEquityExcluded },
    spy: { cagr: cagrBetween(spyTR, W.from, W.to, 'value'), maxDrawdown: maxDrawdown(spyTR, 'value') }, runs, seeds, judgement, controls: ctl,
    raw: { PP_S1: slim(ppS1), BASE_S1: slim(base) }, ppS0Decisions: pp.decisions.length };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `trend52${LIMIT ? '-smoke' : ''}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  log('Verschluesseltes Ergebnis geschrieben');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
