/* =========================================================================
   VISION UNIVERSE — build-currency-coverage.mjs   (Currency Layer, O-4)

   DIE WAEHRUNG REKONSTRUIEREN - ODER SIE UNKNOWN NENNEN.

   Der Bestand enthaelt Datensaetze ohne Waehrungsangabe. Der erste
   Nachweis zaehlte 854 davon und liess sie stehen. Der Owner-Entscheid
   O-4 sagt, was damit zu tun ist: deterministisch aus vorhandenen
   kanonischen Quellen rekonstruieren, jede Herleitung mit Provenance -
   und wo das nicht geht, UNKNOWN, statt eine Umrechnung vorzutaeuschen.

   DIE KASKADE, UND WARUM SIE IN DIESER REIHENFOLGE STEHT

   1. SOURCE_FIELD        units.revenue
      Die Spalte, die der Consumer-Vertrag fuehrt. Staerkster Beleg.

   2. DERIVED_SIBLING_UNIT jede andere monetaere Spalte desselben Datensatzes
      Eine Bank ohne Umsatzzeile fuehrt trotzdem net_income, total_assets
      und cash_and_equivalents - alle in derselben Waehrung. Das ist keine
      Schaetzung, sondern dieselbe Angabe an einer anderen Stelle.
      Bedingung: ALLE monetaeren Spalten muessen uebereinstimmen. Zwei
      verschiedene Waehrungen im selben Abschluss ergeben UNKNOWN, nicht
      die haeufigere.

   3. DERIVED_XBRL_FACTS   quant/data/sec/canonical/<TICKER>.json -> fact.currency
      Die Einheiten der XBRL-Facts selbst. Eine Ebene tiefer als der
      Consumer-Vertrag und damit die Quelle, aus der dessen units
      ueberhaupt entstehen.

   4. UNKNOWN
      Kein Beleg. Der Wert wird angezeigt, aber nicht umgerechnet.

   WAS AUSDRUECKLICH NICHT IN DER KASKADE STEHT

   Der Unternehmenssitz. Die Boerse. Das Land. Und - der verfuehrerischste
   Fehlgriff - die HANDELSWAEHRUNG aus der Kursreihe. Sie liegt fuer jeden
   dieser Titel vor und waere sofort verfuegbar. Sie beantwortet nur eine
   andere Frage: SAP notiert als ADR in USD und bilanziert in EUR. Wer die
   Handelswaehrung als Berichtswaehrung einsetzt, rechnet SAPs Umsatz von
   EUR nach EUR und laesst ihn damit um den Wechselkurs falsch stehen -
   ohne dass irgendetwas nach einem Fehler aussieht.

   Ausfuehren:
     node scripts/market/build-currency-coverage.mjs
     node scripts/market/build-currency-coverage.mjs --publish
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
  ? resolve(ROOT, "quant", "data", "market", "fx", "currency-coverage.json")
  : resolve(ROOT, ".market-cache", "currency", "currency-coverage.json");

const CONSUMER_DIR = join(ROOT, "quant", "data", "sec", "consumer");
const CANONICAL_DIR = join(ROOT, "quant", "data", "sec", "canonical");

const NON_MONETARY_UNITS = new Set(["shares", "ratio", "pct", "count", "count_m", ""]);

function monetaryUnitCurrencies(units) {
  const byMetric = {};
  for (const [metric, unit] of Object.entries(units || {})) {
    if (typeof unit !== "string" || NON_MONETARY_UNITS.has(unit)) continue;
    const code = Registry.normalize(unit.split("/")[0]);
    if (code) byMetric[metric] = code;
  }
  return byMetric;
}

/* Stufe 3 liest die kanonischen XBRL-Facts. Sie liegen nach Ticker, der
   Consumer-Vertrag nach CIK - die Bruecke sind die tickers im Datensatz. */
function canonicalCurrency(tickers) {
  for (const ticker of tickers || []) {
    const file = join(CANONICAL_DIR, `${ticker}.json`);
    if (!existsSync(file)) continue;
    let data;
    try { data = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    const seen = new Set();
    for (const fact of data.facts || []) {
      const unit = fact.unit || "";
      if (NON_MONETARY_UNITS.has(unit)) continue;
      const code = Registry.normalize(fact.currency);
      if (code) seen.add(code);
    }
    if (seen.size === 1) return { currency: [...seen][0], ticker, distinct: 1 };
    if (seen.size > 1) return { currency: null, ticker, distinct: seen.size, codes: [...seen].sort() };
  }
  return null;
}

const buckets = {
  KNOWN_NATIVE_CURRENCY: [],
  DERIVED_NATIVE_CURRENCY: [],
  UNKNOWN_NATIVE_CURRENCY: []
};
const byProvenance = {};
const distribution = {};
const conflicts = [];

let files = 0;
if (!existsSync(CONSUMER_DIR)) {
  console.error(`Kein Consumer-Verzeichnis unter ${CONSUMER_DIR}.`);
  process.exit(1);
}

for (const file of readdirSync(CONSUMER_DIR)) {
  if (!file.endsWith(".json")) continue;
  files++;
  const data = JSON.parse(readFileSync(join(CONSUMER_DIR, file), "utf8"));
  const identity = {
    cik: data.cik,
    name: data.name,
    ticker: (data.tickers || [])[0] || null
  };

  const byMetric = monetaryUnitCurrencies(data.units);
  const codes = [...new Set(Object.values(byMetric))];

  /* Stufe 1 */
  const direct = Registry.normalize(data.units && data.units.revenue);
  if (direct && codes.length === 1) {
    record("KNOWN_NATIVE_CURRENCY", "SOURCE_FIELD_UNITS_REVENUE", direct, identity,
      `units.revenue = ${direct}; alle ${Object.keys(byMetric).length} monetaeren Spalten stimmen ueberein.`);
    continue;
  }

  /* Ein Abschluss mit zwei monetaeren Waehrungen ist ein Befund. Es wird
     keine Mehrheitswaehrung gewaehlt - jeder Fact rechnet mit seiner
     eigenen, und der Fall gehoert auf den Tisch. */
  if (codes.length > 1) {
    conflicts.push({ ...identity, currencies: codes.sort(), byMetric });
    record("UNKNOWN_NATIVE_CURRENCY", "CONFLICTING_UNITS", null, identity,
      `Mehrere monetaere Waehrungen im selben Datensatz: ${codes.sort().join(", ")}. ` +
      "Keine Mehrheitsentscheidung; die Werte behalten ihre je eigene Waehrung.");
    continue;
  }

  if (direct) {
    record("KNOWN_NATIVE_CURRENCY", "SOURCE_FIELD_UNITS_REVENUE", direct, identity,
      `units.revenue = ${direct}.`);
    continue;
  }

  /* Stufe 2 */
  if (codes.length === 1) {
    const metrics = Object.keys(byMetric);
    record("DERIVED_NATIVE_CURRENCY", "DERIVED_SIBLING_UNIT", codes[0], identity,
      `Keine Umsatzzeile; ${metrics.length} andere monetaere Spalten fuehren einheitlich ${codes[0]} ` +
      `(${metrics.slice(0, 3).join(", ")}${metrics.length > 3 ? ", …" : ""}).`);
    continue;
  }

  /* Stufe 3 */
  const canonical = canonicalCurrency(data.tickers);
  if (canonical && canonical.currency) {
    record("DERIVED_NATIVE_CURRENCY", "DERIVED_XBRL_FACTS", canonical.currency, identity,
      `Keine monetaere Spalte im Consumer-Vertrag; die kanonischen XBRL-Facts ` +
      `(${canonical.ticker}.json) fuehren einheitlich ${canonical.currency}.`);
    continue;
  }
  if (canonical && canonical.distinct > 1) {
    conflicts.push({ ...identity, currencies: canonical.codes, source: "xbrl_facts" });
    record("UNKNOWN_NATIVE_CURRENCY", "CONFLICTING_XBRL_FACTS", null, identity,
      `Die kanonischen Facts fuehren ${canonical.codes.join(", ")}. Keine Mehrheitsentscheidung.`);
    continue;
  }

  /* Stufe 4 */
  record("UNKNOWN_NATIVE_CURRENCY", "NO_MONETARY_EVIDENCE", null, identity,
    "Weder der Consumer-Vertrag noch die kanonischen Facts fuehren einen monetaeren Wert mit Waehrung. " +
    "Es wird nichts abgeleitet - insbesondere nicht aus Sitz, Boerse oder Handelswaehrung.");
}

function record(bucket, provenance, currency, identity, note) {
  const entry = { ...identity, currency, provenance, note };
  buckets[bucket].push(entry);
  byProvenance[provenance] = (byProvenance[provenance] || 0) + 1;
  if (currency) distribution[currency] = (distribution[currency] || 0) + 1;
}

const counts = {
  total: files,
  KNOWN_NATIVE_CURRENCY: buckets.KNOWN_NATIVE_CURRENCY.length,
  DERIVED_NATIVE_CURRENCY: buckets.DERIVED_NATIVE_CURRENCY.length,
  UNKNOWN_NATIVE_CURRENCY: buckets.UNKNOWN_NATIVE_CURRENCY.length
};
counts.resolvedShare = files ? (counts.KNOWN_NATIVE_CURRENCY + counts.DERIVED_NATIVE_CURRENCY) / files : 0;

const report = {
  schema: "vu-currency-coverage-1.0.0",
  generatedAtUtc: new Date().toISOString(),
  note: "Jede Waehrung ist belegt oder UNKNOWN. Es wird nichts aus Sitz, Boerse oder Handelswaehrung " +
        "abgeleitet: die Handelswaehrung beantwortet eine andere Frage als die Berichtswaehrung.",
  cascade: [
    { level: 1, provenance: "SOURCE_FIELD_UNITS_REVENUE", source: "consumer units.revenue" },
    { level: 2, provenance: "DERIVED_SIBLING_UNIT", source: "andere monetaere Spalte desselben Datensatzes, alle einheitlich" },
    { level: 3, provenance: "DERIVED_XBRL_FACTS", source: "quant/data/sec/canonical/<TICKER>.json -> fact.currency" },
    { level: 4, provenance: "NO_MONETARY_EVIDENCE", source: "kein Beleg -> UNKNOWN" }
  ],
  counts,
  byProvenance,
  currencyDistribution: Object.fromEntries(Object.entries(distribution).sort((a, b) => b[1] - a[1])),
  conflictCount: conflicts.length,
  conflicts: conflicts.slice(0, 25),
  examples: {
    KNOWN_NATIVE_CURRENCY: buckets.KNOWN_NATIVE_CURRENCY.filter((e) => e.currency !== "USD").slice(0, 10),
    DERIVED_NATIVE_CURRENCY: buckets.DERIVED_NATIVE_CURRENCY.slice(0, 10),
    UNKNOWN_NATIVE_CURRENCY: buckets.UNKNOWN_NATIVE_CURRENCY.slice(0, 10)
  },
  /* Die vollstaendige Zuordnung CIK -> Waehrung. Das ist der Teil, den
     andere Skripte lesen: eine Rekonstruktion, die nur im Bericht steht
     und nicht abfragbar ist, hat nichts rekonstruiert. */
  resolved: Object.fromEntries(
    [...buckets.KNOWN_NATIVE_CURRENCY, ...buckets.DERIVED_NATIVE_CURRENCY]
      .map((e) => [e.cik, { currency: e.currency, provenance: e.provenance }])),
  unresolved: buckets.UNKNOWN_NATIVE_CURRENCY.map((e) => ({ cik: e.cik, ticker: e.ticker, provenance: e.provenance }))
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log("WAEHRUNGSABDECKUNG DES SEC-BESTANDS\n");
console.log(`  Datensaetze insgesamt        ${counts.total}`);
console.log(`  KNOWN_NATIVE_CURRENCY       ${counts.KNOWN_NATIVE_CURRENCY}`);
console.log(`  DERIVED_NATIVE_CURRENCY     ${counts.DERIVED_NATIVE_CURRENCY}`);
console.log(`  UNKNOWN_NATIVE_CURRENCY     ${counts.UNKNOWN_NATIVE_CURRENCY}`);
console.log(`  aufgeloest                  ${(counts.resolvedShare * 100).toFixed(1)} %\n`);
console.log("  Je Herleitung:");
for (const [prov, n] of Object.entries(byProvenance).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${prov.padEnd(30)} ${String(n).padStart(5)}`);
}
if (conflicts.length) {
  console.log(`\n  Uneinheitliche Abschluesse: ${conflicts.length}`);
  for (const c of conflicts.slice(0, 5)) {
    console.log(`    ${(c.ticker || c.cik).padEnd(10)} ${c.currencies.join(", ").padEnd(14)} ${c.name}`);
  }
}
console.log(`\nBericht: ${OUT}`);
