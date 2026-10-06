#!/usr/bin/env node
/* =========================================================================
   Mission VIII — Entscheidung nach der Praeregistrierung und versioniertes Evidenz-Artefakt.

   Liest die Auswertungen der Phasen (evaluate.mjs) und wendet die VORAB registrierten Regeln mechanisch an
   (HISTORICAL_ACCURACY_PREREGISTRATION.md §4–§7): H1/H2, Gates G1–G5, Relevanz, Aequivalenz, Holm fuer S1–S5.
   Keine Schwelle wird hier gewaehlt; alle stehen in der Praeregistrierung.

     node scripts/technical/hsab/report.mjs --w-holdout F --d-holdout F [--w-dev F --w-val F --d-dev F] --out FILE
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const load = (f) => (f && existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);

export const RULES = { meaningfulLift: 0.02, meaningfulLower: 0.005, equivalence: 0.015, gateP: -0.005, gateC: -0.005, z95: 1.959964, z90: 1.644854 };

/** Einseitiger p-Wert (H0: Wert <= 0) aus zweiseitigem p und Vorzeichen. */
const oneSided = (est, p) => (!isNum(est) || !isNum(p) ? null : est > 0 ? p / 2 : 1 - p / 2);
const ci90 = (x) => { if (!x || !x.liftCi || !isNum(x.liftCi[0])) return null; const se = (x.liftCi[1] - x.liftCi[0]) / (2 * RULES.z95); return [x.lift - RULES.z90 * se, x.lift + RULES.z90 * se]; };

export function decideHoldout(ev, kind) {
  if (!ev) return null;
  const P = ev.tables.primary, S = P.sensitivity || {};
  const main = P.vsD;
  const H = { lift: main.lift, ci95: main.liftCi, oneSidedP: r4(oneSided(main.lift, main.p)), pass: isNum(main.liftCi[0]) && main.liftCi[0] > 0, n: main.n };
  const g = {};
  g.G1_vsP = { lift: P.vsP_timingMatched.lift, ci: P.vsP_timingMatched.liftCi, pass: P.vsP_timingMatched.lift > 0 && P.vsP_timingMatched.liftCi[0] > RULES.gateP };
  g.G2_vsC = { lift: P.vsC.lift, ci: P.vsC.liftCi, pass: isNum(P.vsC.liftCi[0]) && P.vsC.liftCi[0] >= RULES.gateC };
  g.G3_vsE = { lift: P.vsE.lift, ci: P.vsE.liftCi, pass: P.vsE.lift >= 0 };
  g.G4_opposite = { diff: P.vsOppositeDirection.diff, ci: P.vsOppositeDirection.ci, pass: isNum(P.vsOppositeDirection.ci[0]) && P.vsOppositeDirection.ci[0] > 0 };
  const sens = {
    customerGrid: ev.tables.customerGridView && ev.tables.customerGridView.vsD.lift,
    zoneMid: P.ruleZoneMid.lift, closeTarget: P.ruleCloseTarget.lift, noCoarseRounding: S.excludingCoarseRounding && S.excludingCoarseRounding.lift,
    blockQuarter: P.vsD_blockQuarter.lift, blockYear: P.vsD_blockYear.lift,
    ...(kind === "DAILY" ? { disjointSymbols: S.disjointFromDailyDevSymbols && S.disjointFromDailyDevSymbols.lift } : { unionPool: P.vsD_unionPool && P.vsD_unionPool.lift })
  };
  g.G5_sameSign = { values: sens, pass: Object.values(sens).every((v) => isNum(v) && Math.sign(v) === Math.sign(main.lift) && main.lift > 0) };
  const gatesPass = Object.values(g).every((x) => x.pass);
  const c90 = ci90(main);
  return { kind, phase: ev.phase, n: main.n, symbols: main.symbols, pss: main.rate, control: main.base, H, gates: g, gatesPass,
           meaningful: main.lift >= RULES.meaningfulLift && main.liftCi[0] >= RULES.meaningfulLower, equivalentWithin15pp: !!c90 && c90[0] > -RULES.equivalence && c90[1] < RULES.equivalence,
           ci90: c90 && c90.map(r4), harm: isNum(main.liftCi[1]) && main.liftCi[1] < 0 };
}

export function secondary(ev) {
  if (!ev) return null;
  const T = ev.tables, P = T.primary, cl = (T.coverageAccuracy || []).find((x) => x.tier === "CLARITY_CLEAR");
  const ro = T.segments && T.segments.marketRegime && T.segments.marketRegime.RISK_OFF;
  const rows = [
    ["S1_customerGrid", T.customerGridView && T.customerGridView.vsD],
    ["S2_entryBased", P.entryBasedVsD],
    ["S3_expectedR", P.expectedR && P.expectedR.liftVsD && { lift: P.expectedR.liftVsD.mean, liftCi: P.expectedR.liftVsD.ci, p: P.expectedR.liftVsD.p, n: P.expectedR.liftVsD.n }],
    ["S4_clarityClear", cl],
    ["S5_riskOff", ro && !ro.suppressed ? ro : null]
  ].map(([k, x]) => ({ id: k, n: x ? x.n : 0, est: x ? x.lift : null, ci: x ? x.liftCi : null, p1: x ? oneSided(x.lift, x.p) : null }));
  /* Holm (einseitig) */
  const order = rows.map((r, i) => [r.p1, i]).filter((x) => isNum(x[0])).sort((a, b) => a[0] - b[0]);
  const m = order.length; let stop = false;
  order.forEach(([p, i], k) => { const adj = Math.min(1, p * (m - k)); rows[i].pHolm = r4(adj); rows[i].reject = !stop && adj <= 0.025; if (!rows[i].reject) stop = true; });
  return rows.map((r) => ({ ...r, p1: r4(r.p1) }));
}

export function classify(W, D) {
  if (!W || !D) return { overall: "INCOMPLETE", reason: "Holdout-Auswertung fehlt" };
  const detected = W.H.pass && D.H.pass, meaningful = detected && W.meaningful && D.meaningful && W.gatesPass && D.gatesPass;
  const label = meaningful ? "MEANINGFUL_EDGE" : detected ? "DETECTABLE_BUT_NEGLIGIBLE" : W.equivalentWithin15pp && D.equivalentWithin15pp ? "NO_EDGE_EQUIVALENT" : W.harm || D.harm ? "HARM_SIGNAL" : "INCONCLUSIVE";
  return { overall: label, detected, meaningful };
}

function main() {
  const W = load(arg("w-holdout")), D = load(arg("d-holdout"));
  const dW = decideHoldout(W, "WEEKLY"), dD = decideHoldout(D, "DAILY");
  const proto = JSON.parse(readFileSync(join(HERE, "protocol.json"), "utf8"));
  const dev = ["w-dev", "w-val", "d-dev"].map((k) => [k, load(arg(k))]).filter((x) => x[1]).map(([k, e]) => [k, decideHoldout(e, k === "d-dev" ? "DAILY" : "WEEKLY")]);
  const out = {
    schemaVersion: "technical-intelligence-evidence-2.0.0", generatedAt: new Date().toISOString(),
    methodology: { id: "VU-HSAB", version: "hsab-1.0.0", preregistration: proto.preregistration, protocolStatus: proto.status, rules: RULES },
    engine: W ? W.replay.engine : D ? D.replay.engine : null,
    evidenceStatus: "BOUND_TO_ENGINE_VERSION — gilt nur fuer ti-scenario-1.2.1 / elliott-3.2.2; jede Engine-Aenderung macht diese Evidenz zu HISTORICAL_FOR_PREVIOUS_ENGINE bis zur Revalidierung",
    holdout: { weekly: dW, daily: dD, secondaryWeekly: secondary(W), secondaryDaily: secondary(D) },
    classification: classify(dW, dD),
    /* Einordnung §85/§116 (Regel): MEANINGFUL_EDGE in beiden Holdouts → A; nur selektiv (CLEAR-Stufe S4 bestanden, sonst nicht) → B nur bei
       MEANINGFUL_EDGE der Stufe; DETECTABLE_BUT_NEGLIGIBLE / NO_EDGE / INCONCLUSIVE mit deskriptivem Produktwert → C; HARM → D. */
    assessment: (() => { const c = classify(dW, dD).overall;
      const ew = W && W.tables.elliott ? W.tables.elliott.speakShareOfPoints : null;
      return { technicalIntelligence: c === "MEANINGFUL_EDGE" ? "A_ROBUST_PREDICTIVE_VALUE" : c === "HARM_SIGNAL" ? "D_NO_MATERIAL_VALUE" : "C_DESCRIPTIVE_DECISION_SUPPORT_VALUE",
               elliott: isNum(ew) && ew < 0.01 ? "EXPERIMENTAL_ONLY_STRUCTURAL_LANGUAGE" : "SEE_REPORT", elliottSpeakShareWeekly: ew,
               methodRoles: { TREND: "FORECAST_CONTRIBUTOR_DIRECTION_ONLY", STRUCTURE: "STRUCTURAL_DESCRIPTION", MOMENTUM: "NO_MEASURABLE_VALUE", VOLATILITY: "FILTER_CONTEXT", VOLUME: "NO_MEASURABLE_VALUE",
                 SUPPORT_RESISTANCE: "STRUCTURAL_DESCRIPTION", AVWAP: "STRUCTURAL_DESCRIPTION", FIBONACCI: "REMOVE_FROM_FORECAST_WEIGHTING", PATTERNS: "STRUCTURAL_DESCRIPTION", ELLIOTT: "EXPERIMENTAL",
                 WYCKOFF: "NO_MEASURABLE_VALUE", CONFLUENCE: "FILTER_CONTEXT", FULL_TI: "DESCRIPTIVE_DECISION_SUPPORT" },
               source: "TECHNICAL_METHOD_ATTRIBUTION.md, VU_HISTORICAL_ACCURACY_REPORT.md" }; })(),
    /* Datenvertrag fuer ein kuenftiges Produkt-Panel „Historische Evidenz“ (§108). publishable nur bei MEANINGFUL_EDGE und Legal Review. */
    productPanel: (() => { const c = classify(dW, dD).overall, x = (d) => d && { cases: d.n, period: d.kind === "WEEKLY" ? "2018–2026 (delistete Titel)" : "2017–2026", primaryScenarioSuccess: d.pss, matchedBaseline: d.control,
        liftPp: r4(d.H.lift * 100), ci95Pp: d.H.ci95.map((v) => r4(v * 100)), coverage: d.kind === "WEEKLY" ? (W && W.tables.primary.coverageOfPoints) : (D && D.tables.primary.coverageOfPoints),
        relabelRate: d.kind === "WEEKLY" ? (W && W.tables.secondary.relabelBeforeResolution.dpBased.rate) : (D && D.tables.secondary.relabelBeforeResolution.dpBased.rate) };
      return { schema: ["cases", "period", "primaryScenarioSuccess", "matchedBaseline", "liftPp", "ci95Pp", "coverage", "relabelRate", "evidenceVersion"], evidenceVersion: "technical-intelligence-evidence-2.0.0",
               publishable: false, publishableReason: c === "MEANINGFUL_EDGE" ? "LEGAL_REVIEW_REQUIRED" : "NO_ESTABLISHED_EDGE (" + c + ") — nur als Vergleichsdarstellung mit Pflichtsatz, nach Legal Review",
               weekly: x(dW), daily: x(dD) }; })(),
    developmentAndValidation: Object.fromEntries(dev)
  };
  const f = arg("out"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.classification));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
