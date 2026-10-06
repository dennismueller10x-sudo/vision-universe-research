/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/collect-vu-signals.mjs

   VU ALS CONTENT BRAIN (§3)

   Dieses Skript liest die bestehenden Vision-Universe-Artefakte und macht
   daraus Signale. Es ist die Stelle, an der §3 konkret wird: Vision
   Universe ist fuer das Social-System keine externe Website, sondern die
   primaere Wissensquelle.

   -------------------------------------------------------------------------
   DIE REGEL, DIE DIESES SKRIPT WICHTIGER MACHT ALS SEINE GROESSE
   -------------------------------------------------------------------------

   Ein grosser Teil der VU-Artefakte ist HEUTE SYNTHETISCH.
   quant/data/meta.json sagt es selbst: `isMock: true`, 511 erfundene
   Unternehmen. Die Technical Intelligence dagegen laeuft auf echten Daten
   (quant/data/technical/index.json, `dataMode: "real"`, 13 Instrumente).

   Ein Signal aus Mock-Daten ist als CONTENT WERTLOS UND GEFAEHRLICH: es
   sieht aus wie eine Marktaussage und ist eine Zufallszahl. Deshalb:

     - jedes Signal traegt `isMock` bis in die Provenance
     - Mock-Signale bekommen den Zustand UNAVAILABLE, nicht VERIFIED
     - sie werden gezaehlt und berichtet, aber sind nicht veroeffentlichbar

   Das ist MASTER §31.4 ("kein stiller Mock-Fallback") in der Social-Kette.
   Ohne diese Regel waere der erste automatische Beitrag eine erfundene
   Kursbewegung eines erfundenen Unternehmens.

   -------------------------------------------------------------------------
   AUSFUEHREN
   -------------------------------------------------------------------------

     node scripts/social/collect-vu-signals.mjs
     node scripts/social/collect-vu-signals.mjs --out social/data
     node scripts/social/collect-vu-signals.mjs --include-mock   (nur Diagnose)
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ausgabePfad } from "../quality/out-path.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", null);
const NOW = arg("--now", new Date().toISOString());
const INCLUDE_MOCK = argv.includes("--include-mock");

function readJson(relativePath) {
  const file = join(ROOT, relativePath);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (err) { return null; }
}

const events = [];
const skipped = [];
const sources = [];

/* =====================================================================
   QUELLE 1 — TECHNICAL INTELLIGENCE  (echte Daten, 13 Instrumente)
   ===================================================================== */

const technical = readJson("quant/data/technical/index.json");
if (!technical) {
  sources.push({ id: "quant/data/technical/index.json", state: "MISSING",
    note: "Der Technical-Intelligence-Index fehlt. Dieser Lauf hat nicht stattgefunden." });
} else {
  const real = (technical.instruments || []).filter((i) => i.isMock === false && i.dataMode === "real");
  const mock = (technical.instruments || []).filter((i) => i.isMock !== false);

  sources.push({
    id: "quant/data/technical/index.json", state: "OK",
    generatedAt: technical.generatedAt,
    real: real.length, mock: mock.length
  });

  for (const instrument of real) {
    /* Ein TECHNICAL_SETUP entsteht nicht aus jedem Instrument, sondern aus
       einem auffaelligen. Die Schwelle ist bewusst hoch: ein Signal, das
       jeden Tag fuer jedes Instrument feuert, ist kein Signal. */
    if (typeof instrument.opportunityScore === "number" && instrument.opportunityScore >= 60) {
      events.push({
        type: "TECHNICAL_SETUP",
        entity: instrument.instrumentId,
        metric: "Technical Opportunity Score",
        value: instrument.opportunityScore,
        unit: null,
        observedAt: instrument.asOf ? instrument.asOf + "T00:00:00Z" : NOW,
        source: "vu.technical",
        provider: "vu-technical-intelligence",
        state: "VERIFIED",
        strength: Math.min(1, instrument.opportunityScore / 100),
        context: {
          trend: instrument.trend || null,
          primaryDirection: instrument.primaryDirection || null,
          /* Elliott ist BETA und AMBIGUOUS heisst ambig. Das gehoert in den
             Kontext, damit ein Text es nicht als Gewissheit formuliert. */
          elliottStatus: instrument.elliottStatus || null,
          elliottIsBeta: true,
          bars: instrument.bars || null,
          snapshotId: instrument.snapshotId || null
        }
      });
    }
  }

  if (mock.length) {
    skipped.push({
      source: "quant/data/technical/index.json",
      count: mock.length,
      reason: "Synthetische Instrumente. Ein Beitrag darueber waere eine erfundene Marktaussage (§27, §45)."
    });
  }
}

/* =====================================================================
   QUELLE 2 — QUANT-UNIVERSUM  (heute synthetisch)
   ===================================================================== */

const meta = readJson("quant/data/meta.json");
const securities = readJson("quant/data/securities.json");

if (!securities) {
  sources.push({ id: "quant/data/securities.json", state: "MISSING",
    note: "Das Quant-Universum fehlt." });
} else {
  const isMockUniverse = meta ? meta.isMock === true : true;
  sources.push({
    id: "quant/data/securities.json", state: "OK",
    asOf: securities.asOf, rows: (securities.rows || []).length,
    isMock: isMockUniverse,
    note: isMockUniverse
      ? "Synthetisches Universum (meta.json: isMock=true). Erzeugt KEINE veroeffentlichungsfaehigen Signale."
      : "Echtes Universum."
  });

  if (isMockUniverse && !INCLUDE_MOCK) {
    skipped.push({
      source: "quant/data/securities.json",
      count: (securities.rows || []).length,
      reason: "Das Quant-Universum ist synthetisch (511 erfundene Unternehmen). " +
              "Signale daraus sehen aus wie Marktaussagen und sind Zufallszahlen. " +
              "Mit --include-mock werden sie zur Diagnose erzeugt — als UNAVAILABLE markiert und " +
              "damit nicht veroeffentlichungsfaehig."
    });
  } else {
    for (const row of securities.rows || []) {
      const mockRow = row.isMock === true || isMockUniverse;

      /* Nahe am 52-Wochen-Hoch. */
      if (typeof row.distanceTo52wHigh === "number" && row.distanceTo52wHigh <= 2) {
        events.push({
          type: "NEW_52W_HIGH", entity: row.ticker,
          metric: "Abstand zum 52-Wochen-Hoch", value: row.distanceTo52wHigh, unit: "%",
          observedAt: (row.asOf || securities.asOf) + "T00:00:00Z",
          source: "vu.quant", provider: "vu-quant-engine",
          /* HIER liegt die Regel: Mock ist nicht VERIFIED. */
          state: mockRow ? "UNAVAILABLE" : "VERIFIED",
          strength: mockRow ? null : 0.7,
          context: { isMock: mockRow, sector: row.sector || null }
        });
      }

      /* Starkes 12-1-Momentum. */
      if (typeof row.momentum12m1m === "number" && row.momentum12m1m >= 20) {
        events.push({
          type: "MOMENTUM_SHIFT", entity: row.ticker,
          metric: "Momentum 12-1", value: row.momentum12m1m, unit: "%",
          observedAt: (row.asOf || securities.asOf) + "T00:00:00Z",
          source: "vu.quant", provider: "vu-quant-engine",
          state: mockRow ? "UNAVAILABLE" : "VERIFIED",
          strength: mockRow ? null : Math.min(1, row.momentum12m1m / 60),
          context: { isMock: mockRow, sector: row.sector || null }
        });
      }
    }
  }
}

/* =====================================================================
   QUELLE 3 — MARKTDATEN-GESUNDHEIT  (Zustand, kein Inhalt)
   ===================================================================== */

const marketHealth = readJson("quant/data/market/health/health.json");
sources.push(marketHealth
  ? { id: "quant/data/market/health/health.json", state: "OK",
      generatedAt: marketHealth.generatedAt || null }
  : { id: "quant/data/market/health/health.json", state: "MISSING",
      note: "Kein Marktdaten-Gesundheitsbericht. Kein Fehler — dieser Lauf hat nicht stattgefunden." });

/* =====================================================================
   NICHT ANGEBUNDENE QUELLEN — sie werden GENANNT, nicht verschwiegen
   ===================================================================== */

const notConnected = [
  { id: "news", reason: "Kein lizenzierter News-Provider angebunden (NewsDataProvider ist definiert, " +
                        "quant/engines/provider.js)." },
  { id: "social.trends", reason: "Keine Plattform-API mit oeffentlichen Trenddaten angebunden. " +
                                 "Lizenz- und Plattformregeln sind vorher zu klaeren (§4 D)." },
  { id: "audience", reason: "Setzt veroeffentlichte Beitraege mit Kommentaren voraus (§24)." },
  { id: "own.performance", reason: "Setzt Analytics aus mindestens einer Veroeffentlichung voraus (§4 E)." }
];

/* ===================================================================== */

const publishable = events.filter((e) => e.state === "VERIFIED");
const report = {
  generatedAt: NOW,
  events,
  externalSignals: [],
  summary: {
    total: events.length,
    publishable: publishable.length,
    unavailable: events.length - publishable.length,
    byType: events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {})
  },
  sources,
  skipped,
  notConnected
};

console.log("VISION UNIVERSE SOCIAL — Signalsammlung");
console.log("Zeitpunkt:", NOW);
console.log("");
for (const source of sources) {
  console.log("  " + source.state.padEnd(8) + source.id +
    (source.note ? "\n           " + source.note : ""));
}
console.log("");
console.log("Ereignisse: " + report.summary.total +
  " (davon veroeffentlichungsfaehig: " + report.summary.publishable + ")");
for (const [type, count] of Object.entries(report.summary.byType)) {
  console.log("  " + type + ": " + count);
}
if (skipped.length) {
  console.log("\nUebersprungen:");
  for (const s of skipped) console.log("  " + s.source + " (" + s.count + "): " + s.reason);
}
console.log("\nNicht angebundene Quellen:");
for (const n of notConnected) console.log("  " + n.id + ": " + n.reason);

if (report.summary.publishable === 0) {
  console.log("\nHINWEIS: Kein veroeffentlichungsfaehiges Signal. Das ist kein Fehler des Laufs — " +
    "es ist der aktuelle Datenstand. Ein Signal aus synthetischen Daten waere eine erfundene " +
    "Marktaussage, und §45 verbietet genau das.");
}

if (OUT_DIR) {
  const dir = ausgabePfad(ROOT, OUT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "signals.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("\nGeschrieben: " + OUT_DIR + "/signals.json");
} else {
  console.log("\n(Kein --out: es wurde nichts geschrieben.)");
}
