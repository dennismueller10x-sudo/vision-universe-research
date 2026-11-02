#!/usr/bin/env node
/* =========================================================================
   Materialize the Pattern Research study (M4).

   Reads only artifacts that already exist:
     quant/data/market/discover-series-long/ref_*.json   weekly closes, MAX
     quant/methodology/pattern-research-v1.json          the pre-registration
     --work-dir DIR/tiingo/daily/<securityId>.json      daily OHLCV (1.1.0)

   The daily bars exist only runner-private in GitHub Actions (restored from
   the durable store by sync-history-store.mjs). They feed the three volume
   features and nothing else, are read at run time and never written: the
   study carries aggregates only. Without --work-dir the volume features are
   null for every observation, the volume hypotheses fail minimum support,
   and the study says so in population.volumeCoverage.

   RETURN BASIS (--return-basis, Entscheidung FV-5 Schritt 2)

   Without the switch (or with --return-basis price) the study is exactly
   what it was: outcomes from the split-adjusted weekly closes. With
   --return-basis total the OUTCOMES (forward return, drawdown, best point
   within the horizon) come from the canonical total return
   (canonical-total-return-1.0.0, quant/engines/canonical-total-return.js,
   via scripts/quant/lib/daily-prices.mjs) sampled on the last trading day
   of each week (weekly-total-return-1.0.0) - the same reconstruction and
   the same weekly semantics as the signal study (build-signal-backtest.mjs).
   Detection and every feature stay on the split-adjusted weekly closes and
   the daily volume bars, as before. A title without a confirmed total
   return is excluded from the whole study and counted with its reason; the
   study never mixes the two bases. --return-basis total without --work-dir
   aborts: there is no silent fallback to price return.

   Writes quant/data/product/pattern-research-v1/ (or --out DIR). No provider is called,
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runStudy, maskColumns, round, pricePatternSet } from "./lib/pattern-study.mjs";
import { weekKey, weeklyFromDaily, WEEKLY_TOTAL_RETURN_VERSION } from "./lib/weekly-total-return.mjs";
import { workingStoreFromBars, TR_BASIS } from "./lib/daily-prices.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Patterns = require(join(ROOT, "quant/engines/pattern-research.js"));
const CTR = require(join(ROOT, "quant/engines/canonical-total-return.js"));

const args = process.argv.slice(2);
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
/* --series-dir and --out exist for tests (fixtures, scratch output). Without
   them the product paths apply; nothing else changes. */
const SERIES_DIR = argOf("--series-dir") || join(ROOT, "quant/data/market/discover-series-long");
const OUT_DIR = argOf("--out") || join(ROOT, "quant/data/product/pattern-research-v1");
const methodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/pattern-research-v1.json"), "utf8"));

const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : null;
const workDirArg = args.indexOf("--work-dir");
const WORK_DIR = workDirArg >= 0 ? args[workDirArg + 1] : null;
const DAILY_DIR = WORK_DIR ? join(WORK_DIR, "tiingo", "daily") : null;
if (DAILY_DIR && !existsSync(DAILY_DIR)) {
  /* Asked for daily bars and none there: that is a broken restore, not a
     study without volume. Fail instead of publishing nulls as a result. */
  throw new Error("--work-dir given but " + DAILY_DIR + " does not exist");
}
/* PRICE (default, byte-identical to the study before this switch existed)
   or TOTAL. Anything else is a typo and aborts. */
const RETURN_BASIS = args.includes("--return-basis") ? argOf("--return-basis") : "price";
if (RETURN_BASIS !== "price" && RETURN_BASIS !== "total") {
  throw new Error("--return-basis must be 'price' or 'total', got " + RETURN_BASIS);
}
const TOTAL = RETURN_BASIS === "total";
if (TOTAL && !DAILY_DIR) {
  /* Fail closed: a total-return study without the canonical daily history
     would silently be a price-return study. */
  throw new Error("--return-basis total requires --work-dir (canonical daily history); refusing to fall back to price return");
}
/* Same staleness rule and coverage bar as the signal study. */
export const TR_STALE_DAYS = 10;
export const TR_MINIMUM_SHARE = 0.95;

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
   1b. Daily bars for the volume features. Raw columns as the store holds
       them; split consistency is the engine's job (pattern-research.js).
       Read per title, used, dropped - never held for the whole universe.
   --------------------------------------------------------------------------- */
function readDailyPayload(securityId) {
  if (!DAILY_DIR || !securityId) return { state: "NO_SOURCE", payload: null };
  const file = join(DAILY_DIR, securityId + ".json");
  if (!existsSync(file)) return { state: "MISSING", payload: null };
  try { return { state: "OK", payload: JSON.parse(readFileSync(file, "utf8")) }; } catch { return { state: "READ_FAILED", payload: null }; }
}

function dailyFromPayload(payload) {
  if (!payload) return null;
  const bars = (payload.bars || []).filter((bar) => bar && typeof bar.date === "string")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const dates = [], close = [], high = [], low = [], volume = [], splitFactor = [];
  for (const bar of bars) {
    const day = bar.date.slice(0, 10);
    if (dates.length && dates[dates.length - 1] === day) continue;
    dates.push(day);
    close.push(Number(bar.close)); high.push(Number(bar.high)); low.push(Number(bar.low));
    volume.push(Number(bar.volume));
    splitFactor.push(finite(bar.splitFactor) && bar.splitFactor > 0 ? bar.splitFactor : 1);
  }
  if (!dates.length) return null;
  return { dates, close, high, low, volume, splitFactor };
}

/* ---------------------------------------------------------------------------
   1c. Total return for the outcomes (--return-basis total only).

       totalReturnWeekly: the canonical reconstruction of one title's daily
       bars (current listing only, identity of the working store, stale after
       10 days - exactly as build-signal-backtest.mjs), sampled per calendar
       week on the last trading day (weekly-total-return-1.0.0) and aligned
       to the title's weekly dates. Weeks without a daily value are NaN, never
       filled with a price.

       forwardOutcome: the engine's own outcomeAfter on that series. It reads
       only levels[index..index+weeks]; the level at index is the entry, and
       because the index is a running product of daily gross returns, the
       ratio depends only on the bars after the observation date.
   --------------------------------------------------------------------------- */
export function totalReturnWeekly(payload, weeklyDates) {
  const last = weeklyDates[weeklyDates.length - 1];
  const d = workingStoreFromBars(payload, { asOf: weekKey(last), maxStaleDays: TR_STALE_DAYS });
  if (!d.totalReturn) {
    return { confirmed: false, reason: d.trVerdict.reason || "TOTAL_RETURN_UNAVAILABLE", bucket: d.trVerdict.bucket || "REJECTED_OTHER",
      lastGap: d.trVerdict.lastGap || null, ctr: d.ctr, listingCut: d.listingCut };
  }
  const index = new Map(weeklyDates.map((date, i) => [weekKey(date), i]));
  const levels = Array.from(weeklyFromDaily(d.dates, d.tr, index, weeklyDates.length));
  return { confirmed: true, reason: null, bucket: null, lastGap: null, levels, ctr: d.ctr, listingCut: d.listingCut };
}

export function forwardOutcome(levels, index, weeks) {
  return Patterns.outcomeAfter(levels, index, weeks);
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
  const tr = TOTAL ? {
    seriesEligible: series.length, withTotalReturn: 0, excluded: [], reasons: {}, buckets: {}, listingSegmentCuts: 0,
    outcomeUnavailableNoTotalReturnLevel: Object.fromEntries(horizons.map((h) => [h.id, 0])), ctrResults: []
  } : null;
  const coverage = {
    source: DAILY_DIR ? "CANONICAL_DAILY_HISTORY" : "NO_DAILY_SOURCE",
    seriesWithDailyBars: 0, seriesWithoutDailyBars: 0,
    observations: 0, observationsWithAnyVolumeFeature: 0,
    perFeature: Object.fromEntries(Patterns.VOLUME_FEATURE_IDS.map((id) => [id, 0]))
  };

  for (const entry of series) {
    const read = readDailyPayload(entry.securityId);
    let levels = null;
    if (TOTAL) {
      /* Exclusion happens before anything is counted: an excluded title
         contributes no observation, no feature and no volume coverage. */
      let result;
      if (read.state !== "OK") {
        const reason = read.state === "READ_FAILED" ? "READ_FAILED" : "NO_CANONICAL_SERIES";
        result = { confirmed: false, reason, bucket: "REJECTED_OTHER", lastGap: null, ctr: { reconstructed: false, reason, bucket: "REJECTED_OTHER" } };
      } else {
        try { result = totalReturnWeekly(read.payload, entry.dates); } catch (error) {
          result = { confirmed: false, reason: "READ_FAILED", bucket: "REJECTED_OTHER", lastGap: null, ctr: { reconstructed: false, reason: "READ_FAILED", bucket: "REJECTED_OTHER" } };
        }
      }
      tr.ctrResults.push(result.ctr);
      if (result.listingCut) tr.listingSegmentCuts += 1;
      if (!result.confirmed) {
        tr.excluded.push({ securityId: entry.securityId, ticker: entry.ticker, reason: result.reason, bucket: result.bucket, lastGap: result.lastGap });
        tr.reasons[result.reason] = (tr.reasons[result.reason] || 0) + 1;
        tr.buckets[result.bucket] = (tr.buckets[result.bucket] || 0) + 1;
        continue;
      }
      tr.withTotalReturn += 1;
      levels = result.levels;
    }
    const indices = monthEndIndices(entry.dates, minimumHistory);
    const daily = dailyFromPayload(read.payload);
    if (daily) coverage.seriesWithDailyBars += 1; else coverage.seriesWithoutDailyBars += 1;
    const context = { runningMax: Patterns.runningMaxOf(entry.closes), daily, dates: entry.dates };
    for (const index of indices) {
      const features = Patterns.featuresAt(entry.closes, index, context);
      if (!features) { skippedNoFeatures += 1; continue; }
      coverage.observations += 1;
      let any = false;
      for (const id of Patterns.VOLUME_FEATURE_IDS) {
        if (features[id] !== null) { coverage.perFeature[id] += 1; any = true; }
      }
      if (any) coverage.observationsWithAnyVolumeFeature += 1;
      const forward = {};
      for (const horizon of horizons) {
        const outcome = TOTAL ? forwardOutcome(levels, index, horizon.weeks) : Patterns.outcomeAfter(entry.closes, index, horizon.weeks);
        if (TOTAL && outcome.state !== "AVAILABLE" && Patterns.outcomeAfter(entry.closes, index, horizon.weeks).state === "AVAILABLE") {
          tr.outcomeUnavailableNoTotalReturnLevel[horizon.id] += 1;
        }
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
  return { observations, skippedNoFeatures, coverage, tr };
}

/* The total-return block of the study (--return-basis total only). Counts
   and reasons, no series and no level ever leaves the run. */
function totalReturnBlock(tr) {
  const summary = CTR.summarize(tr.ctrResults);
  const share = tr.seriesEligible ? tr.withTotalReturn / tr.seriesEligible : 0;
  return {
    returnType: "TOTAL_RETURN",
    returnBasis: {
      detection: "SPLIT_ADJUSTED_PRICE",
      detectionSource: "quant/data/market/discover-series-long (Wochenschluss, splitbereinigt) und Tagesvolumen wie bisher",
      outcome: "TOTAL_RETURN",
      outcomeSource: "kanonische Tageshistorie (--work-dir, nur zur Laufzeit) -> " + CTR.VERSION + " -> " + WEEKLY_TOTAL_RETURN_VERSION,
      basis: TR_BASIS,
      contract: CTR.VERSION,
      corporateActionContract: CTR.CORPORATE_ACTION_CONTRACT,
      weeklyContract: WEEKLY_TOTAL_RETURN_VERSION,
      staleAfterDays: TR_STALE_DAYS,
      mixed: false
    },
    totalReturnCoverage: {
      seriesEligible: tr.seriesEligible,
      withTotalReturn: tr.withTotalReturn,
      excludedNoConfirmedTotalReturn: tr.excluded.length,
      share: round(share, 4),
      minimumShare: TR_MINIMUM_SHARE,
      state: share >= TR_MINIMUM_SHARE ? "PASS" : "BELOW_MINIMUM_SHARE",
      TOTAL_RETURN_RECONSTRUCTED: summary.TOTAL_RETURN_RECONSTRUCTED,
      REJECTED_DIVIDEND_GAP: summary.REJECTED_DIVIDEND_GAP,
      REJECTED_SPLIT_GAP: summary.REJECTED_SPLIT_GAP,
      REJECTED_IDENTITY: summary.REJECTED_IDENTITY,
      REJECTED_OTHER: summary.REJECTED_OTHER,
      reasons: Object.fromEntries(Object.entries(tr.reasons).sort((a, b) => a[0].localeCompare(b[0]))),
      listingSegmentCuts: tr.listingSegmentCuts,
      outcomeUnavailableNoTotalReturnLevel: tr.outcomeUnavailableNoTotalReturnLevel,
      outcomeUnavailableNote: "Beobachtungen, deren Ausgang in Kursrendite messbar waere, deren Horizont aber keine Gesamtrendite-Wochenwerte traegt (Tageshistorie beginnt spaeter oder hat Luecken). Sie zaehlen wie jeder fehlende Ausgang weder als Gewinner noch als Nicht-Gewinner.",
      excluded: tr.excluded.slice().sort((a, b) => a.securityId.localeCompare(b.securityId))
    },
    totalReturnNote: "Ausgaenge in Gesamtrendite (Dividenden und Sonderausschuettungen wiederangelegt, selbst rekonstruiert aus Rohkurs, Splitfaktor und Bardividende). Erkennung und Merkmale bleiben auf den splitbereinigten Wochenschluessen. Titel ohne bestaetigte Gesamtrendite sind ausgeschlossen und mit Grund gezaehlt; es wird nie gemischt."
  };
}

/* The study machinery lives in scripts/quant/lib/pattern-study.mjs, shared
   with the PIT fundamental family. One implementation, because two studies
   measured slightly differently are not comparable and the difference would
   never announce itself. The pattern set is built there too, so the test of
   the registered hypothesis count runs against the same function. */
function patternSet() {
  return pricePatternSet(methodology.candidates);
}

/* Benjamini-Hochberg over the 1.0.0 hypotheses alone. 1.1.0 added the volume
   hypotheses to the same correction, which makes it stricter; this shows
   what that did to the old set, by name, instead of letting a borderline
   1.0.0 finding change verdict without a trace. Reported, not used for any
   verdict. */
function correctionOverV100(primary, patterns, alpha) {
  const v100 = new Set(patterns.filter((pattern) => !pattern.addedIn).map((pattern) => pattern.id));
  const tested = primary.findings.filter((finding) => v100.has(finding.patternId) && finding.verdict !== "INSUFFICIENT_SUPPORT");
  const bh = Patterns.benjaminiHochberg(tested.map((finding) => finding.pValue), alpha);
  const changed = [];
  tested.forEach((finding, index) => {
    const alone = !!bh.passing[index];
    if (alone !== finding.significantAfterCorrection) {
      changed.push({ patternId: finding.patternId, significantV100Only: alone, significantInV110: finding.significantAfterCorrection });
    }
  });
  return {
    hypotheses: bh.hypotheses,
    alpha: bh.alpha,
    threshold: round(bh.threshold, 8),
    significant: Object.keys(bh.passing).length,
    significanceChangedBy110: changed,
    note: "Nur zur Vergleichbarkeit mit 1.0.0. Massgeblich fuer jedes Urteil ist die Korrektur ueber alle getesteten Hypothesen (primary.correction)."
  };
}

/* ------------------------------------------------------------------------- */
function main() {
  const started = Date.now();
  const { series, rejected, considered } = loadSeries();
  if (!series.length) throw new Error("no usable long series found; nothing to study");

  const { observations, skippedNoFeatures, coverage, tr } = buildObservations(series);
  if (TOTAL && !observations.length) throw new Error("no title with a confirmed total return; nothing to study");
  const trBlock = TOTAL ? totalReturnBlock(tr) : null;
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
  primary.correctionV100Only = correctionOverV100(primary, patterns, methodology.preRegistration.alpha);

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
    ...(trBlock ? { returnType: trBlock.returnType, returnBasis: trBlock.returnBasis } : {}),
    population: {
      source: methodology.population.source,
      seriesConsidered: considered,
      seriesUsed: trBlock ? tr.withTotalReturn : series.length,
      seriesRejected: rejected,
      priceSeriesType: "SPLIT_ADJUSTED",
      totalReturn: !!trBlock,
      totalReturnNote: trBlock ? trBlock.totalReturnNote : methodology.population.totalReturnNote,
      ...(trBlock ? { totalReturnCoverage: trBlock.totalReturnCoverage } : {}),
      observations: observations.length,
      skippedNoFeatures,
      volumeCoverage: coverage,
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
    "  " + primary.hypotheses + " getestete Hypothesen · " + JSON.stringify(verdicts) + "\n" +
    "  Volumen (" + coverage.source + "): " + coverage.seriesWithDailyBars + " Reihen mit Tagesbalken, " +
    coverage.seriesWithoutDailyBars + " ohne; " + coverage.observationsWithAnyVolumeFeature + " von " +
    coverage.observations + " Beobachtungen mit Volumenmerkmal " + JSON.stringify(coverage.perFeature) + "\n" +
    (trBlock ? "  Gesamtrendite (" + CTR.VERSION + ", " + WEEKLY_TOTAL_RETURN_VERSION + "): " + tr.withTotalReturn + " von " + tr.seriesEligible +
      " Reihen bestaetigt (" + trBlock.totalReturnCoverage.state + "), " + tr.excluded.length + " ausgeschlossen " + JSON.stringify(trBlock.totalReturnCoverage.reasons) +
      "; ohne Gesamtrendite-Wochenwert im Horizont " + JSON.stringify(tr.outcomeUnavailableNoTotalReturnLevel) + "\n" : "") +
    "  1.0.0-Korrektur allein: " + primary.correctionV100Only.significant + " von " + primary.correctionV100Only.hypotheses +
    " signifikant, " + primary.correctionV100Only.significanceChangedBy110.length + " mit anderem Urteil als in 1.1.0\n"
  );
  const volumeIds = new Set(patterns.filter((pattern) => pattern.addedIn).map((pattern) => pattern.id));
  for (const finding of primary.findings.filter((f) => volumeIds.has(f.patternId))) {
    process.stdout.write("    [vol] " + finding.verdict + "  lift " + (finding.lift === null ? "-" : finding.lift.toFixed(2)) +
      "  oos " + (finding.outOfSample && finding.outOfSample.lift !== null ? finding.outOfSample.lift.toFixed(2) : "-") +
      "  n=" + finding.support + "  w=" + finding.winners + "  " + finding.patternId + "\n");
  }
  for (const finding of primary.findings.filter((f) => f.verdict === "ROBUST").slice(0, 12)) {
    process.stdout.write("    " + finding.lift.toFixed(2) + "x  oos " + (finding.outOfSample.lift || 0).toFixed(2) +
      "x  n=" + finding.support + "  w=" + finding.winners + "  " + finding.patternId + "\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
