import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const FactorEvidence = require("../engines/factor-evidence.js");
const ChangeEngine = require("../engines/change-engine.js");
const contract = require("../methodology/quant-v2.json");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(ROOT, "quant/data/product/factor-evidence-v1");

/* ------------------------------------------------------------------ engine */

test("the published factor set is exactly the canonical seven, in contract order", () => {
  assert.deepEqual(FactorEvidence.FACTOR_ORDER, contract.factorOrder);
});

test("this engine is versioned separately from the Quant V2 contract it derives from", () => {
  assert.equal(FactorEvidence.DERIVED_FROM, contract.methodologyVersion);
  assert.notEqual(FactorEvidence.METHODOLOGY_VERSION, contract.methodologyVersion);
});

test("midrank percentiles are deterministic and tie-stable", () => {
  const values = [10, 20, 20, 30];
  const higher = FactorEvidence.midrankPercentiles(values, "higher");
  assert.equal(higher[1], higher[2], "equal inputs must receive the same percentile");
  assert.ok(higher[0] < higher[1] && higher[1] < higher[3]);
  /* Array position must not decide the outcome. */
  const shuffled = FactorEvidence.midrankPercentiles([20, 30, 10, 20], "higher");
  assert.equal(shuffled[0], higher[1]);
  assert.equal(shuffled[2], higher[0]);
});

test("direction lower inverts the percentile rather than the raw input", () => {
  const lower = FactorEvidence.midrankPercentiles([10, 20, 30], "lower");
  assert.equal(lower[0], 100);
  assert.equal(lower[2], 0);
});

test("winsorization clamps the tails without dropping observations", () => {
  const values = [-1000, 1, 2, 3, 4, 5, 1000];
  const bounds = FactorEvidence.winsorBounds(values);
  assert.equal(bounds.count, values.length);
  assert.ok(FactorEvidence.clamp(-1000, bounds) > -1000);
  assert.ok(FactorEvidence.clamp(1000, bounds) < 1000);
  assert.equal(FactorEvidence.clamp(3, bounds), 3);
});

test("the peer blend follows the contract and universe-only stays universe-only", () => {
  assert.equal(FactorEvidence.blend(80, 60, "sic4_industry"), 0.7 * 80 + 0.3 * 60);
  assert.equal(FactorEvidence.blend(80, 60, "universe"), 60);
  assert.equal(FactorEvidence.blend(null, 60, "sic4_industry"), 60);
});

test("a factor falls closed below its own minimum component count or weight", () => {
  const quality = contract.factors.quality;
  const two = [
    { id: "a", weight: 0.4, state: "AVAILABLE", score: 70 },
    { id: "b", weight: 0.4, state: "AVAILABLE", score: 70 }
  ];
  assert.equal(FactorEvidence.assembleFactor(quality, two).reason, "INSUFFICIENT_COMPONENTS");
  const thin = [
    { id: "a", weight: 0.1, state: "AVAILABLE", score: 70 },
    { id: "b", weight: 0.1, state: "AVAILABLE", score: 70 },
    { id: "c", weight: 0.1, state: "AVAILABLE", score: 70 }
  ];
  assert.equal(FactorEvidence.assembleFactor(quality, thin).reason, "INSUFFICIENT_WEIGHTED_COVERAGE");
});

test("a missing component never has its weight redistributed to another factor", () => {
  const quality = contract.factors.quality;
  const components = [
    { id: "a", weight: 0.25, state: "AVAILABLE", score: 100 },
    { id: "b", weight: 0.20, state: "AVAILABLE", score: 0 },
    { id: "c", weight: 0.15, state: "AVAILABLE", score: 50 },
    { id: "d", weight: 0.20, state: "UNAVAILABLE", score: null }
  ];
  const assembled = FactorEvidence.assembleFactor(quality, components);
  assert.equal(assembled.state, "AVAILABLE");
  assert.equal(assembled.availableWeight, 0.6);
  /* Renormalization happens inside the factor only, and is disclosed. */
  assert.equal(assembled.score, (0.25 * 100 + 0.20 * 0 + 0.15 * 50) / 0.6);
});

test("bands use the contract cut points", () => {
  contract.score.ratingBands.forEach((band) => {
    assert.ok(FactorEvidence.BANDS.some((entry) => entry.min === band.min), "missing band at " + band.min);
  });
  assert.equal(FactorEvidence.band(95).id, "VERY_STRONG");
  assert.equal(FactorEvidence.band(50).id, "NEUTRAL");
  assert.equal(FactorEvidence.band(10).id, "VERY_WEAK");
});

test("the publication gate rejects a composite score, a rank or a stray factor", () => {
  const sound = {
    composite: { state: "WITHHELD", reason: "QUANT_V2_NOT_ACTIVE" },
    factors: Object.fromEntries(FactorEvidence.FACTOR_ORDER.map((id) => [id, { state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", score: null }]))
  };
  assert.deepEqual(FactorEvidence.publicationViolations(sound), []);
  assert.ok(FactorEvidence.publicationViolations({ ...sound, quantScore: 82 }).length);
  assert.ok(FactorEvidence.publicationViolations({ ...sound, rank: 1 }).length);
  assert.ok(FactorEvidence.publicationViolations({ ...sound, composite: { state: "AVAILABLE" } }).length);
  const scored = JSON.parse(JSON.stringify(sound));
  scored.factors.momentum.score = 82;
  assert.ok(FactorEvidence.publicationViolations(scored).length, "an unavailable factor must not carry a score");
});

test("ordered() keeps the canonical order and explains every closed factor", () => {
  const record = {
    factors: Object.fromEntries(FactorEvidence.FACTOR_ORDER.map((id, index) => [id,
      index === 2 ? { state: "AVAILABLE", score: 80, availableWeight: 0.8, confidence: 90, components: [] }
        : { state: "UNAVAILABLE", reason: "BLOCKED_EXTERNAL", score: null, components: [] }]))
  };
  const ordered = FactorEvidence.ordered(record);
  assert.deepEqual(ordered.map((entry) => entry.id), FactorEvidence.FACTOR_ORDER);
  ordered.filter((entry) => entry.state !== "AVAILABLE").forEach((entry) => {
    assert.ok(entry.reasonText && entry.reasonText.length > 20, "a closed factor needs a readable reason");
    assert.equal(entry.score, null);
  });
  assert.equal(ordered[2].band, "STRONG");
});

/* ------------------------------------------------------------- change engine */

test("change is measured on inputs; a factor-score trajectory stays closed", () => {
  const model = ChangeEngine.build({ price: null, priceStatus: {}, fundamentals: null });
  const scoreMomentum = model.items.find((entry) => entry.id === "scoreMomentum");
  assert.equal(scoreMomentum.state, "UNAVAILABLE");
  assert.equal(scoreMomentum.reason, "FACTOR_SNAPSHOT_HISTORY_NOT_MATERIALIZED");
  const revisions = model.items.find((entry) => entry.id === "revisionsTrend");
  assert.equal(revisions.reason, "BLOCKED_EXTERNAL");
});

test("change directions follow the versioned thresholds", () => {
  const price = {
    returns: { "1M": 0.10, "3M": 0.09, "6M": 0.2, "12M": 0.3 },
    momentumAcceleration: 0.07,
    relativeStrength: { "1M": 0.05, "3M": 0.06, "6M": 0.06, "12M": 0.1 },
    volatility20d: 0.2, volatility60d: 0.25, volatility252d: 0.4, maxDrawdown252d: -0.2,
    avgVolume20d: 200, avgVolume60d: 100, volumeRatio20over60: 2, volumeSpikeRatio: 1.1,
    priceAboveSMA20: true, priceAboveSMA50: true, priceAboveSMA100: true, priceAboveSMA200: true,
    distanceTo52wHigh: -0.01, distanceTo52wLow: 0.5, newHigh52w: false, within5PctOf52wHigh: true
  };
  const model = ChangeEngine.build({ price, priceStatus: { momentumAcceleration: "CALCULATED" }, fundamentals: null, asOf: "2026-09-18" });
  const by = (id) => model.items.find((entry) => entry.id === id);
  assert.equal(by("momentumPace").direction, "IMPROVING");
  assert.equal(by("volatilityRegime").direction, "IMPROVING", "20d well below 252d is a compression");
  assert.equal(by("volumeRegime").direction, "IMPROVING");
  assert.equal(by("trendStructure").direction, "IMPROVING");
  assert.equal(by("highProximity").direction, "IMPROVING");
  assert.ok(ChangeEngine.headline(model).includes("Verbessert"));
});

test("the compact wire format loses no measurement and restores its wording", () => {
  const model = ChangeEngine.build({
    price: { returns: { "1M": 0.01, "3M": 0.03 }, momentumAcceleration: 0.0, relativeStrength: { "1M": 0, "6M": 0 } },
    priceStatus: { momentumAcceleration: "CALCULATED" }, fundamentals: null, asOf: "2026-09-18", basis: "adjustedClose"
  });
  const restored = ChangeEngine.hydrate(ChangeEngine.compact(model));
  assert.equal(restored.items.length, model.items.length);
  model.items.forEach((entry, index) => {
    assert.equal(restored.items[index].id, entry.id);
    assert.equal(restored.items[index].state, entry.state);
    assert.equal(restored.items[index].direction, entry.direction);
    assert.equal(restored.items[index].label, entry.label, "wording must survive the round trip");
    if (entry.state !== "AVAILABLE") assert.ok(restored.items[index].reasonText);
  });
});

/* ---------------------------------------------------------------- artifact */

/* The screening table lives in the same directory under its own schema;
   it is validated by the strategy-match suite, not as a factor shard. */
const shards = existsSync(ARTIFACT_DIR)
  ? readdirSync(ARTIFACT_DIR).filter((name) => name.endsWith(".json.gz") && name !== "screening.json.gz")
  : [];

test("the materialized factor evidence exists and declares its gates", () => {
  assert.ok(shards.length > 100, "expected a sharded broad-universe artifact");
  const summary = JSON.parse(readFileSync(join(ARTIFACT_DIR, "summary.json"), "utf8"));
  assert.ok(FactorEvidence.validSummary(summary));
  assert.equal(summary.publication.compositeAllowed, false);
  assert.equal(summary.publication.rankingAllowed, false);
  assert.ok(summary.counts.published > 5000, "the artifact must cover the broad universe, not a sample");
  assert.ok(Array.isArray(summary.openInputGates) && summary.openInputGates.length);
  summary.openInputGates.forEach((gate) => {
    assert.ok(gate.id && Array.isArray(gate.blocks) && gate.blocks.length && gate.owner, "a gate must name what it blocks and who owns it");
  });
  /* Revisions is closed for every single security, without exception. */
  assert.equal(summary.factorStates.revisions.AVAILABLE, 0);
  assert.equal(summary.factorStates.revisions.UNAVAILABLE, summary.counts.published);
});

test("every published security passes the publication gate and the contract minima", () => {
  let checked = 0, available = 0;
  for (const name of shards) {
    const shard = JSON.parse(gunzipSync(readFileSync(join(ARTIFACT_DIR, name))));
    assert.ok(FactorEvidence.validShard(shard, name.replace(".json.gz", "")), "invalid shard " + name);
    for (const [ticker, record] of Object.entries(shard.securities)) {
      assert.deepEqual(FactorEvidence.publicationViolations(record), [], ticker);
      assert.equal(record.ticker, ticker);
      assert.equal(record.factors.revisions.reason, "BLOCKED_EXTERNAL");
      for (const id of FactorEvidence.FACTOR_ORDER) {
        const factor = record.factors[id];
        if (factor.state !== "AVAILABLE") continue;
        available += 1;
        assert.ok(factor.score >= 0 && factor.score <= 100, ticker + "." + id + " out of range");
        const minimum = contract.factors[id].minimumDataRequirements;
        const counted = factor.components.filter((component) => component.state === "AVAILABLE");
        assert.ok(counted.length >= minimum.minimumComponents, ticker + "." + id + " below minimum components");
        assert.ok(factor.availableWeight + 1e-9 >= minimum.minimumOriginalWeight, ticker + "." + id + " below minimum weight");
      }
      checked += 1;
    }
  }
  assert.ok(checked > 5000, "expected broad coverage, got " + checked);
  assert.ok(available > 10000, "expected a substantial number of available factors, got " + available);
});

/* ------------------------------------------------- the snapshot history */

const HISTORY_DIR = join(ROOT, "quant/data/product/factor-evidence-history");

test("the snapshot history has started, is versioned by methodology and is immutable", () => {
  const index = JSON.parse(readFileSync(join(HISTORY_DIR, "index.json"), "utf8"));
  assert.equal(index.schemaVersion, FactorEvidence.SNAPSHOT_INDEX_SCHEMA);
  const dates = index.series[FactorEvidence.METHODOLOGY_VERSION];
  assert.ok(Array.isArray(dates) && dates.length >= 1, "the history must have at least its first snapshot");
  assert.deepEqual(dates, dates.slice().sort(), "snapshot dates are kept in order");

  /* A snapshot lives under its methodology, so a later methodology starts
     its own series instead of rewriting this one. */
  const dir = join(HISTORY_DIR, FactorEvidence.METHODOLOGY_VERSION);
  dates.forEach((date) => {
    const snapshot = JSON.parse(gunzipSync(readFileSync(join(dir, date + ".json.gz"))));
    assert.equal(snapshot.schemaVersion, FactorEvidence.SNAPSHOT_SCHEMA);
    assert.equal(snapshot.methodologyVersion, FactorEvidence.METHODOLOGY_VERSION);
    assert.equal(snapshot.namespace, FactorEvidence.NAMESPACE);
    assert.equal(snapshot.asOf, date, "the file name and the recorded date must agree");
    assert.equal(snapshot.fields.length, FactorEvidence.FACTOR_ORDER.length);
    assert.ok(Object.keys(snapshot.rows).length > 5000);
    /* Every snapshot carries a hash over its own content. */
    assert.match(String(snapshot.contentHash), /^[a-f0-9]{16}$/);
  });
});

test("the snapshot history is not inside the directory a rebuild deletes", () => {
  assert.ok(!HISTORY_DIR.startsWith(ARTIFACT_DIR + "/"),
    "a published snapshot must not be something a rebuild of the current artifact can remove");
});

test("a score trajectory is only published once the history reaches back far enough", () => {
  const summary = JSON.parse(readFileSync(join(ARTIFACT_DIR, "summary.json"), "utf8"));
  const dates = summary.snapshotHistory.dates;
  assert.equal(summary.snapshotHistory.methodologyVersion, FactorEvidence.METHODOLOGY_VERSION);
  assert.equal(summary.snapshotHistory.velocityWindowDays, ChangeEngine.SCORE_VELOCITY_DAYS);

  /* With one snapshot there is nothing to compare against, and the shipped
     artifact must say so rather than showing a trajectory of one point. */
  const shard = JSON.parse(gunzipSync(readFileSync(join(ARTIFACT_DIR, shards[0]))));
  const [record] = Object.values(shard.securities);
  const change = ChangeEngine.hydrate(record.change);
  const scoreMomentum = change.items.find((entry) => entry.id === "scoreMomentum");
  if (dates.length < 2) {
    assert.equal(scoreMomentum.state, "UNAVAILABLE");
    assert.ok(["FACTOR_SNAPSHOT_HISTORY_NOT_MATERIALIZED", "INSUFFICIENT_SNAPSHOT_HISTORY"].includes(scoreMomentum.reason));
  }
});

test("the score trajectory compares published values and names why it is closed", () => {
  const meaning = ChangeEngine.MEANING.scoreMomentum;
  assert.equal(ChangeEngine.scoreMomentumItem(null, { momentum: 80 }, "2026-09-18").reason,
    "FACTOR_SNAPSHOT_HISTORY_NOT_MATERIALIZED", "no history at all is its own answer");
  assert.equal(ChangeEngine.scoreMomentumItem([{ asOf: "2026-09-15", factors: { momentum: 70 } }], { momentum: 80 }, "2026-09-18").reason,
    "INSUFFICIENT_SNAPSHOT_HISTORY", "a history that is too short is a different answer");

  const open = ChangeEngine.scoreMomentumItem(
    [{ asOf: "2026-08-19", factors: { momentum: 68, quality: 59 } }],
    { momentum: 82, quality: 60 }, "2026-09-18");
  assert.equal(open.state, "AVAILABLE");
  assert.equal(open.direction, "IMPROVING");
  assert.equal(open.magnitude, 7.5, "the average move across both factors");
  assert.ok(open.from.label.includes("2026-08-19"), "the comparison point names its own date");
  assert.ok(meaning.label.length > 0);

  /* A snapshot dated after the cutoff can never become a comparison point. */
  const future = ChangeEngine.scoreMomentumItem(
    [{ asOf: "2026-10-19", factors: { momentum: 68 } }], { momentum: 82 }, "2026-09-18");
  assert.equal(future.state, "UNAVAILABLE");
});

test("a hydrated record renders with wording, and never with a composite", () => {
  const shard = JSON.parse(gunzipSync(readFileSync(join(ARTIFACT_DIR, shards[0]))));
  const [record] = Object.values(shard.securities);
  const hydrated = FactorEvidence.hydrate(record, shard);
  const ordered = FactorEvidence.ordered(hydrated);
  assert.deepEqual(ordered.map((entry) => entry.id), FactorEvidence.FACTOR_ORDER);
  ordered.forEach((entry) => {
    assert.ok(entry.label && entry.question && entry.plain, "every factor needs its meaning layer");
    entry.components.forEach((component) => {
      assert.ok(component.label, "every component needs a readable label after hydration");
      assert.ok(Number.isFinite(component.weight), "every component needs its contract weight after hydration");
    });
  });
  assert.equal(hydrated.composite.state, "WITHHELD");
  assert.ok(FactorEvidence.summarySentence(hydrated).length > 20);
});

test("a published snapshot survives a later run that would compute it differently", async () => {
  /* The defect this pins, which cost a whole materialization run before it
     was measured: the snapshot is keyed by the MARKET data cutoff, but its
     values also depend on the fundamentals vintage, which the SEC export
     refreshes on its own schedule. The factors are percentiles, so when
     anyone's inputs move, everyone's rank moves with them - 2,653 of 6,403
     rows differed on 2026-09-21, by hundredths.
     
     A later run recomputing a past cutoff differently is therefore the
     normal case. The materializer's own rule already says what to do with
     it: a comparison point has to be a value that was PUBLISHED on that
     date, not one recomputed today. So the published file stands and the
     recomputation is simply not a snapshot - it must not abort the run,
     and it must not pass in silence either. */
  const source = await readFile(new URL("../../scripts/quant/build-factor-evidence.mjs", import.meta.url), "utf8");
  const guard = source.slice(source.indexOf("snapshot.contentHash = snapshotHash(snapshot);"),
    source.indexOf("const snapshotDates"));
  assert.ok(guard.length > 400);

  /* Corruption still stops the run: a file that does not match its own
     hash is not evidence, and writing past it would launder it. */
  assert.match(guard, /does not match its own content hash/);
  assert.match(guard, /throw new Error\("the published snapshot/);

  /* A differing recomputation does not. */
  assert.equal(/a published past is not rewritten/.test(guard), false,
    "a legitimate recomputation still aborts the run");
  assert.match(guard, /recomputationDrift = \{/);
  assert.match(guard, /rowsDiffering/);

  /* And the published file is only ever written when none exists. */
  const writes = guard.match(/writeFileSync\(snapshotPath/g) || [];
  assert.equal(writes.length, 1, "the snapshot is written on more than one path");
  assert.match(guard, /\} else \{\s*\n\s*writeFileSync\(snapshotPath/);
});

test("the drift, when it happens, reaches the summary rather than the log", async () => {
  /* Silent is the one thing it must not be: that the inputs behind an
     already-published date have moved is worth knowing, and a line in a
     CI log is not somewhere anybody looks. */
  const summary = JSON.parse(await readFile(
    new URL("../data/product/factor-evidence-v1/summary.json", import.meta.url), "utf8"));
  assert.ok("recomputationDrift" in summary.snapshotHistory,
    "the summary does not carry the drift field at all");
  const drift = summary.snapshotHistory.recomputationDrift;
  if (drift === null) return;
  assert.match(drift.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(drift.publishedHash, drift.recomputedHash);
  assert.ok(drift.rowsDiffering > 0 && drift.rowsDiffering <= drift.rowsTotal);
  assert.ok(drift.note.length > 40);
  /* The published date stays in the series exactly once. */
  assert.equal(summary.snapshotHistory.dates.filter((d) => d === drift.asOf).length, 1);
});
