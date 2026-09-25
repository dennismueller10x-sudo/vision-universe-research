#!/usr/bin/env node
/* =========================================================================
   Materialize the Pattern Research study (M4).

   Reads only artifacts that already exist:
     quant/data/market/discover-series-long/ref_*.json   weekly closes, MAX
     quant/methodology/pattern-research-v1.json          the pre-registration

   Writes quant/data/product/pattern-research-v1/. No provider is called,
   no history is fetched, no pipeline is created, Discovery is untouched -
   these series are the Discovery workstream's canonical output and are
   read here, never written.

   WHAT THIS ANSWERS

   Did titles that later rose a great deal look different beforehand from
   titles that did not? Winners and non-winners come from the same
   population and the same observation grid. There is no curated list of
   famous names, and a single title never carries a finding.

   WHAT IT DOES NOT ANSWER

   Whether any title will rise. That is a forecast, and no field here
   carries one; the publication gate refuses a study that tries.
   ========================================================================= */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runStudy, maskColumns, round } from "./lib/pattern-study.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Patterns = require(join(ROOT, "quant/engines/pattern-research.js"));

const SERIES_DIR = join(ROOT, "quant/data/market/discover-series-long");
const OUT_DIR = join(ROOT, "quant/data/product/pattern-research-v1");
const methodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/pattern-research-v1.json"), "utf8"));

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : null;

const WEEK_MS = 7 * 86400000;
const finite = (value) => typeof value === "number" && Number.isFinite(value);

/* ---------------------------------------------------------------------------
   1. Read the canonical weekly series and build the observation grid.

   The grid is the last weekly close of each calendar month. Monthly spacing
   with a multi-year horizon means consecutive observations of one title
   overlap heavily; that is stated in the study rather than hidden, and it is
   why the out-of-sample fold - not the nominal p-value - is the gate.
   --------------------------------------------------------------------------- */
function loadSeries() {
  const files = readdirSync(SERIES_DIR).filter((file) => file.startsWith("ref_") && file.endsWith(".json"));
  const wanted = LIMIT ? files.slice(0, LIMIT) : files;
  const series = [];
  const rejected = { status: 0, grain: 0, basis: 0, short: 0 };
  for (const file of wanted) {
    const payload = JSON.parse(readFileSync(join(SERIES_DIR, file), "utf8"));
    if (payload.schemaVersion !== "discover-series-long-1.0.0" || payload.status !== "CALCULATED") { rejected.status += 1; continue; }
    if (payload.grain !== "weekly") { rejected.grain += 1; continue; }
    if (payload.priceSeriesType !== "SPLIT_ADJUSTED") { rejected.basis += 1; continue; }
    const points = payload.points || [];
    if (points.length < methodology.observationGrid.minimumHistoryWeeks + 52) { rejected.short += 1; continue; }
    series.push({
      ticker: payload.ticker,
      securityId: payload.securityId,
      dates: points.map((point) => point[0]),
      closes: points.map((point) => point[1])
    });
  }
  return { series, rejected, considered: wanted.length };
}

function monthEndIndices(dates, minimumHistory) {
  const out = [];
  for (let i = minimumHistory; i < dates.length; i++) {
    const thisMonth = dates[i].slice(0, 7);
    const nextMonth = i + 1 < dates.length ? dates[i + 1].slice(0, 7) : null;
    if (nextMonth === null || nextMonth !== thisMonth) out.push(i);
  }
  return out;
}

/* ---------------------------------------------------------------------------
   2. One pass over every title, producing observations that carry the
      features at t and the forward outcome for every horizon. Features are
      computed once; a cohort is then only a comparison, so adding a horizon
      or a threshold never recomputes a feature and never risks the two
      drifting apart.
   --------------------------------------------------------------------------- */
function buildObservations(series) {
  const horizons = methodology.horizons;
  const minimumHistory = methodology.observationGrid.minimumHistoryWeeks;
  const observations = [];
  let skippedNoFeatures = 0;

  for (const entry of series) {
    const indices = monthEndIndices(entry.dates, minimumHistory);
    const context = { runningMax: Patterns.runningMaxOf(entry.closes) };
    for (const index of indices) {
      const features = Patterns.featuresAt(entry.closes, index, context);
      if (!features) { skippedNoFeatures += 1; continue; }
      const forward = {};
      for (const horizon of horizons) {
        const outcome = Patterns.outcomeAfter(entry.closes, index, horizon.weeks);
        forward[horizon.id] = outcome.state === "AVAILABLE"
          ? { r: outcome.forwardReturn, dd: outcome.maxDrawdownWithinHorizon, max: outcome.maxForwardReturn }
          : null;
      }
      observations.push({
        ticker: entry.ticker,
        date: entry.dates[index],
        t: Math.floor(Date.parse(entry.dates[index]) / WEEK_MS),
        features,
        forward
      });
    }
  }
  return { observations, skippedNoFeatures };
}

/* The study machinery lives in scripts/quant/lib/pattern-study.mjs, shared
   with the PIT fundamental family. One implementation, because two studies
   measured slightly differently are not comparable and the difference would
   never announce itself. Only what is specific to this family stays here:
   its pattern set. */
function patternSet() {
  const singles = methodology.candidates.map((candidate, index) => ({
    id: candidate.id, kind: "SINGLE", plain: candidate.plain, terms: [candidate], mask: 1 << index
  }));
  const pairs = [];
  for (let i = 0; i < methodology.candidates.length; i++) {
    for (let j = i + 1; j < methodology.candidates.length; j++) {
      const a = methodology.candidates[i], b = methodology.candidates[j];
      /* Two conditions on the same feature are a range, not an interaction,
         and several of them are empty by construction. Skipped on purpose. */
      if (a.feature === b.feature) continue;
      pairs.push({ id: a.id + "+" + b.id, kind: "PAIR", plain: a.plain + " UND " + b.plain,
                   terms: [a, b], mask: (1 << i) | (1 << j) });
    }
  }
  return singles.concat(pairs);
}

/* ------------------------------------------------------------------------- */
function main() {
  const started = Date.now();
  const { series, rejected, considered } = loadSeries();
  if (!series.length) throw new Error("no usable long series found; nothing to study");

  const { observations, skippedNoFeatures } = buildObservations(series);
  const patterns = patternSet();
  const horizons = Object.fromEntries(methodology.horizons.map((h) => [h.id, h]));
  const thresholds = Object.fromEntries(methodology.winnerThresholds.map((w) => [w.id, w]));

  /* The primary study in full, and the base rates across every horizon and
     threshold so the primary choice can be seen in context rather than
     taken on trust. */
  const candidateMasks = maskColumns(observations, methodology.candidates);
  const config = {
    candidates: methodology.candidates,
    robustness: methodology.robustness,
    alpha: methodology.preRegistration.alpha,
    frictions: methodology.frictions
  };
  const primary = runStudy(observations, candidateMasks, horizons[methodology.primary.horizon], thresholds[methodology.primary.winner], patterns, config);

  const grid = [];
  for (const horizon of methodology.horizons) {
    for (const threshold of methodology.winnerThresholds) {
      let usable = 0, winners = 0, unavailable = 0;
      for (const observation of observations) {
        const outcome = observation.forward[horizon.id];
        if (outcome === null) { unavailable += 1; continue; }
        usable += 1;
        if (outcome.r >= threshold.minReturn) winners += 1;
      }
      grid.push({
        horizon: horizon.id, horizonMonths: horizon.months, winnerThreshold: threshold.id,
        minReturn: threshold.minReturn, usableObservations: usable, winners,
        baseRate: round(usable ? winners / usable : null),
        outcomeUnavailable: unavailable
      });
    }
  }

  /* The same full study on the other three horizons at the primary
     threshold, so a pattern can be checked for horizon sensitivity - a
     finding that exists only at 24 months is a finding about 24 months. */
  const secondary = methodology.horizons
    .filter((horizon) => horizon.id !== methodology.primary.horizon)
    .map((horizon) => runStudy(observations, candidateMasks, horizon, thresholds[methodology.primary.winner], patterns, config));

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const study = {
    schemaVersion: Patterns.STUDY_SCHEMA,
    methodologyVersion: Patterns.METHODOLOGY_VERSION,
    generatedAt,
    backtest: "NOT_CERTIFIED",
    publication: methodology.publication,
    question: methodology.question,
    population: {
      source: methodology.population.source,
      seriesConsidered: considered,
      seriesUsed: series.length,
      seriesRejected: rejected,
      priceSeriesType: "SPLIT_ADJUSTED",
      totalReturn: false,
      totalReturnNote: methodology.population.totalReturnNote,
      observations: observations.length,
      skippedNoFeatures,
      firstDate: observations.reduce((min, o) => (o.date < min ? o.date : min), observations[0].date),
      lastDate: observations.reduce((max, o) => (o.date > max ? o.date : max), observations[0].date)
    },
    survivorship: methodology.survivorshipBias,
    independence: {
      state: "OVERLAPPING_OBSERVATIONS",
      note: "Der Beobachtungsraster ist monatlich, die Horizonte sind mehrjaehrig. Aufeinanderfolgende Beobachtungen desselben Titels teilen ihren Ausgang fast vollstaendig. Nominale p-Werte unterschaetzen die Unsicherheit deshalb systematisch. Sie stehen im Artefakt, sind aber nicht das Kriterium: das Kriterium ist der Lift im gesperrten Out-of-Sample-Block."
    },
    thresholds: {
      minimumSupport: methodology.robustness.minimumSupport,
      minimumWinners: methodology.robustness.minimumWinners,
      unstableIfRelativeSpreadAbove: methodology.robustness.parameterStability.unstableIfRelativeSpreadAbove,
      flagIfTestLiftBelow: methodology.robustness.outOfSample.flagIfTestLiftBelow
    },
    frictions: methodology.frictions,
    primary,
    baseRateGrid: grid,
    secondaryHorizons: secondary.map((entry) => ({
      horizon: entry.horizon, horizonMonths: entry.horizonMonths, baseRate: entry.baseRate,
      usableObservations: entry.usableObservations, winners: entry.winners,
      findings: entry.findings
    })),
    findings: primary.findings,
    runtimeMs: Date.now() - started
  };
  study.contentHash = createHash("sha256")
    .update(JSON.stringify({ ...study, contentHash: undefined, generatedAt: undefined, runtimeMs: undefined }))
    .digest("hex").slice(0, 16);

  const violations = Patterns.publicationViolations(study);
  if (violations.length) throw new Error("publication gate violated: " + violations.join("; "));

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "study.json"), JSON.stringify(study, null, 1) + "\n");

  const verdicts = {};
  for (const finding of primary.findings) verdicts[finding.verdict] = (verdicts[finding.verdict] || 0) + 1;
  process.stdout.write(
    "pattern-research " + Patterns.METHODOLOGY_VERSION + "\n" +
    "  " + series.length + " Reihen, " + observations.length + " Beobachtungen, " +
    study.population.firstDate + " bis " + study.population.lastDate + "\n" +
    "  primaer " + primary.horizon + " / " + primary.winnerThreshold +
    ": " + primary.usableObservations + " auswertbar, " + primary.winners + " Gewinner, Basisquote " +
    (primary.baseRate * 100).toFixed(2) + " %, " + primary.outcomeUnavailable + " ohne Ausgang\n" +
    "  " + primary.hypotheses + " getestete Hypothesen · " + JSON.stringify(verdicts) + "\n"
  );
  for (const finding of primary.findings.filter((f) => f.verdict === "ROBUST").slice(0, 12)) {
    process.stdout.write("    " + finding.lift.toFixed(2) + "x  oos " + (finding.outOfSample.lift || 0).toFixed(2) +
      "x  n=" + finding.support + "  w=" + finding.winners + "  " + finding.patternId + "\n");
  }
}

main();
