/* =========================================================================
   VISION UNIVERSE — run-technical-scale.mjs   (Tiingo Commercial, §13, §18, §32)

   Fuehrt die BESTEHENDE Technical Intelligence ueber das Gate-Universum
   aus und misst, wie weit sie traegt.

   KEINE ZWEITE ENGINE. Das ist die wichtigste Eigenschaft dieses Skripts.
   Trend, Momentum, relative Staerke, Volatilitaet, Volumen,
   Marktstruktur, Unterstuetzung, Widerstand, Confluence, Opportunity
   Score, Szenarien, Trade Setup und Elliott kommen aus
   quant/engines/technical/ - denselben Dateien, die die Einzelansicht
   benutzt. Hier laufen sie nur ueber viele Titel statt ueber einen.

   WAS DABEI HERAUSKOMMT

   Ein Deckungsbericht, kein Datensatz. Die Bundles sind gross (rund ein
   halbes Megabyte je Titel); sie fuer tausende Titel auszuliefern waere
   weder speicherbar noch lizenzrechtlich sauber (§26, §34). Was bleibt,
   ist die Auskunft, auf die es ankommt:

     TECHNICAL_READY        vollstaendige Analyse
     TECHNICAL_PARTIAL      Analyse, aber Bestandteile fehlen
     TECHNICAL_FAILED       Analyse warf oder lieferte nichts
     INSUFFICIENT_HISTORY   zu kurze Reihe - keine Analyse versucht

   und dieselbe Auskunft fuer Elliott, dazu die Laufzeiten (§18: bei zu
   hoher Rechenlast dokumentieren, nicht blind tausende Rebuilds).

   Ausfuehren:
     node scripts/technical/run-technical-scale.mjs --gate GATE_100
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");
const T = (n) => require(join(engines, "technical", n));

const Canonical = T("canonical-bars.js");
const Analysis = T("technical-analysis.js");
const MarketStore = require(join(engines, "market-store.js"));

const METH = {
  technical: JSON.parse(readFileSync(join(root, "quant", "methodology", "technical-v1.json"), "utf8")),
  elliott: JSON.parse(readFileSync(join(root, "quant", "methodology", "elliott-v1.json"), "utf8"))
};

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const GATE = arg("--gate", "GATE_100");
const SCALE_DIR = arg("--scale-dir", join(root, "quant", "data", "market", "scale"));
const OUT_DIR = arg("--out", join(root, "quant", "data", "technical", "scale"));
const WORK_DIR = arg("--work-dir", null);
const BENCHMARK = arg("--benchmark", "SPY");
const NO_ELLIOTT = argv.includes("--no-elliott");

/* Wie viele Bars die Analyse mindestens braucht. Der Wert stammt nicht
   aus einer Vorliebe: SMA200 braucht 200, das 12-Monats-Momentum 252,
   und die Pivot-Erkennung braucht Spielraum darueber. Darunter ist das
   Ergebnis nicht schlechter - es ist keines. */
const MIN_BARS = parseInt(arg("--min-bars", "300"), 10) || 300;
/* Wie beim Gate-Bericht: ueber dieser Groesse bleiben im ausgelieferten
   Deckungsbericht nur die Titel, die NICHT sauber durchliefen. Die
   vollstaendige Liste liegt in der Arbeitsablage (§26). */
const DETAIL_LIMIT = parseInt(arg("--detail-limit", "500"), 10) || 500;

/* Elliott-Vertrauensschwellen. Sie klassifizieren AUSSCHLIESSLICH den
   vorhandenen confidence-Wert der Engine in die Faecher aus §18; sie
   veraendern die Engine nicht und rechnen nichts nach. */
const ELLIOTT_HIGH = 70;
const ELLIOTT_MEDIUM = 50;

const universeFile = join(SCALE_DIR, `universe-${GATE}.json`);
if (!existsSync(universeFile)) {
  console.error(`Kein Gate-Universum unter ${universeFile}.`);
  process.exit(2);
}
const universe = JSON.parse(readFileSync(universeFile, "utf8"));
const store = MarketStore.createMarketStore({
  root, providerId: "tiingo", workingDir: WORK_DIR || undefined
});

console.log(`Vision Universe — Technical Intelligence im Massstab (${GATE})\n`);
console.log(`  Titel:   ${universe.securities.length}`);
console.log(`  Elliott: ${NO_ELLIOTT ? "aus" : "an"}`);

/**
 * Gespeicherte Tiingo-Bars -> kanonische SPLIT_ADJUSTED-Reihe.
 *
 * Dieselbe Ableitung wie in scripts/technical/golden-five-series.mjs:
 * die Splitbereinigung entsteht aus den Rohkursen und den in der Reihe
 * mitgefuehrten splitFactor-Werten, nicht aus der adjClose-Spalte des
 * Anbieters. Zwei verschiedene Ableitungen fuer dieselbe Groesse waeren
 * genau die Abweichung, die eine Nachrechnungspruefung finden soll.
 */
function toSeries(payload, ticker) {
  const bars = payload.bars || [];
  const corporateActions = [];
  for (const bar of bars) {
    if (bar.splitFactor !== null && bar.splitFactor !== undefined && bar.splitFactor !== 1) {
      corporateActions.push({ type: "split", exDate: bar.date, ratio: bar.splitFactor });
    }
    if (bar.dividend !== null && bar.dividend !== undefined && bar.dividend > 0) {
      corporateActions.push({ type: "dividend", exDate: bar.date, amount: bar.dividend });
    }
  }
  const worlds = Canonical.fromPriceBars(bars, corporateActions, {
    instrumentId: ticker, source: "tiingo", sourceRevision: payload.updatedAt,
    currency: payload.currency || "USD", exchange: payload.exchange || "US"
  });
  return worlds.SPLIT_ADJUSTED || null;
}

/* --------------------------------------------------------- Benchmark */

let benchSeries = null;
const benchPayload = store.readBars("ref_" + BENCHMARK, "working");
if (benchPayload && (benchPayload.bars || []).length >= MIN_BARS) {
  benchSeries = toSeries(benchPayload, BENCHMARK);
  console.log(`  Benchmark: ${BENCHMARK}, ${benchSeries ? benchSeries.length : 0} Bars`);
} else {
  console.log(`  Benchmark: ${BENCHMARK} fehlt - relative Staerke bleibt UNAVAILABLE.`);
}

/* ------------------------------------------------------------- Lauf */

const t0 = Date.now();
const perSymbol = {};
const coverage = { TECHNICAL_READY: 0, TECHNICAL_PARTIAL: 0, TECHNICAL_FAILED: 0,
                   INSUFFICIENT_HISTORY: 0, SOURCE_MISSING: 0 };
const elliottCoverage = { HIGH_CONFIDENCE: 0, MEDIUM_CONFIDENCE: 0, LOW_CONFIDENCE: 0,
                          AMBIGUOUS: 0, UNAVAILABLE: 0, NOT_RUN: 0 };
const elliottReasons = {};
let technicalMs = 0, elliottSymbols = 0, processed = 0;
const slowest = [];

/* Bestandteile, deren Fehlen die Analyse von READY auf PARTIAL setzt.
   Bewusst die, auf denen die Oberflaeche und der Screener aufbauen -
   nicht jede Eigenschaft des Bundles. */
const REQUIRED_PARTS = ["trend", "momentum", "volatility", "volume", "structure",
                        "supportResistance", "confluence", "opportunityScore",
                        "scenarios", "tradeSetup"];

function elliottBucket(elliott) {
  if (!elliott) return { bucket: "UNAVAILABLE", reason: "notComputed" };
  if (elliott.status === "UNAVAILABLE") {
    return { bucket: "UNAVAILABLE", reason: elliott.reason || "unavailable" };
  }
  if (elliott.status === "AMBIGUOUS") return { bucket: "AMBIGUOUS", reason: "ambiguousCount" };
  const c = typeof elliott.confidence === "number" ? elliott.confidence : null;
  if (elliott.status === "LOW_CONFIDENCE" || c === null || c < ELLIOTT_MEDIUM) {
    return { bucket: "LOW_CONFIDENCE", reason: elliott.reason || "lowConfidence" };
  }
  if (c >= ELLIOTT_HIGH) return { bucket: "HIGH_CONFIDENCE", reason: null };
  return { bucket: "MEDIUM_CONFIDENCE", reason: null };
}

for (const sec of universe.securities) {
  const payload = store.readBars(sec.securityId, "working");
  if (!payload || !(payload.bars || []).length) {
    coverage.SOURCE_MISSING++;
    elliottCoverage.NOT_RUN++;
    perSymbol[sec.ticker] = { technical: "SOURCE_MISSING", elliott: "NOT_RUN",
                              reason: "Keine Kursreihe in der Arbeitsablage." };
    continue;
  }

  const series = toSeries(payload, sec.ticker);
  if (!series || series.length < MIN_BARS) {
    coverage.INSUFFICIENT_HISTORY++;
    elliottCoverage.NOT_RUN++;
    perSymbol[sec.ticker] = {
      technical: "INSUFFICIENT_HISTORY", elliott: "NOT_RUN",
      bars: series ? series.length : 0, minBars: MIN_BARS,
      reason: `Reihe hat ${series ? series.length : 0} Bars, benoetigt sind ${MIN_BARS}. ` +
              "Es wurde nichts gerechnet - ein Ergebnis auf zu kurzer Reihe waere keines."
    };
    continue;
  }

  const started = Date.now();
  let bundle = null, error = null;
  try {
    bundle = Analysis.analyze({
      series,
      benchmarkSeries: sec.ticker === BENCHMARK ? null : benchSeries,
      methodology: METH,
      /* includeChartSeries bleibt aus: der Chart wird hier nicht gebaut,
         und die Reihe im Bundle waere der groesste Posten. */
      options: { elliott: !NO_ELLIOTT, annotations: false, includeChartSeries: false }
    });
  } catch (err) {
    error = String(err && err.message || err).slice(0, 200);
  }
  const ms = Date.now() - started;
  technicalMs += ms;
  processed++;

  slowest.push({ ticker: sec.ticker, ms, bars: series.length });

  if (error || !bundle) {
    coverage.TECHNICAL_FAILED++;
    elliottCoverage.NOT_RUN++;
    perSymbol[sec.ticker] = { technical: "TECHNICAL_FAILED", elliott: "NOT_RUN",
                              bars: series.length, runtimeMs: ms, reason: error || "analyze() lieferte nichts." };
    continue;
  }

  const missing = REQUIRED_PARTS.filter((p) => !bundle[p]);
  const status = missing.length ? "TECHNICAL_PARTIAL" : "TECHNICAL_READY";
  coverage[status]++;

  let elliottStatus = "NOT_RUN";
  if (!NO_ELLIOTT) {
    const b = elliottBucket(bundle.elliott);
    elliottStatus = b.bucket;
    elliottCoverage[b.bucket]++;
    if (b.reason) elliottReasons[b.reason] = (elliottReasons[b.reason] || 0) + 1;
    elliottSymbols++;
  } else {
    elliottCoverage.NOT_RUN++;
  }

  perSymbol[sec.ticker] = {
    technical: status,
    missingParts: missing.length ? missing : null,
    elliott: elliottStatus,
    elliottConfidence: bundle.elliott && typeof bundle.elliott.confidence === "number"
      ? bundle.elliott.confidence : null,
    bars: series.length,
    runtimeMs: ms,
    /* Zustaende, keine Kurse (§34). Das ist genau die Menge, die ein
       Deckungsbericht braucht - und die, die ausgeliefert werden darf. */
    trend: bundle.trend ? bundle.trend.direction : null,
    momentumState: bundle.momentum ? bundle.momentum.state : null,
    volatilityState: bundle.volatility ? bundle.volatility.state : null,
    relativeStrengthStatus: bundle.relativeStrength
      ? (bundle.relativeStrength.benchmark ? bundle.relativeStrength.benchmark.status : null) : null,
    opportunityScore: bundle.opportunityScore ? bundle.opportunityScore.score : null,
    primaryScenario: bundle.scenarios && bundle.scenarios.primary
      ? bundle.scenarios.primary.direction : null,
    hasTradeSetup: !!bundle.tradeSetup
  };

  if (processed % 25 === 0) {
    console.log(`    ${String(processed).padStart(5)} verarbeitet, ` +
                `${Math.round(technicalMs / processed)} ms/Titel`);
  }
}

slowest.sort((a, b) => b.ms - a.ms);
const runtimeMs = Date.now() - t0;
const evaluated = coverage.TECHNICAL_READY + coverage.TECHNICAL_PARTIAL + coverage.TECHNICAL_FAILED;

const report = {
  generatedAt: new Date().toISOString(),
  gate: GATE,
  provider: "tiingo",
  methodologyVersions: {
    technical: METH.technical.methodologyVersion,
    elliott: METH.elliott.methodologyVersion
  },
  note: "Deckungsbericht, kein Datensatz. Die Analysebundles bleiben in der Arbeitsablage - " +
        "rund ein halbes Megabyte je Titel waere weder speicherbar noch weitergabefaehig. " +
        "Ausgewiesen sind Zustaende und Laufzeiten, keine Kurse.",
  run: {
    source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
    runId: process.env.GITHUB_RUN_ID || null,
    commit: process.env.GITHUB_SHA || null,
    elliottEnabled: !NO_ELLIOTT,
    minBars: MIN_BARS,
    benchmark: benchSeries ? BENCHMARK : null,
    benchmarkStatus: benchSeries ? "OK" : "SOURCE_MISSING"
  },
  requested: universe.securities.length,
  evaluated,
  coverage,
  coverageRate: universe.securities.length
    ? Math.round(coverage.TECHNICAL_READY / universe.securities.length * 10000) / 10000 : 0,
  elliott: {
    enabled: !NO_ELLIOTT,
    symbolsRun: elliottSymbols,
    coverage: elliottCoverage,
    reasons: elliottReasons,
    /* "highConfidenceFrom" statt "high": ein Feld namens "high" mit einer
       Zahl darin ist in einem ausgelieferten Artefakt nicht von einem
       Tageshoechstkurs zu unterscheiden. Die Hygienepruefung sucht genau
       danach und hat diesen Bericht beim ersten Lauf angehalten - zu
       Recht, denn der Unterschied stand nur im Kontext. */
    confidenceThresholds: { highConfidenceFrom: ELLIOTT_HIGH,
                            mediumConfidenceFrom: ELLIOTT_MEDIUM },
    thresholdNote: "Die Schwellen ordnen den vorhandenen confidence-Wert der Engine in die " +
                   "Faecher aus §18 ein. Sie veraendern die Engine nicht und rechnen nichts nach."
  },
  performance: {
    totalRuntimeMs: runtimeMs,
    analysisRuntimeMs: technicalMs,
    msPerSymbol: processed ? Math.round(technicalMs / processed) : null,
    processed,
    slowest: slowest.slice(0, 10),
    /* Die Hochrechnung, die §18 und §24 verlangen: was kostet das eine
       Stufe hoeher. Bewusst linear und als solche gekennzeichnet - die
       Analyse ist je Titel unabhaengig, das ist der Grund, warum sie
       linear skaliert und nicht quadratisch (§32). */
    projected: processed ? {
      basis: "Linear aus " + processed + " gemessenen Titeln. Die Analyse je Titel ist " +
             "unabhaengig von den anderen; es gibt keinen Schritt ueber Titelpaare.",
      minutesFor500: Math.round(technicalMs / processed * 500 / 60000 * 10) / 10,
      minutesFor2000: Math.round(technicalMs / processed * 2000 / 60000 * 10) / 10,
      minutesFor10000: Math.round(technicalMs / processed * 10000 / 60000 * 10) / 10
    } : null
  },
  perSymbol
};

const detailInRepo = Object.keys(perSymbol).length <= DETAIL_LIMIT;
if (!detailInRepo) {
  const workFile = join(WORK_DIR || join(root, ".market-cache"),
                        "tiingo", "technical", `technical-coverage-${GATE}-perSymbol.json`);
  mkdirSync(dirname(workFile), { recursive: true });
  writeFileSync(workFile, JSON.stringify(perSymbol));

  const auffaellig = {};
  Object.keys(perSymbol).forEach((t) => {
    if (perSymbol[t].technical !== "TECHNICAL_READY") auffaellig[t] = perSymbol[t];
  });
  report.perSymbol = auffaellig;
  report.perSymbolDetail = {
    location: "workingStore",
    file: workFile.replace(root + "/", ""),
    symbolsTotal: Object.keys(perSymbol).length,
    symbolsInReport: Object.keys(auffaellig).length,
    reason: `Mehr als ${DETAIL_LIMIT} Titel. Ausgeliefert werden die Befunde - alles ausser ` +
            `TECHNICAL_READY - und die Deckungsbilanz (§26).`
  };
} else {
  report.perSymbolDetail = { location: "report", symbolsTotal: Object.keys(perSymbol).length };
}

mkdirSync(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, `technical-coverage-${GATE}.json`);
writeFileSync(file, JSON.stringify(report, null, 2) + "\n");

console.log("\n  Deckung:");
Object.keys(coverage).forEach((k) => {
  if (coverage[k]) console.log(`    ${k.padEnd(22)} ${coverage[k]}`);
});
if (!NO_ELLIOTT) {
  console.log("  Elliott:");
  Object.keys(elliottCoverage).forEach((k) => {
    if (elliottCoverage[k]) console.log(`    ${k.padEnd(22)} ${elliottCoverage[k]}`);
  });
}
console.log(`\n  Laufzeit: ${(runtimeMs / 1000).toFixed(1)} s, ` +
            `${report.performance.msPerSymbol} ms/Titel`);
if (report.performance.projected) {
  console.log(`  Hochrechnung: ${report.performance.projected.minutesFor2000} min fuer 2.000 Titel`);
}
console.log(`\n  ${file.replace(root + "/", "")}`);
