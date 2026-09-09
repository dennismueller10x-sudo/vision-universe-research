/* =========================================================================
   VISION UNIVERSE — build-market-factors.mjs   (Tiingo Commercial, §14–§17, §30)

   Rechnet die Marktfaktoren des Gate-Universums und baut daraus das
   Datenmodell, aus dem der Screener seine Fragen beantwortet.

   ZWEI AUSGABEN, ZWEI ZWECKE

     factors-<GATE>.json    eine Zeile je Titel. Zustaende und Abstaende,
                            keine Kursniveaus (§34) - "5 % unter dem
                            52-Wochen-Hoch" darf ausgeliefert werden, "das
                            Hoch liegt bei 184,20" nicht.

     screener-<GATE>.json   die Fragen aus §15, bereits beantwortet. Je
                            Frage: wer erfuellt sie, wie viele, und - das
                            ist der Punkt - fuer wie viele Titel sie gar
                            nicht entscheidbar war.

   DAS DRITTE FELD IST DAS WICHTIGE

   Ein Screener, der auf "alle Aktien ueber SMA200" 340 Titel meldet,
   sagt nicht, ob die uebrigen 660 darunter liegen oder ob 200 von ihnen
   keine 200 Bars haben. Der Unterschied entscheidet, ob das Ergebnis eine
   Auswahl ist oder eine Luecke. Deshalb traegt jede Frage hier drei
   Zahlen: matched, notMatched, notEvaluable - und nie nur die erste.

   Ausfuehren:
     node scripts/market/build-market-factors.mjs --gate GATE_100
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const MarketFactors = require(join(engines, "market-factors.js"));
const MarketQuality = require(join(engines, "market-quality.js"));
const MarketStore = require(join(engines, "market-store.js"));

const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const GATE = arg("--gate", "GATE_100");
const SCALE_DIR = arg("--scale-dir", join(root, "quant", "data", "market", "scale"));
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "factors"));
const WORK_DIR = arg("--work-dir", null);
const BENCHMARK = arg("--benchmark", "SPY");
/* Wie viele Titel eine Rangliste ausweist. Alle 2.000 zu listen macht die
   Datei gross und die Antwort nicht besser - die Frage lautet "wer ist am
   staerksten", nicht "wie ist die Reihenfolge aller". */
const RANK_LIMIT = parseInt(arg("--rank-limit", "50"), 10) || 50;
/* Ab wie vielen Titeln bleibt die Einzelzeile in der Arbeitsablage?

   Gemessen: die Faktorzeilen von 5.684 Titeln sind 15,5 MB. In jedem Lauf
   erneut in die Versionierung geschrieben ist das kein Datensatz mehr,
   sondern Ballast - und §26 zieht die Grenze ausdruecklich zwischen
   ausgeliefertem Ergebnis und Arbeitsmaterial.

   Bis zu dieser Zahl wird die Einzelzeile mit ausgeliefert: sie ist klein
   genug und beim Arbeiten am Datenmodell das Nuetzlichste, was es gibt.
   Darueber wandert sie in die Arbeitsablage, und ausgeliefert werden die
   Deckungsbilanz und der Screener - genau das, was die Fragen aus §15
   beantwortet. */
const DETAIL_LIMIT = parseInt(arg("--detail-limit", "500"), 10) || 500;

const universeFile = join(SCALE_DIR, `universe-${GATE}.json`);
if (!existsSync(universeFile)) {
  console.error(`Kein Gate-Universum unter ${universeFile}.`);
  process.exit(2);
}
const universe = JSON.parse(readFileSync(universeFile, "utf8"));
const store = MarketStore.createMarketStore({
  root, providerId: "tiingo", workingDir: WORK_DIR || undefined
});

console.log(`Vision Universe — Marktfaktoren ${GATE}\n`);
console.log(`  Titel: ${universe.securities.length}`);

/* ------------------------------------------------------- Benchmark

   Ohne Benchmarkreihe bleibt die relative Staerke leer - mit Grund und
   nicht mit Null. Eine relative Staerke gegen sich selbst waere keine. */
let benchmark = null;
const benchPayload = store.readBars("ref_" + BENCHMARK, "working");
if (benchPayload && Array.isArray(benchPayload.bars) && benchPayload.bars.length) {
  const basis = MarketFactors.priceBasis(benchPayload.bars, benchPayload.adjustmentStatus);
  benchmark = {
    id: BENCHMARK,
    closes: benchPayload.bars.map((b) => {
      const v = b[basis];
      return typeof v === "number" && isFinite(v) && v > 0 ? v : b.close;
    }),
    last: benchPayload.bars[benchPayload.bars.length - 1].date,
    bars: benchPayload.bars.length
  };
  console.log(`  Benchmark: ${BENCHMARK} (${benchmark.bars} Bars bis ${benchmark.last})`);
} else {
  console.log(`  Benchmark: ${BENCHMARK} nicht in der Arbeitsablage - relative Staerke bleibt leer.`);
}

/* --------------------------------------------------------- Rechnen */

const today = new Date().toISOString().slice(0, 10);
const t0 = Date.now();
const rows = [];
const skipped = [];
const fieldCoverage = {};

function countField(name, status) {
  const c = (fieldCoverage[name] = fieldCoverage[name] ||
    { CALCULATED: 0, INSUFFICIENT_HISTORY: 0, SOURCE_MISSING: 0, NOT_APPLICABLE: 0 });
  c[status] = (c[status] || 0) + 1;
}

for (const sec of universe.securities) {
  const payload = store.readBars(sec.securityId, "working");
  if (!payload || !Array.isArray(payload.bars) || !payload.bars.length) {
    skipped.push({ ticker: sec.ticker, reason: "SOURCE_MISSING",
                   message: "Keine Kursreihe in der Arbeitsablage." });
    continue;
  }

  /* Ein Titel, dessen Reihe die Qualitaetspruefung nicht besteht, bekommt
     keine Faktoren. Faktoren auf einer als FAIL beurteilten Reihe waeren
     rechenbar und wertlos - und im Screener nicht von guten zu
     unterscheiden. */
  const assessment = MarketQuality.assessSeries(payload, { today });
  if (assessment.status === "FAIL" || assessment.status === "UNAVAILABLE") {
    skipped.push({ ticker: sec.ticker, reason: assessment.status,
                   message: assessment.statusReason });
    continue;
  }

  const factors = MarketFactors.computeFactors(
    Object.assign({ ticker: sec.ticker }, payload),
    { benchmark: benchmark });
  if (factors.status !== "OK") {
    skipped.push({ ticker: sec.ticker, reason: "UNAVAILABLE", message: factors.statusReason });
    continue;
  }

  const publicFactors = MarketFactors.stripPriceLevels(factors);

  Object.keys(factors.fieldStatus).forEach((f) => {
    const st = factors.fieldStatus[f];
    if (typeof st === "string") countField(f, st);
    else if (st && typeof st === "object") {
      Object.keys(st).forEach((h) => countField(f + "." + h, st[h]));
    }
  });

  rows.push({
    ticker: sec.ticker,
    securityId: sec.securityId,
    exchange: sec.exchange || null,
    sector: sec.sector || null,
    sectorStatus: sec.sectorStatus || "SOURCE_MISSING",
    instrumentType: sec.instrumentType || null,
    dataQuality: assessment.status,
    dataQualityReason: assessment.statusReason,
    bars: factors.bars,
    asOf: factors.asOf,
    basis: factors.basis,
    values: publicFactors.values,
    fieldStatus: publicFactors.fieldStatus
  });
}

const runtimeMs = Date.now() - t0;
console.log(`  Gerechnet: ${rows.length}, uebersprungen ${skipped.length}, ` +
            `${(runtimeMs / 1000).toFixed(1)} s ` +
            `(${rows.length ? Math.round(runtimeMs / rows.length) : 0} ms/Titel)`);

/* ------------------------------------------------------- Screener

   Jede Frage ist ein Praedikat auf einer Faktorzeile. Es gibt genau drei
   Antworten je Titel: ja, nein, nicht entscheidbar. */

function booleanQuestion(id, label, pick) {
  const matched = [], notEvaluable = [];
  let notMatched = 0;
  for (const r of rows) {
    const v = pick(r.values);
    if (v === true) matched.push(r.ticker);
    else if (v === false) notMatched++;
    else notEvaluable.push(r.ticker);
  }
  return { id, label, kind: "boolean",
           matched: matched.length, notMatched, notEvaluable: notEvaluable.length,
           evaluatedOf: rows.length,
           tickers: matched.slice(0, RANK_LIMIT),
           tickersTruncated: matched.length > RANK_LIMIT,
           notEvaluableSample: notEvaluable.slice(0, 10),
           notEvaluableNote: notEvaluable.length
             ? "Fuer diese Titel ist die Frage nicht entscheidbar - meist zu kurze Historie. " +
               "Sie zaehlen ausdruecklich weder als Treffer noch als Nichttreffer."
             : null };
}

function rankedQuestion(id, label, pick, direction) {
  const scored = [], notEvaluable = [];
  for (const r of rows) {
    const v = pick(r.values);
    if (typeof v === "number" && isFinite(v)) scored.push({ ticker: r.ticker, value: v });
    else notEvaluable.push(r.ticker);
  }
  scored.sort((a, b) => direction === "asc" ? a.value - b.value : b.value - a.value);
  return { id, label, kind: "ranked", direction,
           evaluated: scored.length, notEvaluable: notEvaluable.length,
           evaluatedOf: rows.length,
           top: scored.slice(0, RANK_LIMIT),
           notEvaluableSample: notEvaluable.slice(0, 10) };
}

const questions = [
  booleanQuestion("aboveSMA20", "Alle Aktien ueber SMA20", (v) => v.priceAboveSMA20),
  booleanQuestion("aboveSMA50", "Alle Aktien ueber SMA50", (v) => v.priceAboveSMA50),
  booleanQuestion("aboveSMA100", "Alle Aktien ueber SMA100", (v) => v.priceAboveSMA100),
  booleanQuestion("aboveSMA200", "Alle Aktien ueber SMA200", (v) => v.priceAboveSMA200),
  booleanQuestion("aboveSMA20And50And200", "Ueber SMA20 und SMA50 und SMA200",
                  (v) => v.aboveSMA20And50And200),
  booleanQuestion("aboveAllSMA", "Ueber allen vier Durchschnitten", (v) => v.aboveAllSMA),
  booleanQuestion("newHigh52w", "Neue 52-Wochen-Hochs", (v) => v.newHigh52w),
  booleanQuestion("within5PctOf52wHigh", "Innerhalb 5 % vom 52-Wochen-Hoch",
                  (v) => v.within5PctOf52wHigh),
  booleanQuestion("volumeBreakout", "Volumen-Ausbruch (Tagesvolumen >= 2x 20-Tage-Mittel)",
                  (v) => v.volumeBreakout),
  rankedQuestion("strongestMomentum12M", "Staerkstes Momentum (12 Monate)",
                 (v) => v.returns && v.returns["12M"], "desc"),
  rankedQuestion("strongestMomentum6M", "Staerkstes Momentum (6 Monate)",
                 (v) => v.returns && v.returns["6M"], "desc"),
  rankedQuestion("strongestMomentum12M1M", "Staerkstes Momentum (12 Monate ohne den letzten)",
                 (v) => v.return12M1M, "desc"),
  rankedQuestion("strongestRelativeStrength12M",
                 `Staerkste relative Staerke gegen ${BENCHMARK} (12 Monate)`,
                 (v) => v.relativeStrength && v.relativeStrength["12M"], "desc"),
  rankedQuestion("trendAcceleration", "Trendbeschleunigung (1M gegen 3M)",
                 (v) => v.momentumAcceleration, "desc"),
  rankedQuestion("highVolatility", "Hoechste Volatilitaet (60 Tage, annualisiert)",
                 (v) => v.volatility60d, "desc"),
  rankedQuestion("lowVolatility", "Niedrigste Volatilitaet (60 Tage, annualisiert)",
                 (v) => v.volatility60d, "asc"),
  rankedQuestion("nearest52wHigh", "Geringster Abstand zum 52-Wochen-Hoch",
                 (v) => v.distanceTo52wHigh, "desc"),
  rankedQuestion("deepestDrawdown", "Groesster Rueckgang im letzten Jahr",
                 (v) => v.maxDrawdown252d, "asc")
];

mkdirSync(OUT_DIR, { recursive: true });

const provenance = {
  generatedAt: new Date().toISOString(),
  gate: GATE,
  provider: "tiingo",
  engine: MarketFactors.VERSION,
  benchmark: benchmark ? { id: benchmark.id, bars: benchmark.bars, last: benchmark.last }
                       : { id: BENCHMARK, status: "SOURCE_MISSING",
                           note: "Keine Benchmarkreihe in der Arbeitsablage. Relative Staerke " +
                                 "bleibt fuer alle Titel leer." },
  run: {
    source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
    runId: process.env.GITHUB_RUN_ID || null,
    commit: process.env.GITHUB_SHA || null,
    runtimeMs, msPerSymbol: rows.length ? Math.round(runtimeMs / rows.length) : null
  },
  redistribution: {
    priceLevels: "WITHHELD",
    note: "Absolute Kursniveaus (SMA-Werte, 52-Wochen-Hoch/Tief, letzter Kurs) sind " +
          "Anbieterkurse und bleiben in der Arbeitsablage. Ausgeliefert werden Zustaende, " +
          "Abstaende und Renditen."
  }
};

const coverage = {
  requested: universe.securities.length,
  computed: rows.length,
  skipped: skipped.length,
  skippedByReason: skipped.reduce((acc, s) => {
    acc[s.reason] = (acc[s.reason] || 0) + 1; return acc;
  }, {}),
  fieldCoverage
};

/* Die Deckungsbilanz wird IMMER ausgeliefert. Sie ist klein, sie beantwortet
   "wie viele Titel tragen SMA200", und der Gesundheitsbericht liest sie. */
const summaryFile = join(OUT_DIR, `factors-${GATE}-summary.json`);
const detailInRepo = rows.length <= DETAIL_LIMIT;
writeFileSync(summaryFile, JSON.stringify(Object.assign({}, provenance, {
  coverage,
  skipped,
  detail: detailInRepo
    ? { location: "repository", file: `quant/data/market/factors/factors-${GATE}.json`,
        symbols: rows.length }
    : { location: "workingStore",
        file: join(WORK_DIR || join(root, SCALE.storage.workingDir),
                   "tiingo", "factors", `factors-${GATE}.json`).replace(root + "/", ""),
        symbols: rows.length,
        reason: `Mehr als ${DETAIL_LIMIT} Titel. Die Einzelzeilen bleiben in der ` +
                `Arbeitsablage; ausgeliefert werden Deckungsbilanz und Screener (§26).` }
}), null, 2) + "\n");

const detailPayload = JSON.stringify(Object.assign({}, provenance, {
  coverage, skipped, securities: rows
}), null, 2) + "\n";

let detailFile;
if (detailInRepo) {
  detailFile = join(OUT_DIR, `factors-${GATE}.json`);
} else {
  detailFile = join(WORK_DIR || join(root, SCALE.storage.workingDir),
                    "tiingo", "factors", `factors-${GATE}.json`);
  mkdirSync(dirname(detailFile), { recursive: true });
  /* Eine frueher ausgelieferte Einzelzeile wieder entfernen: sonst bleibt
     ein alter, kleinerer Stand im Repository stehen und sieht aus wie der
     aktuelle. */
  const stale = join(OUT_DIR, `factors-${GATE}.json`);
  if (existsSync(stale)) rmSync(stale);
}
writeFileSync(detailFile, detailPayload);

writeFileSync(join(OUT_DIR, `screener-${GATE}.json`), JSON.stringify(Object.assign({}, provenance, {
  universeSize: universe.securities.length,
  evaluable: rows.length,
  notEvaluable: skipped.length,
  note: "Jede Frage traegt drei Zahlen: Treffer, Nichttreffer und nicht entscheidbar. " +
        "Die dritte ist die wichtigste - ohne sie liest sich eine Luecke wie ein Befund.",
  questions
}), null, 2) + "\n");

console.log("\n  Screener:");
questions.forEach((q) => {
  if (q.kind === "boolean") {
    console.log(`    ${q.id.padEnd(24)} ${String(q.matched).padStart(5)} Treffer, ` +
                `${String(q.notMatched).padStart(5)} nein, ${String(q.notEvaluable).padStart(5)} n/a`);
  } else {
    console.log(`    ${q.id.padEnd(24)} ${String(q.evaluated).padStart(5)} bewertbar, ` +
                `${String(q.notEvaluable).padStart(5)} n/a` +
                (q.top.length ? `  Spitze: ${q.top[0].ticker}` : ""));
  }
});
console.log(`\n  ${summaryFile.replace(root + "/", "")}`);
console.log(`  ${detailFile.replace(root + "/", "")}` +
            (detailInRepo ? "" : "   (Arbeitsablage - zu gross fuer die Auslieferung)"));
console.log(`  ${join(OUT_DIR, `screener-${GATE}.json`).replace(root + "/", "")}`);
console.log("\nFertig.");
