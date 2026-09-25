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

/**
 * Darf eine veroeffentlichte Beobachtung durch diese ersetzt werden?
 *
 * Genau dann, wenn sie ERWEITERT wird: gleiche Spalten, jede bereits
 * veroeffentlichte Zeile Wert fuer Wert unveraendert, und mindestens ein
 * Titel neu. Alles andere ist ein Umschreiben und bleibt verboten - auch
 * ein Entfernen, denn eine verschwundene Zeile ist eine geaenderte Aussage.
 *
 * Steht als eigene Funktion da, damit die Entscheidung pruefbar ist, ohne
 * die ganze Materialisierung laufen zu lassen.
 */
export function extensionVerdict(existing, snapshot) {
  const gleich = (a, b) => Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((value, i) => value === b[i]);
  const alt = (existing && existing.rows) || {}, neu = (snapshot && snapshot.rows) || {};
  if (!gleich(existing && existing.columns, snapshot && snapshot.columns)) {
    return { allowed: false, reason: "Die Spalten unterscheiden sich.", added: [], changed: [] };
  }
  const changed = [];
  for (const [ticker, zeile] of Object.entries(alt)) {
    if (!gleich(zeile, neu[ticker])) changed.push(ticker);
    if (changed.length >= 5) break;
  }
  if (changed.length) {
    return { allowed: false, reason: "Eine veroeffentlichte Zeile wuerde sich aendern.", added: [], changed };
  }
  const added = Object.keys(neu).filter((ticker) => !(ticker in alt)).sort();
  if (!added.length) {
    return { allowed: false, reason: "Kein Titel kommt hinzu.", added: [], changed: [] };
  }
  return { allowed: true, reason: "ERWEITERUNG", added, changed: [] };
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
  /* The other half of the same question. A per-title observation says where
     one title stands; these two collect what is needed to say which titles
     stand there, and to prove that answer is the cascade's own. */
  const assignments = [];
  const unclassified = [];
  const screenRows = [];

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
      assignments.push({
        ticker: entry.ticker,
        ruleId: observation.matchedRule.ruleId,
        state: recorded,
        /* The rule's own sort field, so a published list arrives in the
           order its screener query would have produced. */
        sort: entry.row.technicalDistanceTo52wHigh
      });
    } else {
      unavailable += 1;
      unclassified.push(entry.ticker);
    }
    screenRows.push({ ticker: entry.ticker, ...entry.row });

    const published = {
      ticker: entry.ticker,
      securityId: entry.securityId,
      asOf: entry.dataCutoff,
      dataCutoff: cutoff,
      close: entry.close,
      technicalRef: { snapshotId: entry.snapshotId, parametersHash: entry.parametersHash },
      levels: entry.levels,
      /* DIE ZEILE, AN DER DER ZUSTAND ENTSCHIEDEN WURDE.
      
         Ohne sie kann die Oberflaeche nur die Regel erklaeren, die
         gegriffen hat. Die naechste Frage eines Lesers - was muesste
         anders sein, damit ein anderer Zustand gilt - braucht dieselbe
         Zeile, gegen die die Kaskade entschieden hat, und keine zweite,
         nachgerechnete. Es sind die zehn technischen Katalogfelder aus
         ROW_SOURCES; keine neue Datenklasse, keine Kennzahl, kein Score. */
      row: entry.row,
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

  /* The screening side of the same rules, and the proof that it is the same
     rules. reconcile() runs each state's screener query through the query
     engine over the very rows the cascade saw; assertParity throws if the
     two answers cannot be reconciled by cascade priority alone. A drifted
     index is not published with a warning - it is not published. */
  const parity = SetupEngine.assertParity(
    SetupEngine.reconcile(screenRows, assignments, methodology, { unclassified }));
  writeFileSync(join(OUT_DIR, "screen-parity.json"), JSON.stringify(parity, null, 1) + "\n");

  const screenIndex = SetupEngine.screenIndex(assignments, methodology, {
    pathTierOpen: summary.pathTier.open,
    pathClosedReason: summary.pathTier.reason
  });
  const screenIndexBytes = gzipSync(Buffer.from(JSON.stringify({
    ...screenIndex, asOf: cutoff, generatedAt, methodologyVersion: methodology.methodologyVersion,
    approval: mapping.approval, universe: instruments.size, unclassified: unclassified.length
  })), { level: 9 });
  /* A screener list is only useful if a phone can actually fetch it. */
  if (screenIndexBytes.length > 128 * 1024) {
    throw new Error("the setup screen index is " + screenIndexBytes.length +
      " compressed bytes, past the 128 KiB browser artifact cap");
  }
  writeFileSync(join(OUT_DIR, "screen-index.json.gz"), screenIndexBytes);

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
      /* EINE ERWEITERUNG IST KEIN UMSCHREIBEN.

         Der Anlass, 25.09.2026: die Kalenderdeckung wurde von 2025-01-01 auf
         2022-01-01 erweitert, weil zwei Pruefungen Titel VOLLSTAENDIG
         verworfen haben, deren 270-Bar-Fenster aus der Deckung herausreichte.
         Damit bekamen 166 Titel erstmals ein Technical-Bundle - und die
         Beobachtung zum selben Stichtag 2026-09-10 hatte ploetzlich mehr
         Zeilen. Der Waechter hat das korrekt als geaenderten Inhalt erkannt
         und den ganzen Lauf abgebrochen.

         Recht hatte er in der Sache, die er schuetzt: eine veroeffentlichte
         Zeile wird nicht umgeschrieben. Genau das passiert hier aber nicht.
         Deshalb die engste moegliche Ausnahme - und keine Zeile weiter:

           JEDE bereits veroeffentlichte Zeile steht unveraendert, Spalte fuer
           Spalte. Neu ist ausschliesslich, dass Titel OHNE Zeile eine
           bekommen.

         Alles andere bleibt der Abbruch, der es vorher war. Und die
         Erweiterung wird nicht still: sie traegt die Herkunft der Fassung,
         die sie erweitert (`lineage`), und zaehlt, was dazukam. Wer die
         Reihe liest, kann die Kette nachrechnen. */
      const verdict = extensionVerdict(existing, snapshot);
      if (!verdict.allowed) {
        throw new Error("a published observation for " + cutoff + " already exists with different content; " +
          "a published past is not rewritten. Publish a new mapping version instead. " + verdict.reason +
          (verdict.changed.length ? " Veraenderte Zeilen: " + verdict.changed.join(", ") + "." : ""));
      }
      snapshot.lineage = [...(existing.lineage || []), existing.contentHash];
      snapshot.extendedTickers = verdict.added.length;
      const dazu = verdict.added;
      snapshot.contentHash = snapshotHash(snapshot);
      writeFileSync(snapshotPath, gzipSync(Buffer.from(JSON.stringify(snapshot)), { level: 9 }));
      process.stdout.write("  Beobachtung " + cutoff + " erweitert: " + dazu.length +
        " Titel neu, keine veroeffentlichte Zeile geaendert (Fassung " +
        snapshot.lineage.length + ")\n");
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

/* Als Programm ausfuehren, aber als Modul importierbar bleiben: der Test der
   Erweiterungsregel soll nicht die ganze Materialisierung starten. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
