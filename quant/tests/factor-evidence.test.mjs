import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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

const shards = existsSync(ARTIFACT_DIR)
  ? readdirSync(ARTIFACT_DIR).filter((name) => name.endsWith(".json.gz"))
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
