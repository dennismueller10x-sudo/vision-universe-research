#!/usr/bin/env node
/* =========================================================================
   Vorher/Nachher der Musterstudie: Kursrendite gegen Gesamtrendite
   (Entscheidung FV-5, Schritt 1 - Pruefmodus ohne Wirkung).

     node scripts/quant/research/compare-pattern-return-basis.mjs \
       --price <dir> --total <dir> --out <bericht.json> \
       [--summary-out <kurz.json>] [--strict]

   <dir> ist je ein Ausgabeverzeichnis von build-pattern-research.mjs
   (study.json darin): einmal mit --return-basis price, einmal mit
   --return-basis total, beide auf derselben Tageshistorie (--work-dir).

   Der Bericht traegt NUR Aggregate: Abdeckung, Ausschluesse nach Grund und
   Bucket, Basisquoten je Horizont und Schwelle, je Hypothese und Horizont
   Urteil, Lift, OOS-Lift und ROBUST vorher/nachher. Keine Reihe, kein Kurs,
   kein Titel. Die Liste der ausgeschlossenen Titel steht in der
   Gesamtrendite-Studie selbst (Laufartefakt), nicht hier.

   Vergleichbarkeit: Die beiden Studien sind NICHT gepaart. Die
   Gesamtrendite-Studie laesst Titel ohne bestaetigte Gesamtrendite ganz weg
   und zaehlt Beobachtungen ohne Gesamtrendite-Wochenwert im Horizont als
   "Ausgang nicht verfuegbar". Der Bericht weist beides aus, statt es zu
   verrechnen.

   Zustand: PASS, wenn die Gesamtrendite-Studie Abdeckung PASS meldet;
   BELOW_MINIMUM_SHARE sonst. Mit --strict endet das Skript dann mit
   Exit 2 (Abbruch laut Freigabevorlage FV-5: zuerst die Ausschluesse
   pruefen, Runbook R3). Der Bericht wird in jedem Fall geschrieben.

   Rechnet nichts neu, liest nur die beiden study.json, schreibt nur --out.

   GEPAARTER VERGLEICH (Owner 02.11.2026, zusaetzlich und optional)

     ... --price-population <dir> [--paired-out <bericht.json>]
         [--paired-summary-out <kurz.json>]

   <dir> ist ein Lauf von build-pattern-research.mjs mit
   --population total-return (Kursrendite auf genau der Population der
   Gesamtrendite-Studie; darin study.json und paired-diagnostics.json).
   Damit drei Rechnungen:
     A  Kursrendite, volle Population            (--price)
     B  Kursrendite, Gesamtrendite-Population    (--price-population)
     C  Gesamtrendite, Gesamtrendite-Population  (--total)
   Populationseffekt = B - A, Renditeeffekt = C - B. Der Vergleich prueft
   die Paarung (gleiche ausgeschlossene Kennungen, gleiche Beobachtungen,
   gleiche auswertbare Beobachtungen je Horizont) und verweigert sonst.
   Ausgabe: je Horizont Basisquoten A/B/C, ROBUST A/B/C, Zerlegung der
   Aenderungen, je Hypothese Urteil/Lift/OOS-Lift A/B/C, fuer verlorene
   Befunde Familie und Ursache (Gewinnerquote im Muster gegen
   Basisquote/Vergleichsgruppe) und die Mechanismus-Pruefung "Dividenden
   heben die Vergleichsgruppe ueber die Schwelle". Nur Aggregate.
   Ohne --price-population bleibt alles wie bisher.
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPORT_SCHEMA = "pattern-return-basis-comparison-1.0.0";
const PRIMARY_KEY = "primary";

const round = (x, d = 6) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const diff = (a, b, d = 6) => (typeof a === "number" && typeof b === "number" ? round(b - a, d) : null);
const countBy = (items, key) => {
  const out = {};
  for (const item of items) { const k = key(item); out[k] = (out[k] || 0) + 1; }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
};

/** Liest study.json aus einem Verzeichnis (oder eine Datei direkt). */
export function readStudy(path) {
  const file = existsSync(join(path, "study.json")) ? join(path, "study.json") : path;
  return JSON.parse(readFileSync(file, "utf8"));
}

function assertInputs(price, total) {
  const problems = [];
  if (price.returnType === "TOTAL_RETURN" || (price.population && price.population.totalReturn === true)) {
    problems.push("--price ist eine Gesamtrendite-Studie");
  }
  if (total.returnType !== "TOTAL_RETURN") problems.push("--total meldet returnType " + JSON.stringify(total.returnType) + ", erwartet TOTAL_RETURN");
  if (!total.returnBasis || total.returnBasis.mixed !== false) problems.push("--total: returnBasis.mixed ist nicht false");
  if (!total.population || !total.population.totalReturnCoverage) problems.push("--total: population.totalReturnCoverage fehlt");
  if (price.methodologyVersion !== total.methodologyVersion) {
    problems.push("Methodik verschieden: " + price.methodologyVersion + " gegen " + total.methodologyVersion);
  }
  if (price.schemaVersion !== total.schemaVersion) problems.push("Schema verschieden: " + price.schemaVersion + " gegen " + total.schemaVersion);
  if (problems.length) throw new Error("Vergleich verweigert: " + problems.join("; "));
}

function horizonsOf(study) {
  const list = [{ key: PRIMARY_KEY, horizon: study.primary.horizon, horizonMonths: study.primary.horizonMonths,
    winnerThreshold: study.primary.winnerThreshold, baseRate: study.primary.baseRate,
    usableObservations: study.primary.usableObservations, winners: study.primary.winners,
    outcomeUnavailable: study.primary.outcomeUnavailable, findings: study.primary.findings }];
  for (const h of study.secondaryHorizons || []) {
    list.push({ key: h.horizon, horizon: h.horizon, horizonMonths: h.horizonMonths, winnerThreshold: study.primary.winnerThreshold,
      baseRate: h.baseRate, usableObservations: h.usableObservations, winners: h.winners, outcomeUnavailable: null, findings: h.findings });
  }
  return list;
}

const oosLift = (f) => (f && f.outOfSample && typeof f.outOfSample.lift === "number" ? f.outOfSample.lift : null);
function findingSide(f) {
  if (!f) return null;
  return {
    verdict: f.verdict,
    robust: f.verdict === "ROBUST",
    support: f.support,
    winners: f.winners,
    conditionalRate: round(f.conditionalRate),
    lift: round(f.lift, 4),
    outOfSampleLift: round(oosLift(f), 4),
    medianForwardReturn: round(f.medianForwardReturn, 4)
  };
}

function compareHorizon(p, t) {
  const byId = (list) => new Map((list || []).map((f) => [f.patternId, f]));
  const pm = byId(p.findings), tm = byId(t.findings);
  const ids = [...new Set([...pm.keys(), ...tm.keys()])].sort();
  const findings = [];
  const transitions = {};
  let gained = 0, lost = 0, kept = 0;
  for (const id of ids) {
    const a = findingSide(pm.get(id)), b = findingSide(tm.get(id));
    const from = a ? a.verdict : "MISSING", to = b ? b.verdict : "MISSING";
    if (from !== to) transitions[from + "->" + to] = (transitions[from + "->" + to] || 0) + 1;
    const ra = !!(a && a.robust), rb = !!(b && b.robust);
    if (ra && rb) kept += 1; else if (!ra && rb) gained += 1; else if (ra && !rb) lost += 1;
    findings.push({
      patternId: id,
      price: a,
      total: b,
      verdictChanged: from !== to,
      deltaLift: diff(a && a.lift, b && b.lift, 4),
      deltaOutOfSampleLift: diff(a && a.outOfSampleLift, b && b.outOfSampleLift, 4)
    });
  }
  const side = (h, list) => ({
    baseRate: round(h.baseRate), usableObservations: h.usableObservations, winners: h.winners,
    outcomeUnavailable: h.outcomeUnavailable, hypotheses: (list || []).length,
    verdicts: countBy(list || [], (f) => f.verdict)
  });
  return {
    horizon: p.horizon,
    horizonMonths: p.horizonMonths,
    primary: p.key === PRIMARY_KEY,
    winnerThreshold: p.winnerThreshold,
    price: side(p, p.findings),
    total: side(t, t.findings),
    deltaBaseRate: diff(p.baseRate, t.baseRate),
    robust: { price: kept + lost, total: kept + gained, kept, gained, lost },
    verdictTransitions: Object.fromEntries(Object.entries(transitions).sort((a, b) => a[0].localeCompare(b[0]))),
    findings
  };
}

function compareGrid(price, total) {
  const key = (g) => g.horizon + "/" + g.winnerThreshold;
  const tm = new Map((total.baseRateGrid || []).map((g) => [key(g), g]));
  return (price.baseRateGrid || []).map((g) => {
    const t = tm.get(key(g)) || null;
    return {
      horizon: g.horizon, winnerThreshold: g.winnerThreshold,
      price: { usableObservations: g.usableObservations, winners: g.winners, baseRate: round(g.baseRate), outcomeUnavailable: g.outcomeUnavailable },
      total: t ? { usableObservations: t.usableObservations, winners: t.winners, baseRate: round(t.baseRate), outcomeUnavailable: t.outcomeUnavailable } : null,
      deltaBaseRate: t ? diff(g.baseRate, t.baseRate) : null
    };
  });
}

function coverageOf(total) {
  const c = total.population.totalReturnCoverage;
  const excluded = c.excluded || [];
  return {
    state: c.state,
    share: c.share,
    minimumShare: c.minimumShare,
    seriesEligible: c.seriesEligible,
    withTotalReturn: c.withTotalReturn,
    excludedNoConfirmedTotalReturn: c.excludedNoConfirmedTotalReturn,
    exclusionsByReason: c.reasons || countBy(excluded, (e) => e.reason),
    exclusionsByBucket: countBy(excluded, (e) => e.bucket || "NONE"),
    reconstruction: {
      TOTAL_RETURN_RECONSTRUCTED: c.TOTAL_RETURN_RECONSTRUCTED,
      REJECTED_DIVIDEND_GAP: c.REJECTED_DIVIDEND_GAP,
      REJECTED_SPLIT_GAP: c.REJECTED_SPLIT_GAP,
      REJECTED_IDENTITY: c.REJECTED_IDENTITY,
      REJECTED_OTHER: c.REJECTED_OTHER
    },
    listingSegmentCuts: c.listingSegmentCuts,
    outcomeUnavailableNoTotalReturnLevel: c.outcomeUnavailableNoTotalReturnLevel
  };
}

/** Vergleicht zwei Studien (Objekte). Rein, ohne Dateizugriff. */
export function compareStudies(price, total) {
  assertInputs(price, total);
  const coverage = coverageOf(total);
  const pH = horizonsOf(price), tH = new Map(horizonsOf(total).map((h) => [h.key, h]));
  const horizons = pH.map((h) => {
    const t = tH.get(h.key);
    if (!t) throw new Error("Horizont " + h.horizon + " fehlt in der Gesamtrendite-Studie");
    return compareHorizon(h, t);
  });
  const primary = horizons.find((h) => h.primary);
  const pop = (s) => ({ seriesUsed: s.population.seriesUsed, observations: s.population.observations, firstDate: s.population.firstDate, lastDate: s.population.lastDate });
  const state = coverage.state === "PASS" ? "PASS" : "BELOW_MINIMUM_SHARE";
  return {
    schemaVersion: REPORT_SCHEMA,
    state,
    decision: state === "PASS"
      ? "Abdeckung erreicht. Vergleich fachlich pruefen; Aktivierung nur ueber den Fachmodell-PR (pattern-research-1.2.0)."
      : "ABBRUCH laut FV-5: Abdeckung unter " + coverage.minimumShare + ". Zuerst die Ausschluesse pruefen (Runbook R3), keine Aktivierung.",
    inputs: {
      price: { schemaVersion: price.schemaVersion, methodologyVersion: price.methodologyVersion, returnType: price.returnType || "PRICE_RETURN", contentHash: price.contentHash, generatedAt: price.generatedAt },
      total: {
        schemaVersion: total.schemaVersion, methodologyVersion: total.methodologyVersion, returnType: total.returnType, contentHash: total.contentHash, generatedAt: total.generatedAt,
        contract: total.returnBasis.contract, corporateActionContract: total.returnBasis.corporateActionContract,
        weeklyContract: total.returnBasis.weeklyContract, mixed: total.returnBasis.mixed
      }
    },
    comparability: {
      paired: false,
      note: "Nicht gepaart: Die Gesamtrendite-Studie laesst Titel ohne bestaetigte Gesamtrendite ganz weg und zaehlt Beobachtungen ohne Gesamtrendite-Wochenwert im Horizont als nicht verfuegbar. Unterschiede in Basisquote und Urteil mischen daher Renditebasis und Population.",
      seriesDropped: price.population.seriesUsed - total.population.seriesUsed,
      observationsDropped: price.population.observations - total.population.observations
    },
    coverage,
    population: { price: pop(price), total: pop(total) },
    summary: {
      primaryHorizon: primary.horizon,
      primaryWinnerThreshold: primary.winnerThreshold,
      baseRate: { price: primary.price.baseRate, total: primary.total.baseRate, delta: primary.deltaBaseRate },
      hypotheses: { price: primary.price.hypotheses, total: primary.total.hypotheses },
      verdicts: { price: primary.price.verdicts, total: primary.total.verdicts },
      robust: primary.robust,
      verdictChanges: Object.values(primary.verdictTransitions).reduce((a, b) => a + b, 0),
      robustByHorizon: Object.fromEntries(horizons.map((h) => [h.horizon, h.robust]))
    },
    baseRateGrid: compareGrid(price, total),
    horizons
  };
}

/** Kurzfassung fuer das Repository: dieselben Aggregate, je Horizont aber
    nur die Hypothesen, die in einer der beiden Basen ROBUST sind oder ihr
    Urteil wechseln, als kompakte Zeile. */
export const SUMMARY_COLUMNS = ["patternId", "verdictPrice", "verdictTotal", "liftPrice", "liftTotal", "oosLiftPrice", "oosLiftTotal", "supportPrice", "supportTotal"];
export function summarizeReport(report) {
  const { horizons, ...rest } = report;
  return {
    ...rest,
    schemaVersion: REPORT_SCHEMA + "+summary",
    horizons: horizons.map(({ findings, ...h }) => ({
      ...h,
      robustOrChangedColumns: SUMMARY_COLUMNS,
      robustOrChanged: findings
        .filter((f) => f.verdictChanged || (f.price && f.price.robust) || (f.total && f.total.robust))
        .map((f) => [f.patternId,
          f.price ? f.price.verdict : null, f.total ? f.total.verdict : null,
          f.price ? f.price.lift : null, f.total ? f.total.lift : null,
          f.price ? f.price.outOfSampleLift : null, f.total ? f.total.outOfSampleLift : null,
          f.price ? f.price.support : null, f.total ? f.total.support : null])
    }))
  };
}

/* ---------------------------------------------------------------------------
   Gepaarter Vergleich A/B/C
   --------------------------------------------------------------------------- */
export const PAIRED_SCHEMA = "pattern-return-basis-paired-1.0.0";

/* Familie je vorregistriertem Kandidaten (pattern-research-1.1.0). Ein Paar
   gehoert zu beiden Familien seiner Glieder. */
export const FAMILY_OF = {
  "strong-12m-momentum": "MOMENTUM_12M", "very-strong-12m-momentum": "MOMENTUM_12M", "weak-12m-momentum": "MOMENTUM_12M",
  "six-month-thrust": "SCHUB", "three-month-thrust": "SCHUB",
  "near-52w-high": "NAEHE_HOCH", "at-all-time-high": "NAEHE_HOCH",
  "far-below-52w-high": "ABSTAND_HOCH", "deep-drawdown": "ABSTAND_HOCH",
  "above-40w-line": "TREND", "trend-stacked": "TREND",
  "quiet-range": "SPANNE", "wide-range": "SPANNE",
  "high-volatility": "VOLATILITAET", "low-volatility": "VOLATILITAET",
  "up-volume-dominance": "VOLUMEN", "volume-accumulation": "VOLUMEN", "volume-dry-up-near-high": "VOLUMEN"
};
export function familiesOf(patternId) {
  return [...new Set(String(patternId).split("+").map((id) => FAMILY_OF[id] || "SONSTIGE"))].sort();
}

/* Zerlegung je Hypothese aus dem ROBUST-Status in A, B, C. */
export const DECOMPOSITION = {
  "RRR": "KEPT",
  "R--": "LOST_BY_POPULATION",
  "RR-": "LOST_BY_RETURN",
  "R-R": "LOST_BY_POPULATION_RECOVERED_BY_RETURN",
  "-RR": "GAINED_BY_POPULATION",
  "--R": "GAINED_BY_RETURN",
  "-R-": "GAINED_BY_POPULATION_LOST_BY_RETURN",
  "---": "NEVER"
};

function assertPaired(price, pop, total, diagnostics) {
  const problems = [];
  const sel = pop.population && pop.population.populationSelection;
  if (pop.returnType === "TOTAL_RETURN" || pop.population.totalReturn === true) problems.push("--price-population ist eine Gesamtrendite-Studie");
  if (!sel || sel.basis !== "TOTAL_RETURN_CONFIRMED") problems.push("--price-population traegt keine populationSelection TOTAL_RETURN_CONFIRMED");
  if (price.population && price.population.populationSelection) problems.push("--price ist bereits eine Populationsauswahl");
  if (total.returnType !== "TOTAL_RETURN" || !total.population.totalReturnCoverage) problems.push("--total ist keine Gesamtrendite-Studie");
  for (const s of [pop, total]) {
    if (s.methodologyVersion !== price.methodologyVersion) problems.push("Methodik verschieden: " + s.methodologyVersion);
    if (s.schemaVersion !== price.schemaVersion) problems.push("Schema verschieden: " + s.schemaVersion);
  }
  if (problems.length) throw new Error("Gepaarter Vergleich verweigert: " + problems.join("; "));
  const ids = (list) => (list || []).map((e) => e.securityId).sort().join("|");
  if (ids(sel.excluded) !== ids(total.population.totalReturnCoverage.excluded)) problems.push("ausgeschlossene Kennungen verschieden");
  if (pop.population.seriesUsed !== total.population.seriesUsed) problems.push("seriesUsed " + pop.population.seriesUsed + " gegen " + total.population.seriesUsed);
  if (pop.population.observations !== total.population.observations) problems.push("Beobachtungen " + pop.population.observations + " gegen " + total.population.observations);
  const tH = new Map(horizonsOf(total).map((h) => [h.key, h]));
  for (const h of horizonsOf(pop)) {
    const t = tH.get(h.key);
    if (!t || t.usableObservations !== h.usableObservations) problems.push("auswertbare Beobachtungen " + h.horizon + " verschieden");
  }
  if (diagnostics && diagnostics.studyContentHash !== pop.contentHash) problems.push("paired-diagnostics gehoert zu einer anderen Studie");
  if (problems.length) throw new Error("Nicht gepaart: " + problems.join("; "));
}

const ln = (x) => (typeof x === "number" && x > 0 ? Math.log(x) : null);
const lnDiff = (from, to) => (ln(from) !== null && ln(to) !== null ? round(ln(to) - ln(from), 4) : null);

/* Warum ein in A ROBUSTer Befund in C nicht mehr ROBUST ist: Teil durch die
   Population (A->B) und Teil durch die Rendite (B->C), letzterer zerlegt in
   Gewinnerquote im Muster und Basisquote (Lift = Gewinnerquote / Basisquote,
   also ln Lift = ln Gewinnerquote - ln Basisquote). */
export function lossCause(a, b, c, d) {
  const condTerm = lnDiff(b && b.conditionalRate, c && c.conditionalRate);
  const baseRise = lnDiff(b && b.baseRate, c && c.baseRate);
  let driver = null;
  if (condTerm !== null && baseRise !== null) {
    if (condTerm < 0) driver = "GEWINNERQUOTE_SINKT";
    else if (baseRise > condTerm) driver = "BASISQUOTE_STEIGT_STAERKER";
    else driver = "SONSTIGES";
  }
  const out = {
    lnLiftPopulation: lnDiff(a && a.lift, b && b.lift),
    lnLiftReturn: lnDiff(b && b.lift, c && c.lift),
    lnConditionalRateReturn: condTerm,
    lnBaseRateReturn: baseRise,
    driver,
    conditionalRate: { B: b ? b.conditionalRate : null, C: c ? c.conditionalRate : null },
    baseRate: { B: b ? b.baseRate : null, C: c ? c.baseRate : null }
  };
  if (d) {
    out.outsideRate = { B: d.outsideRatePrice, C: d.outsideRateTotal };
    out.relativeRise = {
      inside: d.conditionalRatePrice ? round(d.conditionalRateTotal / d.conditionalRatePrice - 1, 4) : null,
      outside: d.outsideRatePrice ? round(d.outsideRateTotal / d.outsideRatePrice - 1, 4) : null
    };
    out.payerShare = { inside: d.payerShareInside, outside: d.payerShareOutside };
    out.medianTrailingYield = { inside: d.medianTrailingYieldInside, outside: d.medianTrailingYieldOutside };
    out.medianRealizedYield = { inside: d.medianRealizedYieldInside, outside: d.medianRealizedYieldOutside };
  }
  return out;
}

const sideOf = (f) => (f ? {
  verdict: f.verdict, robust: f.verdict === "ROBUST", support: f.support, winners: f.winners,
  baseRate: round(f.baseRate), conditionalRate: round(f.conditionalRate), lift: round(f.lift, 4), outOfSampleLift: round(oosLift(f), 4)
} : null);

const medianOf = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((p, q) => p - q);
  if (!v.length) return null;
  const m = v.length >> 1;
  return round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2, 4);
};

function pairedHorizon(hA, hB, hC, dH) {
  const by = (list) => new Map((list || []).map((f) => [f.patternId, f]));
  const mA = by(hA.findings), mB = by(hB.findings), mC = by(hC.findings);
  const mD = dH ? new Map(dH.patterns.map((p) => [p.patternId, p])) : new Map();
  const ids = [...new Set([...mA.keys(), ...mB.keys(), ...mC.keys()])].sort();
  const decomposition = Object.fromEntries(Object.values(DECOMPOSITION).map((k) => [k, 0]));
  const hypotheses = [], lost = [];
  for (const id of ids) {
    const a = sideOf(mA.get(id)), b = sideOf(mB.get(id)), c = sideOf(mC.get(id));
    const key = (a && a.robust ? "R" : "-") + (b && b.robust ? "R" : "-") + (c && c.robust ? "R" : "-");
    const cls = DECOMPOSITION[key];
    decomposition[cls] += 1;
    hypotheses.push({ patternId: id, families: familiesOf(id), decomposition: cls, A: a, B: b, C: c });
    if (a && a.robust && !(c && c.robust)) {
      lost.push({
        patternId: id, families: familiesOf(id), decomposition: cls,
        verdict: { A: a.verdict, B: b && b.verdict, C: c && c.verdict },
        lift: { A: a.lift, B: b && b.lift, C: c && c.lift },
        outOfSampleLift: { A: a.outOfSampleLift, B: b && b.outOfSampleLift, C: c && c.outOfSampleLift },
        support: { A: a.support, B: b && b.support, C: c && c.support },
        cause: lossCause(a, b, c, mD.get(id))
      });
    }
  }
  const robust = (m) => [...m.values()].filter((f) => f.verdict === "ROBUST").length;
  const lostByFamily = {};
  for (const l of lost) for (const fam of l.families) lostByFamily[fam] = (lostByFamily[fam] || 0) + 1;
  const kept = hypotheses.filter((h) => h.decomposition === "KEPT");
  return {
    horizon: hA.horizon, horizonMonths: hA.horizonMonths, primary: hA.key === PRIMARY_KEY,
    usableObservations: { A: hA.usableObservations, B: hB.usableObservations, C: hC.usableObservations },
    winners: { A: hA.winners, B: hB.winners, C: hC.winners },
    baseRate: { A: round(hA.baseRate), B: round(hB.baseRate), C: round(hC.baseRate),
      populationEffect: diff(hA.baseRate, hB.baseRate), returnEffect: diff(hB.baseRate, hC.baseRate) },
    robust: { A: robust(mA), B: robust(mB), C: robust(mC) },
    decomposition,
    medianLiftKept: { A: medianOf(kept.map((h) => h.A.lift)), B: medianOf(kept.map((h) => h.B.lift)), C: medianOf(kept.map((h) => h.C.lift)) },
    lost: {
      count: lost.length,
      byFamily: Object.fromEntries(Object.entries(lostByFamily).sort((x, y) => x[0].localeCompare(y[0]))),
      byDriver: countBy(lost, (l) => l.cause.driver || "UNBEKANNT"),
      medianLnLiftPopulation: medianOf(lost.map((l) => l.cause.lnLiftPopulation)),
      medianLnLiftReturn: medianOf(lost.map((l) => l.cause.lnLiftReturn)),
      findings: lost
    },
    hypotheses
  };
}

/* Mechanismus: "Dividenden heben die Vergleichsgruppe ueber die
   Verdopplungsschwelle". Drei pruefbare Folgerungen je Horizont:
     1. Neue Gewinner (nur in Gesamtrendite) kommen ueberproportional aus
        Ausschuettern: Quote neuer Gewinner im obersten Quartil der
        Ausschuettungsrendite (ex ante) groesser als bei Nicht-Ausschuettern.
     2. Die verlorenen Muster schuetten weniger aus als ihre Vergleichsgruppe
        (Anteil Ausschuetter im Muster < ausserhalb) - bei mindestens zwei
        Dritteln der verlorenen Befunde.
     3. Die Vergleichsgruppe gewinnt relativ mehr Gewinner hinzu als das
        Muster - bei mindestens zwei Dritteln der verlorenen Befunde.
   Alle drei: BESTAETIGT; mindestens eine: TEILWEISE; keine: NICHT_BESTAETIGT;
   ohne verlorene Befunde: NICHT_ANWENDBAR (die Buckets stehen trotzdem da). */
export function mechanismOf(dH, lost) {
  const bucket = (yields, id) => yields.buckets.find((b) => b.bucket === id);
  const newRate = (b) => (b && b.observations ? b.newWinners / b.observations : null);
  const t = dH.trailingYield, r = dH.realizedYield;
  const none = bucket(t, "NONE"), q4 = bucket(t, "Q4");
  const c1 = newRate(q4) !== null && newRate(none) !== null ? newRate(q4) > newRate(none) : null;
  const withPayer = lost.filter((l) => l.cause.payerShare && l.cause.payerShare.inside !== null && l.cause.payerShare.outside !== null);
  const lowerPayer = withPayer.filter((l) => l.cause.payerShare.inside < l.cause.payerShare.outside).length;
  const withRise = lost.filter((l) => l.cause.relativeRise && l.cause.relativeRise.inside !== null && l.cause.relativeRise.outside !== null);
  const outsideRisesMore = withRise.filter((l) => l.cause.relativeRise.outside > l.cause.relativeRise.inside).length;
  const c2 = withPayer.length ? lowerPayer / withPayer.length >= 2 / 3 : null;
  const c3 = withRise.length ? outsideRisesMore / withRise.length >= 2 / 3 : null;
  const passed = [c1, c2, c3].filter((x) => x === true).length;
  const state = !lost.length ? "NICHT_ANWENDBAR" : passed === 3 ? "BESTAETIGT" : passed > 0 ? "TEILWEISE" : "NICHT_BESTAETIGT";
  const slim = (y) => ({ measured: y.measured, withoutYield: y.withoutYield, buckets: y.buckets.map((b) => ({ ...b, newWinnerRate: round(newRate(b)) })) });
  return {
    horizon: dH.horizon,
    state,
    usableObservations: dH.usableObservations,
    newWinners: dH.newWinners, lostWinners: dH.lostWinners,
    baseRate: { B: dH.baseRatePrice, C: dH.baseRateTotal },
    checks: {
      newWinnersFromPayers: { passed: c1, newWinnerRateNone: round(newRate(none)), newWinnerRateTopQuartile: round(newRate(q4)) },
      lostPatternsPayLess: { passed: c2, lostFindings: withPayer.length, payerShareInsideBelowOutside: lowerPayer },
      comparisonGroupRisesMore: { passed: c3, lostFindings: withRise.length, outsideRelativeRiseAboveInside: outsideRisesMore }
    },
    trailingYield: slim(t),
    realizedYield: slim(r)
  };
}

export function comparePaired(price, pop, total, diagnostics = null) {
  assertPaired(price, pop, total, diagnostics);
  const hA = horizonsOf(price);
  const hB = new Map(horizonsOf(pop).map((h) => [h.key, h])), hC = new Map(horizonsOf(total).map((h) => [h.key, h]));
  const dByH = diagnostics ? new Map(diagnostics.horizons.map((h) => [h.horizon, h])) : new Map();
  const horizons = hA.map((a) => pairedHorizon(a, hB.get(a.key), hC.get(a.key), dByH.get(a.horizon)));
  const mechanism = diagnostics ? horizons.map((h) => mechanismOf(dByH.get(h.horizon), h.lost.findings)) : null;
  const run = (s) => ({ contentHash: s.contentHash, seriesUsed: s.population.seriesUsed, observations: s.population.observations });
  return {
    schemaVersion: PAIRED_SCHEMA,
    runs: {
      A: { label: "Kursrendite, volle Population", ...run(price) },
      B: { label: "Kursrendite, Gesamtrendite-Population", ...run(pop),
        outcomeUnavailableNoTotalReturnLevel: pop.population.populationSelection.outcomeUnavailableNoTotalReturnLevel },
      C: { label: "Gesamtrendite, Gesamtrendite-Population", ...run(total) }
    },
    paired: true,
    pairing: "B und C: gleiche ausgeschlossene Kennungen, gleiche Beobachtungen, gleiche auswertbare Beobachtungen je Horizont (geprueft).",
    effects: "Populationseffekt = B - A, Renditeeffekt = C - B.",
    winnerThreshold: diagnostics ? diagnostics.winnerThreshold : null,
    payerMinYield: diagnostics ? diagnostics.payerMinYield : null,
    decompositionLegend: DECOMPOSITION,
    families: FAMILY_OF,
    summary: Object.fromEntries(horizons.map((h, i) => [h.horizon, {
      baseRate: h.baseRate, robust: h.robust, decomposition: h.decomposition,
      lostByFamily: h.lost.byFamily, lostByDriver: h.lost.byDriver,
      mechanism: mechanism ? mechanism[i].state : null
    }])),
    horizons,
    mechanism
  };
}

/* Kurzfassung fuers Repository: alles ausser den Zeilen der Hypothesen, die
   in keiner der drei Rechnungen ROBUST sind; Hypothesen als kompakte Zeile. */
export const PAIRED_COLUMNS = ["patternId", "decomposition", "verdictA", "verdictB", "verdictC", "liftA", "liftB", "liftC", "oosLiftA", "oosLiftB", "oosLiftC"];
export function summarizePaired(report) {
  return {
    ...report,
    schemaVersion: PAIRED_SCHEMA + "+summary",
    horizons: report.horizons.map(({ hypotheses, ...h }) => ({
      ...h,
      hypothesesColumns: PAIRED_COLUMNS,
      hypotheses: hypotheses.filter((x) => x.decomposition !== "NEVER").map((x) => [x.patternId, x.decomposition,
        x.A && x.A.verdict, x.B && x.B.verdict, x.C && x.C.verdict,
        x.A && x.A.lift, x.B && x.B.lift, x.C && x.C.lift,
        x.A && x.A.outOfSampleLift, x.B && x.B.outOfSampleLift, x.C && x.C.outOfSampleLift])
    }))
  };
}

function main(argv) {
  const argOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const priceDir = argOf("--price"), totalDir = argOf("--total"), out = argOf("--out");
  if (!priceDir || !totalDir || !out) {
    process.stderr.write("Aufruf: compare-pattern-return-basis.mjs --price <dir> --total <dir> --out <bericht.json> [--summary-out <kurz.json>] [--strict]\n");
    return 64;
  }
  const report = compareStudies(readStudy(resolve(priceDir)), readStudy(resolve(totalDir)));
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify(report, null, 1) + "\n");
  const summaryOut = argOf("--summary-out");
  if (summaryOut) {
    mkdirSync(dirname(resolve(summaryOut)), { recursive: true });
    writeFileSync(resolve(summaryOut), JSON.stringify(summarizeReport(report), null, 1) + "\n");
  }
  const popDir = argOf("--price-population");
  if (popDir) {
    const popPath = resolve(popDir);
    const diagFile = join(popPath, "paired-diagnostics.json");
    const diagnostics = existsSync(diagFile) ? JSON.parse(readFileSync(diagFile, "utf8")) : null;
    const paired = comparePaired(readStudy(resolve(priceDir)), readStudy(popPath), readStudy(resolve(totalDir)), diagnostics);
    for (const [flag, body] of [["--paired-out", paired], ["--paired-summary-out", summarizePaired(paired)]]) {
      const file = argOf(flag);
      if (!file) continue;
      mkdirSync(dirname(resolve(file)), { recursive: true });
      writeFileSync(resolve(file), JSON.stringify(body, null, 1) + "\n");
    }
    for (const [h, x] of Object.entries(paired.summary)) {
      process.stdout.write("Gepaart " + h + ": Basisquote A/B/C " + x.baseRate.A + "/" + x.baseRate.B + "/" + x.baseRate.C +
        ", ROBUST " + x.robust.A + "/" + x.robust.B + "/" + x.robust.C + ", " + JSON.stringify(x.decomposition) + ", Mechanismus " + x.mechanism + "\n");
    }
  }
  const s = report.summary, c = report.coverage;
  process.stdout.write(
    "Musterstudie Kurs -> Gesamtrendite: " + report.state + "\n" +
    "  Abdeckung " + c.withTotalReturn + "/" + c.seriesEligible + " (" + c.share + ", Mindestanteil " + c.minimumShare + "), Ausschluesse " + JSON.stringify(c.exclusionsByReason) + "\n" +
    "  " + s.primaryHorizon + "/" + s.primaryWinnerThreshold + " Basisquote " + s.baseRate.price + " -> " + s.baseRate.total + "\n" +
    "  ROBUST " + s.robust.price + " -> " + s.robust.total + " (gehalten " + s.robust.kept + ", neu " + s.robust.gained + ", verloren " + s.robust.lost + "), Urteilswechsel " + s.verdictChanges + "\n" +
    "  Urteile vorher " + JSON.stringify(s.verdicts.price) + "\n  Urteile nachher " + JSON.stringify(s.verdicts.total) + "\n"
  );
  if (argv.includes("--strict") && report.state !== "PASS") {
    process.stderr.write("BELOW_MINIMUM_SHARE: Abbruch laut FV-5, zuerst die Ausschluesse pruefen.\n");
    return 2;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
