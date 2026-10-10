#!/usr/bin/env node
// Supertrader — interner Datentest, Teil 2: Momentum Breakout, Weinstein,
// Darvas und Minervini auf demselben Point-in-Time-Universum wie der
// Donchian-Lauf (PREREGISTRATION-METHODS.json, vor dem Lauf eingefroren).
//
//   node scripts/supertrader/validation/analyze-methods.mjs [--limit 400]
//
// Ablauf:
//   1. Listentabelle, Manifest und Reihen laden (privater Eimer), Reihenbruch A2.
//   2. Querschnitt: Momentum-/RS-Perzentile je Handelstag ueber alle damals
//      gelisteten Titel (Point-in-Time, inklusive spaeter delisteter Titel).
//   3. Je Reihe: Wochenreihe (Weinstein), Engine-Simulation je Methode
//      (unveraenderte Regeln, Rohkursgrenze), Trades mit Delisting-Abschluss.
//   4. Portfolio S0/S1/S2, doppelte Kosten, Zufallsreihenfolgen, nur heute
//      gelistete Titel; Kontrollen C1/C2/C3m/C5; Diagnose aller Engine-Trades.
// Ausgabe nur verschluesselt; Logs nur Fortschrittszahlen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { runPortfolioTR, runPortfolioTR as runPortfolioTRBase, reconcile, cagrBetween, maxDrawdown, marketOkMap } from './portfolio.mjs';
import { computeIndicators, isoWeekKey } from '../engine/indicators.mjs';
import { simulate } from '../engine/simulator.mjs';
import { runPortfolio, computeMetrics, PORTFOLIO_DEFAULTS } from '../engine/backtest.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import kk from '../engine/strategies/kk-breakout.mjs';
import weinstein from '../engine/strategies/weinstein.mjs';
import darvas from '../engine/strategies/darvas.mjs';
import minervini, { trendTemplate as minTT } from '../engine/strategies/minervini.mjs';
import { buildWeekly } from '../engine/weekly.mjs';
import kk2 from '../engine/strategies/kk-breakout-v2.mjs';
import weinstein2 from '../engine/strategies/weinstein-v2.mjs';
import darvas2 from '../engine/strategies/darvas-v2.mjs';
import minervini2 from '../engine/strategies/minervini-v2.mjs';
import kk3 from '../engine/strategies/kk-breakout-v3.mjs';
import kkAblation from '../engine/strategies/kk-breakout-ablation-r8.mjs';
import don1 from '../engine/strategies/donchian.mjs';
import don2 from '../engine/strategies/donchian-v2.mjs';
import darvas3 from '../engine/strategies/darvas-v3.mjs';
import kk31 from '../engine/strategies/kk-breakout-v31.mjs';
import { createOracle, fetchMinutes, compactBars } from './intraday-oracle.mjs';
import weinstein3 from '../engine/strategies/weinstein-v3.mjs';
import darvas301 from '../engine/strategies/darvas-v301.mjs';
import kk32 from '../engine/strategies/kk-breakout-v32.mjs';
import weinstein4 from '../engine/strategies/weinstein-v4.mjs';
import minervini3 from '../engine/strategies/minervini-v3.mjs';
import don21 from '../engine/strategies/donchian-v21.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const Store = require(path.join(root, 'quant/engines/history-store.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const Master = require(path.join(root, 'quant/engines/us-security-master.js'));

export const PREREG_METHODS = 'supertrader-validation-prereg-methods-1.0.0';
export const ENGINES = [kk, weinstein, darvas, minervini];
// Runde 7: vorab registrierte neue Versionen (PREREGISTRATION-R7.json) plus die
// getesteten Vorgaenger als Reproduzierbarkeitsreferenz auf demselben Lauf.
export const PREREG_R7 = 'supertrader-validation-prereg-r7-1.0.0';
export const ENGINES_R7 = [kk2, weinstein2, darvas2, minervini2];
export const REFERENCE_R7 = [kk, weinstein, darvas, minervini];
// Runde 8 (PREREGISTRATION-R8.json): Momentum 3.0.0 neutral, vorsichtige
// Tagesbalken-Gegenprobe, Ablation des Einstiegszeitpunkts, 2.0.0 als Referenz.
export const PREREG_R8 = 'supertrader-validation-prereg-r8-1.0.0';
export const KK3_PESSIMISTIC = { ...kk3, version: '3.0.0-P', simOpts: { sameDayPolicy: 'PESSIMISTIC' } };
export const TURTLE_PESSIMISTIC = { ...don2, version: '2.0.0-P', simOpts: { sameDayPolicy: 'PESSIMISTIC' } };
// Eingefrorener r8-Lauf (Commit 53a564c) lief ohne sicheren Gleichtags-Ausstieg; zur Reproduktion abgeschaltet.
const FROZEN_R8 = { sameDayCertain: false };
export const ENGINES_R8 = [{ ...kk3, simOpts: FROZEN_R8 }, KK3_PESSIMISTIC, kkAblation, kk2, { ...don2, simOpts: FROZEN_R8 }, TURTLE_PESSIMISTIC, don1];
const ROLE_R8 = { 'MOMENTUM_BREAKOUT@3.0.0': 'R8_HYPOTHESIS', 'MOMENTUM_BREAKOUT@3.0.0-P': 'SENSITIVITY_PESSIMISTIC', 'MOMENTUM_BREAKOUT@3.0.0-A': 'ABLATION_ENTRY_TIMING', 'MOMENTUM_BREAKOUT@2.0.0': 'REFERENCE_REPRODUCTION',
  'DONCHIAN_TURTLE@2.0.0': 'R8_TURTLE_HYPOTHESIS', 'DONCHIAN_TURTLE@2.0.0-P': 'SENSITIVITY_PESSIMISTIC', 'DONCHIAN_TURTLE@1.1.0': 'REFERENCE_SAME_HARNESS' };
export const PREREG_R8B = 'supertrader-validation-prereg-r8b-1.0.0';
export const ENGINES_R8B = [{ ...kk3, version: '3.0.0-C' }, { ...don2, version: '2.0.0-C' }, darvas3, { ...darvas3, version: '3.0.0-P', simOpts: { sameDayPolicy: 'PESSIMISTIC' } }, darvas2, weinstein3, { ...weinstein3, version: '3.0.0-P', simOpts: { sameDayPolicy: 'PESSIMISTIC' } }, weinstein2];
const ROLE_R8B = { 'MOMENTUM_BREAKOUT@3.0.0-C': 'R8_CORRECTED_SAME_DAY_CERTAIN', 'DONCHIAN_TURTLE@2.0.0-C': 'R8_CORRECTED_SAME_DAY_CERTAIN', 'DARVAS_BOX@3.0.0': 'R8B_HYPOTHESIS', 'DARVAS_BOX@3.0.0-P': 'SENSITIVITY_PESSIMISTIC', 'DARVAS_BOX@2.0.0': 'REFERENCE_REPRODUCTION', 'WEINSTEIN_STAGE@3.0.0': 'R8B_HYPOTHESIS', 'WEINSTEIN_STAGE@3.0.0-P': 'SENSITIVITY_PESSIMISTIC', 'WEINSTEIN_STAGE@2.0.0': 'REFERENCE_REPRODUCTION' };
export const PREREG_R8C = 'supertrader-validation-prereg-r8c-1.0.0';
export const ENGINES_R8C = [kk31, { ...kk31, version: '3.1.0-P', simOpts: { sameDayPolicy: 'PESSIMISTIC' } }, { ...kk3, version: '3.0.0-C' }];
const ROLE_R8C = { 'MOMENTUM_BREAKOUT@3.1.0': 'R8C_HYPOTHESIS', 'MOMENTUM_BREAKOUT@3.1.0-P': 'SENSITIVITY_PESSIMISTIC', 'MOMENTUM_BREAKOUT@3.0.0-C': 'REFERENCE_R8B' };
// Runde 9 (PREREGISTRATION-R9B-RESOLVED.json): Einstiegstag aus IEX-Minuten, wo vorhanden;
// sonst Tagesbalken-Annahme als Schranke (neutral bzw. vorsichtig).
export const PREREG_R9B = 'supertrader-validation-prereg-r9b-resolved-1.0.0';
export function enginesR9B(oracle) {
  const P = { sameDayPolicy: 'PESSIMISTIC' };
  return [
    { ...kk31, version: '3.1.0-I', simOpts: { intradayOracle: oracle } }, { ...kk31, version: '3.1.0-IP', simOpts: { intradayOracle: oracle, ...P } }, kk31,
    { ...darvas3, version: '3.0.0-I', simOpts: { intradayOracle: oracle } }, { ...darvas3, version: '3.0.0-IP', simOpts: { intradayOracle: oracle, ...P } }, darvas3,
  ];
}
// Runde 10 (PREREGISTRATION-R10-VENUES.json D4): aeusserste Schranke fuer nicht aufgeloeste
// Momentum-Kauftage - jeder endet mit Ausstieg zum Tagesbalken-Stop. Neutral (-I) als Referenz.
export const PREREG_R10B = 'supertrader-validation-prereg-r10-venues-1.0.0#D4';
export function enginesR10B(oracle) {
  return [{ ...kk31, version: '3.1.0-I', simOpts: { intradayOracle: oracle } }, { ...kk31, version: '3.1.0-IX', simOpts: { intradayOracle: oracle, sameDayPolicy: 'ALWAYS_UNRESOLVED' } }];
}
// Runde 10 (PREREGISTRATION-R10-FIXES): Vollportfolio der Live-Versionen mit bereinigtem Universum (U1),
// Rang nach relativer Staerke (K3, nicht fuer Turtle) und Darvas-Kapazitaet 1/6 (K1). Varianten teilen die
// Trades ihrer Basis (tradesOf) - nur die Portfoliologik unterscheidet sich.
export const PREREG_R10C = 'supertrader-validation-prereg-r10-fixes-1.0.0';
export function enginesR10C() {
  const live = [kk31, weinstein3, darvas3, minervini2, don2];
  const out = [];
  for (const e of live) {
    out.push(e);
    if (e.id !== 'DONCHIAN_TURTLE') out.push({ ...e, version: e.version + '-RS', tradesOf: `${e.id}@${e.version}`, portfolio: { ...portfolioOf(e), priority: 'RS' } });
    if (e.id === 'DARVAS_BOX') {
      const k1 = { ...portfolioOf(e), maxPositionPct: 1 / 6 };
      out.push({ ...e, version: '3.0.1', tradesOf: `${e.id}@${e.version}`, portfolio: k1 }, { ...e, version: '3.0.1-RS', tradesOf: `${e.id}@${e.version}`, portfolio: { ...k1, priority: 'RS' } });
    }
  }
  return out;
}
// Runde 10: Minervini-Diagnose - Einfluss einzelner Bausteine auf Kandidaten und Trades
// (Ablation, keine neue Version; PREREGISTRATION-R10-FIXES minerviniDiagnosis).
export function enginesR10M() {
  const P = minervini2.PARAMS;
  const v = (suffix, params) => ({ ...minervini2, version: '2.0.0-' + suffix, PARAMS: Object.freeze({ ...P, ...params }) });
  return [minervini2, v('NOVOL', { breakoutVolume: 0 }), v('NORS', { rsPercentile: 0 }), v('NODRY', { volumeDryUp: 99 }), v('LOW25', { lowDistance: 1.25 })];
}
// Runde 11 (PREREGISTRATION-R11): aktuelle Live-Versionen als Referenz (mit R10-Rang) und die neuen
// Versionen samt Sensitivitaeten (3.0.0-NA: fehlende Gewinndaten blockieren nicht; 2.1.0-CAP: 1/12 je Titel).
export const PREREG_R11 = 'supertrader-validation-prereg-r11-1.0.0';
export function enginesR11() {
  const rs = (e) => ({ ...e, portfolio: { ...portfolioOf(e), priority: 'RS' } });
  const minNA = { ...rs(minervini3), version: '3.0.0-NA', PARAMS: Object.freeze({ ...minervini3.PARAMS, allowMissingEps: true }) };
  const donCap = { ...don21, version: '2.1.0-CAP', tradesOf: `${don21.id}@${don21.version}`, portfolio: { ...portfolioOf(don21), maxPositionPct: 1 / 12 } };
  return [rs(kk31), rs(kk32), rs(weinstein3), rs(weinstein4), darvas301, rs(minervini2), rs(minervini3), minNA, don2, don21, donCap];
}
// Runde 12 (PREREGISTRATION-R12 PORT-MARKET-200): aktuelle Live-Versionen und dieselben mit Marktampel
// (keine neue Position bei SPY unter GD 200 am Vortag). Varianten teilen die Trades ihrer Basis.
export const PREREG_R12 = 'supertrader-validation-prereg-r12-1.0.0';
export function enginesR12() {
  const rs = (e) => ({ ...e, portfolio: { ...portfolioOf(e), priority: portfolioOf(e).priority || (e.id === 'DONCHIAN_TURTLE' ? 'ALPHA' : 'RS') } });
  const live = [rs(kk32), rs(weinstein3), darvas301, rs(minervini2), don2];
  const out = [];
  for (const e of live) out.push(e, { ...e, version: e.version + '-M', tradesOf: `${e.id}@${e.version}`, portfolio: { ...portfolioOf(e), marketFilter: true } });
  return out;
}
export { marketOkMap } from './portfolio.mjs';
// Runde 13 (PREREGISTRATION-R13-AUDIT amendmentBeforeResults): R11/R12-Entscheidungen mit S1C erneut anwenden.
export const PREREG_R13B = 'supertrader-validation-prereg-r13-audit-1.0.0#reapplication';
export function enginesR13B() {
  const rs = (e) => ({ ...e, portfolio: { ...portfolioOf(e), priority: 'RS' } });
  const out = [rs(weinstein3), rs(weinstein4)];
  for (const e of [rs(kk32), rs(weinstein3), darvas301, rs(minervini2), don2]) out.push({ ...e, version: e.version + '-M', tradesOf: `${e.id}@${e.version}`, portfolio: { ...portfolioOf(e), marketFilter: true } });
  out.push(rs(kk32), darvas301, rs(minervini2), don2);
  return out;
}
const ROLE_R11 = { 'MOMENTUM_BREAKOUT@3.1.0': 'REFERENCE_LIVE', 'WEINSTEIN_STAGE@3.0.0': 'REFERENCE_LIVE', 'DARVAS_BOX@3.0.1': 'REFERENCE_LIVE', 'MINERVINI_VCP@2.0.0': 'REFERENCE_LIVE', 'DONCHIAN_TURTLE@2.0.0': 'REFERENCE_LIVE',
  'MOMENTUM_BREAKOUT@3.2.0': 'R11_CORRECTION', 'WEINSTEIN_STAGE@4.0.0': 'R11_NEW_RULE', 'MINERVINI_VCP@3.0.0': 'R11_NEW_RULE', 'MINERVINI_VCP@3.0.0-NA': 'SENSITIVITY_MISSING_EPS', 'DONCHIAN_TURTLE@2.1.0': 'R11_NEW_RULE', 'DONCHIAN_TURTLE@2.1.0-CAP': 'SENSITIVITY_CAP_1_12' };
const ROLE_R10C = (v) => (v.endsWith('-RS') ? 'R10_PRIORITY_RS' : v === '3.0.1' ? 'R10_DARVAS_CAPACITY' : 'R10_BASE_CLEAN_UNIVERSE');
const ROLE_R9B = { '3.1.0-IX': 'R10B_UNRESOLVED_ALWAYS_EXIT',  '3.1.0-I': 'R9B_RESOLVED_FALLBACK_NEUTRAL', '3.1.0-IP': 'R9B_RESOLVED_FALLBACK_PESSIMISTIC', '3.1.0': 'REFERENCE_R8C', '3.0.0-I': 'R9B_RESOLVED_FALLBACK_NEUTRAL', '3.0.0-IP': 'R9B_RESOLVED_FALLBACK_PESSIMISTIC', '3.0.0': 'REFERENCE_R8B' };
export const portfolioOf = (e) => (e.portfolio ? { ...PORTFOLIO_DEFAULTS, ...e.portfolio } : PORTFOLIO_DEFAULTS);
const W = L.WINDOW;
const EXEC2 = { ...DEFAULT_EXECUTION, slippageBps: 20, commissionBps: 2 };
const SPLIT_PERIODS = [['2016-01-04', '2020-12-31'], ['2021-01-01', W.to]];
const PHASES = [['Q4_2018', '2018-09-20', '2018-12-24'], ['COVID_2020', '2020-02-19', '2020-03-23'], ['BEAR_2022', '2022-01-03', '2022-10-12'], ['BULL_2023_2024', '2023-01-03', '2024-12-31']];
const CROSS_KEYS = ['mom21', 'mom63', 'mom126', 'rs'];

// Rohkursgrenze (wie PREREGISTRATION strategy.harnessAdapter), fuer Wochen-
// strategien korrekt: an Tagen ohne Wochenentscheidung (undefined) wird nicht
// eingegriffen, sonst gaelte ein wartendes Setup als verloren.
export function rawGate(base) {
  return {
    ...base,
    scan(ctx, t, p, o) {
      const r = base.scan(ctx, t, { ...(p || base.PARAMS), minPrice: 0 }, o);
      if (r === undefined) return r;
      const rc = ctx.raw.close[t];
      if (!(Number.isFinite(rc) && rc >= base.PARAMS.minPrice)) return null;
      return r;
    },
  };
}

// Percentile mit Mittelrang bei Gleichstand - identisch zu indicators.percentileRanks.
export function percentilesInPlace(values, ids, out) {
  const n = values.length;
  if (n < 2) { for (let k = 0; k < n; k++) out(ids[k], null); return; }
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => values[a] - values[b]);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const rank = ((i + j) / 2) / (n - 1) * 100;
    for (let k = i; k <= j; k++) out(ids[order[k]], rank);
    i = j + 1;
  }
}

export function segCtx(seg, bench) {
  const a = L.adjustSeries(seg.raw);
  const bars = { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume };
  const ctx = { symbol: seg.id, bars, ind: computeIndicators(bars), raw: { close: a.rawClose, volume: a.rawVolume }, divAdj: a.divAdj, tr: a.tr, regime: null, cross: seg.cross || {}, fund: seg.fund || null };
  if (bench) Object.assign(ctx, buildWeekly({ bars }, null, bench));
  return ctx;
}

// Trades einer Reihe fuer eine Methode (Engine unveraendert) + Abschluss offener Positionen.
export function tradesFor(engine, seg, ctx, exec, sink = null, simOpts = {}) {
  const d = ctx.bars.date;
  const from = d.findIndex((x) => x >= W.from);
  if (from < 0) return [];
  const res = simulate(rawGate(engine), ctx, { from, exec, params: { ...engine.PARAMS, minPrice: 0 }, ...(engine.simOpts || {}), ...simOpts });
  const out = [];
  const mk = (s, terminal) => {
    const ei = s.entry.index, lastIdx = terminal ? d.length - 1 : s.exits[s.exits.length - 1].index;
    const marks = new Map(), divs = new Map();
    for (let i = ei; i <= lastIdx; i++) { marks.set(d[i], ctx.bars.close[i]); if (ctx.divAdj[i] > 0) divs.set(d[i], ctx.divAdj[i]); }
    const ci = s.confirmation?.index;
    return {
      id: s.id, listingId: seg.id, entry: { date: s.entry.date, price: s.entry.price, rawOpen: s.entry.rawOpen }, initialStop: s.initialStop,
      exits: s.exits.map((x) => ({ date: x.date, price: x.price, fraction: x.fraction, ruleId: x.ruleId, basis: x.priceBasis })),
      confirmDate: s.confirmation?.date || null,
      // Kauf-Stop: die Rohkursgrenze gilt am Scan-Tag (Vortag des Einstiegs), nicht am Einstiegstag.
      rawCloseAtConfirm: ci != null ? ctx.raw.close[s.confirmation?.basis === 'INTRADAY_BUY_STOP' ? ci - 1 : ci] : null, qualityFailed: s.quality?.failed || null,
      trigger: s.levels?.trigger ?? null, confirmClose: s.confirmation?.close ?? null, rawOpenEntry: s.entry.rawOpen ?? null, evidence: s.entry.evidence || null, sameDayOrder: s.entry.sameDayOrder || null,
      terminal, marks, divs, heldSessions: lastIdx - ei, survivor: seg.survivor,
      rsAtEntry: seg.cross?.rs?.[ei - 1] ?? null, // Runde 10: Rang im Portfolio (Stand Vortag)
      rankScore: engine.rankScore ? engine.rankScore(ctx, ei) : null, // Runde 11: methodeneigener Rang (Turtle: Staerke/N)
    };
  };
  if (sink) for (const s of res.finished) if (!s.entry) sink(s);
  for (const s of res.finished) if (s.entry && s.exits.length && s.entry.date <= W.to) out.push(mk(s, null));
  const s = res.state.signal;
  if (s && s.entry && (s.remaining ?? 1) > 1e-9) {
    const last = d.length - 1;
    const t = { date: d[last], lastClose: ctx.bars.close[last], distress: L.distressSignature(ctx.raw.close), kind: seg.delisted ? 'DELISTED' : 'OPEN_AT_END', delistClass: seg.delistClass || null };
    const tr = mk(s, t);
    tr.remainingAtTerminal = s.remaining ?? 1;
    if (!seg.delisted) tr.exits.push({ date: d[last], price: ctx.bars.close[last], fraction: s.remaining ?? 1, ruleId: 'OPEN_AT_END_MARK', basis: 'CLOSE' });
    out.push(tr);
  }
  return out;
}

// C3m: Plausibilitaet eines Trades gegen die (bereinigten) Rohbalken.
export function verifyGeneric(t, ctx, engine, exec = DEFAULT_EXECUTION) {
  const d = ctx.bars.date, slip = exec.slippageBps / 10000, eps = 1e-6;
  const i = d.indexOf(t.entry.date), c = t.confirmDate ? d.indexOf(t.confirmDate) : -1;
  const intraday = engine.entryMode === 'BUY_STOP_INTRADAY';
  const checks = intraday ? {
    // Kauf-Stop: Einstieg am Ausloesetag zu max(Eroeffnung, Trigger) + Slippage, innerhalb der Tagesspanne.
    entryAfterConfirm: c >= 0 && i === c,
    entryPrice: i >= 0 && Number.isFinite(t.trigger) && Math.abs(Math.max(ctx.bars.open[i], t.trigger) * (1 + slip) / t.entry.price - 1) < eps && ctx.bars.high[i] >= t.trigger * (1 - eps),
  } : {
    entryAfterConfirm: c >= 0 && i === c + 1,
    entryPrice: i >= 0 && Math.abs(ctx.bars.open[i] * (1 + slip) / t.entry.price - 1) < eps,
    rawGate: c >= 0 && ctx.raw.close[c] >= engine.PARAMS.minPrice,
    stopBelowEntry: t.initialStop < t.entry.price,
  };
  if (intraday) checks.stopWithinDay = t.initialStop >= ctx.bars.low[i] * (1 - eps) || t.initialStop < t.entry.price;
  checks.exits = t.exits.filter((x) => x.ruleId !== 'OPEN_AT_END_MARK').every((x) => {
    const k = d.indexOf(x.date);
    if (k < 0) return false;
    if (x.basis === 'NEXT_OPEN' || x.basis === 'OPEN_BELOW_STOP') return Math.abs(ctx.bars.open[k] * (1 - slip) / x.price - 1) < eps;
    if (x.basis === 'SAME_DAY_PESSIMISTIC' || x.basis === 'SAME_DAY_CERTAIN' || x.basis === 'SAME_DAY_INTRADAY') return x.price <= ctx.bars.high[k] * (1 + eps) && x.price >= ctx.bars.low[k] * (1 - slip) * (1 - eps);
    return x.price <= ctx.bars.high[k] * (1 - slip) * (1 + eps) && x.price >= ctx.bars.low[k] * (1 - slip) * (1 - eps);
  });
  return { id: t.id, ok: Object.values(checks).every(Boolean), checks };
}

const slip0 = DEFAULT_EXECUTION.slippageBps / 10000, comm0 = DEFAULT_EXECUTION.commissionBps / 10000;
export function tradeRet(t) {
  let proceeds = 0, frac = 0;
  for (const x of t.exits) { proceeds += x.fraction * x.price; frac += x.fraction; }
  if (t.terminal?.kind === 'DELISTED') { const r = t.remainingAtTerminal ?? 1 - frac; proceeds += r * t.terminal.lastClose * (1 - slip0); frac += r; }
  return frac > 0 ? (proceeds / frac) * (1 - comm0) / (t.entry.price * (1 + comm0)) - 1 : null;
}
function diag(list) {
  const r = list.map(tradeRet).filter(Number.isFinite).sort((a, b) => a - b);
  const byYear = {}, byExit = {};
  for (const t of list) {
    const v = tradeRet(t); if (!Number.isFinite(v)) continue;
    const y = t.entry.date.slice(0, 4); const b = byYear[y] ||= { n: 0, sum: 0, wins: 0 }; b.n++; b.sum += v; if (v > 0) b.wins++;
    const k = t.terminal ? t.terminal.kind : t.exits[t.exits.length - 1].ruleId; const e = byExit[k] ||= { n: 0, sum: 0 }; e.n++; e.sum += v;
  }
  return { n: r.length, mean: r.reduce((a, b) => a + b, 0) / (r.length || 1), median: r[Math.floor(r.length / 2)] ?? null, hitRate: r.filter((x) => x > 0).length / (r.length || 1), p05: r[Math.floor(r.length * 0.05)] ?? null, p95: r[Math.floor(r.length * 0.95)] ?? null,
    byYear: Object.fromEntries(Object.entries(byYear).map(([y, b]) => [y, { n: b.n, mean: b.sum / b.n, hit: b.wins / b.n }])),
    byExit: Object.fromEntries(Object.entries(byExit).map(([k, b]) => [k, { n: b.n, mean: b.sum / b.n }])) };
}

// Entscheidung nach PREREGISTRATION-METHODS.acceptance (rein, testbar).
export function judge(runs) {
  const ex = (k) => runs[k]?.excessCagr;
  const sub = (k, i) => runs[k]?.subperiods?.[i]?.excess;
  const seedsPos = (runs.SEEDS_S1 || []).filter((s) => s.excessCagr > 0).length;
  const R = {
    R1: ['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO'].every((k) => ex(k) > 0),
    R2: sub('S1_MINUS_30', 0) > 0 && sub('S1_MINUS_30', 1) > 0,
    R3: seedsPos >= 16,
    R4: ex('COST2_S1') > 0,
  };
  const robustNegative = ex('S0_LAST_PRICE') < 0 && sub('S0_LAST_PRICE', 0) < 0 && sub('S0_LAST_PRICE', 1) < 0;
  const allPos = Object.values(R).every(Boolean);
  return { ...R, seedsPositive: seedsPos, robustNegative, verdict: allPos ? 'ROBUST_POSITIVE' : robustNegative ? 'ROBUST_NEGATIVE' : 'NOT_ROBUST', evidence: allPos ? 'CRITERIA_MET' : 'TESTED_NO_EDGE' };
}

function rawFromStoreBars(bars) {
  return bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0, adjClose: b.adjustedClose ?? b.adjClose ?? null, dividend: b.dividend ?? 0, splitFactor: b.splitFactor ?? 1 }))
    .filter((b) => b.close != null && b.date >= W.warmupFrom && b.date <= W.to).sort((a, b) => a.date.localeCompare(b.date));
}

// Laedt Listentabelle, Reihen (privater Eimer), Segmente (A2) und den
// Point-in-Time-Querschnitt. Gemeinsam fuer analyze-methods und diagnose-methods.
export async function loadPitData({ LIMIT = 0, log = () => {}, excludeNonEquity = false, secPit = false, delistPit = false, secPitKey = '_validation/sec-pit-r11.json.gz', cross = true } = {}) {
  const KEY = process.env.TIINGO_API_KEY || '';
  const zip = Buffer.from(await (await fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer());
  const rows = L.parseTickerCsv(L.unzipCsv(zip));
  const uni = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/scale/universe-FULL_UNIVERSE.json'), 'utf8'));
  const elig = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/eligibility.json'), 'utf8'));
  const cls = new Map(elig.decisions.map((d) => [d.ticker, d.instrument_type]));
  const storeActive = new Map(uni.securities.filter((s) => s.active !== false).map((s) => [s.ticker, { startDate: s.startDate, instrumentType: cls.get(s.ticker) || null }]));
  const listings = L.buildListingTable(rows, storeActive);
  const listedRoots = Master.collectListedRoots(rows);
  const hash = L.tableHash(listings);
  log(`Listings ${listings.length}, Hash ${hash.slice(0, 12)}`);

  const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env);
  const budget = Guard.createBudget({ classAOperations: 50, classBOperations: 30000 });
  const mine = Store.createHistoryStore({ driver, provider: L.SERIES_PROVIDER, market: 'US', budget }); // Runde 14: HOLDOUT eigener Namensraum
  const mainStore = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
  {
    const u = await mine.readUsage(), v = await mainStore.readUsage();
    const est = Guard.estimateOperations({ kind: 'VALIDATION_ANALYZE', objectReads: 16000, indexWrites: 2 });
    const verdict = Guard.evaluate({ usage: Guard.applyUsage(v, { classAOperations: u.classAOperations, classBOperations: u.classBOperations }), estimate: est, operation: 'VALIDATION_ANALYZE' });
    log(`Zero-Cost-Guard: ${verdict.verdict}`);
    if (verdict.verdict !== Guard.ALLOWED) { console.error('Zero-Cost-Guard blockiert. ' + verdict.reason); process.exit(4); }
  }
  budget.consumeClassB(1, 'GET manifest');
  const mbuf = await driver.get(mine.seriesPrefix + '_validation/manifest.json.gz');
  const manifest = mbuf ? JSON.parse(zlib.gunzipSync(mbuf).toString('utf8')).entries : {};

  const spySeries = await mine.getSeries('SPY@1993-01-29');
  const spyRaw = rawFromStoreBars(spySeries.bars);
  const spyAdj = L.adjustSeries(spyRaw);
  const calendar = spyRaw.map((b) => b.date).filter((d) => d >= W.from && d <= W.to);
  const master = spyRaw.map((b) => b.date);
  const masterIdx = new Map(master.map((d, i) => [d, i]));
  const spyTR = []; { let v = 1; for (let i = 0; i < spyAdj.date.length; i++) { const d = spyAdj.date[i]; if (d < W.from) continue; if (d > W.from && spyAdj.tr[i] != null) v *= 1 + spyAdj.tr[i]; spyTR.push({ date: d, value: v }); } }
  const bench = { byWeek: new Map() };
  for (let i = 0; i < spyAdj.date.length; i++) bench.byWeek.set(isoWeekKey(spyAdj.date[i]), spyAdj.close[i]);

  const members = [];
  let nonEquityExcluded = 0;
  const companyRows = excludeNonEquity && fs.existsSync(path.join(root, 'quant/data/market/security-master/company-names.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/company-names.json'), 'utf8')).rows || [] : [];
  const companyOf = new Map(companyRows.map((r) => [r.ticker, r]));
  for (const l of listings) {
    if (l.source === 'STORE_ACTIVE') {
      if (!L.INCLUDED_CLASSES.has(l.storeClass)) continue;
      const r = companyOf.get(l.ticker);
      if (excludeNonEquity && L.nonStockProduct({ ticker: l.ticker, exchange: l.exchange, name: r?.companyName })) { nonEquityExcluded++; continue; }
      members.push({ l, from: 'STORE', cls: l.storeClass }); continue;
    }
    const e = manifest[l.id];
    if (e && (e.status === 'OK' || e.status === 'PARTIAL')) {
      const c = l.source === 'UNFETCHABLE_REUSED' ? { included: e.included, cls: e.cls || null } : L.classifyListing(Master, l, e.name, listedRoots);
      const inc = c.included;
      // Runde 10 (PREREGISTRATION-R10-FIXES U1): Nicht-Aktien nach Name ausschliessen (ETN/ETF/Hebel, auch Plural).
      if (inc && excludeNonEquity && L.nonStockProduct({ ticker: l.ticker, exchange: l.exchange, name: e.name })) { nonEquityExcluded++; continue; }
      if (inc) members.push({ l, from: 'R2', cls: c.cls || null });
    }
  }
  const todo = LIMIT ? members.slice(0, LIMIT) : members;
  log(`Universumsmitglieder ${members.length}, bearbeitet ${todo.length}${excludeNonEquity ? `, Nicht-Aktien ausgeschlossen ${nonEquityExcluded}` : ''}`);

  // 1. Reihen laden, Doppelhistorien wie im Donchian-Lauf, Segmente (A2).
  const r2Raw = new Map(), lastKey = new Map();
  for (const m of todo.filter((x) => x.from === 'R2')) {
    const s = await mine.getSeries(`${m.l.ticker}@${m.l.startDate}`);
    const raw = s ? rawFromStoreBars(s.bars).filter((b) => b.date >= m.l.startDate && b.date <= (m.l.listEnd || W.to)) : [];
    r2Raw.set(m.l.id, raw);
    if (raw.length) { const b = raw[raw.length - 1]; lastKey.set(`${b.date}|${b.close}|${b.volume}`, m.l.id); }
  }
  const storeRaw = new Map(), dup = new Set();
  let k = 0;
  for (const m of todo.filter((x) => x.from === 'STORE')) {
    const s = await mainStore.getSeries(m.l.ticker);
    const raw = s ? rawFromStoreBars(s.bars) : [];
    for (const b of raw) { const x = lastKey.get(`${b.date}|${b.close}|${b.volume}`); if (x) dup.add(x); }
    storeRaw.set(m.l.id, raw);
    if (++k % 1000 === 0) log(`geladen ${k}`);
  }
  const segs = [];
  let offCalendar = 0;
  for (const m of todo) {
    if (m.from === 'R2' && dup.has(m.l.id)) continue;
    const raw = (m.from === 'R2' ? r2Raw.get(m.l.id) : storeRaw.get(m.l.id)) || [];
    const inWin = raw.filter((b) => b.date >= m.l.startDate && b.date <= (m.l.listEnd || W.to) && (masterIdx.has(b.date) || (offCalendar++, false)));
    L.splitSegments(inWin).forEach((seg, i, all) => {
      if (seg.length < 30) return;
      segs.push({ id: i ? `${m.l.id}#${i}` : m.l.id, raw: seg, delisted: !m.l.active || i < all.length - 1, survivor: m.from === 'STORE', cls: m.cls || null });
    });
  }
  r2Raw.clear(); storeRaw.clear();
  // Runde 11: SEC-Gewinnhistorie zum damaligen Stand (sec-pit.mjs) an die Segmente haengen.
  let secCoverage = null;
  if (secPit) {
    budget.consumeClassB(1, 'GET sec pit');
    const sbuf = await driver.get(mine.seriesPrefix + secPitKey);
    const pit = sbuf ? JSON.parse(zlib.gunzipSync(sbuf).toString('utf8')) : {};
    let withFund = 0;
    for (const seg of segs) { const f = pit[seg.id.split('#')[0]]; if (f) { seg.fund = { eps: f.eps, rev: f.rev, ...(f.shares ? { shares: f.shares, cik: f.cik, taxonomy: f.taxonomy || null } : {}) }; withFund++; } }
    secCoverage = { segments: segs.length, withFund, delisted: segs.filter((s) => s.delisted).length, delistedWithFund: segs.filter((s) => s.delisted && s.fund).length };
    log(`SEC-Gewinnhistorie: ${withFund}/${segs.length} Segmente, delistet ${secCoverage.delistedWithFund}/${secCoverage.delisted}`);
  }
  // Runde 13: Delisting-Klasse aus SEC-Einreichungen (Uebernahme/unbekannt) an delistete Segmente haengen.
  let delistCoverage = null;
  if (delistPit) {
    budget.consumeClassB(1, 'GET sec delist');
    const dbuf = await driver.get(mine.seriesPrefix + '_validation/sec-delist-r13.json.gz');
    const dl = dbuf ? JSON.parse(zlib.gunzipSync(dbuf).toString('utf8')) : {};
    delistCoverage = { delisted: 0, classified: 0, ACQUISITION: 0, UNKNOWN: 0 };
    for (const seg of segs) { if (!seg.delisted) continue; delistCoverage.delisted++; const c = dl[seg.id.split('#')[0]]; if (c) { seg.delistClass = c.cls; seg.delistEvidence = c.evidence; delistCoverage.classified++; delistCoverage[c.cls]++; } }
    log(`Delisting-Klassen: ${JSON.stringify(delistCoverage)}`);
  }
  log(`Segmente ${segs.length}, Doppelhistorien ${dup.size}, Balken ausserhalb des Kalenders ${offCalendar}`);

  // Runde 13 (Audit): Datenfingerabdruck je Lauf - Kursreihen im privaten Eimer werden taeglich aktualisiert;
  // gleiche Listentabelle heisst nicht gleiche Reihen. Abweichende Ergebnisse sind so als Datenaenderung erkennbar.
  const dataFingerprint = { segments: segs.length, hash: L.sha256(segs.map((sg) => { const r = sg.raw, n = r.length; return `${sg.id}|${n}|${r[0]?.date}|${r[n - 1]?.date}|${r[n - 1]?.close}|${r.reduce((a, b) => a + (b.close || 0), 0).toFixed(4)}`; }).join('\n')) };
  log(`Datenfingerabdruck ${dataFingerprint.hash.slice(0, 12)} (${segs.length} Segmente)`);
  // 2. Querschnitt Point-in-Time (wie build.mjs crossSection, aber ueber das damalige Universum).
  // Hausstrategie (cross: false) rechnet eigene Faktoren und braucht diesen Querschnitt nicht.
  if (!cross) return { listings, members, hash, segs, dup, offCalendar, calendar, spyTR, spyAdj, spyRaw, bench, budget, mine, mainStore, driver, nonEquityExcluded, secCoverage, delistCoverage, dataFingerprint };
  const metric = {};
  for (const key of CROSS_KEYS) metric[key] = [];
  segs.forEach((seg, si) => {
    const a = L.adjustSeries(seg.raw);
    const ind = computeIndicators({ date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume });
    const n = a.date.length;
    const vals = Object.fromEntries(CROSS_KEYS.map((x) => [x, new Float32Array(n).fill(NaN)]));
    for (let t = 0; t < n; t++) {
      if (!(ind.dollarVol20[t] >= 1e6)) continue;
      vals.mom21[t] = ind.ret21[t] ?? NaN; vals.mom63[t] = ind.ret63[t] ?? NaN; vals.mom126[t] = ind.ret126[t] ?? NaN;
      const parts = [ind.ret63[t], ind.ret126[t], ind.ret189[t], ind.ret252[t]];
      vals.rs[t] = parts.every(Number.isFinite) ? 0.4 * parts[0] + 0.2 * parts[1] + 0.2 * parts[2] + 0.2 * parts[3] : NaN;
    }
    seg.dIdx = Int32Array.from(a.date, (d) => masterIdx.get(d));
    seg.vals = vals;
    seg.cross = Object.fromEntries(CROSS_KEYS.map((x) => [x, new Array(n).fill(null)]));
    void si;
  });
  for (const key of CROSS_KEYS) {
    const count = new Int32Array(master.length);
    for (const seg of segs) { const v = seg.vals[key]; for (let t = 0; t < v.length; t++) if (Number.isFinite(v[t])) count[seg.dIdx[t]]++; }
    const offs = new Int32Array(master.length + 1);
    for (let d = 0; d < master.length; d++) offs[d + 1] = offs[d] + count[d];
    const vals = new Float64Array(offs[master.length]), sid = new Int32Array(offs[master.length]), tix = new Int32Array(offs[master.length]);
    const fill = offs.slice(0, master.length);
    segs.forEach((seg, si) => { const v = seg.vals[key]; for (let t = 0; t < v.length; t++) if (Number.isFinite(v[t])) { const d = seg.dIdx[t], p = fill[d]++; vals[p] = v[t]; sid[p] = si; tix[p] = t; } });
    for (let d = 0; d < master.length; d++) {
      const a = offs[d], b = offs[d + 1];
      percentilesInPlace(vals.subarray(a, b), Array.from({ length: b - a }, (_, q) => a + q), (p, rank) => { segs[sid[p]].cross[key][tix[p]] = rank; });
    }
    log(`Querschnitt ${key} fertig`);
  }
  for (const seg of segs) delete seg.vals;

  return { listings, members, hash, segs, dup, offCalendar, calendar, spyTR, spyAdj, spyRaw, bench, budget, mine, mainStore, driver, nonEquityExcluded, secCoverage, delistCoverage, dataFingerprint };
}

// Beispielspur R8: Kullamaegis eigene Beispiele gegen die Engine (TSLA-Breakout
// Juni 2020, NVDA-EP-Gaps). Nur Tagesdaten der genannten Fenster, keine Optimierung.
export const EXAMPLES_R8 = { TSLA: ['2020-03-15', '2020-07-15'], NVDA_EP: ['2016-11-11', '2017-02-10', '2017-05-10'] };
const tickerOf = (id) => String(id).split(':')[2];
export function exampleTrace(seg, ctx, engine = kk3) {
  const d = ctx.bars.date, out = {};
  const tk = tickerOf(seg.id);
  if (tk === 'TSLA' && d[0] <= EXAMPLES_R8.TSLA[0] && d[d.length - 1] >= EXAMPLES_R8.TSLA[1]) {
    const days = [];
    for (let t = 0; t < d.length; t++) {
      if (d[t] < EXAMPLES_R8.TSLA[0] || d[t] > EXAMPLES_R8.TSLA[1]) continue;
      const r = engine.scan(ctx, t, { ...engine.PARAMS, minPrice: 0 });
      days.push({ date: d[t], open: ctx.bars.open[t], high: ctx.bars.high[t], low: ctx.bars.low[t], close: ctx.bars.close[t], stage: r ? r.stage : null, rules: r ? r.rules : null,
        facts: r ? { momentumPercentile: r.facts.momentumPercentile, priorRun: r.facts.priorRun, baseLength: r.facts.baseLength ?? null, baseDepth: r.facts.baseDepth ?? null } : null, trigger: r?.levels?.trigger ?? null, adr20: ctx.ind.adr20[t] });
    }
    const signals = [];
    const trades = tradesFor(engine, seg, ctx, DEFAULT_EXECUTION, (s) => signals.push({ id: s.id, state: s.state, history: (s.transitions || []).map((h) => ({ date: h.date, state: h.state, ruleId: h.ruleId, price: h.price ?? null })) }))
      .filter((x) => x.entry.date >= EXAMPLES_R8.TSLA[0] && x.entry.date <= '2020-12-31')
      .map((x) => ({ id: x.id, entry: x.entry, initialStop: x.initialStop, trigger: x.trigger, exits: x.exits.map((e) => ({ date: e.date, price: e.price, fraction: e.fraction, ruleId: e.ruleId })) }));
    out.TSLA = { segment: seg.id, days, trades, unenteredSignals: signals.filter((s) => (s.history[0]?.date || '') >= '2020-01-01' && (s.history[0]?.date || '') <= '2020-12-31') };
  }
  if (tk === 'NVDA') {
    const ev = [];
    for (const date of EXAMPLES_R8.NVDA_EP) {
      const t = d.indexOf(date); if (t < 1) continue;
      const v50 = ctx.ind.vol50[t - 1];
      ev.push({ date, gap: ctx.bars.open[t] / ctx.bars.close[t - 1] - 1, closeVsPrev: ctx.bars.close[t] / ctx.bars.close[t - 1] - 1, closeVsOpen: ctx.bars.close[t] / ctx.bars.open[t] - 1,
        volumeRatio50: v50 > 0 ? ctx.bars.volume[t] / v50 : null, ret63Before: ctx.ind.ret63[t - 1] ?? null, ret126Before: ctx.ind.ret126[t - 1] ?? null, gapRule10: ctx.bars.open[t] / ctx.bars.close[t - 1] - 1 >= 0.10 });
    }
    if (ev.length) out.NVDA = { segment: seg.id, events: ev };
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT_DIR = arg('--out', path.join(os.tmpdir(), 'supertrader-validation'));
  const LIMIT = Number(arg('--limit', '0'));
  const SET = arg('--set', 'methods');
  const RUN = SET === 'r13b' ? enginesR13B() : SET === 'r12' ? enginesR12() : SET === 'r11' ? enginesR11() : SET === 'r10m' ? enginesR10M() : SET === 'r10c' ? enginesR10C() : SET === 'r9b' || SET === 'r10b' ? [] : SET === 'r8c' ? ENGINES_R8C : SET === 'r8b' ? ENGINES_R8B : SET === 'r8' ? ENGINES_R8 : SET === 'r7' ? [...ENGINES_R7, ...REFERENCE_R7] : ENGINES;
  const keyOf = (e) => (SET === 'r7' || SET.startsWith('r8') || SET === 'r9b' || SET === 'r10b' || SET === 'r10c' || SET === 'r10m' || SET === 'r11' || SET === 'r12' || SET === 'r13b' ? `${e.id}@${e.version}` : e.id);
  const examples = {};
  const t0 = Date.now();
  const log = (m) => console.log(`[validation-methods +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { listings, members, hash, segs, dup, offCalendar, calendar, spyTR, spyAdj, bench, budget, mine, nonEquityExcluded, secCoverage, dataFingerprint } = await loadPitData({ LIMIT, log, excludeNonEquity: SET === 'r10c' || SET === 'r10m' || SET === 'r11' || SET === 'r12' || SET === 'r13b', secPit: SET === 'r11', delistPit: SET === 'r13b' });
  let k = 0;
  // Runde 9: Minutenquelle aufbauen - Cache aus dem privaten Eimer, fehlende Einstiegstage
  // in Durchgaengen nachladen, bis keine neuen mehr entstehen (Pfadabhaengigkeit).
  let intradayStats = null;
  if (SET === 'r9b' || SET === 'r10b') {
    const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
    const driver = createS3DriverFromEnv(process.env);
    const cacheKey = mine.seriesPrefix + '_validation/intraday-r9.json.gz';
    budget.consumeClassB(1, 'GET intraday cache');
    const buf = await driver.get(cacheKey);
    const cache = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    for (const kk of Object.keys(cache)) if (Array.isArray(cache[kk])) cache[kk] = compactBars(cache[kk]);
    const saveCache = async () => { if (LIMIT) return; budget.consumeClassA(1, 'PUT intraday cache'); await driver.put(cacheKey, zlib.gzipSync(Buffer.from(JSON.stringify(cache))), { contentType: 'application/gzip' }); };
    const startSize = Object.keys(cache).length;
    const { oracle, misses } = createOracle(cache);
    RUN.splice(0, RUN.length, ...(SET === 'r10b' ? enginesR10B(oracle) : enginesR9B(oracle)));
    const KEY = process.env.TIINGO_API_KEY || '';
    const passes = [];
    for (let pass = 0; pass < 6; pass++) {
      misses.clear();
      for (const seg of segs) { const ctx = segCtx(seg, bench); for (const e of RUN) if (e.simOpts?.intradayOracle) tradesFor(e, seg, ctx, DEFAULT_EXECUTION); }
      passes.push(misses.size);
      log(`Durchgang ${pass}: fehlende Minutentage ${misses.size}`);
      if (!misses.size) break;
      const todo = [...misses]; let i = 0;
      const worker = async () => { while (i < todo.length) { const kk = todo[i++]; const [tk, d] = kk.split('|'); const r = await fetchMinutes(tk, d, KEY); cache[kk] = compactBars(Array.isArray(r.body) ? r.body : []); if (i % 1000 === 0) log(`abgerufen ${i}/${todo.length}`); await new Promise((res) => setTimeout(res, 100)); } };
      await Promise.all([worker(), worker(), worker(), worker()]);
      await saveCache(); log(`Cache gesichert (${Object.keys(cache).length} Tage)`);
    }
    intradayStats = { cacheStart: startSize, cacheEnd: Object.keys(cache).length, passes, emptyDays: Object.values(cache).filter((v) => !(v.m ? v.m.length : v.length)).length };
    log(`Minuten-Cache ${startSize} -> ${intradayStats.cacheEnd} Tage`);
  }
  // 3. Simulation je Methode.
  const R = Object.fromEntries(RUN.map((e) => [keyOf(e), { base: [], cost2: [], c3: [] }]));
  const funnel = {};
  const pickC3 = new Set(segs.map((s) => s.id).sort((a, b) => L.sha256(a).localeCompare(L.sha256(b))).slice(0, 400));
  k = 0;
  for (const seg of segs) {
    const ctx = segCtx(seg, bench);
    if ((SET === 'r8' || SET === 'r8c') && /:(TSLA|NVDA):/.test(seg.id)) Object.assign(examples, exampleTrace(seg, ctx, SET === 'r8c' ? kk31 : kk3));
    for (const e of RUN) {
      if (e.tradesOf) continue; // Runde 10: Portfoliovariante, Trades der Basis
      const base = tradesFor(e, seg, ctx, DEFAULT_EXECUTION);
      R[keyOf(e)].base.push(...base);
      R[keyOf(e)].cost2.push(...tradesFor(e, seg, ctx, EXEC2));
      if (pickC3.has(seg.id) && R[keyOf(e)].c3.length < 20) { const t = base.find((x) => !x.terminal); if (t) R[keyOf(e)].c3.push(verifyGeneric(t, ctx, e)); }
    }
    // Runde 10 (r10m): Minervini-Trichter je Jahr - Liquiditaet, Trend Template je Regel, VCP, Volumen, Risiko.
    if (SET === 'r10m') {
      const g = rawGate(minervini2), P = { ...minervini2.PARAMS, minPrice: 0 }, d = ctx.bars.date;
      for (let t = 252; t < d.length; t++) {
        if (d[t] < W.from || d[t] > W.to) continue;
        const y = d[t].slice(0, 4), f = (funnel[y] ||= { days: 0, liquid: 0, tt: 0, ttFail: {}, vcp: 0, dry: 0, riskOk: 0, setup: 0 });
        f.days++;
        if (!(ctx.raw.close[t] >= minervini2.PARAMS.minPrice) || !(ctx.ind.dollarVol20[t] >= minervini2.PARAMS.minDollarVolume)) continue;
        f.liquid++;
        const tt = minTT(ctx, t, P);
        if (!tt.ok) { for (const [rk, ok] of Object.entries(tt.rules)) if (!ok) f.ttFail[rk] = (f.ttFail[rk] || 0) + 1; continue; }
        f.tt++;
        const r = g.scan(ctx, t, P, {});
        if (!r) continue;
        if (r.rules['MIN-VCP-01']) f.vcp++;
        if (r.rules['MIN-VCP-02']) f.dry++;
        if (r.rules['MIN-RISK-VU']) f.riskOk++;
        if (r.stage === 'SETUP' || r.stage === 'ENTRY_READY') f.setup++;
      }
    }
    if (++k % 1000 === 0) log(`simuliert ${k}/${segs.length}`);
  }
  for (const e of RUN) if (e.tradesOf) { R[keyOf(e)].base = R[e.tradesOf].base; R[keyOf(e)].cost2 = R[e.tradesOf].cost2; R[keyOf(e)].c3 = R[e.tradesOf].c3; }
  log('Simulation fertig: ' + RUN.map((e) => `${keyOf(e)} ${R[keyOf(e)].base.length}`).join(', '));

  // 4. Portfolio und Kennzahlen.
  let cfg = PORTFOLIO_DEFAULTS;
  const metricsOf = (run, label, cal) => {
    const eq = run.equity;
    const tr = run.taken.filter((p) => p.returnPct !== undefined).map((p) => ({ result: { returnPct: p.returnPct, sessionsHeld: p.tr.heldSessions } }));
    const m = computeMetrics(eq, tr, spyTR, cfg);
    const sub = SPLIT_PERIODS.map(([a, b]) => { const c = cagrBetween(eq, a, b), s = cagrBetween(spyTR, a, b, 'value'); return { from: a, to: b, cagr: c, spy: s, excess: c != null && s != null ? c - s : null }; });
    const at = (curve, d, key) => { let v = null; for (const p of curve) { if (p.date > d) break; v = p[key]; } return v; };
    const phases = PHASES.map(([id, a, b]) => { const s0 = at(eq, a, 'equity'), s1 = at(eq, b, 'equity'), b0 = at(spyTR, a, 'value'), b1 = at(spyTR, b, 'value'); return { id, from: a, to: b, strategy: s0 && s1 ? s1 / s0 - 1 : null, spy: b0 && b1 ? b1 / b0 - 1 : null }; });
    void cal;
    return { label, cagr: m.cagr, spyCagr: m.benchmarkCagr, excessCagr: m.excessCagr, totalReturn: m.totalReturn, maxDrawdown: m.maxDrawdown, volatility: m.volatility, sharpe: m.sharpe, trades: m.trades, hitRate: m.hitRate, expectancy: m.expectancy, profitFactor: m.profitFactor, exposure: m.exposure, avgHoldingSessions: m.avgHoldingSessions, annualReturns: m.annualReturns, subperiods: sub, phases, skipped: run.skipped.length, taken: run.taken.length, terminalCount: run.book.terminalCount, reconciliation: reconcile(run, cfg) };
  };
  const results = {};
  const MOK = marketOkMap(spyAdj);
  const runPortfolioTR = (a, b, c, o = {}) => runPortfolioTRBase(a, b, c, { marketOk: MOK, ...o });
  for (const e of RUN) {
    cfg = portfolioOf(e);
    const all = R[keyOf(e)].base, all2 = R[keyOf(e)].cost2, surv = all.filter((t) => t.survivor);
    const cal = [...new Set([...calendar, ...all.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((d) => d >= W.from && d <= W.to)])].sort();
    const runs = {};
    for (const sc of ['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO']) runs[sc] = metricsOf(runPortfolioTR(all, cal, cfg, { scenario: sc }), sc, cal);
    runs.COST2_S1 = metricsOf(runPortfolioTR(all2, cal, cfg, { scenario: 'S1_MINUS_30', slippageBps: 20, commissionBps: 2 }), 'COST2_S1', cal);
    runs.SURVIVORS_ONLY = metricsOf(runPortfolioTR(surv, cal, cfg, { scenario: 'S0_LAST_PRICE' }), 'SURVIVORS_ONLY', cal);
    runs.SEEDS_S1 = [];
    for (let s = 1; s <= 20; s++) { const m = metricsOf(runPortfolioTR(all, cal, cfg, { scenario: 'S1_MINUS_30', seed: s }), 'SEED_' + s, cal); runs.SEEDS_S1.push({ seed: s, excessCagr: m.excessCagr, cagr: m.cagr, maxDrawdown: m.maxDrawdown, trades: m.trades }); }
    if (SET === 'r13b') {
      runs.S1C_CLASSIFIED = metricsOf(runPortfolioTR(all, cal, cfg, { scenario: 'S1C_CLASSIFIED' }), 'S1C_CLASSIFIED', cal);
      runs.COST2_S1C = metricsOf(runPortfolioTR(all2, cal, cfg, { scenario: 'S1C_CLASSIFIED', slippageBps: 20, commissionBps: 2 }), 'COST2_S1C', cal);
      runs.SEEDS_S1C = [];
      for (let s = 1; s <= 20; s++) { const m = metricsOf(runPortfolioTR(all, cal, cfg, { scenario: 'S1C_CLASSIFIED', seed: s }), 'SEEDS1C_' + s, cal); runs.SEEDS_S1C.push({ seed: s, excessCagr: m.excessCagr }); }
    }
    if (e.id === 'DARVAS_BOX') {
      const aOnly = all.filter((t) => Array.isArray(t.qualityFailed) && t.qualityFailed.filter((x) => x !== 'DAR-Q-REGIME').length === 0);
      runs.EXPLORATIVE_A_WITHOUT_REGIME_S1 = metricsOf(runPortfolioTR(aOnly, cal, cfg, { scenario: 'S1_MINUS_30' }), 'EXPLORATIVE_A_WITHOUT_REGIME_S1', cal);
      runs.EXPLORATIVE_A_WITHOUT_REGIME_S1.engineTrades = aOnly.length;
    }
    // C2
    const plain = all.filter((t) => !t.terminal || t.terminal.kind === 'OPEN_AT_END');
    const bySym = new Map(); for (const t of plain) (bySym.get(t.listingId) || bySym.set(t.listingId, []).get(t.listingId)).push(t);
    const priceOf = (sym, date) => { for (const t of bySym.get(sym) || []) { const v = t.marks.get(date); if (v !== undefined) return v; } return undefined; };
    // C2 vergleicht die Portfolio-Mechanik mit engine/backtest.mjs; Zusaetze, die nur die
    // Validierung kennt (schrittweise Exposition, notionelles Turtle-Konto), sind dafuer aus.
    const cfgC2 = { ...cfg, progressive: null, turtleNotional: null, marketFilter: null };
    const eng = runPortfolio(plain.map((t) => ({ symbol: t.listingId, signal: { id: t.id, entry: { ...t.entry }, initialStop: t.initialStop, exits: t.exits.map((x) => ({ ...x })) } })), priceOf, cal, cfgC2);
    const mine2 = runPortfolioTR(plain, cal, cfgC2, { commissionBps: 0, dividends: false, sizingSameDay: true, engineCompat: true });
    let c2 = 0; for (let i = 0; i < cal.length; i++) c2 = Math.max(c2, Math.abs(eng.equity[i].equity / mine2.equity[i].equity - 1));
    const r0 = runPortfolioTR(all, cal, cfg, { scenario: 'S0_LAST_PRICE' });
    const c5 = r0.taken.filter((p) => p.returnPct !== undefined).sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct)).slice(0, 10).map((p) => ({ id: p.tr.id, returnPct: p.returnPct, entry: p.tr.entry, lastExit: p.tr.exits[p.tr.exits.length - 1] || null, terminal: p.tr.terminal ? { ...p.tr.terminal } : null, rawCloseAtConfirm: p.tr.rawCloseAtConfirm }));
    const at5 = all.filter((t) => !(t.rawCloseAtConfirm >= e.PARAMS.minPrice)).length;
    results[keyOf(e)] = {
      variant: e.variant, version: e.version, params: e.PARAMS, portfolio: cfg, role: SET === 'r13b' ? 'R13B_REAPPLICATION' : SET === 'r12' ? (e.version.endsWith('-M') ? 'R12_MARKET_FILTER' : 'REFERENCE_LIVE') : SET === 'r11' ? ROLE_R11[keyOf(e)] : SET === 'r10m' ? 'R10_MINERVINI_ABLATION' : SET === 'r10c' ? ROLE_R10C(e.version) : SET === 'r9b' || SET === 'r10b' ? ROLE_R9B[e.version] : SET === 'r8c' ? ROLE_R8C[keyOf(e)] : SET === 'r8b' ? ROLE_R8B[keyOf(e)] : SET === 'r8' ? ROLE_R8[keyOf(e)] : SET === 'r7' ? (ENGINES_R7.includes(e) ? 'R7_HYPOTHESIS' : 'REFERENCE_REPRODUCTION') : 'PREREGISTERED', engineTrades: all.length, portfolioTrades: runs.S0_LAST_PRICE.taken,
      runs, judgement: judge(runs), at5Violations: at5,
      controls: { C1max: Math.max(...['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO', 'COST2_S1', 'SURVIVORS_ONLY'].map((x) => runs[x].reconciliation.relDiff)), C2maxRelDiff: c2, C3m: R[keyOf(e)].c3, C5: c5 },
      diagnostics: { allTrades: diag(all), survivorTrades: diag(surv), delistedTrades: diag(all.filter((t) => !t.survivor)), takenS0: diag(r0.taken.map((p) => p.tr)), maxPositionsSkipped: r0.skipped.filter((x) => x.reason === 'MAX_POSITIONS').length },
    };
    if (SET === 'r9b' || SET === 'r10b') { const ev = {}; for (const t of all) { const kk = `${t.evidence || 'NONE'}|${t.sameDayOrder || 'NONE'}`; ev[kk] = (ev[kk] || 0) + 1; } results[keyOf(e)].evidenceCounts = ev; }
    if (SET === 'r7' || SET.startsWith('r8') || SET === 'r9b' || SET === 'r10b' || SET === 'r10c' || SET === 'r10m' || SET === 'r11' || SET === 'r12' || SET === 'r13b') {
      const { signalQuality, exposureScenarios, theoreticalMaxExposure } = await import('./diagnose-methods.mjs');
      const spyIdx = new Map(spyTR.map((p, i) => [p.date, i]));
      results[keyOf(e)].signalQuality = signalQuality(all, spyIdx, spyTR);
      results[keyOf(e)].capital = { ...exposureScenarios(r0.equity, spyIdx, spyTR), ...theoreticalMaxExposure(all, cfg) };
      if (SET.startsWith('r8') || SET === 'r9b' || SET === 'r10b' || SET === 'r10c' || SET === 'r10m' || SET === 'r11' || SET === 'r12') results[keyOf(e)].signalQualityBySubperiod = SPLIT_PERIODS.map(([a, b]) => ({ from: a, to: b, ...signalQuality(all.filter((t) => t.entry.date >= a && t.entry.date <= b), spyIdx, spyTR) }));
    }
    R[keyOf(e)] = null;
    log(`${keyOf(e)}: Portfolio fertig`);
  }

  if (!LIMIT) {
    const sp = budget.spent, u = await mine.readUsage();
    await mine.writeUsage(Guard.applyUsage(u, { classAOperations: sp.classA + 1, classBOperations: sp.classB, bytesDownloaded: sp.bytesDownloaded, run: { at: new Date().toISOString(), kind: 'VALIDATION_ANALYZE_METHODS', classB: sp.classB } }));
  }
  const result = { schema: 'supertrader-validation-methods-result-1.0.0', set: SET, at: new Date().toISOString(), prereg: SET === 'r13b' ? PREREG_R13B : SET === 'r12' ? PREREG_R12 : SET === 'r11' ? PREREG_R11 : SET === 'r10c' || SET === 'r10m' ? PREREG_R10C : SET === 'r10b' ? PREREG_R10B : SET === 'r9b' ? PREREG_R9B : SET === 'r8c' ? PREREG_R8C : SET === 'r8b' ? PREREG_R8B : SET === 'r8' ? PREREG_R8 : SET === 'r7' ? PREREG_R7 : PREREG_METHODS, examples: SET === 'r8' || SET === 'r8c' ? examples : undefined, intraday: intradayStats, funnel: SET === 'r10m' ? funnel : undefined, nonEquityExcluded: SET === 'r10c' || SET === 'r10m' || SET === 'r11' || SET === 'r12' ? nonEquityExcluded : undefined, secCoverage: SET === 'r11' ? secCoverage : undefined, tableHash: hash, dataFingerprint, commit: process.env.GITHUB_SHA || null, limit: LIMIT || null,
    counts: { listings: listings.length, members: members.length, segments: segs.length, duplicates: dup.size, offCalendar }, execution: DEFAULT_EXECUTION, portfolio: cfg,
    spy: { cagr: cagrBetween(spyTR, W.from, W.to, 'value'), maxDrawdown: maxDrawdown(spyTR, 'value') }, results, budget: budget.spent };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const sealed = L.encryptForOwner(pem, Buffer.from(JSON.stringify(result)));
  fs.writeFileSync(path.join(OUT_DIR, `analyze-${SET}${LIMIT ? '-smoke' : ''}.sealed.json`), sealed);
  log(`Verschlüsseltes Ergebnis geschrieben (${sealed.length} Byte)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
