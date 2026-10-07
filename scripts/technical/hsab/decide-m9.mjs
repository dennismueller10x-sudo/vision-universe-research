#!/usr/bin/env node
/* Mission IX — mechanische Entscheidung Track B und Elliott/Wave 3 aus DEV- und VAL-Ergebnis (track-b.mjs).
   Regeln: MISSION9_PREREGISTRATION.md §3/§4. Track B und Elliott liegen auf verbrauchten Daten → hoechstens
   VALIDATION_ON_CONSUMED_DATA; die Einstufung ist explorativ-validierend, keine Bestaetigung.
     node scripts/technical/hsab/decide-m9.mjs --dev F --val F [--wave3-dev F --wave3-val F] --out F */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const load = (f) => (f && existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const VU_SIGNALS = ["VU_BULL", "VU_BULL_CLEAR", "VU_BULL_STRONG", "VU_BULL_AND_TREND_MOM", "VU_BULL_EXACT"];
export const EW_SIGNALS = ["EW_DISPLAYED_MOTIVE_UP", "EW_INT_UP_EARLY", "EW_INT_UP_EARLY_TOP5", "EW_INT_LD_UP_EARLY", "EW_INT_UP_ANY_OPEN"];
export const EW_FILTERS = ["EW_INT_UP_EARLY_AND_TREND_MOM", "EW_INT_UP_EARLY_AND_RS"];
const row = (res, sig, hn) => res && res.results.find((r) => r.signal === sig && r.horizon === hn && r.mult);
const lb = (r, K) => (r && r.mult[K] && r.mult[K].liftRatioCi && isNum(r.mult[K].liftRatioCi[0]) ? r.mult[K].liftRatioCi[0] : null);
const ub = (r, K) => (r && r.mult[K] && r.mult[K].liftRatioCi && isNum(r.mult[K].liftRatioCi[1]) ? r.mult[K].liftRatioCi[1] : null);

export function decideTrackB(dev, val) {
  const per = VU_SIGNALS.map((s) => {
    const d = row(dev, s, "24M"), v = row(val, s, "24M");
    if (!d || !v) return { signal: s, available: false };
    const pos = [lb(d, "5x") > 1, lb(v, "5x") > 1], neg = [ub(d, "5x") < 1, ub(v, "5x") < 1];
    /* Ueberschuss-Mittel mit 4×-Deckel (symmetrisch: Signal und Vergleich gleich gedeckelt), 95-%-Untergrenze > 0 */
    const cLb = (r) => (r.returns.excessMeanCapped4xCi && isNum(r.returns.excessMeanCapped4xCi[0]) ? r.returns.excessMeanCapped4xCi[0] : null);
    const capPos = [cLb(d) > 0, cLb(v) > 0];
    const cls = pos[0] && pos[1] && capPos[0] && capPos[1] ? "ROBUST" : pos[0] || pos[1] ? "SELECTIVE" : "NONE";
    return { signal: s, available: true, ratio5x24M: [d.mult["5x"].liftRatio, v.mult["5x"].liftRatio], ci: [d.mult["5x"].liftRatioCi, v.mult["5x"].liftRatioCi],
             cappedExcess: [d.returns.excessMeanCapped4x, v.returns.excessMeanCapped4x], cappedExcessCi: [d.returns.excessMeanCapped4xCi, v.returns.excessMeanCapped4xCi], harmBoth: neg[0] && neg[1], cls };
  });
  const any = (c) => per.some((x) => x.cls === c);
  return { rule: "MISSION9_PREREGISTRATION.md §3", level: "VALIDATION_ON_CONSUMED_DATA", perSignal: per,
           classification: any("ROBUST") ? "ROBUST_ASYMMETRIC_EDGE" : any("SELECTIVE") ? "SELECTIVE_ASYMMETRIC_EDGE" : "NO_ASYMMETRIC_EDGE",
           vuBullHarmsSuperwinnerSelection: per.filter((x) => x.harmBoth).map((x) => x.signal) };
}

export function decideElliott(dev, val) {
  if (!dev || !val) return { classification: "NOT_EVALUATED" };
  const test = (s) => { const out = {}; for (const [hn, K] of [["24M", "5x"], ["12M", "2x"]]) { const d = row(dev, s, hn), v = row(val, s, hn);
    out[hn + "_" + K] = d && v ? { ratio: [d.mult[K].liftRatio, v.mult[K].liftRatio], ci: [d.mult[K].liftRatioCi, v.mult[K].liftRatioCi], flagged: [d.flagged, v.flagged], both: lb(d, K) > 1 && lb(v, K) > 1 } : null; } return out; };
  const standalone = Object.fromEntries(EW_SIGNALS.map((s) => [s, test(s)])), filters = Object.fromEntries(EW_FILTERS.map((s) => [s, test(s)]));
  const hit = (o) => Object.values(o).some((t) => Object.values(t).some((x) => x && x.both));
  return { rule: "MISSION9_PREREGISTRATION.md §4", level: "EXPLORATORY_VALIDATION_ON_CONSUMED_DATA", standalone, filters,
           classification: hit(standalone) ? "INCREMENTAL_PREDICTIVE_VALUE" : hit(filters) ? "USEFUL_FILTER" : "STRUCTURAL_LANGUAGE_ONLY",
           note: "STRUCTURAL_LANGUAGE_ONLY = kein messbarer Prognosebeitrag; die angezeigte Zaehlung bleibt beschreibende Sprache (Mission VIII: spricht in < 1 % der Analysezeitpunkte)." };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = { schemaVersion: "hsab-m9-decision-1.0.0", trackB: decideTrackB(load(arg("dev")), load(arg("val"))), elliott: decideElliott(load(arg("wave3-dev")), load(arg("wave3-val"))) };
  writeFileSync(arg("out"), JSON.stringify(res, null, 1));
  console.log(`[decide-m9] Track B ${res.trackB.classification}; Elliott ${res.elliott.classification}`);
}
