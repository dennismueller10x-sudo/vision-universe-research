/* Practitioner Reference Benchmark — Analyse-Stichtag (Protokoll §5).

   EINE Regel fuer Seite und Pipeline: Die Implementierung liegt (DOM-frei, Browser + Node) in
   quant/research/elliott-practitioners/reference-core.js (Objekt CUTOFF); dieses Modul re-exportiert sie unveraendert.
   Damit schreibt das Erfassungsformular genau den Stichtag, den lib.validateReference erwartet (Red-Team H2).

   analysisCutoff = letzter TAGESbar, dessen Schluss strikt VOR dem fruehestmoeglichen Veroeffentlichungszeitpunkt lag
   (DAY → 00:00 in publication.timezone, HOUR → Stundenbeginn, MINUTE → Zeitstempel). Gespeichert wird immer der Tages-Stichtag,
   auch bei 1W/1M; abgeschlossene Wochen (lastCompleteWeekEnd) und das Einrasten auf vorhandene Bars (Feiertage) macht nur replay.mjs.
   Schlusszeit je VU-Reihe (Red-Team H1, spaetestmoeglich = konservativ): US-ETFs/Aktien 16:00 New York; Krypto und Tiingo-Metalle
   24:00 UTC (UTC-Kalendertag; Metalle So–Fr); EIA-Spot 24:00 New York; N225 15:30 Tokio; Xetra 17:30 Berlin. Markt je vuSymbol:
   SYMBOL_MARKET (gleich instrument-map.json seriesMarkets). */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const K = require("../../../quant/research/elliott-practitioners/reference-core.js").CUTOFF;

export const CORE = K;
export const MARKETS = K.MARKETS;
export const SYMBOL_MARKET = K.SYMBOL_MARKET;
export const marketForSymbol = K.marketForSymbol;
export const parsePublication = K.parsePublication;
export const timestampConsistency = K.timestampConsistency;
export const computeAnalysisCutoff = K.computeAnalysisCutoff;
export const lastCompleteWeekEnd = K.lastCompleteWeekEnd;
export const weekKey = K.weekKey;
export const snapToBars = K.snapToBars;
export const sessionDaysBetween = K.sessionDaysBetween;
export const closeInstant = K.closeInstant;
export const isSessionDay = K.isSessionDay;
export const zonedToUtc = K.zonedToUtc;
export const zonedParts = K.zonedParts;
export const tzOffsetMinutes = K.tzOffsetMinutes;
export const localDate = K.localDate;
export const addDays = K.addDays;
export const dow = K.dow;
export const isIsoDate = K.isIsoDate;
export const isValidTimeZone = K.isValidTimeZone;
