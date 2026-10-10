/* =========================================================================
   VU HISTORICAL STRUCTURAL ACCURACY BENCHMARK (Mission VIII) — Stage 1 Kern

   Fuer jeden Erkennungszeitpunkt t (Bestaetigung eines Pivots der Setup-
   Skala scale-2 — derselbe Ereignisbegriff wie ti-evidence.mjs) wird die
   PRODUKT-Analyse an t gerechnet (TI.analyzeAt, PRODUCT_METHODOLOGY) und
   kompakt eingefroren: was der Kunde gesehen haette (Ausblick, Struktur-
   klarheit, Hauptszenario, Alternative, Elliott-Status) plus die Methoden-
   zustaende fuer die Attribution und die Szenarien der Ablations-Varianten.

   Der Record enthaelt KEINE Information nach t. Outcomes rechnet erst
   Stage 2 (evaluate.mjs) aus den versiegelten Records.

   Varianten: Die teuren Engines (Elliott 3.x) laufen einmal je t; jede
   Variante baut das Szenario mit Sc.build() aus denselben Engine-Ergebnissen,
   nur mit veraenderten Konfluenzgewichten bzw. ohne eine Geometrie-Quelle.
   Selbstpruefung: Die Variante FULL muss bitgleich das Produkt-Hauptszenario
   ergeben (sonst Abbruch fuer diesen Titel: REBUILD_MISMATCH).
   ========================================================================= */
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "../../lib/ti-data.mjs";
import { PRODUCT_METHODOLOGY, clarityOf } from "../../lib/ti-product.mjs";

const require = createRequire(import.meta.url);
const TI = require(join(ROOT, "quant/engines/technical/ti/engine.js"));
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const Sc = require(join(ROOT, "quant/engines/technical/ti/scenario.js"));
const Dow = require(join(ROOT, "quant/engines/technical/ti/dow-trend.js"));
const MV = require(join(ROOT, "quant/engines/technical/ti/momentum-volatility.js"));

export const REPLAY_VERSION = "hsab-replay-1.0.0";
export const SETUP_SCALE = "scale-2";

const FAMS = ["TREND", "MOMENTUM", "STRUCTURE", "HIGHER_TIMEFRAME", "VOLUME", "PATTERN", "ELLIOTT", "WYCKOFF"];
const zeroAllBut = (keep) => Object.fromEntries(FAMS.map((f) => [f, keep.includes(f) ? Sc.DEFAULTS.familyWeights[f] : 0]));
const EMPTY_SR = { supports: [], resistances: [], nearestSupport: null, nearestResistance: null };
const EMPTY_FIB = { levels: [], clusters: [] };

/** Variantenformat im Record: [dir, template, inv, t1, t2, entry, outlook, agreement]. */
export const VFIELDS = ["dir", "tpl", "inv", "t1", "t2", "e", "o", "a"];

/** Ablations-Varianten. w = Gewichtsueberschreibung, x = Eingangsaenderung, cfg = Szenario-Konfiguration. */
export const VARIANTS = {
  FULL: {},
  NO_TREND: { w: { TREND: 0 } },
  NO_MOMENTUM: { w: { MOMENTUM: 0 } },
  NO_STRUCTURE: { w: { STRUCTURE: 0 } },
  NO_HTF: { w: { HIGHER_TIMEFRAME: 0 }, dailyOnly: true },
  NO_VOLUME: { w: { VOLUME: 0 }, x: (x) => ({ volume: Object.assign({}, x.volume, { status: "NO_VOLUME_ABLATED" }) }), dailyOnly: true },
  NO_PATTERN: { w: { PATTERN: 0 }, x: (x) => ({ patterns: Object.assign({}, x.patterns, { active: [], direction: 0 }) }) },
  NO_SR: { x: (x) => ({ levels: { sr: EMPTY_SR, fib: x.levels.fib } }) },
  /* 50 % bleibt (Dow-Halbierungsregel, keine Fibonacci-Zahl); 38,2/61,8, Fib-Cluster und -Extensionen entfallen. */
  NO_FIB: { x: (x) => ({ levels: { sr: x.levels.sr, fib: EMPTY_FIB } }), cfg: { entry: { retracementBand: [] } } },
  NO_ELLIOTT: { x: () => ({ elliott: null }) },
  NO_WYCKOFF: { x: (x) => ({ wyckoff: Object.assign({}, x.wyckoff, { status: "ABLATED" }) }) },
  TREND_ONLY: { w: zeroAllBut(["TREND"]) },
  STRUCTURE_ONLY: { w: zeroAllBut(["STRUCTURE"]) },
  MOMENTUM_ONLY: { w: zeroAllBut(["MOMENTUM"]) },
  TREND_STRUCTURE: { w: zeroAllBut(["TREND", "STRUCTURE"]) },
  TREND_MOMENTUM: { w: zeroAllBut(["TREND", "MOMENTUM"]) },
  STRUCTURE_VOLUME: { w: zeroAllBut(["STRUCTURE", "VOLUME"]), dailyOnly: true },
  TREND_STRUCTURE_VOLUME: { w: zeroAllBut(["TREND", "STRUCTURE", "VOLUME"]), dailyOnly: true }
};

const r4 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
const zone = (z) => (z ? [z.zoneLow, z.zoneHigh] : null);
/** Kompaktes Szenario: alles, was die Outcome-Regeln brauchen, plus Anzeigeattribute. */
export function compact(s) {
  if (!s) return null;
  const dir = s.direction === "BULLISH" ? 1 : s.direction === "BEARISH" ? -1 : 0;
  return { dir, tpl: s.template, st: s.status, e: zone(s.entryZone), inv: s.invalidation ? s.invalidation.price : null, invB: s.invalidation ? s.invalidation.basis : null,
           t1: zone(s.targets && s.targets[0]), t2: zone(s.targets && s.targets[1]), conf: s.confirmation && typeof s.confirmation.price === "number" ? s.confirmation.price : null,
           risk: r4(s.riskAtr), rr: r4(s.rewardRiskT1), es: s.elliottShaped ? 1 : 0, rng: s.range ? [[s.range.support.zoneLow, s.range.support.zoneHigh], [s.range.resistance.zoneLow, s.range.resistance.zoneHigh]] : null };
}

/** Elliott-Richtung (gleiche Formel wie scenario.js elliottDirection, ueber Sc.votes). */
function elliottSummary(E, votes) {
  if (!E || !E.primary) return { st: E ? E.status : null, p: null };
  const p = E.primary;
  return { st: E.status, p: p.pattern, w: p.complete ? "done" : p.currentWave.label, r: p.complete ? "COMPLETE" : p.currentWave.role, motive: /IMPULSE|DIAGONAL/.test(p.pattern) ? 1 : 0,
           app: E.applicability ? E.applicability.level : null, ab: E.applicability && E.applicability.abstain ? 1 : 0, cl: E.clarityLevel || null,
           d: votes.ELLIOTT ? r4(votes.ELLIOTT.d) : 0, key: p.persistenceKey || null, inv: p.invalidation ? p.invalidation.price : null, invDir: p.invalidation ? p.invalidation.direction : null,
           hd: p.rankComponents ? r4(p.rankComponents.higherDegree) : null, cq: p.countQuality ? p.countQuality.level : null,
           alt: E.alternatives && E.alternatives[0] ? { p: E.alternatives[0].pattern, w: E.alternatives[0].complete ? "done" : E.alternatives[0].currentWave.label } : null };
}

function higherFor(P, t, meth) {
  if (!P.weekly) return { available: false, direction: 0 };
  const wi = TI.completedWeek(P.weekly, t);
  if (wi < 60) return { available: false, direction: 0 };
  const wctx = Ctx.at(P.weekly.prep, wi);
  /* Gleiche Formel wie engine.js higherFrom (dort nicht exportiert); die FULL-Selbstpruefung belegt die Gleichheit. */
  const d = Dow.analyze(wctx).direction, m = MV.analyzeMomentum(wctx, "scale-2").direction;
  return { available: d !== 0 || m !== 0, direction: Math.max(-1, Math.min(1, 0.7 * d + 0.3 * m)) };
}

/**
 * Stage-1-Record an t.
 * @returns {object|null}
 */
export function recordAt(P, series, t, meta, opts) {
  opts = opts || {};
  const meth = opts.methodology || PRODUCT_METHODOLOGY;
  const daily = series.timeframe === "1D";
  const res = TI.analyzeAt(P, t, { methodology: meth, skipHigher: !daily, symbol: meta.symbol, elliottPrevious: opts.elliottPrevious || null });
  const M = res.methods;
  const ctx = Ctx.at(P.main, t);
  const x0 = { ctx, dow: M.trend, momentum: M.momentum, volatility: M.volatility, volume: M.volume, levels: { sr: M.supportResistance, fib: M.fibonacci },
               patterns: M.patterns, wyckoff: M.wyckoff, elliott: M.elliott, higher: daily ? higherFor(P, t, meth) : null, evidenceTable: null, timeframe: series.timeframe };
  const votes = Sc.votes(x0);
  const V = {};
  for (const [name, v] of Object.entries(VARIANTS)) {
    if (v.dailyOnly && !daily) continue;
    const x = Object.assign({}, x0, v.x ? v.x(x0) : {});
    const cfg = Object.assign({}, v.cfg || {}, v.w ? { familyWeights: v.w } : {});
    const sc = Sc.build(x, cfg);
    const c = compact(sc.primary);
    V[name] = c ? [c.dir, c.tpl, c.inv, c.t1, c.t2, c.e, sc.outlook, r4(sc.confluence.agreement)] : [null, null, null, null, null, null, sc.outlook, r4(sc.confluence.agreement)];
  }
  const prim = compact(res.primaryScenario);
  const vf = V.FULL;
  if (prim ? !(vf[0] === prim.dir && vf[1] === prim.tpl && vf[2] === prim.inv && JSON.stringify(vf[3]) === JSON.stringify(prim.t1) && JSON.stringify(vf[4]) === JSON.stringify(prim.t2) && JSON.stringify(vf[5]) === JSON.stringify(prim.e)) : vf[0] !== null) throw new Error("REBUILD_MISMATCH at " + series.timestamps[t]);
  const sr = M.supportResistance, atr = ctx.atr, close = ctx.close;
  const pats = (M.patterns.active || []).map((p) => [p.type, p.status, p.direction]);
  return {
    s: meta.symbol, c: meta.cohort, tf: series.timeframe, i: t, d: series.timestamps[t], px: r4(close), atr: r4(atr), n: t + 1,
    o: res.outlook.label, st: res.outlook.structure, cl: clarityOf(res).level, cf: res.confidence.overall, cfs: res.confidence.structural,
    ag: r4(res.confluence.agreement), al: res.confluence.level, mx: res.confluence.mixed ? 1 : 0, cov: r4(res.confluence.coverage),
    sup: res.confluence.supporting, opp: res.confluence.opposing,
    v: Object.fromEntries(Object.entries(votes).filter(([, x]) => x.available).map(([k, x]) => [k, r4(x.d)])),
    vr: res.regime.volatility, tp: res.regime.trendPhase, sg: res.regime.stage, stale: res.dataQuality.stalePriceBars ? 1 : 0,
    hv: res.dataQuality.hasVolume ? 1 : 0, al2: res.timeframes.alignment,
    ew: elliottSummary(M.elliott, votes),
    pat: pats, wy: M.wyckoff ? [M.wyckoff.status || null, M.wyckoff.phase || null, M.wyckoff.schematic || null] : null,
    vol: M.volume ? [M.volume.status, r4(M.volume.direction), (M.volume.anchoredVwap || []).filter((a) => a.anchor === "MAJOR_LOW").map((a) => (a.priceAbove ? 1 : 0))[0] ?? null] : null,
    sr: [sr.nearestSupport ? r4((close - sr.nearestSupport.center) / atr) : null, sr.nearestResistance ? r4((sr.nearestResistance.center - close) / atr) : null,
         sr.nearestSupport ? sr.nearestSupport.strength : null, sr.nearestResistance ? sr.nearestResistance.strength : null],
    fibN: (M.fibonacci.clusters || []).length,
    P: prim, A: compact(res.alternativeScenario), sid: res.primaryScenario ? res.primaryScenario.scenarioId : null,
    V,
    /* nicht serialisiert: Elliott-Vorzustand fuer die naechste Bar (Persistenzkette im Per-Bar-Modus) */
    _state: M.elliott && M.elliott.primary ? { key: M.elliott.primary.persistenceKey, scaleId: M.elliott.degrees.analysis, pivots: M.elliott.primary.persistencePivots } : null
  };
}

/** Erkennungszeitpunkte (kausal: confirmedIndex), ab minBars. */
export function detectionPoints(P, n, minBars) {
  return Array.from(new Set(P.main.pivots.scales[SETUP_SCALE].pivots.map((p) => p.confirmedIndex)))
    .filter((t) => t >= minBars - 1 && t <= n - 1).sort((a, b) => a - b);
}

export function prepareSeries(series) { return TI.prepare(series, { weekly: series.timeframe === "1D" }); }
