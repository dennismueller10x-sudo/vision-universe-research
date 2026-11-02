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
