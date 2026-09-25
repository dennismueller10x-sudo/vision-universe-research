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

/**
 * Was mit einer bereits veroeffentlichten Beobachtung dieses Stichtags
 * passiert. Gibt die Abweichung zurueck oder wirft - und schreibt nie.
 *
 * Die Trennlinie: eine andere Methodikversion unter demselben Datum sind
 * zwei Bedeutungen in einer Datei, das bricht ab. Eine andere Zahl bei
 * gleicher Methodik ist eine gewachsene Grundgesamtheit - die
 * veroeffentlichte Zahl bleibt, und die Abweichung wird benannt.
 *
 * Steht als eigene Funktion da, damit die Entscheidung pruefbar ist, ohne
 * die Materialisierung laufen zu lassen.
 */
export function observationVerdict(previous, snapshot, universe) {
  if (!previous || previous.methodologyVersion !== snapshot.methodologyVersion) {
    throw new Error("the published market regime observation for " + snapshot.asOf + " carries methodology " +
      (previous && previous.methodologyVersion) + ", this run is " + snapshot.methodologyVersion +
      "; version the observation instead of mixing two meanings under one date");
  }
  if (previous.contentHash === snapshot.contentHash) return null;
  return {
    asOf: snapshot.asOf, rewritten: false,
    publishedRegime: previous.regime || null,
    publishedUniverse: Number.isFinite(previous.universe) ? previous.universe : null,
    measuredNowOver: Number.isFinite(universe) ? universe : null,
    note: "Die veroeffentlichte Beobachtung dieses Stichtags bleibt unveraendert. Heute wuerde " +
          "derselbe Tag ueber eine andere Grundgesamtheit gemessen - ein Anteil laesst sich nicht " +
          "erweitern, und ein veroeffentlichter Vergangenheitswert wird nicht umgeschrieben."
  };
}

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

  /* DIE VEROEFFENTLICHTE BEOBACHTUNG BLEIBT - UND DAS IST KEIN FEHLER.

     Anlass, 25.09.2026 (Lauf 36118389993): die Kalenderdeckung wurde
     erweitert, 166 Titel bekamen erstmals ein Technical-Bundle, und damit
     wurde dieselbe Breite zum SELBEN Stichtag 2026-09-10 ueber eine groessere
     Grundgesamtheit gemessen. Der Waechter verweigerte das Umschreiben - zu
     Recht - und riss den ganzen Lauf mit.

     Hier gilt ausdruecklich NICHT die Ausnahme, die bei der
     Setup-Beobachtung richtig ist. Dort ist jede Zeile die Aussage EINES
     Titels: kommen Titel hinzu, kommen Aussagen hinzu, und keine vorhandene
     aendert sich. Hier ist die Aussage ein ANTEIL an einer
     Grundgesamtheit - eine groessere Grundgesamtheit aendert die Zahl selbst.
     Einen Prozentsatz kann man nicht erweitern.

     Also bleibt die veroeffentlichte Beobachtung, wie sie veroeffentlicht
     wurde, die heutige Messung steht im aktuellen Artefakt, und die
     Abweichung wird benannt statt verschwiegen. Was weiterhin abbricht: eine
     Datei zu diesem Stichtag, die eine ANDERE Methodikversion traegt - das
     ist ein Versionierungsfehler und keine gewachsene Deckung. */
  let publishedObservation = null;
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
      publishedObservation = observationVerdict(JSON.parse(readFileSync(path, "utf8")), snapshot, universe);
    } else {
      writeFileSync(path, JSON.stringify(snapshot, null, 1) + "\n");
      publishedObservation = { asOf: cutoff, rewritten: false, written: true, measuredNowOver: universe };
    }
  }
  payload.publishedObservation = publishedObservation;
  writeFileSync(OUT, JSON.stringify(payload, null, 1) + "\n");
  if (publishedObservation && publishedObservation.publishedUniverse !== undefined &&
      publishedObservation.publishedUniverse !== null) {
    process.stdout.write("  Beobachtung " + cutoff + " bleibt wie veroeffentlicht: damals " +
      publishedObservation.publishedUniverse + " Titel (" + publishedObservation.publishedRegime +
      "), heute waeren es " + publishedObservation.measuredNowOver + "\n");
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

/* Als Programm ausfuehren, aber als Modul importierbar bleiben: der Test der
   Beobachtungsregel soll nicht die ganze Materialisierung starten. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
