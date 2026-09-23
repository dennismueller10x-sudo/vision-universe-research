#!/usr/bin/env node
/* =========================================================================
   Materialize the broad Setup Observation product artifact.

   Reads only artifacts that already exist:
     quant/data/product/technical-signals-v1/<shard>.json.gz   the bundles
     quant/methodology/setup-state-v1.json                     the mapping

   Writes quant/data/product/setup-observations-v1/ (rebuilt every run) and
   appends one immutable observation per cutoff to
   quant/data/product/setup-observation-history/<mappingVersion>/.

   No bar is recomputed here. Every input is a value the technical engines
   already published, read through the canonical catalog vocabulary, so the
   rule that assigns a state is the same rule that screens for it.

   The history is the whole point of the path-dependent tier. ACTIVE,
   RISK_RISING, INVALIDATED and EXIT are statements about a course of
   events; they may only be reached from a state that was actually observed
   on an earlier date. A run therefore never rewrites a published
   observation - if it would, it aborts.
   ========================================================================= */
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SetupEngine = require(join(ROOT, "quant/engines/setup-engine.js"));
const Catalog = require(join(ROOT, "quant/engines/catalog.js"));

const TECHNICAL_DIR = join(ROOT, "quant/data/product/technical-signals-v1");
const OUT_DIR = join(ROOT, "quant/data/product/setup-observations-v1");
/* Sibling, not child: OUT_DIR is deleted and rebuilt on every run, and a
   published observation must not be something a rebuild can erase. */
const HISTORY_ROOT = join(ROOT, "quant/data/product/setup-observation-history");

const methodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/setup-state-v1.json"), "utf8"));
const mapping = methodology.stateMapping;
const finite = (value) => typeof value === "number" && Number.isFinite(value);

/* ---------------------------------------------------------------------------
   The catalog row for one instrument, read straight from the bundle the
   technical materialization already published. Every entry names the bundle
   path it comes from, so a reader can check the claim against the artifact.
   --------------------------------------------------------------------------- */
const ROW_SOURCES = {
  technicalTrend: (b) => b.trend?.direction ?? null,
  technicalStructure: (b) => b.structure?.state?.regime ?? null,
  technicalConfirmedStructure: (b) => b.structure?.state?.confirmedRegime ?? null,
  technicalMomentumState: (b) => b.momentum?.state ?? null,
  technicalVolatilityRegime: (b) => b.volatility?.regime ?? null,
  technicalVolumeState: (b) => b.volume?.state ?? null,
  technicalSetupStatus: (b) => b.tradeSetup?.status ?? null,
  technicalEntryStatus: (b) => b.scenarios?.primary?.entryStatus ?? null,
  technicalPrimaryDirection: (b) => b.scenarios?.primary?.direction ?? null,
  technicalDistanceTo52wHigh: (b) => (finite(b.featuresAtCutoff?.distanceTo52wHigh) ? b.featuresAtCutoff.distanceTo52wHigh : null)
};

function rowOf(bundle) {
  const row = { status: "active" };
  for (const [field, read] of Object.entries(ROW_SOURCES)) {
    const value = read(bundle);
    row[field] = value === undefined ? null : value;
  }
  return row;
}

/* The two levels a later observation compares against. Both are taken from
   the setup the bundle documents today and frozen into the observation, so
   a future run measures against what was published, not against a level it
   recomputes with hindsight. */
function levelsOf(bundle) {
  const invalidation = bundle.tradeSetup?.analysisInvalidation?.price;
  const firstTarget = Array.isArray(bundle.tradeSetup?.targets) ? bundle.tradeSetup.targets[0] : null;
  const exit = firstTarget?.zoneLow;
  return {
    invalidationPrice: finite(invalidation) ? invalidation : null,
    exitPrice: finite(exit) ? exit : null
  };
}

function snapshotHash(snapshot) {
  const body = { ...snapshot };
  delete body.contentHash;
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 32);
}

function main() {
  const validation = SetupEngine.validateMapping(methodology);
  if (!validation.valid) throw new Error("the setup mapping is invalid: " + validation.errors.join("; "));
  for (const field of Object.keys(ROW_SOURCES)) {
    if (!Catalog.field(field)) throw new Error("row source '" + field + "' is not a catalog field");
  }

  /* 1. Read every published bundle. */
  const instruments = new Map();
  for (const file of readdirSync(TECHNICAL_DIR)) {
    if (!file.endsWith(".json.gz") || file.startsWith("signals-")) continue;
    const shard = JSON.parse(gunzipSync(readFileSync(join(TECHNICAL_DIR, file))));
    if (shard.schemaVersion !== "technical-product-artifact-1.0.0") continue;
    for (const [ticker, instrument] of Object.entries(shard.instruments || {})) {
      const bundle = instrument?.bundle;
      if (!bundle) continue;
      instruments.set(ticker, {
        ticker,
        securityId: instrument.securityId || null,
        snapshotId: instrument.snapshotId || null,
        dataCutoff: bundle.dataCutoff || null,
        close: finite(bundle.lastBar?.close) ? bundle.lastBar.close : null,
        engineVersions: bundle.engineVersions || null,
        parametersHash: bundle.parametersHash || null,
        row: rowOf(bundle),
        levels: levelsOf(bundle)
      });
    }
  }
  if (!instruments.size) throw new Error("no technical bundles found; nothing to observe");

  const cutoff = [...instruments.values()]
    .map((entry) => entry.dataCutoff)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!cutoff) throw new Error("no technical bundle carries a dataCutoff");

  /* 2. The ordered observation history of this mapping version. A snapshot
        dated at or after the cutoff can never be a predecessor. */
  const historyDir = join(HISTORY_ROOT, mapping.mappingVersion);
  const previousByTicker = new Map();
  const depthByTicker = new Map();
  let historyDates = [];
  const publishedSeries = [];
  if (existsSync(historyDir)) {
    historyDates = readdirSync(historyDir)
      .filter((file) => file.endsWith(".json.gz"))
      .map((file) => file.replace(/\.json\.gz$/, ""))
      .filter((date) => date < cutoff)
      .sort();
    for (const date of historyDates) {
      const snapshot = JSON.parse(gunzipSync(readFileSync(join(historyDir, date + ".json.gz"))));
      if (snapshot.schemaVersion !== SetupEngine.OBSERVATION_SCHEMA) continue;
      if (snapshot.mappingVersion !== mapping.mappingVersion) continue;
      /* The gate's integrity check needs to know whether a stored file still
         matches its own hash, so that is established here rather than
         assumed there. */
      publishedSeries.push({ asOf: snapshot.asOf, rows: snapshot.rows || {},
        contentHashValid: snapshot.contentHash === snapshotHash(snapshot) });
      for (const [ticker, entry] of Object.entries(snapshot.rows || {})) {
        previousByTicker.set(ticker, { setupState: entry[0], asOf: snapshot.asOf, invalidationPrice: entry[1], exitPrice: entry[2] });
        depthByTicker.set(ticker, (depthByTicker.get(ticker) || 0) + 1);
      }
    }
  }

  /* 3. Evaluate. */
  const shards = new Map();
  const counts = Object.fromEntries(SetupEngine.STATES.map((state) => [state, 0]));
  const rules = {};
  let unavailable = 0;
  const historyRows = {};

  for (const entry of [...instruments.values()].sort((a, b) => a.ticker.localeCompare(b.ticker))) {
    const previous = previousByTicker.get(entry.ticker) || null;
    const observation = SetupEngine.evaluate({
      row: entry.row,
      close: entry.close,
      previous,
      historyDepth: (depthByTicker.get(entry.ticker) || 0) + 1,
      methodology
    });
    const violations = SetupEngine.publicationViolations(observation);
    if (violations.length) throw new Error("publication gate violated for " + entry.ticker + ": " + violations.join("; "));

    /* What the history records is the state the cascade reached and the two
       levels it would later be measured against - never a score. */
    const recorded = observation.lifecycle.state || observation.classification.state;
    if (recorded && recorded !== "UNAVAILABLE") {
      counts[recorded] = (counts[recorded] || 0) + 1;
      rules[observation.matchedRule.ruleId] = (rules[observation.matchedRule.ruleId] || 0) + 1;
      historyRows[entry.ticker] = [recorded, entry.levels.invalidationPrice, entry.levels.exitPrice];
    } else {
      unavailable += 1;
    }

    const published = {
      ticker: entry.ticker,
      securityId: entry.securityId,
      asOf: entry.dataCutoff,
      dataCutoff: cutoff,
      close: entry.close,
      technicalRef: { snapshotId: entry.snapshotId, parametersHash: entry.parametersHash },
      levels: entry.levels,
      previous: previous ? { setupState: previous.setupState, asOf: previous.asOf } : null,
      observation: SetupEngine.compact(observation)
    };

    const shard = (entry.ticker + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_");
    if (!shards.has(shard)) shards.set(shard, {});
    shards.get(shard)[entry.ticker] = published;
  }

  /* 4. Write the rebuildable artifact. */
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const head = {
    schemaVersion: SetupEngine.SHARD_SCHEMA,
    engineVersion: SetupEngine.ENGINE_VERSION,
    mappingVersion: mapping.mappingVersion,
    methodologyVersion: methodology.methodologyVersion,
    generatedAt,
    asOf: cutoff,
    approval: mapping.approval,
    publication: {
      lifecycleAllowed: mapping.approval.state === "APPROVED",
      reason: mapping.approval.state === "APPROVED" ? null : "SETUP_MAPPING_NOT_APPROVED",
      explanation: mapping.notASetupRecommendation
    },
    cascade: mapping.cascade.rules.map((rule) => ({
      ruleId: rule.ruleId, order: rule.order, state: rule.state, tier: rule.tier,
      plain: rule.plain, rationale: rule.rationale, screenable: rule.screenable === true,
      filters: rule.filters || [], historyConditions: rule.historyConditions || [],
      always: rule.always === true, predicateHash: SetupEngine.ruleHash(rule)
    }))
  };

  for (const [shard, entries] of shards) {
    writeFileSync(join(OUT_DIR, shard + ".json.gz"),
      gzipSync(Buffer.from(JSON.stringify({ ...head, shard, instruments: entries })), { level: 9 }));
  }

  const summary = {
    ...head,
    universe: instruments.size,
    observed: instruments.size - unavailable,
    unavailable,
    stateCounts: counts,
    ruleCounts: rules,
    pathTier: {
      states: SetupEngine.PATH_STATES,
      open: mapping.approval.state === "APPROVED" &&
        (mapping.pathDependentActivation || {}).state === "ACTIVE" &&
        historyDates.length + 1 >= (mapping.tiers.PATH_DEPENDENT.minimumOrderedObservations || 2),
      reason: mapping.approval.state !== "APPROVED" ? "SETUP_MAPPING_NOT_APPROVED"
        : (mapping.pathDependentActivation || {}).state !== "ACTIVE" ? "PATH_DEPENDENT_STATES_NOT_ACTIVATED"
        : (historyDates.length ? null : "SETUP_OBSERVATION_HISTORY_NOT_MATERIALIZED")
    },
    approval: mapping.approval,
    pathDependentActivation: { state: (mapping.pathDependentActivation || {}).state, gate: "PATH_DEPENDENT_STATES_ACTIVATION" },
    observationHistory: {
      mappingVersion: mapping.mappingVersion,
      dates: historyDates.concat(cutoff),
      minimumRequired: mapping.tiers.PATH_DEPENDENT.minimumOrderedObservations || 2
    },
    inputs: { technical: { artifact: "technical-product-artifact-1.0.0", instruments: instruments.size } },
    shards: [...shards.keys()].sort()
  };
  writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 1) + "\n");

  /* The activation gate for the path-dependent tier, measured against the
     history that exists rather than asserted. It never opens the gate: that
     needs this report AND the owner's switch in the contract. */
  const gate = SetupEngine.activationGate(
    publishedSeries.concat([{ asOf: cutoff, rows: historyRows, contentHashValid: true }]), methodology);
  writeFileSync(join(OUT_DIR, "activation-gate.json"), JSON.stringify(gate, null, 1) + "\n");

  /* 5. Append to the immutable history. */
  mkdirSync(historyDir, { recursive: true });
  const snapshotPath = join(historyDir, cutoff + ".json.gz");
  const snapshot = {
    schemaVersion: SetupEngine.OBSERVATION_SCHEMA,
    engineVersion: SetupEngine.ENGINE_VERSION,
    mappingVersion: mapping.mappingVersion,
    asOf: cutoff,
    /* No generatedAt here on purpose. The hash is over what was observed,
       not over when the run happened - otherwise every re-run would look
       like a changed past and the immutability guard would fire on itself. */
    columns: ["setupState", "invalidationPrice", "exitPrice"],
    rows: historyRows,
    contentHash: null
  };
  snapshot.contentHash = snapshotHash(snapshot);

  if (existsSync(snapshotPath)) {
    const existing = JSON.parse(gunzipSync(readFileSync(snapshotPath)));
    if (existing.contentHash !== snapshotHash(existing)) {
      throw new Error("the published observation " + cutoff + " does not match its own content hash; " +
        "it is corrupt and this run will not overwrite it.");
    }
    if (existing.contentHash !== snapshot.contentHash) {
      throw new Error("a published observation for " + cutoff + " already exists with different content; " +
        "a published past is not rewritten. Publish a new mapping version instead.");
    }
  } else {
    writeFileSync(snapshotPath, gzipSync(Buffer.from(JSON.stringify(snapshot)), { level: 9 }));
  }

  const dates = readdirSync(historyDir).filter((file) => file.endsWith(".json.gz")).map((file) => file.replace(/\.json\.gz$/, "")).sort();
  writeFileSync(join(HISTORY_ROOT, "index.json"), JSON.stringify({
    schemaVersion: SetupEngine.OBSERVATION_INDEX_SCHEMA,
    generatedAt,
    note: "Jede Mapping-Version fuehrt ihre eigene Reihe. Eine veroeffentlichte Beobachtung wird nie ueberschrieben.",
    series: { [mapping.mappingVersion]: dates }
  }, null, 1) + "\n");

  const line = SetupEngine.STATES.map((state) => state + " " + (counts[state] || 0)).join(" · ");
  process.stdout.write(
    "Setup observations " + mapping.mappingVersion + " @ " + cutoff + "\n" +
    "  " + instruments.size + " instruments, " + unavailable + " without complete evidence\n" +
    "  " + line + "\n" +
    "  history: " + dates.join(", ") + " (path tier needs " + summary.observationHistory.minimumRequired + ")\n" +
    "  lifecycle: " + (summary.pathTier.open ? "open" : "closed · " + summary.pathTier.reason) + "\n" +
    "  Aktivierungs-Gate " + gate.contractState + " · gemessen " + gate.measuredReadiness +
    " · offen: " + (gate.blockedBy.join(", ") || "nichts") + "\n"
  );
}

main();
