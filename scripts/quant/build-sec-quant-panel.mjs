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

   PREISDATEN (seit der Golden-Five-Development-Preview-Freigabe, Phase 5):
   quant/data/market/golden-preview/daily/ enthaelt jetzt echte Tiingo-EOD-
   Kurse fuer genau diese fuenf Titel (Eigentuemerentscheidung, siehe
   quant/config/development-preview.json). Dieses Skript baut daraus ueber
   quant/engines/panel-builder.js — dieselbe Bruecke, die Phase 4A fuer genau
   diesen Zweck gebaut hat — ein Preis-Panel und ruft
   factors.js#priceMetrics() fuer Momentum/Risk sowie factors.js#fundamentalMetrics(periods, price)
   mit echtem Schlusskurs fuer Value auf. Zwei Kennzahlen bleiben trotzdem
   bewusst UNAVAILABLE, nicht weil der Code sie nicht koennte, sondern weil
   sie mit nur fuenf selbstgewaehlten Titeln als Vergleichsbasis scheinpraezise
   waeren: `beta` (braucht einen echten Marktindex, nicht den gleichgewichteten
   Durchschnitt dieser fuenf Titel) und `relativeStrength` (braucht denselben
   Index; wird deshalb hier gar nicht erst berechnet). Fehlt das Preis-Panel
   (Datei nicht vorhanden/leer), bleiben alle preisabhaengigen Kennzahlen wie
   zuvor automatisch null — kein Kurs wird erfunden.

   Ausfuehren:  node scripts/quant/build-sec-quant-panel.mjs
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
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
const PanelBuilder = require(join(engines, "panel-builder.js"));
const SecAdapterModule = require(join(root, "providers", "sec", "adapter.js"));
const SecAdapter = SecAdapterModule.createSecProvider();

const OUT_PATH = join(root, "quant", "data", "sec", "quant-factor-inputs.json");
const GOLDEN_PREVIEW_DIR = join(root, "quant", "data", "market", "golden-preview", "daily");

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

const NO_PRICE_PANEL_REASON =
  "Value braucht Marktdaten (Kurs/Marktkapitalisierung). Keine veroeffentlichte Golden-Five-Kursreihe " +
  "gefunden (quant/data/market/golden-preview/daily/) — vor der ersten Ausfuehrung von " +
  "scripts/market/ingest-tiingo.mjs --publish-preview ist das der Normalzustand, kein Fehler.";
const UNAVAILABLE_REASON = {
  value: NO_PRICE_PANEL_REASON,
  momentum: NO_PRICE_PANEL_REASON.replace("Value braucht", "Momentum braucht"),
  risk: NO_PRICE_PANEL_REASON.replace("Value braucht Marktdaten (Kurs/Marktkapitalisierung)", "Risk (Volatilitaet, Drawdown) braucht eine Kursreihe"),
  revisions: "Analyst Revisions: kein Schema mit lizenzierten PIT-Konsensdaten vorhanden (available: false in " +
             "quant-v1.json, unveraendert seit Phase 1)."
};
const NO_BENCHMARK_REASON = "Braucht einen echten Marktindex als Vergleichsgroesse. Der gleichgewichtete " +
  "Durchschnitt der fuenf Golden-Five-Titel selbst waere keine echte Benchmark, sondern eine " +
  "scheinpraezise Ersatzgroesse - deshalb bleibt diese Kennzahl UNAVAILABLE, nicht angenaehert.";

/* Live-Feedback (Phase 6): JPM zeigte "viele keine Daten" und sah dadurch
   wie eine kaputte Aktie aus, obwohl ein Teil davon fachlich gar keine
   Luecke ist. Vier Kennzahlen sind fuer ein Kreditinstitut STRUKTURELL
   nicht definiert, nicht bloss zufaellig unbelegt - das ist Lehrbuchwissen
   ueber Bankbilanzen, keine neue Bank-Methodik und keine Aenderung an der
   SEC-Ingestion/-Registry (die getrennt und parallel skaliert wird). Bei
   den uebrigen JPM-Luecken (fcfMargin, operatingMargin, balanceSheetQuality)
   gibt es keinen belastbaren Beleg, dass sie strukturell unanwendbar waeren
   - sie bleiben bewusst UNAVAILABLE statt NOT_APPLICABLE, um nicht mehr zu
   behaupten als bekannt ist. Ticker-scoped statt eine allgemeine
   Sektor-Erkennung, damit dies nicht mit der parallelen SEC-Scaling-
   Architektur kollidiert (siehe quant/config/sec-metric-registry.json dort
   fuer die vollstaendige, GAAP-native Regel — dieselbe Unterscheidung,
   andere Ebene). */
const SECTOR_NOT_APPLICABLE = {
  JPM: {
    roic: "Fuer ein Kreditinstitut nicht anwendbar: \"investiertes Kapital\" setzt eine " +
          "Industrieunternehmens-Bilanzstruktur voraus (Sachanlagen plus Working Capital), die eine Bank " +
          "nicht hat.",
    grossProfitability: "Kreditinstitute weisen keine Umsatzkosten (cost of revenue) aus - ohne sie ist kein " +
          "Rohertrag definierbar, nicht nur nicht gemeldet.",
    leverage: "Verschuldungsgrad ueber Netto-Schulden ist fuer eine Bank nicht aussagekraeftig; einschlaegig " +
          "waeren aufsichtsrechtliche Kapitalquoten (z. B. Tier 1), die dieses Modell nicht erhebt.",
    evToEbitda: "EBITDA blendet Zinsaufwand aus - fuer ein Institut, dessen Kerngeschaeft Zinsertrag und " +
          "-aufwand sind, ist diese Kennzahl nicht sinnvoll."
  }
};

function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

/**
 * Baut das Preis-Panel aus quant/data/market/golden-preview/daily/, ueber
 * dieselbe Bruecke (panel-builder.js), die Phase 4A fuer genau diesen Zweck
 * gebaut hat. Gibt null zurueck, wenn (noch) keine Golden-Five-Kursreihen
 * veroeffentlicht sind - dann bleibt jede preisabhaengige Kennzahl wie vor
 * dieser Erweiterung automatisch null.
 */
function buildPricePanel() {
  if (!existsSync(GOLDEN_PREVIEW_DIR)) return null;
  const serieses = [];
  for (const entry of GOLDEN_FIVE) {
    /* Die Golden-Preview-Dateien tragen Tiingos securityId-Konvention
       (ref_<TICKER>, aus quant/config/tiingo-universe.json) - eine andere
       als der SEC-Adapter (sec_<TICKER>). Das Panel selbst wird unter
       entry.securityId (sec_<TICKER>) gefuehrt, damit buildSecurity() beide
       Quellen unter demselben Schluessel nachschlagen kann. */
    const file = join(GOLDEN_PREVIEW_DIR, "ref_" + entry.ticker + ".json");
    if (!existsSync(file)) continue;
    const payload = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(payload.bars) || !payload.bars.length) continue;
    serieses.push({ securityId: entry.securityId, bars: payload.bars, adjustmentStatus: payload.adjustmentStatus });
  }
  if (!serieses.length) return null;
  const result = PanelBuilder.buildPanel(serieses, { metric: "momentum" });
  return result.ok ? result.panel : null;
}

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

function buildSecurity(entry, pricePanel) {
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

  /* pm bleibt null, wenn kein Preis-Panel vorliegt oder dieser Titel darin
     fehlt (z. B. noch nicht veroeffentlicht) - price bleibt dann null wie
     vor dieser Erweiterung, keine Sonderbehandlung noetig. */
  const series = pricePanel && pricePanel.series[entry.securityId];
  const pm = series
    ? Factors.priceMetrics(pricePanel.series[entry.securityId],
        pricePanel.dayIndex[pricePanel.tradingDays[pricePanel.tradingDays.length - 1]],
        pricePanel.benchmark.level, pricePanel.volumeAt, entry.securityId)
    : null;
  /* beta braucht einen echten Marktindex; der gleichgewichtete Durchschnitt
     der fuenf Titel selbst (panel-builder.js's synthetischer Fallback ohne
     benchmarkId) ist keiner - deshalb wird beta hier nicht uebernommen, und
     relativeStrength (dasselbe Problem) gar nicht erst berechnet: das ist
     Teil von computeMetricPanel(), das absichtlich nicht aufgerufen wird. */
  if (pm) delete pm.beta;

  const periods = SecFactPanel.factsToPeriods(facts);
  const fundamentals = Factors.fundamentalMetrics(periods, pm ? pm.price : null);
  if (pm) Object.assign(fundamentals, pm);

  const coverage = {};
  Object.keys(FACTOR_FIELDS).forEach((factorId) => {
    const fields = FACTOR_FIELDS[factorId];
    const components = fields.map((fieldId) => {
      const value = fundamentals[fieldId];
      const noBenchmarkField = (fieldId === "beta" || fieldId === "relativeStrength") && pm;
      const notApplicableReason = SECTOR_NOT_APPLICABLE[entry.ticker] && SECTOR_NOT_APPLICABLE[entry.ticker][fieldId];
      return {
        fieldId,
        real: isNum(value),
        value: isNum(value) ? value : null,
        /* notApplicable unterscheidet "fachlich nicht definiert" (Sektor-
           Eigenschaft, real:false ist hier kein Datenmangel) von einer
           echten Luecke (UNAVAILABLE) - UI-seitig gerendert von
           quant/stock/app.js#factorBlock. Aendert absichtlich NICHT den
           bestehenden REAL/PARTIAL/UNAVAILABLE-Status der Faktorgruppe. */
        notApplicable: !isNum(value) && !!notApplicableReason,
        reason: isNum(value) ? null : notApplicableReason ? notApplicableReason :
          noBenchmarkField ? NO_BENCHMARK_REASON : (UNAVAILABLE_REASON[factorId] ||
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
    marketData: pm ? {
      provider: "tiingo", scope: "development_preview", asOf: pricePanel.tradingDays[pricePanel.tradingDays.length - 1],
      note: "Echter Tiingo-EOD-Schlusskurs, Development Preview (Eigentuemerentscheidung, siehe " +
            "quant/config/development-preview.json). Momentum/Risk direkt aus der Kursreihe; Value nutzt " +
            "denselben Schlusskurs fuer die Marktkapitalisierung."
    } : null,
    fundamentals,
    coverage,
    provenance
  };
}

function main() {
  const pricePanel = buildPricePanel();
  const securities = {};
  GOLDEN_FIVE.forEach((entry) => { securities[entry.ticker] = buildSecurity(entry, pricePanel); });

  const out = {
    schemaVersion: "1.0",
    generatedAtUtc: new Date().toISOString(),
    note: "Praekomputierte SEC- und (wenn veroeffentlicht) Tiingo-basierte Faktor-Rohwerte fuer das Golden " +
          "Universe (Phase 5). Kein VU Quant Score: eine Peer-Perzentilierung ueber fuenf Titel aus vier " +
          "Sektoren waere scheinpraezise, keine echte Kennzahl (normalization.js verlangt eine Mindest-" +
          "Peergroesse von 12). Value/Momentum/Risk nutzen echte Tiingo-EOD-Kurse, wenn " +
          "quant/data/market/golden-preview/daily/ eine Reihe fuer den Titel enthaelt, sonst bleiben sie " +
          "UNAVAILABLE statt einen Kurs zu erfinden. beta/relativeStrength bleiben immer UNAVAILABLE: der " +
          "gleichgewichtete Durchschnitt dieser fuenf Titel ist kein echter Marktindex.",
    methodologyReference: "quant/methodology/quant-v1.json",
    source: "providers/sec/adapter.js + quant/data/market/golden-preview/ -> quant/engines/{sec-fact-panel," +
            "panel-builder}.js -> quant/engines/factors.js",
    pricePanel: pricePanel ? {
      tradingDays: pricePanel.tradingDays.length,
      from: pricePanel.tradingDays[0], to: pricePanel.tradingDays[pricePanel.tradingDays.length - 1],
      adjustmentStatus: pricePanel.adjustmentStatus,
      benchmark: pricePanel.benchmark.synthetic
        ? "synthetic equal-weighted (Golden Five only, kein echter Marktindex)" : pricePanel.benchmark.benchmarkId
    } : null,
    versions: { buildScript: "sec-quant-panel-1.1.0", factPanelBridge: "sec-fact-panel-1.0.0" },
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
