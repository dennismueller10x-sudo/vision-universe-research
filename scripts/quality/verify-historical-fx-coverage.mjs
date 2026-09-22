/* =========================================================================
   VISION UNIVERSE — verify-historical-fx-coverage.mjs   (O-7)

   REICHT DIE FX-ABDECKUNG FUER DAS, WAS DAS PRODUKT ZEIGT?

   Der Owner-Entscheid O-7 benennt den Bedarf: 10J, MAX, historische
   Fundamentals vor 2020, langfristige Performance. Die Frage ist nicht,
   ob Kurse vorhanden sind - sie ist, ob fuer JEDEN Zeitpunkt, den das
   Produkt darstellt, ein belastbarer Wechselkurs existiert.

   DATENGETRIEBEN, NICHT AN EINER LISTE

   Gefragt wird gegen die tatsaechlich im Universum vorkommenden
   Berichts- und Handelswaehrungen (pair-requirements.json) und gegen die
   Zeitraeume, die die Produktflaechen wirklich zeigen. Eine
   Abdeckungspruefung an einer gepflegten Liste prueft die Liste.

   WAS HIER NICHT PASSIERT

   Keine Naeherung. Fehlt ein Zeitpunkt, wird er gezaehlt und benannt -
   nicht mit dem naechstgelegenen Kurs aufgefuellt. Der Sinn der Pruefung
   ist, die Luecke zu finden, nicht sie zu verstecken.

   Ausfuehren:
     node scripts/quality/verify-historical-fx-coverage.mjs
     node scripts/quality/verify-historical-fx-coverage.mjs --publish
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FXDIR = join(ROOT, "quant", "engines", "fx");
const Rates = require(join(FXDIR, "fx-rates.js"));
const Providers = require(join(FXDIR, "fx-provider-registry.js"));

const args = new Set(process.argv.slice(2));
const PUBLISH = args.has("--publish");
const OUT = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "fx", "historical-coverage.json")
  : resolve(ROOT, ".market-cache", "currency", "historical-coverage.json");

function readFirst(...c) { for (const f of c) if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")); return null; }

const requirements = readFirst(
  resolve(ROOT, "quant", "data", "market", "fx", "pair-requirements.json"),
  resolve(ROOT, ".market-cache", "currency", "pair-requirements.json"));
if (!requirements) { console.error("Kein Paarbedarf."); process.exit(1); }

/* --------------------------------------------------------------------- */
/* Den Store aus allen Quellen aufbauen                                    */
/* --------------------------------------------------------------------- */
const store = Rates.createStore();
const loaded = { tiingo: 0, ecb: 0 };
for (const [dirs, source] of [
  [[join(ROOT, ".market-cache", "currency", "fx"), join(ROOT, "quant", "data", "market", "fx")], "tiingo"],
  [[join(ROOT, ".market-cache", "currency", "fx-ecb"), join(ROOT, "quant", "data", "market", "fx", "ecb")], "ecb"]
]) {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let n = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
      let d; try { d = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { continue; }
      if (!d.base || !d.quote || !Array.isArray(d.points) || !d.points.length) continue;
      store.ingest(d.base, d.quote, d.points,
        Providers.ingestMeta(d.source || source, { frequency: d.frequency || "DAILY" }));
      n++;
    }
    if (n) { loaded[source] = n; break; }
  }
}

/* --------------------------------------------------------------------- */
/* Welche Zeitpunkte das Produkt zeigt                                     */
/* --------------------------------------------------------------------- */
const heute = new Date();
function vorJahren(n) { const d = new Date(heute); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); }

/* Die Flaechen aus §40 plus das, was O-7 zusaetzlich verlangt. MAX ist
   kein fester Zeitpunkt - es ist der Beginn der laengsten Kursreihe im
   Bestand, und der wird gemessen, nicht angenommen. */
function laengsteReihe() {
  const dir = join(ROOT, "quant", "data", "market", "discover-series-long");
  if (!existsSync(dir)) return null;
  let frueheste = null;
  for (const file of readdirSync(dir).filter((f) => f.startsWith("ref_") && f.endsWith(".json")).slice(0, 400)) {
    let d; try { d = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { continue; }
    if (d.from && (!frueheste || d.from < frueheste)) frueheste = d.from;
  }
  return frueheste;
}
const maxBeginn = laengsteReihe();

const horizonte = [
  { id: "1J", datum: vorJahren(1) },
  { id: "5J", datum: vorJahren(5) },
  { id: "10J", datum: vorJahren(10) },
  { id: "15J", datum: vorJahren(15) },
  { id: "MAX", datum: maxBeginn }
].filter((h) => h.datum);

/* --------------------------------------------------------------------- */
/* Die Waehrungen, die das Universum wirklich fuehrt                       */
/* --------------------------------------------------------------------- */
const waehrungen = [...new Set([
  ...Object.keys(requirements.reportingCurrencies || {}),
  ...Object.keys(requirements.tradingCurrencies || {})
])].filter((c) => /^[A-Z]{3}$/.test(c)).sort();

const gewicht = {};
for (const [c, info] of Object.entries(requirements.reportingCurrencies || {})) gewicht[c] = (gewicht[c] || 0) + info.count;
for (const [c, info] of Object.entries(requirements.tradingCurrencies || {})) gewicht[c] = (gewicht[c] || 0) + info.count;

const ziel = "EUR";
const zeilen = [];
for (const cur of waehrungen) {
  if (cur === ziel) continue;
  const eintrag = { currency: cur, titel: gewicht[cur] || 0, horizonte: {} };
  for (const h of horizonte) {
    const hit = store.rateAt(cur, ziel, h.datum);
    eintrag.horizonte[h.id] = hit.available
      ? { ok: true, source: hit.provenance.source, role: hit.provenance.role,
          derivation: hit.derivation, asOf: hit.asOf, method: hit.method }
      : { ok: false, reason: hit.reason };
  }
  eintrag.tiefsteAbdeckung = horizonte.filter((h) => eintrag.horizonte[h.id].ok).map((h) => h.id).pop() || null;
  zeilen.push(eintrag);
}

/* Die Gewichtung ist der Punkt: eine Waehrung mit einem Titel und eine
   mit 10.858 sind nicht gleich wichtig, und eine Abdeckungsquote, die
   sie gleich zaehlt, beschreibt nichts. */
const titelGesamt = zeilen.reduce((n, z) => n + z.titel, 0);
const proHorizont = {};
for (const h of horizonte) {
  const ok = zeilen.filter((z) => z.horizonte[h.id].ok);
  const okTitel = ok.reduce((n, z) => n + z.titel, 0);
  const quellen = {};
  for (const z of ok) {
    const s = z.horizonte[h.id].source;
    quellen[s] = (quellen[s] || 0) + 1;
  }
  proHorizont[h.id] = {
    datum: h.datum,
    waehrungenAbgedeckt: ok.length, waehrungenGesamt: zeilen.length,
    titelAbgedeckt: okTitel, titelGesamt,
    titelquote: titelGesamt ? okTitel / titelGesamt : 0,
    quellen,
    fehlend: zeilen.filter((z) => !z.horizonte[h.id].ok).map((z) => z.currency)
  };
}

/* AB WANN KANN EIN EUR-CHART UEBERHAUPT BEGINNEN?

   Die Kursreihen reichen bis 1990, die aelteste FX-Quelle bis 1999. Ein
   MAX-Chart in EUR kann deshalb nicht dort anfangen, wo der USD-Chart
   anfaengt - und das ist keine Panne, sondern eine Eigenschaft der
   Datenlage, die das Produkt kennen muss.

   Der Layer verhaelt sich hier bereits richtig: er verweigert Punkte vor
   dem Beginn (`beforeSeriesStart`) statt sie zu naehern. Was fehlte, war
   die Zahl - ab wann die Umrechnung greift. Ohne sie muesste jede
   Oberflaeche sie selbst herausfinden. */
function fruehesterStand(cur) {
  const quellen = store.sourcesFor(cur, ziel).concat(store.sourcesFor(ziel, cur));
  const erste = quellen.map((q) => q.first).filter(Boolean).sort();
  return erste[0] || null;
}
const chartStart = {};
for (const z of zeilen) {
  const direkt = fruehesterStand(z.currency);
  /* Ohne direktes Paar entscheidet das Pivot - die Umrechnung ist erst
     moeglich, wenn BEIDE Beine da sind, also ab dem spaeteren der zwei. */
  if (direkt) { chartStart[z.currency] = direkt; continue; }
  const beine = ["USD", "EUR"].map((pv) => {
    const a = fruehesterStand(pv) || null;
    const b = (store.sourcesFor(pv, z.currency).concat(store.sourcesFor(z.currency, pv)))
      .map((q) => q.first).filter(Boolean).sort()[0] || null;
    return (a && b) ? (a > b ? a : b) : null;
  }).filter(Boolean).sort();
  chartStart[z.currency] = beine[0] || null;
}
const eurChartStartGewichtet = zeilen
  .filter((z) => chartStart[z.currency])
  .sort((a, b) => b.titel - a.titel)
  .slice(0, 1)
  .map((z) => ({ currency: z.currency, titel: z.titel, ab: chartStart[z.currency] }))[0] || null;

/* Die Schwelle: ab wann gilt die historische Abdeckung als bestanden?

   Nicht 100 Prozent der Waehrungen - das waere an AFN und KZT
   gescheitert, die einen Titel betreffen. Sondern 99 Prozent der TITEL
   in jedem Horizont, den das Produkt zeigt. Die uebrigen sind durch
   conversionAvailable=false ehrlich abgedeckt (O-13). */
const SCHWELLE = 0.99;

/* WELCHE HORIZONTE DAS GATE BEURTEILT - UND WELCHER NICHT.

   MAX ist kein Versprechen in EUR. Die Kursreihen reichen bis 1990, die
   aelteste FX-Quelle bis 1999; ein MAX-Chart in EUR KANN dort nicht
   anfangen. Diesen Horizont an derselben Schwelle zu messen hiesse, das
   Gate dauerhaft an einer Datenlage scheitern zu lassen, die bekannt,
   dokumentiert und dem Owner als O-15 vorgelegt ist.

   Ein Gate, das aus einem bekannten Grund immer rot ist, wird
   uebergangen - und schuetzt dann auch dort nicht mehr, wo es
   gebraucht wird.

   MAX wird deshalb gemessen und BERICHTET, aber nicht beurteilt. Was
   beurteilt wird, sind die Horizonte, die das Produkt in EUR zusagt. */
const GATED = ["1J", "5J", "10J", "15J"];
const beurteilt = horizonte.filter((h) => GATED.includes(h.id));
const verfehlt = beurteilt.filter((h) => proHorizont[h.id].titelquote < SCHWELLE);
const verdict = loaded.tiingo + loaded.ecb === 0 ? "NOT_MEASURED"
  : verfehlt.length ? "FAIL" : "PASS";

const report = {
  schema: "vu-historical-fx-coverage-1.0.0",
  generatedAtUtc: new Date().toISOString(),
  note: "Fuer jeden Zeitpunkt, den das Produkt zeigt, gegen jede Waehrung, die das Universum fuehrt. " +
        "Gewichtet nach betroffenen Titeln - eine Waehrung mit einem Titel und eine mit 10.858 sind nicht gleich wichtig.",
  verdict,
  verdictMeaning: {
    PASS: `In jedem geprueften Horizont sind mindestens ${Math.round(SCHWELLE * 100)} % der Titel umrechenbar.`,
    FAIL: "Mindestens ein Horizont bleibt unter der Schwelle.",
    NOT_MEASURED: "Kein FX-Bestand geladen."
  }[verdict],
  threshold: SCHWELLE,
  gatedHorizons: GATED,
  informationalHorizons: horizonte.filter((h) => !GATED.includes(h.id)).map((h) => h.id),
  gatingNote: "MAX wird gemessen und berichtet, aber nicht beurteilt: die Kursreihen reichen weiter " +
              "zurueck als jede FX-Quelle. Ein Gate, das aus einem bekannten Grund immer rot ist, wird uebergangen.",
  sourcesLoaded: loaded,
  horizons: horizonte,
  maxSeriesStart: maxBeginn,
  perHorizon: proHorizont,
  perCurrency: zeilen.map((z) => ({ ...z, eurChartStart: chartStart[z.currency] || null }))
                     .sort((a, b) => b.titel - a.titel),
  /* Was eine Oberflaeche wissen muss: ab wann ein EUR-Chart beginnen
     kann. Davor zeigt der Layer keine EUR-Werte - und soll es nicht. */
  eurChartStart: chartStart,
  eurChartStartMainCurrency: eurChartStartGewichtet,
  priceSeriesStart: maxBeginn,
  gapBeforeFx: (maxBeginn && eurChartStartGewichtet && eurChartStartGewichtet.ab > maxBeginn)
    ? { from: maxBeginn, to: eurChartStartGewichtet.ab,
        note: "Kursreihen reichen weiter zurueck als jede FX-Quelle. Ein MAX-Chart in EUR beginnt spaeter als in der Originalwaehrung - der Layer verweigert die Punkte davor (beforeSeriesStart) statt sie zu naehern." }
    : null,
  shortfall: verfehlt.map((h) => ({ horizon: h.id, datum: h.datum,
    titelquote: proHorizont[h.id].titelquote, fehlend: proHorizont[h.id].fehlend }))
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log("HISTORISCHE FX-ABDECKUNG\n");
console.log(`  Quellen geladen: tiingo ${loaded.tiingo} Paare, ecb ${loaded.ecb} Paare`);
console.log(`  Waehrungen im Universum: ${zeilen.length}, Titel gesamt: ${titelGesamt}\n`);
console.log(`  ${"Horizont".padEnd(8)}${"Datum".padEnd(13)}${"Waehrungen".padEnd(13)}${"Titel".padEnd(20)}Quellen`);
for (const h of horizonte) {
  const p = proHorizont[h.id];
  const marke = GATED.includes(h.id) ? "  " : "i ";
  console.log(`  ${marke}${h.id.padEnd(6)}${h.datum.padEnd(13)}` +
    `${(p.waehrungenAbgedeckt + "/" + p.waehrungenGesamt).padEnd(13)}` +
    `${((p.titelquote * 100).toFixed(2) + " %").padEnd(20)}` +
    Object.entries(p.quellen).map(([s, n]) => `${s}:${n}`).join(" "));
  if (p.fehlend.length && p.fehlend.length <= 8) console.log(`  ${"".padEnd(8)}ohne: ${p.fehlend.join(", ")}`);
}
if (report.gapBeforeFx) {
  console.log(`\n  Kursreihen ab ${report.gapBeforeFx.from}, FX ab ${report.gapBeforeFx.to}.`);
  console.log(`  Ein MAX-Chart in EUR beginnt deshalb spaeter als in der Originalwaehrung.`);
}
console.log(`\nHISTORICAL_FX_COVERAGE = ${verdict}`);
console.log(`Bericht: ${OUT}`);

/* MESSEN UND BEURTEILEN SIND ZWEI SCHRITTE.

   Die erste Fassung endete bei FAIL mit Code 1 - und damit brach der
   Lauf ab, BEVOR der Bericht committet war. Das Ergebnis: ein rotes
   Gate ohne die Zahl, die erklaert, warum es rot ist. Genau der Fall,
   fuer den scripts/ci/commit-and-push.sh existiert ("was teuer erkauft
   ist, wird committet, bevor etwas Optionales laeuft").

   Dieses Skript misst jetzt und endet erfolgreich. Ob der Befund das
   Gate schliesst, entscheidet ein eigener Schritt NACH dem Commit -
   `--gate` liest denselben Bericht und faellt das Urteil. */
if (args.has("--gate") && verdict === "FAIL") {
  console.error(`\nGATE GESCHLOSSEN: ${verfehlt.map((h) => h.id).join(", ")} unter ${Math.round(SCHWELLE * 100)} %.`);
  process.exit(1);
}
process.exit(0);
