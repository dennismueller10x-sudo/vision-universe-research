/* =========================================================================
   VISION UNIVERSE — build-fx-history.mjs   (Currency Layer, O-1/O-3)

   HOLT DIE WAEHRUNGSPAAR-ZEITREIHEN, DIE DER BESTAND BRAUCHT.

   Zentral, einmal je Paar. Nicht je Aktie (§8): eine USD/EUR-Reihe
   bedient 10.790 Titel, und sechs Kopien davon haben zwei Zustaende -
   gleich oder auseinandergelaufen - ohne dass man ihnen ansieht, welchen.

   WAS ES NICHT TUT

   Es entscheidet nicht, welche Paare gebraucht werden. Das steht in
   pair-requirements.json und ist aus dem Bestand abgeleitet (O-3).
   Kommt ein Titel mit neuer Berichtswaehrung hinzu, taucht das Paar dort
   auf, und dieses Skript holt es - ohne dass jemand eine Liste pflegt.

   Es laeuft auch NICHT gegen eine ungepruefte Faehigkeit. Ohne
   gemessenes fxDaily/fxHistoricalDaily bricht es ab und sagt, welcher
   Lauf fehlt. Ein Import, der auf Verdacht 60 Paare anfragt und an
   HTTP 403 scheitert, hat das Kontingent verbraucht und nichts gelernt.

   LIZENZ

   Was hier entsteht, sind Anbieterreihen. Sie gehoeren nicht in einen
   oeffentlich ausgelieferten Pfad, solange die Lizenzfrage nicht mit
   Datum und Grundlage in display-policy.js steht. Standardziel ist
   deshalb die Arbeitsablage; --publish ist eine bewusste Handlung.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/build-fx-history.mjs
     TIINGO_API_KEY=... node scripts/market/build-fx-history.mjs --required-only
     node scripts/market/build-fx-history.mjs --dry-run
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Rates = require(join(ROOT, "quant", "engines", "fx", "fx-rates.js"));
const Capabilities = require(join(ROOT, "quant", "engines", "capabilities.js"));

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const DRY_RUN = flags.has("--dry-run");
const PUBLISH = flags.has("--publish");
const REQUIRED_ONLY = flags.has("--required-only");
const startArg = args.find((a) => a.startsWith("--start="));
const START = startArg ? startArg.slice("--start=".length) : "2015-01-01";
const maxArg = args.find((a) => a.startsWith("--max-pairs="));
const MAX_PAIRS = maxArg ? Number(maxArg.slice("--max-pairs=".length)) : 40;

const BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
const KEY = process.env.TIINGO_API_KEY || "";

const OUT_DIR = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "fx")
  : resolve(ROOT, ".market-cache", "currency", "fx");

function readFirst(...candidates) {
  for (const file of candidates) {
    if (existsSync(file)) return { file, data: JSON.parse(readFileSync(file, "utf8")) };
  }
  return null;
}

const requirements = readFirst(
  resolve(ROOT, "quant", "data", "market", "fx", "pair-requirements.json"),
  resolve(ROOT, ".market-cache", "currency", "pair-requirements.json"));

if (!requirements) {
  console.error("Kein Paarbedarf gefunden. Erst ausfuehren:");
  console.error("  node scripts/market/build-fx-pair-requirements.mjs");
  process.exit(1);
}

const probe = readFirst(
  resolve(ROOT, "quant", "data", "market", "capabilities", "tiingo-fx-probe.json"),
  resolve(ROOT, ".market-cache", "currency", "tiingo-fx-probe.json"));

/* Die Sperre: ohne belegte Faehigkeit wird nicht importiert. */
if (!DRY_RUN) {
  const caps = probe && probe.data.capabilities;
  const declaration = Capabilities.declare("tiingo", { fx: caps || {} });
  const needed = ["fxDaily", "fxHistoricalDaily"];
  const missing = needed.filter((c) => !Capabilities.supports(declaration, "fx", c));
  if (missing.length) {
    console.error("ABBRUCH: die noetigen FX-Faehigkeiten sind nicht belegt.");
    console.error(`  Ungeprueft oder nicht vorhanden: ${missing.join(", ")}`);
    console.error("  Erst messen: node scripts/market/probe-tiingo-fx.mjs (mit TIINGO_API_KEY)");
    console.error("  Ein Import auf Verdacht verbraucht Kontingent und lernt nichts.");
    process.exit(2);
  }
  if (!KEY) {
    console.error("ABBRUCH: TIINGO_API_KEY fehlt. Der Import laeuft nur mit Zugang.");
    process.exit(2);
  }
}

const pairs = (requirements.data.pairs || [])
  .filter((p) => !REQUIRED_ONLY || p.priority === "REQUIRED")
  .slice(0, MAX_PAIRS);

/* Ein Paar wird nur EINMAL geholt. USD/EUR und EUR/USD tragen dieselbe
   Information; die Gegenrichtung entsteht in fx-rates.js durch
   Inversion und nicht durch eine zweite Anfrage. Das halbiert das
   Kontingent, ohne eine Zahl zu verlieren. */
const canonical = new Map();
for (const p of pairs) {
  const key = [p.base, p.quote].sort().join("|");
  if (!canonical.has(key)) canonical.set(key, { base: p.base, quote: p.quote, securities: p.securities, priority: p.priority });
  else canonical.get(key).securities += p.securities;
}
const toFetch = [...canonical.values()].sort((a, b) => b.securities - a.securities);

function tiingoTicker(base, quote) { return (base + quote).toLowerCase(); }

let requests = 0;
const results = [];

async function fetchPair(pair) {
  const ticker = tiingoTicker(pair.base, pair.quote);
  const url = `${BASE}/tiingo/fx/${ticker}/prices?resampleFreq=1day&startDate=${START}`;
  requests++;
  const res = await fetch(url, { headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" } });
  if (!res.ok) {
    return { pair, ok: false, httpStatus: res.status,
             reason: res.status === 404 ? "pairNotServed" : `http${res.status}` };
  }
  const body = await res.json();
  if (!Array.isArray(body) || !body.length) return { pair, ok: false, reason: "emptyResponse" };

  /* Der Tagesschluss ist der Referenzkurs. Bewusst close und nicht mid
     aus dem Quote-Endpunkt: ein Schlusskurs ist reproduzierbar, ein
     Mittelkurs von jetzt ist es nicht - und §8 verlangt, dass ein Wert
     aus 2021 morgen dieselbe Zahl ergibt. */
  const points = body
    .map((row) => [String(row.date || "").slice(0, 10), Number(row.close)])
    .filter(([date, rate]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(rate) && rate > 0);

  /* Gegenprobe im eigenen Store, bevor etwas geschrieben wird: eine
     Reihe, die der Store nicht annimmt, hat hier nichts verloren. */
  const store = Rates.createStore();
  const stats = store.ingest(pair.base, pair.quote, points, { source: "tiingo", frequency: "DAILY" });

  return { pair, ok: true, points, stats, rawRows: body.length };
}

async function main() {
  if (DRY_RUN) {
    console.log(`--dry-run: ${toFetch.length} kanonische Paare waeren zu holen (aus ${pairs.length} Richtungen).`);
    for (const p of toFetch.slice(0, 15)) {
      console.log(`  ${p.base}/${p.quote}  ${tiingoTicker(p.base, p.quote)}  ${p.securities} Titel  ${p.priority}`);
    }
    console.log(`\nKontingent: ${toFetch.length} Anfragen ab ${START}.`);
    process.exit(0);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const asOf = new Date().toISOString();

  for (const pair of toFetch) {
    const result = await fetchPair(pair);
    results.push(result);
    if (!result.ok) {
      console.log(`  ${pair.base}/${pair.quote}  --  ${result.reason}`);
      continue;
    }
    const file = join(OUT_DIR, `${pair.base}${pair.quote}.json`);
    writeFileSync(file, JSON.stringify({
      schema: "vu-fx-series-1.0.0",
      base: pair.base, quote: pair.quote,
      source: "tiingo", frequency: "DAILY",
      priceBasis: "daily close",
      asOf,
      first: result.stats.first, last: result.stats.last,
      observations: result.stats.observations,
      rejectedRows: result.stats.rejectedRows,
      duplicateDates: result.stats.duplicateDates,
      securitiesServed: pair.securities,
      points: result.points
    }, null, 2) + "\n");
    console.log(`  ${pair.base}/${pair.quote}  ok  ${result.stats.observations} Zeilen  ${result.stats.first} .. ${result.stats.last}`);
  }

  const ok = results.filter((r) => r.ok);
  const summary = {
    schema: "vu-fx-history-run-1.0.0",
    generatedAtUtc: asOf,
    startDate: START,
    outputDir: OUT_DIR.replace(ROOT + "/", ""),
    published: PUBLISH,
    requests,
    pairsAttempted: toFetch.length,
    pairsWritten: ok.length,
    pairsFailed: results.filter((r) => !r.ok).map((r) => ({ pair: `${r.pair.base}/${r.pair.quote}`, reason: r.reason, httpStatus: r.httpStatus })),
    totalObservations: ok.reduce((n, r) => n + r.stats.observations, 0)
  };
  writeFileSync(join(OUT_DIR, "_run.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log(`\n${ok.length} von ${toFetch.length} Paaren geschrieben, ${summary.totalObservations} Beobachtungen, ${requests} Anfragen.`);
  console.log(`Ziel: ${summary.outputDir}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
