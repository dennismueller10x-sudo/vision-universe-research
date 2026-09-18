/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/visual-data.mjs

   WELCHE BILDFORMEN TRAEGT DIE DATENLAGE DIESES OBJEKTS?

   Die Bruecke zwischen dem, was im Repository liegt, und dem, was
   visual-provider.js als Faehigkeiten erwartet. Sie LIEST nur und
   entscheidet nichts: welche Strategie gewaehlt wird, bleibt eine
   inhaltliche Frage.

   Sie erfindet auch nichts. Fehlt eine Kursreihe, meldet sie
   `timeSeries: false` — und die Strategie faellt weg, bevor irgendetwas
   gezeichnet wird.
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SERIEN_ORDNER = "quant/data/market/discover-series";

/** Das Kuerzel aus einem Thema wie "Technisches Setup — XOM". */
export function symbolAus(topic) {
  const t = /\b([A-Z]{1,5})\s*$/.exec(String(topic || "").trim());
  return t ? t[1] : null;
}

/* Anzeigenamen der Datenquellen. Ein Bild ohne nachvollziehbare Quelle
   ist bei uns keines - und "tiingo" klein geschrieben ist ein
   Schluesselwort, kein Quellenname. */
const QUELLENNAME = { tiingo: "Tiingo", "vu.technical": "Vision Universe" };

/** Die Kursreihe eines Instruments samt Herkunft, oder null. */
export function kursreihe(symbol, root) {
  if (!symbol) return null;
  const pfad = join(root || ROOT, SERIEN_ORDNER, "ref_" + symbol + ".json");
  if (!existsSync(pfad)) return null;
  try {
    const daten = JSON.parse(readFileSync(pfad, "utf8"));
    if (!Array.isArray(daten.points) || !daten.points.length) return null;
    const quelle = String(daten.source || daten.provider || "");
    return { points: daten.points,
      source: QUELLENNAME[quelle] || quelle || null,
      asOf: daten.asOf || null };
  } catch { return null; }
}

/* Aus den Aussagen der Evidenz: "TREND_STRUCTURE traegt 27.35 von 30
   Punkten bei." Dieselbe Quelle, aus der story-selection.js den
   Spannungsbogen liest — damit Bild und Text nicht auseinanderlaufen. */
const BEITRAG = /^score-contribution-(.+)$/;
const ANTEIL = /(-?\d+(?:[.,]\d+)?)\s*von\s*(\d+(?:[.,]\d+)?)/i;

/* Lesernamen fuer die internen Bezeichner. Dieselbe Grenze wie in
   creative-quality.js: der Sachverhalt darf aufs Bild, der Bezeichner
   nicht. */
const LESERNAME = {
  TREND_STRUCTURE: "Trendstruktur",
  MOMENTUM: "Momentum",
  VOLUME: "Volumen",
  VOLATILITY: "Schwankungsbreite",
  SETUP: "Setup",
  PROJECTION_AUXILIARY: "Projektion",
  RELATIVE_STRENGTH: "Relative Staerke"
};

function zahl(x) {
  const n = parseFloat(String(x).replace(",", "."));
  return isFinite(n) ? n : null;
}

/** Score-Beitraege aus der Evidenz. */
export function beitraege(evidence) {
  const raus = [];
  (evidence || []).forEach((e) => {
    const t = BEITRAG.exec(String((e && e.id) || ""));
    if (!t) return;
    const a = ANTEIL.exec(String(e.statement || ""));
    if (!a) return;
    const wert = zahl(a[1]), max = zahl(a[2]);
    if (wert === null || max === null) return;
    const schluessel = t[1].toUpperCase();
    raus.push({ label: LESERNAME[schluessel] || schluessel, value: wert, max });
  });
  return raus;
}

/** Renditen aus der Evidenz, laengster Horizont zuletzt. */
export function renditen(evidence) {
  const raus = [];
  (evidence || []).forEach((e) => {
    const t = /^momentum-(\d+)m$/i.exec(String((e && e.id) || ""));
    if (!t) return;
    const wert = zahl(e.value);
    if (wert === null) return;
    const monate = parseInt(t[1], 10);
    raus.push({ label: monate === 1 ? "1 Monat" : monate + " Monate",
      value: wert, months: monate });
  });
  raus.sort((a, b) => a.months - b.months);
  return raus;
}

/**
 * Die Datenlage eines Content Objects.
 *
 * `peers` kommt von aussen: welche anderen Objekte im selben Lauf
 * stehen, weiss nur der Zyklus.
 */
export function datenlage(spec, root) {
  spec = spec || {};
  const symbol = spec.symbol || symbolAus(spec.topic);
  const serie = kursreihe(symbol, root);
  const reihe = serie ? serie.points : null;
  const teile = beitraege(spec.evidence);
  const renditeliste = renditen(spec.evidence);
  const peers = Array.isArray(spec.peers) ? spec.peers : [];

  return {
    symbol,
    availability: {
      keyNumber: !!(spec.evidence || []).some((e) => e && e.value !== null &&
        e.value !== undefined && e.value !== ""),
      source: !!(spec.evidence || []).length,
      statement: !!(spec.evidence || []).some((e) => e && e.statement),
      timeSeries: !!reihe,
      scoreContributions: teile.length >= 2,
      returns: renditeliste.length > 0,
      peerValues: peers.length >= 2,
      /* Trend/Momentum/Volatilitaet liegen als eigene Belege vor. */
      trendState: !!(spec.evidence || []).some((e) => e && /^trend$|^momentum$|^volatility$/.test(e.id)),
      /* Fundamentaldaten sind im Social-Evidence-Paket nicht enthalten.
         Das ehrlich zu melden ist besser, als FUNDAMENTAL zu waehlen
         und dann nichts zu haben. */
      fundamentals: false,
      visualBrief: !!spec.visualBrief
    },
    /* Woher die Reihe stammt - fuer die Quellenzeile unter dem Bild. */
    series: serie ? { source: serie.source, asOf: serie.asOf } : null,

    /* Die Rohdaten fuer visual-composition.js. */
    composition: {
      points: reihe,
      contributions: teile,
      total: (spec.evidence || []).filter((e) => e && e.id === "score")
        .map((e) => zahl(e.value))[0] ?? null,
      totalMax: 100,
      returns: renditeliste,
      peers
    }
  };
}
