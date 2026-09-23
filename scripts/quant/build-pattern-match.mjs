#!/usr/bin/env node
/* =========================================================================
   Materialize VU Pattern Match (M5).

   Reads only artifacts that already exist:
     quant/data/market/discover-series-long/ref_*.json        weekly closes
     quant/data/product/pattern-research-v1/study.json        the findings
     quant/data/product/pattern-research-fundamentals-v1/…    the overlay
     quant/data/sec/consumer/CIK*.json                        PIT filings

   Writes quant/data/product/pattern-match-v1/.

   WHAT THIS IS

   For one title: which of the pre-registered patterns its CURRENT
   configuration satisfies, and what the population statistics for those
   patterns were. That is a population statement applied to a title.

   WHAT IT IS NOT

   A statement about this title's future. The population statistic does not
   become a probability by being shown next to a name. Every row therefore
   carries the pattern's loss lift and asymmetry beside its lift, its
   verdict, and the study's survivorship and overlap caveats - and the
   artifact carries no per-title number that was not measured on the
   population.

   The study itself is ~800 KB and is not shipped to the browser. What
   ships is a compact projection: the findings table once per shard head,
   and per title only which candidate ids it satisfies.
   ========================================================================= */
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Patterns = require(join(ROOT, "quant/engines/pattern-research.js"));
const PIT = require(join(ROOT, "quant/engines/pit-fundamental-history.js"));

const SERIES_DIR = join(ROOT, "quant/data/market/discover-series-long");
const CONSUMER_DIR = join(ROOT, "quant/data/sec/consumer");
const PRICE_STUDY = join(ROOT, "quant/data/product/pattern-research-v1/study.json");
const FUNDAMENTAL_STUDY = join(ROOT, "quant/data/product/pattern-research-fundamentals-v1/study.json");
const OUT_DIR = join(ROOT, "quant/data/product/pattern-match-v1");
const SCHEMA = "pattern-match-1.0.0";

const priceMethodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/pattern-research-v1.json"), "utf8"));
const fundamentalMethodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/pattern-research-fundamentals-v1.json"), "utf8"));

const USED_METRICS = ["revenue", "net_income", "gross_profit", "free_cash_flow",
                      "capital_expenditures", "total_assets", "stockholders_equity",
                      "cash_and_equivalents", "shares_outstanding"];

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, digits = 4) => (finite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);

/* Only findings a reader should ever see attached to a title. A pattern
   that did not hold out of sample, or that rests on too few cases, is not
   shown next to an instrument - it would read as evidence about that
   instrument, which is exactly what it is not. The counts of what was
   withheld are published so the selection is visible. */
function usableFindings(study, family, plainById) {
  const kept = [], withheld = {};
  for (const finding of study.findings) {
    if (finding.verdict !== "ROBUST") { withheld[finding.verdict] = (withheld[finding.verdict] || 0) + 1; continue; }
    kept.push({
      id: finding.patternId,
      family,
      kind: finding.kind,
      /* Product copy is derived from the pre-registration, not copied from
         the study. The study's label was written when it ran; the wording a
         reader sees has one home, so fixing it there fixes it everywhere
         without re-running twenty minutes of measurement. A pattern id is
         its candidate ids joined by "+", and a candidate id never contains
         one. */
      plain: finding.patternId.split("+").map((id) => plainById.get(id) || id).join(" und "),
      terms: finding.terms,
      lift: finding.lift,
      lossLift: finding.lossLift,
      asymmetry: finding.asymmetry,
      conditionalRate: finding.conditionalRate,
      baseRate: finding.baseRate,
      conditionalLossRate: finding.conditionalLossRate,
      baseLossRate: finding.baseLossRate,
      support: finding.support,
      winners: finding.winners,
      outOfSampleLift: finding.outOfSample ? finding.outOfSample.lift : null,
      medianForwardReturn: finding.medianForwardReturn,
      medianForwardReturnPopulation: finding.medianForwardReturnPopulation,
      medianMaxDrawdownWithinHorizon: finding.medianMaxDrawdownWithinHorizon,
      incremental: finding.incremental === undefined ? null : finding.incremental
    });
  }
  return { kept, withheld };
}

function monthEndIndex(dates) {
  return dates.length - 1;
}

function main() {
  if (!existsSync(PRICE_STUDY)) throw new Error("the price study is not materialized; run build-pattern-research.mjs first");
  const price = JSON.parse(readFileSync(PRICE_STUDY, "utf8"));
  const fundamental = existsSync(FUNDAMENTAL_STUDY) ? JSON.parse(readFileSync(FUNDAMENTAL_STUDY, "utf8")) : null;

  const plainById = new Map();
  for (const candidate of priceMethodology.candidates.concat(fundamentalMethodology.candidates)) {
    plainById.set(candidate.id, candidate.plain);
  }
  const priceFindings = usableFindings(price, "PRICE", plainById);
  const fundamentalFindings = fundamental ? usableFindings(fundamental, "FUNDAMENTAL", plainById) : { kept: [], withheld: {} };
  /* Every finding must resolve to real copy; an id falling through to
     itself would put a slug in front of a reader. */
  for (const finding of priceFindings.kept.concat(fundamentalFindings.kept)) {
    for (const id of finding.id.split("+")) {
      if (!plainById.has(id)) throw new Error("pattern '" + finding.id + "' names an unknown candidate '" + id + "'");
    }
  }
  const findings = priceFindings.kept.concat(fundamentalFindings.kept);

  /* The candidate vocabulary a title is evaluated against: exactly the two
     pre-registered lists, so a shown pattern is always one that was
     measured under a correction. */
  const candidates = priceMethodology.candidates.concat(fundamentalMethodology.candidates);

  const bundlesByTicker = new Map();
  for (const file of readdirSync(CONSUMER_DIR)) {
    if (!file.startsWith("CIK") || !file.endsWith(".json")) continue;
    const payload = JSON.parse(readFileSync(join(CONSUMER_DIR, file), "utf8"));
    const annual = {};
    for (const metric of USED_METRICS) {
      if (Array.isArray(payload.annual?.[metric])) annual[metric] = payload.annual[metric];
    }
    for (const name of payload.tickers || []) bundlesByTicker.set(name, { annual });
  }

  const shards = new Map();
  let matched = 0, withoutFundamentals = 0, cutoff = null;

  for (const file of readdirSync(SERIES_DIR)) {
    if (!file.startsWith("ref_") || !file.endsWith(".json")) continue;
    const payload = JSON.parse(readFileSync(join(SERIES_DIR, file), "utf8"));
    if (payload.status !== "CALCULATED" || payload.grain !== "weekly") continue;
    if (payload.priceSeriesType !== "SPLIT_ADJUSTED") continue;
    const points = payload.points || [];
    if (points.length < priceMethodology.observationGrid.minimumHistoryWeeks) continue;

    const dates = points.map((point) => point[0]);
    const closes = points.map((point) => point[1]);
    const index = monthEndIndex(dates);
    const asOf = dates[index];
    if (cutoff === null || asOf > cutoff) cutoff = asOf;

    const priceFeatures = Patterns.featuresAt(closes, index, { runningMax: Patterns.runningMaxOf(closes) });
    if (!priceFeatures) continue;
    const bundle = bundlesByTicker.get(payload.ticker);
    const fundamentalFeatures = bundle ? PIT.featuresAt(bundle, asOf) : null;
    if (!fundamentalFeatures) withoutFundamentals += 1;
    const features = { ...priceFeatures, ...(fundamentalFeatures || {}) };

    /* Which candidates hold, and which could not be measured at all. The
       second list matters: a pattern that is simply unmeasurable for this
       title must not look like one the title fails. */
    const holds = [], unmeasurable = [];
    for (const candidate of candidates) {
      const result = Patterns.matchesCandidate(features, candidate);
      if (result === null) unmeasurable.push(candidate.id);
      else if (result) holds.push(candidate.id);
    }
    matched += 1;

    const shard = (payload.ticker + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_");
    if (!shards.has(shard)) shards.set(shard, {});
    shards.get(shard)[payload.ticker] = {
      ticker: payload.ticker,
      securityId: payload.securityId,
      asOf,
      holds,
      unmeasurable,
      hasFundamentals: !!fundamentalFeatures
    };
  }

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const head = {
    schemaVersion: SCHEMA,
    generatedAt,
    asOf: cutoff,
    horizon: price.primary.horizon,
    horizonMonths: price.primary.horizonMonths,
    winnerThreshold: price.primary.winnerThreshold,
    winnerMinReturn: price.primary.winnerMinReturn,
    lossThreshold: -0.5,
    baseRate: price.primary.baseRate,
    studies: {
      price: { methodologyVersion: price.methodologyVersion, contentHash: price.contentHash },
      fundamental: fundamental ? { methodologyVersion: fundamental.familyVersion, contentHash: fundamental.contentHash } : null
    },
    /* The caveats travel with the numbers. A lift shown beside a ticker
       without them would read as a statement about that ticker. */
    caveats: {
      backtest: "NOT_CERTIFIED",
      prediction: "NOT_MADE",
      survivorship: price.survivorship.state,
      survivorshipEffectOnAbsoluteRates: price.survivorship.effectOnAbsoluteRates,
      independence: price.independence.state,
      totalReturn: false,
      statement: "Diese Zahlen beschreiben eine Grundgesamtheit in der Vergangenheit. Sie werden nicht dadurch zu einer Aussage ueber diesen Titel, dass sie neben seinem Namen stehen."
    },
    withheld: { price: priceFindings.withheld, fundamental: fundamentalFindings.withheld },
    withheldNote: "Nur Muster mit dem Urteil ROBUST werden neben einem Titel gezeigt. Was zurueckgehalten wurde, steht hier gezaehlt statt zu verschwinden.",
    findings: findings.map((finding) => ({
      ...finding,
      lift: round(finding.lift), lossLift: round(finding.lossLift), asymmetry: round(finding.asymmetry),
      conditionalRate: round(finding.conditionalRate), baseRate: round(finding.baseRate),
      conditionalLossRate: round(finding.conditionalLossRate), baseLossRate: round(finding.baseLossRate),
      outOfSampleLift: round(finding.outOfSampleLift),
      medianForwardReturn: round(finding.medianForwardReturn),
      medianForwardReturnPopulation: round(finding.medianForwardReturnPopulation),
      medianMaxDrawdownWithinHorizon: round(finding.medianMaxDrawdownWithinHorizon)
    }))
  };

  for (const [shard, instruments] of shards) {
    writeFileSync(join(OUT_DIR, shard + ".json.gz"),
      gzipSync(Buffer.from(JSON.stringify({ ...head, shard, instruments })), { level: 9 }));
  }

  const summary = {
    ...head,
    instruments: matched,
    withoutFundamentals,
    shards: [...shards.keys()].sort(),
    candidates: candidates.length
  };
  delete summary.findings;
  summary.findingCount = { price: priceFindings.kept.length, fundamental: fundamentalFindings.kept.length };
  writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 1) + "\n");

  process.stdout.write(
    "pattern-match " + SCHEMA + " @ " + cutoff + "\n" +
    "  " + matched + " Titel, " + withoutFundamentals + " ohne sichtbare Bilanz\n" +
    "  " + priceFindings.kept.length + " Kursmuster und " + fundamentalFindings.kept.length +
    " Fundamentalmuster mit Urteil ROBUST; zurueckgehalten " +
    JSON.stringify({ ...priceFindings.withheld }) + "\n"
  );
}

main();
