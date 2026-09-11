/* =========================================================================
   VISION UNIVERSE — verify-history-store.mjs

   Der Nachweis, dass die dauerhafte Ablage taugt - an einer kleinen,
   ECHTEN Stichprobe.

   Geprueft wird nicht, dass Dateien entstehen. Geprueft wird die Kette,
   an der ein Backfill spaeter haengt:

     1. Schreiben        echte Tiingo-Kerzen gehen in die Ablage
     2. Lesen            und kommen ZEICHENGLEICH zurueck
     3. Index            ein Objekt sagt, was da ist
     4. Wiederherstellen der Index laesst sich aus dem Speicher neu bauen
     5. Inkrementell     ein Tag mehr kostet einen Tag, nicht die Historie
     6. Rueckwirkend     eine geaenderte alte Kerze ersetzt die alte
     7. Plan             der Speicher sagt, was noch zu holen ist
     8. Hochrechnung     was 7.800 Titel kosten werden

   Ohne --s3 laeuft der Nachweis gegen ein Verzeichnis. Mit --s3 gegen den
   echten Dienst aus der Umgebung. Beides ist derselbe Code - das ist der
   eigentliche Punkt.

   Ausfuehren:
     node scripts/market/verify-history-store.mjs
     node scripts/market/verify-history-store.mjs --s3
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Store = require(join(root, "quant", "engines", "history-store.js"));
const Codec = require(join(root, "quant", "engines", "bar-codec.js"));

const argv = process.argv.slice(2);
const USE_S3 = argv.includes("--s3");
const KEEP = argv.includes("--keep");
function arg(n, d = null) { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; }
const OUT = arg("--out", join(root, "quant", "data", "market", "history", "verification.json"));
/* Der Praefix des Nachweises ist NICHT der Produktionspraefix. Ein
   Nachweis, der in die echten Daten schreibt, ist kein Nachweis - er ist
   ein Risiko. */
const PREFIX = arg("--prefix", USE_S3 ? "verify/v1" : "v1");

const GOLDEN = join(root, "quant", "data", "market", "golden-preview", "daily");
const SAMPLE = ["AAPL", "JPM", "MSFT", "NVDA", "XOM"];
/* Gemessen im FULL_UNIVERSE-Lauf 34374652149: 23.218.412 Kerzen ueber
   5.684 Titel. Die Hochrechnung steht und faellt mit dieser Zahl, also
   steht sie hier und nicht in einer Bemerkung. */
const AVG_BARS_PER_SYMBOL = 4085;
const TARGET_SYMBOLS = 7800;

const checks = [];
function check(id, ok, detail) {
  checks.push({ id, status: ok ? "PASS" : "FAIL", detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${id.padEnd(34)} ${detail || ""}`);
  return ok;
}

async function makeStore(tmp) {
  if (USE_S3) {
    const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
    return Store.createHistoryStore({ driver: createS3DriverFromEnv(), provider: "tiingo",
                                      market: "VERIFY", prefix: PREFIX });
  }
  const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
  return Store.createHistoryStore({ driver: createFsDriver(tmp), provider: "tiingo",
                                    market: "VERIFY", prefix: PREFIX });
}

async function main() {
  console.log("Vision Universe — Nachweis der dauerhaften Historienablage\n");

  const available = SAMPLE.filter((t) => existsSync(join(GOLDEN, `ref_${t}.json`)));
  if (!available.length) {
    console.error("Keine echten Kerzen unter " + GOLDEN + ".");
    process.exit(1);
  }

  const tmp = mkdtempSync(join(tmpdir(), "vu-hist-verify-"));
  const store = await makeStore(tmp);
  console.log(`  Ablage:    ${store.driver.kind} ${store.driver.endpoint || ""}`);
  console.log(`  Praefix:   ${store.seriesPrefix}`);
  console.log(`  Kodierung: ${store.codec}`);
  console.log(`  Stichprobe: ${available.join(", ")}\n`);

  const sizes = [];
  let totalBars = 0, totalBytes = 0, totalRaw = 0;
  const written = {};

  try {
    /* ------------------------------------------------ 1+2 schreiben/lesen */
    let allExact = true;
    for (const ticker of available) {
      const doc = JSON.parse(readFileSync(join(GOLDEN, `ref_${ticker}.json`), "utf8"));
      const meta = await store.putSeries({
        ticker, securityId: "ref_" + ticker, provider: "tiingo",
        adjustmentStatus: doc.adjustmentStatus, bars: doc.bars
      });
      written[ticker] = meta;
      const back = await store.getSeries(ticker);
      const exact = JSON.stringify(back.bars) === JSON.stringify(doc.bars);
      if (!exact) allExact = false;
      const raw = Buffer.from(JSON.stringify(doc.bars)).length;
      totalBars += doc.bars.length; totalBytes += meta.bytes; totalRaw += raw;
      sizes.push({ ticker, bars: doc.bars.length, rawBytes: raw, storedBytes: meta.bytes,
                   bytesPerBar: meta.bytesPerBar, ratio: +(raw / meta.bytes).toFixed(1), exact });
    }
    check("WRITE_READ_BYTE_EXACT", allExact,
          `${available.length} echte Reihen, ${totalBars.toLocaleString("de-DE")} Kerzen`);

    /* ------------------------------------------------------------ 3 Index */
    await store.writeIndex({ symbols: written });
    const index = await store.readIndex();
    check("INDEX_ROUNDTRIP", Object.keys(index.symbols).length === available.length,
          `${Object.keys(index.symbols).length} Titel im Index`);

    /* ------------------------------------------------- 4 Wiederherstellen */
    const rebuilt = await store.rebuildIndexFromStorage();
    const rebuiltOk = available.every((t) =>
      rebuilt.symbols[t] && rebuilt.symbols[t].barCount === written[t].barCount &&
      rebuilt.symbols[t].last === written[t].last);
    check("INDEX_REBUILD_FROM_STORAGE", rebuiltOk,
          `${Object.keys(rebuilt.symbols).length} Titel aus LIST+HEAD wiederhergestellt`);

    /* ------------------------------------ 5+6 inkrementell und rueckwirkend */
    const probe = available[0];
    const before = await store.getSeries(probe);
    const lastBar = before.bars[before.bars.length - 1];
    const changedOld = Object.assign({}, lastBar, { adjustedClose: 1.2345 });
    const nextDay = Object.assign({}, lastBar, { date: "2099-01-01", adjustedClose: 42 });
    const appended = await store.appendSeries(probe, [changedOld, nextDay],
                                              { adjustmentStatus: before.adjustmentStatus });
    const after = await store.getSeries(probe);
    check("INCREMENTAL_APPEND", appended.barsAdded === 1 && after.bars.length === before.bars.length + 1,
          `+1 Kerze, ${appended.barsReplaced} ersetzt, statt ${before.bars.length} neu zu holen`);
    check("RETROACTIVE_ADJUSTMENT_WINS",
          after.bars[before.bars.length - 1].adjustedClose === 1.2345,
          "eine rueckwirkend geaenderte Kerze ersetzt die alte");

    const dates = after.bars.map((b) => b.date);
    check("NO_DUPLICATE_DATES", new Set(dates).size === dates.length,
          `${dates.length} Kerzen, ${new Set(dates).size} verschiedene Tage`);

    /* -------------------------------------------------------------- 7 Plan */
    const idx2 = await store.rebuildIndexFromStorage();
    const wanted = available.concat(["NEUERTITEL"]);
    const plan = store.planBackfill(wanted, idx2, { upTo: "2099-01-01" });
    const planOk = plan.counts.full === 1 && plan.counts.incremental === available.length - 1 &&
                   plan.counts.current === 1;
    check("BACKFILL_PLAN", planOk,
          `neu ${plan.counts.full}, nachzuladen ${plan.counts.incremental}, aktuell ${plan.counts.current}`);

    /* ------------------------------------------------------ 8 Hochrechnung */
    const perBar = totalBytes / totalBars;
    const projectedBytes = TARGET_SYMBOLS * AVG_BARS_PER_SYMBOL * perBar;
    const projectedGB = projectedBytes / 1073741824;
    check("SIZE_WITHIN_FREE_TIER", projectedGB < 10,
          `${projectedGB.toFixed(2)} GB fuer ${TARGET_SYMBOLS} Titel (R2-Freigrenze 10 GB)`);

    const report = {
      generatedAt: new Date().toISOString(),
      verification: "HISTORY_STORE_SAMPLE",
      storage: { kind: store.driver.kind, endpoint: USE_S3 ? store.driver.endpoint : "(Dateisystem)",
                 prefix: store.seriesPrefix, codec: store.codec, format: Codec.VERSION },
      sample: { symbols: available, bars: totalBars, source: "quant/data/market/golden-preview/daily" },
      compression: {
        rawBytes: totalRaw, storedBytes: totalBytes,
        bytesPerBar: +perBar.toFixed(2),
        ratio: +(totalRaw / totalBytes).toFixed(1),
        perSymbol: sizes
      },
      projection: {
        symbols: TARGET_SYMBOLS, avgBarsPerSymbol: AVG_BARS_PER_SYMBOL,
        avgBarsBasis: "gate-FULL_UNIVERSE.json historyCoverage: 23.218.412 Kerzen / 5.684 Titel",
        estimatedBars: TARGET_SYMBOLS * AVG_BARS_PER_SYMBOL,
        estimatedBytes: Math.round(projectedBytes),
        estimatedGB: +projectedGB.toFixed(2),
        uncompressedGB: +(TARGET_SYMBOLS * AVG_BARS_PER_SYMBOL * (totalRaw / totalBars) / 1073741824).toFixed(2)
      },
      checks,
      redistribution: {
        priceLevels: "NONE_IN_THIS_REPORT",
        note: "Der Bericht traegt Anzahlen und Byte-Groessen. Kurse stehen ausschliesslich " +
              "in der privaten Ablage; dieses Artefakt enthaelt keine."
      }
    };

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

    console.log("\n  ── Kompression ──────────────────────────────");
    for (const s of sizes) {
      console.log(`  ${s.ticker.padEnd(6)} ${String(s.bars).padStart(5)} Kerzen  ` +
                  `${String(s.storedBytes).padStart(7)} B  ${String(s.bytesPerBar).padStart(5)} B/Kerze  ${s.ratio}x`);
    }
    console.log(`  ${"".padEnd(6)} ${String(totalBars).padStart(5)} Kerzen  ` +
                `${String(totalBytes).padStart(7)} B  ${perBar.toFixed(1).padStart(5)} B/Kerze  ` +
                `${(totalRaw / totalBytes).toFixed(1)}x`);
    console.log(`\n  Hochrechnung ${TARGET_SYMBOLS} Titel: ${projectedGB.toFixed(2)} GB ` +
                `(unkomprimiert ${report.projection.uncompressedGB} GB)`);
    console.log(`\n  ${OUT.replace(root + "/", "")}`);

    const failed = checks.filter((c) => c.status === "FAIL");
    console.log(`\n  ${checks.length - failed.length}/${checks.length} Pruefungen bestanden.`);
    if (failed.length) process.exit(1);
    console.log("\nFertig. Es wurde kein Backfill gestartet.");
  } finally {
    if (!KEEP && !USE_S3) rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
