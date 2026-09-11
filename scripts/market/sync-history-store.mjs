/* =========================================================================
   VISION UNIVERSE — sync-history-store.mjs

   Die Bruecke zwischen der dauerhaften Ablage und dem Runner.

     --pull   Ablage -> .market-cache   (vor Faktoren und Technical)
     --push   .market-cache -> Ablage   (nach dem Gate-Lauf)

   WARUM EINE BRUECKE UND KEIN UMBAU

   market-store.js, build-market-factors.mjs, run-scale-gate.mjs und die
   Technical-Engines lesen alle aus .market-cache/<provider>/daily/. Diese
   Schnittstelle ist erprobt und wird an vielen Stellen benutzt - unter
   anderem von Arbeiten, die gerade laufen und die dieser Strang nicht
   anfassen darf.

   Also bleibt sie. Die Ablage fuellt das Verzeichnis vor dem Lauf und
   liest es danach aus. Kein Faktor-, Qualitaets- oder Technical-Skript
   aendert sich dafuer um eine Zeile.

   Der Preis ist Plattenplatz im Runner (das Verzeichnis entsteht wieder),
   der Gewinn ist, dass die 7.800 Historien den Runner ueberleben - und
   der naechste Lauf wirklich nur noch holt, was fehlt.

   Ausfuehren:
     node scripts/market/sync-history-store.mjs --pull --gate FULL_UNIVERSE
     node scripts/market/sync-history-store.mjs --push --gate FULL_UNIVERSE
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Store = require(join(root, "quant", "engines", "history-store.js"));
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const PULL = argv.includes("--pull");
const PUSH = argv.includes("--push");
const DRY_RUN = argv.includes("--dry-run");
const GATE = arg("--gate", "FULL_UNIVERSE");
const PROVIDER = arg("--provider", "tiingo");
const MARKET = arg("--market", "US");
const CONCURRENCY = parseInt(arg("--concurrency", "16"), 10) || 16;
const LIMIT = parseInt(arg("--limit", "0"), 10) || 0;
const LOCAL_ROOT = arg("--local-root", null);
const WORK_DIR = arg("--work-dir", join(root, SCALE.storage.workingDir));
const OUT = arg("--report", join(root, "quant", "data", "market", "history", "sync.json"));
const OPERATION = (arg("--operation", PUSH_DEFAULT_OP()) || "BULK_UPLOAD").toUpperCase();
const PREFLIGHT = arg("--preflight", join(root, "quant", "data", "market", "history", "preflight.json"));
function PUSH_DEFAULT_OP() { return argv.includes("--pull") ? "RECOVERY" : "BULK_UPLOAD"; }

if (PULL === PUSH) {
  console.error("Genau eine Richtung angeben: --pull oder --push.");
  process.exit(2);
}

/**
 * Das Budget aus der Vorabrechnung.
 *
 * Es wird GELESEN und nicht hier gerechnet. Ein Skript, das sich sein
 * eigenes Budget ausstellt, ist keine Schranke - die Rechnung gehoert
 * vor den Lauf und in eine eigene Datei, die man nachlesen kann.
 */
function loadBudget() {
  if (DRY_RUN) {
    /* Ein Trockenlauf schreibt nichts. Er darf trotzdem lesen, um zu
       rechnen - und zaehlt, was ein echter Lauf kosten wuerde. */
    return { budget: Guard.createBudget({ unmetered: true }), preflight: null };
  }
  if (!existsSync(PREFLIGHT)) {
    console.error(Guard.BLOCKED + ": keine Vorabrechnung unter " + PREFLIGHT.replace(root + "/", "") + ".");
    console.error("  Zuerst: node scripts/market/preflight-zero-cost.mjs --operation " + OPERATION);
    process.exit(3);
  }
  const pf = JSON.parse(readFileSync(PREFLIGHT, "utf8"));

  /* Eine Freigabe altert.

     Sie stuetzt sich auf den Nutzungsstand des Monats und den belegten
     Speicher zum Zeitpunkt der Rechnung. Beides aendert sich mit jedem
     Lauf. Eine Freigabe von gestern - oder gar eine, die jemand ins
     Repository committet hat - wuerde einen Lauf decken, dessen
     Grundlage es nicht mehr gibt. */
  const ageMs = Date.now() - Date.parse(pf.generatedAt || 0);
  const MAX_AGE_MS = (parseInt(arg("--preflight-max-age-minutes", "120"), 10) || 120) * 60000;
  if (!(ageMs >= 0) || ageMs > MAX_AGE_MS) {
    console.error(Guard.BLOCKED + `: die Vorabrechnung ist ${Math.round(ageMs / 60000)} Minuten alt ` +
                  `(erlaubt: ${Math.round(MAX_AGE_MS / 60000)}).`);
    console.error("  Sie stuetzt sich auf einen Nutzungsstand, den es so nicht mehr geben muss.");
    console.error("  Neu rechnen: node scripts/market/preflight-zero-cost.mjs --operation " + OPERATION);
    process.exit(3);
  }
  if (!pf.verdict || pf.verdict.verdict !== Guard.ALLOWED) {
    console.error(Guard.BLOCKED + ": die Vorabrechnung hat nicht freigegeben " +
                  `(${pf.verdict && pf.verdict.verdict}).`);
    console.error("  Ueberschritten: " + ((pf.verdict && pf.verdict.exceeded) || []).join(", "));
    console.error("  OWNER DECISION REQUIRED.");
    process.exit(3);
  }
  if (pf.operation !== OPERATION) {
    /* Eine Freigabe fuer eine andere Operation ist keine Freigabe.
       Sonst deckte eine Rechnung fuer den Tagesabgleich einen
       vollstaendigen Backfill. */
    console.error(Guard.BLOCKED + `: die Vorabrechnung gilt fuer '${pf.operation}', ` +
                  `dieser Lauf ist '${OPERATION}'.`);
    process.exit(3);
  }
  const b = pf.budgetForRun;
  console.log(`  Vorabrechnung: ${pf.operation} freigegeben ` +
              `(Class A ${b.classAOperations}, Class B ${b.classBOperations})`);
  return { budget: Guard.createBudget(b), preflight: pf };
}

async function makeStore(budget) {
  if (LOCAL_ROOT) {
    const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
    return Store.createHistoryStore({ driver: createFsDriver(LOCAL_ROOT), provider: PROVIDER,
                                      market: MARKET, budget, dryRun: DRY_RUN });
  }
  const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
  return Store.createHistoryStore({ driver: createS3DriverFromEnv(), provider: PROVIDER,
                                    market: MARKET, budget, dryRun: DRY_RUN });
}

function universeMembers() {
  const file = join(root, "quant", "data", "market", "scale", `universe-${GATE}.json`);
  if (!existsSync(file)) {
    console.error(`Kein Gate-Universum unter ${file}.`);
    process.exit(1);
  }
  let list = JSON.parse(readFileSync(file, "utf8")).securities || [];
  if (LIMIT) list = list.slice(0, LIMIT);
  return list.map((s) => ({ ticker: s.ticker, securityId: s.securityId }));
}

function cacheFile(securityId) {
  return join(WORK_DIR, PROVIDER, "daily", securityId + ".json");
}

/** Arbeiter mit fester Breite. Kein Paket dafuer - zwanzig Zeilen. */
async function pool(items, width, fn) {
  let i = 0;
  const results = [];
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await fn(items[idx], idx); }
      catch (err) { results[idx] = { error: String(err.message).slice(0, 300) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length || 1) }, worker));
  return results;
}

async function main() {
  const members = universeMembers();
  const { budget, preflight } = loadBudget();
  const store = await makeStore(budget);
  const started = Date.now();

  console.log(`Vision Universe — Historienablage ${PULL ? "lesen" : "schreiben"}\n`);
  console.log(`  Gate:      ${GATE} (${members.length} Titel)`);
  console.log(`  Ablage:    ${store.driver.kind} ${store.driver.endpoint || ""}`);
  console.log(`  Praefix:   ${store.seriesPrefix}`);
  console.log(`  Kodierung: ${store.codec}\n`);

  const tally = { requested: members.length, ok: 0, missing: 0, skipped: 0, unchanged: 0,
                  failed: 0, bytes: 0, bars: 0 };
  const failures = [];

  if (PULL) {
    const results = await pool(members, CONCURRENCY, async (m) => {
      const series = await store.getSeries(m.ticker);
      if (!series) return { missing: true, ticker: m.ticker };
      if (!DRY_RUN) {
        const file = cacheFile(m.securityId);
        mkdirSync(dirname(file), { recursive: true });
        /* Genau die Form, die market-store.js erwartet. Sie wird hier
           nicht erfunden, sondern aus der Reihe wiederhergestellt. */
        writeFileSync(file, JSON.stringify({
          ticker: series.ticker, securityId: m.securityId, provider: PROVIDER,
          adjustmentStatus: series.adjustmentStatus, barCount: series.bars.length,
          first: series.first, last: series.last,
          updatedAt: new Date().toISOString(),
          restoredFrom: "history-store", bars: series.bars
        }));
      }
      return { ok: true, ticker: m.ticker, bars: series.bars.length };
    });
    for (const r of results) {
      if (!r) continue;
      if (r.error) { tally.failed++; failures.push(r.error); }
      else if (r.missing) tally.missing++;
      else { tally.ok++; tally.bars += r.bars; }
    }
  }

  if (PUSH) {
    const results = await pool(members, CONCURRENCY, async (m) => {
      const file = cacheFile(m.securityId);
      if (!existsSync(file)) return { skipped: true, ticker: m.ticker };
      const payload = JSON.parse(readFileSync(file, "utf8"));
      if (!payload || !Array.isArray(payload.bars) || !payload.bars.length) {
        return { skipped: true, ticker: m.ticker };
      }
      if (DRY_RUN) return { ok: true, ticker: m.ticker, bars: payload.bars.length, bytes: statSync(file).size };
      /* appendSeries statt putSeries: ein zweiter Lauf soll eine
         vorhandene Reihe ergaenzen und nicht ersetzen. Liegt nichts da,
         ist das Ergebnis dasselbe wie ein put. */
      const meta = await store.appendSeries(m.ticker, payload.bars, {
        securityId: m.securityId, provider: PROVIDER,
        adjustmentStatus: payload.adjustmentStatus
      });
      return { ok: true, ticker: m.ticker, bars: meta.barCount, bytes: meta.bytes, meta };
    });

    const symbols = {};
    for (const r of results) {
      if (!r) continue;
      if (r.error) { tally.failed++; failures.push(r.error); }
      else if (r.skipped) tally.skipped++;
      else {
        tally.ok++; tally.bars += r.bars; tally.bytes += r.bytes || 0;
        /* Unveraendert heisst geschrieben-haette-nichts-gebracht. Es
           zaehlt getrennt, damit ein Lauf, der nichts zu tun hatte,
           nicht wie ein Lauf aussieht, der nichts getan hat. */
        if (r.meta && r.meta.skipped) {
          tally.unchanged++;
          /* Ein uebersprungener Titel bekommt KEINEN neuen Indexeintrag.
             Der alte steht schon da und traegt seine Byte-Groesse; ihn
             durch einen Eintrag ohne Groesse zu ersetzen liesse den
             belegten Speicher auf null fallen - und die naechste
             Vorabrechnung haette keine Grundlage mehr. */
        } else if (r.meta) {
          symbols[r.ticker] = r.meta;
        }
      }
    }
    if (!DRY_RUN) {
      const idx = await store.readIndex();
      const merged = Object.assign({}, idx.symbols || {}, symbols);

      /* Der Index wird nur geschrieben, wenn sich etwas geaendert hat.
         Ein Lauf ohne Aenderung soll KEINEN Schreibvorgang kosten. */
      if (Object.keys(symbols).length) {
        const written = await store.writeIndex({ symbols: merged });
        console.log(`  Index:     ${written.symbols} Titel, ${written.bytes} Byte`);
      } else {
        console.log("  Index:     unveraendert, nicht geschrieben");
      }

      /* Der Nutzungsstand dagegen wird IMMER fortgeschrieben - auch nach
         einem Lauf ohne Aenderung. Seine Lesevorgaenge haben stattgefunden
         und zaehlen gegen die Freigrenze; ein Stand, der sie verschweigt,
         laeuft ueber die Monate aus dem Tritt. */
      const month = Guard.monthKey();
      const usage = await store.readUsage(month);
      const spent = store.budget.spent;
      const totalBytes = Object.values(merged).reduce((a, m) => a + (m.bytes || 0), 0);
      await store.writeUsage(Guard.applyUsage(usage, {
        /* +1 fuer den Schreibvorgang, der diesen Stand selbst ablegt.
           Ohne ihn zaehlt die Buchfuehrung sich selbst nicht mit und
           laeuft ueber die Monate langsam aus dem Tritt. */
        classAOperations: spent.classA + 1, classBOperations: spent.classB,
        storageBytes: totalBytes, objectCount: Object.keys(merged).length,
        bytesUploaded: spent.bytesUploaded, bytesDownloaded: spent.bytesDownloaded,
        run: { at: new Date().toISOString(), operation: OPERATION,
               classA: spent.classA, classB: spent.classB,
               runId: process.env.GITHUB_RUN_ID || null }
      }));
      console.log(`  Nutzung:   Monat ${month} fortgeschrieben`);
    }
  }

  const runtimeMs = Date.now() - started;
  console.log(`\n  ok ${tally.ok}   unveraendert ${tally.unchanged}   fehlend ${tally.missing}` +
              `   uebersprungen ${tally.skipped}   Fehler ${tally.failed}`);
  const spent = store.budget.spent;
  console.log(`  Operationen: Class A ${spent.classA}, Class B ${spent.classB}` +
              `, nicht geschrieben ${spent.writesSkipped}`);
  console.log(`  Kerzen ${tally.bars.toLocaleString("de-DE")}` +
              (tally.bytes ? `   Ablage ${(tally.bytes / 1048576).toFixed(1)} MB` : ""));
  console.log(`  Laufzeit ${(runtimeMs / 1000).toFixed(1)} s`);
  if (failures.length) {
    console.log("\n  Erste Fehler:");
    failures.slice(0, 5).forEach((f) => console.log("    " + f));
  }

  if (!DRY_RUN) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      direction: PULL ? "PULL" : "PUSH",
      gate: GATE, provider: PROVIDER, market: MARKET,
      storage: { kind: store.driver.kind, prefix: store.seriesPrefix, codec: store.codec },
      run: { source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
             runId: process.env.GITHUB_RUN_ID || null, runtimeMs },
      tally,
      operation: OPERATION,
      zeroCost: {
        preflight: preflight ? { operation: preflight.operation,
                                 verdict: preflight.verdict.verdict,
                                 generatedAt: preflight.generatedAt } : null,
        spent: store.budget.spent,
        remaining: store.budget.remaining
      },
      failures: failures.slice(0, 20),
      note: "Keine Kursniveaus in diesem Bericht - nur Anzahlen."
    }, null, 2) + "\n");
    console.log(`\n  ${OUT.replace(root + "/", "")}`);
  }

  /* Ein fehlender Titel beim Lesen ist kein Fehler: er ist der Grund,
     warum der Gate-Lauf ihn danach holt. Ein FEHLER ist ein Fehler. */
  if (tally.failed) process.exit(1);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
