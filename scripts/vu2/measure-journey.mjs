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
const Shape = require(join(ROOT, "quant/engines/journey-shape.js"));

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
/* DEN GRUND MESSEN, DEN DIE SEITE NENNT - NICHT DEN OBERBEGRIFF.
 *
 * Bis hierher zaehlte diese Messung TECHNICAL_EVIDENCE_NOT_PUBLISHED und
 * NOT_COVERED_BY_SETUP_OBSERVATION, also die Sammelcodes der Dienstschicht.
 * Die Seite zeigt seit M22 den Grund JE TITEL (der Dienst liefert ihn als
 * `unavailability`), und sie tut es auch beim Setup, weil dessen Universum
 * genau das technische ist: Setup-Beobachtung und Kursstruktur fallen
 * gemeinsam aus, mit derselben Ursache. Eine Messung, die den Oberbegriff
 * zaehlt, macht aus zwei verschiedenen Lagen eine Zahl - und genau die
 * Unterscheidung soll diese Datei liefern. */
function technicalReason(station) {
  if (station && station.unavailability && station.unavailability.reason) return station.unavailability.reason;
  return station && station.reason ? station.reason : "UNAVAILABLE";
}
function setupReason(d) {
  const geliehen = d.setup && d.setup.unavailability && d.setup.unavailability.reason;
  if (geliehen) return geliehen;
  return (d.setup && d.setup.reason) || "UNAVAILABLE";
}

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
    read: (d) => d.setup.state === "AVAILABLE" ? null : setupReason(d) },
  { id: "setupChange", label: "Was diesen Zustand aendern wuerde",
    read: (d) => d.setup.state !== "AVAILABLE" ? setupReason(d)
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
    read: (d) => d.technical.state === "AVAILABLE" ? null : technicalReason(d.technical) },
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
  /* Die ganze Zeile, nicht nur der Ticker: die Form fragt, wie viele
     Faktoren einen Wert tragen, und nicht ob die Zeile existiert. */
  const screeningRows = new Map((screening.rows || []).map((row) => [row.ticker, row]));

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
      /* UND DIE FORM, DIE DIE SEITE DARAUS MACHT - mit demselben Vertrag,
         den die Oberflaeche aufruft. Eine zweite Regel hier waere eine
         Zahl, die nichts ueber die Seite aussagt.

         "Beantwortet" und "gehaltvoll" sind dabei zwei Dinge: ACAA gilt an
         vier Stationen als beantwortet und zeigt dort 0 von 7 Faktoren und
         0 von 16 Kennzahlen. Die Form richtet sich nach dem Gehalt. */
      const form = Shape.assess(Shape.stationsFrom({
        stock: data.stock, evidenceRow: screeningRows.get(data.ticker) || null,
        factors: data.factors, setup: data.setup, patterns: data.patterns,
        match: data.match, assignmentChange: data.change, technical: data.technical
      }));
      row.shape = form.shape;
      row.substantive = form.substantiveCount;
      row.noticesBefore = form.noticesBefore;
      row.noticesAfter = form.noticesAfter;
      row.causes = form.groups.map((g) => g.causeId);
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
    schemaVersion: "journey-coverage-1.1.0",
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
    /* WIE VIELE SEITEN WELCHE FORM BEKOMMEN - und was die Verdichtung an
       Absagekaesten einspart. Die Zahlen beantworten genau die Fragen, an
       denen sich die datenarme Erfahrung messen laesst. */
    shapes: (() => {
      const zaehler = { FULL: 0, REDUCED: 0, MINIMAL: 0 };
      let boxenVorher = 0, boxenNachher = 0, schlimmste = 0;
      /* Getrennt gezaehlt, damit die Ersparnis nicht mit Seiten geschoent
         wird, an denen sich nichts aendert: eine volle Reise behaelt ihre
         hoechstens zwei Hinweise. */
      let armVorher = 0, armNachher = 0, armSeiten = 0;
      const ursachen = {};
      for (const row of journeys) {
        zaehler[row.shape] = (zaehler[row.shape] || 0) + 1;
        const nachher = row.shape === "FULL" ? row.noticesBefore : row.noticesAfter;
        boxenVorher += row.noticesBefore;
        boxenNachher += nachher;
        schlimmste = Math.max(schlimmste, nachher);
        if (row.shape !== "FULL") { armSeiten += 1; armVorher += row.noticesBefore; armNachher += nachher; }
        for (const cause of row.causes) ursachen[cause] = (ursachen[cause] || 0) + 1;
      }
      return {
        full: zaehler.FULL, reduced: zaehler.REDUCED, minimal: zaehler.MINIMAL,
        noticeBoxesBefore: boxenVorher, noticeBoxesAfter: boxenNachher,
        worstPageNoticeBoxes: schlimmste,
        dataPoorPages: armSeiten,
        dataPoorNoticeBoxesBefore: armVorher, dataPoorNoticeBoxesAfter: armNachher,
        /* HIER STAND EINE NULL, DIE NICHTS GEMESSEN HAT.
           "Leere Abschnitte: 0" war richtig und trotzdem wertlos - eine
           Konstante im Bericht belegt nichts. Dass auf einer verdichteten
           Seite kein Abschnitt ohne Wert steht, haelt der Produktions-Smoke
           am gebauten Release: er zaehlt die Einzelabsagen im `main` der
           datenarmen Titel und verlangt die Gruppenauskunft mit ihren
           Bereichen. Diese Datei zaehlt, was sie zaehlen kann. */
        substantiveStationsPerTitle: (() => {
          const v = {};
          for (const row of journeys) v[row.substantive] = (v[row.substantive] || 0) + 1;
          return v;
        })(),
        causes: ursachen,
        note: "FULL: hoechstens zwei Absagen, die volle Reise bleibt. REDUCED: verdichtete Auskunft, " +
              "vorhandene Erkenntnisse zuerst, Absagen zu Ursachen gruppiert. MINIMAL: hoechstens eine " +
              "gehaltvolle Station - eine eigene Aussage statt einer kurzen Reise."
      };
    })(),
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
  const f = report.shapes;
  process.stdout.write("\n  Form der Seiten:\n");
  process.stdout.write("    volle Reise        " + String(f.full).padStart(4) + "\n");
  process.stdout.write("    reduzierte Reise   " + String(f.reduced).padStart(4) + "\n");
  process.stdout.write("    zu wenig fuer eine Reise " + String(f.minimal).padStart(4) + "\n");
  process.stdout.write("    Absagekaesten gesamt: " + f.noticeBoxesBefore + " -> " + f.noticeBoxesAfter +
    " · schlimmste Seite " + f.worstPageNoticeBoxes + "\n");
  process.stdout.write("    davon auf den " + f.dataPoorPages + " datenarmen Seiten: " +
    f.dataPoorNoticeBoxesBefore + " -> " + f.dataPoorNoticeBoxesAfter + "\n");
  const paare = Object.entries(verteilung).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
  process.stdout.write("  Stationen je Titel: " + paare.map(([k, v]) => k + "→" + v).join(", ") + "\n");
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
