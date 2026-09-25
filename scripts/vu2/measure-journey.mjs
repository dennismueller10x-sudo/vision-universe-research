#!/usr/bin/env node
/* =========================================================================
   DIE STOCK-INTELLIGENCE-REISE, VON DER SEITE DES LESERS GEMESSEN.

   Die Reise hat eine feste Reihenfolge: wie stark - warum - was aendert
   sich - baut sich eine Situation auf - was spricht dafuer und dagegen -
   wie sah das frueher aus - welcher Stil passt - wie belastbar ist das
   alles. Jede Station beantwortet entweder etwas oder sagt, warum nicht.

   Was bisher fehlte, ist die Zahl dahinter. "Die Reise ist gebaut" laesst
   sich nicht pruefen; "an 6.875 Titeln beantwortet Station 4 in 81 Prozent
   der Faelle etwas, und die uebrigen 19 Prozent nennen einen von drei
   Gruenden" laesst sich pruefen.

   Gemessen wird ueber dieselben Dienste, die die Oberflaeche aufruft -
   kein zweiter Leseweg, keine Annahme darueber, was eine Seite zeigen
   WUERDE. Was hier als WITHHELD mit Grund steht, steht dort als Hinweis
   mit Grund.

   Ausfuehren:
     node scripts/vu2/measure-journey.mjs [--sample 400] [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const SAMPLE = parseInt(arg("sample", "400"), 10);
const OUT = arg("out", join(ROOT, "quant/data/product/journey-coverage-v1.json"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(await readFile(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(await readFile(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

/* Die Stationen, in der Reihenfolge der Seite. `read` gibt zurueck:
     null          die Station sagt etwas
     "FINDING:X"   die Station sagt ausdruecklich NEIN - das ist eine
                   Antwort und kein Loch (kein Muster trifft zu; zu keinem
                   Stil passt es gut). Sie zaehlt als beantwortet und wird
                   trotzdem getrennt ausgewiesen.
     "X"           die Station sagt nichts, und X ist der Grund.

   Die Unterscheidung ist der ganze Punkt dieser Messung: eine Quote, die
   einen Befund als Luecke zaehlt, macht das Produkt schlechter aussehen
   als es ist - und eine, die eine Luecke als Befund zaehlt, besser. */
const STATIONS = [
  { id: "identity", label: "Titel und letzter Kurs",
    read: (d) => d.stock.state === "AVAILABLE" ? null : (d.stock.reason || "UNAVAILABLE") },
  { id: "chart", label: "Kursverlauf",
    read: (d) => d.stock.chart && d.stock.chart.state === "AVAILABLE"
      ? null : ((d.stock.chart && d.stock.chart.reason) || "SOURCE_MISSING") },
  { id: "factorStrength", label: "Wie stark ist die Aktie",
    read: (d) => d.evidence ? null : "NOT_COVERED_BY_FACTOR_EVIDENCE" },
  { id: "change", label: "Was hat sich veraendert",
    read: (d) => d.factors && d.factors.state === "AVAILABLE" && d.factors.change &&
      (d.factors.change.items || []).some((item) => item.state === "AVAILABLE")
        ? null : "NO_COMPARABLE_OBSERVATION" },
  { id: "setup", label: "Baut sich eine Situation auf",
    read: (d) => d.setup.state === "AVAILABLE" ? null : (d.setup.reason || "UNAVAILABLE") },
  { id: "setupChange", label: "Was diesen Zustand aendern wuerde",
    read: (d) => d.setup.state !== "AVAILABLE" ? (d.setup.reason || "UNAVAILABLE")
      : (d.setup.cascade ? null : (d.setup.cascadeReason || "SETUP_ROW_NOT_IN_ARTIFACT")) },
  { id: "patterns", label: "Chance und Risiko in aehnlichen Lagen",
    read: (d) => d.patterns.state === "AVAILABLE"
      ? (d.patterns.holds.length ? null : "FINDING:NO_PATTERN_HOLDS")
      : (d.patterns.reason || "UNAVAILABLE") },
  { id: "strategy", label: "Welcher Anlagestil passt",
    read: (d) => d.match.state !== "AVAILABLE" ? (d.match.reason || "UNAVAILABLE")
      : (d.match.profiles.some((p) => p.state === "AVAILABLE" && p.match >= 40)
          ? null : "FINDING:NO_PROFILE_FITS_WELL") },
  /* Die Zuordnung ist dieselbe Regel wie im Screener und im Alarmvertrag -
     und ihre Bewegung ist eine eigene Station, weil "nichts geaendert" eine
     Antwort ist und kein Loch. Gemessen zwischen 2026-09-23 und 2026-09-24:
     36 von 6.437 Titeln haben gewechselt; bei den uebrigen steht das Nein. */
  { id: "assignmentChange", label: "Hat sich die Zuordnung geaendert",
    read: (d) => !d.change ? "NO_SECOND_PUBLISHED_STATE"
      : d.change.state === "CHANGED" ? null
      : d.change.state === "NO_CHANGE" ? "FINDING:NO_ASSIGNMENT_CHANGE"
      : (d.change.state || "UNAVAILABLE") },
  { id: "technical", label: "Kursstruktur",
    read: (d) => d.technical.state === "AVAILABLE" ? null : (d.technical.reason || "UNAVAILABLE") },
  { id: "business", label: "Unternehmenszahlen",
    read: (d) => d.stock.quant && d.stock.quant.state === "AVAILABLE"
      ? null : ((d.stock.quant && d.stock.quant.reason) || "UNAVAILABLE") }
];

async function journeyFor(ticker, screeningRows) {
  const [stock, setup, patterns, match, technical, factors, change] = await Promise.all([
    api.getStockIntelligence(ticker).catch((e) => ({ state: "UNAVAILABLE", reason: "THROWN:" + e.message })),
    api.getSetupObservation(ticker).catch(() => ({ state: "UNAVAILABLE", reason: "THROWN" })),
    api.getPatternMatch(ticker).catch(() => ({ state: "UNAVAILABLE", reason: "THROWN" })),
    api.getStrategyMatch(ticker).catch(() => ({ state: "UNAVAILABLE", reason: "THROWN" })),
    api.getTechnicalIntelligence(ticker).catch(() => ({ state: "UNAVAILABLE", reason: "THROWN" })),
    api.getFactorEvidence(ticker).catch(() => ({ state: "UNAVAILABLE", reason: "THROWN" })),
    api.getAssignmentChange(ticker).catch(() => null)
  ]);
  return { ticker, stock, setup, patterns, match, technical, factors, change,
           evidence: screeningRows.has(ticker) };
}

async function main() {
  const universe = await api.getUniverse();
  if (universe.state === "UNAVAILABLE") throw new Error("the product universe is not readable");
  const tickers = universe.stocks.map((s) => s.ticker).sort();
  /* Deterministische Stichprobe ueber das ganze Alphabet: jeder k-te
     Titel. Eine Zufallsauswahl waere bei jedem Lauf eine andere Zahl, und
     dann misst man den Zufall mit. */
  const step = Math.max(1, Math.floor(tickers.length / SAMPLE));
  const sample = tickers.filter((_, i) => i % step === 0).slice(0, SAMPLE);

  const screening = await api.getFactorEvidenceScreening();
  const screeningRows = new Set((screening.rows || []).map((row) => row.ticker));

  const counts = {};
  for (const station of STATIONS) counts[station.id] = { answered: 0, findings: 0, withheld: 0, reasons: {}, findingReasons: {} };

  const journeys = [];
  for (let i = 0; i < sample.length; i += 20) {
    const batch = await Promise.all(sample.slice(i, i + 20).map((t) => journeyFor(t, screeningRows)));
    for (const data of batch) {
      const row = { ticker: data.ticker, answered: [], withheld: {} };
      for (const station of STATIONS) {
        let reason = null;
        try { reason = station.read(data); }
        catch (e) { reason = "MEASUREMENT_FAILED:" + e.message; }
        const bucket = counts[station.id];
        if (reason === null) { bucket.answered += 1; row.answered.push(station.id); }
        else if (String(reason).startsWith("FINDING:")) {
          const name = String(reason).slice("FINDING:".length);
          bucket.answered += 1; bucket.findings += 1;
          bucket.findingReasons[name] = (bucket.findingReasons[name] || 0) + 1;
          row.answered.push(station.id);
        } else {
          bucket.withheld += 1;
          bucket.reasons[reason] = (bucket.reasons[reason] || 0) + 1;
          row.withheld[station.id] = reason;
        }
      }
      journeys.push(row);
    }
    process.stderr.write("\r  " + Math.min(i + 20, sample.length) + " von " + sample.length);
  }
  process.stderr.write("\n");

  /* Wie viele Stationen ein Titel typischerweise beantwortet bekommt. Die
     Verteilung, nicht der Mittelwert: ein Durchschnitt von sechs Stationen
     kann bedeuten, dass alle sechs bekommen - oder die Haelfte zehn und
     die andere zwei. */
  const verteilung = {};
  for (const row of journeys) verteilung[row.answered.length] = (verteilung[row.answered.length] || 0) + 1;

  const report = {
    schemaVersion: "journey-coverage-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    universe: tickers.length,
    sample: sample.length,
    sampling: "jeder " + step + ". Titel der alphabetisch sortierten Liste - deterministisch, damit zwei Laeufe vergleichbar sind",
    evidenceAsOf: screening.asOf || null,
    evidenceMethodologyVersion: screening.methodologyVersion || null,
    stations: STATIONS.map((station) => ({
      id: station.id, label: station.label,
      answered: counts[station.id].answered,
      /* Davon ausdrueckliche Neins - beantwortet, aber als Befund. */
      findings: counts[station.id].findings,
      findingReasons: counts[station.id].findingReasons,
      withheld: counts[station.id].withheld,
      share: Math.round((counts[station.id].answered / sample.length) * 1e4) / 1e4,
      reasons: counts[station.id].reasons
    })),
    answeredStationsPerTitle: verteilung,
    note: "Gemessen ueber dieselben Dienste, die die Oberflaeche aufruft. 'withheld' heisst: die Station " +
          "nennt einen Grund statt einer Zahl - kein Fehler, sondern der veroeffentlichte Zustand."
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 1) + "\n");

  process.stdout.write("Stock-Intelligence-Reise · " + sample.length + " von " + tickers.length + " Titeln\n");
  for (const station of report.stations) {
    const gruende = Object.entries(station.reasons).sort((a, b) => b[1] - a[1])
      .slice(0, 3).map(([reason, n]) => reason + " " + n).join(" · ");
    process.stdout.write("  " + (station.share * 100).toFixed(1).padStart(5) + " %  " +
      station.id.padEnd(18) + station.answered + "/" + sample.length +
      (station.findings ? " (davon " + station.findings + " ausdrueckliches Nein)" : "") +
      (gruende ? "   " + gruende : "") + "\n");
  }
  const paare = Object.entries(verteilung).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
  process.stdout.write("  Stationen je Titel: " + paare.map(([k, v]) => k + "→" + v).join(", ") + "\n");
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
