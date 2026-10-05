#!/usr/bin/env node
/* Impuls-Fehlertaxonomie (Mission VI §4–§7, §36–§49): je geoeffnetem Practitioner-Impulsfall (DEVELOPMENT + VALIDATION,
   Holdouts versiegelt) Kategorie, Mechanismus (dominante Rangkomponente), Sieger, Regelklasse — plus Teilmengen.
   node scripts/technical/elliott-forensics/taxonomy.mjs */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openedCases, practitionerClass, caseBars, seriesFrom, runV3, candidateReadings, sourceFamilyOf, ROOT, EV3 } from "./lib.mjs";
import { abstentionReason } from "./impulse-forensics.mjs";

const W = EV3.DEFAULTS.weights;
/* Klassifikation der Rangkomponenten nach Mission VI §7 */
export const COMPONENT_CLASS = { subdivision: "GUIDELINE/DEFINITION-EVIDENZ (Unterteilung 5 vs. 3, VU-Klassifikator im Skalenraum)", coverage: "VU-SPECIFIC HEURISTIC (Vollstaendigkeit)",
  dominance: "VU-SPECIFIC HEURISTIC (Dominanz des Ursprungs)", anchor: "VU-SPECIFIC HEURISTIC (Signifikanz des Ursprungs)", guidelines: "GUIDELINE (EWP-Richtlinien)",
  prior: "VU-SPECIFIC HEURISTIC (Musterprior)", tail: "VU-SPECIFIC HEURISTIC (Restbewegung)", separation: "VU-SPECIFIC HEURISTIC (Gradtrennung)" };

export function caseTaxonomy(r) {
  const pc = practitionerClass(r), cb = caseBars(r);
  const head = { referenceId: r.referenceId, split: r._split, sourceFamily: sourceFamilyOf(r.sourceId), timeframe: cb.tf || r.timeframe, confidence: r.extraction.confidence,
                 btc: cb.projection.vuSymbol === "BTCUSD", practitionerState: pc.state, practitionerWave: pc.currentWave, practitionerPattern: pc.pattern };
  if (cb.status !== "OK") return Object.assign(head, { category: "INSUFFICIENT_DATA" });
  const s = seriesFrom(cb.bars, cb.tf), out = runV3(s, cb.tf, { forensics: true, debugAll: true });
  const rd = candidateReadings(out, s), all = out.trace.allCands;
  const like = rd.filter((c) => c.type === "IMPULSE" && !c.complete && c.currentLabel === pc.currentWave && c.currentDir === pc.direction);
  const anyImp = rd.filter((c) => c.type === "IMPULSE");
  const tgt = like[0] || anyImp[0];
  const gaps = {}; if (tgt) for (const k of Object.keys(W)) if (W[k]) gaps[k] = +(W[k] * ((all[0].c[k] ?? 0.5) - (all[tgt.pos].c[k] ?? 0.5))).toFixed(3);
  const dominant = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0];
  let category;
  if (!anyImp.length) category = "NO_VALID_IMPULSE_CANDIDATE";
  else if (out.primary.pattern === "IMPULSE") category = "IMPULSE_IS_PRIMARY";
  else if ((out.alternatives || []).some((a) => a.pattern === "IMPULSE")) category = "IMPULSE_IS_ALTERNATIVE";
  else category = "VALID_IMPULSE_CANDIDATE_RANKED_LOW";
  return Object.assign(head, { category, practitionerLikeImpulse: like.length > 0, comparedCandidate: like.length ? "PRACTITIONER_LIKE" : "ANY_IMPULSE",
    candidatePos: tgt ? tgt.pos : null, candidates: all.length, winner: out.primary.pattern + (out.primary.complete ? "_COMPLETE" : "_DEVELOPING"),
    dominantGap: dominant ? dominant[0] : null, dominantGapClass: dominant ? COMPONENT_CLASS[dominant[0]] : null, gaps,
    hardRuleRejection: false, abstention: abstentionReason(out), internal: "VALID_INTERNAL_COUNT_PRODUCT_ABSTAINS" });
}
const by = (a, f) => a.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
export function table(rows) {
  const keys = [...new Set(rows.map((x) => x.category + " · " + (x.dominantGap || "-")))];
  return keys.map((k) => { const a = rows.filter((x) => x.category + " · " + (x.dominantGap || "-") === k);
    return { category: k, n: a.length, share: +(a.length / rows.length).toFixed(3), HIGH: a.filter((x) => x.confidence === "HIGH").length, MEDIUM: a.filter((x) => x.confidence === "MEDIUM").length,
             daily: a.filter((x) => x.timeframe === "1D").length, weekly: a.filter((x) => x.timeframe === "1W").length, sourceFamily: by(a, (x) => x.sourceFamily) }; }).sort((a, b) => b.n - a.n);
}
const meanGaps = (a) => { const o = {}; a.forEach((x) => Object.entries(x.gaps || {}).forEach(([k, v]) => { o[k] = (o[k] || 0) + v; })); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / Math.max(1, a.length)).toFixed(3)])); };
export function slice(a) { return { n: a.length, ranked: a.filter((x) => x.category === "VALID_IMPULSE_CANDIDATE_RANKED_LOW").length, primary: a.filter((x) => x.category === "IMPULSE_IS_PRIMARY").length,
  alternative: a.filter((x) => x.category === "IMPULSE_IS_ALTERNATIVE").length, practitionerLike: a.filter((x) => x.practitionerLikeImpulse).length, dominantGap: by(a, (x) => x.dominantGap), meanGaps: meanGaps(a), winners: by(a, (x) => x.winner) }; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, sealedCases, freezeSha256 } = openedCases();
  const imp = rows.filter((r) => practitionerClass(r).impulseLike).map(caseTaxonomy).filter((x) => x.category !== "INSUFFICIENT_DATA");
  const res = { schemaVersion: "vu-elliott-impulse-taxonomy-1.0.0", generatedAt: new Date().toISOString(), engine: EV3.ENGINE_VERSION, dataMode: "CLOSE_ONLY", freeze: { sha256: freezeSha256 }, sealedHoldoutCasesNotRead: sealedCases,
    componentClass: COMPONENT_CLASS, table: table(imp),
    slices: { all: slice(imp), HIGH: slice(imp.filter((x) => x.confidence === "HIGH")), MEDIUM: slice(imp.filter((x) => x.confidence === "MEDIUM")), excludingBTC: slice(imp.filter((x) => !x.btc)),
      equityIndexOnly: slice(imp.filter((x) => !x.btc)), excludingEWF: slice(imp.filter((x) => x.sourceFamily !== "ewf")), excludingTradingView: slice(imp.filter((x) => !x.sourceFamily.startsWith("tv-"))),
      developing: slice(imp.filter((x) => x.practitionerState === "DEVELOPING")), completed: slice(imp.filter((x) => x.practitionerState !== "DEVELOPING")),
      daily: slice(imp.filter((x) => x.timeframe === "1D")), weekly: slice(imp.filter((x) => x.timeframe === "1W")), DEVELOPMENT: slice(imp.filter((x) => x.split === "DEVELOPMENT")), VALIDATION: slice(imp.filter((x) => x.split === "VALIDATION")) },
    note: "Tiedje (Holdout-Quelle) ist versiegelt und daher in keiner Teilmenge enthalten. Diagnose, keine Abstimmungsgrundlage.", rows: imp };
  writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-forensics/impulse-taxonomy.json"), JSON.stringify(res, null, 1) + "\n");
  console.log(JSON.stringify({ table: res.table, slices: Object.fromEntries(Object.entries(res.slices).map(([k, v]) => [k, { n: v.n, ranked: v.ranked, like: v.practitionerLike, dom: v.dominantGap }])) }, null, 1));
}
