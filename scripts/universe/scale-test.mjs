/* =========================================================================
   VISION UNIVERSE — scale-test.mjs   (§47)

   Ein Test mit zehn Fixtures beweist, dass der Code laeuft. Er beweist
   nicht, dass er bei 25.000 Instrumenten laeuft - und genau das ist die
   Frage, wenn ein Universum nicht mehr bei 500 aufhoert.

   Gemessen wird an SYNTHETISCHEN Zeilen, und das ist Absicht: der Test
   soll ohne Anbieterzugang und ohne die Arbeitsablage laufen, und er soll
   eine Groesse pruefen koennen, die es heute noch nicht gibt. Die Zeilen
   sehen aus wie Anbieterzeilen (Kuerzel, Boerse, assetType, Waehrung,
   Start-/Enddatum) und durchlaufen dieselbe Klassifikation, denselben
   Sync und denselben Indexbau wie echte.

   Was gemessen wird:
     Normalisierung · Erstsync · Wiederholungssync (Idempotenz) ·
     Qualitaetsbericht · Suchindexbau · Serialisierung · Suchlaufzeit ·
     Speicher

   Ausfuehren:
     node scripts/universe/scale-test.mjs
     node scripts/universe/scale-test.mjs --n 50000
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const Master = require(join(root, "quant", "engines", "company-master.js"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const N = parseInt(arg("--n", "25000"), 10);
const OUT = join(root, arg("--out", "quant/data/universe/scale-test.json"));
const TODAY = "2026-09-12";

const EXCHANGES = ["NASDAQ", "NYSE", "AMEX", "BATS", "NYSE ARCA", "PINK", "OTCQB"];
const ASSET_TYPES = ["Stock", "Stock", "Stock", "Stock", "ETF", "Mutual Fund"];
const WORDS = ["Nordic", "Vertex", "Harbor", "Quantum", "Cedar", "Atlas", "Beacon",
               "Lumen", "Pioneer", "Summit", "Orion", "Delta", "Granite", "Vector"];
const SUFFIX = ["Systems", "Holdings Inc", "Therapeutics", "Energy Corp", "Bancorp",
                "Technologies", "Resources", "Industries", "Capital Trust"];

/* Deterministisch: derselbe Lauf ergibt dieselben Zeilen, sonst ist eine
   Laufzeit von gestern mit einer von heute nicht vergleichbar. */
function makeRows(n) {
  const rand = require(join(root, "quant", "engines", "hash.js")).mulberry32(20260912);
  const rows = [];
  const used = new Set();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  while (rows.length < n) {
    let len = 2 + Math.floor(rand() * 3);
    let t = "";
    for (let i = 0; i < len; i++) t += letters[Math.floor(rand() * 26)];
    const exchange = EXCHANGES[Math.floor(rand() * EXCHANGES.length)];
    const key = t + "@" + exchange;
    if (used.has(key)) continue;
    used.add(key);
    const startYear = 1980 + Math.floor(rand() * 40);
    const delisted = rand() < 0.08;
    const endYear = startYear + 1 + Math.floor(rand() * (2025 - startYear));
    const named = rand() < 0.7;
    rows.push({
      ticker: t,
      exchange,
      assetType: ASSET_TYPES[Math.floor(rand() * ASSET_TYPES.length)],
      priceCurrency: rand() < 0.95 ? "USD" : "CNY",
      startDate: `${startYear}-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}`,
      endDate: delisted ? `${endYear}-06-15` : "",
      name: named
        ? WORDS[Math.floor(rand() * WORDS.length)] + " " + SUFFIX[Math.floor(rand() * SUFFIX.length)]
        : null,
      provider: "synthetic"
    });
  }
  return rows;
}

function mb(bytes) { return Math.round(bytes / 1048576 * 10) / 10; }

function main() {
  console.log(`Vision Universe — Scale Test ueber ${N} Instrumente\n`);
  const heap0 = process.memoryUsage().heapUsed;

  const tGen = Date.now();
  const rows = makeRows(N);
  const genMs = Date.now() - tGen;

  const tNorm = Date.now();
  const incoming = rows.map((r) => Master.toInstrument(r, { today: TODAY, provider: "synthetic" }));
  const normalizeMs = Date.now() - tNorm;

  const tSync = Date.now();
  const first = Master.syncUniverse({ previous: [], incoming, today: TODAY, provider: "synthetic" });
  const syncColdMs = Date.now() - tSync;

  const tResync = Date.now();
  const second = Master.syncUniverse({ previous: first.instruments, incoming, today: TODAY,
                                       provider: "synthetic" });
  const syncWarmMs = Date.now() - tResync;

  const idempotent = second.counts.unchanged === first.instruments.length &&
                     second.counts.new === 0 && second.counts.updated === 0 &&
                     second.counts.delisted === 0;

  /* Ein Teil-Eingang: die Haelfte verschwindet aus dem Verzeichnis. Das
     darf nicht loeschen, sondern muss beenden (§11, §15). */
  const tPartial = Date.now();
  const half = incoming.filter((_, i) => i % 2 === 0);
  const third = Master.syncUniverse({ previous: first.instruments, incoming: half, today: TODAY,
                                      provider: "synthetic" });
  const syncPartialMs = Date.now() - tPartial;
  const nothingLost = third.instruments.length === first.instruments.length;

  const tQual = Date.now();
  const quality = Master.qualityReport(first.instruments);
  const qualityMs = Date.now() - tQual;

  const tIndex = Date.now();
  const shards = new Map();
  const searchShards = new Map();
  for (const inst of first.instruments) {
    const k = Master.shardKey(inst.symbol);
    (shards.get(k) || shards.set(k, []).get(k)).push(inst);
    (searchShards.get(k) || searchShards.set(k, []).get(k)).push(Master.searchEntry(inst));
  }
  const indexMs = Date.now() - tIndex;

  const tSer = Date.now();
  let masterBytes = 0, searchBytes = 0, biggestShard = 0;
  for (const [, v] of shards) {
    const b = Buffer.byteLength(JSON.stringify(v));
    masterBytes += b;
  }
  for (const [, v] of searchShards) {
    const b = Buffer.byteLength(JSON.stringify(v));
    searchBytes += b;
    if (b > biggestShard) biggestShard = b;
  }
  const serializeMs = Date.now() - tSer;

  /* Die Suche, wie der Browser sie fuehrt: EINE Scherbe laden, darin
     suchen. Nicht das ganze Universum. */
  const probeSymbols = first.instruments
    .filter((_, i) => i % Math.max(1, Math.floor(first.instruments.length / 200)) === 0)
    .slice(0, 200).map((i) => i.symbol);
  const tSearch = Date.now();
  let hits = 0;
  for (const q of probeSymbols) {
    const entries = searchShards.get(Master.shardKey(q)) || [];
    const m = Master.rankMatches(entries, q, 20);
    if (m.length && m[0].s === q) hits++;
  }
  const searchMs = Date.now() - tSearch;

  const heap = process.memoryUsage();
  const counts = {};
  for (const i of first.instruments) counts[i.securityType] = (counts[i.securityType] || 0) + 1;

  const report = {
    version: Master.VERSION,
    generatedAt: new Date().toISOString(),
    note: "§47. Synthetische Instrumente durch dieselbe Klassifikation, denselben Sync und " +
          "denselben Indexbau wie echte. Die Zahlen sagen etwas ueber die Pipeline, nichts " +
          "ueber einen Markt.",
    universe: {
      requested: N, built: first.instruments.length,
      byType: counts,
      shards: shards.size, searchShards: searchShards.size
    },
    timingsMs: {
      generateRows: genMs,
      normalize: normalizeMs,
      syncCold: syncColdMs,
      syncWarmIdempotent: syncWarmMs,
      syncPartialDelisting: syncPartialMs,
      qualityReport: qualityMs,
      buildIndexes: indexMs,
      serialize: serializeMs,
      search200Queries: searchMs
    },
    perInstrumentMs: {
      normalize: Math.round(normalizeMs / N * 1000) / 1000,
      syncCold: Math.round(syncColdMs / N * 1000) / 1000
    },
    idempotency: {
      pass: idempotent,
      secondRun: second.counts,
      note: "Ein zweiter Lauf auf demselben Eingang muss ausschliesslich UNCHANGED liefern (§14)."
    },
    delisting: {
      pass: nothingLost,
      inputHalved: half.length,
      stillInMaster: third.instruments.length,
      markedDelisted: third.counts.delisted,
      note: "Die Haelfte des Eingangs weggenommen: kein Instrument verschwindet, die fehlenden " +
            "werden beendet (§11)."
    },
    search: {
      queries: probeSymbols.length,
      exactFirstHit: hits,
      msPerQuery: Math.round(searchMs / Math.max(1, probeSymbols.length) * 1000) / 1000,
      note: "Jede Anfrage laedt genau eine Scherbe - nicht das Universum."
    },
    size: {
      masterMB: mb(masterBytes),
      searchIndexMB: mb(searchBytes),
      bytesPerInstrument: Math.round(masterBytes / N),
      largestSearchShardKB: Math.round(biggestShard / 1024),
      note: "Die groesste Suchscherbe ist die Zahl, die der Browser wirklich laedt."
    },
    memory: {
      heapUsedMB: mb(heap.heapUsed),
      heapGrowthMB: mb(heap.heapUsed - heap0),
      rssMB: mb(heap.rss)
    },
    quality: { blocking: quality.blocking, findings: quality.findings }
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

  console.log(`  Normalisierung  ${normalizeMs} ms  (${report.perInstrumentMs.normalize} ms/Titel)`);
  console.log(`  Sync kalt       ${syncColdMs} ms`);
  console.log(`  Sync wiederholt ${syncWarmMs} ms   idempotent: ${idempotent ? "ja" : "NEIN"}`);
  console.log(`  Haelfte weg     ${syncPartialMs} ms   nichts verloren: ${nothingLost ? "ja" : "NEIN"} ` +
              `(${third.counts.delisted} beendet)`);
  console.log(`  Qualitaet       ${qualityMs} ms`);
  console.log(`  Index           ${indexMs} ms  (${shards.size} Scherben)`);
  console.log(`  Serialisierung  ${serializeMs} ms  ${report.size.masterMB} MB Master, ` +
              `${report.size.searchIndexMB} MB Suchindex`);
  console.log(`  Suche           ${report.search.msPerQuery} ms je Anfrage, ` +
              `${hits}/${probeSymbols.length} exakt an erster Stelle`);
  console.log(`  Groesste Suchscherbe ${report.size.largestSearchShardKB} KB`);
  console.log(`  Speicher        ${report.memory.heapUsedMB} MB Heap, ${report.memory.rssMB} MB RSS`);
  console.log(`\n  ${OUT.replace(root + "/", "")}`);

  if (!idempotent || !nothingLost || quality.blocking) process.exit(1);
}

main();
