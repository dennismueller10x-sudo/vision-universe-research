#!/usr/bin/env node
/* IMPULS-FORENSIK (Mission VI §4–§7, §31–§40) — elliott-3.2.2 unveraendert, nur mit Forensik-Zaehlern.

   node scripts/technical/elliott-forensics/impulse-forensics.mjs [--out <json>] [--ablations]

   Je geoeffnetem Practitioner-Fall (DEVELOPMENT, VALIDATION; Holdouts versiegelt) dieselben Bars wie im blinden Replay
   (Close-only, wie Produktion), dann:
     1. Neutralitaet: Ausgabe ohne Forensik == Ausgabe mit Forensik (ohne trace).
     2. Spur je Musterklasse: erreichte Wellenzahl, Abbruchgrund je Tiefe (Aehnlichkeit, Ursprung, Regel-ID, Intra-Extrem,
        orthodoxes Ende), gefundene Lesarten, Vorauswahl (maxScored), Verwerfung in der Bewertung, Rangplatz.
     3. Praktikernahe Impulslesart: Impuls-Kandidat mit gleicher laufender Welle und gleicher Richtung.
     4. Klassifikation (Taxonomie §4) und Enthaltungsgrund (§38).
   --ablations: dieselben Faelle mit Diagnose-Varianten (nur Forschung, keine Produktaenderung): Suchbudget ×10,
   Vorauswahl ×4, ohne Aehnlichkeitsschranke, ohne Ursprungsschranken, Pool-Schwelle 0,5/2,0 ATR. */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { openedCases, practitionerClass, caseBars, seriesFrom, runV3, candidateReadings, sourceFamilyOf, ROOT, EV3 } from "./lib.mjs";

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg("out", join(ROOT, "quant/data/technical-intelligence/elliott-forensics/impulse-forensics-3.2.2.json"));

export const ABLATIONS = {
  baseline: {},
  budgetX10: { maxNodes: 250000 },
  maxScoredX4: { maxScored: 2000 },
  noSimilarity: { noSimilarity: true },
  noAnchorPrunes: { noAnchorPrune: true, anchorMinAtr: 0 },
  pool05: { poolAtr: 0.5 },
  pool20: { poolAtr: 2.0 },
  combinedSearch: { maxNodes: 250000, maxScored: 2000, noSimilarity: true, noAnchorPrune: true, anchorMinAtr: 0 }
};
const strip = (r) => { const x = Object.assign({}, r); delete x.trace; return JSON.stringify(x); };

export function classify(pc, f, readings, out) {
  const imp = readings.filter((c) => c.type === "IMPULSE");
  const like = imp.filter((c) => !c.complete && c.currentLabel === pc.currentWave && c.currentDir === pc.direction);
  const likeAny = imp.filter((c) => c.currentDir === pc.direction);
  const altTypes = (out.alternatives || []).map((a) => a.pattern);
  const T = f.byType.IMPULSE || { reach: {}, prune: {}, found: { complete: 0, developing: 0, internal: 0 } };
  const foundN = T.found.complete + T.found.developing + T.found.internal, pre = f.prerank.IMPULSE || { found: 0, withinMaxScored: 0 }, drops = f.scoreDrops.IMPULSE || {};
  const fin = f.final.IMPULSE || null;
  const maxReach = Math.max(0, ...Object.keys(T.reach).map(Number));
  // dominanter Abbruchgrund auf der tiefsten Ebene, die Pfade erreichten
  const atDepth = (k) => Object.entries(T.prune).filter(([key]) => key.startsWith("w" + k + ":")).sort((a, b) => b[1] - a[1]);
  const deepest = atDepth(maxReach), deepestNext = atDepth(maxReach + 1);
  let category, detail = null;
  if (out.primary && out.primary.pattern === "IMPULSE") category = "IMPULSE_IS_PRIMARY";
  else if (altTypes.includes("IMPULSE")) category = "IMPULSE_IS_ALTERNATIVE";
  else if (fin) { category = "IMPULSE_CANDIDATE_RANKED_TOO_LOW"; detail = { bestPos: fin.bestPos, rankGap: fin.best.rankGapToTop }; }
  else if (pre.found > 0 && pre.withinMaxScored === 0) category = "IMPULSE_PRUNED_BEFORE_SCORING";
  else if (pre.withinMaxScored > 0) { category = "IMPULSE_DROPPED_IN_SCORING"; detail = drops; }
  else if (foundN === 0 && maxReach === 0) category = "NO_IMPULSE_PATH_STARTED";
  else {
    category = "NO_VALID_IMPULSE_CANDIDATE";
    const all = Object.entries(T.prune).sort((a, b) => b[1] - a[1]);
    detail = { maxWavesReached: maxReach, endTouched: T.endTouched, dominantPruneAtDeepest: deepest[0] ? deepest[0][0] : null, dominantPruneNext: deepestNext[0] ? deepestNext[0][0] : null, topPrunes: all.slice(0, 5) };
  }
  return { category, detail, impulseReadings: imp.length, practitionerLikeImpulse: like.length, practitionerLikeBestPos: like.length ? like[0].pos : null,
           impulseSameDirection: likeAny.length, maxWavesReached: maxReach, found: T.found, prerank: pre, scoreDrops: drops, finalBestPos: fin ? fin.bestPos : null };
}

export function abstentionReason(out) {
  if (!out.primary) return out.reason === "TOO_FEW_SWINGS" ? "INSUFFICIENT_DATA" : "NO_VALID_COUNT";
  const a = out.applicability || {};
  if (out.dataQuality && out.dataQuality.blocking) return "DATA_QUALITY";
  if (!a.abstain) return "NOT_ABSTAINED";
  if (!out.primary.complete) return "DEVELOPING_CAP_OR_LOW_SCORE";
  if (out.primary.pattern === "WXY") return "WXY_CAP";
  if (out.status === "AMBIGUOUS") return "AMBIGUITY_AND_LOW_SCORE";
  return "LOW_APPLICABILITY_SCORE";
}

export function analyzeCase(r, engineOpts = {}, { neutrality = false } = {}) {
  const pc = practitionerClass(r), cb = caseBars(r);
  const base = { referenceId: r.referenceId, split: r._split, sourceFamily: sourceFamilyOf(r.sourceId), vuSymbol: cb.projection.vuSymbol, timeframe: cb.tf || r.timeframe,
                 confidence: r.extraction.confidence, btc: cb.projection.vuSymbol === "BTCUSD", practitioner: pc };
  if (cb.status !== "OK") return Object.assign(base, { status: cb.status });
  const s = seriesFrom(cb.bars, cb.tf), t0 = Date.now();
  const out = runV3(s, cb.tf, { forensics: true, debugAll: true, engine: engineOpts });
  const ms = Date.now() - t0;
  let neutral = null;
  if (neutrality) neutral = strip(runV3(s, cb.tf, { engine: engineOpts })) === strip(out);
  const readings = out.primary ? candidateReadings(out, s) : [];
  const f = (out.trace && out.trace.forensics) || { byType: {}, prerank: {}, scoreDrops: {}, final: {}, anchors: {} };
  const vu = out.primary ? { pattern: out.primary.pattern, family: out.primary.family, complete: !!out.primary.complete, status: out.status, applicability: out.applicability.level,
                             appScore: out.applicability.score, abstain: !!out.applicability.abstain, alternatives: (out.alternatives || []).map((a) => a.pattern),
                             higherDegree: out.higherDegree ? out.higherDegree.pattern : null } : { pattern: null, status: out.status, reason: out.reason };
  const typesFound = Object.fromEntries(Object.entries(f.byType).map(([t, v]) => [t, v.found.complete + v.found.developing + v.found.internal]));
  return Object.assign(base, { status: "OK", bars: cb.bars.length, ms, neutral, vu, abstention: abstentionReason(out),
    search: { poolPivots: out.trace ? out.trace.poolPivots : null, nodes: out.trace ? out.trace.nodes : null, truncated: out.trace ? out.trace.truncated : null, anchors: f.anchors, candidatesScored: f.scoredTotal ?? null, typesFound },
    impulse: classify(pc, f, readings, out),
    motiveAny: readings.some((c) => c.family === "MOTIVE"), bestMotivePos: (readings.find((c) => c.family === "MOTIVE") || {}).pos ?? null });
}

export function summarize(rows) {
  const ok = rows.filter((x) => x.status === "OK"), imp = ok.filter((x) => x.practitioner.impulseLike);
  const by = (a, f) => a.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
  return { cases: rows.length, ok: ok.length, practitionerImpulseCases: imp.length,
           categoryImpulseCases: by(imp, (x) => x.impulse.category),
           anyImpulseCandidate: imp.filter((x) => x.impulse.impulseReadings > 0).length,
           practitionerLikeImpulseCandidate: imp.filter((x) => x.impulse.practitionerLikeImpulse > 0).length,
           vuPrimaryPattern: by(ok, (x) => x.vu.pattern), abstention: by(ok, (x) => x.abstention),
           truncatedSearch: ok.filter((x) => x.search.truncated).length, neutralityChecked: ok.filter((x) => x.neutral !== null).length, neutralityFailed: ok.filter((x) => x.neutral === false).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, sealedCases, freezeSha256 } = openedCases();
  const base = rows.map((r) => analyzeCase(r, {}, { neutrality: true }));
  const result = { schemaVersion: "vu-elliott-impulse-forensics-1.0.0", generatedAt: new Date().toISOString(), engine: EV3.ENGINE_VERSION, dataMode: "CLOSE_ONLY (wie Replay/Produktion)",
    freeze: { version: "PRACTITIONER_REFERENCE_V1", sha256: freezeSha256 }, opened: rows.length, sealedHoldoutCasesNotRead: sealedCases,
    note: "PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH. Forensik ohne Aenderung der Engine-Ausgabe (Neutralitaet je Fall geprueft).",
    summary: summarize(base), rows: base };
  if (process.argv.includes("--ablations")) {
    result.ablations = {};
    for (const [name, eng] of Object.entries(ABLATIONS)) {
      if (name === "baseline") continue;
      const rr = rows.map((r) => analyzeCase(r, eng));
      result.ablations[name] = { engine: eng, summary: summarize(rr), perCase: rr.map((x) => ({ referenceId: x.referenceId, cat: x.impulse && x.impulse.category, like: x.impulse && x.impulse.practitionerLikeImpulse, likePos: x.impulse && x.impulse.practitionerLikeBestPos, vu: x.vu && x.vu.pattern, ms: x.ms })) };
    }
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 1) + "\n");
  console.log(JSON.stringify({ summary: result.summary, ablations: result.ablations && Object.fromEntries(Object.entries(result.ablations).map(([k, v]) => [k, { cat: v.summary.categoryImpulseCases, like: v.summary.practitionerLikeImpulseCandidate, any: v.summary.anyImpulseCandidate, prim: v.summary.vuPrimaryPattern }])) }, null, 1));
}
