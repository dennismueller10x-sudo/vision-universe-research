#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — signal-evidence.mjs
   HISTORISCHE BEOBACHTUNG ZU INDIKATOR-EREIGNISSEN UND KERZENMUSTERN FUER DAS PRODUKT (AP6, H4)

   Verdichtet die beiden Auswertungen scripts/technical/indicator-evidence.mjs und candlestick-evidence.mjs
   (Methode dort und in docs/technical/INDICATOR_EVIDENCE.md, CANDLESTICK_EVIDENCE.md) zu einem kleinen,
   oeffentlichen Artefakt technical/data/signal-evidence.json. Gezeigt wird je Zeile nur der 20-Tage-Horizont.

   Einordnung je Zeile (`reading`), streng beschreibend (docs/technical/SIGNAL_EVIDENCE.md):
     NO_DIFFERENCE      nach Mehrfachtest-Korrektur kein belastbarer Unterschied zum Querschnitt
     MIXED              belastbar im Gesamtmittel, aber das Vorzeichen wechselt zwischen Marktphasen/Zeithaelften
     WITH_DIRECTION     belastbar und phasenstabil in der ueblichen Lesart (bullisch besser, baerisch schlechter)
     AGAINST_DIRECTION  belastbar und phasenstabil GEGEN die uebliche Lesart
     NEUTRAL_PATTERN    Muster ohne Richtung (Doji u. a.): keine Lesart, nur Haeufigkeit
   Keine Zeile ist ein Kauf- oder Verkaufssignal; Kosten, Ausfuehrung und Out-of-Sample sind nicht geprueft.
   Erzeuger: build-screener.mjs (ohne --no-evidence). Kein Anbieterabruf: liest nur die Materialisierung.
   ========================================================================= */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SIGNAL_EVIDENCE_SCHEMA = "vu-technical-signal-evidence-1.0.0";
export const READINGS = ["NO_DIFFERENCE", "MIXED", "WITH_DIRECTION", "AGAINST_DIRECTION", "NEUTRAL_PATTERN"];

/** Einordnung einer Zeile aus 20-Tage-Ergebnis und Phasenstabilitaet (stableSign: 1, -1, 0 = widerspruechlich, null = zu wenig). */
export function readingOf(row) {
  if (row.direction === "NEUTRAL") return "NEUTRAL_PATTERN";
  const h = row.h20;
  if (!h || !h.significant) return "NO_DIFFERENCE";
  if (row.stableSign !== 1 && row.stableSign !== -1) return "MIXED";
  if (Math.sign(h.mean) !== row.stableSign) return "MIXED";
  return h.mean > 0 ? "WITH_DIRECTION" : "AGAINST_DIRECTION";
}

function slim(row, id) {
  const h = row.h20 || {};
  return { id, name: row.name, direction: row.direction, titles: row.titles, n: h.n, dates: h.dates, mean: h.mean, ci95: h.ci95,
    hitRate: h.hitRate, significant: !!h.significant, stableSign: row.stableSign === undefined ? null : row.stableSign, reading: readingOf(row) };
}

/** Produktartefakt aus den Ergebnissen beider Auswertungen (reine Funktion, testbar ohne Daten). */
export function compose(ind, cdl) {
  return {
    schemaVersion: SIGNAL_EVIDENCE_SCHEMA,
    sources: { indicators: ind.schemaVersion, candles: cdl.schemaVersion, indicatorEngine: ind.engine || null, candleEngine: cdl.engine || null },
    /* window = fruehester/spaetester Bar ueber alle Titel; einzelne lange eingefrorene Reihen ziehen "from" weit zurueck.
       Massgeblich ist: je Titel die 270 veroeffentlichten Tagesbars, also rund ein Marktjahr bis window.to. */
    window: Object.assign({}, ind.window, { regime: "je Titel die 270 veröffentlichten Tagesbars, rund ein Marktjahr" }), titles: ind.titles, horizonBars: 20,
    method: {
      outcome: "Rendite Schluss am Ereignistag -> 20 Handelstage spaeter minus Mittel aller Titel desselben Datums (mind. 50 Titel), baerische Ereignisse mit umgekehrtem Vorzeichen",
      knowledgeTime: "Ereignis am Schluss von Bar i nur aus Bars <= i",
      significance: "Intervall ueber Datums-Cluster, Bonferroni ueber Zeilen x Horizonte (alpha 5 %)",
      stability: "Vorzeichen gleich bei SPY ueber/unter SMA 50 und in beiden Zeithaelften (je >= 30 Ereignisse)",
      minN: ind.minN, costs: "keine (beschreibende Statistik, keine Handelssimulation)"
    },
    claims: { event: "technisch definiert, nachrechenbar", observation: "historischer Mittelwert, beschreibend", strategyEdge: "nicht nachgewiesen" },
    indicators: (ind.events || []).map((r) => slim(r, r.event)),
    candles: (cdl.patterns || []).map((r) => slim(r, r.pattern)),
    notReported: { indicators: ind.notReported || [], candles: cdl.notReported || [] }
  };
}

export async function buildAndWrite(out) {
  const t0 = Date.now();
  const [Ind, Cdl] = await Promise.all([import("../indicator-evidence.mjs"), import("../candlestick-evidence.mjs")]);
  const res = compose(Ind.build({}), Cdl.build({}));
  res.runtimeSec = Math.round((Date.now() - t0) / 1000);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(res) + "\n");
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : null;
  if (!out) { console.error("Aufruf: node scripts/technical/world/signal-evidence.mjs --out DATEI"); process.exit(2); }
  const r = await buildAndWrite(out);
  const count = (rows) => READINGS.map((k) => k + " " + rows.filter((x) => x.reading === k).length).join(", ");
  console.log("Indikatoren: " + count(r.indicators) + "\nKerzen: " + count(r.candles) + "\n" + r.runtimeSec + " s");
}
