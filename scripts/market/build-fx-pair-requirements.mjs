/* =========================================================================
   VISION UNIVERSE — build-fx-pair-requirements.mjs   (Currency Layer, O-3)

   WELCHE WAEHRUNGSPAARE BRAUCHT DIESES UNIVERSUM WIRKLICH?

   Die Antwort steht nicht in einer gepflegten Liste. Sie steht im
   Bestand, und sie aendert sich, sobald ein Titel hinzukommt. Deshalb
   leitet dieses Skript sie ab, statt sie zu fuehren.

   Der Owner-Entscheid O-3 ist an dieser Stelle eindeutig: die 28 im
   SEC-Bestand gefundenen Waehrungen duerfen NICHT als 28 handgepflegte
   Sonderfaelle entstehen. Eine handgepflegte Parallelwelt hat zwei
   Zustaende - veraltet oder gerade gepflegt - und man sieht ihr nicht an,
   in welchem sie ist.

   ZWEI QUELLEN, ZWEI ROLLEN

     Reporting Currency   quant/data/sec/consumer/*.json -> units.*
                          In welcher Waehrung bilanziert das Unternehmen.
     Trading Currency     quant/data/market/discover-series-long/*.json
                          -> currency. In welcher Waehrung notiert der Kurs.

   Sie fallen auseinander, und beide brauchen ein Paar: der Umsatz von SAP
   ist EUR, der ADR-Kurs von SAP ist USD. Wer nur eine Rolle betrachtet,
   baut eine Anzeige, in der die Kennzahl umgerechnet ist und der Kurs
   nicht - oder umgekehrt.

   WAS HERAUSKOMMT

   Eine nach Bedarf sortierte Paarliste mit Anzahl betroffener Titel,
   Rolle und Beispielen. Sie ist Eingabe fuer:

     - scripts/market/probe-tiingo-fx.mjs   (was muss der Zugang koennen)
     - scripts/market/build-fx-history.mjs  (was muss geholt werden)

   Die Architektur bleibt waehrungsagnostisch: dieses Skript kennt keine
   Waehrung namentlich. Es zaehlt, was da ist.

   Ausfuehren:
     node scripts/market/build-fx-pair-requirements.mjs
     node scripts/market/build-fx-pair-requirements.mjs --publish
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Registry = require(join(ROOT, "quant", "engines", "fx", "currency-registry.js"));

const args = new Set(process.argv.slice(2));
const PUBLISH = args.has("--publish");
const OUT = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "fx", "pair-requirements.json")
  : resolve(ROOT, ".market-cache", "currency", "pair-requirements.json");

const CONSUMER_DIR = join(ROOT, "quant", "data", "sec", "consumer");
const SERIES_DIR = join(ROOT, "quant", "data", "market", "discover-series-long");

/* Die Anzeigewaehrungen kommen aus der Registry, nicht aus diesem Skript.
   Kommt CHF dazu, aendert sich hier keine Zeile. */
const DISPLAY = Registry.DISPLAY_CURRENCIES;

/* Die monetaeren Spalten des Consumer-Vertrags. Spalten mit "shares" oder
   ohne Einheit tragen keine Waehrung und werden nicht gezaehlt. */
function monetaryCurrencies(units) {
  const found = new Set();
  for (const [metric, unit] of Object.entries(units || {})) {
    if (typeof unit !== "string") continue;
    if (unit === "shares" || unit === "ratio" || unit === "pct") continue;
    /* "USD" und "USD/shares" tragen beide die Waehrung an erster Stelle. */
    const code = Registry.normalize(unit.split("/")[0]);
    if (code) found.add(code);
  }
  return found;
}

const reporting = new Map();   // code -> { count, examples[] }
const trading = new Map();
let consumerFiles = 0, consumerWithoutCurrency = 0;
let seriesFiles = 0, seriesWithoutCurrency = 0;
const mixedReporters = [];

if (existsSync(CONSUMER_DIR)) {
  for (const file of readdirSync(CONSUMER_DIR)) {
    if (!file.endsWith(".json")) continue;
    consumerFiles++;
    const data = JSON.parse(readFileSync(join(CONSUMER_DIR, file), "utf8"));
    const codes = monetaryCurrencies(data.units);
    if (!codes.size) { consumerWithoutCurrency++; continue; }
    /* Ein Unternehmen mit zwei monetaeren Waehrungen in einem Abschluss
       ist ein Befund, kein Durchschnitt. */
    if (codes.size > 1) {
      mixedReporters.push({ cik: data.cik, name: data.name, currencies: [...codes].sort() });
    }
    for (const code of codes) {
      if (!reporting.has(code)) reporting.set(code, { count: 0, examples: [] });
      const entry = reporting.get(code);
      entry.count++;
      if (entry.examples.length < 5) entry.examples.push((data.tickers || [])[0] || data.name);
    }
  }
}

if (existsSync(SERIES_DIR)) {
  for (const file of readdirSync(SERIES_DIR)) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    seriesFiles++;
    let data;
    try { data = JSON.parse(readFileSync(join(SERIES_DIR, file), "utf8")); } catch { continue; }
    const code = Registry.normalize(data.currency);
    if (!code) { seriesWithoutCurrency++; continue; }
    if (!trading.has(code)) trading.set(code, { count: 0, examples: [] });
    const entry = trading.get(code);
    entry.count++;
    if (entry.examples.length < 5) entry.examples.push(data.ticker || file.replace(/\.json$/, ""));
  }
}

/* Die Paare. Ein Paar entsteht, wenn eine vorkommende Quellwaehrung von
   einer Anzeigewaehrung verschieden ist - der Fast Path braucht keines. */
const pairs = new Map();
function need(from, to, role, count, examples) {
  if (from === to) return;                       // §17: Identitaet, kein Paar
  const key = `${from}/${to}`;
  if (!pairs.has(key)) {
    pairs.set(key, { pair: key, base: from, quote: to, roles: {}, securities: 0, examples: [] });
  }
  const entry = pairs.get(key);
  entry.roles[role] = (entry.roles[role] || 0) + count;
  entry.securities += count;
  for (const ex of examples) if (entry.examples.length < 5 && !entry.examples.includes(ex)) entry.examples.push(ex);
}

for (const to of DISPLAY) {
  for (const [code, info] of reporting) need(code, to, "reporting", info.count, info.examples);
  for (const [code, info] of trading) need(code, to, "trading", info.count, info.examples);
}

const ranked = [...pairs.values()].sort((a, b) => b.securities - a.securities);

/* Die Prioritaet ist eine Folge der Zahlen, keine Meinung. Sie sagt dem
   Ingest, welche Paare zuerst geholt werden, wenn das Kontingent knapp
   ist - nicht, welche Paare "wichtig" sind. */
const total = ranked.reduce((sum, p) => sum + p.securities, 0);
let kumuliert = 0;
for (const p of ranked) {
  kumuliert += p.securities;
  p.shareOfUniverse = total ? p.securities / total : 0;
  p.cumulativeShare = total ? kumuliert / total : 0;
  p.priority = p.cumulativeShare <= 0.95 ? "REQUIRED" : "LONG_TAIL";
}

const report = {
  schema: "vu-fx-pair-requirements-1.0.0",
  generatedAtUtc: new Date().toISOString(),
  note: "Abgeleitet aus dem kanonischen Bestand, nicht gepflegt. Ein neuer Titel mit neuer " +
        "Berichtswaehrung erzeugt beim naechsten Lauf ein neues Paar, ohne dass jemand etwas eintraegt.",
  displayCurrencies: DISPLAY,
  sources: {
    reportingCurrency: {
      path: "quant/data/sec/consumer/*.json -> units",
      files: consumerFiles, withoutCurrency: consumerWithoutCurrency,
      distinctCurrencies: reporting.size
    },
    tradingCurrency: {
      path: "quant/data/market/discover-series-long/*.json -> currency",
      files: seriesFiles, withoutCurrency: seriesWithoutCurrency,
      distinctCurrencies: trading.size
    }
  },
  reportingCurrencies: Object.fromEntries([...reporting].sort((a, b) => b[1].count - a[1].count)),
  tradingCurrencies: Object.fromEntries([...trading].sort((a, b) => b[1].count - a[1].count)),
  mixedReporters: mixedReporters.slice(0, 25),
  mixedReporterCount: mixedReporters.length,
  pairs: ranked,
  /* Die beiden Listen, die andere Skripte tatsaechlich lesen. */
  requiredPairs: ranked.filter((p) => p.priority === "REQUIRED").map((p) => p.pair),
  longTailPairs: ranked.filter((p) => p.priority === "LONG_TAIL").map((p) => p.pair)
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log(`FX-Paarbedarf aus dem Bestand abgeleitet`);
console.log(`  Berichtswaehrungen: ${reporting.size} verschiedene aus ${consumerFiles} Datensaetzen (${consumerWithoutCurrency} ohne Angabe)`);
console.log(`  Handelswaehrungen:  ${trading.size} verschiedene aus ${seriesFiles} Kursreihen (${seriesWithoutCurrency} ohne Angabe)`);
console.log(`  Paare insgesamt:    ${ranked.length} (${report.requiredPairs.length} REQUIRED, ${report.longTailPairs.length} LONG_TAIL)`);
if (mixedReporters.length) {
  console.log(`  Uneinheitliche Abschluesse: ${mixedReporters.length} (mehrere monetaere Waehrungen in einem Datensatz)`);
}
console.log(`\n  Die zehn groessten Paare:`);
for (const p of ranked.slice(0, 10)) {
  console.log(`    ${p.pair.padEnd(9)} ${String(p.securities).padStart(5)} Titel  ${(p.shareOfUniverse * 100).toFixed(1).padStart(5)} %  ${p.priority.padEnd(10)} ${p.examples.slice(0, 3).join(", ")}`);
}
console.log(`\nBericht: ${OUT}`);
