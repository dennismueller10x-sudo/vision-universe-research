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
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));

const argv = process.argv.slice(2);
const USE_S3 = argv.includes("--s3");
const KEEP = argv.includes("--keep");
function arg(n, d = null) { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; }
const OUT = arg("--out", join(root, "quant", "data", "market", "history", "verification.json"));
/* Der Praefix des Nachweises ist NICHT der Produktionspraefix. Ein
   Nachweis, der in die echten Daten schreibt, ist kein Nachweis - er ist
   ein Risiko.

   Er lautet in BEIDEN Betriebsarten gleich. Der erste Entwurf nahm
   lokal "v1" - derselbe Praefix, unter dem die Produktionsdaten liegen.
   Gegen ein Wegwerfverzeichnis war das harmlos, aber es machte den
   lokalen Lauf zu einer anderen Uebung als den echten, und die Pruefung
   NO_PRODUCTION_KEYS_TOUCHED hat es zu Recht gemeldet. Eine
   Nachweisumgebung, die anders aussieht als der Ernstfall, weist den
   Ernstfall nicht nach. */
const PREFIX = arg("--prefix", "verify/v1");

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

/**
 * Der Zeuge.
 *
 * Er legt sich um den Treiber und schreibt jeden Zugriff mit - und er
 * WIRFT, sobald ein Schluessel ausserhalb des Nachweis-Praefixes
 * angefasst wuerde.
 *
 * Das ist der Unterschied zwischen "wir haben nur den Nachweispfad
 * benutzt" und "es ist nachgewiesen, dass nur der Nachweispfad benutzt
 * wurde". Die Zusage, die Produktionsdaten nicht anzufassen, soll nicht
 * von der Sorgfalt des Skripts abhaengen.
 */
function witness(driver, allowedPrefix, log) {
  const guard = (op, key) => {
    if (key !== undefined && key !== null && key !== "") {
      if (!String(key).startsWith(allowedPrefix)) {
        throw new Error("VERIFY_TOUCHED_PRODUCTION_KEY: " + op + " " + key +
                        " liegt ausserhalb von '" + allowedPrefix + "'.");
      }
    }
    log.push({ op, key: key || "(bucket)", at: new Date().toISOString() });
  };
  return {
    kind: driver.kind, endpoint: driver.endpoint, bucket: driver.bucket,
    async put(key, buf, o) { guard("PUT", key); return driver.put(key, buf, o); },
    async get(key) { guard("GET", key); return driver.get(key); },
    async head(key) { guard("HEAD", key); return driver.head(key); },
    async list(prefix) { guard("LIST", prefix); return driver.list(prefix); },
    async del(key) { guard("DELETE", key); return driver.del(key); }
  };
}

async function makeDriver(tmp) {
  if (USE_S3) {
    const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
    /* Loeschen ausdruecklich freigeschaltet - und ausschliesslich unter
       dem Nachweis-Praefix. Der Treiber weist jeden anderen Schluessel
       ab, und einen Praefix ohne "verify" nimmt er gar nicht erst an. */
    return createS3DriverFromEnv(Object.assign({}, process.env, {
      __allowDeleteUnderPrefix: PREFIX + "/"
    }));
  }
  const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
  return createFsDriver(tmp);
}

async function main() {
  console.log("Vision Universe — Nachweis der dauerhaften Historienablage\n");

  const available = SAMPLE.filter((t) => existsSync(join(GOLDEN, `ref_${t}.json`)));
  if (!available.length) {
    console.error("Keine echten Kerzen unter " + GOLDEN + ".");
    process.exit(1);
  }

  const tmp = mkdtempSync(join(tmpdir(), "vu-hist-verify-"));
  const touched = [];
  const rawDriver = await makeDriver(tmp);
  const allowedPrefix = PREFIX + "/";
  const driver = witness(rawDriver, allowedPrefix, touched);
  const store = Store.createHistoryStore({
    driver, provider: "tiingo", market: "VERIFY", prefix: PREFIX,
    /* Ein Budget auch hier: der Nachweis laeuft gegen denselben Dienst
       und unter derselben Schranke wie ein echter Lauf. */
    budget: Guard.createBudget({ classAOperations: 200, classBOperations: 200 })
  });
  console.log(`  Ablage:    ${store.driver.kind} ${store.driver.endpoint || ""}`);
  console.log(`  Praefix:   ${store.seriesPrefix}`);
  console.log(`  Kodierung: ${store.codec}`);
  console.log(`  Stichprobe: ${available.join(", ")}\n`);

  const sizes = [];
  let totalBars = 0, totalBytes = 0, totalRaw = 0;
  const written = {};

  try {
    /* ------------------------------------------------------- 0 Zugang

       Zuerst der Zugang. Ein Fehlschlag hier ist ein anderer Befund als
       ein Fehlschlag weiter unten: falsche Zugangsdaten sehen in jedem
       spaeteren Schritt wie ein Datenfehler aus. */
    let authOk = false, authDetail = "";
    try {
      await driver.list(allowedPrefix);
      authOk = true;
      authDetail = "LIST auf " + allowedPrefix + " beantwortet";
    } catch (err) {
      authDetail = String(err.message).slice(0, 200);
    }
    if (!check("AUTHENTICATION", authOk, authDetail)) {
      throw new Error("Zugang nicht bestaetigt - die uebrigen Pruefungen waeren ohne Aussage.");
    }

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

    /* ----------------------------------------------------- 4a Metadaten */
    const metaProbe = await driver.head(store.seriesKey(available[0]));
    const metaOk = !!(metaProbe && metaProbe.metadata &&
                      metaProbe.metadata.ticker === available[0] &&
                      Number(metaProbe.metadata.bars) === written[available[0]].barCount &&
                      metaProbe.metadata.sha256 === written[available[0]].sha256);
    check("OBJECT_METADATA", metaOk,
          metaProbe && metaProbe.metadata
            ? `ticker=${metaProbe.metadata.ticker} bars=${metaProbe.metadata.bars} sha256 vorhanden`
            : "keine Metadaten am Objekt");

    /* ------------------------------------------------------ 4b Ueberschreiben

       Ein Objekt am selben Schluessel mit anderem Inhalt. Wichtig, weil
       der taegliche Nachlauf genau das tut - und weil ein Speicher, der
       still die alte Fassung behaelt, erst Monate spaeter auffiele. */
    const owTicker = available[0];
    const owBefore = await store.getSeries(owTicker);
    const owBars = owBefore.bars.slice(0, owBefore.bars.length - 1)
      .concat([Object.assign({}, owBefore.bars[owBefore.bars.length - 1], { adjustedClose: 77.77 })]);
    const owMeta = await store.putSeries({
      ticker: owTicker, securityId: "ref_" + owTicker, provider: "tiingo",
      adjustmentStatus: owBefore.adjustmentStatus, bars: owBars
    });
    const owAfter = await store.getSeries(owTicker);
    const owOk = !owMeta.skipped &&
                 owAfter.bars[owAfter.bars.length - 1].adjustedClose === 77.77 &&
                 owAfter.bars.length === owBefore.bars.length;
    check("OVERWRITE_UPDATE", owOk,
          owOk ? "geaenderte Fassung am selben Schluessel gelesen" : "die alte Fassung kam zurueck");
    written[owTicker] = owMeta;

    /* Und die Gegenprobe: unveraenderter Inhalt schreibt NICHT. */
    const noopMeta = await store.putSeries({
      ticker: owTicker, securityId: "ref_" + owTicker, provider: "tiingo",
      adjustmentStatus: owBefore.adjustmentStatus, bars: owBars
    });
    check("NO_UNNECESSARY_REWRITE", noopMeta.skipped === true,
          noopMeta.skipped ? "gleicher Inhalt, kein Schreibvorgang" : "wurde unnoetig neu geschrieben");

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

    /* ------------------------------------------------------ 9 Aufraeumen

       Der Nachweis raeumt hinter sich auf. Ohne das waechst der Eimer
       bei jedem Lauf um Wegwerfobjekte - und ein Speicherstand, der
       Nachweisdaten mitzaehlt, macht jede Vorabrechnung ungenauer. */
    const toRemove = await driver.list(allowedPrefix);
    let deleted = 0, deleteFailed = 0;
    for (const o of toRemove) {
      try { await driver.del(o.key); deleted++; }
      catch (err) { deleteFailed++; }
    }
    const remaining = await driver.list(allowedPrefix);
    check("CLEANUP_VERIFY_PREFIX", remaining.length === 0 && deleteFailed === 0,
          `${deleted} Objekte entfernt, ${remaining.length} verblieben` +
          (deleteFailed ? `, ${deleteFailed} Fehler` : ""));

    /* --------------------------------- 10 Produktionsdaten unberuehrt

       Nicht zugesagt, sondern mitgeschrieben: der Zeuge um den Treiber
       haette bei jedem Schluessel ausserhalb des Nachweis-Praefixes
       geworfen. Diese Pruefung liest sein Protokoll noch einmal. */
    const outside = touched.filter((t) => t.key !== "(bucket)" && !t.key.startsWith(allowedPrefix));
    const productionPrefixes = ["v1/tiingo/daily/US/", "v1/tiingo/daily/", "v1/_usage/"];
    const productionHits = touched.filter((t) =>
      productionPrefixes.some((p) => String(t.key).startsWith(p)));
    check("NO_PRODUCTION_KEYS_TOUCHED", outside.length === 0 && productionHits.length === 0,
          `${touched.length} Zugriffe, alle unter '${allowedPrefix}'`);

    const byOp = {};
    for (const t of touched) byOp[t.op] = (byOp[t.op] || 0) + 1;

    const report = {
      generatedAt: new Date().toISOString(),
      verification: "HISTORY_STORE_SAMPLE",
      access: {
        touchedKeys: touched.length,
        byOperation: byOp,
        allowedPrefix,
        outsideAllowedPrefix: outside.length,
        productionKeysTouched: productionHits.length,
        deleteScope: USE_S3 ? allowedPrefix : "(Dateisystem, Wegwerfpfad)",
        note: "Der Zeuge um den Treiber wirft bei jedem Schluessel ausserhalb des " +
              "Nachweis-Praefixes. Diese Zahlen sind mitgeschrieben, nicht zugesagt."
      },
      cleanup: { objectsBefore: toRemove.length, deleted, remaining: remaining.length, failed: deleteFailed },
      budget: store.budget.spent,
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
