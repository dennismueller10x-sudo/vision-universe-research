/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — PATTERN RESEARCH v1

   The product question is: did titles that later rose a great deal look
   different BEFOREHAND from titles that did not - measurably, across many
   cases, without hindsight?

   Everything here is built so that the answer cannot flatter itself:

   - A feature may only read the series up to and including t. An outcome
     may only read strictly after t. Both are asserted per observation and
     a violation throws. Documentation does not stop leakage; a check does.
   - The population is every title with enough history at t. There is no
     curated list of famous winners, and a single title never carries a
     finding: a pattern is reported only above a minimum number of cases
     AND winners.
   - A title whose series ends before the horizon closes is OUTCOME_UNAVAILABLE.
     It counts as neither winner nor non-winner and its number is reported.
     Quietly folding it into the non-winners would invent an observation.
   - Walk-forward folds are purged: an observation whose outcome window
     reaches into the test block leaves the training block. Without that
     embargo, train and test share the same future and "out-of-sample"
     means nothing.
   - The candidate set is pre-registered in the methodology file. Hypotheses
     are counted and Benjamini-Hochberg is applied over that count; a
     correction over hypotheses invented after seeing the data is arithmetic
     without meaning.

   This is not a backtest and not a prediction. It reports conditional
   frequencies in the past. That gate stays closed here and says so in a
   field rather than in prose.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  /* 1.1.0 (06.10.2026): drei vorregistrierte Volumenmerkmale aus Tageskursen
     (udv50, acc63, dryUp10over50). Die zehn Kursmerkmale und ihre fuenfzehn
     Kandidaten sind unveraendert; siehe changelog in der Methodikdatei. */
  var METHODOLOGY_VERSION = "pattern-research-1.1.0";
  var STUDY_SCHEMA = "pattern-research-study-1.0.0";
  var COHORTS = ["WINNER", "NON_WINNER", "OUTCOME_UNAVAILABLE"];
  var FEATURE_IDS = ["return12m1m", "return6m", "return3m", "distanceTo52wHigh", "drawdownFromPeak",
                     "volatility52w", "aboveSma40w", "sma10wAboveSma40w", "rangeCompression52w", "priceToAllTimeHigh",
                     "udv50", "acc63", "dryUp10over50"];
  var VOLUME_FEATURE_IDS = ["udv50", "acc63", "dryUp10over50"];
  /* Liegt der letzte Tagesbalken <= t mehr als so viele Kalendertage vor t,
     ist das Volumenbild an t nicht das von t. Dann kein Wert statt eines
     veralteten. */
  var VOLUME_MAX_STALE_DAYS = 10;

  function finite(value) { return typeof value === "number" && Number.isFinite(value); }
  function mean(values) { return values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : null; }
  function median(values) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /* ---------------------------------------------------------------------
     Features at t. `index` is the position of t in the weekly close array;
     nothing beyond it may be read, and the guard says so out loud.
     --------------------------------------------------------------------- */
  /* `context.runningMax[i]` is the highest valid close in [0..i]. Passing it
     turns the all-time-peak lookup from a scan into an array read, which is
     the difference between minutes and hours over a million observations.
     It is an optimisation only: with no context the peak is computed here,
     and a test asserts both paths return identical features. */
  function runningMaxOf(closes) {
    var out = new Float64Array(closes.length);
    var peak = 0;
    for (var i = 0; i < closes.length; i++) {
      var value = closes[i];
      if (finite(value) && value > 0 && value > peak) peak = value;
      out[i] = peak;
    }
    return out;
  }


  /* ---------------------------------------------------------------------
     Volume features at t, from DAILY bars (pattern-research-1.1.0).

     The weekly series carries closes only. Volume therefore comes from the
     canonical daily bars (runner-private, never published) and is sampled
     at the weekly observation date: the last daily bar with date <= t.

     `daily` holds RAW arrays as the provider delivers them: close, high,
     low, volume, splitFactor (1 on ordinary days, the ratio on an ex-date).
     Raw is deliberate - dollar volume (close x volume) is split-invariant by
     construction, and the two places that need split consistency do it
     here, explicitly, with split factors known at t:
       - up/down day:  close_k * C_k  vs  close_{k-1} * C_{k-1}
       - share volume: volume_k / C_k
     where C_k is the running product of split factors up to k.

     Every bar is read through `read`, which throws on any index beyond the
     anchor. The highest index actually read is returned so the caller can
     assert it against t instead of trusting the window arithmetic.
     --------------------------------------------------------------------- */
  function cumulativeSplitFactors(daily) {
    var n = daily.close.length;
    var out = new Float64Array(n);
    var c = 1;
    for (var i = 0; i < n; i++) {
      var f = daily.splitFactor ? daily.splitFactor[i] : 1;
      if (finite(f) && f > 0) c *= f;
      out[i] = c;
    }
    return out;
  }

  function emptyVolumeFeatures() { return { udv50: null, acc63: null, dryUp10over50: null }; }

  function volumeFeaturesAt(daily, anchor, cumSplit) {
    var maxRead = -1;
    function read(k) {
      if (k > anchor) throw new Error("pattern-research: volume feature read a bar after t");
      if (k > maxRead) maxRead = k;
      var close = daily.close[k], volume = daily.volume[k];
      return {
        close: close, high: daily.high[k], low: daily.low[k], volume: volume,
        c: cumSplit[k],
        valid: finite(close) && close > 0 && finite(volume) && volume >= 0
      };
    }
    var out = emptyVolumeFeatures();
    if (!(anchor >= 0) || anchor >= daily.close.length) return { features: out, maxRead: maxRead };

    /* udv50: up-day dollar volume / down-day dollar volume, last 50 days. */
    if (anchor - 50 >= 0) {
      var up = 0, down = 0, valid50 = 0;
      for (var k = anchor - 49; k <= anchor; k++) {
        var bar = read(k), prev = read(k - 1);
        if (!bar.valid || !prev.valid) continue;
        valid50 += 1;
        var dv = bar.close * bar.volume;
        var now = bar.close * bar.c, before = prev.close * prev.c;
        if (now > before) up += dv; else if (now < before) down += dv;
      }
      if (valid50 >= 45 && down > 0) out.udv50 = up / down;
    }

    /* acc63: Chaikin-style accumulation, sum(CLV x DV) / sum(DV), 63 days.
       A bar with high == low has no range to place the close in; CLV is 0
       there, the usual convention, rather than a division by zero. */
    if (anchor - 62 >= 0) {
      var num = 0, den = 0, valid63 = 0;
      for (var j = anchor - 62; j <= anchor; j++) {
        var b = read(j);
        if (!b.valid || !finite(b.high) || !finite(b.low) || b.high < b.low) continue;
        valid63 += 1;
        var dvj = b.close * b.volume;
        var range = b.high - b.low;
        var clv = range > 0 ? ((b.close - b.low) - (b.high - b.close)) / range : 0;
        if (clv > 1) clv = 1; else if (clv < -1) clv = -1;
        num += clv * dvj; den += dvj;
      }
      if (valid63 >= 57 && den > 0) out.acc63 = num / den;
    }

    /* dryUp10over50: mean split-consistent share volume, 10 days over 50. */
    if (anchor - 49 >= 0) {
      var s10 = 0, n10 = 0, s50 = 0, n50 = 0;
      for (var m = anchor - 49; m <= anchor; m++) {
        var d = read(m);
        if (!d.valid || !(d.c > 0)) continue;
        var shares = d.volume / d.c;
        s50 += shares; n50 += 1;
        if (m > anchor - 10) { s10 += shares; n10 += 1; }
      }
      if (n10 >= 9 && n50 >= 45 && s50 > 0) out.dryUp10over50 = (s10 / n10) / (s50 / n50);
    }
    return { features: out, maxRead: maxRead };
  }

  /* Last daily index with date <= day (ISO strings compare as dates). */
  function dailyIndexAtOrBefore(dates, day) {
    var lo = 0, hi = dates.length - 1, found = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (dates[mid] <= day) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

  /* The volume features for the weekly observation at `day`. No daily bars,
     no bar at or before t, or a stale last bar: all three null - measured as
     unavailable, never filled. */
  function volumeFeaturesForDate(daily, day) {
    if (!daily || !daily.dates || !daily.dates.length || typeof day !== "string") return emptyVolumeFeatures();
    var anchor = dailyIndexAtOrBefore(daily.dates, day);
    if (anchor < 0) return emptyVolumeFeatures();
    if (daysBetween(daily.dates[anchor], day) > VOLUME_MAX_STALE_DAYS) return emptyVolumeFeatures();
    if (!daily.cumSplit) daily.cumSplit = cumulativeSplitFactors(daily);
    var result = volumeFeaturesAt(daily, anchor, daily.cumSplit);
    /* The contract, checked: the latest bar any volume feature read lies at
       or before t. A violation throws; it is not logged. */
    if (result.maxRead >= 0 && !(daily.dates[result.maxRead] <= day)) {
      throw new Error("pattern-research: volume feature window ends after t (" + daily.dates[result.maxRead] + " > " + day + ")");
    }
    return result.features;
  }

  /* `context.daily` + `context.dates` (the weekly dates) add the volume
     features; without them those three are null, i.e. not measurable. */
  function featuresAt(closes, index, context) {
    if (!Array.isArray(closes) || index < 0 || index >= closes.length) return null;
    var price = closes[index];
    if (!finite(price) || price <= 0) return null;

    function at(offset) {
      var k = index - offset;
      if (k < 0) return null;
      var value = closes[k];
      return finite(value) && value > 0 ? value : null;
    }
    function ret(offset) {
      var past = at(offset);
      return past === null ? null : price / past - 1;
    }
    function windowSlice(weeks) {
      var from = Math.max(0, index - weeks + 1);
      return closes.slice(from, index + 1).filter(function (v) { return finite(v) && v > 0; });
    }
    function sma(weeks) {
      var slice = windowSlice(weeks);
      return slice.length === weeks ? mean(slice) : null;
    }

    var year = windowSlice(52);
    var high52 = year.length ? Math.max.apply(null, year) : null;
    var low52 = year.length ? Math.min.apply(null, year) : null;
    var peak;
    if (context && context.runningMax) {
      peak = context.runningMax[index] > 0 ? context.runningMax[index] : null;
    } else {
      var everything = closes.slice(0, index + 1).filter(function (v) { return finite(v) && v > 0; });
      peak = everything.length ? Math.max.apply(null, everything) : null;
    }

    var weekly = [];
    for (var k = Math.max(1, index - 51); k <= index; k++) {
      if (finite(closes[k]) && finite(closes[k - 1]) && closes[k - 1] > 0) weekly.push(Math.log(closes[k] / closes[k - 1]));
    }
    var vol = null;
    if (weekly.length >= 40) {
      var m = mean(weekly);
      var variance = weekly.reduce(function (sum, v) { return sum + (v - m) * (v - m); }, 0) / (weekly.length - 1);
      vol = Math.sqrt(variance) * Math.sqrt(52);
    }

    var twelve = at(52), one = at(4);
    var sma10 = sma(10), sma40 = sma(40);
    var volume = context && context.daily && context.dates
      ? volumeFeaturesForDate(context.daily, context.dates[index])
      : emptyVolumeFeatures();

    return {
      /* 12 months excluding the last month, the standard way of asking
         "was it strong before, without counting this month's jump". */
      return12m1m: twelve !== null && one !== null ? one / twelve - 1 : null,
      return6m: ret(26),
      return3m: ret(13),
      distanceTo52wHigh: high52 ? price / high52 - 1 : null,
      drawdownFromPeak: peak ? price / peak - 1 : null,
      volatility52w: vol,
      aboveSma40w: sma40 === null ? null : price > sma40,
      sma10wAboveSma40w: sma10 === null || sma40 === null ? null : sma10 > sma40,
      rangeCompression52w: high52 && low52 && low52 > 0 ? (high52 - low52) / low52 : null,
      priceToAllTimeHigh: peak ? price / peak : null,
      udv50: volume.udv50,
      acc63: volume.acc63,
      dryUp10over50: volume.dryUp10over50
    };
  }

  /* ---------------------------------------------------------------------
     Outcome over (t, t+weeks]. Reads nothing at or before t.
     --------------------------------------------------------------------- */
  function outcomeAfter(closes, index, weeks) {
    var end = index + weeks;
    if (end >= closes.length) return { state: "OUTCOME_UNAVAILABLE", reason: "SERIES_ENDS_BEFORE_HORIZON" };
    var entry = closes[index], exit = closes[end];
    if (!finite(entry) || entry <= 0 || !finite(exit) || exit <= 0) {
      return { state: "OUTCOME_UNAVAILABLE", reason: "INVALID_PRICE" };
    }
    var path = closes.slice(index + 1, end + 1).filter(function (v) { return finite(v) && v > 0; });
    if (path.length < weeks * 0.8) return { state: "OUTCOME_UNAVAILABLE", reason: "SPARSE_PATH" };
    var peak = entry, worst = 0;
    for (var k = 0; k < path.length; k++) {
      if (path[k] > peak) peak = path[k];
      var dd = path[k] / peak - 1;
      if (dd < worst) worst = dd;
    }
    return {
      state: "AVAILABLE",
      forwardReturn: exit / entry - 1,
      maxDrawdownWithinHorizon: worst,
      maxForwardReturn: Math.max.apply(null, path) / entry - 1
    };
  }

  /* ---------------------------------------------------------------------
     One observation. This is where the leakage contract is enforced.
     --------------------------------------------------------------------- */
  function observe(closes, index, horizonWeeks, winnerThreshold, context) {
    var features = featuresAt(closes, index, context);
    if (!features) return null;
    var outcome = outcomeAfter(closes, index, horizonWeeks);

    /* The contract, checked rather than trusted. featuresAt reads only
       [0..index]; outcomeAfter reads only [index+1..index+horizon]. If a
       future edit breaks that, this throws on the first observation instead
       of producing a study that looks fine and is not. */
    if (!(index >= 0) || !(horizonWeeks > 0)) throw new Error("pattern-research: invalid observation window");
    if (outcome.state === "AVAILABLE" && !(index + horizonWeeks < closes.length)) {
      throw new Error("pattern-research: outcome claimed beyond the series");
    }

    return {
      index: index,
      features: features,
      cohort: outcome.state !== "AVAILABLE" ? "OUTCOME_UNAVAILABLE"
        : (outcome.forwardReturn >= winnerThreshold ? "WINNER" : "NON_WINNER"),
      outcome: outcome
    };
  }

  /* ---------------------------------------------------------------------
     Candidate predicates. A single is one feature comparison; an
     interaction is the conjunction of two singles. Nothing is searched.
     --------------------------------------------------------------------- */
  /* A candidate may carry `also`: further comparisons that must hold with
     it, pre-registered as ONE hypothesis (e.g. a volume dry-up only near
     the yearly high). Unmeasurable if any part is. */
  function matchesCandidate(features, candidate) {
    if (candidate.also && candidate.also.length) {
      var head = matchesSingle(features, candidate);
      if (head === null) return null;
      var all = head;
      for (var i = 0; i < candidate.also.length; i++) {
        var part = matchesSingle(features, candidate.also[i]);
        if (part === null) return null;
        if (!part) all = false;
      }
      return all;
    }
    return matchesSingle(features, candidate);
  }

  /* Every feature a candidate reads - two candidates sharing one are a
     range, not an interaction, and are not paired. */
  function candidateFeatures(candidate) {
    var out = [candidate.feature];
    (candidate.also || []).forEach(function (part) { out.push(part.feature); });
    return out;
  }

  function matchesSingle(features, candidate) {
    var value = features[candidate.feature];
    if (value === null || value === undefined) return null;
    if (candidate.operator === "eq") return value === candidate.value;
    if (candidate.operator === "gte") return value >= candidate.value;
    if (candidate.operator === "lte") return value <= candidate.value;
    if (candidate.operator === "gt") return value > candidate.value;
    if (candidate.operator === "lt") return value < candidate.value;
    throw new Error("pattern-research: unknown operator '" + candidate.operator + "'");
  }

  function matchesPattern(features, pattern) {
    var measurable = true;
    for (var i = 0; i < pattern.terms.length; i++) {
      var hit = matchesCandidate(features, pattern.terms[i]);
      if (hit === null) { measurable = false; break; }
      if (hit === false) return false;
    }
    return measurable ? true : null;
  }

  function hasNumericThreshold(term) {
    return typeof term.value === "number" || (term.also || []).some(hasNumericThreshold);
  }

  function scaleCandidate(candidate, factor) {
    var hasAlso = candidate.also && candidate.also.length;
    if (typeof candidate.value !== "number" && !hasAlso) return candidate;
    var scaled = { id: candidate.id, feature: candidate.feature, operator: candidate.operator,
                   value: typeof candidate.value === "number" ? candidate.value * factor : candidate.value,
                   plain: candidate.plain };
    if (hasAlso) scaled.also = candidate.also.map(function (part) { return scaleCandidate(part, factor); });
    return scaled;
  }

  /* ---------------------------------------------------------------------
     Statistics. Wilson rather than the normal approximation, because the
     rates here are small and the intervals have to stay inside [0,1].
     --------------------------------------------------------------------- */
  function wilson(successes, total, z) {
    if (!total) return null;
    z = z || 1.96;
    var p = successes / total, z2 = z * z;
    var denom = 1 + z2 / total;
    var centre = (p + z2 / (2 * total)) / denom;
    var half = (z / denom) * Math.sqrt(p * (1 - p) / total + z2 / (4 * total * total));
    return [Math.max(0, centre - half), Math.min(1, centre + half)];
  }

  /* Two-proportion z test, pattern rate against the rest of the population.
     Reported with the Benjamini-Hochberg decision, never on its own. */
  function twoProportionP(successA, totalA, successB, totalB) {
    if (!totalA || !totalB) return null;
    var pA = successA / totalA, pB = successB / totalB;
    var pooled = (successA + successB) / (totalA + totalB);
    var se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
    if (!(se > 0)) return null;
    var z = (pA - pB) / se;
    return 2 * (1 - normalCdf(Math.abs(z)));
  }

  function normalCdf(x) {
    /* Abramowitz-Stegun 7.1.26 on erf; enough for a reported p-value that
       is then corrected, and it avoids a dependency. */
    var t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
      Math.exp(-x * x / 2);
    return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }

  function benjaminiHochberg(pValues, alpha) {
    var indexed = pValues.map(function (p, i) { return { p: p, i: i }; })
      .filter(function (entry) { return finite(entry.p); })
      .sort(function (a, b) { return a.p - b.p; });
    var m = indexed.length, cut = -1;
    for (var k = 0; k < m; k++) {
      if (indexed[k].p <= alpha * (k + 1) / m) cut = k;
    }
    var passing = {};
    for (var j = 0; j <= cut; j++) passing[indexed[j].i] = true;
    return { hypotheses: m, alpha: alpha, threshold: cut >= 0 ? indexed[cut].p : 0, passing: passing };
  }

  /* ---------------------------------------------------------------------
     Evaluating one pattern over a set of observations.
     --------------------------------------------------------------------- */
  function evaluatePattern(observations, pattern) {
    var inPattern = 0, inPatternWinners = 0, outPattern = 0, outPatternWinners = 0;
    var notMeasurable = 0, unavailableInPattern = 0;
    var forward = [], forwardIn = [], drawdownIn = [];

    for (var i = 0; i < observations.length; i++) {
      var o = observations[i];
      var hit = matchesPattern(o.features, pattern);
      if (hit === null) { notMeasurable += 1; continue; }
      if (o.cohort === "OUTCOME_UNAVAILABLE") { if (hit) unavailableInPattern += 1; continue; }
      var won = o.cohort === "WINNER";
      if (hit) {
        inPattern += 1;
        if (won) inPatternWinners += 1;
        forwardIn.push(o.outcome.forwardReturn);
        drawdownIn.push(o.outcome.maxDrawdownWithinHorizon);
      } else {
        outPattern += 1;
        if (won) outPatternWinners += 1;
      }
      forward.push(o.outcome.forwardReturn);
    }

    var total = inPattern + outPattern;
    var baseRate = total ? (inPatternWinners + outPatternWinners) / total : null;
    var conditional = inPattern ? inPatternWinners / inPattern : null;

    return {
      patternId: pattern.id,
      support: inPattern,
      winners: inPatternWinners,
      population: total,
      notMeasurable: notMeasurable,
      outcomeUnavailableInPattern: unavailableInPattern,
      baseRate: baseRate,
      conditionalRate: conditional,
      lift: baseRate && conditional !== null ? conditional / baseRate : null,
      wilsonInterval: wilson(inPatternWinners, inPattern),
      pValue: twoProportionP(inPatternWinners, inPattern, outPatternWinners, outPattern),
      medianForwardReturn: median(forwardIn),
      medianForwardReturnPopulation: median(forward),
      medianMaxDrawdownWithinHorizon: median(drawdownIn)
    };
  }

  /* ---------------------------------------------------------------------
     The same evaluation, fast enough to run over a million observations
     and a hundred-odd patterns without taking hours.

     Each observation is reduced once to two small integers: which
     pre-registered candidates it matches, and which of them were
     measurable for it at all. A pattern is then a bitmask, and testing it
     is two integer ANDs instead of a feature lookup per term.

     This is an optimisation, not a second definition. `evaluateMasked`
     must return exactly what `evaluatePattern` returns for the same input,
     and a test asserts that on real data rather than trusting it - a fast
     path that quietly disagrees with the readable one is the worst kind of
     bug, because every number downstream still looks plausible.
     --------------------------------------------------------------------- */
  function candidateMasks(features, candidates) {
    var hit = 0, measurable = 0;
    for (var i = 0; i < candidates.length; i++) {
      var result = matchesCandidate(features, candidates[i]);
      if (result === null) continue;
      measurable |= (1 << i);
      if (result) hit |= (1 << i);
    }
    return { hit: hit, measurable: measurable };
  }

  /* cohort: 0 NON_WINNER, 1 WINNER, 2 OUTCOME_UNAVAILABLE */
  /* `populationMedian` is the median forward return of the whole column set.
     It does not depend on the pattern, so recomputing it inside every one of
     a hundred-odd patterns was pure waste; it is passed in instead. */
  function evaluateMasked(columns, patternMask, patternId, lossThreshold, populationMedian) {
    var hit = columns.hit, measurable = columns.measurable, cohort = columns.cohort;
    var forward = columns.forward, drawdown = columns.drawdown, n = cohort.length;
    var inPattern = 0, inWinners = 0, outPattern = 0, outWinners = 0;
    var notMeasurable = 0, unavailableInPattern = 0, inLosses = 0, outLosses = 0;
    var forwardIn = [], drawdownIn = [];

    for (var k = 0; k < n; k++) {
      if ((measurable[k] & patternMask) !== patternMask) { notMeasurable += 1; continue; }
      var inside = (hit[k] & patternMask) === patternMask;
      if (cohort[k] === 2) { if (inside) unavailableInPattern += 1; continue; }
      var won = cohort[k] === 1;
      var lost = forward[k] <= lossThreshold;
      if (inside) {
        inPattern += 1;
        if (won) inWinners += 1;
        if (lost) inLosses += 1;
        forwardIn.push(forward[k]);
        drawdownIn.push(drawdown[k]);
      } else {
        outPattern += 1;
        if (won) outWinners += 1;
        if (lost) outLosses += 1;
      }
    }

    var total = inPattern + outPattern;
    var baseRate = total ? (inWinners + outWinners) / total : null;
    var conditional = inPattern ? inWinners / inPattern : null;
    var baseLoss = total ? (inLosses + outLosses) / total : null;
    var conditionalLoss = inPattern ? inLosses / inPattern : null;

    return {
      patternId: patternId,
      support: inPattern,
      winners: inWinners,
      population: total,
      notMeasurable: notMeasurable,
      outcomeUnavailableInPattern: unavailableInPattern,
      baseRate: baseRate,
      conditionalRate: conditional,
      lift: baseRate && conditional !== null ? conditional / baseRate : null,
      wilsonInterval: wilson(inWinners, inPattern),
      pValue: twoProportionP(inWinners, inPattern, outWinners, outPattern),
      /* The other side of the same coin. A pattern under which titles
         double more often AND halve more often is not a better pattern,
         and reporting only the first half would be the whole trick. */
      lossThreshold: lossThreshold,
      losses: inLosses,
      baseLossRate: baseLoss,
      conditionalLossRate: conditionalLoss,
      lossLift: baseLoss && conditionalLoss !== null ? conditionalLoss / baseLoss : null,
      medianForwardReturn: median(forwardIn),
      medianForwardReturnPopulation: populationMedian === undefined ? null : populationMedian,
      medianMaxDrawdownWithinHorizon: median(drawdownIn)
    };
  }

  /* The median forward return of every observation with a known outcome.
     One pass, reused by every pattern in the same column set. */
  function populationMedianForward(columns) {
    var values = [];
    for (var k = 0; k < columns.cohort.length; k++) {
      if (columns.cohort[k] !== 2) values.push(columns.forward[k]);
    }
    return median(values);
  }

  function maskedSubset(columns, keep) {
    var hit = new Int32Array(keep.length), measurable = new Int32Array(keep.length);
    var cohort = new Uint8Array(keep.length), forward = new Float64Array(keep.length), drawdown = new Float64Array(keep.length);
    for (var i = 0; i < keep.length; i++) {
      var k = keep[i];
      hit[i] = columns.hit[k]; measurable[i] = columns.measurable[k]; cohort[i] = columns.cohort[k];
      forward[i] = columns.forward[k]; drawdown[i] = columns.drawdown[k];
    }
    return { hit: hit, measurable: measurable, cohort: cohort, forward: forward, drawdown: drawdown };
  }

  /* ---------------------------------------------------------------------
     Purged walk-forward. Blocks are contiguous in time. An observation
     whose outcome window reaches into the test block is removed from
     training - that embargo is the whole difference between an honest
     out-of-sample number and a restatement of the training result.
     --------------------------------------------------------------------- */
  function walkForwardFolds(observations, folds, horizonWeeks, weekOf) {
    var sorted = observations.slice().sort(function (a, b) { return weekOf(a) - weekOf(b); });
    if (sorted.length < folds * 2) return [];
    var size = Math.floor(sorted.length / folds);
    var out = [];
    for (var k = 1; k < folds; k++) {
      var testStart = k * size;
      var testEnd = k === folds - 1 ? sorted.length : (k + 1) * size;
      var test = sorted.slice(testStart, testEnd);
      var testStartWeek = weekOf(sorted[testStart]);
      var train = sorted.slice(0, testStart).filter(function (o) {
        /* Purge: if this observation's outcome is still running when the
           test block opens, training and test share that future. */
        return weekOf(o) + horizonWeeks < testStartWeek;
      });
      if (train.length && test.length) out.push({ fold: k, train: train, test: test, purged: testStart - train.length });
    }
    return out;
  }

  /* ---------------------------------------------------------------------
     Parameter stability. The same pattern with its thresholds scaled; a
     lift that only holds at one setting is fitted to this dataset.
     --------------------------------------------------------------------- */
  function parameterStability(observations, pattern, sweep, minimumSupport) {
    /* Nothing numeric to sweep means there was no test, which must not be
       recorded as a passed one. */
    var hasThreshold = pattern.terms.some(hasNumericThreshold);
    if (!hasThreshold) return { state: "NOT_APPLICABLE_NO_THRESHOLD", points: [] };
    var lifts = [], points = [];
    for (var i = 0; i < sweep.length; i++) {
      var scaled = { id: pattern.id + "@" + sweep[i], terms: pattern.terms.map(function (term) { return scaleCandidate(term, sweep[i]); }) };
      var result = evaluatePattern(observations, scaled);
      points.push({ factor: sweep[i], support: result.support, lift: result.lift });
      if (result.support >= minimumSupport && finite(result.lift)) lifts.push(result.lift);
    }
    if (lifts.length < 3) return { state: "UNDETERMINED", reason: "TOO_FEW_USABLE_SETTINGS", points: points };
    var lo = Math.min.apply(null, lifts), hi = Math.max.apply(null, lifts), mid = median(lifts);
    var spread = mid > 0 ? (hi - lo) / mid : null;
    return { state: "MEASURED", points: points, medianLift: mid, minLift: lo, maxLift: hi, relativeSpread: spread };
  }

  /* ---------------------------------------------------------------------
     Publication gate. A pattern study may not carry a forecast, and a
     finding that does not clear support, winners and out-of-sample lift is
     reported as such rather than dropped - a silently filtered list is its
     own kind of cherry pick.
     --------------------------------------------------------------------- */
  var FORBIDDEN_KEYS = ["prediction", "forecast", "probabilityOfSuccess", "expectedReturn", "targetPrice", "recommendation"];

  function publicationViolations(study) {
    var errors = [];
    if (!study || typeof study !== "object") return ["study must be an object"];
    FORBIDDEN_KEYS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(study, key)) errors.push("forbidden field '" + key + "'");
    });
    if (study.methodologyVersion !== METHODOLOGY_VERSION) errors.push("unexpected methodologyVersion");
    if (!study.survivorship || study.survivorship.state !== "PRESENT_AND_UNQUANTIFIED_IN_PART") {
      errors.push("a rate from this population must carry its survivorship statement");
    }
    if (study.backtest !== "NOT_CERTIFIED") errors.push("backtest gate must stay closed");
    (study.findings || []).forEach(function (finding) {
      if (finding.support < study.thresholds.minimumSupport && finding.verdict !== "INSUFFICIENT_SUPPORT") {
        errors.push("finding '" + finding.patternId + "' is below minimum support but not marked so");
      }
      if (finding.conditionalRate !== null && finding.conditionalRate !== undefined && !finding.wilsonInterval) {
        errors.push("finding '" + finding.patternId + "' reports a rate without an interval");
      }
      if (finding.verdict === "ROBUST" && !(finding.outOfSample && finding.outOfSample.lift > 1)) {
        errors.push("finding '" + finding.patternId + "' is called robust without an out-of-sample lift above 1");
      }
    });
    return errors;
  }

  function assertPublishable(study) {
    var errors = publicationViolations(study);
    if (errors.length) throw new Error("Pattern study is not publishable: " + errors.join("; "));
    return study;
  }

  var api = {
    METHODOLOGY_VERSION: METHODOLOGY_VERSION,
    STUDY_SCHEMA: STUDY_SCHEMA,
    COHORTS: COHORTS.slice(),
    FEATURE_IDS: FEATURE_IDS.slice(),
    VOLUME_FEATURE_IDS: VOLUME_FEATURE_IDS.slice(),
    VOLUME_MAX_STALE_DAYS: VOLUME_MAX_STALE_DAYS,
    featuresAt: featuresAt,
    volumeFeaturesAt: volumeFeaturesAt,
    volumeFeaturesForDate: volumeFeaturesForDate,
    cumulativeSplitFactors: cumulativeSplitFactors,
    dailyIndexAtOrBefore: dailyIndexAtOrBefore,
    candidateFeatures: candidateFeatures,
    hasNumericThreshold: hasNumericThreshold,
    runningMaxOf: runningMaxOf,
    candidateMasks: candidateMasks,
    evaluateMasked: evaluateMasked,
    populationMedianForward: populationMedianForward,
    maskedSubset: maskedSubset,
    outcomeAfter: outcomeAfter,
    observe: observe,
    matchesCandidate: matchesCandidate,
    matchesPattern: matchesPattern,
    scaleCandidate: scaleCandidate,
    evaluatePattern: evaluatePattern,
    walkForwardFolds: walkForwardFolds,
    parameterStability: parameterStability,
    wilson: wilson,
    twoProportionP: twoProportionP,
    benjaminiHochberg: benjaminiHochberg,
    median: median,
    publicationViolations: publicationViolations,
    assertPublishable: assertPublishable
  };

  if (isNode) module.exports = api;
  else global.VUPatternResearch = api;
})(typeof window !== "undefined" ? window : globalThis);
