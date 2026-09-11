/* =========================================================================
   VISION UNIVERSE — validate-history-store.mjs

   Nach dem Backfill: taugt der Speicher wirklich?

   Der Unterschied zu verify-history-store.mjs ist der Gegenstand. Der
   Nachweis prueft die BAUART an einer Stichprobe in einem Wegwerfpfad.
   Diese Datei prueft den ECHTEN BESTAND: ist jeder Titel des Universums
   da, laesst er sich lesen, und stimmt, was drinsteht.

   Sie schreibt nichts. Sie liest, zaehlt und urteilt.

   WARUM STICHPROBEN UND NICHT ALLES

   7.800 Objekte vollstaendig zu entpacken kostet 7.800 GET und viel
   Zeit. Der Index und HEAD beantworten die meisten Fragen ohne das.
   Vollstaendig geprueft - also entpackt und nachgerechnet - wird eine
   Zufallsstichprobe, ausdruecklich AUSSERHALB der Golden Five: die fuenf
   sind ueberall geprueft und sagen nichts mehr ueber die anderen 7.795.

   Ausfuehren:
     node scripts/market/validate-history-store.mjs
     node scripts/market/validate-history-store.mjs --sample 25
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Store = require(join(root, "quant", "engines", "history-store.js"));
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(n, d = null) { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; }
const GATE = arg("--gate", "FULL_UNIVERSE");
const PROVIDER = arg("--provider", "tiingo");
const MARKET = arg("--market", "US");
const SAMPLE = parseInt(arg("--sample", "20"), 10) || 20;
const LOCAL_ROOT = arg("--local-root", null);
const OUT = arg("--out", join(root, "quant", "data", "market", "history", "validation.json"));
/* Eine Kerze je Handelstag, ein Jahr: darunter ist SMA200 nicht
   rechenbar und ein Chart zeigt weniger als ein Jahr. Dieselbe Schwelle
   wie in tiingo-scale.json (historyCoverageMinBars). */
const MIN_BARS_FOR_CHART = parseInt(
  arg("--min-bars", String((SCALE.pass && SCALE.pass.historyCoverageMinBars) || 250)), 10);

const checks = [];
function check(id, ok, detail) {
  checks.push({ id, status: ok ? "PASS" : "FAIL", detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${id.padEnd(32)} ${detail || ""}`);
  return ok;
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

function universeMembers() {
  const file = join(root, "quant", "data", "market", "scale", `universe-${GATE}.json`);
  if (!existsSync(file)) { console.error("Kein Universum unter " + file); process.exit(1); }
  return (JSON.parse(readFileSync(file, "utf8")).securities || [])
    .map((s) => ({ ticker: String(s.ticker).toUpperCase(), securityId: s.securityId }));
}

/* Ein Zufallsgenerator mit Saat: dieselbe Stichprobe bei gleichem Lauf,
   damit ein Befund nachvollziehbar ist. */
function seededPick(list, n, seed) {
  let s = seed >>> 0;
  const copy = list.slice();
  const out = [];
  while (out.length < Math.min(n, copy.length)) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out.push(copy.splice(s % copy.length, 1)[0]);
  }
  return out;
}

async function main() {
  console.log("Vision Universe — Pruefung des dauerhaften Historienspeichers\n");

  const members = universeMembers();
  const wanted = new Set(members.map((m) => m.ticker));
  /* Lesen kostet Class B. Grosszuegig, aber begrenzt. */
  const budget = Guard.createBudget({
    classAOperations: 50,
    classBOperations: members.length * 2 + SAMPLE * 4 + 500
  });
  const store = await makeStore(budget);

  console.log(`  Universum: ${members.length} Titel (${GATE})`);
  console.log(`  Ablage:    ${store.driver.kind} ${store.driver.endpoint || ""}`);
  console.log(`  Praefix:   ${store.seriesPrefix}\n`);

  /* ------------------------------------------------ Bestand aufnehmen */
  const index = await store.rebuildIndexFromStorage({ expectedObjects: members.length + 100 });
  const stored = index.symbols;
  const storedTickers = Object.keys(stored);

  let storageBytes = 0;
  for (const s of Object.values(stored)) storageBytes += s.bytes || 0;

  const missing = members.filter((m) => !stored[m.ticker]).map((m) => m.ticker);
  const extra = storedTickers.filter((t) => !wanted.has(t));

  check("ALL_UNIVERSE_SYMBOLS_STORED", missing.length === 0,
        `${storedTickers.length} gespeichert, ${missing.length} fehlen` +
        (missing.length ? ` (z.B. ${missing.slice(0, 5).join(", ")})` : ""));

  /* Doppelte Schluessel: zwei Objekte, die auf denselben Ticker
     zurueckfuehren. Bei korrekter Schluesselbildung unmoeglich - und
     genau deshalb geprueft. */
  const keyCounts = {};
  for (const s of Object.values(stored)) keyCounts[s.key] = (keyCounts[s.key] || 0) + 1;
  const duplicateKeys = Object.keys(keyCounts).filter((k) => keyCounts[k] > 1);
  check("NO_DUPLICATE_KEYS", duplicateKeys.length === 0,
        `${Object.keys(keyCounts).length} eindeutige Schluessel`);

  /* Metadaten vollstaendig? Ohne first/last/bars ist ein Objekt zwar da,
     aber der Fortsetzungsplan kann es nicht einordnen. */
  const withoutMeta = Object.values(stored).filter((s) => !s.last || !s.barCount);
  check("METADATA_COMPLETE", withoutMeta.length === 0,
        `${storedTickers.length - withoutMeta.length}/${storedTickers.length} mit first/last/bars`);

  /* ------------------------------------------- Stichprobe: wirklich lesbar?

     Ausdruecklich ausserhalb der Golden Five. Die fuenf sind ueberall
     geprueft; sie sagen nichts mehr ueber die anderen. */
  const golden = new Set((SCALE.canary && SCALE.canary.symbols) || []);
  const candidates = storedTickers.filter((t) => !golden.has(t));
  const sample = seededPick(candidates, SAMPLE, 20260911);

  let roundTripOk = 0, corrupt = 0;
  const corruptDetail = [];
  const sampleRows = [];
  for (const ticker of sample) {
    try {
      const series = await store.getSeries(ticker);
      if (!series || !Array.isArray(series.bars) || !series.bars.length) {
        corrupt++; corruptDetail.push(ticker + ": leer"); continue;
      }
      const dates = series.bars.map((b) => b.date);
      const uniq = new Set(dates);
      const sorted = dates.every((d, i) => i === 0 || dates[i - 1] <= d);
      const meta = stored[ticker];
      const problems = [];
      if (uniq.size !== dates.length) problems.push("doppelte Tage");
      if (!sorted) problems.push("unsortiert");
      if (meta.barCount && meta.barCount !== series.bars.length) problems.push("barCount weicht ab");
      if (meta.last && meta.last !== dates[dates.length - 1]) problems.push("last weicht ab");
      /* Kerzen aus der Zukunft sind ein Anbieter- oder Rechenfehler und
         faelschen jeden Momentumwert. */
      const today = new Date().toISOString().slice(0, 10);
      if (dates[dates.length - 1] > today) problems.push("Kerze in der Zukunft");
      if (problems.length) { corrupt++; corruptDetail.push(ticker + ": " + problems.join(", ")); }
      else roundTripOk++;
      sampleRows.push({ ticker, bars: series.bars.length, first: dates[0],
                        last: dates[dates.length - 1], bytes: meta.bytes });
    } catch (err) {
      corrupt++; corruptDetail.push(ticker + ": " + String(err.message).slice(0, 120));
    }
  }
  check("SAMPLE_ROUND_TRIP", corrupt === 0,
        `${roundTripOk}/${sample.length} Stichproben gelesen und geprueft` +
        (corrupt ? `, ${corrupt} auffaellig` : "") + " (ausserhalb der Golden Five)");

  /* ----------------------------------------------------- Chartbereitschaft */
  const chartReady = members.filter((m) => {
    const s = stored[m.ticker];
    return s && s.barCount && s.barCount >= MIN_BARS_FOR_CHART;
  });
  const chartMissing = members.length - chartReady.length;
  const chartPercent = members.length ? +((chartReady.length / members.length) * 100).toFixed(2) : 0;
  check("CHART_READY", chartMissing === 0,
        `${chartReady.length}/${members.length} mit mindestens ${MIN_BARS_FOR_CHART} Kerzen (${chartPercent} %)`);

  /* ---------------------------------------------------------- Zeitraum */
  let oldest = null, newest = null, totalBars = 0;
  const lengths = [];
  for (const s of Object.values(stored)) {
    if (s.first && (!oldest || s.first < oldest)) oldest = s.first;
    if (s.last && (!newest || s.last > newest)) newest = s.last;
    if (s.barCount) { totalBars += s.barCount; lengths.push(s.barCount); }
  }
  lengths.sort((a, b) => a - b);
  const pctl = (p) => lengths.length ? lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * p))] : null;

  /* ------------------------------------------------ Nullkostenschranke */
  const usage = await store.readUsage(Guard.monthKey());
  const verdict = Guard.evaluate({
    operation: "VALIDATION", estimate: Guard.estimateOperations({ kind: "VALIDATION" }),
    usage, currentStorageBytes: storageBytes
  });
  check("ZERO_COST_WITHIN_CEILING", verdict.verdict === Guard.ALLOWED,
        `Speicher ${(storageBytes / 1e9).toFixed(2)} GB, ` +
        `Class A ${usage.classAOperations.toLocaleString("de-DE")}, ` +
        `Class B ${usage.classBOperations.toLocaleString("de-DE")}`);

  const report = {
    generatedAt: new Date().toISOString(),
    validation: "HISTORY_STORE_FULL",
    gate: GATE, provider: PROVIDER, market: MARKET,
    storage: { kind: store.driver.kind, prefix: store.seriesPrefix, codec: store.codec },
    counts: {
      universeSymbols: members.length,
      storedSymbols: storedTickers.length,
      storedObjects: index.rebuiltFrom ? index.rebuiltFrom.objects : storedTickers.length,
      indexCount: storedTickers.length,
      missingExpected: missing.length,
      extraNotInUniverse: extra.length,
      duplicateKeys: duplicateKeys.length,
      corruptObjects: corrupt,
      failedRoundTrips: corrupt,
      metadataIncomplete: withoutMeta.length
    },
    storageBytes,
    storageGB: +(storageBytes / 1e9).toFixed(3),
    bars: {
      total: totalBars,
      averagePerSymbol: lengths.length ? Math.round(totalBars / lengths.length) : 0,
      shortest: lengths[0] || null, longest: lengths[lengths.length - 1] || null,
      p10: pctl(0.1), median: pctl(0.5), p90: pctl(0.9),
      oldestDate: oldest, newestDate: newest
    },
    chartReadiness: {
      HISTORICAL_SERIES_READY: chartReady.length,
      HISTORICAL_SERIES_MISSING: chartMissing,
      CHART_READY_PERCENT: chartPercent,
      minBarsRequired: MIN_BARS_FOR_CHART
    },
    sample: { requested: SAMPLE, checked: sample.length, ok: roundTripOk, corrupt,
              excludedGoldenFive: [...golden], rows: sampleRows.slice(0, 25),
              problems: corruptDetail.slice(0, 20) },
    missingSymbols: missing.slice(0, 200),
    zeroCost: verdict,
    budgetSpent: store.budget.spent,
    checks,
    redistribution: { priceLevels: "NONE_IN_THIS_REPORT",
                      note: "Anzahlen, Datumsgrenzen und Byte-Groessen. Keine Kurse." }
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

  console.log("\n  ── Bestand ──────────────────────────────────");
  console.log(`  Titel gespeichert   ${storedTickers.length}`);
  console.log(`  Objekte             ${report.counts.storedObjects}`);
  console.log(`  Speicher            ${report.storageGB} GB`);
  console.log(`  Kerzen gesamt       ${totalBars.toLocaleString("de-DE")}`);
  console.log(`  Historienlaenge     kuerzeste ${report.bars.shortest}, Median ${report.bars.median}, laengste ${report.bars.longest}`);
  console.log(`  Zeitraum            ${oldest} bis ${newest}`);
  console.log(`  Chartbereit         ${chartReady.length} (${chartPercent} %)`);
  console.log(`\n  ${OUT.replace(root + "/", "")}`);

  const failed = checks.filter((c) => c.status === "FAIL");
  console.log(`\n  ${checks.length - failed.length}/${checks.length} Pruefungen bestanden.`);
  if (failed.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
