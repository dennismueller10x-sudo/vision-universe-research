#!/usr/bin/env node
/* =========================================================================
   Materialize the Pattern Research fundamental overlay (M4, second family).

   Reads only artifacts that already exist:
     quant/data/market/discover-series-long/ref_*.json     weekly closes
     quant/data/sec/consumer/CIK*.json                     PIT annual filings
     quant/methodology/pattern-research-v1.json            the price family
     quant/methodology/pattern-research-fundamentals-v1.json  this family

   Writes quant/data/product/pattern-research-fundamentals-v1/.

   THE QUESTION THIS FAMILY ADDS

   The price study asks what the chart looked like before a title ran. This
   one asks what the COMPANY looked like - and, in the cross pairs, whether
   a business property adds anything on top of what the chart already said.

   WHY IT IS A SEPARATE FILE AND A SEPARATE VERSION

   Writing these candidates into the price study would have changed that
   study's hypothesis count after it was measured, and a correction over a
   retroactively changed count is not a correction. The price study stays
   at pattern-research-1.0.0, unchanged and not restated.

   POINT-IN-TIME IS THE FILING DATE

   A fiscal year is visible only once it was filed. The population is
   therefore restricted to observations where at least one filing was
   visible - and the base rate is computed over that restricted population,
   because a lift against a base rate from a different population is not a
   lift at all.
   ========================================================================= */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runStudy, maskColumns, round, LOSS_THRESHOLD } from "./lib/pattern-study.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Patterns = require(join(ROOT, "quant/engines/pattern-research.js"));
const PIT = require(join(ROOT, "quant/engines/pit-fundamental-history.js"));

const SERIES_DIR = join(ROOT, "quant/data/market/discover-series-long");
const CONSUMER_DIR = join(ROOT, "quant/data/sec/consumer");
const OUT_DIR = join(ROOT, "quant/data/product/pattern-research-fundamentals-v1");

const priceMethodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/pattern-research-v1.json"), "utf8"));
const methodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/pattern-research-fundamentals-v1.json"), "utf8"));

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : null;

const WEEK_MS = 7 * 86400000;
const USABLE_FROM = methodology.coverageWindow.usableFrom + "-01-01";

/* The two pre-registered families, in one list so a mask bit means the same
   thing everywhere. Price candidates keep their original order and indices. */
const PRICE = priceMethodology.candidates;
const FUNDAMENTAL = methodology.candidates;
const ALL_CANDIDATES = PRICE.concat(FUNDAMENTAL);
const PRICE_COUNT = PRICE.length;

function loadSeries() {
  const files = readdirSync(SERIES_DIR).filter((file) => file.startsWith("ref_") && file.endsWith(".json"));
  const wanted = LIMIT ? files.slice(0, LIMIT) : files;
  const series = [];
  for (const file of wanted) {
    const payload = JSON.parse(readFileSync(join(SERIES_DIR, file), "utf8"));
    if (payload.schemaVersion !== "discover-series-long-1.0.0" || payload.status !== "CALCULATED") continue;
    if (payload.grain !== "weekly" || payload.priceSeriesType !== "SPLIT_ADJUSTED") continue;
    if ((payload.points || []).length < priceMethodology.observationGrid.minimumHistoryWeeks + 52) continue;
    series.push({
      ticker: payload.ticker,
      dates: payload.points.map((point) => point[0]),
      closes: payload.points.map((point) => point[1])
    });
  }
  return { series, considered: wanted.length };
}

/* The nine annual metrics the pre-registered features actually read. The
   consumer bundles carry about twenty, and 120 MB of JSON parsed whole
   would sit in memory for the length of the run for no reason. Trimming on
   load is not a shortcut: a metric that is not read cannot be read. */
const USED_METRICS = ["revenue", "net_income", "gross_profit", "free_cash_flow",
                      "capital_expenditures", "total_assets", "stockholders_equity",
                      "cash_and_equivalents", "shares_outstanding"];

/* One consumer bundle per ticker. A bundle can carry several tickers; each
   gets the same filings, which is what the issuer actually filed. */
function loadFundamentals(tickers) {
  const byTicker = new Map();
  let bundles = 0;
  for (const file of readdirSync(CONSUMER_DIR)) {
    if (!file.startsWith("CIK") || !file.endsWith(".json")) continue;
    const payload = JSON.parse(readFileSync(join(CONSUMER_DIR, file), "utf8"));
    const names = payload.tickers || [];
    if (!names.some((name) => tickers.has(name))) continue;
    bundles += 1;
    const annual = {};
    for (const metric of USED_METRICS) {
      if (Array.isArray(payload.annual?.[metric])) annual[metric] = payload.annual[metric];
    }
    const trimmed = { annual };
    for (const name of names) if (tickers.has(name)) byTicker.set(name, trimmed);
  }
  return { byTicker, bundles };
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

function buildObservations(series, fundamentalsByTicker) {
  const horizons = priceMethodology.horizons;
  const minimumHistory = priceMethodology.observationGrid.minimumHistoryWeeks;
  const observations = [];
  const dropped = { noFundamentals: 0, beforeCoverage: 0, noFeatures: 0 };

  for (const entry of series) {
    const bundle = fundamentalsByTicker.get(entry.ticker);
    if (!bundle) { dropped.noFundamentals += 1; continue; }
    const context = { runningMax: Patterns.runningMaxOf(entry.closes) };
    for (const index of monthEndIndices(entry.dates, minimumHistory)) {
      const date = entry.dates[index];
      if (date < USABLE_FROM) { dropped.beforeCoverage += 1; continue; }
      const priceFeatures = Patterns.featuresAt(entry.closes, index, context);
      if (!priceFeatures) { dropped.noFeatures += 1; continue; }
      /* The filing date decides. Nothing filed by this date means this
         observation has no fundamental evidence and leaves the population
         rather than entering it with empty conditions. */
      const fundamentalFeatures = PIT.featuresAt(bundle, date);
      if (!fundamentalFeatures) { dropped.noFundamentals += 1; continue; }

      const forward = {};
      for (const horizon of horizons) {
        const outcome = Patterns.outcomeAfter(entry.closes, index, horizon.weeks);
        forward[horizon.id] = outcome.state === "AVAILABLE"
          ? { r: outcome.forwardReturn, dd: outcome.maxDrawdownWithinHorizon, max: outcome.maxForwardReturn }
          : null;
      }
      observations.push({
        date,
        t: Math.floor(Date.parse(date) / WEEK_MS),
        features: { ...priceFeatures, ...fundamentalFeatures },
        forward
      });
    }
  }
  return { observations, dropped };
}

/* Fundamental singles, fundamental pairs, and the cross pairs that are the
   point of this family. Never a free search: every term comes from one of
   the two pre-registered lists. */
function patternSet() {
  const patterns = [];
  FUNDAMENTAL.forEach((candidate, index) => {
    patterns.push({ id: candidate.id, kind: "FUNDAMENTAL_SINGLE", plain: candidate.plain,
                    terms: [candidate], mask: 1 << (PRICE_COUNT + index) });
  });
  for (let i = 0; i < FUNDAMENTAL.length; i++) {
    for (let j = i + 1; j < FUNDAMENTAL.length; j++) {
      const a = FUNDAMENTAL[i], b = FUNDAMENTAL[j];
      if (a.feature === b.feature) continue;
      patterns.push({ id: a.id + "+" + b.id, kind: "FUNDAMENTAL_PAIR", plain: a.plain + " UND " + b.plain,
                      terms: [a, b], mask: (1 << (PRICE_COUNT + i)) | (1 << (PRICE_COUNT + j)) });
    }
  }
  for (let p = 0; p < PRICE.length; p++) {
    for (let f = 0; f < FUNDAMENTAL.length; f++) {
      const a = PRICE[p], b = FUNDAMENTAL[f];
      patterns.push({ id: a.id + "+" + b.id, kind: "CROSS_PAIR", plain: a.plain + " UND " + b.plain,
                      terms: [a, b], mask: (1 << p) | (1 << (PRICE_COUNT + f)),
                      halves: { price: { id: a.id, mask: 1 << p }, fundamental: { id: b.id, mask: 1 << (PRICE_COUNT + f) } } });
    }
  }
  return patterns;
}

function main() {
  const started = Date.now();
  const { series, considered } = loadSeries();
  const tickers = new Set(series.map((entry) => entry.ticker));
  const { byTicker, bundles } = loadFundamentals(tickers);
  const { observations, dropped } = buildObservations(series, byTicker);
  if (!observations.length) throw new Error("no observations with visible filings; nothing to study");

  const patterns = patternSet();
  const candidateMasks = maskColumns(observations, ALL_CANDIDATES);
  const horizon = priceMethodology.horizons.find((entry) => entry.id === priceMethodology.primary.horizon);
  const threshold = priceMethodology.winnerThresholds.find((entry) => entry.id === priceMethodology.primary.winner);
  const config = {
    candidates: ALL_CANDIDATES,
    robustness: methodology.robustness,
    alpha: methodology.preRegistration.alpha,
    frictions: priceMethodology.frictions
  };

  const primary = runStudy(observations, candidateMasks, horizon, threshold, patterns, config);

  /* For every cross pair, the lift of each half beside the lift of the pair.
     Without it a cross pair that merely repeats its stronger half would read
     as a discovery. */
  const byId = new Map(primary.findings.map((finding) => [finding.patternId, finding]));
  const columns = usableColumns(observations, candidateMasks, horizon, threshold);
  const halves = new Map();
  for (const pattern of patterns) {
    if (!pattern.halves) continue;
    for (const half of [pattern.halves.price, pattern.halves.fundamental]) {
      if (halves.has(half.id)) continue;
      halves.set(half.id, Patterns.evaluateMasked(columns, half.mask, half.id, LOSS_THRESHOLD));
    }
  }
  for (const pattern of patterns) {
    if (!pattern.halves) continue;
    const finding = byId.get(pattern.id);
    if (!finding) continue;
    const price = halves.get(pattern.halves.price.id);
    const fundamental = halves.get(pattern.halves.fundamental.id);
    finding.halves = {
      price: { id: pattern.halves.price.id, lift: round(price.lift, 4), support: price.support },
      fundamental: { id: pattern.halves.fundamental.id, lift: round(fundamental.lift, 4), support: fundamental.support }
    };
    const best = Math.max(price.lift || 0, fundamental.lift || 0);
    finding.incremental = finding.lift !== null && best > 0 ? round(finding.lift / best, 4) : null;
    finding.addsOverBetterHalf = finding.incremental !== null && finding.incremental > 1;
  }

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const study = {
    schemaVersion: Patterns.STUDY_SCHEMA,
    methodologyVersion: Patterns.METHODOLOGY_VERSION,
    familyVersion: methodology.methodologyVersion,
    family: "PIT_FUNDAMENTAL_OVERLAY",
    generatedAt,
    backtest: "NOT_CERTIFIED",
    publication: methodology.publication,
    question: methodology.question,
    pitSource: methodology.pitSource,
    coverageWindow: methodology.coverageWindow,
    population: {
      seriesConsidered: considered,
      seriesWithFundamentals: bundles,
      observations: observations.length,
      dropped,
      restriction: "Nur Beobachtungen, zu deren Stichtag mindestens eine Bilanz eingereicht war. Die Basisquote gilt fuer genau diese Grundgesamtheit.",
      firstDate: observations.reduce((min, o) => (o.date < min ? o.date : min), observations[0].date),
      lastDate: observations.reduce((max, o) => (o.date > max ? o.date : max), observations[0].date),
      priceSeriesType: "SPLIT_ADJUSTED",
      totalReturn: false,
      totalReturnNote: priceMethodology.population.totalReturnNote
    },
    survivorship: methodology.survivorshipBias,
    independence: {
      state: "OVERLAPPING_OBSERVATIONS",
      note: "Wie in der Kursstudie: monatlicher Raster, mehrjaehriger Horizont, also stark ueberlappende Ausgaenge. Massgeblich ist der Out-of-Sample-Lift, nicht der nominale p-Wert."
    },
    thresholds: {
      minimumSupport: methodology.robustness.minimumSupport,
      minimumWinners: methodology.robustness.minimumWinners,
      unstableIfRelativeSpreadAbove: methodology.robustness.parameterStability.unstableIfRelativeSpreadAbove,
      flagIfTestLiftBelow: methodology.robustness.outOfSample.flagIfTestLiftBelow
    },
    frictions: priceMethodology.frictions,
    primary,
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
    "pattern-research-fundamentals " + methodology.methodologyVersion + "\n" +
    "  " + bundles + " Emittenten mit Bilanzen, " + observations.length + " Beobachtungen, " +
    study.population.firstDate + " bis " + study.population.lastDate + "\n" +
    "  " + primary.horizon + " / " + primary.winnerThreshold + ": " + primary.usableObservations +
    " auswertbar, " + primary.winners + " Gewinner, Basisquote " + (primary.baseRate * 100).toFixed(2) + " %\n" +
    "  " + primary.hypotheses + " getestete Hypothesen · " + JSON.stringify(verdicts) + "\n"
  );
  const robust = primary.findings.filter((f) => f.verdict === "ROBUST");
  for (const finding of robust.slice(0, 12)) {
    const adds = finding.incremental === null || finding.incremental === undefined ? "" :
      "  +" + finding.incremental.toFixed(2) + "x ueber die bessere Haelfte";
    process.stdout.write("    " + finding.lift.toFixed(2) + "x  oos " + (finding.outOfSample.lift || 0).toFixed(2) +
      "x  n=" + finding.support + "  " + finding.patternId + adds + "\n");
  }
}

/* The column set the study itself builds, rebuilt here so the halves are
   measured on exactly the same population as the pairs - a half measured
   over a different population would make the comparison meaningless. */
function usableColumns(observations, candidateMasks, horizon, threshold) {
  const n = observations.length;
  const cohort = new Uint8Array(n), forward = new Float64Array(n), drawdown = new Float64Array(n);
  const keep = [];
  for (let i = 0; i < n; i++) {
    const outcome = observations[i].forward[horizon.id];
    if (outcome === null) { cohort[i] = 2; continue; }
    cohort[i] = outcome.r >= threshold.minReturn ? 1 : 0;
    forward[i] = outcome.r;
    drawdown[i] = outcome.dd;
    keep.push(i);
  }
  return Patterns.maskedSubset(
    { hit: candidateMasks.hit, measurable: candidateMasks.measurable, cohort, forward, drawdown }, keep);
}

main();
