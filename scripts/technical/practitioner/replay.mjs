/* Practitioner Reference Benchmark — blinde VU-Wiedergabe (Protokoll §10).

   VU sieht NUR die eigene Kursreihe bis analysisCutoff (kausal, wie im Produkt), keine Praktikerangaben, keine spaeteren Kurse.
     • Eingang ist ausschliesslich eine PROJEKTION der Referenz (replayProjection): referenceId, vuSymbol, seriesSource, market,
       timeframe, analysisCutoff. Jedes weitere Feld → Fehler (assertProjection). Damit kann die Wiedergabe Praktikerfelder
       (Zaehlung, Richtung, Niveaus …) gar nicht lesen.
     • Reihe wird auf Bars <= analysisCutoff gekuerzt (Wochen: nur abgeschlossene Wochen); vor dem Engine-Lauf wird geprueft,
       dass kein spaeterer Bar uebergeben wird (LEAKAGE-Fehler).
     • Engine elliott-3.2.2 (eingefroren). Abweichende ENGINE_VERSION → Abbruch, ausser die erwartete Version wird explizit
       angegeben (--engine-version).
     • Ausgabe nur VU-seitige strukturierte Felder.
   Dynamik (optional, getrennt gekennzeichnet): Trajektorie der VU-Lesart an Stichtagen um analysisCutoff (jeder Lauf kausal bis
   zu SEINEM Datum; Laeufe nach dem Stichtag nutzen also spaetere Daten und dienen nur Neuzuordnungsrate/Erkennungslatenz). */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, degreeRankFromDays, daysBetween, normalizeWaveLabel, round, vuEffectiveRole } from "./lib.mjs";
import { lastCompleteWeekEnd, weekKey } from "./cutoff.mjs";

const require = createRequire(import.meta.url);
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const PAT = require(join(ROOT, "quant/engines/technical/elliott/patterns.js"));

export const EXPECTED_ENGINE_VERSION = "elliott-3.2.2";
export const ENGINE_VERSION = EV3.ENGINE_VERSION;
export const PROJECTION_KEYS = Object.freeze(["referenceId", "vuSymbol", "seriesSource", "market", "timeframe", "analysisCutoff"]);
export const MIN_BARS = Object.freeze({ "1D": 200, "1W": 150 });
const TF_MAP = { "1D": "1D", "1W": "1W", "1M": "1W" };   // Monatscharts auf Wochenbasis (dokumentierte Naeherung)

export function checkEngineVersion(expected = EXPECTED_ENGINE_VERSION) {
  if (EV3.ENGINE_VERSION !== expected) throw new Error(`Engine ${EV3.ENGINE_VERSION} ≠ eingefroren erwartet ${expected} – Abbruch (bewusst andere Version: --engine-version ${EV3.ENGINE_VERSION})`);
  return EV3.ENGINE_VERSION;
}

/** Einzige Schnittstelle Referenz → Wiedergabe. mapping aus lib.effectiveMapping (VU-seitig). */
export function replayProjection(ref, mapping) {
  return Object.freeze({ referenceId: ref.referenceId, vuSymbol: mapping.vuSymbol, seriesSource: mapping.seriesSource, market: mapping.market,
                         timeframe: ref.timeframe, analysisCutoff: ref.analysisCutoff });
}
export function assertProjection(p) {
  const keys = Object.keys(p || {}).sort(), want = PROJECTION_KEYS.slice().sort();
  if (keys.join("|") !== want.join("|")) throw new Error(`Replay-Eingang muss genau ${want.join(", ")} enthalten – erhalten: ${keys.join(", ")} (keine Praktikerfelder!)`);
  return p;
}

// ------------------------------------------------------------------ Daten
const cache = new Map();
/** Standard-Lader: [[date, close], …] aufsteigend, nur positive Schluesse. grain 'daily' | 'weekly'. */
export function defaultLoader(vuSymbol, seriesSource, grain) {
  const k = `${seriesSource}|${vuSymbol}|${grain}`;
  if (cache.has(k)) return cache.get(k);
  let p;
  if (seriesSource === "multi-asset") p = join(ROOT, "quant/data/market/multi-asset/series", vuSymbol + ".json");
  else if (seriesSource === "us-stock") p = join(ROOT, grain === "weekly" ? "quant/data/market/discover-series-long" : "quant/data/market/discover-series", "ref_" + vuSymbol + ".json");
  else throw new Error("unbekannte Reihenquelle " + seriesSource);
  if (!existsSync(p)) { cache.set(k, null); return null; }
  const pts = (JSON.parse(readFileSync(p, "utf8")).points || []).filter((x) => Array.isArray(x) && Number.isFinite(x[1]) && x[1] > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  cache.set(k, pts);
  return pts;
}
/** Wochenschluesse aus Tagesschluessen: letzter Tag je Mo–So-Woche (Datum = letzter Handelstag der Woche). Bei Maerkten mit
    sundayOpensWeek (Tiingo-Metalle) gehoert der Sonntagsbar zur FOLGEwoche – sonst ersetzte er nachtraeglich den Freitagsschluss. */
export function weeklyFromDaily(points, market = null) {
  const m = new Map();
  for (const p of points) m.set(weekKey(p[0], market), p);
  return [...m.values()];
}
/**
 * Bars fuer die Wiedergabe bis einschliesslich `until` (Datum). Wochen: nur bis lastCompleteWeekEnd(until).
 * Liefert {tf, bars, limit}; wirft bei nicht rekonstruierbarem Zeitrahmen.
 */
export function barsUntil(p, until, loader = defaultLoader) {
  const tf = TF_MAP[p.timeframe];
  if (!tf) { const e = new Error(`Zeitrahmen ${p.timeframe} nicht rekonstruierbar`); e.code = "NOT_REPRODUCIBLE"; throw e; }
  const limit = tf === "1W" ? lastCompleteWeekEnd(until, p.market) : until;
  let bars;
  if (tf === "1W" && p.seriesSource === "us-stock") bars = (loader(p.vuSymbol, p.seriesSource, "weekly") || []).filter((x) => x[0] <= limit);
  else {
    const d = (loader(p.vuSymbol, p.seriesSource, "daily") || []).filter((x) => x[0] <= limit);
    bars = tf === "1W" ? weeklyFromDaily(d, p.market) : d;
  }
  return { tf, bars, limit };
}
export function assertNoLeak(bars, limit) {
  for (const b of bars) if (!(b[0] <= limit)) throw new Error(`LEAKAGE: Bar ${b[0]} nach Stichtag ${limit} an die Engine uebergeben`);
}
function toSeries(bars, tf, id) {
  return Canonical.fromRows(bars.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null })),
    { instrumentId: id || "X", exchange: "X", currency: "USD", timeframe: tf, priceSeriesType: "SPLIT_ADJUSTED", source: "practitioner-replay", meta: { closeOnly: true } });
}
/** ATR auf Schlussbasis (Reihen sind Close-only): Mittel |ΔClose| der letzten n Bars. */
export function atrClose(bars, n = 14) {
  if (bars.length < 2) return null;
  const k = Math.min(n, bars.length - 1); let s = 0;
  for (let i = bars.length - k; i < bars.length; i++) s += Math.abs(bars[i][1] - bars[i - 1][1]);
  return s / k;
}

// ------------------------------------------------------------------ Engine
export function runEngine(bars, tf, previous = null) {
  const s = toSeries(bars, tf), P = Ctx.prepare(s);
  return EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: tf === "1W" ? 52 : 252, previous });
}
/** VU-Grad (NAEHERUNG): mediane Dauer der bestaetigten Wellen → degreeRank (lib.degreeRankFromDays). */
export function vuDegree(count) {
  const ds = (count.waves || []).filter((w) => w.status !== "DEVELOPING" && w.fromTime && w.toTime).map((w) => daysBetween(w.fromTime, w.toTime)).filter((d) => d > 0).sort((a, b) => a - b);
  const med = ds.length ? ds[Math.floor(ds.length / 2)] : null;
  return { rank: degreeRankFromDays(med), medianWaveDays: med, belowScale: Number.isFinite(med) && med < 3, approximate: true,
           basis: "mediane Dauer bestaetigter Wellen (Kalendertage) → Rang 0..5, Schwellen 14/60/180/730/3650 T" };
}
function summarizeCount(c) {
  if (!c) return null;
  const labels = PAT.PATTERNS[c.pattern] ? PAT.PATTERNS[c.pattern].labels : [];
  const last = c.waves && c.waves.length ? c.waves[c.waves.length - 1] : null;
  return {
    pattern: c.pattern, family: c.family, direction: c.direction, impliedTrend: c.impliedTrend, complete: !!c.complete,
    currentWave: { label: c.currentWave.label, normLabel: c.complete ? normalizeWaveLabel(labels[labels.length - 1]) : normalizeWaveLabel(c.currentWave.label),
                   role: c.currentWave.role, direction: c.currentWave.direction },
    nextMove: c.nextMove,
    invalidation: c.invalidation ? { price: c.invalidation.price, direction: c.invalidation.direction || null, kind: c.invalidation.kind || null } : null,
    revision: c.revision ? { price: c.revision.price, direction: c.revision.direction || null } : null,
    targets: ((c.projection && c.projection.zones) || []).filter((z) => z.kind === "TARGET").map((z) => ({ low: z.zoneLow, high: z.zoneHigh, center: z.center, phase: z.phase || null, weight: z.weight })),
    waves: (c.waves || []).map((w) => ({ label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status })),
    spanStart: c.waves && c.waves[0] ? c.waves[0].fromTime : null, spanEnd: last ? last.toTime : null,
    persistenceKey: c.persistenceKey || null, degree: vuDegree(c)
  };
}
/** Nur VU-seitige, strukturierte Felder. */
export function summarizeVu(r) {
  const hd = r.higherDegree;
  let higher = null;
  if (hd) {
    const labs = PAT.PATTERNS[hd.pattern] ? PAT.PATTERNS[hd.pattern].labels : [];
    const k = labs.indexOf(hd.containsPrimaryAsWave);
    higher = { pattern: hd.pattern, currentLabel: hd.current.label, role: hd.current.role, direction: hd.current.direction > 0 ? "UP" : hd.current.direction < 0 ? "DOWN" : null,
               containsPrimaryAsWave: hd.containsPrimaryAsWave, nextLabel: k >= 0 && k + 1 < labs.length ? normalizeWaveLabel(labs[k + 1]) : null };
  }
  const appl = r.applicability || {};
  return { engineVersion: r.engineVersion, status: r.status, reason: r.reason || null, hasCount: !!r.primary,
           applicability: { level: appl.level || "LOW", score: appl.score ?? null, abstain: appl.abstain !== false },
           primary: summarizeCount(r.primary), alternatives: (r.alternatives || []).map(summarizeCount), higherDegree: higher,
           structuralLevel: r.structuralLevel || null, clarityLevel: r.clarityLevel || null, ambiguityKind: r.ambiguity ? r.ambiguity.kind : null, engineAtr: r.atr ?? null };
}

// ------------------------------------------------------------------ Wiedergabe
/**
 * Ein Fall. opts: loader, expectedEngine, dynamics {before, after} (Bars).
 * Rueckgabe enthaelt nur die Projektion + VU-Felder + Marktkontext (Schluss, ATR) am Stichtag.
 */
export function replayOne(projection, opts = {}) {
  const p = assertProjection(projection), loader = opts.loader || defaultLoader;
  checkEngineVersion(opts.expectedEngine || EXPECTED_ENGINE_VERSION);
  const base = { projection: Object.assign({}, p), engineVersion: EV3.ENGINE_VERSION };
  if (!p.vuSymbol) return Object.assign(base, { status: "UNMAPPED" });
  let built;
  try { built = barsUntil(p, p.analysisCutoff, loader); } catch (e) { if (e.code === "NOT_REPRODUCIBLE") return Object.assign(base, { status: "NOT_REPRODUCIBLE", detail: e.message }); throw e; }
  const { tf, bars, limit } = built;
  assertNoLeak(bars, limit);
  if (bars.length < MIN_BARS[tf]) return Object.assign(base, { status: "INSUFFICIENT_DATA", timeframeUsed: tf, barsUsed: bars.length, detail: `< ${MIN_BARS[tf]} Bars bis ${limit}` });
  const r = runEngine(bars, tf);
  const out = Object.assign(base, {
    status: "OK", timeframeUsed: tf, barsUsed: bars.length, lastBarDate: bars[bars.length - 1][0], barLimit: limit,
    market: { closeAtCutoff: bars[bars.length - 1][1], atr14Close: round(atrClose(bars), 6), atrBasis: "Mittel |ΔClose| 14 Bars (Close-only)" },
    vu: summarizeVu(r)
  });
  if (opts.dynamics && (opts.dynamics.before > 0 || opts.dynamics.after > 0)) out.dynamics = trajectory(p, tf, loader, opts.dynamics, bars[bars.length - 1][0]);
  return out;
}
/** Trajektorie der Lesart an Bars [cutoff−before … cutoff+after]; jeder Lauf kausal bis zu seinem Datum, Persistenz verkettet. */
function trajectory(p, tf, loader, { before = 0, after = 0 }, cutoffBarDate) {
  const all = barsUntil(p, "9999-12-31", loader);
  let full = all.bars;
  if (tf === "1W" && full.length) { const lw = lastCompleteWeekEnd(full[full.length - 1][0], p.market); full = full.filter((x) => x[0] <= lw); }
  const ci = full.findIndex((x) => x[0] === cutoffBarDate);
  if (ci < 0) return { status: "UNAVAILABLE" };
  const from = Math.max(MIN_BARS[tf] - 1, ci - before), to = Math.min(full.length - 1, ci + after);
  const pts = []; let prev = null;
  for (let i = from; i <= to; i++) {
    const r = runEngine(full.slice(0, i + 1), tf, prev);
    const c = r.primary, v = summarizeVu(r), sc = v.primary;
    prev = c ? { key: c.persistenceKey, pivots: c.persistencePivots } : null;
    pts.push({ date: full[i][0], offsetBars: i - ci, key: c ? c.persistenceKey : null, pattern: sc ? sc.pattern : null, family: sc ? sc.family : null, complete: sc ? sc.complete : null,
               currentMove: sc ? sc.currentWave.direction : null, nextMove: sc ? sc.nextMove : null, role: sc ? vuEffectiveRole(sc, v.higherDegree) : null, impliedTrend: sc ? sc.impliedTrend : null, abstain: v.applicability.abstain });
  }
  return { status: "OK", usesPostCutoffData: pts.some((x) => x.offsetBars > 0), before, after, points: pts };
}
export function replayAll(projections, opts = {}) { return projections.map((p) => replayOne(p, opts)); }
