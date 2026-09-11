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

if (PULL === PUSH) {
  console.error("Genau eine Richtung angeben: --pull oder --push.");
  process.exit(2);
}

async function makeStore() {
  if (LOCAL_ROOT) {
    const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
    return Store.createHistoryStore({ driver: createFsDriver(LOCAL_ROOT), provider: PROVIDER, market: MARKET });
  }
  const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
  return Store.createHistoryStore({ driver: createS3DriverFromEnv(), provider: PROVIDER, market: MARKET });
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
  const store = await makeStore();
  const started = Date.now();

  console.log(`Vision Universe — Historienablage ${PULL ? "lesen" : "schreiben"}\n`);
  console.log(`  Gate:      ${GATE} (${members.length} Titel)`);
  console.log(`  Ablage:    ${store.driver.kind} ${store.driver.endpoint || ""}`);
  console.log(`  Praefix:   ${store.seriesPrefix}`);
  console.log(`  Kodierung: ${store.codec}\n`);

  const tally = { requested: members.length, ok: 0, missing: 0, skipped: 0, failed: 0, bytes: 0, bars: 0 };
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
        if (r.meta) symbols[r.ticker] = r.meta;
      }
    }
    if (!DRY_RUN && Object.keys(symbols).length) {
      const idx = await store.readIndex();
      const merged = Object.assign({}, idx.symbols || {}, symbols);
      const written = await store.writeIndex({ symbols: merged });
      console.log(`  Index:     ${written.symbols} Titel, ${written.bytes} Byte`);
    }
  }

  const runtimeMs = Date.now() - started;
  console.log(`\n  ok ${tally.ok}   fehlend ${tally.missing}   uebersprungen ${tally.skipped}   Fehler ${tally.failed}`);
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
