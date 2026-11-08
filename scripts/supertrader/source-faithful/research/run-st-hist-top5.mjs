#!/usr/bin/env node
/**
 * Supertrader Neustart (04.11.2026) – erster historischer Backtest der V1-Methoden (Top 5: C01, C02, C03, C08, C12).
 * Forschung, nicht zertifiziert. Keine neue Regel, kein Parameter, keine Engine: die unveränderten SF6-Referenzen
 * (research/sf6-references.mjs, Konfiguration REF) laufen auf dem eingefrorenen DEV-Snapshot (2016-01-04 bis 2026-09-30,
 * Kurse mit Split-Faktoren nach ADR-002, delistete Titel des Snapshots mit Abrechnung), mit der DQ-K5-Quarantäne
 * (die ungeklärten Kapitalmaßnahmen sind ausgeschlossen, E1) und den vier vorregistrierten Kostenstufen
 * (SF6-VALIDATION-PROTOCOL 1.1.0). Optional zusätzlich Universum B mit den V13-Delisting-Ketten (st9-v13-delisted-study).
 *
 *   node scripts/supertrader/source-faithful/research/run-st-hist-top5.mjs --snapshot sts1-<id> --out <dir außerhalb> \
 *     --reviewer-key <pem> [--v13-series <dir> --v13-raw <dir>]
 *
 * Ausgaben (nur nach --out): st-hist-top5.public.json (Status, Zählungen, Hashes; keine Renditezahl) und
 * st-hist-top5.sealed.<owner|reviewer>.json (alles, hybrid verschlüsselt). Öffentliche Renditeaussagen braucht der Owner.
 * Das HOLDOUT-Fenster 2008-2015 bleibt unberührt (PREREGISTRATION-R14).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { computeDiagnosticMetrics } from '../runner/metrics.mjs';
import { runTurtle } from '../methods/turtle.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { SF6_REFERENCES } from './sf6-references.mjs';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';
import { runResearchLifecycle, prepareAll, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from './lifecycle-engine.mjs';
import { SF6_VALIDATION_PROTOCOL } from './run-sf6-validation.mjs';
import * as S from './st9-v13-delisted-study.mjs';
import * as X from './st9-hist-execution.mjs';
import * as FID from './kk-breakout-fidelity.mjs';
import * as MF from './minervini-fidelity.mjs';
import * as MX from './minervini-execution.mjs';
import * as ML from './minervini-lifecycle.mjs';
import { runKkStHist, loadKkCache, ST_HIST_KK_VERSION } from './st-hist-kk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const ST_HIST_TOP5_VERSION = 'st-hist-top5-1.11.0'; // 1.11.0 (Strang H, 06.11.2026): Modus rest8 = übrige Methoden C04–C07, C11, C13 auf demselben Weg
/** Delisting-Erlös als Sensitivität (Prüfung Strang E): echte Neuläufe mit den vorhandenen Abrechnungsszenarien der Engines
 *  (validation/portfolio.mjs SCENARIOS, Wiederanlage inklusive). 100 % = Referenz S0_LAST_PRICE, 70 % = S1_MINUS_30,
 *  S2_DISTRESS_ZERO = 0 % bei Insolvenz-Delisting, sonst 70 %. Ein Szenario „0 % für alle“ hat die Engine nicht (eine neue
 *  Abrechnungsregel wäre ein Fachmodell). Version 1.1.0 buchte die Differenz nachträglich auf die Kurve; das ergibt bei fast
 *  leerem Konto Verluste über 100 % und ist ersetzt. */
export const DELISTING_PROCEEDS = Object.freeze([['DELIST_100', 'S0_LAST_PRICE'], ['DELIST_70', 'S1_MINUS_30'], ['DELIST_DISTRESS_0', 'S2_DISTRESS_ZERO']]);
export const TOP5 = Object.freeze(['TURTLE_S1', 'TURTLE_S2', 'DARVAS', 'KK_BREAKOUT', 'BUYABLE_GAP_UP']);
/** Strang H (06.11.2026): die übrigen Methoden mit SF6-Referenz (C04, C05, C06, C07, C11, C13), unverändert wie die Top 5
 *  gerechnet. C09/C10 haben keine Tagesreferenz (IEX-Minuten ab 2017) und laufen über run-kk-intraday.mjs --st-hist. */
export const REST8_DAILY = Object.freeze(['WEINSTEIN_INVESTOR', 'WEINSTEIN_TRADER', 'MINERVINI_SEPA', 'MINERVINI_POWER_PLAY', 'POCKET_PIVOT', 'HOLY_GRAIL_W_RAS97']);
export const methodsForMode = (mode) => (mode === 'rest8' ? REST8_DAILY : TOP5);
export const LABEL = Object.freeze({ evidenceKind: 'HISTORICAL_RESEARCH_BACKTEST', label: 'Forschung, nicht zertifiziert', certification: 'DIAGNOSTIC_NOT_CERTIFIED', productionApproved: false, performanceClaim: 'NONE', publication: 'OWNER_DECISION_REQUIRED' });
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';
const INITIAL_CAPITAL = 100000;
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const argOf = (argv) => (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/** Kennzahlen eines Laufs: Trefferquote auf abgeschlossenen Trades, Gesamtrendite, CAGR, max. Verlust, SPY, Kosten. */
export function summarizeRun(r, ds, { protocol = SF6_VALIDATION_PROTOCOL } = {}) {
  const m = computeDiagnosticMetrics({ curve: r.run.curve, trades: r.metricTrades, ledger: r.run.ledger, costs: r.run.counts?.costs ?? 0, spyTR: ds.spyTR, splitPeriods: protocol.splitPeriods[L.WINDOW_NAME] ?? [], initialCapital: INITIAL_CAPITAL });
  const end = r.run.curve.at(-1)?.equity ?? null, first = r.run.curve[0]?.date ?? null, last = r.run.curve.at(-1)?.date ?? null;
  let spyTotal = null;
  if (ds.spyTR && first && last) { const s = ds.spyTR.filter((p) => p.date >= first && p.date <= last); if (s.length > 1 && s[0].value > 0) spyTotal = s.at(-1).value / s[0].value - 1; }
  const closed = r.trades.filter((t) => t.status === 'CLOSED');
  return {
    trades: r.trades.length, closedTrades: closed.length, openAtDataEnd: r.trades.length - closed.length,
    hitRate: closed.length ? closed.filter((t) => (t.pnl ?? 0) > 0).length / closed.length : null,
    totalReturn: end !== null ? end / INITIAL_CAPITAL - 1 : null, cagr: m.cagr, maxDrawdown: m.maxDrawdown, volatility: m.volatility, sharpe: m.sharpe,
    spyTotalReturn: spyTotal, spyCagr: m.spyCagr, spyDistance: m.spyDistance, costsPaid: r.run.counts?.costs ?? null, costBurden: m.costBurden,
    profitFactor: m.profitFactor, exposure: m.exposure, medianHoldingSessions: m.medianHoldingSessions, annualReturns: m.annualReturns, periods: m.periods,
    from: first, to: last, reconciliation: r.run.reconciliation ? { pass: r.run.reconciliation.pass } : null,
  };
}

/** Ein Lauf derselben Referenz mit anderem Abrechnungsszenario für Delistings (Turtle: Szenario-Option; sf5: Policy). */
export function runWithTerminalScenario(ref, ds, { window, costs, prep, scenario }) {
  if (ref.key.startsWith('TURTLE_')) {
    const r = runTurtle(ds, { system: ref.key === 'TURTLE_S1' ? 'S1' : 'S2', from: window.from, to: window.to, scenario, slippageBps: costs.slippageBps, commissionBps: costs.commissionBps });
    return { run: r, trades: r.positionTrades.map((t) => ({ id: t.id, entryDate: t.entryDate, exitDate: t.exitDate, exitReason: t.reason, status: 'CLOSED', pnl: t.pnl })), metricTrades: r.positionTrades };
  }
  return ref.run(ds, { from: window.from, to: window.to, costs: { ...costs, terminalScenario: scenario }, ...prep });
}
/** Gesamtrendite, CAGR, max. Verlust und Trefferquote je Annahme zum Delisting-Erlös. */
export function delistingSensitivity(ref, ds, { window, costs, prep }) {
  return Object.fromEntries(DELISTING_PROCEEDS.map(([id, scenario]) => {
    const x = summarizeRun(runWithTerminalScenario(ref, ds, { window, costs, prep, scenario }), ds);
    return [id, { scenario, trades: x.trades, hitRate: x.hitRate, totalReturn: x.totalReturn, cagr: x.cagr, maxDrawdown: x.maxDrawdown }];
  }));
}
/** Vorregistrierte Gegenvarianten zur Reihenfolge innerhalb des Balkens (nur die in den sf5-Lifecycles registrierten,
 *  heute ALT-INTRABAR-OPTIMISTIC für Darvas): Spannweite einer auf Tagesbalken nicht entscheidbaren Annahme. */
export function intrabarVariants(key, ds, { window, costs }) {
  const lc = SF5_LIFECYCLES.find((x) => x.key === key);
  if (!lc) return null;
  const vs = lc.variants.filter((v) => /^ALT-INTRABAR/.test(v.id));
  if (!vs.length) return null;
  const ref = lc.variants.find((v) => v.id === 'REF');
  return Object.fromEntries(vs.map((v) => {
    const config = v.config ?? { ...ref.config, ...v.changes };
    const r = runResearchLifecycle(ds, { adapter: lc.adapter, config, policy: { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, ...costs }, prepared: prepareAll(ds, lc.adapter, config), from: window.from, to: window.to });
    const x = summarizeRun({ run: r, trades: r.trades, metricTrades: r.trades.filter((t) => t.status === 'CLOSED') }, ds);
    return [v.id, { changes: v.changes, trades: x.trades, hitRate: x.hitRate, totalReturn: x.totalReturn, cagr: x.cagr, maxDrawdown: x.maxDrawdown, costsPaid: x.costsPaid, medianHoldingSessions: x.medianHoldingSessions }];
  }));
}
/** Plausibilitätsdiagnose (Hinweis Strang C, tiefe Verluste ohne Kosten): höchstes Exposure, geringstes Cash, die
 *  schlechtesten Trades und Tage mit Titel und Datum, Anteil der Trades unter -50 %. Nur im versiegelten Teil. */
export function plausibility(r, ds) {
  const curve = r.run.curve, sec = new Map(ds.securities.map((x) => [x.id, x]));
  let maxExposure = 0, minCash = Infinity;
  const days = [];
  for (let i = 0; i < curve.length; i++) {
    const p = curve[i], cash = p.equity * (1 - (p.exposure ?? 0));
    maxExposure = Math.max(maxExposure, p.exposure ?? 0); minCash = Math.min(minCash, cash);
    if (i > 0 && curve[i - 1].equity > 0) days.push({ date: p.date, ret: p.equity / curve[i - 1].equity - 1, equity: p.equity });
  }
  days.sort((a, b) => a.ret - b.ret);
  const closed = (r.metricTrades || []).filter((t) => Number.isFinite(t.returnPct));
  const worst = [...closed].sort((a, b) => a.returnPct - b.returnPct).slice(0, 15).map((t) => {
    const x = sec.get(t.id), bars = x?.bars ?? [], e = bars.find((b) => b.date === t.entryDate), q = bars.find((b) => b.date === t.exitDate);
    return { id: t.id, entryDate: t.entryDate, exitDate: t.exitDate, returnPct: t.returnPct, pnl: t.pnl ?? null, reason: t.reason ?? t.exitReason ?? null, entryClose: e?.close ?? null, entryRawClose: e?.rawClose ?? null, exitClose: q?.close ?? null, exitRawClose: q?.rawClose ?? null, exitSplitAdj: q?.splitAdj ?? null };
  });
  const byYear = {};
  for (const t of closed) { const y = String(t.exitDate).slice(0, 4); const b = byYear[y] || (byYear[y] = { trades: 0, pnl: 0, below50: 0 }); b.trades++; b.pnl += t.pnl ?? 0; if (t.returnPct < -0.5) b.below50++; }
  return { maxExposure, minCash, worstDays: days.slice(0, 15), worstTrades: worst, tradesBelowMinus50: closed.filter((t) => t.returnPct < -0.5).length, closedTrades: closed.length, byYear };
}
/** Wie oft endet eine Position durch Delisting, durch eine Datenlücke (zensiert) oder regulär. */
export function exitCensus(r) {
  const out = { TERMINAL_DELISTED: 0, SECURITY_UNAVAILABLE: 0, OTHER: 0 };
  for (const x of r.run.ledger) if (x.side === 'SELL') out[x.reason === 'TERMINAL_DELISTED' || x.reason === 'SECURITY_UNAVAILABLE' ? x.reason : 'OTHER']++;
  return out;
}
/** Population: Segmente nach Endursache (DATA_GAP = zensiert, kein Delisting-Erlös). */
export function populationCensus(ds) {
  const out = {};
  for (const s of ds.securities) { const c = s.terminal?.cause ?? 'ACTIVE_AT_WINDOW_END'; out[c] = (out[c] || 0) + 1; }
  return out;
}
/** Audit-Ergebnis über alle Rahmen, in denen der Audit läuft (fail closed). */
export function auditPassAll(frames) {
  return Object.values(frames).every((f) => Object.values(f).every((m) => !m.audit || m.audit.pass === true));
}

/** Top 5 je Kostenstufe auf einem (bereits quarantänierten) Datensatz. */
export function runTop5(ds, { methods = TOP5, costLevels = SF6_VALIDATION_PROTOCOL.costLevels, window = L.WINDOW, audit = true, log = () => {} } = {}) {
  const out = {};
  for (const key of methods) {
    const ref = SF6_REFERENCES.find((x) => x.key === key);
    if (!ref) throw new Error(`UNKNOWN_METHOD ${key}`);
    const prep = ref.prep(ds, { from: window.from }) || {};
    out[key] = { candidateId: ref.candidateId, costs: {} };
    for (const c of costLevels) {
      const r = ref.run(ds, { from: window.from, to: window.to, costs: { slippageBps: c.slippageBps, commissionBps: c.commissionBps }, ...prep });
      out[key].costs[c.id] = summarizeRun(r, ds);
      out[key].costs[c.id].tradesSha256 = sha(r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.pnl]));
      if (c.id === 'REF') {
        out[key].delistingProceeds = delistingSensitivity(ref, ds, { window, costs: { slippageBps: c.slippageBps, commissionBps: c.commissionBps }, prep });
        out[key].exitCensus = exitCensus(r);
        out[key].plausibility = plausibility(r, ds);
        if (r.run.trades && r.run.trades[0]?.initialRiskAmount !== undefined) out[key].rDistribution = FID.rDistribution(r.run.trades);
        if (key === 'KK_BREAKOUT') out[key].goldenTrades = FID.goldenTradeCheck(r.run.trades, FID.KK_GOLDEN_TRADES);
        const iv = intrabarVariants(key, ds, { window, costs: { slippageBps: c.slippageBps, commissionBps: c.commissionBps } });
        if (iv) out[key].intrabarVariants = iv;
      }
      if (c.id === 'REF' && audit) {
        // unabhängiger Ausführungsaudit (st9-hist-execution: Ausstiege, Gap-Stopps, Delisting, Bücher); nur Beobachter
        const a = X.auditRun(ds, r, { key, costs: { slippageBps: c.slippageBps, commissionBps: c.commissionBps }, from: window.from });
        out[key].audit = { ...X.publicAudit(a), examples: a._examples };
      }
      log(`${key} ${c.id}: ${r.trades.length} trades`);
    }
  }
  return out;
}

/** E3-Fenster (Edge-Studie Strang C, docs/research/edge/PROTOKOLL.md): je Fenster ein eigener Lauf ab Cash. Der Snapshot
 *  endet am 2026-09-30; die Sitzungen bis zum Protokollende 2026-10-02 fehlen und sind gekennzeichnet. */
export const EDGE_WINDOWS = Object.freeze([
  Object.freeze({ id: 'E3_DEV_2016_2019', from: '2016-01-04', to: '2019-12-31', protocolFrom: '2016-01-01', protocolTo: '2019-12-31' }),
  Object.freeze({ id: 'E3_TEST_2020_2026', from: '2020-01-02', to: '2026-09-30', protocolFrom: '2020-01-01', protocolTo: '2026-10-02', gap: 'SNAPSHOT_ENDS_2026-09-30' }),
]);
const tickerOf = (id) => String(id).split('#')[0].split(':')[2] ?? null;
/** Fills, Kurve und Terminalereignisse eines kostenfreien Laufs (0 bp, Terminal S0) für den Forschungsadapter von Strang C. */
export function edgeExport(ds, { methods = TOP5, windows = EDGE_WINDOWS, log = () => {} } = {}) {
  const sec = new Map(ds.securities.map((s) => [s.id, { s, at: new Map(s.bars.map((b, i) => [b.date, i])) }]));
  const adv20 = (x, i) => { let sum = 0, n = 0; for (let j = Math.max(0, i - 20); j < i; j++) { const b = x.s.bars[j]; const v = (b.rawClose ?? b.close) * (b.rawVolume ?? b.volume); if (Number.isFinite(v)) { sum += v; n++; } } return n ? sum / n : null; };
  const out = {};
  for (const key of methods) {
    const ref = SF6_REFERENCES.find((x) => x.key === key);
    out[key] = { candidateId: ref.candidateId, windows: {} };
    for (const w of windows) {
      const prep = ref.prep(ds, { from: w.from }) || {};
      const r = ref.run(ds, { from: w.from, to: w.to, costs: { slippageBps: 0, commissionBps: 0 }, ...prep });
      const fills = r.run.ledger.map((x) => {
        const s = sec.get(x.id), i = s?.at.get(x.date), b = i !== undefined ? s.s.bars[i] : null;
        return { date: x.date, securityId: x.id, ticker: tickerOf(x.id), side: x.side, shares: x.shares ?? null, price: x.price ?? null, notional: x.gross ?? null, reason: x.reason ?? null, close: b?.close ?? null, rawClose: b?.rawClose ?? null, volume: b?.volume ?? null, rawVolume: b?.rawVolume ?? null, splitAdj: b?.splitAdj ?? null, adv20Usd: i !== undefined ? adv20(s, i) : null };
      });
      const terminals = [...new Set(r.run.ledger.filter((x) => x.side === 'SELL' && (x.reason === 'TERMINAL_DELISTED' || x.reason === 'SECURITY_UNAVAILABLE')).map((x) => `${x.id}|${x.date}|${x.reason}`))].map((k) => {
        const [id, date, reason] = k.split('|'); const t = sec.get(id)?.s.terminal;
        return { securityId: id, ticker: tickerOf(id), date, reason, cause: t?.cause ?? null, distress: t?.distress ?? null, delistClass: t?.delistClass ?? null, terminalDate: t?.date ?? null };
      });
      // tägliche Bestände aus den Fills rekonstruiert (Overlay Marktfilter bei C): [securityId, Stückzahl, Schlusskurs]
      const held = new Map(), byDate = new Map();
      for (const f of fills) { if (f.side !== 'BUY' && f.side !== 'SELL') continue; (byDate.get(f.date) || byDate.set(f.date, []).get(f.date)).push(f); }
      const holdings = r.run.curve.map((p) => {
        for (const f of byDate.get(p.date) || []) { const n = (held.get(f.securityId) || 0) + (f.side === 'BUY' ? 1 : -1) * (f.shares || 0); if (Math.abs(n) < 1e-9) held.delete(f.securityId); else held.set(f.securityId, n); }
        return { date: p.date, positions: [...held].map(([id, n]) => { const s = sec.get(id), i = s?.at.get(p.date); return [id, n, i !== undefined ? s.s.bars[i].close : null]; }) };
      });
      out[key].windows[w.id] = { window: w, holdings, costs: { slippageBps: 0, commissionBps: 0 }, terminalScenario: 'S0_LAST_PRICE', initialCapital: INITIAL_CAPITAL,
        curve: r.run.curve.map((p) => ({ date: p.date, equity: p.equity, cash: p.equity * (1 - (p.exposure ?? 0)), exposure: p.exposure ?? 0, positions: p.positions ?? null })),
        fills, terminals, reconciliation: r.run.reconciliation ? { pass: r.run.reconciliation.pass } : null, fillsSha256: sha(fills) };
      log(`edge ${key} ${w.id}: ${fills.length} fills`);
    }
  }
  return { schema: 'st-edge-export-1.0.0', ...LABEL, windows, benchmark: { spyClose: ds.benchmark.map((b) => ({ date: b.date, close: b.close })), spyTR: ds.spyTR }, methods: out };
}

/** Adapter je Fidelity-Variante; FID-3 bekommt die Tagesauswahl (dailySelection) aus demselben Querschnitt. */
function fidAdapters(ds) {
  const ranks = FID.momentumRanks(ds.securities), leaders = FID.momentumLeaders(ds.securities, { ranks }), market = FID.marketOn(ds.benchmark);
  const adapters = {};
  for (const variant of Object.keys(FID.KK_FIDELITY_VARIANTS)) {
    const selection = FID.KK_FIDELITY_VARIANTS[variant].dailyTop ? FID.dailySelection(ds, { leaders, market, ranks, variant }) : null;
    adapters[variant] = FID.createKkFidelityAdapter({ leaders, market, variant, selection });
  }
  return { leaders, market, adapters };
}

/** C08-Treueprüfung: Variante FID-1 (research/kk-breakout-fidelity.mjs) zu Referenz- und Nullkosten, mit R-Verteilung und
 *  goldenen Trades; die Referenz C08 bleibt unverändert. */
export function kkFidelityRun(ds, { window = L.WINDOW, costLevels = SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF' || c.id === 'COST-0'), log = () => {} } = {}) {
  const { market, adapters } = fidAdapters(ds);
  const out = { version: FID.KK_FIDELITY_VERSION, rules: FID.KK_FIDELITY_RULES, marketOnShare: ds.benchmark.length ? market.size / ds.benchmark.length : null, variants: {} };
  for (const variant of Object.keys(FID.KK_FIDELITY_VARIANTS)) {
    const config = FID.kkFidelityConfigFor(variant), adapter = adapters[variant], prepared = prepareAll(ds, adapter, config), v = (out.variants[variant] = { definition: FID.KK_FIDELITY_VARIANTS[variant], costs: {} });
    for (const c of costLevels) {
      const run = runResearchLifecycle(ds, { adapter, config, policy: FID.kkFidelityPolicyFor(variant, { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, slippageBps: c.slippageBps, commissionBps: c.commissionBps }), prepared, from: window.from, to: window.to });
      const x = summarizeRun({ run, trades: run.trades, metricTrades: run.trades.filter((t) => t.status === 'CLOSED') }, ds);
      v.costs[c.id] = { ...x, rDistribution: FID.rDistribution(run.trades), ...(c.id === 'REF' ? { goldenTrades: FID.goldenTradeCheck(run.trades, FID.KK_GOLDEN_TRADES), exitCensus: exitCensus({ run }) } : {}) };
      log(`kk-${variant} ${c.id}: ${run.trades.length} trades`);
    }
  }
  return out;
}

/** C08-Diagnose der Ausführung: je Variante ein Lauf zu Referenzkosten; je goldenem Trade im Fenster ±8 Tage die
 *  Orderablehnungen (Grund), die Trades und die Zahl offener Positionen. Keine Renditezahlen (kein PnL, keine Kurve). */
export function goldenExecution(ds, { leaders, market, golden = FID.KK_GOLDEN_TRADES, window = L.WINDOW } = {}) {
  const tickerOf = (id) => String(id).split('#')[0].split(':')[2], out = {};
  const ref = SF6_VALIDATION_PROTOCOL.costLevels.find((c) => c.id === 'REF');
  const { adapters } = fidAdapters(ds);
  for (const variant of Object.keys(FID.KK_FIDELITY_VARIANTS)) {
    const config = FID.kkFidelityConfigFor(variant), adapter = adapters[variant], prepared = prepareAll(ds, adapter, config);
    const run = runResearchLifecycle(ds, { adapter, config, policy: FID.kkFidelityPolicyFor(variant, { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, slippageBps: ref.slippageBps, commissionBps: ref.commissionBps }), prepared, from: window.from, to: window.to });
    const posBy = new Map(run.curve.map((p) => [p.date, p.positions ?? null]));
    for (const g of golden) {
      const lo = new Date(Date.parse(g.date) - 8 * 864e5).toISOString().slice(0, 10), hi = new Date(Date.parse(g.date) + 8 * 864e5).toISOString().slice(0, 10);
      const inWin = (d) => d >= lo && d <= hi, mine = (id) => tickerOf(id) === g.ticker;
      const setupDays = [];
      for (const [id, ctx] of prepared) if (mine(id)) for (const [, st] of ctx.setups) if (inWin(st.date)) setupDays.push({ date: st.date, level: st.level, adr20: st.adr20 });
      const e = (out[g.ticker + '|' + g.date] ??= {});
      e[variant] = {
        setupDays,
        rejections: run.rejections.filter((r) => mine(r.id) && inWin(r.date)).map((r) => ({ date: r.date, reason: r.reason })),
        trades: run.trades.filter((t) => mine(t.id) && inWin(t.entryDate)).map((t) => ({ entryDate: t.entryDate, exitDate: t.exitDate ?? null, exitReason: t.exitReason ?? null })),
        openPositions: Object.fromEntries([...posBy].filter(([d]) => inWin(d))),
        maxOpenPositions: FID.kkFidelityPolicyFor(variant, PLATFORM_RESEARCH_PORTFOLIO_POLICY).maxOpenPositions,
      };
    }
  }
  return out;
}

/** C08-FID4: Urteil nach der vorregistrierten Regel (certification/C08-FID4-PREREGISTRATION.json), Kosten REF. */
export function fid4Verdict(kkFid, prereg = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-faithful/certification/C08-FID4-PREREGISTRATION.json'), 'utf8')), windowName = L.WINDOW_NAME) {
  const c = kkFid?.variants?.['FID-4']?.costs?.[prereg.costLevel];
  if (!c) return { id: prereg.id, window: windowName, status: 'NOT_COMPUTED' };
  const m = prereg.criteria.machine, r = c.rDistribution || {};
  const checks = {
    cagrAboveSpyCagr: Number.isFinite(c.cagr) && Number.isFinite(c.spyCagr) ? c.cagr > c.spyCagr : false,
    expectancyRAbove: Number.isFinite(r.expectancyR) ? r.expectancyR > m.expectancyRAbove : false,
    minClosedTrades: (r.closed ?? 0) >= m.minClosedTrades,
  };
  return { id: prereg.id, window: windowName, costLevel: prereg.costLevel, checks, pass: Object.values(checks).every(Boolean) };
}

/** C06/C07 FID-1: Urteil je Methode nach der vorregistrierten Regel (certification/C06-C07-FID1-PREREGISTRATION.json). */
export function minerviniFid1Verdict(fid1, prereg = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-faithful/certification/C06-C07-FID1-PREREGISTRATION.json'), 'utf8')), windowName = L.WINDOW_NAME) {
  const c = fid1?.costs?.[prereg.costLevel];
  if (!c) return { id: prereg.id, window: windowName, status: 'NOT_COMPUTED' };
  const m = prereg.criteria.machine, r = c.rDistribution || {};
  const checks = { cagrAboveSpyCagr: Number.isFinite(c.cagr) && Number.isFinite(c.spyCagr) ? c.cagr > c.spyCagr : false, expectancyRAbove: Number.isFinite(r.expectancyR) ? r.expectancyR > m.expectancyRAbove : false, minClosedTrades: (r.closed ?? 0) >= m.minClosedTrades };
  return { id: prereg.id, window: windowName, costLevel: prereg.costLevel, checks, pass: Object.values(checks).every(Boolean) };
}

/** C06/C07 Referenz auf DEV: Kennzahlen je Kostenstufe (versiegelt), R-Verteilung, Ablehnungsgründe und goldene Trades. */
export function minerviniGoldenRun(ds, { window = L.WINDOW, costLevels = SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF' || c.id === 'COST-0'), log = () => {} } = {}) {
  const out = { methods: {} };
  for (const [cid, strategy] of [['C06', 'SEPA'], ['C07', 'POWER_PLAY']]) {
    const setupIndex = MX.buildSetupIndex(ds, strategy, { from: null }), m = (out.methods[cid] = { strategy, setupCounts: setupIndex.counts, costs: {} });
    for (const c of costLevels) {
      const run = MX.runMinerviniLifecycle(ds, { strategy, setupIndex, config: ML.REFERENCE_CONFIG, policy: { ...MX.EQUITY_RESEARCH_PORTFOLIO_POLICY, slippageBps: c.slippageBps, commissionBps: c.commissionBps }, from: window.from, to: window.to });
      const x = summarizeRun({ run, trades: run.trades, metricTrades: run.trades.filter((t) => t.status === 'CLOSED') }, ds);
      const rej = {}; for (const r of run.rejections) rej[r.reason] = (rej[r.reason] || 0) + 1;
      m.costs[c.id] = { ...x, rDistribution: MF.rDistributionMin(run.trades), rejectionsByReason: rej, ...(c.id === 'REF' ? { golden: MF.minerviniGoldenDiagnose(ds, { strategy, setupIndex, run }) } : {}) };
      log(`minervini ${cid} ${c.id}: ${run.trades.length} trades`);
    }
    // FID-1 (vorregistriert): RS-Gate, Tagesauswahl nach RS, FREEROLL_2R; Referenz-Engine unverändert
    const fidIndex = MF.selectSetupIndex(ds, setupIndex), fidCfg = { ...ML.REFERENCE_CONFIG, exitPolicy: MF.MINERVINI_FID1.exitPolicy }, f = (m.fid1 = { rule: MF.MINERVINI_FID1, selected: fidIndex.counts.FID1_SELECTED, costs: {} });
    for (const c of costLevels) {
      const run = MX.runMinerviniLifecycle(ds, { strategy, setupIndex: fidIndex, config: fidCfg, policy: { ...MX.EQUITY_RESEARCH_PORTFOLIO_POLICY, slippageBps: c.slippageBps, commissionBps: c.commissionBps }, from: window.from, to: window.to });
      const x = summarizeRun({ run, trades: run.trades, metricTrades: run.trades.filter((t) => t.status === 'CLOSED') }, ds);
      const rej = {}; for (const r of run.rejections) rej[r.reason] = (rej[r.reason] || 0) + 1;
      f.costs[c.id] = { ...x, rDistribution: MF.rDistributionMin(run.trades), rejectionsByReason: rej, ...(c.id === 'REF' ? { golden: MF.minerviniGoldenDiagnose(ds, { strategy, setupIndex: fidIndex, run }) } : {}) };
      log(`minervini ${cid} FID-1 ${c.id}: ${run.trades.length} trades`);
    }
    f.verdict = minerviniFid1Verdict(f);
  }
  return out;
}

export function publicPart(result) {
  return { schema: 'st-hist-top5-public-1.1.0', ...LABEL, status: result.status ?? null, receipt: result.receipt, population: result.population ?? null, methods: Object.fromEntries(Object.entries(result.A).map(([k, m]) => [k, { candidateId: m.candidateId, tradesRef: m.costs.REF.trades, tradesSha256Ref: m.costs.REF.tradesSha256, auditPass: m.audit ? m.audit.pass : null, auditViolations: m.audit ? m.audit.violations : null, missedStopCheck: m.audit ? m.audit.missedStopCheck : null }])), quarantine: result.quarantine.A, universeB: result.B ? 'COMPUTED' : 'NOT_REQUESTED', ...(result.KK_PUBLIC ? { kk: result.KK_PUBLIC } : {}) };
}

async function main() {
  const argv = process.argv.slice(2), arg = argOf(argv), die = (c, n = 2) => { console.error(c); process.exit(n); };
  if (L.WINDOW_NAME !== 'DEV') die('HOLDOUT_NOT_PERMITTED');
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) die('SNAPSHOT_REQUIRED');
  const OUT = S.assertOutsideRepo(arg('--out'), ROOT);
  const reviewerPem = arg('--reviewer-key') ? fs.readFileSync(arg('--reviewer-key'), 'utf8') : null;
  if (reviewerPem && !/BEGIN PUBLIC KEY/.test(reviewerPem)) die('REVIEWER_KEY_NOT_A_PUBLIC_KEY');
  const t0 = Date.now(), log = (m) => console.log(`[st-hist-top5 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
  const { createSnapshotStore } = await import('../../snapshot/store.mjs');
  const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
  const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke: false }), snapshotId, requireRestoreReceipt: true });
  const pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
  const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
  // nach SF6-PAPER-2027 1.2.0 hat der Snapshot-Code einen neuen Fingerabdruck; die Referenzgleichheit ist mit R1–R6 belegt.
  // Nur mit --allow-code-version-change und nur bei exakt verifiziertem Datensatz (wie supertrader-validation.yml).
  if (v.codeVersionChanged && !(argv.includes('--allow-code-version-change') && v.datasetVerified === 'EXACT')) die('INPUT_INTEGRITY_FAILURE: CODE_VERSION_CHANGED', 3);
  const datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
  const buf = await (await opened.io.createDriver()).get(pit.mine.seriesPrefix + SEC_PIT_KEY);
  if (!buf || !buf.length) die('SEC_PIT_MISSING', 3);
  const secPit = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  const dsA = datasetFromPit(pit); attachSecPit(dsA, secPit);
  const qa = S.applyQuarantine(dsA, { mode: 'DQ-K5-BOOK' });
  log(`universe A: ${dsA.securities.length} segments, quarantine ${JSON.stringify(qa.census)}`);
  if (arg('--mode') === 'minervini-golden') {
    // C06/C07-Treueprüfung Schritt 1: Referenz (gepinnt, unverändert) auf DEV gegen belegte Minervini-Trades; nur versiegelt.
    const out = minerviniGoldenRun(qa.ds, { log });
    const receipt = { version: ST_HIST_TOP5_VERSION, fidelity: MF.MINERVINI_FIDELITY_VERSION, mode: 'minervini-golden', snapshotId, datasetSha256, datasetVerified: v.datasetVerified, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
    if (!reviewerPem) die('REVIEWER_KEY_REQUIRED_FOR_MINERVINI_GOLDEN');
    fs.mkdirSync(OUT, { recursive: true });
    const plainM = Buffer.from(JSON.stringify({ schema: 'st-minervini-golden-1.0.0', ...LABEL, receipt, quarantine: qa.census, ...out }));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plainM));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plainM));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.public.json'), JSON.stringify({ schema: 'st-minervini-golden-public-1.0.0', ...LABEL, receipt, golden: MF.MINERVINI_GOLDEN_TRADES.length }, null, 1) + '\n');
    log('done (minervini-golden)');
    return;
  }
  if (arg('--mode') === 'golden-diagnose') {
    // C08-Treueprüfung: warum die belegten Kullamägi-Trades nicht entstehen (Universum, Quarantäne, Momentum, Markt, Setup-Schritt).
    // Keine Renditezahlen; trotzdem nur versiegelt, öffentlich nur Zählungen.
    const leaders = FID.momentumLeaders(qa.ds.securities), market = FID.marketOn(qa.ds.benchmark);
    const tickerOf = (id) => String(id).split('#')[0].split(':')[2];
    const diag = FID.goldenDiagnose(qa.ds, { leaders, market }).map((g) => ({ ...g, inRawUniverse: dsA.securities.some((x) => tickerOf(x.id) === g.ticker) }));
    const exec = goldenExecution(qa.ds, { leaders, market });
    for (const g of diag) g.execution = exec[g.ticker + '|' + g.date] ?? null;
    const receipt = { version: ST_HIST_TOP5_VERSION, fidelity: FID.KK_FIDELITY_VERSION, mode: 'golden-diagnose', snapshotId, datasetSha256, datasetVerified: v.datasetVerified, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
    if (!reviewerPem) die('REVIEWER_KEY_REQUIRED_FOR_GOLDEN_DIAGNOSE');
    fs.mkdirSync(OUT, { recursive: true });
    const plainG = Buffer.from(JSON.stringify({ schema: 'st-kk-golden-diagnose-1.0.0', ...LABEL, receipt, rules: FID.KK_FIDELITY_RULES, golden: diag }));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plainG));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plainG));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.public.json'), JSON.stringify({ schema: 'st-kk-golden-diagnose-public-1.0.0', ...LABEL, receipt, golden: diag.length, inUniverse: diag.filter((g) => g.inUniverse).length, inRawUniverse: diag.filter((g) => g.inRawUniverse).length }, null, 1) + '\n');
    log('done (golden-diagnose)');
    return;
  }
  if (arg('--mode') === 'edge-export') {
    // E3 (Strang C): kostenfrei, Terminal S0, je Fenster ab Cash, mit DQ-K5-Quarantäne wie die Referenz; Ausgabe nur versiegelt
    const exp = edgeExport(qa.ds, { log });
    exp.quarantine = qa.census; exp.receipt = { version: ST_HIST_TOP5_VERSION, mode: 'edge-export', snapshotId, datasetSha256, datasetVerified: v.datasetVerified, codeVersionChanged: !!v.codeVersionChanged, engineCodeSha256: engineCodeSha256(), runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
    if (!reviewerPem) die('REVIEWER_KEY_REQUIRED_FOR_EDGE_EXPORT');
    fs.mkdirSync(OUT, { recursive: true });
    const plainE = Buffer.from(JSON.stringify(exp));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plainE));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plainE));
    fs.writeFileSync(path.join(OUT, 'st-hist-top5.public.json'), JSON.stringify({ schema: 'st-edge-export-public-1.0.0', ...LABEL, receipt: exp.receipt, methods: Object.fromEntries(Object.entries(exp.methods).map(([k, m]) => [k, Object.fromEntries(Object.entries(m.windows).map(([w, x]) => [w, { fills: x.fills.length, fillsSha256: x.fillsSha256 }]))])) }, null, 1) + '\n');
    log('done (edge-export)');
    return;
  }
  const mode = arg('--mode') || 'backtest';
  if (!['backtest', 'rest8'].includes(mode)) die('MODE_INVALID');
  const methods = methodsForMode(mode);
  const result = { schema: 'st-hist-top5-result-1.1.0', ...LABEL, mode, methods, window: { name: L.WINDOW_NAME, ...L.WINDOW }, costLevels: SF6_VALIDATION_PROTOCOL.costLevels, quarantine: { A: qa.census }, population: { A: populationCensus(dsA) }, A: runTop5(qa.ds, { methods, log }) };
  // Sensitivität DQ-K5: dieselben Referenzen ohne Quarantäne (Referenzkosten; Audit nur in den Rahmen A und B)
  if (mode === 'backtest') { result.KK_FID1 = kkFidelityRun(qa.ds, { log }); result.KK_FID1.fid4Verdict = fid4Verdict(result.KK_FID1); }
  result.A_NO_DQK5 = runTop5(dsA, { methods, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF'), audit: false, log });
  if (mode === 'rest8') {
    // C09/C10 aus dem privaten IEX-Cache (nur lesen, 0 Anfragen), auf demselben DQ-K5-Datensatz
    const { createS3DriverFromEnv } = await import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs'));
    const drv = createS3DriverFromEnv(process.env); // derselbe private Eimer wie run-kk-intraday.mjs, nur lesend
    const cache = await loadKkCache((k) => drv.get(pit.mine.seriesPrefix + k));
    if (!Object.keys(cache.minutes).length) die('KK_CACHE_EMPTY', 3);
    const kk = runKkStHist(qa.ds, { cache, costLevels: SF6_VALIDATION_PROTOCOL.costLevels, log });
    result.KK = kk.sealed; result.KK_PUBLIC = kk.pub;
  }
  if (arg('--v13-series') && arg('--v13-raw')) {
    const v13 = S.loadV13Additions({ root: ROOT, seriesDir: arg('--v13-series'), rawDir: arg('--v13-raw') });
    const aCik = new Map(Object.entries(secPit).filter(([, f]) => f && f.cik).map(([k, f]) => [k, String(Number(f.cik))]));
    const chains = v13.chains.map((c) => ({ ...c, cik: String(Number(c.cik)) }));
    const { dsB, addedIds, census } = S.buildUniverseB(dsA, chains, { calendarDates: pit.spyRaw.map((b) => b.date), aCikByListing: aCik });
    const qb = S.applyQuarantine(dsB, { mode: 'DQ-K5-BOOK', addedIds });
    log(`universe B: +${census.added} chains`);
    result.universeB = census; result.quarantine.B = qb.census; result.population.B = populationCensus(dsB);
    result.B = runTop5(qb.ds, { methods, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF'), log });
  }
  result.receipt = { version: ST_HIST_TOP5_VERSION, mode, snapshotId, datasetSha256, datasetVerified: v.datasetVerified, codeVersionChanged: !!v.codeVersionChanged, engineCodeSha256: engineCodeSha256(), runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  result.receipt.resultSha256 = sha({ A: result.A, B: result.B ?? null, A_NO_DQK5: result.A_NO_DQK5, KK: result.KK ?? null });
  if (result.KK) result.receipt.stHistKk = ST_HIST_KK_VERSION;
  const auditPass = auditPassAll({ A: result.A, ...(result.B ? { B: result.B } : {}) });
  result.status = auditPass ? 'COMPLETE' : 'EXECUTION_AUDIT_FAILED';
  fs.mkdirSync(OUT, { recursive: true });
  const plain = Buffer.from(JSON.stringify(result));
  fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plain));
  if (reviewerPem) fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plain));
  fs.writeFileSync(path.join(OUT, 'st-hist-top5.public.json'), JSON.stringify(publicPart(result), null, 1) + '\n');
  // fail closed: ein nicht bestandener Ausführungsaudit macht den Lauf rot; der versiegelte Teil bleibt zur Diagnose
  if (!auditPass) { console.error('EXECUTION_AUDIT_FAILED (Beispiele im versiegelten Teil)'); process.exit(4); }
  log('done');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
