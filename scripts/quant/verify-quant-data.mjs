/* =========================================================================
   VISION UNIVERSE QUANT — verify-quant-data.mjs

   Prueft, dass die ausgelieferten Dateien in quant/data/** noch zu den
   Engines passen.

   Der Grund: Ranking, Screener und Radar lesen praekomputiertes JSON,
   Backtests rechnen live. Driften beide auseinander — etwa weil eine
   Faktorgewichtung geaendert, das Skript aber nicht neu ausgefuehrt wurde —
   zeigt die Uebersicht andere Scores als der Backtest. Das waere ein
   stiller Datenfehler, und still ist die schlimmste Sorte.

   Ausfuehren:  node scripts/quant/verify-quant-data.mjs
   ========================================================================= */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const Generator = require(join(engines, "mock-generator.js"));
const MockProvider = require(join(engines, "mock-provider.js"));
const Factors = require(join(engines, "factors.js"));
const QuantScore = require(join(engines, "quant-score.js"));
const Methodology = require(join(engines, "methodology.js"));

const dataDir = join(root, "quant", "data");
const read = (name) => JSON.parse(readFileSync(join(dataDir, name), "utf8"));

const problems = [];
function check(condition, message) {
  if (!condition) problems.push(message);
}

const meta = read("meta.json");
const securities = read("securities.json");
const rankings = read("rankings.json");
const radar = read("radar.json");
const history = read("score-history.json");

console.log("Vision Universe Quant — Datenpruefung\n");
console.log(`  Datenstand ${meta.asOf}, Snapshot ${meta.dataSnapshotId}, Seed "${meta.seed}"`);

/* 1) Methodikversionen stimmen ueberein. */
check(meta.methodologyVersions.quant === Methodology.quant().methodologyVersion,
  `Methodikversion der Daten (${meta.methodologyVersions.quant}) weicht von quant-v1.json ` +
  `(${Methodology.quant().methodologyVersion}) ab — bitte scripts/quant/build-quant-data.mjs neu ausfuehren.`);

/* 2) Der Datensatz laesst sich aus demselben Seed reproduzieren. */
const dataset = Generator.generateDataset({ seed: meta.seed });
check(dataset.meta.dataSnapshotId === meta.dataSnapshotId,
  `Der Generator erzeugt Snapshot ${dataset.meta.dataSnapshotId}, ausgeliefert ist ${meta.dataSnapshotId}. ` +
  `Die Daten sind veraltet — bitte neu erzeugen.`);

/* 3) Stichprobe: die gelieferten Scores entsprechen der Engine. */
const provider = MockProvider.createMockProvider({ dataset });
const metricPanel = Factors.computeMetricPanel({
  securities: provider.getSecurities({ asOf: meta.asOf }).data,
  pricePanel: provider.getPricePanel().data,
  factPanel: provider.getFactPanel({ asOf: meta.asOf, quarters: 9 }).data,
  asOf: meta.asOf
});
const scorePanel = QuantScore.computeScorePanel({ metricPanel, dataSnapshotId: meta.dataSnapshotId });

let compared = 0, deviations = 0, referenceRows = 0;
const listedToday = new Set(provider.getSecurities({ asOf: meta.asOf }).data.map((s) => s.securityId));

for (const row of securities.rows) {
  /* Referenzzeilen historischer Titel tragen bewusst keinen Score. Sie
     muessen aber wirklich nicht mehr gelistet sein — sonst waere hier ein
     Titel stillschweigend aus der Bewertung gefallen. */
  if (row.quantStatus === "not_listed") {
    referenceRows++;
    check(!listedToday.has(row.securityId),
      `${row.ticker} ist als "not_listed" markiert, war am ${meta.asOf} aber gelistet`);
    check(row.quantScore === null, `${row.ticker} ist "not_listed", traegt aber einen Score`);
    check(!!row.lastTradingDate, `${row.ticker} ist "not_listed" ohne letzten Handelstag`);
    continue;
  }
  const computed = scorePanel.byId[row.securityId];
  if (!computed) { problems.push(`${row.ticker} fehlt in der Neuberechnung`); continue; }
  compared++;
  const a = row.quantScore, b = computed.score;
  if (a === null || b === null) {
    if (a !== b) { deviations++; problems.push(`${row.ticker}: Status weicht ab (${a} vs ${b})`); }
    continue;
  }
  if (Math.abs(a - b) > 0.15) {
    deviations++;
    if (deviations <= 5) problems.push(`${row.ticker}: Score ${a} vs neu berechnet ${b}`);
  }
}
console.log(`  ${compared} Titel neu berechnet, ${deviations} Abweichungen, ${referenceRows} historische Referenzzeilen`);

/* 4) Strukturelle Konsistenz der ausgelieferten Dateien. */
check(securities.rows.length === meta.activeSecurityCount || securities.rows.length > 0,
  "securities.json ist leer");
check(history.dates.length > 10, `Score-Historie hat nur ${history.dates.length} Snapshots`);
check(history.dates[history.dates.length - 1] === meta.asOf,
  `Letzter Historien-Snapshot ${history.dates[history.dates.length - 1]} ≠ Datenstand ${meta.asOf}`);
check(Object.keys(radar.modules).length === 7, "Radar hat nicht sieben Module");
check(Object.keys(rankings.lists).length >= 6, "Zu wenige Ranking-Sichten");

for (const [id, list] of Object.entries(rankings.lists)) {
  for (let i = 1; i < list.length; i++) {
    if (list[i].value > list[i - 1].value + 1e-9) {
      problems.push(`Ranking "${id}" ist an Position ${i + 1} nicht absteigend sortiert`);
      break;
    }
  }
}

/* 5) Jede Factor-DNA-Shard-Datei ist erreichbar und passt zum Ticker. */
const shardsSeen = new Set();
for (const row of securities.rows) {
  if (row.quantStatus === "not_listed") continue;
  const ticker = row.ticker;
  const key = ticker.startsWith("VUF") ? "f" : String(Math.floor((parseInt(ticker.slice(2), 10) - 1) / 50));
  if (shardsSeen.has(key)) continue;
  shardsSeen.add(key);
  try {
    const shard = read(join("dna", `${key}.json`));
    check(shard.securities[row.securityId] !== undefined,
      `Shard ${key}.json enthaelt ${ticker} nicht`);
  } catch (err) {
    problems.push(`Shard ${key}.json nicht lesbar: ${err.message}`);
  }
}
console.log(`  ${shardsSeen.size} Factor-DNA-Shards geprueft`);

if (problems.length) {
  console.error("\nProbleme:");
  for (const p of problems.slice(0, 20)) console.error("  - " + p);
  if (problems.length > 20) console.error(`  … und ${problems.length - 20} weitere`);
  process.exit(1);
}
console.log("\nAlle Pruefungen bestanden.");
