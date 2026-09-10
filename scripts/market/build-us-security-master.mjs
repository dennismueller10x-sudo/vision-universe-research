/* =========================================================================
   VISION UNIVERSE — build-us-security-master.mjs

   Entdeckung und Abgleich des US-Aktienuniversums bei Tiingo.

   Dieser Lauf holt KEINE Kurse und laeuft KEINEN Backfill. Er stellt
   genau eine Frage und beantwortet sie mit Zahlen:

     Wie viele echte US-Aktien fuehrt Tiingo, und welche davon fehlen im
     gelieferten Bestand?

   NICHT-DESTRUKTIV, UND ZWAR NACHPRUEFBAR

   Das Skript schreibt in keinen der bestehenden Pfade. Es liest
   quant/data/market/scale/universe-FULL_UNIVERSE.json und ruehrt sie
   nicht an; es schreibt ausschliesslich nach
   quant/data/market/security-master/ und in die Arbeitsablage. Der
   Engine-Aufruf prueft am Ergebnis, dass kein Bestandstitel fehlt, und
   wirft, wenn doch - ein Lauf, der den Bestand verkleinert, soll
   abbrechen und nicht liefern.

   WO WAS LANDET

     Arbeitsablage (.market-cache, gitignored)
       Der vollstaendige Stamm ueber alle Anbieterzeilen. Er ist
       Anbieterinhalt in Rohform; ihn auszuliefern waere Redistribution
       und ist nicht freigegeben (dieselbe Grenze wie in
       build-market-universe.mjs).

     Repository (quant/data/market/security-master/)
       Der Abgleich: Zahlen, Aufteilungen, Befunde - und die Zeilen der
       Titel, die ohnehin schon oeffentlich im Bestand stehen. Kein
       Kursniveau, keine neue Tickerliste.

   Ausfuehren:
     node scripts/market/build-us-security-master.mjs                 # laedt vom Anbieter
     node scripts/market/build-us-security-master.mjs --from-zip <p>
     node scripts/market/build-us-security-master.mjs --from-csv <p>
     node scripts/market/build-us-security-master.mjs --from-universe <p>
     node scripts/market/build-us-security-master.mjs --offline        # nur Bestand
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const { parseCsv } = await import(join(root, "scripts", "market", "build-market-universe.mjs"));

const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const TICKERS_URL = "https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip";

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
function flag(name) { return argv.indexOf(name) >= 0; }

const FROM_CSV = arg("--from-csv");
const FROM_ZIP = arg("--from-zip");
const FROM_UNIVERSE = arg("--from-universe");
const OFFLINE = flag("--offline");
/* Die vollstaendige Stammliste in ein oeffentliches Artefakt zu
   schreiben ist eine Lizenzentscheidung und keine Bequemlichkeit.
   Deshalb ein Schalter, der standardmaessig aus ist. */
const INCLUDE_NEW_TICKERS = flag("--include-new-tickers");
const TODAY = arg("--today", new Date().toISOString().slice(0, 10));

const BASELINE_FILE = arg("--baseline",
  join(root, "quant", "data", "market", "scale", "universe-FULL_UNIVERSE.json"));
const PROVIDER_SUMMARY_FILE = arg("--provider-summary",
  join(root, "quant", "data", "market", "universe", "summary.json"));
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "security-master"));
const WORK_DIR = arg("--work-dir",
  join(root, SCALE.storage.workingDir, "tiingo", "security-master"));

/* ------------------------------------------------------------ ZIP/CSV

   Der ZIP-Leser aus build-market-universe.mjs wird bewusst nicht
   importiert: er ist dort nicht exportiert, und ihn zu exportieren waere
   eine Aenderung an einer Datei, die den bestehenden Bestand auswaehlt.
   Dreissig Zeilen doppelt sind hier der kleinere Eingriff. */
import { inflateRawSync } from "node:zlib";
function readSingleFileFromZip(buffer) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 65558; i--) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Kein ZIP-Endverzeichnis gefunden.");
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Beschaedigtes ZIP-Verzeichnis.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLen);
    if (name.toLowerCase().endsWith(".csv")) {
      const lNameLen = buffer.readUInt16LE(localOffset + 26);
      const lExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return { name, text: data.toString("utf8") };
      if (method === 8) return { name, text: inflateRawSync(data).toString("utf8") };
      throw new Error("Unbekanntes Kompressionsverfahren " + method + ".");
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("Keine CSV im Archiv.");
}

/** Anbieterzeilen beschaffen. Gibt {rows, source} oder wirft. */
async function loadProviderRows() {
  if (OFFLINE) throw new Error("--offline: die Anbieterliste wird ausdruecklich nicht erhoben.");

  if (FROM_UNIVERSE) {
    const u = JSON.parse(readFileSync(FROM_UNIVERSE, "utf8"));
    const rows = (u.entries || []).map((e) => ({
      ticker: e.ticker, exchange: e.exchange, assetType: e.assetType,
      currency: e.currency, startDate: e.startDate, endDate: e.endDate,
      name: e.company || null
    }));
    return { rows, source: { kind: "localUniverseJson", path: FROM_UNIVERSE,
                             generatedAt: u.generatedAt || null, fetchedAt: null } };
  }

  let text, source;
  if (FROM_CSV) {
    text = readFileSync(FROM_CSV, "utf8");
    source = { kind: "localCsv", path: FROM_CSV, fetchedAt: null };
  } else if (FROM_ZIP) {
    const entry = readSingleFileFromZip(readFileSync(FROM_ZIP));
    text = entry.text;
    source = { kind: "localZip", path: FROM_ZIP, entry: entry.name, fetchedAt: null };
  } else {
    const started = Date.now();
    const headers = {};
    if (process.env.TIINGO_API_KEY) headers.Authorization = "Token " + process.env.TIINGO_API_KEY;
    const res = await fetch(TICKERS_URL, { headers });
    if (!res.ok) throw new Error("Tickerliste nicht abrufbar: HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const entry = readSingleFileFromZip(buf);
    text = entry.text;
    source = { kind: "providerDownload", url: TICKERS_URL, entry: entry.name,
               bytes: buf.length, latencyMs: Date.now() - started,
               fetchedAt: new Date().toISOString() };
  }

  const { header, rows } = parseCsv(text);
  source.columns = header;
  return {
    rows: rows.map((r) => ({
      ticker: r.ticker, exchange: r.exchange, assetType: r.assetType,
      currency: r.priceCurrency || r.currency, startDate: r.startDate,
      endDate: r.endDate, name: r.name || null
    })),
    source
  };
}

/* ---------------------------------------------------- ANBIETERBILANZ

   Wenn die Liste selbst nicht erhoben werden kann, bleibt die bereits
   committete Bilanz aus build-market-universe.mjs. Sie traegt Zahlen
   ueber 108.573 Zeilen, aber keine Zeile - daraus lassen sich einige
   Groessen ABLEITEN und andere nicht. Was abgeleitet ist, traegt hier
   sein Etikett; wer es als Messung liest, liest falsch. */
function providerAggregateFromSummary() {
  if (!existsSync(PROVIDER_SUMMARY_FILE)) return null;
  const s = JSON.parse(readFileSync(PROVIDER_SUMMARY_FILE, "utf8"));
  if (!s || s.status !== "OK" || !s.totals) return null;

  const byExch = s.totals.screenerEligibleByExchange || {};
  const primary = Object.keys(Master.US_PRIMARY_EXCHANGES);
  let eligiblePrimary = 0;
  const eligiblePrimaryByExchange = {};
  for (const ex of primary) {
    if (byExch[ex] !== undefined) {
      eligiblePrimary += byExch[ex];
      eligiblePrimaryByExchange[ex] = byExch[ex];
    }
  }
  return {
    basis: "COMMITTED_SUMMARY_AGGREGATE",
    file: PROVIDER_SUMMARY_FILE.replace(root + "/", ""),
    generatedAt: s.generatedAt,
    classificationVersion: s.classificationVersion,
    note: "Abgeleitet aus der committeten Bilanz des Anbieterlaufs, nicht aus der Liste " +
          "selbst. Die Bilanz zaehlt in der GROBEN Gattungsliste von " +
          (s.classificationVersion || "instrument-classification") + " - Vorzuege in " +
          "dreiteiliger Schreibweise, ADR, REIT, SPAC und Trusts sind dort NICHT getrennt. " +
          "Die Zahlen sind Obergrenzen fuer COMMON_STOCK und Untergrenzen fuer alles andere.",
    rawProviderRows: s.totals.rows ?? null,
    screenerEligible: s.totals.screenerEligible ?? null,
    screenerEligibleByExchange: byExch,
    usPrimaryExchangeEligible: eligiblePrimary,
    usPrimaryExchangeEligibleByExchange: eligiblePrimaryByExchange,
    byInstrumentTypeCoarse: s.totals.byInstrumentType || null,
    byCurrency: s.totals.byCurrency || null,
    activeTrue: s.totals.activeTrue ?? null,
    activeFalse: s.totals.activeFalse ?? null,
    otcEligible: s.totals.otc ?? null,
    nonOtcEligible: s.totals.nonOtc ?? null
  };
}

/* ------------------------------------------------------- BACKFILL (§10)

   Die Schaetzung wird nicht getippt. Sie wird aus dem letzten echten
   Lauf gerechnet: gate-FULL_UNIVERSE.json traegt Anfragen, Laufzeit,
   empfangene Bytes und belegten Speicher fuer 5.684 Titel. Wer eine
   Zahl aus diesem Abschnitt anzweifelt, kann sie dort nachlesen. */
function backfillEstimate(newSymbols, staleSymbols) {
  const gateFile = join(root, "quant", "data", "market", "scale", "gate-FULL_UNIVERSE.json");
  const factorsFile = join(root, "quant", "data", "market", "factors",
                           "factors-FULL_UNIVERSE-summary.json");
  if (!existsSync(gateFile)) {
    return { status: "UNAVAILABLE", reason: "Kein Referenzlauf unter " + gateFile };
  }
  const g = JSON.parse(readFileSync(gateFile, "utf8"));
  const a = g.accounting || {};
  const ref = a.requested || 0;
  if (!ref) return { status: "UNAVAILABLE", reason: "Referenzlauf ohne Titelzahl." };

  const requestsPerSymbol = (a.requests || 0) / ref;
  const secondsPerSymbol = (g.run?.runtimeMs || 0) / 1000 / ref;
  const bytesPerSymbol = (a.bytesReceived || 0) / ref;
  const storagePerSymbol = (a.storageBytes || 0) / ref;

  let factorMsPerSymbol = null;
  if (existsSync(factorsFile)) {
    const f = JSON.parse(readFileSync(factorsFile, "utf8"));
    if (f.run?.runtimeMs && f.coverage?.requested) {
      factorMsPerSymbol = f.run.runtimeMs / f.coverage.requested;
    }
  }

  const total = newSymbols + staleSymbols;
  const budgetPerHour = a.requestBudget?.requestsPerHour ?? null;
  const observedLowerBound = a.providerObserved?.highestRequestsInThisRun ?? null;

  return {
    status: "ESTIMATED_FROM_LAST_FULL_RUN",
    referenceRun: {
      file: "quant/data/market/scale/gate-FULL_UNIVERSE.json",
      runId: g.run?.runId || null,
      symbols: ref,
      requests: a.requests ?? null,
      runtimeMs: g.run?.runtimeMs ?? null,
      bytesReceived: a.bytesReceived ?? null,
      storageBytes: a.storageBytes ?? null
    },
    perSymbol: {
      requests: round(requestsPerSymbol, 4),
      seconds: round(secondsPerSymbol, 3),
      bytesReceived: Math.round(bytesPerSymbol),
      storageBytes: Math.round(storagePerSymbol),
      factorRuntimeMs: factorMsPerSymbol === null ? null : round(factorMsPerSymbol, 2)
    },
    incremental: {
      newSymbols, staleSymbols, symbolsToFetch: total,
      estimatedRequests: Math.ceil(total * requestsPerSymbol),
      estimatedRuntimeMinutes: round(total * secondsPerSymbol / 60, 1),
      estimatedDownloadMB: round(total * bytesPerSymbol / 1048576, 1),
      estimatedAdditionalStorageMB: round(total * storagePerSymbol / 1048576, 1),
      estimatedFactorRuntimeSeconds:
        factorMsPerSymbol === null ? null : round(total * factorMsPerSymbol / 1000, 1),
      fitsInOneHourBudget: budgetPerHour === null
        ? "UNKNOWN"
        : Math.ceil(total * requestsPerSymbol) <= budgetPerHour,
      requestBudgetPerHour: budgetPerHour,
      providerObservedLowerBoundPerRun: observedLowerBound
    },
    fullRerun: {
      symbols: ref + total,
      estimatedRequests: Math.ceil((ref + total) * requestsPerSymbol),
      estimatedRuntimeMinutes: round((ref + total) * secondsPerSymbol / 60, 1),
      estimatedDownloadMB: round((ref + total) * bytesPerSymbol / 1048576, 1),
      necessary: false,
      reason: "Die vorhandenen Historien liegen in der Arbeitsablage und sind nach Titel " +
              "getrennt. Ein Titel, der sich nicht geaendert hat, liefert dieselbe Reihe " +
              "noch einmal - das ist kein Gewinn, sondern derselbe Verkehr."
    },
    reuse: {
      existingHistoriesReusable: true,
      note: "gate-FULL_UNIVERSE.json meldet resumable.status COMPLETE fuer 5.684 Titel; die " +
            "Reihen stehen je Titel in .market-cache. Neue Titel koennen einzeln dazukommen.",
      incrementalPossible: true,
      staleDefinition: "Ein Titel gilt als stale, wenn seine letzte Kerze aelter ist als die " +
                       "im Gate gemessene Schwelle (maxStaleTradingDays) - nicht, weil ein " +
                       "Lauf alt ist."
    },
    aggregatesToRebuild: AGGREGATES_TO_REBUILD
  };
}

/* §11: was bei einer Universumserweiterung neu entstehen MUSS - und was
   nicht. Die Trennung ist der ganze Punkt der Anhaeng-Strategie. */
const AGGREGATES_TO_REBUILD = {
  mustRebuild: [
    { path: "quant/data/market/scale/universe-FULL_UNIVERSE.json",
      why: "Die Mitgliederliste selbst." },
    { path: "quant/data/market/scale/gate-FULL_UNIVERSE.json",
      why: "Bilanz ueber genau diese Mitglieder (accounting, dataQuality, historyCoverage)." },
    { path: "quant/data/market/factors/factors-FULL_UNIVERSE-summary.json",
      why: "coverage/fieldCoverage zaehlen ueber die Mitglieder." },
    { path: "quant/data/market/factors/screener-FULL_UNIVERSE.json",
      why: "Jede Screenerfrage traegt Treffer/Nichttreffer/unentscheidbar ueber die Mitglieder." },
    { path: "quant/data/market/health/universe-quality-FULL_UNIVERSE.json",
      why: "Pruefungen, die erst ueber viele Titel sichtbar werden." },
    { path: "quant/data/market/health/health.json",
      why: "Liest die Bilanzen oben." },
    { path: "quant/data/market/universe/summary.json",
      why: "Bilanz ueber die Anbieterliste - aendert sich mit jedem Anbieterstand." }
  ],
  mustNotRebuild: [
    { path: ".market-cache/tiingo/**/<ticker>.json",
      why: "Kursreihen je Titel. Unveraendert gueltig; neu zu holen waere derselbe Verkehr." },
    { path: "quant/data/market/scale/universe-GATE_100/500/2000.json",
      why: "Kleinere Gates sind geschachtelt und bleiben, wie sie gelaufen sind. Ein Gate " +
           "nachtraeglich zu vergroessern zerstoert den Vergleich, fuer den es da ist." },
    { path: "quant/data/market/factors/factors-GATE_*.json",
      why: "Gehoeren zu ihrem Gate und zu seinem Lauf." },
    { path: "quant/data/market/commercial/**",
      why: "Faehigkeits- und Stromnachweise haengen am Zugang, nicht am Universum." },
    { path: "quant/data/technical/**",
      why: "Technical-Artefakte sind je Instrument; neue Instrumente kommen dazu." },
    { path: "quant/data/sec/**",
      why: "Anderer Anbieter, anderer Lauf." }
  ]
};

/**
 * Schreibt die Stammtabelle: Kopf lesbar eingerueckt, EINE ZEILE JE
 * WERTPAPIER.
 *
 * Der Grund ist der Diff. Eingerueckt braucht eine Zeile 37 Zeilen im
 * Diff, und eine Aenderung an einem Titel sieht aus wie eine Aenderung
 * an der Datei. Eine Zeile je Titel macht aus "was hat sich am Stamm
 * geaendert?" eine Frage, die `git diff` beantwortet. Die Datei bleibt
 * gueltiges JSON - sie ist nur anders umgebrochen.
 */
function writeMaster(file, header, rows) {
  const head = JSON.stringify(header, null, 2);
  const body = rows.map((r) => "    " + JSON.stringify(r)).join(",\n");
  writeFileSync(file, head.slice(0, -2) + ",\n  \"rows\": [\n" + body + "\n  ]\n}\n");
}

function round(v, digits) {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

/* ================================================================ MAIN */
async function main() {
  console.log("Vision Universe — US-Wertpapierstamm: Entdeckung und Abgleich\n");

  if (!existsSync(BASELINE_FILE)) {
    console.error("Kein Bestand unter " + BASELINE_FILE + ".");
    process.exit(1);
  }
  const baselineDoc = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const baseline = baselineDoc.securities || [];
  console.log(`  Bestand:  ${baseline.length} Titel aus ${BASELINE_FILE.replace(root + "/", "")}`);

  let providerRows = [], providerSource = null, providerError = null;
  try {
    const loaded = await loadProviderRows();
    providerRows = loaded.rows;
    providerSource = loaded.source;
    console.log(`  Anbieter: ${providerRows.length} Zeilen (${providerSource.kind})`);
  } catch (err) {
    providerError = err.message;
    console.log(`  Anbieter: NICHT ERHOBEN - ${err.message}`);
  }

  const stamp = new Date().toISOString();
  const result = Master.buildSecurityMaster({
    providerRows, baseline, today: TODAY,
    providerAvailable: providerRows.length > 0, stamp
  });

  const c = result.counts;
  const newEligible = result.rows.filter((r) => r.reconciliation_status === "ADDED");
  const reviewExisting = result.rows.filter(
    (r) => r.baseline_member && r.reconciliation_status === "REVIEW");
  const excludedNew = result.rows.filter(
    (r) => r.reconciliation_status === "EXCLUDED_CANDIDATE");
  const reviewNew = result.rows.filter(
    (r) => !r.baseline_member && r.reconciliation_status === "REVIEW");

  /* --------------------------------------- Der Berichtsblock aus §9/§14 */
  const providerAggregate = result.providerAvailable ? null : providerAggregateFromSummary();
  /* Die Differenz muss GLEICHES mit GLEICHEM vergleichen: die Bilanz
     zaehlt screenerfaehige Zeilen auf US-Regelplaetzen, also gehoert auf
     die andere Seite die Zahl der Bestandstitel AUF EBEN DIESEN
     PLAETZEN - nicht der ganze Bestand. Der Unterschied ist genau ein
     Titel (EFOR auf EXPM), und genau solche Ein-Titel-Unterschiede
     machen eine Tabelle unbrauchbar, die sich nicht mehr aufaddiert. */
  const baselineOnPrimaryVenues = result.rows.filter(
    (r) => r.baseline_member && r.venue_tier === "PRIMARY").length;
  const headline = {
    BASELINE_COUNT: baseline.length,
    RAW_US_PROVIDER_CANDIDATES: result.providerAvailable
      ? providerRows.length
      : { status: "NOT_FETCHED_THIS_RUN", derivedFromCommittedSummary:
          providerAggregate ? providerAggregate.rawProviderRows : null },
    MATCHED_EXISTING: c.byReconciliationStatus.EXISTING,
    NEW_ELIGIBLE_ADDITIONS: result.providerAvailable
      ? newEligible.length
      : { status: "NOT_MEASURABLE_WITHOUT_PROVIDER_LIST",
          /* Die Differenz zwischen den auf US-Regelplaetzen als
             screenerfaehig gezaehlten Zeilen und dem Bestand. Sie ist
             AUSDRUECKLICH KEINE Untergrenze fuer echte Neuzugaenge: die
             committete Bilanz zaehlt in der groben Gattungsliste, in
             der Vorzuege in dreiteiliger Schreibweise und
             Optionsscheine als Stammaktie mitlaufen. Die Zahl der
             tatsaechlichen Neuzugaenge liegt DARUNTER. */
          estimatedGapFromCommittedSummary:
            providerAggregate
              ? Math.max(0, providerAggregate.usPrimaryExchangeEligible - baselineOnPrimaryVenues)
              : null,
          gapBasis: "COARSE_CLASSIFIER_UPPER_BOUND",
          gapComparison: {
            providerEligibleOnUsPrimaryVenues:
              providerAggregate ? providerAggregate.usPrimaryExchangeEligible : null,
            baselineOnUsPrimaryVenues: baselineOnPrimaryVenues,
            baselineElsewhere: baseline.length - baselineOnPrimaryVenues
          },
          gapNote: "Obergrenze. Die feine Klassifikation zieht davon Vorzuege, " +
                   "Optionsscheine, Units und Bezugsrechte ab." },
    REVIEW_EXISTING: reviewExisting.length,
    EXCLUDED_NEW_CANDIDATES: result.providerAvailable
      ? excludedNew.length : { status: "NOT_MEASURABLE_WITHOUT_PROVIDER_LIST" },
    REVIEW_NEW_CANDIDATES: result.providerAvailable
      ? reviewNew.length : { status: "NOT_MEASURABLE_WITHOUT_PROVIDER_LIST" },
    ACTIVE_US_COMMON_EQUITIES: c.activeUsPrimaryCommonEquities,
    ADR: c.byInstrumentType.ADR,
    REIT: c.byInstrumentType.REIT,
    SPAC: c.byInstrumentType.SPAC,
    PREFERRED: c.byInstrumentType.PREFERRED,
    TRUST: c.byInstrumentType.TRUST,
    ETF_EXCLUDED: c.byInstrumentType.ETF,
    ETN_EXCLUDED: c.byInstrumentType.ETN,
    ETP_EXCLUDED: c.byInstrumentType.ETP,
    FUND_EXCLUDED: c.byInstrumentType.MUTUAL_FUND,
    CEF_EXCLUDED: c.byInstrumentType.CEF,
    INDEX_EXCLUDED: c.byInstrumentType.INDEX,
    WARRANT: c.byInstrumentType.WARRANT,
    UNIT: c.byInstrumentType.UNIT,
    RIGHT: c.byInstrumentType.RIGHT,
    OTHER: c.byInstrumentType.OTHER,
    INACTIVE: c.byActiveStatus.INACTIVE,
    UNKNOWN: c.byInstrumentType.UNKNOWN,
    DUPLICATES: result.duplicates.length,
    OTC_COMMON_DEFERRED: c.otcCommonDeferred,
    FINAL_PROPOSED_US_EQUITY_COUNT: result.providerAvailable
      ? baseline.length + newEligible.length
      : { status: "PENDING_PROVIDER_FETCH", floor: baseline.length,
          note: "Der Bestand bleibt vollstaendig. Was dazukommt, entscheidet der Anbieterlauf." }
  };

  /* ------------------------------------------------ Arbeitsablage (voll) */
  mkdirSync(WORK_DIR, { recursive: true });
  const workFile = join(WORK_DIR, "us-security-master.json");
  writeFileSync(workFile, JSON.stringify({
    generatedAt: stamp, version: Master.VERSION, provider: "tiingo",
    today: TODAY, source: providerSource, providerError,
    baselineFile: BASELINE_FILE.replace(root + "/", ""),
    counts: c, rows: result.rows
  }));
  console.log(`  Arbeitsablage: ${workFile.replace(root + "/", "")} (${result.rows.length} Zeilen)`);

  /* --------------------------------------------- Repository (Abgleich)

     Ausgeliefert werden die Zeilen der Titel, die ohnehin schon
     oeffentlich im Bestand stehen, und Zahlen ueber den Rest. Neue
     Anbieterticker bleiben in der Arbeitsablage - dieselbe Grenze wie
     bei der vollstaendigen Tickerliste. */
  const deliveredRows = result.rows.filter((r) => r.baseline_member || INCLUDE_NEW_TICKERS);
  const needsDecision = deliveredRows.filter((r) => r.reconciliation_status !== "EXISTING");
  mkdirSync(OUT_DIR, { recursive: true });

  const reconciliation = {
    generatedAt: stamp,
    version: Master.VERSION,
    baseClassificationVersion: require(
      join(root, "quant", "engines", "instrument-classification.js")).VERSION,
    provider: "tiingo",
    today: TODAY,
    scope: "US_LISTED_EQUITIES_DISCOVERY_AND_RECONCILIATION",
    phase: "DISCOVERY_ONLY_NO_BACKFILL",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null
    },
    providerFetch: result.providerAvailable
      ? { status: "FETCHED", ...providerSource, rows: providerRows.length }
      : { status: "NOT_FETCHED", reason: providerError,
          consequence: "Jede Zahl ueber NEUE Titel bleibt in diesem Lauf offen. Der " +
                       "Abgleich beschreibt den gelieferten Bestand vollstaendig." },
    providerAggregate,
    headline,
    counts: c,
    invariants: result.invariants,
    nonDestructive: {
      baselineFile: BASELINE_FILE.replace(root + "/", ""),
      baselineCount: baseline.length,
      baselinePreserved: c.baselinePreserved,
      baselineRemoved: 0,
      writesOutsideThisTree: 0,
      note: "Dieser Lauf schreibt ausschliesslich nach " +
            OUT_DIR.replace(root + "/", "") + " und in die Arbeitsablage. Kein " +
            "Bestandsartefakt wird angefasst. Titel mit REVIEW behalten ihre gelieferten " +
            "Daten; eine Bereinigung ist eine eigene, ausdruecklich freizugebende Migration."
    },
    duplicates: result.duplicates.slice(0, 200),
    duplicatesTotal: result.duplicates.length,
    findings: result.findings,
    ambiguousExamples: buildAmbiguousExamples(result.rows),
    redistribution: {
      newProviderTickers: INCLUDE_NEW_TICKERS ? "INCLUDED_BY_FLAG" : "WITHHELD",
      priceLevels: "NONE_IN_THIS_ARTEFACT",
      note: "Zeilen von Titeln, die schon im gelieferten Bestand stehen, sind bereits " +
            "oeffentlich. Neue Anbieterticker bleiben in der Arbeitsablage, solange die " +
            "Redistribution der vollstaendigen Tickerliste LEGAL_REVIEW_REQUIRED ist."
    },
    /* Der Abgleich traegt die Zeilen, die eine Entscheidung brauchen.
       Die vollstaendige Stammtabelle steht daneben in
       us-security-master.json - 5.684 unauffaellige Zeilen in denselben
       Bericht zu legen macht ihn nicht vollstaendiger, sondern
       unlesbar, und ein Bericht, den niemand oeffnet, ist kein
       Nachweis. */
    rowsInThisFile: "RECONCILIATION_STATUS_NOT_EQUAL_EXISTING",
    rowsNeedingDecision: needsDecision.length,
    rowsElsewhere: {
      file: "quant/data/market/security-master/us-security-master.json",
      count: deliveredRows.length
    },
    rows: needsDecision
  };
  writeFileSync(join(OUT_DIR, "reconciliation.json"),
                JSON.stringify(reconciliation, null, 2) + "\n");

  /* Die Stammtabelle. Sie traegt jede ausgelieferte Zeile mit allen
     Pflichtfeldern aus §7.

     Die Begruendungstexte stehen nur an den Zeilen, an denen sie etwas
     erklaeren. An 5.357 bestaetigten Bestandstiteln stehen zweimal
     dieselben zwei Saetze; sie mitzuliefern kostet zwei Drittel der
     Datei und sagt nichts, was nicht in classification_status steht.
     Die vollstaendigen Begruendungen liegen in der Arbeitsablage. */
  const masterRows = deliveredRows.map((r) => {
    if (r.reconciliation_status === "EXISTING" && r.classification_status === "CLASSIFIED") {
      const { classification_reasons, ...rest } = r;
      return rest;
    }
    return r;
  });
  writeMaster(join(OUT_DIR, "us-security-master.json"), {
    generatedAt: stamp,
    version: Master.VERSION,
    provider: "tiingo",
    today: TODAY,
    scope: "US_SECURITY_MASTER",
    schema: {
      required: ["provider", "ticker", "canonical_id", "exchange", "country", "currency",
                 "instrument_type", "classification_status", "classification_confidence",
                 "active_status", "start_date", "end_date", "eligible_us_equity",
                 "eligibility_reason", "reconciliation_status", "baseline_member",
                 "source_provenance"],
      optional: ["provider_symbol_id", "listing_status", "primary_listing", "security_name",
                 "mic", "first_seen_at", "last_seen_at"],
      classes: Master.CLASSES,
      reconciliationStatus: Master.RECONCILIATION_STATUS,
      note: "Keine Kursniveaus. Der Stamm beantwortet, WAS ein Papier ist - nicht, was es kostet."
    },
    workingStore: {
      file: workFile.replace(root + "/", ""),
      rows: result.rows.length,
      note: "Vollstaendiger Stamm einschliesslich neuer Anbieterticker und aller " +
            "Begruendungstexte. Gitignored, solange die Redistribution der Tickerliste " +
            "LEGAL_REVIEW_REQUIRED ist."
    },
    redistribution: {
      newProviderTickers: INCLUDE_NEW_TICKERS ? "INCLUDED_BY_FLAG" : "WITHHELD",
      priceLevels: "NONE_IN_THIS_ARTEFACT"
    },
    counts: c,
    rowsDelivered: masterRows.length
  }, masterRows);

  const summary = {
    generatedAt: stamp, version: Master.VERSION, provider: "tiingo", today: TODAY,
    status: result.providerAvailable ? "OK" : "BASELINE_ONLY",
    headline, counts: c,
    exchangeBreakdown: c.byExchange,
    venueBreakdown: c.byVenueTier,
    activeBreakdown: c.byActiveStatus,
    classificationBreakdown: c.byClassificationStatus,
    largestContaminationCategories: result.findings
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((f) => ({ id: f.id, severity: f.severity, count: f.count })),
    newSecuritiesNotInBaseline: result.providerAvailable
      ? result.rows.filter((r) => !r.baseline_member).length
      : { status: "NOT_MEASURABLE_WITHOUT_PROVIDER_LIST" },
    providerAggregate,
    note: "Entdeckung und Abgleich. Kein Backfill, keine Kurse, keine Aenderung am Bestand."
  };
  writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  const estimate = backfillEstimate(
    result.providerAvailable ? newEligible.length : 0,
    result.rows.filter((r) => r.baseline_member && r.active_status === "INACTIVE").length
  );
  writeFileSync(join(OUT_DIR, "backfill-estimate.json"), JSON.stringify({
    generatedAt: stamp, version: Master.VERSION, provider: "tiingo",
    status: result.providerAvailable ? "ESTIMATE_FOR_MEASURED_ADDITIONS"
                                     : "MODEL_ONLY_PENDING_PROVIDER_FETCH",
    approvalRequired: true,
    approvalNote: "Diese Schaetzung loest keinen Lauf aus. Ein Backfill startet erst nach " +
                  "ausdruecklicher Freigabe des Eigentuemers.",
    estimate
  }, null, 2) + "\n");

  /* --------------------------------------------------------- Ausgabe */
  console.log("\n  ── Abgleich ─────────────────────────────────");
  for (const [k, v] of Object.entries(headline)) {
    const shown = typeof v === "object" && v !== null
      ? (v.status || JSON.stringify(v)) : v;
    console.log(`  ${k.padEnd(34)} ${shown}`);
  }
  console.log("\n  ── Befunde ──────────────────────────────────");
  result.findings.forEach((f) => {
    console.log(`  [${f.severity.padEnd(6)}] ${f.id.padEnd(38)} ${f.count}`);
  });
  console.log(`\n  ${join(OUT_DIR, "summary.json").replace(root + "/", "")}`);
  console.log(`  ${join(OUT_DIR, "reconciliation.json").replace(root + "/", "")}`);
  console.log(`  ${join(OUT_DIR, "us-security-master.json").replace(root + "/", "")}`);
  console.log(`  ${join(OUT_DIR, "backfill-estimate.json").replace(root + "/", "")}`);
  console.log("\nFertig. Kein Backfill gestartet.");
}

/** Mehrdeutige Faelle zum Nachlesen - nach Grund gruppiert, gedeckelt.

    Jede Gruppe traegt ihre volle Zahl und eine begrenzte Auswahl. Ohne
    die volle Zahl liest sich eine Deckelung wie ein Befund von zwoelf. */
function buildAmbiguousExamples(rows) {
  const groups = {};
  rows.forEach((r) => {
    if (r.reconciliation_status !== "REVIEW" && r.classification_status === "CLASSIFIED") return;
    const key = r.reconciliation_reason || ("CLASSIFICATION_" + r.classification_status);
    if (!groups[key]) groups[key] = { total: 0, shown: 0, withheld: 0, examples: [] };
    const g = groups[key];
    g.total++;
    if (!r.baseline_member && !INCLUDE_NEW_TICKERS) { g.withheld++; return; }
    if (g.examples.length < 12) {
      g.shown++;
      g.examples.push({
        ticker: r.ticker, exchange: r.exchange, instrument_type: r.instrument_type,
        classification_status: r.classification_status,
        classification_confidence: r.classification_confidence,
        active_status: r.active_status, baseline_member: r.baseline_member,
        review_flags: r.review_flags
      });
    }
  });
  return groups;
}

main().catch((err) => { console.error(err); process.exit(1); });
