/* =========================================================================
   The shared pattern-study runner.

   Two studies use it - the price family and the PIT fundamental family -
   and they must be measured the same way or their verdicts are not
   comparable. Keeping one implementation is the point: a second copy that
   drifts by one threshold produces two studies that look alike and are not.

   The caller supplies the observations, the pre-registered candidate list,
   the pattern set for its own family, and its own robustness settings.
   Nothing about a family is decided here.
   ========================================================================= */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Patterns = require(join(ROOT, "quant/engines/pattern-research.js"));

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, digits = 6) => (finite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);

/* ---------------------------------------------------------------------------
   Columns for one (horizon, threshold). Each observation is reduced to two
   integers - which pre-registered candidates it matches, and which of them
   were measurable for it - plus its cohort and its forward numbers. The
   candidate masks do not depend on the horizon, so they are computed once
   and reused; only the cohort changes when the threshold does.
   --------------------------------------------------------------------------- */
const LOSS_THRESHOLD = -0.5;

function buildColumns(observations, candidateMasks, horizonId, minReturn) {
  const n = observations.length;
  const cohort = new Uint8Array(n), forward = new Float64Array(n), drawdown = new Float64Array(n);
  const weeks = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const outcome = observations[i].forward[horizonId];
    weeks[i] = observations[i].t;
    if (outcome === null) { cohort[i] = 2; continue; }
    cohort[i] = outcome.r >= minReturn ? 1 : 0;
    forward[i] = outcome.r;
    drawdown[i] = outcome.dd;
  }
  return { hit: candidateMasks.hit, measurable: candidateMasks.measurable, cohort, forward, drawdown, weeks };
}

/* Purged walk-forward over the column layout: an observation whose outcome
   window still runs when the test block opens leaves the training block. */
function foldsOf(columns, usableIndices, foldCount, horizonWeeks) {
  const sorted = usableIndices.slice().sort((a, b) => columns.weeks[a] - columns.weeks[b]);
  if (sorted.length < foldCount * 2) return [];
  const size = Math.floor(sorted.length / foldCount);
  const out = [];
  for (let k = 1; k < foldCount; k++) {
    const testStart = k * size;
    const testEnd = k === foldCount - 1 ? sorted.length : (k + 1) * size;
    const test = sorted.slice(testStart, testEnd);
    const testStartWeek = columns.weeks[sorted[testStart]];
    const train = sorted.slice(0, testStart).filter((i) => columns.weeks[i] + horizonWeeks < testStartWeek);
    if (train.length && test.length) out.push({ fold: k, train, test, purged: testStart - train.length });
  }
  return out;
}

export function runStudy(observations, candidateMasks, horizon, threshold, patterns, config) {
  const columns = buildColumns(observations, candidateMasks, horizon.id, threshold.minReturn);
  const usable = [];
  let winners = 0;
  for (let i = 0; i < columns.cohort.length; i++) {
    if (columns.cohort[i] === 2) continue;
    usable.push(i);
    if (columns.cohort[i] === 1) winners += 1;
  }
  const robustness = config.robustness;
  const usableColumns = Patterns.maskedSubset(columns, usable);
  usableColumns.weeks = Int32Array.from(usable, (i) => columns.weeks[i]);

  const foldIndex = foldsOf(usableColumns, Array.from(usableColumns.cohort.keys()),
                            robustness.walkForward.folds, horizon.weeks);
  const folds = foldIndex.map((fold) => ({
    fold: fold.fold, purged: fold.purged,
    train: Patterns.maskedSubset(usableColumns, fold.train),
    test: Patterns.maskedSubset(usableColumns, fold.test),
    trainSize: fold.train.length, testSize: fold.test.length
  }));

  /* Parameter stability needs the candidates at scaled thresholds, so one
     extra mask column per sweep factor - computed once for the whole study,
     not once per pattern. */
  const sweepColumns = robustness.parameterStability.sweep.map((factor) => {
    const scaled = config.candidates.map((candidate) => Patterns.scaleCandidate(candidate, factor));
    const masks = maskColumns(observations, scaled);
    const scaledColumns = { ...columns, hit: masks.hit, measurable: masks.measurable };
    return { factor, columns: Patterns.maskedSubset(scaledColumns, usable) };
  });

  const populationMedian = Patterns.populationMedianForward(usableColumns);
  const raw = patterns.map((pattern) => {
    const overall = Patterns.evaluateMasked(usableColumns, pattern.mask, pattern.id, LOSS_THRESHOLD, populationMedian);
    if (overall.support < robustness.minimumSupport || overall.winners < robustness.minimumWinners) {
      return { pattern, overall, verdict: "INSUFFICIENT_SUPPORT", inSample: null, outOfSample: null, stability: null };
    }
    let trainSupport = 0, trainWinners = 0, trainPop = 0, trainPopWinners = 0;
    let testSupport = 0, testWinners = 0, testPop = 0, testPopWinners = 0;
    for (const fold of folds) {
      const inFold = Patterns.evaluateMasked(fold.train, pattern.mask, pattern.id, LOSS_THRESHOLD);
      const outFold = Patterns.evaluateMasked(fold.test, pattern.mask, pattern.id, LOSS_THRESHOLD);
      trainSupport += inFold.support; trainWinners += inFold.winners;
      trainPop += inFold.population; trainPopWinners += Math.round((inFold.baseRate || 0) * inFold.population);
      testSupport += outFold.support; testWinners += outFold.winners;
      testPop += outFold.population; testPopWinners += Math.round((outFold.baseRate || 0) * outFold.population);
    }
    const inSample = liftOf(trainWinners, trainSupport, trainPopWinners, trainPop);
    const outOfSample = liftOf(testWinners, testSupport, testPopWinners, testPop);
    const stability = stabilityOf(sweepColumns, pattern, robustness.minimumSupport);
    return { pattern, overall, inSample, outOfSample, stability, verdict: null };
  });

  /* Benjamini-Hochberg over every hypothesis that had enough support to be
     tested at all. Counting the untestable ones would deflate the
     correction; not counting the tested ones would inflate the findings. */
  const tested = raw.filter((row) => row.verdict !== "INSUFFICIENT_SUPPORT");
  const bh = Patterns.benjaminiHochberg(tested.map((row) => row.overall.pValue), config.alpha);

  const findings = raw.map((row) => {
    const testedIndex = tested.indexOf(row);
    const significant = testedIndex >= 0 ? !!bh.passing[testedIndex] : false;
    const stable = row.stability && row.stability.state === "MEASURED" &&
      finite(row.stability.relativeSpread) &&
      row.stability.relativeSpread <= robustness.parameterStability.unstableIfRelativeSpreadAbove;
    const heldOut = row.outOfSample && finite(row.outOfSample.lift) &&
      row.outOfSample.lift > robustness.outOfSample.flagIfTestLiftBelow;

    let verdict = row.verdict;
    if (!verdict) {
      if (!significant) verdict = "NOT_SIGNIFICANT";
      else if (!heldOut) verdict = "IN_SAMPLE_ONLY";
      else if (!stable) verdict = "PARAMETER_SENSITIVE";
      else verdict = "ROBUST";
    }
    return {
      patternId: row.pattern.id,
      kind: row.pattern.kind,
      plain: row.pattern.plain,
      terms: row.pattern.terms.map((term) => ({ feature: term.feature, operator: term.operator, value: term.value })),
      support: row.overall.support,
      winners: row.overall.winners,
      population: row.overall.population,
      notMeasurable: row.overall.notMeasurable,
      outcomeUnavailableInPattern: row.overall.outcomeUnavailableInPattern,
      baseRate: round(row.overall.baseRate),
      conditionalRate: round(row.overall.conditionalRate),
      lift: round(row.overall.lift, 4),
      wilsonInterval: row.overall.wilsonInterval ? row.overall.wilsonInterval.map((v) => round(v)) : null,
      pValue: row.overall.pValue === null ? null : round(row.overall.pValue, 8),
      significantAfterCorrection: significant,
      /* The same pattern's downside, reported beside its upside. A pattern
         under which titles double more often AND halve more often is not a
         better pattern, and showing only the first half would be the trick. */
      lossThreshold: LOSS_THRESHOLD,
      losses: row.overall.losses,
      baseLossRate: round(row.overall.baseLossRate),
      conditionalLossRate: round(row.overall.conditionalLossRate),
      lossLift: round(row.overall.lossLift, 4),
      /* The decision-relevant number, computed here rather than left to
         every reader: a pattern that doubles the chance of a double AND
         doubles the chance of a halving has selected volatility, not
         winners. Above 1 it tilts up, below 1 it tilts down. */
      asymmetry: finite(row.overall.lift) && row.overall.lossLift > 0
        ? round(row.overall.lift / row.overall.lossLift, 4) : null,
      medianForwardReturn: round(row.overall.medianForwardReturn, 4),
      medianForwardReturnNetOfFrictions: round(netOfFrictions(row.overall.medianForwardReturn, config.frictions), 4),
      medianForwardReturnPopulation: round(row.overall.medianForwardReturnPopulation, 4),
      medianMaxDrawdownWithinHorizon: round(row.overall.medianMaxDrawdownWithinHorizon, 4),
      inSample: row.inSample ? { lift: round(row.inSample.lift, 4), support: row.inSample.support, winners: row.inSample.winners } : null,
      outOfSample: row.outOfSample ? { lift: round(row.outOfSample.lift, 4), support: row.outOfSample.support, winners: row.outOfSample.winners } : null,
      parameterStability: row.stability ? {
        state: row.stability.state,
        medianLift: round(row.stability.medianLift, 4),
        minLift: round(row.stability.minLift, 4),
        maxLift: round(row.stability.maxLift, 4),
        relativeSpread: round(row.stability.relativeSpread, 4)
      } : null,
      verdict
    };
  });

  findings.sort((a, b) => (b.lift || 0) - (a.lift || 0));

  return {
    horizon: horizon.id,
    horizonMonths: horizon.months,
    winnerThreshold: threshold.id,
    winnerMinReturn: threshold.minReturn,
    observations: columns.cohort.length,
    usableObservations: usable.length,
    outcomeUnavailable: columns.cohort.length - usable.length,
    winners,
    baseRate: round(usable.length ? winners / usable.length : null),
    folds: folds.map((fold) => ({ fold: fold.fold, train: fold.trainSize, test: fold.testSize, purged: fold.purged })),
    hypotheses: bh.hypotheses,
    correction: { method: "BENJAMINI_HOCHBERG", alpha: bh.alpha, threshold: round(bh.threshold, 8) },
    findings
  };
}

export function maskColumns(observations, candidates) {
  const n = observations.length;
  const hit = new Int32Array(n), measurable = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const masks = Patterns.candidateMasks(observations[i].features, candidates);
    hit[i] = masks.hit; measurable[i] = masks.measurable;
  }
  return { hit, measurable };
}

function stabilityOf(sweepColumns, pattern, minimumSupport) {
  /* A pattern made only of boolean conditions has no threshold to sweep, so
     it would come out with a spread of zero and be recorded as "stable".
     That is not robustness evidence, it is the absence of a test, and the
     two must not read the same. */
  if (!pattern.terms.some((term) => typeof term.value === "number")) {
    return { state: "NOT_APPLICABLE_NO_THRESHOLD", points: [] };
  }
  const lifts = [], points = [];
  for (const entry of sweepColumns) {
    const result = Patterns.evaluateMasked(entry.columns, pattern.mask, pattern.id, LOSS_THRESHOLD);
    points.push({ factor: entry.factor, support: result.support, lift: result.lift });
    if (result.support >= minimumSupport && finite(result.lift)) lifts.push(result.lift);
  }
  if (lifts.length < 3) return { state: "UNDETERMINED", reason: "TOO_FEW_USABLE_SETTINGS", points };
  const lo = Math.min(...lifts), hi = Math.max(...lifts), mid = Patterns.median(lifts);
  return { state: "MEASURED", points, medianLift: mid, minLift: lo, maxLift: hi,
           relativeSpread: mid > 0 ? (hi - lo) / mid : null };
}

function liftOf(patternWinners, patternSupport, populationWinners, population) {
  if (!patternSupport || !population) return { lift: null, support: patternSupport, winners: patternWinners };
  const conditional = patternWinners / patternSupport;
  const base = populationWinners / population;
  return { lift: base > 0 ? conditional / base : null, support: patternSupport, winners: patternWinners, conditionalRate: conditional, baseRate: base };
}

function netOfFrictions(value, frictions) {
  if (!finite(value) || !frictions) return null;
  const cost = (frictions.roundTripBps + frictions.slippageBps) / 10000;
  return (1 + value) * (1 - cost) - 1;
}

export { LOSS_THRESHOLD, round, finite };
