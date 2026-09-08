/* =========================================================================
   VISION UNIVERSE — SEC EDGAR ADAPTER (Phase 4)

   Der einzige Ort im JavaScript-Teil des Systems, an dem SEC-spezifische
   Begriffe (CIK, Accession Number, XBRL-Concept, Company Facts) vorkommen
   duerfen. Nach aussen liefert dieser Adapter ausschliesslich kanonische
   Objekte aus quant/engines/schema.js.

       SEC -> scripts/quant/sec/** -> quant/data/sec/canonical/*.json
           -> DIESER ADAPTER -> FundamentalDataProvider -> Domain Engines

   Der schwere Teil - Abruf, XBRL-Normalisierung, Fiskalkalender,
   Year-to-date-Rekonstruktion, Revisionsreihen - liegt in der
   Python-Ingestion unter scripts/quant/sec/. Dieser Adapter fuehrt keine
   eigene Berechnung durch und bringt insbesondere KEINE eigene
   Point-in-Time-Semantik mit: die Regel availableAt <= decisionTime ist und
   bleibt die aus quant/engines/schema.js.

   WO DIESER ADAPTER LAEUFT: serverseitig (GitHub Action oder lokal), wie der
   Twelve-Data-Adapter. Die SEC verlangt einen sich ausweisenden User-Agent
   mit Kontaktadresse; ein Browser darf diesen Header nicht setzen. Der
   Adapter liest ausschliesslich bereits erzeugte, statische Artefakte und
   oeffnet selbst nie eine Netzwerkverbindung.
   ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ENGINES = path.join(ROOT, "quant", "engines");
const Capabilities = require(path.join(ENGINES, "capabilities.js"));
const Provider = require(path.join(ENGINES, "provider.js"));
const Schema = require(path.join(ENGINES, "schema.js"));

const PROVIDER_ID = "sec-edgar";
const DATA_SOURCE_ID = "ds_sec_edgar_v1";
const CANONICAL_DIR = path.join(ROOT, "quant", "data", "sec", "canonical");
const PROFILE_PATH = path.join(ROOT, "quant", "config", "provider-profiles.json");

/**
 * Faehigkeiten aus quant/config/provider-profiles.json.
 *
 * Bewusst KEINE zweite Faehigkeitsmatrix: die Deklaration steht genau einmal
 * im gemeinsamen Profil, und die Python-Ingestion liest dieselbe Datei. Die
 * Dreiwertigkeit ueberlebt dabei vollstaendig — ein `null` im Profil
 * ("nicht geprueft") wird hier nicht zu `false`.
 */
function declaredCapabilities(profilePath) {
  let findings = {};
  try {
    const raw = JSON.parse(fs.readFileSync(profilePath || PROFILE_PATH, "utf8"));
    findings = ((raw.providers || {})[PROVIDER_ID] || {}).findings || {};
  } catch (err) {
    /* Ein unlesbares Profil heisst "nichts geprueft", nicht "nichts vorhanden". */
    findings = {};
  }
  const v = (name) => {
    const entry = findings[name];
    if (!entry) return null;
    return entry.value === true ? true : (entry.value === false ? false : null);
  };

  return Capabilities.declare(PROVIDER_ID, {
    plan: "public",
    declaredAt: "2026-09-07",
    fundamental: {
      annual: v("annualPeriods"),
      quarterly: v("quarterlyPeriods"),
      asReported: v("originalHistoricalValues"),
      /* Die Ingestion bildet SEC-Concepts auf das kanonische Modell ab; das
         ist genau die Standardisierung, die dieses Merkmal meint. */
      standardized: true,
      pointInTime: v("pointInTimeFundamentals"),
      restatements: v("restatementSemantics"),
      filingDates: v("filingTimestamps"),
      delistedSecurities: v("delistedSecurities"),
      historicalUniverse: v("survivorshipBiasControls")
    },
    /* Die SEC veroeffentlicht ueberhaupt keine Kurse. Alles, was einen Kurs
       voraussetzt, ist hier ausdruecklich false — nicht ungeprueft. Was
       inhaltlich gar nicht zutrifft (Symbolsuche, Boersenstatus, Bulk-Quotes),
       bleibt null statt als Ausschluss behauptet zu werden. */
    market: {
      realtime: v("marketDataOhlcv"),
      delayed: v("marketDataOhlcv"),
      daily: v("marketDataOhlcv"),
      intraday: v("marketDataOhlcv"),
      websocket: v("marketDataOhlcv"),
      historicalDaily: v("marketDataOhlcv"),
      historicalIntraday: v("marketDataOhlcv"),
      adjustedPrices: v("marketDataOhlcv"),
      splitAdjustedPrices: v("marketDataOhlcv"),
      splits: v("splits"),
      dividends: v("corporateActions")
    },
    reference: {
      securityMaster: v("survivorshipBiasControls"),
      delisted: v("delistedSecurities"),
      historicalMembership: v("survivorshipBiasControls"),
      isin: false,
      figi: false
    },
    estimate: {
      consensus: v("analystEstimates"),
      historicalConsensus: v("analystEstimates"),
      pointInTime: v("analystEstimates"),
      revisionHistory: v("analystEstimates")
    },
    notes: {
      scope: "US-Registranten mit XBRL-Pflicht. Fundamentaldaten, Filings, " +
             "Filing-Metadaten, Revisionshistorie.",
      marketData: "Die SEC veroeffentlicht keine Kurse. Value und Momentum " +
                  "entstehen nie aus dieser Quelle.",
      universe: "Kein Security Master, kein Delisting-Ereignisstrom. Ein " +
                "historisches Universum laesst sich hieraus nicht bilden — " +
                "siehe docs/SEC_COVERAGE_REPORT.md."
    },
    limits: { requestsPerSecond: 5 }
  });
}

/** Standard-Loader: liest die vom Python-Ingest erzeugten Artefakte. */
function fileLoader(directory) {
  const dir = directory || CANONICAL_DIR;
  return function loadAll() {
    let names;
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
    } catch (err) {
      return [];              /* noch nicht ingestiert — kein Fehler, nur leer */
    }
    return names.map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
  };
}

/**
 * Der zum Stichtag zuletzt bekannte Stand je (Kennzahl, Periode).
 *
 * Dieselbe Auswahlregel wie Schema.latestKnownSeries, nur ueber alle
 * Kennzahlen auf einmal: availableAt <= decisionDate, danach gewinnt das
 * spaetere availableAt, bei Gleichstand die hoehere revisionId.
 */
function resolveAsOf(facts, asOf, filter) {
  const best = Object.create(null);
  for (const fact of facts) {
    if (filter && filter.metricId && fact.metricId !== filter.metricId) continue;
    if (filter && filter.periodEnd && fact.periodEnd !== filter.periodEnd) continue;
    if (filter && filter.fiscalPeriod && fact.fiscalPeriod !== filter.fiscalPeriod) continue;
    if (asOf && fact.availableAt > asOf) continue;      /* Look-Ahead-Sperre */
    const key = fact.metricId + "|" + fact.periodEnd;
    const current = best[key];
    if (!current ||
        fact.availableAt > current.availableAt ||
        (fact.availableAt === current.availableAt && fact.revisionId > current.revisionId)) {
      best[key] = fact;
    }
  }
  return Object.keys(best)
    .sort()
    .map((k) => best[k])
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : a.periodEnd > b.periodEnd ? -1 : 0));
}

function createSecProvider(options) {
  const opts = options || {};
  const loadAll = opts.loadAll || fileLoader(opts.directory);
  const capabilities = opts.capabilities || declaredCapabilities(opts.profilePath);

  let cache = null;
  function bundles() {
    if (cache === null) cache = loadAll() || [];
    return cache;
  }
  function bundleFor(securityId) {
    return bundles().find((b) => b.security && b.security.securityId === securityId) || null;
  }

  function provenance(asOf, bundle) {
    return Schema.makeProvenance({
      provider: PROVIDER_ID,
      source: "sec_edgar_companyfacts_xbrl",
      asOf: asOf || (bundle && String(bundle.generatedAtUtc || "").slice(0, 10)) || null,
      ingestedAt: (bundle && bundle.generatedAtUtc) || new Date().toISOString(),
      methodologyVersion: bundle && bundle.versions
        ? "sec-" + bundle.versions.normalization_logic : "sec-unversioned",
      dataSnapshotId: "sec-" + (bundle ? bundle.security.securityId : "none"),
      isMock: false
    });
  }

  const api = {
    PROVIDER_ID,
    DATA_SOURCE_ID,
    capabilities,

    /* ------------------------------------------- FundamentalDataProvider */

    getFacts(securityId, options) {
      const o = options || {};
      const bundle = bundleFor(securityId);
      if (!bundle) {
        return Provider.unavailable(
          "Keine SEC-Fundamentaldaten fuer " + securityId + " ingestiert.", null);
      }
      const rows = resolveAsOf(bundle.facts, o.asOf, o);
      if (!rows.length) {
        return Provider.unavailable(
          "Zum Stichtag " + (o.asOf || "(ohne)") + " war fuer " + securityId +
          " noch keine Kennzahl veroeffentlicht.", provenance(o.asOf, bundle));
      }
      return Provider.ok(rows, provenance(o.asOf, bundle));
    },

    /** Von quant/engines/gate-tests.js erwarteter Name. Gleiche Regel. */
    getFactsAsOf(securityId, options) {
      return Promise.resolve(api.getFacts(securityId, options));
    },

    getFilings(securityId, options) {
      const o = options || {};
      const bundle = bundleFor(securityId);
      if (!bundle) {
        return Provider.unavailable("Keine SEC-Filings fuer " + securityId + ".", null);
      }
      let rows = bundle.filings || [];
      if (o.asOf) rows = rows.filter((f) => f.filedAt <= o.asOf);
      if (o.formType) rows = rows.filter((f) => f.formType === o.formType);
      return Provider.ok(rows, provenance(o.asOf, bundle));
    },

    getFactPanel(securityIds, options) {
      const o = options || {};
      const ids = securityIds && securityIds.length
        ? securityIds
        : bundles().map((b) => b.security.securityId);
      const panel = {};
      const missing = [];
      for (const id of ids) {
        const bundle = bundleFor(id);
        if (!bundle) { missing.push(id); continue; }
        panel[id] = resolveAsOf(bundle.facts, o.asOf, o);
      }
      if (!Object.keys(panel).length) {
        return Provider.unavailable(
          "Keine der angefragten Securities ist ingestiert.", null);
      }
      return Provider.ok({ rows: panel, missing }, provenance(o.asOf, bundles()[0]));
    },

    /* --------------------------------------------------- Universum (Gate B) */

    /**
     * Historisches Universum zum Stichtag — kann die SEC nicht liefern.
     *
     * Das ist kein Implementierungsrueckstand, sondern eine Eigenschaft der
     * Quelle: company_tickers.json listet ausschliesslich Registranten mit
     * aktuell zugeteiltem Ticker, und es gibt keinen Delisting-Ereignisstrom.
     * Ein hier zurueckgegebenes "heutiges Universum" waere genau die stille
     * Behauptung, die Gate B aufdecken soll. Also: unavailable, und Gate B
     * faellt zu Recht durch.
     */
    getUniverseAsOf(options) {
      const o = options || {};
      return Promise.resolve(Provider.unavailable(
        "SEC/EDGAR fuehrt keinen Security Master und keine Listing-Historie; " +
        "ein Universum zum Stichtag " + (o.asOf || "(ohne)") + " laesst sich " +
        "daraus nicht rekonstruieren (docs/SEC_COVERAGE_REPORT.md).", null));
    },

    getUniverse(options) { return api.getUniverseAsOf(options); },

    /* ---------------------------------------------------------- Gesundheit */

    healthCheck() {
      const count = bundles().length;
      if (!count) {
        return Provider.makeHealth("not_configured", {
          provider: PROVIDER_ID,
          message: "Noch keine SEC-Daten ingestiert. Workflow 'Update SEC " +
                   "fundamentals' erzeugt quant/data/sec/canonical/.",
          capabilities: ["fundamental"]
        });
      }
      return Provider.makeHealth("ok", {
        provider: PROVIDER_ID,
        message: count + " Unternehmen aus SEC/EDGAR verfuegbar.",
        capabilities: ["fundamental"]
      });
    },

    /** Nur fuer Tests und Skripte: erzwingt einen Neuladen der Artefakte. */
    reload() { cache = null; return api; }
  };

  return api;
}

module.exports = {
  PROVIDER_ID,
  DATA_SOURCE_ID,
  CANONICAL_DIR,
  declaredCapabilities,
  fileLoader,
  resolveAsOf,
  createSecProvider
};
