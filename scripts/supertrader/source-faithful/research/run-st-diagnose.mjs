#!/usr/bin/env node
/**
 * Supertrader Diagnose (27.11.2026): Warum verlieren C01, C02, C03, C08 und C13 im historischen Test fast jedes Jahr?
 * Forschung, nicht zertifiziert. Ändert keine Methode, keine Engine und keine Referenz: alle Läufe gehen durch die
 * unveränderten Engines (methods/turtle.mjs, research/lifecycle-engine.mjs), nur mit anderen Einstellungen, die die
 * Engines schon kennen, oder mit einem Adapter-Wrapper, der Signale vorab auswählt.
 *
 * Je Methode ein kumulativer Wasserfall auf dem DEV-Snapshot (2016-01-04 bis 2026-09-30, DQ-K5 wie die Referenz):
 *   D0_REF         die Referenz wie im Top-5-Lauf (10 bp Slippage je Seite, 1 bp Gebühr, Intrabar PESSIMISTIC)
 *   D1_COST_LOW    günstiger Broker auf liquiden Werten: 3 bp Slippage, 1 bp Gebühr (1 € auf 10.000 €)
 *   D2_INTRABAR    + Kauf und Stopp auf derselben Tageskerze nicht mehr immer zum Schlechteren
 *                  (Turtle OPTIMISTIC_CERTAIN_RULE, übrige OPTIMISTIC); Obergrenze dessen, was Minutendaten zeigen könnten
 *   D3_SELECTION   + Turtle: Einheit mit 0,25 % statt 1 % Risiko (Aktien ohne Hebel, VU-Anpassung);
 *                    übrige: je Tag nur die 5 stärksten Signale (126-Tage-Rendite) statt Auswahl per Hash
 * TraderFox-Block (wie dort gerechnet, auf D3 aufbauend, kumulativ):
 *   T1_SURVIVORS   nur heute noch notierte Titel (keine Delistings, keine Datenlücken)
 *   T2_TOP1000_NOW + nur die 1.000 umsatzstärksten Titel am Ende des Fensters (Auswahl mit heutigem Wissen)
 *   T3_COST_ZERO   + keine Slippage, keine Gebühr (2 $ je Trade sind bei 10.000 $ unter 1 bp)
 *   T4_BEST_VARIANT+ die beste der registrierten Varianten der Methode, nachträglich nach CAGR gewählt
 *
 *   node scripts/supertrader/source-faithful/research/run-st-diagnose.mjs --snapshot sts1-<id> --out <dir außerhalb> \
 *     --reviewer-key <pem> [--methods TURTLE_S1,DARVAS,...] [--allow-code-version-change]
 *
 * Ausgabe nur nach --out: st-hist-top5.public.json (Zählungen, keine Renditezahl) und st-hist-top5.sealed.<owner|reviewer>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { runTurtle, PARAMS as TURTLE_PARAMS } from '../methods/turtle.mjs';
import { fin, eligibleAtPriorSession, RESEARCH_UNIVERSE } from '../common/series.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';
import { runResearchLifecycle, prepareAll, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from './lifecycle-engine.mjs';
import { summarizeRun, LABEL } from './run-st-hist-top5.mjs';
import * as S from './st9-v13-delisted-study.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const ST_DIAGNOSE_VERSION = 'st-diagnose-1.0.0';
export const DIAG_METHODS = Object.freeze(['TURTLE_S1', 'TURTLE_S2', 'DARVAS', 'KK_BREAKOUT', 'HOLY_GRAIL_W_RAS97', 'BUYABLE_GAP_UP', 'WEINSTEIN_INVESTOR']);
export const COSTS = Object.freeze({ REF: Object.freeze({ slippageBps: 10, commissionBps: 1 }), LOW: Object.freeze({ slippageBps: 3, commissionBps: 1 }), ZERO: Object.freeze({ slippageBps: 0, commissionBps: 0 }) });
export const SELECTION = Object.freeze({ topK: 5, lookback: 126, rule: 'je Handelstag nur die topK Signale mit der höchsten Rendite über lookback Sitzungen bis zum Signalschluss (kausal)' });
export const TURTLE_STOCK_RISK = 0.0025;
export const TOP_NOW = Object.freeze({ count: 1000, sessions: 60 });
export const MAX_VARIANTS = 8;
export const STEPS = Object.freeze(['D0_REF', 'D1_COST_LOW', 'D2_INTRABAR', 'D3_SELECTION', 'T1_SURVIVORS', 'T2_TOP1000_NOW', 'T3_COST_ZERO', 'T4_BEST_VARIANT']);
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const argOf = (argv) => (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/** Nur heute noch notierte Titel: Segmente ohne Endereignis im Fenster (kein Delisting, keine Datenlücke). */
export function survivorsOnly(ds) {
  return { ...ds, securities: ds.securities.filter((s) => !s.terminal) };
}
/** Die count umsatzstärksten Titel am Fensterende (Mittel aus Rohkurs x Rohvolumen der letzten sessions Sitzungen bis to). */
export function topByDollarVolumeAtEnd(ds, { to, count = TOP_NOW.count, sessions = TOP_NOW.sessions } = {}) {
  const rows = [];
  for (const s of ds.securities) {
    let j = s.bars.length - 1; while (j >= 0 && to && s.bars[j].date > to) j--;
    let sum = 0, n = 0;
    for (let k = j; k >= 0 && k > j - sessions; k--) { const b = s.bars[k], v = (b.rawClose ?? b.close) * (b.rawVolume ?? b.volume); if (Number.isFinite(v)) { sum += v; n++; } }
    if (n) rows.push([s.id, sum / n]);
  }
  const keep = new Set(rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, count).map((r) => r[0]));
  return { ...ds, securities: ds.securities.filter((s) => keep.has(s.id)) };
}
/** Umschlag p. a.: Kaufvolumen / mittleres Kapital / Jahre; Kostenanteil p. a. = gezahlte Kosten / mittleres Kapital / Jahre. */
export function turnover(run) {
  const curve = run.curve || [];
  if (curve.length < 2) return { turnoverPerYear: null, costsPerYearOfEquity: null };
  const avg = curve.reduce((a, p) => a + p.equity, 0) / curve.length, years = (Date.parse(curve.at(-1).date) - Date.parse(curve[0].date)) / (365.25 * 864e5);
  const buys = (run.ledger || []).filter((r) => r.side === 'BUY').reduce((a, r) => a + (r.gross || 0), 0);
  return { turnoverPerYear: avg > 0 && years > 0 ? buys / avg / years : null, costsPerYearOfEquity: avg > 0 && years > 0 ? (run.counts?.costs ?? 0) / avg / years : null };
}
/**
 * Auswahl nach Stärke ohne Eingriff in die Engine: ein Wrapper um den Adapter, der an jedem Tag nur die topK Signale
 * mit der höchsten Rendite über lookback Sitzungen weitergibt. Grundlage sind dieselben Setups und dieselbe
 * Zulässigkeit (Stopp, Order) wie in der Referenz; der Forschungsuniversums-Filter wird wie in der Engine angewandt.
 */
export function rankedAdapter(inner, ds, cfg, prepared, { topK = SELECTION.topK, lookback = SELECTION.lookback, universe = RESEARCH_UNIVERSE } = {}) {
  const idOf = new Map(), byDate = new Map();
  for (const s of ds.securities) {
    const ctx = prepared.get(s.id); if (!ctx) continue;
    idOf.set(ctx, s);
    for (let i = 0; i < s.bars.length; i++) {
      const setup = inner.signalAt(ctx, i, cfg); if (!setup) continue;
      const el = inner.eligibility({ ctx, setup, bars: s.bars, i, cfg });
      if (!el.order || (el.blockers && el.blockers.length)) continue;
      if (!eligibleAtPriorSession(s.bars, el.order.type === 'ON_CLOSE' || inner.closeEntry?.(cfg) ? i : i + 1, universe)) continue;
      const c = s.bars[i].close, c0 = i - lookback >= 0 ? s.bars[i - lookback].close : null;
      const strength = fin(c) && fin(c0) && c0 > 0 ? c / c0 - 1 : -Infinity;
      const d = s.bars[i].date; (byDate.get(d) || byDate.set(d, []).get(d)).push([s.id, strength]);
    }
  }
  const sel = new Map();
  for (const [d, rows] of byDate) sel.set(d, new Set(rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, topK).map((r) => r[0])));
  return {
    ...inner, version: `${inner.version}+ranked-${topK}-${lookback}`,
    signalAt(ctx, i, c) {
      const st = inner.signalAt(ctx, i, c); if (!st) return null;
      const sec = idOf.get(ctx), d = sec?.bars[i]?.date;
      return sec && sel.get(d)?.has(sec.id) ? st : null;
    },
  };
}

const variantConfig = (lc, v) => v.config ?? { ...lc.variants.find((x) => x.id === 'REF').config, ...v.changes };
const pick = (x, run) => ({ trades: x.trades, closedTrades: x.closedTrades, hitRate: x.hitRate, totalReturn: x.totalReturn, cagr: x.cagr, maxDrawdown: x.maxDrawdown, sharpe: x.sharpe, spyCagr: x.spyCagr, spyDistance: x.spyDistance, costsPaid: x.costsPaid, exposure: x.exposure, medianHoldingSessions: x.medianHoldingSessions, annualReturns: x.annualReturns, ...turnover(run), reconciliation: run.reconciliation?.pass ?? null });

function turtleRun(ds, system, window, { costs, entryBarOrder = 'PESSIMISTIC', P = TURTLE_PARAMS, openBreakout = 'SKIP', failsafeExit = '10D' }) {
  const r = runTurtle(ds, { system, from: window.from, to: window.to, scenario: 'S0_LAST_PRICE', slippageBps: costs.slippageBps, commissionBps: costs.commissionBps, entryBarOrder, P, openBreakout, failsafeExit });
  const x = summarizeRun({ run: r, trades: r.positionTrades.map((t) => ({ status: 'CLOSED', pnl: t.pnl })), metricTrades: r.positionTrades }, ds);
  return pick(x, r);
}
function lifecycleRun(ds, lc, window, { costs, config, prepared, ranked }) {
  const adapter = ranked ? rankedAdapter(lc.adapter, ds, config, prepared) : lc.adapter;
  const r = runResearchLifecycle(ds, { adapter, config, policy: { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, ...costs }, prepared, from: window.from, to: window.to });
  const x = summarizeRun({ run: r, trades: r.trades, metricTrades: r.trades.filter((t) => t.status === 'CLOSED') }, ds);
  return pick(x, r);
}
const subset = (prepared, ds) => new Map(ds.securities.filter((s) => prepared.has(s.id)).map((s) => [s.id, prepared.get(s.id)]));

/** Wasserfall einer Methode. Jeder Schritt ist ein eigener Lauf ab Startkapital. */
export function diagnoseMethod(ds, key, { window = L.WINDOW, log = () => {} } = {}) {
  const steps = {}, note = (id, v) => { steps[id] = v; log(`${key} ${id}: ${v.trades ?? v.best?.trades ?? 0} trades`); };
  const surv = survivorsOnly(ds), top = topByDollarVolumeAtEnd(surv, { to: window.to });
  const population = { all: ds.securities.length, survivors: surv.securities.length, top1000Now: top.securities.length };
  if (key === 'TURTLE_S1' || key === 'TURTLE_S2') {
    const system = key === 'TURTLE_S1' ? 'S1' : 'S2', P3 = { ...TURTLE_PARAMS, unitRiskFraction: TURTLE_STOCK_RISK }, opt = 'OPTIMISTIC_CERTAIN_RULE';
    note('D0_REF', turtleRun(ds, system, window, { costs: COSTS.REF }));
    note('D1_COST_LOW', turtleRun(ds, system, window, { costs: COSTS.LOW }));
    note('D2_INTRABAR', turtleRun(ds, system, window, { costs: COSTS.LOW, entryBarOrder: opt }));
    note('D3_SELECTION', turtleRun(ds, system, window, { costs: COSTS.LOW, entryBarOrder: opt, P: P3 }));
    note('T1_SURVIVORS', turtleRun(surv, system, window, { costs: COSTS.LOW, entryBarOrder: opt, P: P3 }));
    note('T2_TOP1000_NOW', turtleRun(top, system, window, { costs: COSTS.LOW, entryBarOrder: opt, P: P3 }));
    note('T3_COST_ZERO', turtleRun(top, system, window, { costs: COSTS.ZERO, entryBarOrder: opt, P: P3 }));
    const variants = [
      ['UNIT_RISK_0005', { P: { ...TURTLE_PARAMS, unitRiskFraction: 0.005 } }], ['UNIT_RISK_001', { P: TURTLE_PARAMS }], ['ENTRY_BAR_OPTIMISTIC', { entryBarOrder: 'OPTIMISTIC' }],
      ...(system === 'S1' ? [['OPEN_BREAKOUT_TAKE', { openBreakout: 'TAKE' }], ['FAILSAFE_EXIT_20D', { failsafeExit: '20D' }]] : []),
    ];
    const all = variants.map(([id, o]) => [id, turtleRun(top, system, window, { costs: COSTS.ZERO, entryBarOrder: opt, P: P3, ...o })]);
    note('T4_BEST_VARIANT', bestOf(all, steps.T3_COST_ZERO));
    return { key, kind: 'TURTLE', population, steps, settings: { turtleStockRisk: TURTLE_STOCK_RISK, entryBarOrderD2: opt } };
  }
  const lc = SF5_LIFECYCLES.find((x) => x.key === key);
  if (!lc) throw new Error(`UNKNOWN_METHOD ${key}`);
  const ref = variantConfig(lc, { id: 'REF', changes: {} }), opt = { ...ref, intrabarOrder: 'OPTIMISTIC' };
  const prepRef = prepareAll(ds, lc.adapter, ref), prepOpt = prepareAll(ds, lc.adapter, opt);
  note('D0_REF', lifecycleRun(ds, lc, window, { costs: COSTS.REF, config: ref, prepared: prepRef }));
  note('D1_COST_LOW', lifecycleRun(ds, lc, window, { costs: COSTS.LOW, config: ref, prepared: prepRef }));
  note('D2_INTRABAR', lifecycleRun(ds, lc, window, { costs: COSTS.LOW, config: opt, prepared: prepOpt }));
  note('D3_SELECTION', lifecycleRun(ds, lc, window, { costs: COSTS.LOW, config: opt, prepared: prepOpt, ranked: true }));
  note('T1_SURVIVORS', lifecycleRun(surv, lc, window, { costs: COSTS.LOW, config: opt, prepared: subset(prepOpt, surv), ranked: true }));
  note('T2_TOP1000_NOW', lifecycleRun(top, lc, window, { costs: COSTS.LOW, config: opt, prepared: subset(prepOpt, top), ranked: true }));
  note('T3_COST_ZERO', lifecycleRun(top, lc, window, { costs: COSTS.ZERO, config: opt, prepared: subset(prepOpt, top), ranked: true }));
  const all = [];
  for (const v of lc.variants.filter((x) => x.id !== 'REF').slice(0, MAX_VARIANTS)) {
    const cfg = { ...variantConfig(lc, v), intrabarOrder: 'OPTIMISTIC' };
    try { all.push([v.id, lifecycleRun(top, lc, window, { costs: COSTS.ZERO, config: cfg, prepared: prepareAll(top, lc.adapter, cfg), ranked: true })]); }
    catch (e) { all.push([v.id, { skipped: String(e.message || e).slice(0, 120) }]); }
  }
  note('T4_BEST_VARIANT', bestOf(all, steps.T3_COST_ZERO));
  return { key, kind: 'LIFECYCLE', candidateId: lc.candidateId, population, steps, settings: { selection: SELECTION } };
}
/** Beste Variante nach CAGR, nachträglich gewählt (genau das, was ein Nutzer mit vielen Versuchen tut). */
export function bestOf(all, base) {
  const ok = all.filter(([, r]) => Number.isFinite(r.cagr));
  const best = ok.reduce((a, b) => (b[1].cagr > a[1].cagr ? b : a), ['T3_COST_ZERO', base]);
  return { ...best[1], chosenVariant: best[0], tried: all.length + 1, variants: Object.fromEntries(all.map(([id, r]) => [id, r.skipped ? r : { cagr: r.cagr, maxDrawdown: r.maxDrawdown, trades: r.trades }])) };
}

export function publicPart(result) {
  return { schema: 'st-diagnose-public-1.0.0', ...LABEL, receipt: result.receipt, methods: Object.fromEntries(Object.entries(result.methods).map(([k, m]) => [k, { population: m.population, steps: Object.fromEntries(Object.entries(m.steps).map(([s, x]) => [s, { trades: x.trades ?? null }])) }])) };
}

async function main() {
  const argv = process.argv.slice(2), arg = argOf(argv), die = (c, n = 2) => { console.error(c); process.exit(n); };
  if (L.WINDOW_NAME !== 'DEV') die('HOLDOUT_NOT_PERMITTED');
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) die('SNAPSHOT_REQUIRED');
  const OUT = S.assertOutsideRepo(arg('--out'), ROOT);
  const reviewerPem = arg('--reviewer-key') ? fs.readFileSync(arg('--reviewer-key'), 'utf8') : null;
  if (!reviewerPem || !/BEGIN PUBLIC KEY/.test(reviewerPem)) die('REVIEWER_KEY_REQUIRED');
  const methods = (arg('--methods') || DIAG_METHODS.join(',')).split(',').filter(Boolean);
  for (const m of methods) if (!DIAG_METHODS.includes(m)) die(`METHOD_INVALID ${m}`);
  const t0 = Date.now(), log = (m) => console.log(`[st-hist-top5 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
  const { createSnapshotStore } = await import('../../snapshot/store.mjs');
  const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
  const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke: false }), snapshotId, requireRestoreReceipt: true });
  const pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
  const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
  if (v.codeVersionChanged && !(argv.includes('--allow-code-version-change') && v.datasetVerified === 'EXACT')) die('INPUT_INTEGRITY_FAILURE: CODE_VERSION_CHANGED', 3);
  const buf = await (await opened.io.createDriver()).get(pit.mine.seriesPrefix + '_validation/sec-pit-r12.json.gz');
  if (!buf || !buf.length) die('SEC_PIT_MISSING', 3);
  const ds0 = datasetFromPit(pit); attachSecPit(ds0, JSON.parse(zlib.gunzipSync(buf).toString('utf8')));
  const qa = S.applyQuarantine(ds0, { mode: 'DQ-K5-BOOK' });
  log(`universe A: ${ds0.securities.length} segments`);
  const result = { schema: 'st-diagnose-result-1.0.0', ...LABEL, window: { name: L.WINDOW_NAME, ...L.WINDOW }, costs: COSTS, steps: STEPS, quarantine: qa.census, methods: {} };
  for (const key of methods) result.methods[key] = diagnoseMethod(qa.ds, key, { log });
  result.receipt = { version: ST_DIAGNOSE_VERSION, snapshotId, datasetSha256: K.sha256(K.canonicalJson(v.dataset)), datasetVerified: v.datasetVerified, codeVersionChanged: !!v.codeVersionChanged, methods, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  result.receipt.resultSha256 = sha(result.methods);
  fs.mkdirSync(OUT, { recursive: true });
  const plain = Buffer.from(JSON.stringify(result));
  fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plain));
  fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plain));
  fs.writeFileSync(path.join(OUT, 'st-hist-top5.public.json'), JSON.stringify(publicPart(result), null, 1) + '\n');
  log('done');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
