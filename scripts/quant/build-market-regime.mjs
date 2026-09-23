#!/usr/bin/env node
/* =========================================================================
   Materialize the Market Regime state.

   Reads only an artifact that already exists:
     quant/data/product/technical-signals-v1/<shard>.json.gz

   Writes quant/data/product/market-regime-v1.json and appends one immutable
   observation per cutoff to quant/data/product/market-regime-history/.

   No bar is recomputed here. The six measures are counted over values the
   technical engines already published, and the engine only classifies the
   resulting shares. The history is what the second tier needs: transitions
   and persistence may only ever be read from observations that were
   actually published on an earlier date.
   ========================================================================= */
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MarketRegime = require(join(ROOT, "quant/engines/market-regime.js"));

const TECHNICAL_DIR = join(ROOT, "quant/data/product/technical-signals-v1");
const OUT = join(ROOT, "quant/data/product/market-regime-v1.json");
/* Sibling, not child: a published observation must not be something a
   rebuild of the current state can erase. */
const HISTORY_DIR = join(ROOT, "quant/data/product/market-regime-history");
const methodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/market-regime-v1.json"), "utf8"));

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/* One counter per measure. `observed` counts titles where the input could be
   read at all, `hits` those that satisfy it - kept apart so a thin input
   reports as unmeasured rather than as a zero share. */
const MEASURES = {
  above200: (b) => (finite(b.lastBar?.close) && finite(b.featuresAtCutoff?.sma200)
    ? b.lastBar.close > b.featuresAtCutoff.sma200 : null),
  above50: (b) => (finite(b.lastBar?.close) && finite(b.featuresAtCutoff?.sma50)
    ? b.lastBar.close > b.featuresAtCutoff.sma50 : null),
  trendBullish: (b) => (b.trend?.direction ? b.trend.direction === "BULLISH" : null),
  trendBearish: (b) => (b.trend?.direction ? b.trend.direction === "BEARISH" : null),
  near52wHigh: (b) => (finite(b.featuresAtCutoff?.distanceTo52wHigh)
    ? b.featuresAtCutoff.distanceTo52wHigh >= -0.10 : null),
  volatilityHigh: (b) => (b.volatility?.regime ? b.volatility.regime === "HIGH" : null)
};

function main() {
  const counts = {};
  for (const id of Object.keys(MEASURES)) counts[id] = { hits: 0, observed: 0 };
  let universe = 0;
  let cutoff = null;

  for (const file of readdirSync(TECHNICAL_DIR).filter((f) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(f))) {
    const shard = JSON.parse(gunzipSync(readFileSync(join(TECHNICAL_DIR, file))).toString("utf8"));
    for (const key of Object.keys(shard.instruments || {})) {
      const bundle = shard.instruments[key].bundle;
      if (!bundle) continue;
      universe += 1;
      if (bundle.dataCutoff && (!cutoff || bundle.dataCutoff > cutoff)) cutoff = bundle.dataCutoff;
      for (const [id, read] of Object.entries(MEASURES)) {
        const value = read(bundle);
        if (value === null) continue;
        counts[id].observed += 1;
        if (value) counts[id].hits += 1;
      }
    }
  }

  const historyDates = existsSync(HISTORY_DIR)
    ? readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort()
    : [];

  const result = MarketRegime.assertPublishable(MarketRegime.evaluate({
    methodology, universe, counts, historyDepth: historyDates.length
  }));

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const payload = {
    ...result,
    schemaVersion: methodology.schemaVersion,
    generatedAt,
    asOf: cutoff,
    scope: methodology.scope,
    thresholdPolicy: methodology.thresholdPolicy,
    gateStatus: methodology.gateStatus,
    pathDependentActivation: {
      state: methodology.pathDependentActivation.state,
      states: methodology.pathDependentActivation.states,
      checks: methodology.pathDependentActivation.checks,
      observations: historyDates.length,
      minimumRequired: methodology.tiers.PATH_DEPENDENT.minimumOrderedObservations
    }
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 1) + "\n");

  /* The immutable observation. Its hash deliberately excludes generatedAt:
     a re-run must not look like a changed past. */
  if (cutoff) {
    mkdirSync(HISTORY_DIR, { recursive: true });
    const snapshot = {
      schemaVersion: "market-regime-observation-1.0.0",
      methodologyVersion: methodology.methodologyVersion,
      asOf: cutoff,
      regime: result.regime,
      universe,
      shares: (result.measures || []).map((m) => ({ id: m.id, share: m.share, observed: m.observed }))
    };
    snapshot.contentHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 16);
    const path = join(HISTORY_DIR, cutoff + ".json");
    if (existsSync(path)) {
      const previous = JSON.parse(readFileSync(path, "utf8"));
      if (previous.contentHash !== snapshot.contentHash) {
        throw new Error("a published market regime observation for " + cutoff + " would change; refusing to rewrite it");
      }
    } else {
      writeFileSync(path, JSON.stringify(snapshot, null, 1) + "\n");
    }
  }

  process.stdout.write("Market Regime " + methodology.methodologyVersion + " @ " + cutoff + "\n");
  if (result.state !== "AVAILABLE") {
    process.stdout.write("  UNAVAILABLE · " + result.reason + " " + (result.fields || []).join(",") + "\n");
    return;
  }
  process.stdout.write("  " + result.regime + " · " + result.matchedRule.plain + "\n");
  for (const m of result.measures) {
    process.stdout.write("  " + (m.share * 100).toFixed(1).padStart(6) + " %  " + m.id.padEnd(16) +
      m.hits + "/" + m.observed + "\n");
  }
  process.stdout.write("  Übergänge: " + result.transitions.state + " · " + (result.transitions.reason || "-") +
    " · Beobachtungen " + historyDates.length + "\n");
}

main();
