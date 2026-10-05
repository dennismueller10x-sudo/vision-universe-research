#!/usr/bin/env node
/* CLOSE-ONLY vs. OHLC (Mission VI §20–§21, §71–§73) — dieselbe Engine elliott-3.2.2, nur der Eingang aendert sich.

   node scripts/technical/elliott-forensics/ohlc-experiment.mjs [--ohlc-dir DIR] [--out FILE] [--production-only]

   Modi je Fall (geoeffnete Practitioner-Faelle DEVELOPMENT/VALIDATION; Holdouts versiegelt):
     A0  Replay-Bars wie im blinden Benchmark (Produktionseingang, Close-only)
     A   Close-only aus den OHLC-Zeilen, gleicher Zeitrahmen (Konsistenzpruefung gegen A0)
     B   HL-Pfad (Monowellen: Hoch/Tief je Bar), gleicher Zeitrahmen
     C   nur Wochenfaelle: Tages-Schlusskurse (Aufloesung statt Extreme)
     D   nur Wochenfaelle: Tages-HL-Pfad
   OHLC-Quelle: --ohlc-dir/<SYMBOL>.json ({ kind: "equity"|"crypto", bars: [...] }, runner-privat, Tiingo) oder lokal
   golden-preview (fuenf Titel). Ausgabe: nur Kategorien/Raenge/Kennzahlen — KEINE Kurse (Datenhygiene).
   Produktionstitel (§71): je Titel und Stichtag A vs. B (Tag und Woche) — Regressionsmatrix §72, Laufzeit §73. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { openedCases, practitionerClass, caseBars, runV3, candidateReadings, sourceFamilyOf, ROOT, EV3, PAT } from "./lib.mjs";
import { splitAdjustedRows, plainRows, weeklyOHLC, hlPath, seriesOf } from "./ohlc.mjs";

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const OHLC_DIR = arg("ohlc-dir", null);
const OUT = arg("out", join(ROOT, "quant/data/technical-intelligence/elliott-forensics/ohlc-experiment.json"));
const ENGINE = arg("max-nodes", null) ? { maxNodes: +arg("max-nodes") } : {};   // gleiches Suchbudget fuer alle Modi (HL-Pfad verdoppelt die Punkte)
export const PRODUCTION_NAMES = { AAPL: "large cap, Trend", MSFT: "large cap, Trend", JPM: "large cap, Zyklus", XOM: "large cap, Seitwaerts/Zyklus", NVDA: "Wachstum, volatil, Split 2021/2024",
  KO: "Seitwaerts", AMZN: "Split 2022", TSLA: "volatil, Splits", GME: "Gaps", PLUG: "small cap, volatil", F: "Seitwaerts, Zyklus", AMD: "Wachstum, volatil" };
export const PRODUCTION_ASOF = ["2019-12-31", "2021-12-31", "2023-06-30", "2025-08-29"];

export function loadOHLC(sym) {
  const f = OHLC_DIR && join(OHLC_DIR, sym + ".json");
  if (f && existsSync(f)) { const j = JSON.parse(readFileSync(f, "utf8")); return { source: "TIINGO_RUNNER_PRIVATE", rows: j.kind === "crypto" ? plainRows(j.bars) : splitAdjustedRows(j.bars) }; }
  const g = join(ROOT, "quant/data/market/golden-preview/daily/ref_" + sym + ".json");
  if (existsSync(g)) return { source: "GOLDEN_PREVIEW", rows: splitAdjustedRows(JSON.parse(readFileSync(g, "utf8")).bars) };
  return null;
}

const MOTIVE = ["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL", "EXTENDED_IMPULSE"], CORR = ["ZIGZAG", "FLAT", "TRIANGLE", "DOUBLE_ZIGZAG"];
/** Kennzahlen einer Analyse (pc = Praktikersicht oder null). */
export function measure(series, tf, bpy, pc) {
  const t0 = Date.now();
  const out = runV3(series, tf, { forensics: true, debugAll: true, barsPerYear: bpy, engine: ENGINE });
  const ms = Date.now() - t0;
  if (!out.primary) return { hasCount: false, status: out.status, reason: out.reason, ms };
  const rd = candidateReadings(out, series), all = out.trace.allCands;
  const imp = rd.filter((c) => c.type === "IMPULSE");
  const like = pc ? imp.filter((c) => !c.complete && c.currentLabel === pc.currentWave && c.currentDir === pc.direction) : [];
  const motiveAny = rd.filter((c) => c.family === "MOTIVE");
  // Unterteilung der besten Impulslesart: wie oft wird eine Motivwelle (1/3/5) als Motiv erkannt?
  let mSeen = 0, mTot = 0, kSeen = 0, kTot = 0;
  const tgt = like[0] || imp[0];
  if (tgt) all[tgt.pos].subs.forEach((w, k) => { if (w.st === "DEVELOPING") return; if (k % 2 === 0) { mTot++; if (MOTIVE.includes(w.p)) mSeen++; } else { kTot++; if (CORR.includes(w.p)) kSeen++; } });
  const ra = out.primary.ruleAudit || {};
  return { hasCount: true, ms, pattern: out.primary.pattern, family: out.primary.family, complete: !!out.primary.complete, status: out.status,
           applicability: out.applicability.level, abstain: !!out.applicability.abstain, validity: ra.validity || null,
           alternatives: (out.alternatives || []).map((a) => a.pattern), candidates: all.length,
           impulseBestPos: imp.length ? imp[0].pos : null, practitionerLikeBestPos: like.length ? like[0].pos : null, motiveBestPos: motiveAny.length ? motiveAny[0].pos : null,
           impulseSubdivision: tgt ? { motiveWavesSeenMotive: mSeen, motiveWaves: mTot, corrWavesSeenCorr: kSeen, corrWaves: kTot } : null,
           truncated: !!out.trace.truncated, primaryWaves: out.primary.waves.length };
}

function caseModes(r) {
  const pc = practitionerClass(r), cb = caseBars(r);
  const head = { referenceId: r.referenceId, split: r._split, sourceFamily: sourceFamilyOf(r.sourceId), vuSymbol: cb.projection.vuSymbol, timeframe: r.timeframe, confidence: r.extraction.confidence,
                 practitioner: { pattern: pc.pattern, broad: pc.broad, currentWave: pc.currentWave, direction: pc.direction, state: pc.state } };
  if (cb.status !== "OK") return Object.assign(head, { status: cb.status });
  const ohlc = loadOHLC(cb.projection.vuSymbol);
  const tf = cb.tf, bpy = tf === "1W" ? 52 : 252, lastBar = cb.bars[cb.bars.length - 1][0];
  const modes = { A0: measure(seriesOf(cb.bars.map(([d, c]) => ({ date: d, open: c, high: c, low: c, close: c })), tf, { closeOnly: true }), tf, bpy, pc) };
  if (!ohlc) return Object.assign(head, { status: "OK", ohlc: "UNAVAILABLE", modes });
  const daily = ohlc.rows.filter((x) => x.date <= r.analysisCutoff);
  const tfRows = tf === "1W" ? weeklyOHLC(daily, { cutoff: lastBar }) : daily.filter((x) => x.date <= lastBar);
  // Konsistenz: gleiche Schlusskurse wie der Replay (gleiche Kurswelt)?
  const rep = new Map(cb.bars), cmp = tfRows.filter((x) => rep.has(x.date)), off = cmp.filter((x) => Math.abs(rep.get(x.date) - x.close) / x.close > 0.002).length;
  const consistency = { compared: cmp.length, mismatched: off, replayBars: cb.bars.length, ohlcBars: tfRows.length };
  modes.A = measure(seriesOf(tfRows, tf, { closeOnly: true }), tf, bpy, pc);
  modes.B = measure(seriesOf(hlPath(tfRows), tf), tf, 2 * bpy, pc);
  if (tf === "1W") {
    const d6 = daily.slice(-252 * 6 - 300);
    modes.C = measure(seriesOf(d6, "1D", { closeOnly: true }), "1D", 252, pc);
    modes.D = measure(seriesOf(hlPath(d6), "1D"), "1D", 504, pc);
  }
  return Object.assign(head, { status: "OK", ohlc: ohlc.source, consistency, modes });
}

function productionNames() {
  const out = [];
  for (const sym of Object.keys(PRODUCTION_NAMES)) {
    const o = loadOHLC(sym); if (!o) { out.push({ symbol: sym, profile: PRODUCTION_NAMES[sym], status: "OHLC_UNAVAILABLE" }); continue; }
    for (const asOf of PRODUCTION_ASOF) {
      const d = o.rows.filter((x) => x.date <= asOf); if (d.length < 400) continue;
      const w = weeklyOHLC(d, { cutoff: asOf }), dd = d.slice(-252 * 6 - 300);
      out.push({ symbol: sym, profile: PRODUCTION_NAMES[sym], source: o.source, asOf,
        daily: { A: measure(seriesOf(dd, "1D", { closeOnly: true }), "1D", 252, null), B: measure(seriesOf(hlPath(dd), "1D"), "1D", 504, null) },
        weekly: { A: measure(seriesOf(w, "1W", { closeOnly: true }), "1W", 52, null), B: measure(seriesOf(hlPath(w), "1W"), "1W", 104, null) } });
    }
  }
  return out;
}

const share = (a, f) => a.length ? +(a.filter(f).length / a.length).toFixed(3) : null;
const med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
export function summarizeCases(cases) {
  const s = {};
  for (const m of ["A0", "A", "B", "C", "D"]) {
    const rows = cases.filter((c) => c.status === "OK" && c.modes && c.modes[m] && c.modes[m].hasCount), imp = rows.filter((c) => c.practitioner.broad === "MOTIVE");
    if (!rows.length) continue;
    const sub = imp.map((c) => c.modes[m].impulseSubdivision).filter(Boolean);
    s[m] = { cases: rows.length, impulseCases: imp.length,
      primaryMotive: rows.filter((c) => c.modes[m].family === "MOTIVE").length, primaryImpulse: rows.filter((c) => c.modes[m].pattern === "IMPULSE").length,
      impulseCasesPrimaryMotive: imp.filter((c) => c.modes[m].family === "MOTIVE").length,
      impulseCasesImpulseInAlternatives: imp.filter((c) => c.modes[m].alternatives.includes("IMPULSE")).length,
      impulseCasesAnyImpulse: imp.filter((c) => c.modes[m].impulseBestPos !== null).length,
      impulseCasesPractitionerLike: imp.filter((c) => c.modes[m].practitionerLikeBestPos !== null).length,
      medianImpulseBestPos: med(imp.map((c) => c.modes[m].impulseBestPos)), medianPractitionerLikePos: med(imp.map((c) => c.modes[m].practitionerLikeBestPos)),
      practitionerLikeTop3: imp.filter((c) => c.modes[m].practitionerLikeBestPos !== null && c.modes[m].practitionerLikeBestPos < 3).length,
      practitionerLikeTop10: imp.filter((c) => c.modes[m].practitionerLikeBestPos !== null && c.modes[m].practitionerLikeBestPos < 10).length,
      motiveWavesSeenMotive: sub.reduce((a, x) => a + x.motiveWavesSeenMotive, 0) + "/" + sub.reduce((a, x) => a + x.motiveWaves, 0),
      abstainShare: share(rows, (c) => c.modes[m].abstain), truncatedShare: share(rows, (c) => c.modes[m].truncated), medianMs: med(rows.map((c) => c.modes[m].ms)),
      primaryPattern: rows.reduce((o, c) => { o[c.modes[m].pattern] = (o[c.modes[m].pattern] || 0) + 1; return o; }, {}) };
  }
  return s;
}
export function regressionMatrix(prod) {
  const rows = [];
  for (const p of prod) for (const tf of ["daily", "weekly"]) { if (!p[tf]) continue; const a = p[tf].A, b = p[tf].B; if (!a || !b) continue; rows.push({ a, b }); }
  const both = rows.filter((x) => x.a.hasCount && x.b.hasCount);
  return { pairs: rows.length, bothCounted: both.length,
    patternChanged: share(both, (x) => x.a.pattern !== x.b.pattern), familyChanged: share(both, (x) => x.a.family !== x.b.family),
    applicabilityChanged: share(both, (x) => x.a.applicability !== x.b.applicability), validityChanged: share(both, (x) => x.a.validity !== x.b.validity),
    primaryMotiveA: share(both, (x) => x.a.family === "MOTIVE"), primaryMotiveB: share(both, (x) => x.b.family === "MOTIVE"),
    abstainA: share(both, (x) => x.a.abstain), abstainB: share(both, (x) => x.b.abstain),
    medianMsA: med(both.map((x) => x.a.ms)), medianMsB: med(both.map((x) => x.b.ms)), truncatedA: share(both, (x) => x.a.truncated), truncatedB: share(both, (x) => x.b.truncated) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, sealedCases, freezeSha256 } = openedCases();
  const cases = process.argv.includes("--production-only") ? [] : rows.map(caseModes);
  const prod = productionNames();
  const res = { schemaVersion: "vu-elliott-ohlc-experiment-1.0.0", generatedAt: new Date().toISOString(), engine: EV3.ENGINE_VERSION, engineOverrides: ENGINE, rules: PAT.RULE_SET_VERSION,
    ohlcSource: OHLC_DIR ? "Tiingo EOD/Krypto, runner-privat (keine Kurse im Artefakt)" : "golden-preview (lokal, fuenf Titel)",
    preprocessing: { priceWorld: "SPLIT_ADJUSTED (O/H/L/C gemeinsam)", weekly: "Mo–Fr, O=erste Eroeffnung, H=max, L=min, C=letzter Schluss; nur abgeschlossene Wochen", hlPath: "2 Punkte je Bar, Reihenfolge: C>=O → L,H sonst H,L (Annahme)", barsPerYear: "B/D doppelt" },
    freeze: { sha256: freezeSha256 }, sealedHoldoutCasesNotRead: sealedCases,
    note: "Kein Prognosetest. PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.",
    practitionerSummary: summarizeCases(cases), productionRegression: regressionMatrix(prod), practitionerCases: cases, production: prod };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(res, null, 1) + "\n");
  console.log(JSON.stringify({ practitionerSummary: res.practitionerSummary, productionRegression: res.productionRegression, ohlcCases: cases.filter((c) => c.ohlc && c.ohlc !== "UNAVAILABLE").map((c) => c.referenceId + ":" + JSON.stringify(c.consistency)) }, null, 1));
}
