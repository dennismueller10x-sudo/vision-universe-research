/* =========================================================================
   VISION UNIVERSE QUANT — build-sec-quant-panel.mjs

   Schliesst die Luecke aus VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md §20:
   SEC liefert seit Phase 4 echte, PIT-korrekte Fundamentaldaten fuer
   AAPL/MSFT/NVDA/JPM/XOM (providers/sec/adapter.js), aber factors.js/
   quant-score.js lesen davon nichts — die Daten lagen bislang nur im
   internen SEC Data Inspector.

   Dieses Skript verdrahtet GENAU diese eine Verbindung, ohne die Mock-
   Universum-Pipeline (build-quant-data.mjs) anzufassen oder zu duplizieren:

     providers/sec/adapter.js#getFactPanel   (bereits PIT-/Revisions-aufgeloest)
       -> quant/engines/sec-fact-panel.js#factsToPeriods   (reine Umformung)
       -> quant/engines/factors.js#fundamentalMetrics      (dieselbe Funktion
          wie fuer das synthetische Modelluniversum — kein Duplikat)
       -> quant/data/sec/quant-factor-inputs.json          (praekomputiert,
          wie jedes andere Frontend-Artefakt in diesem Repository)

   BEWUSST NICHT GEBAUT: keine Cross-Sectional-Peer-Normalisierung und kein
   VU Quant Score fuer diese fuenf Titel. Ein Perzentilrang braucht eine
   Vergleichsgruppe von brauchbarer Groesse (normalization.js: min. 12 Peers);
   fuenf Titel aus vier verschiedenen Sektoren waeren eine scheinpraezise
   Kennzahl, keine echte. Was hier entsteht, sind Faktor-KOMPONENTEN als
   Rohwerte mit Provenance — kein Score.

   price = null bei jedem Aufruf von fundamentalMetrics(): Value, Momentum
   und Risk sind zu 100% marktdatenbasiert, und fuer diese fuenf Titel liegen
   auf research.visionuniverse.de aus Lizenzgruenden keine echten Kurse vor
   (siehe docs/PROTECTED_PREVIEW_REAL_DATA_AUDIT_2026-09-08.md,
   docs/PROTECTED_HOSTING_MIGRATION_DATA_HYGIENE_PHASE0_2026-09-08.md). Ein
   Kurs hier zu erfinden waere exakt der stille Mock-Fallback, den dieses
   Projekt an anderer Stelle verbietet — deshalb bleibt price bewusst null,
   und jede preisabhaengige Kennzahl wird dadurch automatisch UNAVAILABLE,
   ohne Sonderfallcode.

   Ausfuehren:  node scripts/quant/build-sec-quant-panel.mjs
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const engines = join(root, "quant", "engines");

const Schema = require(join(engines, "schema.js"));
const Factors = require(join(engines, "factors.js"));
const SecFactPanel = require(join(engines, "sec-fact-panel.js"));
const SecAdapterModule = require(join(root, "providers", "sec", "adapter.js"));
const SecAdapter = SecAdapterModule.createSecProvider();

const OUT_PATH = join(root, "quant", "data", "sec", "quant-factor-inputs.json");

/* Golden Universe (Phase 5). Die securityId-Konvention (sec_<TICKER>) ist
   die des SEC-Adapters selbst (providers/sec/adapter.js), nicht neu erfunden. */
const GOLDEN_FIVE = [
  { ticker: "AAPL", securityId: "sec_AAPL" },
  { ticker: "MSFT", securityId: "sec_MSFT" },
  { ticker: "NVDA", securityId: "sec_NVDA" },
  { ticker: "JPM", securityId: "sec_JPM" },
  { ticker: "XOM", securityId: "sec_XOM" }
];

const FACTOR_FIELDS = {
  quality: ["roic", "grossProfitability", "fcfMargin", "operatingMargin", "balanceSheetQuality", "leverage"],
  growth: ["revenueGrowth", "epsGrowth", "fcfGrowth", "marginExpansion"],
  value: ["earningsYield", "fcfYield", "evToEbitda", "evToSales", "priceToFcf", "dividendYield"],
  momentum: ["momentum12m1m", "momentum6m", "momentum3m", "relativeStrength", "distanceTo52wHigh", "priceTo50dma", "priceTo200dma"],
  risk: ["volatility", "downsideVolatility", "maxDrawdown", "beta"],
  revisions: []
};

const UNAVAILABLE_REASON = {
  value: "Value braucht Marktdaten (Kurs/Marktkapitalisierung). Fuer diese fuenf Titel liegen auf " +
         "research.visionuniverse.de aus Lizenzgruenden keine echten Kurse vor (Twelve-Data-/Tiingo-" +
         "Rohkursreihen sind Stand der Data-Hygiene-Phase nicht oeffentlich ausgeliefert).",
  momentum: "Momentum braucht eine Kursreihe. Aus demselben Lizenzgrund wie Value derzeit nicht verfuegbar.",
  risk: "Risk (Volatilitaet, Drawdown, Beta) braucht eine Kursreihe. Aus demselben Lizenzgrund derzeit nicht verfuegbar.",
  revisions: "Analyst Revisions: kein Schema mit lizenzierten PIT-Konsensdaten vorhanden (available: false in " +
             "quant-v1.json, unveraendert seit Phase 1)."
};

function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

function readReferenceMetadata(entry) {
  /* Reine Anzeige-Metadaten (Firmenname, Sektor) aus derselben, bereits
     oeffentlichen kanonischen Datei, die der Adapter selbst laedt — kein
     zweiter Zugriffspfad, keine ReferenceDataProvider-Behauptung des
     Adapters (der erfuellt bewusst ausschliesslich FundamentalDataProvider). */
  try {
    const bundle = JSON.parse(
      readFileSync(join(SecAdapterModule.CANONICAL_DIR, entry.ticker + ".json"), "utf8"));
    return {
      name: bundle.security.name,
      sector: bundle.security.sector,
      industry: bundle.security.industry,
      factsCount: (bundle.facts || []).length,
      filingsCount: (bundle.filings || []).length,
      unsupportedMetrics: bundle.unsupportedMetrics || []
    };
  } catch (err) {
    return { name: entry.ticker, sector: null, industry: null, factsCount: 0, filingsCount: 0, unsupportedMetrics: [] };
  }
}

function buildSecurity(entry) {
  const reference = readReferenceMetadata(entry);
  const factPanel = SecAdapter.getFactPanel([entry.securityId]);
  if (!factPanel.available) {
    return {
      ticker: entry.ticker, securityId: entry.securityId, reference,
      available: false, reason: factPanel.reason, fundamentals: null, coverage: null
    };
  }
  const facts = factPanel.data.rows[entry.securityId] || [];
  if (!facts.length) {
    return {
      ticker: entry.ticker, securityId: entry.securityId, reference,
      available: false, reason: "Keine SEC-Fakten fuer " + entry.securityId + " ingestiert.",
      fundamentals: null, coverage: null
    };
  }

  const periods = SecFactPanel.factsToPeriods(facts);
  const fundamentals = Factors.fundamentalMetrics(periods, null); // price=null: siehe Kopf-Kommentar

  const coverage = {};
  Object.keys(FACTOR_FIELDS).forEach((factorId) => {
    const fields = FACTOR_FIELDS[factorId];
    const components = fields.map((fieldId) => {
      const value = fundamentals[fieldId];
      return {
        fieldId,
        real: isNum(value),
        value: isNum(value) ? value : null,
        reason: isNum(value) ? null : (UNAVAILABLE_REASON[factorId] ||
          "Kennzahl aus SEC-Fundamentaldaten nicht ableitbar (siehe unsupportedMetrics/coverage im " +
          "kanonischen Bestand dieses Unternehmens).")
      };
    });
    const realCount = components.filter((c) => c.real).length;
    coverage[factorId] = {
      components,
      realCount,
      totalCount: components.length,
      status: components.length === 0 ? "UNAVAILABLE"
        : realCount === 0 ? "UNAVAILABLE"
        : realCount === components.length ? "REAL"
        : "PARTIAL"
    };
  });

  const provenance = Schema.makeProvenance({
    provider: SecAdapter.PROVIDER_ID,
    source: "sec_edgar_companyfacts_xbrl",
    asOf: fundamentals._asOfPeriodEnd,
    availableAt: fundamentals._asOfAvailableAt,
    ingestedAt: factPanel.provenance ? factPanel.provenance.ingestedAt : new Date().toISOString(),
    methodologyVersion: factPanel.provenance ? factPanel.provenance.methodologyVersion : "sec-unversioned",
    dataSnapshotId: "sec-quant-inputs-" + entry.ticker,
    isMock: false
  });

  return {
    ticker: entry.ticker,
    securityId: entry.securityId,
    reference,
    available: true,
    reason: null,
    asOfPeriodEnd: fundamentals._asOfPeriodEnd,
    restatementStatus: fundamentals._restatementStatus,
    fundamentals,
    coverage,
    provenance
  };
}

function main() {
  const securities = {};
  GOLDEN_FIVE.forEach((entry) => { securities[entry.ticker] = buildSecurity(entry); });

  const out = {
    schemaVersion: "1.0",
    generatedAtUtc: new Date().toISOString(),
    note: "Praekomputierte SEC-basierte Faktor-Rohwerte fuer das Golden Universe (Phase 5). Kein VU Quant " +
          "Score: eine Peer-Perzentilierung ueber fuenf Titel aus vier Sektoren waere scheinpraezise, keine " +
          "echte Kennzahl (normalization.js verlangt eine Mindest-Peergroesse von 12). Value/Momentum/Risk " +
          "sind ausschliesslich marktdatenbasiert und bleiben UNAVAILABLE, solange auf research.visionuniverse.de " +
          "keine lizenzierten Kurse ausgeliefert werden.",
    methodologyReference: "quant/methodology/quant-v1.json",
    source: "providers/sec/adapter.js -> quant/engines/sec-fact-panel.js -> quant/engines/factors.js",
    versions: { buildScript: "sec-quant-panel-1.0.0", factPanelBridge: "sec-fact-panel-1.0.0" },
    securities
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log("Geschrieben: " + OUT_PATH);
  GOLDEN_FIVE.forEach((entry) => {
    const s = securities[entry.ticker];
    console.log(" " + entry.ticker + ": " + (s.available ? "verfuegbar" : "UNAVAILABLE (" + s.reason + ")"));
  });
}

main();
