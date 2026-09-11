/* =========================================================================
   VISION UNIVERSE — preflight-zero-cost.mjs

   Die Vorabrechnung. Sie laeuft VOR jedem Schreibvorgang.

     Backfill · Massenupload · Tagesaktualisierung · Wiederherstellung ·
     Neuaufbau des Index

   Sie rechnet aus, was die Operation kostet, vergleicht mit dem Stand
   des Monats und faellt ein Urteil. Bei ZERO_COST_GUARD_BLOCKED wird
   NICHTS geschrieben und NICHTS automatisch fortgesetzt - der
   Eigentuemer entscheidet.

   WARUM DIE RECHNUNG VORHER LAEUFT

   Ein Lauf, der bei Objekt 6.000 merkt, dass er die Freigrenze reisst,
   hat sie schon gerissen. Die einzige Stelle, an der eine Kostenschranke
   wirkt, ist vor dem ersten Byte.

   Ausfuehren:
     node scripts/market/preflight-zero-cost.mjs --operation BACKFILL
     node scripts/market/preflight-zero-cost.mjs --operation DAILY_UPDATE
     node scripts/market/preflight-zero-cost.mjs --operation READ_ONLY
     node scripts/market/preflight-zero-cost.mjs --operation BACKFILL --offline
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));
const Store = require(join(root, "quant", "engines", "history-store.js"));

const argv = process.argv.slice(2);
function arg(n, d = null) { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; }
const OPERATION = (arg("--operation", "BACKFILL") || "BACKFILL").toUpperCase();
const GATE = arg("--gate", "FULL_UNIVERSE");
const PROVIDER = arg("--provider", "tiingo");
const MARKET = arg("--market", "US");
const LOCAL_ROOT = arg("--local-root", null);
/* --offline rechnet ohne den Dienst zu fragen: aus dem Universum und
   den gemessenen Groessen. Fuer die Planung, bevor ein Eimer existiert. */
const OFFLINE = argv.includes("--offline");
const OUT = arg("--out", join(root, "quant", "data", "market", "history", "preflight.json"));

/* Gemessen, nicht geschaetzt: verify-history-store.mjs an fuenf echten
   Reihen. Faellt diese Zahl, ist die ganze Rechnung falsch - deshalb
   steht sie hier und nicht in einer Bemerkung. */
const BYTES_PER_BAR = 40.7;
const AVG_BARS_PER_SYMBOL = 4085;

const KNOWN_OPERATIONS = ["BACKFILL", "BULK_UPLOAD", "DAILY_UPDATE", "RECOVERY",
                          "REINDEX", "READ_ONLY"];
if (!KNOWN_OPERATIONS.includes(OPERATION)) {
  console.error(`Unbekannte Operation '${OPERATION}'. Bekannt: ${KNOWN_OPERATIONS.join(", ")}`);
  process.exit(2);
}

/* --symbols rechnet gegen eine Zielgroesse statt gegen das heutige
   Universum. Gebraucht fuer genau eine Frage: was kostet der Backfill
   NACH der Erweiterung auf 7.800 - bevor die Erweiterung passiert ist. */
const SYMBOL_OVERRIDE = parseInt(arg("--symbols", "0"), 10) || 0;

function universeTickers() {
  const file = join(root, "quant", "data", "market", "scale", `universe-${GATE}.json`);
  const actual = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")).securities || []).map((s) => s.ticker) : [];
  if (!SYMBOL_OVERRIDE) return actual;
  if (SYMBOL_OVERRIDE <= actual.length) return actual.slice(0, SYMBOL_OVERRIDE);
  /* Auffuellen mit Platzhaltern: gezaehlt wird die ANZAHL, und die
     Platzhalter tragen keine Behauptung ueber einen echten Titel. */
  const filled = actual.slice();
  for (let i = actual.length; i < SYMBOL_OVERRIDE; i++) filled.push("__PLANNED_" + i + "__");
  return filled;
}

async function makeStore(budget) {
  if (LOCAL_ROOT) {
    const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
    return Store.createHistoryStore({ driver: createFsDriver(LOCAL_ROOT), provider: PROVIDER,
                                      market: MARKET, budget });
  }
  const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
  return Store.createHistoryStore({ driver: createS3DriverFromEnv(), provider: PROVIDER,
                                    market: MARKET, budget });
}

/**
 * Was kostet die Operation?
 *
 * Jede Zahl hat eine Herkunft. Geraten wird nichts - wo etwas unbekannt
 * ist, steht die konservativere Annahme, weil eine zu niedrige
 * Schaetzung genau den Fall erzeugt, gegen den diese Datei gebaut ist.
 */
function planFor(operation, ctx) {
  const { toFetch, totalSymbols, newSymbols, storedObjects } = ctx;
  switch (operation) {
    case "BACKFILL":
    case "BULK_UPLOAD":
      return {
        kind: operation,
        objectWrites: toFetch,
        /* Vor jedem Schreiben ein HEAD: unveraenderte Titel werden nicht
           neu geschrieben. Der HEAD kostet Class B und spart Class A. */
        objectHeads: toFetch,
        objectReads: toFetch,          /* appendSeries liest die alte Reihe */
        listPages: Math.ceil(Math.max(totalSymbols, 1) / 1000),
        indexWrites: Math.max(1, Math.ceil(toFetch / 100)),
        bytesDelta: Math.round(newSymbols * AVG_BARS_PER_SYMBOL * BYTES_PER_BAR)
      };
    case "DAILY_UPDATE":
      return {
        kind: operation,
        objectWrites: toFetch, objectHeads: toFetch, objectReads: toFetch,
        listPages: 0,                  /* der Index reicht */
        indexWrites: 1,
        /* Ein Handelstag je Titel. Der Zuwachs ist winzig - aber er ist
           nicht null, und ueber einen Monat summiert er sich. */
        bytesDelta: Math.round(toFetch * 1 * BYTES_PER_BAR)
      };
    case "RECOVERY":
      return {
        kind: operation,
        objectWrites: toFetch, objectHeads: storedObjects, objectReads: toFetch,
        listPages: Math.ceil(Math.max(storedObjects, 1) / 1000),
        indexWrites: Math.max(1, Math.ceil(toFetch / 100)),
        bytesDelta: Math.round(newSymbols * AVG_BARS_PER_SYMBOL * BYTES_PER_BAR)
      };
    /* Ein Lauf, der NUR liest: Deckungskennzahlen, Pruefungen,
       Auswertungen. Er schreibt nichts - auch keinen Index. Er
       trotzdem durch die Vorpruefung zu schicken ist kein Ritual: es
       ist die Stelle, an der ein versehentlicher Schreibzugriff
       auffiele, weil objectWrites hier null IST und nicht null sein
       soll. */
    case "READ_ONLY":
      return {
        kind: operation,
        objectWrites: 0, indexWrites: 0,
        objectHeads: 1,                /* der Index selbst */
        objectReads: Math.max(totalSymbols, 1),
        listPages: 0, bytesDelta: 0
      };
    case "REINDEX":
      return {
        kind: operation,
        objectWrites: 0, objectHeads: storedObjects, objectReads: 0,
        listPages: Math.ceil(Math.max(storedObjects, 1) / 1000),
        indexWrites: 1, bytesDelta: 0
      };
    default:
      return { kind: operation };
  }
}

async function main() {
  console.log("Vision Universe — Nullkosten-Vorabrechnung\n");

  const tickers = universeTickers();
  const month = Guard.monthKey();

  let usage = Guard.emptyUsage(month);
  let currentStorageBytes = 0;
  let storedObjects = 0;
  let index = { symbols: {} };
  let measured = false;

  if (!OFFLINE) {
    /* Die Vorabrechnung darf selbst etwas kosten - aber nur wenig, und
       das Wenige ist der Buchfuehrungsvorrat. */
    const probeBudget = Guard.createBudget({
      classAOperations: Guard.BOOKKEEPING_RESERVE.classA,
      classBOperations: Guard.BOOKKEEPING_RESERVE.classB
    });
    try {
      const store = await makeStore(probeBudget);
      usage = await store.readUsage(month);
      const m = await store.measureStorage({ expectedObjects: tickers.length || 1000 });
      currentStorageBytes = m.storageBytes;
      storedObjects = m.objectCount;
      index = await store.readIndex();
      measured = true;
    } catch (err) {
      console.log("  Dienst nicht befragt: " + err.message);
      console.log("  Es wird offline gerechnet - der Bestand gilt als leer.\n");
    }
  }

  const plan = (() => {
    if (OPERATION === "REINDEX") {
      return { toFetch: 0, newSymbols: 0, totalSymbols: tickers.length, storedObjects };
    }
    if (!measured) {
      /* Kein gemessener Bestand: alles ist neu. Die konservative
         Annahme, und die richtige - ein leerer Eimer ist genau das. */
      return { toFetch: tickers.length, newSymbols: tickers.length,
               totalSymbols: tickers.length, storedObjects: 0 };
    }
    const p = Store.createHistoryStore({ driver: { put(){}, get(){}, head(){}, list(){}, kind: "fs" } })
      .planBackfill(tickers, index, { upTo: null });
    const toFetch = OPERATION === "DAILY_UPDATE" ? tickers.length : p.counts.toFetch;
    return { toFetch, newSymbols: p.counts.full, totalSymbols: tickers.length, storedObjects };
  })();

  const estimate = Guard.estimateOperations(planFor(OPERATION, plan));
  const verdict = Guard.evaluate({
    operation: OPERATION, estimate, usage, currentStorageBytes
  });

  console.log(`  Operation:  ${OPERATION}`);
  console.log(`  Universum:  ${plan.totalSymbols} Titel (${GATE})`);
  console.log(`  Im Speicher:${measured ? ` ${storedObjects} Objekte` : " nicht gemessen"}`);
  console.log(`  Zu holen:   ${plan.toFetch} (davon neu: ${plan.newSymbols})\n`);
  console.log(Guard.formatVerdict(verdict));

  console.log("\n  ── Die geforderten Kennzahlen ───────────────");
  console.log(`  CURRENT_STORAGE_BYTES              ${verdict.CURRENT_STORAGE_BYTES.toLocaleString("de-DE")}`);
  console.log(`  PROJECTED_STORAGE_BYTES            ${verdict.PROJECTED_STORAGE_BYTES.toLocaleString("de-DE")}`);
  console.log(`  ESTIMATED_CLASS_A                  ${verdict.ESTIMATED_CLASS_A.toLocaleString("de-DE")}`);
  console.log(`  ESTIMATED_CLASS_B                  ${verdict.ESTIMATED_CLASS_B.toLocaleString("de-DE")}`);
  console.log(`  PROJECTED_FREE_TIER_USAGE_PERCENT  ${verdict.PROJECTED_FREE_TIER_USAGE_PERCENT} %`);

  const report = {
    generatedAt: new Date().toISOString(),
    operation: OPERATION, gate: GATE, provider: PROVIDER, market: MARKET,
    measured, offline: OFFLINE || !measured,
    basis: {
      bytesPerBar: BYTES_PER_BAR, avgBarsPerSymbol: AVG_BARS_PER_SYMBOL,
      source: "verify-history-store.mjs an fuenf echten Tiingo-Reihen; " +
              "Kerzen je Titel aus gate-FULL_UNIVERSE.json"
    },
    plan,
    symbolOverride: SYMBOL_OVERRIDE || null,
    verdict,
    budgetForRun: verdict.verdict === Guard.ALLOWED ? {
      classAOperations: estimate.classAOperations + Guard.BOOKKEEPING_RESERVE.classA,
      classBOperations: estimate.classBOperations + Guard.BOOKKEEPING_RESERVE.classB
    } : null,
    ownerDecisionRequired: verdict.ownerDecisionRequired,
    note: "Keine Kursniveaus in diesem Bericht - nur Anzahlen und Byte-Groessen."
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`\n  ${OUT.replace(root + "/", "")}`);

  if (verdict.verdict === Guard.BLOCKED) {
    console.error("\n" + Guard.BLOCKED);
    console.error("  Ueberschritten:   " + verdict.exceeded.join(", "));
    console.error("  Ausgeloest durch: " + OPERATION);
    console.error("  " + verdict.reason);
    console.error("  Es wurde nichts geschrieben und nichts fortgesetzt.");
    console.error("  OWNER DECISION REQUIRED.");
    process.exit(3);
  }
  console.log("\n  Freigegeben. Der Lauf darf mit genau diesem Budget schreiben.");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
