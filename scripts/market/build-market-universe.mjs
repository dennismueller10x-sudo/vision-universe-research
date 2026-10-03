/* =========================================================================
   VISION UNIVERSE — build-market-universe.mjs   (Tiingo Commercial, §7)

   Baut das Aktienuniversum aus den echten Stammdaten des Anbieters.

   Nicht aus einer Liste im Code. Tiingo veroeffentlicht seine gefuehrten
   Titel als supported_tickers.zip - rund 100.000 Zeilen mit Ticker,
   Boerse, Gattung, Waehrung und dem Zeitraum, fuer den Kurse vorliegen.
   Genau das ist die Grundlage, die §7 verlangt: ein Universum, das mit dem
   Anbieter waechst, statt eines, das jemand pflegen muesste.

   WO WAS LANDET (§26, §34)

     Arbeitsablage (.market-cache, gitignored)
       Die vollstaendige klassifizierte Liste. Sie ist Anbieterinhalt in
       Rohform; sie oeffentlich auszuliefern waere Redistribution und ist
       nicht freigegeben.

     Repository (quant/data/market/universe/)
       Nur die Bilanz: wie viele Titel, welche Gattungen, welche Boersen,
       welche Beleglage. Zahlen ueber die Liste, nicht die Liste.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/build-market-universe.mjs
     node scripts/market/build-market-universe.mjs --from-csv <pfad>
     node scripts/market/build-market-universe.mjs --from-zip <pfad>
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { inflateRawSync } from "node:zlib";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Classification = require(join(root, "quant", "engines", "instrument-classification.js"));

const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

/* Die Adresse der Tickerliste. Sie liegt bewusst NICHT hinter dem
   API-Schluessel - Tiingo liefert sie als offene Datei. Der Schluessel
   wird trotzdem mitgeschickt, wo er vorhanden ist: die Anfrage soll dem
   Konto zurechenbar sein. */
const TICKERS_URL = "https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip";

const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const FROM_CSV = arg("--from-csv");
const FROM_ZIP = arg("--from-zip");
/* --out und --work-dir sind Testschalter: ein Test darf die echte
   Bilanz unter quant/data/ nicht ueberschreiben, nur weil er prueft,
   dass sie entsteht. Ohne die Schalter bleibt alles am angestammten
   Platz. */
const OUT_DIR = arg("--out") || join(root, "quant", "data", "market", "universe");
const WORK_DIR = arg("--work-dir") || join(root, SCALE.storage.workingDir, "tiingo", "universe");

/* -------------------------------------------------------------- ZIP

   Ein Minimalleser fuer genau diesen Fall: ein Archiv, eine Datei,
   Deflate. Kein allgemeiner ZIP-Leser - das Repository hat keine
   Abhaengigkeiten, und eine dafuer hinzuzunehmen waere ein hoher Preis
   fuer dreissig Zeilen. Er liest das zentrale Verzeichnis (nicht die
   lokalen Kopfsaetze), weil dort die Groessen auch dann stehen, wenn der
   Erzeuger einen Data Descriptor benutzt hat. */
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

/* -------------------------------------------------------------- CSV

   Bewusst ein einfacher Parser mit Anfuehrungszeichen-Behandlung. Die
   Tickerliste enthaelt keine eingebetteten Zeilenumbrueche; sollte das
   eines Tages anders sein, faellt es hier auf und nicht im Screener. */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return { header: [], rows: [] };
  const split = (line) => {
    const out = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    const row = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = (cells[c] || "").trim();
    rows.push(row);
  }
  return { header, rows };
}

/** Anbieterzeile -> Universumseintrag (§7). */
export function toUniverseEntry(row, classification) {
  return {
    ticker: classification.ticker,
    /* company bleibt null, solange kein Name vorliegt. Die Tickerliste
       traegt keinen - ihn aus dem Ticker zu erfinden waere eine
       Behauptung ueber ein Unternehmen. */
    company: row.name || null,
    exchange: classification.exchange,
    country: classification.country,
    currency: classification.currency,
    assetType: classification.assetType,
    instrumentType: classification.instrumentType,
    classificationConfidence: classification.confidence,
    active: classification.active,
    providerSymbol: classification.ticker,
    provider: "tiingo",
    screenerEligible: classification.screenerEligible,
    otc: classification.otc,
    startDate: classification.startDate,
    endDate: classification.endDate,
    /* sector/industry stehen in der Tickerliste nicht. Sie bleiben mit
       einem Grund leer statt mit einer Vermutung gefuellt (§30). */
    sector: null,
    industry: null,
    sectorStatus: "SOURCE_MISSING",
    industryStatus: "SOURCE_MISSING"
  };
}

async function loadCsvText() {
  if (FROM_CSV) {
    return { text: readFileSync(FROM_CSV, "utf8"),
             source: { kind: "localCsv", path: FROM_CSV, fetchedAt: null } };
  }
  if (FROM_ZIP) {
    const entry = readSingleFileFromZip(readFileSync(FROM_ZIP));
    return { text: entry.text,
             source: { kind: "localZip", path: FROM_ZIP, entry: entry.name, fetchedAt: null } };
  }
  const started = Date.now();
  const headers = {};
  if (process.env.TIINGO_API_KEY) headers.Authorization = "Token " + process.env.TIINGO_API_KEY;
  const res = await fetch(TICKERS_URL, { headers });
  if (!res.ok) throw new Error("Tickerliste nicht abrufbar: HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const entry = readSingleFileFromZip(buf);
  return {
    text: entry.text,
    source: { kind: "providerDownload", url: TICKERS_URL, entry: entry.name,
              bytes: buf.length, latencyMs: Date.now() - started,
              fetchedAt: new Date().toISOString() }
  };
}

async function main() {
  console.log("Vision Universe — Marktuniversum aus Tiingo-Stammdaten\n");

  let loaded;
  try {
    loaded = await loadCsvText();
  } catch (err) {
    console.error("  Stammdaten nicht verfuegbar: " + err.message);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      provider: "tiingo",
      status: "UNAVAILABLE",
      reason: "providerMetadataUnavailable",
      message: err.message,
      note: "Kein Universum gebaut. Es wird ausdruecklich keine ersatzweise Liste verwendet."
    }, null, 2) + "\n");
    process.exit(1);
  }

  const { header, rows } = parseCsv(loaded.text);
  console.log(`  Quelle:  ${loaded.source.kind}`);
  console.log(`  Spalten: ${header.join(", ")}`);
  console.log(`  Zeilen:  ${rows.length}`);

  const today = new Date().toISOString().slice(0, 10);
  const normalized = rows.map((r) => ({
    ticker: r.ticker, exchange: r.exchange, assetType: r.assetType,
    currency: r.priceCurrency || r.currency, startDate: r.startDate, endDate: r.endDate,
    name: r.name || null
  }));

  const started = Date.now();
  const result = Classification.classifyAll(normalized, { today });
  const entries = result.classifications.map((c, i) => toUniverseEntry(normalized[i], c));
  const runtimeMs = Date.now() - started;

  const eligible = entries.filter((e) => e.screenerEligible);
  const byExchange = {};
  eligible.forEach((e) => { byExchange[e.exchange || "UNKNOWN"] = (byExchange[e.exchange || "UNKNOWN"] || 0) + 1; });
  const byCurrency = {};
  entries.forEach((e) => { byCurrency[e.currency || "UNKNOWN"] = (byCurrency[e.currency || "UNKNOWN"] || 0) + 1; });

  /* Arbeitsablage: die vollstaendige Liste. Gitignored. */
  mkdirSync(WORK_DIR, { recursive: true });
  const workFile = join(WORK_DIR, "universe.json");
  writeFileSync(workFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    provider: "tiingo",
    source: loaded.source,
    count: entries.length,
    entries
  }));
  console.log(`  Arbeitsablage: ${workFile}`);

  /* Repository: nur Zahlen ueber die Liste. */
  mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    provider: "tiingo",
    status: "OK",
    classificationVersion: Classification.VERSION,
    source: {
      kind: loaded.source.kind,
      url: loaded.source.url || null,
      fetchedAt: loaded.source.fetchedAt,
      bytes: loaded.source.bytes || null,
      columns: header
    },
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null,
      classificationRuntimeMs: runtimeMs
    },
    totals: {
      rows: entries.length,
      byInstrumentType: result.counts,
      screenerEligible: eligible.length,
      screenerEligibleByExchange: byExchange,
      byCurrency: byCurrency,
      activeTrue: entries.filter((e) => e.active === true).length,
      activeFalse: entries.filter((e) => e.active === false).length,
      activeUnknown: entries.filter((e) => e.active === null).length,
      otc: eligible.filter((e) => e.otc).length,
      nonOtc: eligible.filter((e) => !e.otc).length
    },
    coverageGaps: {
      company: { status: "SOURCE_MISSING",
                 note: "Die Tickerliste des Anbieters traegt keinen Firmennamen. Namen kaemen " +
                       "aus dem Stammdatenendpunkt - eine Anfrage je Titel." },
      sector: { status: "SOURCE_MISSING",
                note: "Sektor und Branche liegen bei Tiingo im Fundamentalzusatz, der in " +
                      "diesem Zugang nicht enthalten ist. Sie bleiben leer und werden nicht " +
                      "geschaetzt." },
      adr: { status: "UNVERIFIED",
             note: "Ohne Firmennamen ist eine ADR nicht von einer Stammaktie zu unterscheiden. " +
                   "Die ADR-Zahl unten ist deshalb eine Untergrenze, keine Zaehlung." }
    },
    redistribution: {
      fullList: "LEGAL_REVIEW_REQUIRED",
      note: "Die vollstaendige Tickerliste ist Anbieterinhalt und bleibt in der " +
            "Arbeitsablage. Ausgeliefert wird ausschliesslich diese Bilanz."
    }
  };
  writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log("\n  Gattungen:");
  Object.keys(result.counts).forEach((t) => {
    if (result.counts[t]) console.log(`    ${t.padEnd(14)} ${String(result.counts[t]).padStart(7)}`);
  });
  console.log(`\n  Screenerfaehig (Aktien): ${eligible.length}`);
  console.log(`  Bilanz: quant/data/market/universe/summary.json`);
  console.log("\nFertig.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
