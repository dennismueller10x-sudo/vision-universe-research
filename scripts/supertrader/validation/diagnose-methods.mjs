#!/usr/bin/env node
// Supertrader — Ursachenanalyse der negativen Ergebnisse (Runde 7).
//
//   node scripts/supertrader/validation/diagnose-methods.mjs [--limit 400]
//
// Kein neuer Test einer Hypothese und keine neue Regelversion: dieselben
// Daten (US_PIT_2016_A), dieselben Engines in den getesteten Versionen,
// dieselbe Ausfuehrung. Zerlegt das Ergebnis in
//   1. Signalqualitaet je Trade (gegen SPY im selben Haltezeitraum, R-Vielfache),
//   2. Einstiegs-Gaps, Stop-Gaps, Kosten,
//   3. Kapitaleinsatz (Investitionsquote, Cash-Phasen, theoretische Hoechstquote),
//   4. Portfolioeffekte (uebersprungene Kandidaten, Reihenfolge),
//   5. Filtertrichter (Scan-Stufen, gescheiterte Regeln, Invalidierungen),
// und rechnet Vergleichsszenarien, die ausdruecklich DIAGNOSE sind
// (keine Strategieversion, kein Ergebnis fuer Kunden):
//   * SPY mit derselben taeglichen Investitionsquote,
//   * Strategie + ungenutztes Kapital in SPY,
//   * Gleichgewichtung 10 % je Position statt Risikosteuerung.
// Ausgabe nur verschluesselt; Logs nur Fortschrittszahlen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { runPortfolioTR, cagrBetween, maxDrawdown } from './portfolio.mjs';
import { loadPitData, segCtx, tradesFor, tradeRet, rawGate, ENGINES } from './analyze-methods.mjs';
import { PORTFOLIO_DEFAULTS } from '../engine/backtest.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import donchian from '../engine/strategies/donchian.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const DIAG_SCHEMA = 'supertrader-validation-diagnose-1.0.0';
export const DIAG_ENGINES = [...ENGINES, donchian];
const W = L.WINDOW;

const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null);
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function dist(vals) {
  const s = vals.filter(Number.isFinite).sort((a, b) => a - b);
  return { n: s.length, mean: meanOf(s), median: q(s, 0.5), p10: q(s, 0.1), p90: q(s, 0.9), pos: s.length ? s.filter((x) => x > 0).length / s.length : null };
}

// SPY-Gesamtrendite vom Schluss vor dem Einstieg bis zum letzten Ausstiegstag.
export function spyWindow(spyIdx, spyTR, entryDate, exitDate) {
  let a = spyIdx.get(entryDate), b = spyIdx.get(exitDate);
  if (a === undefined || b === undefined) return null;
  a = Math.max(0, a - 1);
  return spyTR[b].value / spyTR[a].value - 1;
}

// Signalqualitaet einer Trade-Liste (alle Engine-Trades, ohne Portfoliogrenzen).
export function signalQuality(trades, spyIdx, spyTR) {
  const rets = [], excess = [], r = [], gaps = [], held = [];
  let stopGap = 0, stopExits = 0, entryDayStops = 0, costs = 0;
  const comm = DEFAULT_EXECUTION.commissionBps / 1e4, slip = DEFAULT_EXECUTION.slippageBps / 1e4;
  const byGap = { '<=1%': [], '1-3%': [], '3-5%': [], '>5%': [] };
  for (const t of trades) {
    const v = tradeRet(t); if (!Number.isFinite(v)) continue;
    rets.push(v);
    const last = t.terminal ? t.terminal.date : t.exits[t.exits.length - 1].date;
    const s = spyWindow(spyIdx, spyTR, t.entry.date, last);
    if (Number.isFinite(s)) excess.push(v - s);
    const risk = t.entry.price - t.initialStop;
    if (risk > 0) r.push((v * t.entry.price) / risk);
    if (Number.isFinite(t.trigger) && t.trigger > 0 && Number.isFinite(t.rawOpenEntry)) {
      // Gap der Eroeffnung gegenueber dem Trigger (beide im bereinigten Massstab: entry.price/(1+slip)).
      const g = t.entry.price / (1 + slip) / t.trigger - 1;
      gaps.push(g);
      (g <= 0.01 ? byGap['<=1%'] : g <= 0.03 ? byGap['1-3%'] : g <= 0.05 ? byGap['3-5%'] : byGap['>5%']).push(v);
    }
    for (const x of t.exits) {
      if (/STOP|TRAIL/.test(x.ruleId || '') || x.basis === 'STOP_ORDER_ASSUMPTION' || x.basis === 'OPEN_BELOW_STOP') { stopExits++; if (x.basis === 'OPEN_BELOW_STOP') stopGap++; }
      if (x.date === t.entry.date) entryDayStops++;
    }
    costs += 2 * (comm + slip);
    held.push(t.heldSessions);
  }
  return {
    trades: rets.length, ret: dist(rets), excessVsSpySameWindow: dist(excess), rMultiple: dist(r), entryGapVsTrigger: dist(gaps),
    returnByEntryGap: Object.fromEntries(Object.entries(byGap).map(([k, v]) => [k, dist(v)])),
    stopExitShare: rets.length ? stopExits / rets.length : null, stopGapShareOfStops: stopExits ? stopGap / stopExits : null,
    entryDayExitShare: rets.length ? entryDayStops / rets.length : null, costPerTrade: rets.length ? costs / rets.length : null,
    heldSessions: dist(held),
  };
}

// Vergleichsreihen aus einer Equity-Kurve mit Investitionsquote (DIAGNOSE).
export function exposureScenarios(equity, spyIdx, spyTR) {
  let matched = 1, cashSpy = 1, prevE = null, prevExp = 0, prevSpy = null;
  const mCurve = [], cCurve = [];
  for (const p of equity) {
    const i = spyIdx.get(p.date); const sv = i !== undefined ? spyTR[i].value : null;
    if (prevE !== null && sv !== null && prevSpy !== null) {
      const rs = sv / prevSpy - 1, rStrat = p.equity / prevE - 1;
      matched *= 1 + prevExp * rs;
      cashSpy *= 1 + rStrat + (1 - prevExp) * rs;
    }
    mCurve.push({ date: p.date, equity: matched }); cCurve.push({ date: p.date, equity: cashSpy });
    prevE = p.equity; prevExp = p.exposure; if (sv !== null) prevSpy = sv;
  }
  const a = equity[0].date, b = equity[equity.length - 1].date;
  const exp = equity.map((p) => p.exposure);
  return {
    meanExposure: meanOf(exp), daysBelow5pct: exp.filter((x) => x < 0.05).length / exp.length, daysAbove90pct: exp.filter((x) => x > 0.9).length / exp.length,
    spyExposureMatched: { cagr: cagrBetween(mCurve, a, b), maxDrawdown: maxDrawdown(mCurve) },
    strategyPlusIdleCashInSpy: { cagr: cagrBetween(cCurve, a, b), maxDrawdown: maxDrawdown(cCurve) },
  };
}

// Theoretische Hoechstquote bei Risikosteuerung: maxPositions x min(maxPct, risk/Stopabstand).
export function theoreticalMaxExposure(trades, cfg = PORTFOLIO_DEFAULTS) {
  const d = trades.map((t) => (t.entry.price - t.initialStop) / t.entry.price).filter((x) => x > 0).sort((a, b) => a - b);
  const med = q(d, 0.5);
  return { medianStopDistance: med, positionPctAtMedianStop: med ? Math.min(cfg.maxPositionPct, cfg.riskPerTrade / med) : null, maxExposureAtMedianStop: med ? Math.min(cfg.maxExposure, cfg.maxPositions * Math.min(cfg.maxPositionPct, cfg.riskPerTrade / med)) : null };
}

function summarizeRun(run, spyTR, label) {
  const eq = run.equity; const a = eq[0].date, b = eq[eq.length - 1].date;
  const cagr = cagrBetween(eq, a, b), spy = cagrBetween(spyTR, a, b, 'value');
  return { label, cagr, spy, excess: cagr != null && spy != null ? cagr - spy : null, maxDrawdown: maxDrawdown(eq), taken: run.taken.length, skipped: run.skipped.length };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT_DIR = arg('--out', path.join(os.tmpdir(), 'supertrader-validation'));
  const LIMIT = Number(arg('--limit', '0'));
  const t0 = Date.now();
  const log = (m) => console.log(`[validation-diagnose +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const D = await loadPitData({ LIMIT, log });
  const { segs, calendar, spyTR, bench } = D;
  const spyIdx = new Map(spyTR.map((p, i) => [p.date, i]));

  const R = Object.fromEntries(DIAG_ENGINES.map((e) => [e.id, { trades: [], invalid: new Map(), lostRules: new Map(), funnel: { evaluated: 0, stages: {}, failedRules: {} } }]));
  const funnelSample = new Set(segs.map((s) => s.id).sort((a, b) => L.sha256(a).localeCompare(L.sha256(b))).slice(0, Math.max(50, Math.floor(segs.length / 10))));
  let k = 0;
  for (const seg of segs) {
    const ctx = segCtx(seg, bench);
    for (const e of DIAG_ENGINES) {
      const B = R[e.id];
      const sink = (s) => {
        const t = s.transitions[s.transitions.length - 1];
        B.invalid.set(t.ruleId, (B.invalid.get(t.ruleId) || 0) + 1);
        for (const f of t.failed || []) B.lostRules.set(f, (B.lostRules.get(f) || 0) + 1);
      };
      B.trades.push(...tradesFor(e, seg, ctx, DEFAULT_EXECUTION, sink));
      if (funnelSample.has(seg.id)) {
        const g = rawGate(e); const from = ctx.bars.date.findIndex((x) => x >= W.from);
        for (let t = Math.max(from, 0); t < ctx.bars.date.length; t++) {
          const r = g.scan(ctx, t, { ...e.PARAMS, minPrice: 0 });
          if (r === undefined) continue;
          B.funnel.evaluated++;
          const st = r ? (r.stage || 'NO_STAGE') : 'NONE';
          B.funnel.stages[st] = (B.funnel.stages[st] || 0) + 1;
          if (r && r.rules) for (const [rid, ok] of Object.entries(r.rules)) if (!ok) B.funnel.failedRules[rid] = (B.funnel.failedRules[rid] || 0) + 1;
        }
      }
    }
    if (++k % 1000 === 0) log(`simuliert ${k}/${segs.length}`);
  }

  const cfg = PORTFOLIO_DEFAULTS;
  const results = {};
  for (const e of DIAG_ENGINES) {
    const B = R[e.id], all = B.trades;
    const cal = [...new Set([...calendar, ...all.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((d) => d >= W.from && d <= W.to)])].sort();
    const base = runPortfolioTR(all, cal, cfg, { scenario: 'S0_LAST_PRICE' });
    const byId = new Map(all.map((t) => [t.id, t]));
    const skippedTrades = base.skipped.filter((s) => s.reason === 'MAX_POSITIONS').map((s) => byId.get(s.id)).filter(Boolean);
    const takenTrades = base.taken.map((p) => p.tr);
    const years = {};
    for (const t of all) { const y = t.entry.date.slice(0, 4); years[y] = (years[y] || 0) + 1; }
    const eqW = runPortfolioTR(all, cal, { ...cfg, riskPerTrade: 1, maxPositionPct: 0.10 }, { scenario: 'S0_LAST_PRICE' });
    const risk1 = runPortfolioTR(all, cal, { ...cfg, riskPerTrade: 0.01 }, { scenario: 'S0_LAST_PRICE' });
    const seeds = [];
    for (let s = 1; s <= 5; s++) seeds.push(summarizeRun(runPortfolioTR(all, cal, cfg, { scenario: 'S0_LAST_PRICE', seed: s }), spyTR, 'SEED_' + s));
    results[e.id] = {
      variant: e.variant, version: e.version,
      signalQuality: { allEngineTrades: signalQuality(all, spyIdx, spyTR), takenS0: signalQuality(takenTrades, spyIdx, spyTR), skippedMaxPositions: signalQuality(skippedTrades, spyIdx, spyTR) },
      engineTradesPerYear: years,
      capital: { ...exposureScenarios(base.equity, spyIdx, spyTR), ...theoreticalMaxExposure(all, cfg) },
      portfolio: { preregisteredDefault: summarizeRun(base, spyTR, 'S0_DEFAULT'), seedsS0: seeds },
      diagnosticOnly: {
        note: 'Vergleichsszenarien zur Ursachenanalyse. Keine Strategieversion, keine Kundenkennzahl, nicht vorab registriert.',
        equalWeight10pct: { ...summarizeRun(eqW, spyTR, 'DIAG_EQUAL_WEIGHT_10'), ...exposureScenarios(eqW.equity, spyIdx, spyTR) },
        risk1pct: { ...summarizeRun(risk1, spyTR, 'DIAG_RISK_1PCT'), ...exposureScenarios(risk1.equity, spyIdx, spyTR) },
      },
      funnel: { sampleSegments: funnelSample.size, ...B.funnel },
      invalidations: Object.fromEntries([...B.invalid.entries()].sort((a, b) => b[1] - a[1])),
      setupLostFailedRules: Object.fromEntries([...B.lostRules.entries()].sort((a, b) => b[1] - a[1])),
    };
    R[e.id] = null;
    log(`${e.id}: Diagnose fertig`);
  }
  const result = { schema: DIAG_SCHEMA, at: new Date().toISOString(), tableHash: D.hash, commit: process.env.GITHUB_SHA || null, limit: LIMIT || null,
    counts: { listings: D.listings.length, members: D.members.length, segments: segs.length, duplicates: D.dup.size }, execution: DEFAULT_EXECUTION, portfolio: cfg,
    spy: { cagr: cagrBetween(spyTR, W.from, W.to, 'value') }, results };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const sealed = L.encryptForOwner(pem, Buffer.from(JSON.stringify(result)));
  fs.writeFileSync(path.join(OUT_DIR, LIMIT ? 'diagnose-methods-smoke.sealed.json' : 'diagnose-methods.sealed.json'), sealed);
  log(`Verschlüsseltes Ergebnis geschrieben (${sealed.length} Byte)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
