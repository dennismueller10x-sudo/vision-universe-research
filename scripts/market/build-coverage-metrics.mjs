/* =========================================================================
   VISION UNIVERSE — build-coverage-metrics.mjs

   Drei Kennzahlen statt einer, und ein Nenner, der die Frage kennt.

   Der Backfill hat 84,81 % gemeldet und sie CHART_READY genannt. Die
   Rechnung stimmte, die Bezeichnung nicht: gemessen wurde "hat
   mindestens 250 Bars" - die Schwelle der Technik. Als Chartaussage
   gelesen behauptet die Zahl, 1.185 Titel liessen sich nicht
   darstellen. Die Chart-Engine zeichnet ab zwei Bars.

   Dieses Skript ersetzt die eine Zahl durch drei, die jeweils EINE
   Frage beantworten, und durch eine vierte Rechnung, deren eigentliches
   Thema der Nenner ist. Was jede bedeutet, steht in
   quant/engines/coverage-metrics.js - hier steht nur, woher die Zahlen
   kommen.

   HERKUNFT DER ZAHLEN

     Mitgliedschaft   universe-FULL_UNIVERSE.json   (unveraendert gelesen)
     Produkteignung   security-master/eligibility.json
     Bars je Titel    der Index des R2-Speichers    (ein GET)
     Anbieterluecken  gate-FULL_UNIVERSE.json, perSymbol.status

   KEINE KURSABFRAGE, KEIN SCHREIBEN IN DEN SPEICHER

   Gelesen wird der Index, nicht die Reihen. Kursniveaus werden nicht
   angefasst und nicht ausgeliefert - nur Anzahlen und Datumsgrenzen.
   TIINGO PRICE REQUESTS = 0.

   Ausfuehren:
     node scripts/market/build-coverage-metrics.mjs
     node scripts/market/build-coverage-metrics.mjs --index <datei>
     node scripts/market/build-coverage-metrics.mjs --local-root <pfad>
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Coverage = require(join(root, "quant", "engines", "coverage-metrics.js"));
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(n, d = null) {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
}
const GATE = arg("--gate", "FULL_UNIVERSE");
const PROVIDER = arg("--provider", "tiingo");
const MARKET = arg("--market", "US");
const TODAY = arg("--today", new Date().toISOString().slice(0, 10));
const INDEX_FILE = arg("--index", null);
const LOCAL_ROOT = arg("--local-root", null);
const OUT = arg("--out", join(root, "quant", "data", "market", "history", "coverage-metrics.json"));

/* Die Schwellen werden gelesen, nicht gesetzt. Jede stammt aus der
   Stelle, die sie tatsaechlich anwendet - eine hier neu erfundene Zahl
   waere eine Zweitmeinung ueber fremdes Verhalten. */
function chartMinBars() {
  const src = readFileSync(join(root, "quant", "engines", "chart-ranges.js"), "utf8");
  const m = src.match(/var\s+MIN_BARS\s*=\s*(\d+)\s*;/);
  if (!m) throw new Error("chart-ranges.js: MIN_BARS nicht gefunden. " +
                          "Die Schwelle wird gelesen, nicht geraten.");
  return parseInt(m[1], 10);
}
function technicalMinBars() {
  const src = readFileSync(join(root, "scripts", "technical", "run-technical-scale.mjs"), "utf8");
  const m = src.match(/const\s+MIN_BARS\s*=[^;]*?"(\d+)"/);
  if (!m) throw new Error("run-technical-scale.mjs: MIN_BARS nicht gefunden.");
  return parseInt(m[1], 10);
}
const CHART_MIN = parseInt(arg("--chart-min-bars", String(chartMinBars())), 10);
const TECH_MIN = parseInt(arg("--technical-min-bars", String(technicalMinBars())), 10);
const LONG_MIN = (SCALE.pass && SCALE.pass.historyCoverageMinBars) || 250;
const MIN_RATE = (SCALE.pass && SCALE.pass.minHistoryCoverageRate) || 0.9;

console.log("VISION UNIVERSE — Deckungskennzahlen des Historienspeichers\n");
console.log(`  Stichtag ${TODAY}   Kursabfragen: 0`);
console.log(`  Schwellen  Chart ${CHART_MIN} Bars (chart-ranges.js)   ` +
            `Technik ${TECH_MIN} Bars (run-technical-scale.mjs)   ` +
            `Langhistorie ${LONG_MIN} Bars (tiingo-scale.json)\n`);

/* ------------------------------------------------------- 1. Eingaben */
const universeFile = join(root, "quant", "data", "market", "scale", `universe-${GATE}.json`);
if (!existsSync(universeFile)) { console.error("Kein Universum: " + universeFile); process.exit(1); }
const universe = (JSON.parse(readFileSync(universeFile, "utf8")).securities || [])
  .map((s) => ({ ticker: String(s.ticker).toUpperCase(), startDate: s.startDate || null,
                 exchange: s.exchange, securityId: s.securityId }));

const eligFile = join(root, "quant", "data", "market", "security-master", "eligibility.json");
let productEligible = null, eligibilitySource = null, eligCounts = null;
if (existsSync(eligFile)) {
  const e = JSON.parse(readFileSync(eligFile, "utf8"));
  productEligible = {};
  /* Im Produkt sind ELIGIBLE, SEPARATE_CLASS und REVIEW. Ein
     Verdachtsfall wird nicht stillschweigend aus dem Nenner genommen -
     er ist nicht widerlegt. */
  for (const d of e.decisions || []) productEligible[d.ticker] = d.product_eligibility !== "EXCLUDED";
  eligibilitySource = { file: "quant/data/market/security-master/eligibility.json",
                        generatedAt: e.generatedAt, version: e.version };
  eligCounts = e.counts;
  console.log(`  Produkteignung gelesen: ${e.counts.ELIGIBLE} ELIGIBLE, ` +
              `${e.counts.SEPARATE_CLASS} SEPARATE_CLASS, ${e.counts.REVIEW} REVIEW, ` +
              `${e.counts.EXCLUDED} EXCLUDED`);
} else {
  console.log("  Keine Eignungsschicht gefunden - alle Mitglieder gelten als Produkttitel.");
}

/* Anbieterluecken: der Titel existiert, der Anbieter liefert keine
   Reihe. Gelesen aus dem Gate-Befund, nicht geraten. */
const providerNoSeries = {};
const gateFile = join(root, "quant", "data", "market", "scale", `gate-${GATE}.json`);
if (existsSync(gateFile)) {
  const gate = JSON.parse(readFileSync(gateFile, "utf8"));
  for (const [t, r] of Object.entries(gate.perSymbol || {})) {
    if (r && r.status === "UNAVAILABLE") providerNoSeries[String(t).toUpperCase()] = true;
  }
}
console.log(`  Anbieterluecken laut Gate-Befund: ${Object.keys(providerNoSeries).length}`);

/* ------------------------------------------------ 2. Bars je Titel */
async function loadStored() {
  if (INDEX_FILE) {
    const raw = JSON.parse(readFileSync(INDEX_FILE, "utf8"));
    const src = raw.symbols || raw;
    const out = {};
    for (const [t, v] of Object.entries(src)) {
      out[String(t).toUpperCase()] = { bars: v.barCount || v.bars || 0,
                                       first: v.first || null, last: v.last || null,
                                       bytes: v.bytes || 0 };
    }
    return { stored: out, source: { kind: "file", file: INDEX_FILE.replace(root + "/", "") } };
  }

  const Store = require(join(root, "quant", "engines", "history-store.js"));
  const budget = Guard.createBudget({ classAOperations: 0,
                                      classBOperations: universe.length * 2 + 500 });
  let driver;
  if (LOCAL_ROOT) {
    const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
    driver = createFsDriver(LOCAL_ROOT);
  } else {
    const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
    driver = createS3DriverFromEnv();
  }
  const store = Store.createHistoryStore({ driver, provider: PROVIDER, market: MARKET, budget });

  /* Erst der abgelegte Index - ein einziger GET. Nur wenn er fehlt oder
     offensichtlich unvollstaendig ist, wird er aus LIST+HEAD neu
     gebildet; das kostet ein Vielfaches und wird deshalb gemeldet. */
  let index = null;
  try { index = await store.readIndex(); } catch { index = null; }
  let how = "INDEX_OBJECT";
  if (!index || !index.symbols || Object.keys(index.symbols).length < universe.length * 0.5) {
    console.log("  Index fehlt oder ist unvollstaendig - Neuaufbau aus LIST+HEAD.");
    index = await store.rebuildIndexFromStorage({ expectedObjects: universe.length + 200 });
    how = "REBUILT_FROM_LIST_AND_HEAD";
  }
  const out = {};
  for (const [t, v] of Object.entries(index.symbols || {})) {
    out[String(t).toUpperCase()] = { bars: v.barCount || 0, first: v.first || null,
                                     last: v.last || null, bytes: v.bytes || 0 };
  }
  return { stored: out, source: { kind: store.driver.kind, how,
                                  prefix: store.seriesPrefix,
                                  classBSpent: budget.usage ? budget.usage.classBOperations : null } };
}

const { stored, source } = await loadStored();
console.log(`  Historien in der Ablage: ${Object.keys(stored).length} ` +
            `(${source.kind}${source.how ? ", " + source.how : ""})\n`);

/* ------------------------------------------------- 3. Rechnen */
const result = Coverage.computeCoverage({
  universe, stored, productEligible, providerNoSeries, today: TODAY,
  chartMinBars: CHART_MIN, technicalMinBars: TECH_MIN,
  longHistoryMinBars: LONG_MIN, minLongHistoryRate: MIN_RATE
});

const S = result.STORAGE_COVERAGE, C = result.CHART_AVAILABILITY,
      T = result.TECHNICAL_HISTORY_ELIGIBILITY, L = result.LONG_HISTORY;

console.log("  STORAGE_COVERAGE — liegt die Historie in der Ablage?");
console.log(`    ${S.stored}/${S.denominator} = ${S.STORAGE_COVERAGE_PERCENT} %`);
console.log(`    fehlend ${S.missing}  (Anbieter hat keine Reihe: ${S.missingProviderUnavailable}, ` +
            `unerklaert: ${S.missingUnexplained})\n`);

console.log(`  CHART_AVAILABILITY — kann der Chart zeichnen? (>= ${CHART_MIN} Bars)`);
console.log(`    ${C.renderable}/${C.denominator} = ${C.CHART_AVAILABILITY_PERCENT} %`);
console.log(`    nicht zeichenbar ${C.notRenderable}\n`);

console.log(`  TECHNICAL_HISTORY_ELIGIBILITY — reicht es fuer Indikatoren? (>= ${TECH_MIN} Bars)`);
console.log(`    ${T.eligible}/${T.denominator} = ${T.TECHNICAL_HISTORY_ELIGIBILITY_PERCENT} %`);
console.log(`    zu kurz ${T.tooShort}\n`);

console.log(`  LANGHISTORIE (>= ${LONG_MIN} Bars) — mit nennerbewusster Eignung`);
console.log(`    ELIGIBLE_FOR_LONG_HISTORY_CHECK  ${L.ELIGIBLE_FOR_LONG_HISTORY_CHECK}`);
console.log(`    PASS                             ${L.PASS}`);
console.log(`    FAIL                             ${L.FAIL}`);
console.log(`    LONG_HISTORY_COVERAGE_PERCENT    ${L.LONG_HISTORY_COVERAGE_PERCENT} %`);
console.log(`    Schwelle ${(MIN_RATE * 100).toFixed(0)} % (${L.thresholdSource}, unveraendert) -> ` +
            `${L.ok ? "PASS" : "FAIL"}`);
console.log("    nicht im Nenner:");
for (const [k, v] of Object.entries(L.notEligibleByReason).sort((a, b) => b[1] - a[1])) {
  console.log(`      ${k.padEnd(28)} ${String(v).padStart(5)}`);
}
console.log(`\n  Zum Vergleich, die alte Einzelkennzahl: ${result.legacy.percent} % ` +
            `(${result.legacy.pass}/${result.legacy.denominator})\n`);

/* ------------------------------------------------------ 4. Schreiben

   Ausgeliefert werden Anzahlen, Datumsgrenzen und Gruende. Kein
   Kursniveau - dieselbe Grenze wie ueberall in diesem Workstream. */
const payload = {
  generatedAt: new Date().toISOString(),
  engine: Coverage.VERSION,
  gate: GATE, provider: PROVIDER, market: MARKET, today: TODAY,
  phase: "POST_BACKFILL_CLEANUP_NO_PRICE_REQUESTS",
  tiingoPriceRequests: 0,
  storageSource: source,
  eligibilitySource, eligibilityCounts: eligCounts,
  ...result,
  redistribution: {
    contains: "Anzahlen, Datumsgrenzen, Gruende",
    doesNotContain: "Kursniveaus, Kerzen, Reihen"
  }
};
/* Lange Listen kuerzen: die Aussage steht in den Zahlen, die Beispiele
   belegen sie. Wer alles braucht, laesst den Lauf mit --index laufen. */
payload.STORAGE_COVERAGE = { ...S, missingSymbols: S.missingSymbols.slice(0, 200) };
payload.CHART_AVAILABILITY = { ...C, notRenderableSymbols: C.notRenderableSymbols.slice(0, 200) };
payload.LONG_HISTORY = { ...L, failSymbols: L.failSymbols.slice(0, 200),
                         failSymbolsTotal: L.failSymbols.length };

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 1));
console.log(`  Geschrieben: ${OUT.replace(root + "/", "")}`);

if (!L.ok) {
  console.log("\n  HINWEIS: Die Langhistorienquote liegt unter der Schwelle. Die Schwelle " +
              "wurde NICHT gesenkt; der Nenner ist jetzt der richtige.");
}
