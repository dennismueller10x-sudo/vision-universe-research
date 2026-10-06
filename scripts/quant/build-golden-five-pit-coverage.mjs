/* =========================================================================
   VISION UNIVERSE QUANT — build-golden-five-pit-coverage.mjs   (Phase 6)

   Live-Feedback: "Für Backtesting werden historische Point-in-Time-
   Fundamentaldaten benötigt" und "erzeuge für jeden Golden-Ticker einen
   Coverage-Report" - dieses Skript baut GENAU das, ohne eine neue SEC-
   Pipeline zu bauen und ohne die parallele SEC-Scaling-Architektur
   anzufassen.

   Die volle, PIT-aufgeloeste Historie existiert bereits:
     quant/data/sec/canonical/{TICKER}.json   (Python-Ingestion, separat
                                                skaliert - hier nur gelesen)
       -> providers/sec/adapter.js#getFacts    (bestehende PIT-Regel,
                                                 availableAt <= decisionDate,
                                                 quant/engines/schema.js)
       -> DIESES SKRIPT                        (reine Serialisierung + eine
                                                 Gegenprobe, keine neue
                                                 Berechnung)

   Was bisher fehlte, war nicht die Historie selbst (die liegt laengst vor,
   73-98 Perioden je Titel zurueck bis 2007/2008 - siehe docs/
   SEC_COVERAGE_REPORT.md), sondern ein committeter, produktseitig
   nutzbarer Bericht darueber UND die aktive Bestaetigung, dass
   availableAt <= decisionTime fuer jeden einzelnen Fakt dieser fuenf Titel
   gilt (nicht nur behauptet).

   Ausfuehren:  node scripts/quant/build-golden-five-pit-coverage.mjs
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const SecAdapterModule = require(join(root, "providers", "sec", "adapter.js"));
const SecAdapter = SecAdapterModule.createSecProvider();

const GOLDEN_FIVE = [
  { ticker: "AAPL", securityId: "sec_AAPL" },
  { ticker: "MSFT", securityId: "sec_MSFT" },
  { ticker: "NVDA", securityId: "sec_NVDA" },
  { ticker: "JPM", securityId: "sec_JPM" },
  { ticker: "XOM", securityId: "sec_XOM" }
];

/* Bewusst NICHT unter quant/data/sec/ - die parallele SEC-Scaling-Pipeline
   (scripts/quant/sec/, Python) scannt genau diesen Baum wortwoertlich
   (scripts/quant/tests/test_workflows.py#GeneratedArtifactTests/
   DataBudgetTests: jede *.json dort muss ihr eigenes versions-Schema
   tragen und zaehlt gegen deren Speicherbudget) - ausdruecklich NICHT,
   um "aus fremden Phasen hereinzuwirken" (siehe Kommentar dort). Ein
   eigenes Geschwisterverzeichnis vermeidet die Kollision vollstaendig,
   ohne deren Pipeline/Tests anzufassen. */
const OUT_DIR = join(root, "quant", "data", "golden-five-pit-coverage");
mkdirSync(OUT_DIR, { recursive: true });

/* Die Gegenprobe zur PIT-Regel. Keine neue Regel - dieselbe wie
   quant/engines/schema.js#latestKnownFact ("availableAt <= decisionDate"),
   hier nur ueber jeden einzelnen gelieferten Fakt gefahren statt nur ueber
   die aufgeloeste Auswahl. decisionTime ist "jetzt": ein Fakt, der aus der
   Zukunft zu kommen scheint, waere ein Ingestion-Fehler, kein Normalfall. */
const decisionTime = new Date().toISOString();

const problems = [];
const summary = { generatedAtUtc: decisionTime, decisionTime, tickers: [], note:
  "Point-in-Time-Coverage je Golden-Five-Titel, gelesen ueber providers/sec/adapter.js#getFacts " +
  "(keine neue SEC-Pipeline, keine neue PIT-Regel - dieselbe wie quant/engines/schema.js). " +
  "availableAt <= decisionTime wurde fuer jeden einzelnen Fakt unten aktiv geprueft, nicht nur behauptet." };

for (const entry of GOLDEN_FIVE) {
  const res = SecAdapter.getFacts(entry.securityId, {});
  if (!res.available) {
    summary.tickers.push({ ticker: entry.ticker, available: false, reason: res.reason, message: res.message });
    problems.push(entry.ticker + ": " + (res.message || res.reason));
    continue;
  }

  const facts = res.data;
  let futureLeaks = 0;
  const byMetric = {};
  const rows = facts.map((f) => {
    if (f.availableAt > decisionTime) futureLeaks++;
    byMetric[f.metricId] = (byMetric[f.metricId] || 0) + 1;
    return {
      metric: f.metricId,
      periodEnd: f.periodEnd,
      fiscalYear: f.fiscalYear,
      fiscalPeriod: f.fiscalPeriod,
      availableAt: f.availableAt,
      value: f.value,
      revision: f.revisionId,
      restatementStatus: f.restatementStatus,
      sourceFiling: f.sourceFilingId
    };
  });
  rows.sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : a.periodEnd > b.periodEnd ? -1 : a.metric < b.metric ? -1 : 1));

  if (futureLeaks > 0) problems.push(entry.ticker + ": " + futureLeaks + " Fakt(en) mit availableAt > decisionTime (FUTURE DATA LEAK)");

  const periodEnds = [...new Set(rows.map((r) => r.periodEnd))].sort();
  const restated = rows.filter((r) => r.restatementStatus === "restated").length;

  writeFileSync(join(OUT_DIR, entry.ticker + ".json"), JSON.stringify({
    ticker: entry.ticker,
    securityId: entry.securityId,
    generatedAtUtc: decisionTime,
    decisionTime,
    factCount: rows.length,
    distinctPeriods: periodEnds.length,
    earliestPeriodEnd: periodEnds[0] || null,
    latestPeriodEnd: periodEnds[periodEnds.length - 1] || null,
    metricsPresent: Object.keys(byMetric).sort(),
    restatedFactCount: restated,
    pitCheck: { decisionTime, futureDataLeaks: futureLeaks, ok: futureLeaks === 0 },
    facts: rows
  }, null, 2) + "\n");

  summary.tickers.push({
    ticker: entry.ticker, available: true,
    factCount: rows.length, distinctPeriods: periodEnds.length,
    earliestPeriodEnd: periodEnds[0] || null, latestPeriodEnd: periodEnds[periodEnds.length - 1] || null,
    metricsPresentCount: Object.keys(byMetric).length,
    restatedFactCount: restated,
    pitOk: futureLeaks === 0
  });

  console.log(`  ${entry.ticker.padEnd(6)} ${rows.length} Fakten, ${periodEnds.length} Perioden ` +
              `(${periodEnds[0] || "–"} .. ${periodEnds[periodEnds.length - 1] || "–"}), ` +
              `${restated} restated, PIT ${futureLeaks === 0 ? "OK" : "VERLETZT"}`);
}

writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log("Geschrieben: " + join(OUT_DIR, "summary.json").replace(root + "/", ""));

if (problems.length) {
  console.error("\nPROBLEME:");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
