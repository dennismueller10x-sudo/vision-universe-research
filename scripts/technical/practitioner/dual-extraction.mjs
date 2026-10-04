/* Practitioner Reference Benchmark — Doppelextraktion LLM_DUAL_INDEPENDENT_PRIMARY (Protokoll-Nachtrag 2).

   Vergleicht zwei unabhaengige Extraktionsdurchgaenge (A, B) derselben Primaerquelle in den Kernfeldern
     family (Musterfamilie), currentWave (laufende Welle, normalisiert), direction (directionalBias = A1, Bewegung ab jetzt),
     invalidation (Preis ±1 % und gleiche Richtung, wo genannt), timeframe, instrument (gleiche VU-Abbildung bzw. gleicher Name)
   und leitet die Sicherheit ab (Nachtrag 2 Punkt 2/3):
     • Kernfeld-Werte je Feld: true (gleich), false (abweichend), "NOT_STATED" (in beiden Durchgaengen nicht genannt).
     • HIGH nur, wenn A und B in allen Kernfeldern uebereinstimmen (true/NOT_STATED) und kein Grund zur Abstufung vorliegt
       (Plattformhinweis auf Bearbeitung → hoechstens MEDIUM, Nachtrag 2 Punkt 7).
     • Abweichung → Schiedsdurchgang; danach ungeklaerte Felder UNKNOWN; Sicherheit hoechstens MEDIUM.
     • Weniger als zwei bekannte Kernfelder → LOW (nicht benchmarkfaehig).
   Reine Funktionen, keine Datei- oder Netzwerkzugriffe. */
import { normalizeWaveLabel, normSym, resolveInstrument, loadInstrumentMap } from "./lib.mjs";

export const CORE_FIELDS = Object.freeze(["family", "currentWave", "direction", "invalidation", "timeframe", "instrument"]);
const isUnknown = (v) => v === null || v === undefined || v === "" || v === "UNKNOWN";

export function coreValue(pass, field, map = loadInstrumentMap()) {
  const p = (pass && pass.primary) || {};
  switch (field) {
    case "family": return isUnknown(p.family) ? null : p.family;
    case "currentWave": return isUnknown(p.currentWave) ? null : (normalizeWaveLabel(p.currentWave) || String(p.currentWave));
    case "direction": return isUnknown(pass.directionalBias) ? null : pass.directionalBias;
    case "invalidation": return pass.invalidation && Number.isFinite(pass.invalidation.price) ? { price: pass.invalidation.price, direction: pass.invalidation.direction } : null;
    case "timeframe": return isUnknown(pass.timeframe) ? null : pass.timeframe;
    case "instrument": {
      const r = instrumentKeyOf(pass.instrument, map);
      return r ? r.key : null;
    }
    default: throw new Error("unbekanntes Kernfeld " + field);
  }
}
export function sameCore(field, a, b) {
  if (a === null && b === null) return "NOT_STATED";
  if (a === null || b === null) return false;
  if (field === "instrument" && a.startsWith("NAME:") && b.startsWith("NAME:")) {
    const A = a.slice(5).split("|"), B = b.slice(5).split("|");
    return A.every((w) => B.includes(w)) || B.every((w) => A.includes(w));
  }
  if (field === "invalidation") return a.direction === b.direction && Math.abs(a.price - b.price) <= 0.01 * Math.max(Math.abs(a.price), Math.abs(b.price));
  return a === b;
}
/** Kernfeld-Uebereinstimmung A↔B: {family: true|false|"NOT_STATED", …}. */
export function compareCoreFields(a, b, map = loadInstrumentMap()) {
  const out = {};
  for (const f of CORE_FIELDS) out[f] = sameCore(f, coreValue(a, f, map), coreValue(b, f, map));
  return out;
}
/**
 * Sicherheit nach Nachtrag 2. agreementAB: Ergebnis von compareCoreFields; finalKnown: Anzahl der nach Schiedsdurchgang bekannten
 * Kernfelder; evidenced: Kernfelder als sichtbare Labels/ausdrueckliche Aussage belegt; editFlag: Plattformhinweis auf Bearbeitung.
 */
export function confidenceFor({ agreementAB, finalKnown, evidenced = true, editFlag = false, passSelf = [] }) {
  if (finalKnown < 2) return "LOW";
  if (passSelf.includes("LOW")) return "MEDIUM";
  const allAgree = Object.values(agreementAB).every((v) => v === true || v === "NOT_STATED");
  return allAgree && evidenced && !editFlag ? "HIGH" : "MEDIUM";
}

/**
 * Instrument eines Durchgangs → Schluessel der instrument-map (mapId bzw. Aktien-Ticker), robust gegen freie Schreibweisen
 * ("$DAX-XET (DAX)", "Gartner, Inc. (IT), NYSE"): Kandidaten in fester Reihenfolge — ganzer Text, Klammerinhalte, einzelne
 * Woerter, Wortpaare; je Kandidat erst mit dem angegebenen Typ, dann mit UNKNOWN. Erster Treffer gewinnt. Kein Treffer →
 * normalisierter Name. Liefert {key, token, resolved}.
 */
/* Keine Instrument-Kandidaten: Zeitrahmen-/Chartkennungen und Boersennamen ("NVDA (W)" ist nicht Ticker W). */
const CAND_STOP = new Set(["W", "D", "M", "H", "1D", "1W", "1M", "4H", "1H", "60", "240", "120", "45", "DYNAMIC", "NYSE", "NASDAQ", "NASDAQGS", "AMEX", "XETRA", "NAS", "INC", "CORP", "ETF", "INDEX", "F"]);
export function instrumentKeyOf(instr, map = loadInstrumentMap()) {
  const i = instr || {};
  if (isUnknown(i.asShown)) return null;
  const s = String(i.asShown);
  const words = s.split(/[^A-Za-z0-9&!.$]+/).map((w) => w.replace(/^\$/, "").replace(/[.,-]+$/, "")).filter(Boolean);
  const cands = [s, ...[...s.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim()), ...words, ...words.slice(1).map((w, k) => words[k] + " " + w)];
  /* Aktien/ETFs nur mit eigenem Typ aufloesen ("VanEck Junior Gold Miners ETF" ist kein Gold-Spot) */
  const own = i.instrumentType || "UNKNOWN";
  const types = own === "STOCK" || own === "ETF" ? [own] : [...new Set([own, "UNKNOWN"])];
  /* "F" ist als Aktie der Ford-Ticker, sonst Chartkennung */
  const stopped = (x) => { const u = String(x).trim().toUpperCase(); return CAND_STOP.has(u) && !(u === "F" && own === "STOCK"); };
  for (const c of cands.filter((x) => !stopped(x))) for (const t of types) {
    const r = resolveInstrument({ asShown: c, instrumentType: t, priceAdjustment: i.priceAdjustment }, map);
    if (r.mapId) return { key: r.vuSymbol ? "VU:" + r.vuSymbol : "MAP:" + r.mapId, token: c, resolved: r, instrumentType: t };
  }
  /* ohne Abbildung: Wortmenge ohne Zeitrahmen-/Boersenkennungen; zwei Namen gelten als gleich, wenn eine Wortmenge die andere enthaelt */
  const set = [...new Set(words.map(normSym).filter((w) => w && !CAND_STOP.has(w)))].sort();
  return { key: "NAME:" + set.join("|"), token: s, resolved: null, instrumentType: i.instrumentType || "UNKNOWN" };
}
