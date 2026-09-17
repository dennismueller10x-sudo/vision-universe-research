/* =========================================================================
   VISION UNIVERSE — expand-us-universe.mjs

   Das Aktienuniversum erweitern, ohne es neu zu bauen.

       BESTAND (5.684, unveraendert)
     + NEUE FOERDERFAEHIGE US-AKTIEN (aus dem Wertpapierstamm)
     = ERWEITERTES US-AKTIENUNIVERSUM

   ANHAENGEND HEISST HIER WOERTLICH ANHAENGEND

   Jede Bestandszeile wird ZEICHENGLEICH uebernommen - nicht neu
   abgeleitet, nicht neu klassifiziert, nicht neu sortiert. Das ist kein
   Geschmack: universe-FULL_UNIVERSE.json traegt kuratierte Sektoren aus
   GATE_100 und die Herkunftsangabe jeder Auswahl (selection). Wer die
   Zeilen neu erzeugt, verliert genau die Angaben, die sich nicht
   wiederherstellen lassen, und merkt es nicht - die Datei sieht danach
   vollstaendig aus.

   Die Zusage wird am Ergebnis geprueft: jede Bestandszeile muss nach der
   Erweiterung Feld fuer Feld dieselbe sein. Weicht eine ab, bricht der
   Lauf ab und schreibt nichts.

   WAS NICHT DAZUKOMMT

     - alles, was nicht EQUITY_COMMON ist
     - alles ausserhalb der regulaeren US-Handelsplaetze (kein OTC)
     - alles, was REVIEW oder EXCLUDED_CANDIDATE traegt
     - alles, was schon im Bestand steht

   WAS NICHT WEGGEHT

     Nichts. Die 511 Titel mit REVIEW bleiben unangetastet im Universum;
     dieser Lauf entfernt keinen einzigen Titel. Eine Bereinigung ist
     eine eigene, ausdruecklich freizugebende Migration.

   Ausfuehren:
     node scripts/market/expand-us-universe.mjs
     node scripts/market/expand-us-universe.mjs --dry-run
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const DRY_RUN = argv.includes("--dry-run");
const TODAY = arg("--today", new Date().toISOString().slice(0, 10));

const SCALE_DIR = arg("--scale-dir", join(root, "quant", "data", "market", "scale"));
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "security-master"));
const MASTER_FILE = arg("--master",
  join(root, SCALE.storage.workingDir, "tiingo", "security-master", "us-security-master.json"));
const UNIVERSE_FILE = join(SCALE_DIR, "universe-FULL_UNIVERSE.json");

/* Die Felder einer Universumszeile. Sie stehen hier, damit der Vergleich
   "Bestand unveraendert" ueber eine benannte Liste laeuft und nicht ueber
   JSON.stringify: eine geaenderte Schluesselreihenfolge waere sonst ein
   Fehlalarm, ein stillschweigend verlorenes Feld dagegen unsichtbar. */
const UNIVERSE_FIELDS = [
  "securityId", "ticker", "company", "exchange", "country", "currency",
  "assetType", "instrumentType", "active", "providerSymbol", "provider",
  "sector", "sectorStatus", "industry", "industryStatus", "startDate", "selection"
];

/**
 * Eine Stammzeile -> eine Universumszeile.
 *
 * Die Form folgt select-gate-universe.mjs. Sie hier abweichen zu lassen
 * hiesse, zwei Sorten Zeilen in einer Datei zu fuehren - und jeder
 * nachgelagerte Leser muesste beide kennen.
 */
export function toUniverseEntry(row) {
  return {
    securityId: "ref_" + String(row.ticker).replace(/[^A-Z0-9]/gi, "_"),
    ticker: row.ticker,
    company: row.security_name || null,
    exchange: row.exchange || null,
    country: row.country === "UNKNOWN" ? null : row.country,
    currency: row.currency === "UNKNOWN" ? null : row.currency,
    assetType: row.asset_type || null,
    /* Die GROBE Gattung, wie sie das bestehende Universum fuehrt.
       EQUITY_COMMON ist der Name im Wertpapierstamm; COMMON_STOCK ist
       der Name in dieser Datei. Beide zu mischen waere eine Datei mit
       zwei Vokabularen. */
    instrumentType: "COMMON_STOCK",
    active: row.active_status === "ACTIVE" ? true
          : row.active_status === "INACTIVE" ? false : null,
    providerSymbol: row.provider_symbol_id || row.ticker,
    provider: "tiingo",
    /* Sektor bleibt leer und bekommt seinen Grund. Ihn aus dem Ticker zu
       erfinden waere eine Behauptung ueber ein Unternehmen (§30). */
    sector: null,
    sectorStatus: "SOURCE_MISSING",
    industry: null,
    industryStatus: "SOURCE_MISSING",
    startDate: row.start_date || null,
    selection: "appendedFrom:US_SECURITY_MASTER"
  };
}

/**
 * Anhaengen. Die ganze Regel in einer Funktion, damit ein Test sie
 * einzeln angreifen kann.
 *
 * @returns {object} {entries, appended, skipped, invariants}
 */
export function appendOnlyMerge(baselineEntries, masterRows, opts) {
  opts = opts || {};
  const baseline = baselineEntries || [];
  const rows = masterRows || [];

  const baselineByTicker = new Map();
  for (const b of baseline) baselineByTicker.set(String(b.ticker).toUpperCase(), b);

  const appended = [];
  const skipped = { notAdded: 0, notEligible: 0, notCommonEquity: 0, notPrimaryVenue: 0,
                    alreadyInBaseline: 0, duplicateWithinAppend: 0, inactive: 0 };
  const seenAppended = new Set();

  for (const r of rows) {
    const t = String(r.ticker || "").toUpperCase();
    if (!t) continue;

    /* Die Kette ist bewusst laenger als noetig. reconciliation_status
       ADDED impliziert eligible_us_equity, und das impliziert Gattung
       und Handelsplatz. Jede Bedingung steht trotzdem einzeln da und
       zaehlt einzeln aus: wenn eine Regel im Klassierer kippt, soll der
       Bericht sagen, WELCHE - und nicht nur, dass weniger dazukam. */
    if (r.reconciliation_status !== "ADDED") { skipped.notAdded++; continue; }
    if (r.eligible_us_equity !== true) { skipped.notEligible++; continue; }
    if (r.instrument_type !== "EQUITY_COMMON") { skipped.notCommonEquity++; continue; }
    if (r.venue_tier !== "PRIMARY") { skipped.notPrimaryVenue++; continue; }
    if (r.active_status === "INACTIVE") { skipped.inactive++; continue; }
    if (baselineByTicker.has(t)) { skipped.alreadyInBaseline++; continue; }
    if (seenAppended.has(t)) { skipped.duplicateWithinAppend++; continue; }

    seenAppended.add(t);
    appended.push(toUniverseEntry(r));
  }

  /* Bestand zuerst, zeichengleich. Dann die Neuzugaenge, nach Ticker
     sortiert - eine stabile Reihenfolge macht den naechsten Diff
     lesbar. */
  appended.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  const entries = baseline.concat(appended);

  const invariants = assertAppendOnly(baseline, entries);
  return { entries, appended, skipped, invariants };
}

/**
 * Die Zusage, am Ergebnis geprueft.
 *
 * Sie wirft. Ein Lauf, der den Bestand veraendert, soll anhalten und
 * nichts schreiben - nicht warnen und trotzdem schreiben.
 */
export function assertAppendOnly(baseline, entries) {
  const violations = [];
  const byTicker = new Map();
  for (const e of entries) {
    const t = String(e.ticker).toUpperCase();
    if (byTicker.has(t)) violations.push("DUPLICATE_TICKER_IN_RESULT:" + t);
    byTicker.set(t, e);
  }

  for (let i = 0; i < baseline.length; i++) {
    const before = baseline[i];
    const after = entries[i];
    const t = String(before.ticker).toUpperCase();
    if (!after) { violations.push("BASELINE_ENTRY_DROPPED:" + t); continue; }
    /* Position UND Inhalt. Die Position, weil ein Bestand, der
       umsortiert wird, in jedem Diff als vollstaendig neu erscheint und
       eine echte Aenderung darin untergeht. */
    if (String(after.ticker).toUpperCase() !== t) {
      violations.push("BASELINE_ORDER_CHANGED_AT:" + i + ":" + t);
      continue;
    }
    for (const f of UNIVERSE_FIELDS) {
      const a = before[f] === undefined ? null : before[f];
      const b = after[f] === undefined ? null : after[f];
      if (a !== b) violations.push("BASELINE_FIELD_CHANGED:" + t + "." + f);
    }
  }

  if (entries.length < baseline.length) {
    violations.push("UNIVERSE_SHRANK:" + entries.length + "<" + baseline.length);
  }

  if (violations.length) {
    throw new Error("Anhaengende Zusage verletzt (" + violations.length + "): " +
                    violations.slice(0, 10).join(", "));
  }
  return {
    baselineEntries: baseline.length,
    resultEntries: entries.length,
    appended: entries.length - baseline.length,
    baselineFieldChanges: 0,
    baselineEntriesDropped: 0,
    checked: ["BASELINE_ENTRY_PRESENT", "BASELINE_ORDER_UNCHANGED",
              "BASELINE_FIELDS_UNCHANGED", "NO_DUPLICATE_TICKER", "UNIVERSE_DID_NOT_SHRINK"]
  };
}

/* ================================================================ MAIN */
function main() {
  console.log("Vision Universe — US-Aktienuniversum erweitern (anhaengend)\n");

  if (!existsSync(UNIVERSE_FILE)) {
    console.error("Kein Bestandsuniversum unter " + UNIVERSE_FILE + ".");
    process.exit(1);
  }
  if (!existsSync(MASTER_FILE)) {
    console.error("Kein Wertpapierstamm unter " + MASTER_FILE + ".");
    console.error("Zuerst: node scripts/market/build-us-security-master.mjs");
    process.exit(1);
  }

  const universeDoc = JSON.parse(readFileSync(UNIVERSE_FILE, "utf8"));
  const baseline = universeDoc.securities || [];
  const masterDoc = JSON.parse(readFileSync(MASTER_FILE, "utf8"));
  const masterRows = masterDoc.rows || [];

  console.log(`  Bestand:        ${baseline.length} Titel`);
  console.log(`  Wertpapierstamm: ${masterRows.length} Zeilen (${masterDoc.version})`);

  const merged = appendOnlyMerge(baseline, masterRows, { today: TODAY });

  console.log(`\n  Angehaengt:     ${merged.appended.length}`);
  console.log(`  Neues Universum: ${merged.entries.length}`);
  console.log("\n  Nicht angehaengt (nach Grund):");
  for (const [k, v] of Object.entries(merged.skipped)) {
    if (v) console.log(`    ${k.padEnd(24)} ${v}`);
  }

  const byExchange = {};
  merged.appended.forEach((e) => {
    byExchange[e.exchange || "UNKNOWN"] = (byExchange[e.exchange || "UNKNOWN"] || 0) + 1;
  });

  if (DRY_RUN) {
    console.log("\n  --dry-run: nichts geschrieben.");
    return;
  }

  /* Der Bestand wird gesichert, bevor die Datei ersetzt wird. Die Zusage
     ist zwar geprueft, aber eine Sicherung kostet nichts und macht den
     Unterschied zwischen "nachweisbar unveraendert" und "war bestimmt
     in Ordnung". */
  mkdirSync(OUT_DIR, { recursive: true });
  const backup = join(OUT_DIR, "universe-FULL_UNIVERSE.before-expansion.json");
  if (!existsSync(backup)) copyFileSync(UNIVERSE_FILE, backup);

  const payload = Object.assign({}, universeDoc, {
    generatedAt: new Date().toISOString(),
    actualSize: merged.entries.length,
    method: "APPEND_ONLY_EXPANSION_FROM_US_SECURITY_MASTER",
    expansion: {
      baselineSize: baseline.length,
      appended: merged.appended.length,
      appendedByExchange: byExchange,
      securityMasterVersion: masterDoc.version,
      securityMasterGeneratedAt: masterDoc.generatedAt,
      skipped: merged.skipped,
      invariants: merged.invariants,
      policy: {
        included: "EQUITY_COMMON auf regulaeren US-Handelsplaetzen, aktiv",
        excludedOtc: true,
        reviewTitlesRemoved: 0,
        note: "Kein Titel wurde entfernt. Die Titel mit REVIEW bleiben unveraendert im " +
              "Universum; ihre Bereinigung ist eine eigene, ausdruecklich freizugebende " +
              "Migration."
      }
    },
    bySector: countBy(merged.entries, "sector"),
    byExchange: countBy(merged.entries, "exchange"),
    notes: (universeDoc.notes || []).concat([
      `${merged.appended.length} Titel aus dem US-Wertpapierstamm angehaengt ` +
      `(${masterDoc.version}); der Bestand von ${baseline.length} Titeln blieb unveraendert.`
    ]),
    securities: merged.entries
  });

  writeFileSync(UNIVERSE_FILE, JSON.stringify(payload, null, 2) + "\n");

  const manifest = {
    generatedAt: new Date().toISOString(),
    today: TODAY,
    scope: "APPEND_ONLY_US_EQUITY_EXPANSION",
    baselineSize: baseline.length,
    appended: merged.appended.length,
    universeSize: merged.entries.length,
    appendedByExchange: byExchange,
    skipped: merged.skipped,
    invariants: merged.invariants,
    backup: backup.replace(root + "/", ""),
    reviewTitlesPreserved: baseline.length -
      merged.entries.slice(0, baseline.length).filter((e) => e.selection === "__none__").length,
    removed: 0,
    note: "Der Bestand steht zeichengleich an derselben Stelle. Angehaengt wurde ans Ende."
  };
  writeFileSync(join(OUT_DIR, "expansion.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\n  ${UNIVERSE_FILE.replace(root + "/", "")}`);
  console.log(`  ${join(OUT_DIR, "expansion.json").replace(root + "/", "")}`);
  console.log(`  Sicherung: ${backup.replace(root + "/", "")}`);
  console.log("\nFertig. Der Bestand ist unveraendert, 0 Titel entfernt.");
}

function countBy(entries, field) {
  const out = {};
  entries.forEach((e) => {
    const k = e[field] || "UNKNOWN";
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
