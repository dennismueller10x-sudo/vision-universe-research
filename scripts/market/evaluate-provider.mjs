/* =========================================================================
   VISION UNIVERSE — evaluate-provider.mjs   (Phase 2, §25)

   Ein Pruefstand fuer Datenanbieter. Statt Marketingseiten zu lesen und
   Faehigkeiten zu glauben, fragt dieses Skript sie ab und schreibt auf,
   was tatsaechlich zurueckkommt.

   Der Sinn: die Fragen, an denen ein Anbieter fuer diese Anwendung
   scheitert, sind nicht die aus dem Preisvergleich. Sie lauten:

     - Sind die Kurse bereinigt, und um was genau?
     - Gibt es zu jeder Fundamentalkennzahl einen Zeitpunkt, ab dem sie
       oeffentlich war? (Ohne den ist jeder historische Backtest ein Blick
       in die Zukunft.)
     - Sind Korrekturen von Erstmeldungen unterscheidbar?
     - Sind delistete Unternehmen abrufbar? (Ohne sie misst ein Backtest
       nur die Ueberlebenden und kommt zu schoenen, falschen Zahlen.)

   Die ersten beiden lassen sich mit einem kostenlosen Zugang teilweise
   beantworten. Die letzten beiden fast nie — und genau das ist das
   Ergebnis, das hier festgehalten werden soll.

   Ausfuehren:
     node scripts/market/evaluate-provider.mjs twelve-data
     node scripts/market/evaluate-provider.mjs twelve-data --json

   Ohne Zugangsdaten laeuft die Bewertung trotzdem: Proben, die einen
   Abruf brauchen, melden `notConfigured` statt zu raten.
   ========================================================================= */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SymbolMapping = require(join(root, "quant", "engines", "symbol-mapping.js"));
const MarketQuality = require(join(root, "quant", "engines", "market-quality.js"));

/* Bekannte Adapter. Neue Anbieter tragen sich hier ein und werden damit
   nach denselben Kriterien geprueft wie alle anderen. */
const ADAPTERS = {
  "twelve-data": {
    module: join(root, "providers", "twelve-data", "adapter.js"),
    factory: "createTwelveDataProvider",
    envKey: "TWELVE_DATA_API_KEY"
  }
};

/* Die Fragen, in der Reihenfolge ihrer Bedeutung fuer dieses System.
   `weight` ist die Punktzahl, `blocking` heisst: ohne das ist der Anbieter
   fuer den jeweiligen Zweck ungeeignet, egal wie gut der Rest ist. */
const CRITERIA = [
  { id: "historicalDaily", set: "market", weight: 10, blocking: true,
    purpose: "Kursdaten", question: "Gibt es eine ausreichend lange Tageshistorie?" },
  { id: "adjustedPrices", set: "market", weight: 10, blocking: false,
    purpose: "Kursdaten", question: "Sind die Kurse total-return-bereinigt (Splits UND Dividenden)?" },
  { id: "splitAdjustedPrices", set: "market", weight: 4, blocking: false,
    purpose: "Kursdaten", question: "Sind die Kurse wenigstens splitbereinigt?" },
  { id: "splits", set: "market", weight: 5, blocking: false,
    purpose: "Kursdaten", question: "Sind Split-Ereignisse einzeln abrufbar?" },
  { id: "dividends", set: "market", weight: 5, blocking: false,
    purpose: "Kursdaten", question: "Sind Dividenden einzeln abrufbar?" },

  { id: "pointInTime", set: "fundamental", weight: 20, blocking: true,
    purpose: "Fundamental-Backtest",
    question: "Traegt jede Kennzahl den Zeitpunkt, ab dem sie oeffentlich war?" },
  { id: "restatements", set: "fundamental", weight: 12, blocking: false,
    purpose: "Fundamental-Backtest",
    question: "Sind Erstmeldung und spaetere Korrektur unterscheidbar?" },
  { id: "filingDates", set: "fundamental", weight: 8, blocking: false,
    purpose: "Fundamental-Backtest", question: "Gibt es Einreichungsdaten?" },
  { id: "delistedSecurities", set: "fundamental", weight: 15, blocking: true,
    purpose: "Fundamental-Backtest",
    question: "Sind delistete Unternehmen abrufbar (Survivorship Bias)?" },
  { id: "historicalUniverse", set: "fundamental", weight: 8, blocking: false,
    purpose: "Fundamental-Backtest",
    question: "Laesst sich die historische Indexzugehoerigkeit rekonstruieren?" },

  { id: "consensus", set: "estimate", weight: 5, blocking: false,
    purpose: "Schaetzungen", question: "Gibt es Analystenkonsens?" },
  { id: "pointInTime", set: "estimate", weight: 8, blocking: false,
    purpose: "Schaetzungen", question: "Ist der Konsens historisch zeitpunktgenau?" },

  { id: "securityMaster", set: "reference", weight: 6, blocking: false,
    purpose: "Referenzdaten", question: "Gibt es einen Wertpapierstamm?" },
  { id: "isin", set: "reference", weight: 4, blocking: false,
    purpose: "Referenzdaten", question: "Gibt es stabile Kennungen (ISIN/FIGI) statt nur Ticker?" }
];

const STATE = { true: "ja", false: "nein", null: "ungeprueft" };

const argv = process.argv.slice(2);
const providerId = argv.find((a) => !a.startsWith("--")) || "twelve-data";
const AS_JSON = argv.includes("--json");
const spec = ADAPTERS[providerId];

if (!spec) {
  console.error(`Unbekannter Anbieter: ${providerId}`);
  console.error(`Bekannt: ${Object.keys(ADAPTERS).join(", ")}`);
  process.exit(1);
}

const adapter = require(spec.module);
const apiKey = process.env[spec.envKey] || null;
const capabilities = adapter.freePlanCapabilities();

/* ------------------------------------------------ Deklarierte Bewertung */

const rows = CRITERIA.map((c) => {
  const value = capabilities.sets[c.set] ? capabilities.sets[c.set][c.id] : null;
  return {
    purpose: c.purpose,
    capability: `${c.set}.${c.id}`,
    question: c.question,
    declared: value,
    state: STATE[String(value)],
    weight: c.weight,
    blocking: c.blocking,
    earned: value === true ? c.weight : 0,
    note: capabilities.notes ? capabilities.notes[c.id] || null : null
  };
});

const maxScore = CRITERIA.reduce((sum, c) => sum + c.weight, 0);
const score = rows.reduce((sum, r) => sum + r.earned, 0);
const blockers = rows.filter((r) => r.blocking && r.declared !== true);
const unverified = rows.filter((r) => r.declared === null);

/* Eignung je Zweck — getrennt, weil ein Anbieter fuer Kurse hervorragend
   und fuer Fundamental-Backtests voellig ungeeignet sein kann. Ein einziger
   Gesamtwert wuerde genau diesen Unterschied verwischen. */
const purposes = {};
for (const r of rows) {
  const p = purposes[r.purpose] || (purposes[r.purpose] = { max: 0, score: 0, blockers: [] });
  p.max += r.weight;
  p.score += r.earned;
  if (r.blocking && r.declared !== true) p.blockers.push(r.capability);
}
for (const key of Object.keys(purposes)) {
  const p = purposes[key];
  p.percent = Math.round((p.score / p.max) * 100);
  /* Vier Urteile statt zwei. "Kein blockierendes Kriterium" ist noch kein
     Eignungsnachweis: ein Zweck, bei dem schlicht nichts geprueft wurde,
     saehe sonst genauso gut aus wie einer, der alles erfuellt. */
  p.verdict = p.blockers.length ? "ungeeignet"
    : rows.filter((r) => r.purpose === key).every((r) => r.declared === null) ? "ungeprueft"
    : p.percent >= 60 ? "geeignet"
    : "eingeschraenkt";
  p.suitable = p.verdict === "geeignet";
}

/* --------------------------------------------------- Empirische Proben */

const probes = [];

async function probe(name, question, fn) {
  if (!apiKey) {
    probes.push({ name, question, result: "notConfigured",
                  detail: `Ohne ${spec.envKey} wird nichts abgerufen — und nichts geraten.` });
    return;
  }
  try {
    const detail = await fn();
    probes.push({ name, question, result: detail.result, detail: detail.detail });
  } catch (err) {
    probes.push({ name, question, result: "error", detail: err.message });
  }
}

const registry = SymbolMapping.createRegistry([{
  securityId: "probe_AAPL", providerId, providerSymbol: "AAPL", ticker: "AAPL",
  mic: "XNAS", currency: "USD", country: "US", confidence: "inferred"
}]);

const createProvider = adapter[spec.factory];
if (typeof createProvider !== "function") {
  console.error(`${providerId}: Adapter exportiert keine Fabrik namens ${spec.factory}.`);
  process.exit(1);
}

const provider = createProvider({
  apiKey, capabilities, symbolRegistry: registry,
  fetchImpl: (url, init) => fetch(url, init)
});

await probe("Tageshistorie", "Wie viele Bars liefert ein einzelner Abruf?", async () => {
  const res = await provider.getDailyBars("probe_AAPL", { outputsize: 5000 });
  if (!res.available) return { result: "fehlgeschlagen", detail: `${res.reason}: ${res.message}` };
  const bars = res.data.bars;
  return {
    result: "ok",
    detail: `${bars.length} Bars, ${bars[0].date} bis ${bars[bars.length - 1].date}, ` +
            `Bereinigung laut Adapter: ${res.data.adjustmentStatus}`
  };
});

await probe("Split-Bereinigung", "Sieht die Historie um bekannte Splits bereinigt aus?", async () => {
  const res = await provider.getDailyBars("probe_AAPL", { outputsize: 5000 });
  if (!res.available) return { result: "fehlgeschlagen", detail: res.reason };
  /* Die Qualitaetspruefung erkennt unbereinigte Splits an Kurssprungen in
     glatten Verhaeltnissen. Findet sie keinen, spricht das fuer eine
     bereinigte Reihe — beweist es aber nicht, wenn im Zeitraum ohnehin
     kein Split lag. Deshalb steht der Zeitraum mit dabei. */
  const validation = MarketQuality.validateBars(res.data.bars, {
    today: new Date().toISOString().slice(0, 10)
  });
  const splits = validation.findings.filter((f) => f.code === "suspected_unadjusted_split");
  return {
    result: splits.length ? "unbereinigt" : "vermutlich bereinigt",
    detail: splits.length
      ? `${splits.length} unbereinigte Splits im Zeitraum gefunden.`
      : `Kein unbereinigter Split zwischen ${validation.stats.first} und ${validation.stats.last}. ` +
        `Das ist ein Indiz, kein Beweis: es kann auch schlicht keinen Split gegeben haben.`
  };
});

await probe("Kapitalmassnahmen", "Sind Splits und Dividenden als Ereignisse abrufbar?", async () => {
  const res = await provider.getCorporateActions("probe_AAPL", {});
  return res.available
    ? { result: "ok", detail: `${(res.data || []).length} Ereignisse.` }
    : { result: res.reason, detail: res.message };
});

await probe("Kontingent", "Wie viele Anfragen bleiben nach diesem Lauf?", async () => {
  const q = provider.quota();
  return { result: "ok",
           detail: `${q.dayUsed}/${q.dayLimit} pro Tag, ${q.minuteUsed}/${q.minuteLimit} pro Minute.` };
});

/* ---------------------------------------------------------- Ausgabe */

const report = {
  provider: providerId,
  plan: capabilities.plan,
  evaluatedAt: new Date().toISOString(),
  configured: !!apiKey,
  score, maxScore, percent: Math.round((score / maxScore) * 100),
  purposes, blockers: blockers.map((b) => b.capability),
  unverified: unverified.map((u) => u.capability),
  criteria: rows,
  probes
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`\nAnbieterbewertung — ${providerId} (${capabilities.plan})\n`);
console.log(`  Zugang konfiguriert: ${apiKey ? "ja" : "nein"}\n`);

console.log("  Eignung je Zweck");
for (const [name, p] of Object.entries(purposes)) {
  const verdict = p.verdict === "ungeeignet" ? "UNGEEIGNET" : p.verdict;
  console.log(`    ${name.padEnd(20)} ${String(p.percent).padStart(3)} %  ${verdict.padEnd(14)}` +
              (p.blockers.length ? `(fehlt: ${p.blockers.join(", ")})` : ""));
}

console.log("\n  Kriterien");
let currentPurpose = null;
for (const r of rows) {
  if (r.purpose !== currentPurpose) {
    currentPurpose = r.purpose;
    console.log(`\n    ${currentPurpose}`);
  }
  const mark = r.declared === true ? "+" : r.declared === false ? "-" : "?";
  console.log(`      ${mark} ${r.capability.padEnd(32)} ${r.state.padEnd(11)}` +
              `${r.blocking && r.declared !== true ? " BLOCKIEREND" : ""}`);
}

console.log("\n  Empirische Proben");
for (const p of probes) {
  console.log(`    ${p.name.padEnd(20)} ${p.result}`);
  console.log(`      ${p.detail}`);
}

if (blockers.length) {
  console.log(`\n  Blockierende Luecken: ${blockers.map((b) => b.capability).join(", ")}`);
  console.log("  Fuer die betroffenen Zwecke ist dieser Zugang nicht verwendbar.");
  console.log("  Das ist kein Mangel des Anbieters, sondern eine Eigenschaft des Plans.");
}
if (unverified.length) {
  console.log(`\n  Ungeprueft (weder zugesichert noch ausgeschlossen): ${unverified.length}`);
  console.log("  Diese Faehigkeiten gelten als nicht vorhanden, bis jemand sie prueft");
  console.log("  und das Ergebnis in docs/VU_PROVIDER_CAPABILITIES.md eintraegt.");
}
console.log("");
