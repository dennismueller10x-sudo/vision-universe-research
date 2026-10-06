/* =========================================================================
   Feste Tiingo-Antworten fuer die Tests.

   Die Form stammt aus der Anbieterdokumentation und einer veroeffentlichten
   Beispielantwort; die Werte sind auf die Faelle zugeschnitten, die geprueft
   werden sollen. Sie sind ausdruecklich KEIN Beleg fuer das Verhalten der
   echten Schnittstelle - dafuer ist der Laufzeitnachweis da
   (scripts/market/verify-tiingo-adjustment.mjs).

   Was diese Fixtures leisten: sie halten die Uebersetzung Tiingo -> Vision
   Universe fest. Aendert jemand die Zuordnung, brechen die Tests, und zwar
   ohne dass eine Anfrage ins Netz geht.
   ========================================================================= */
"use strict";

/* Gewoehnliche Tage: kein Split, keine Dividende. adjClose == close, weil
   nach dem letzten Ereignis nichts mehr zurueckzurechnen ist. */
const AAPL_PLAIN = [
  { date: "2026-09-02T00:00:00.000Z", open: 228.00, high: 230.10, low: 227.40, close: 229.60,
    volume: 36200000, adjOpen: 228.00, adjHigh: 230.10, adjLow: 227.40, adjClose: 229.60,
    adjVolume: 36200000, divCash: 0, splitFactor: 1 },
  { date: "2026-09-03T00:00:00.000Z", open: 229.50, high: 231.90, low: 228.70, close: 231.05,
    volume: 38500000, adjOpen: 229.50, adjHigh: 231.90, adjLow: 228.70, adjClose: 231.05,
    adjVolume: 38500000, divCash: 0, splitFactor: 1 },
  { date: "2026-09-04T00:00:00.000Z", open: 231.10, high: 233.40, low: 230.20, close: 232.80,
    volume: 41000000, adjOpen: 231.10, adjHigh: 233.40, adjLow: 230.20, adjClose: 232.80,
    adjVolume: 41000000, divCash: 0, splitFactor: 1 }
];

/* Ein 4:1-Split. Der Tag davor traegt den unbereinigten Kurs (rund viermal
   so hoch) und einen adjClose, der bereits auf das Niveau nach dem Split
   zurueckgerechnet ist. Genau daran laesst sich pruefen, ob der Adapter
   raw und adjusted auseinanderhaelt. */
const NVDA_SPLIT = [
  { date: "2021-07-16T00:00:00.000Z", open: 726.00, high: 730.00, low: 722.00, close: 726.44,
    volume: 5100000, adjOpen: 18.15, adjHigh: 18.25, adjLow: 18.05, adjClose: 18.161,
    adjVolume: 20400000, divCash: 0, splitFactor: 1 },
  { date: "2021-07-19T00:00:00.000Z", open: 18.20, high: 18.85, low: 18.10, close: 18.780,
    volume: 22000000, adjOpen: 18.20, adjHigh: 18.85, adjLow: 18.10, adjClose: 18.780,
    adjVolume: 22000000, divCash: 0, splitFactor: 4 },
  { date: "2021-07-20T00:00:00.000Z", open: 18.60, high: 18.90, low: 18.40, close: 18.612,
    volume: 19500000, adjOpen: 18.60, adjHigh: 18.90, adjLow: 18.40, adjClose: 18.612,
    adjVolume: 19500000, divCash: 0, splitFactor: 1 }
];

/* Eine Dividende. Der Kurs vor dem Ex-Tag ist im adjClose um die
   Ausschuettung nach unten korrigiert - der Unterschied zwischen
   Kursrendite und Gesamtrendite, sichtbar in einer einzigen Zeile. */
const KO_DIVIDEND = [
  { date: "2026-06-12T00:00:00.000Z", open: 62.00, high: 62.40, low: 61.80, close: 62.20,
    volume: 12000000, adjOpen: 61.52, adjHigh: 61.92, adjLow: 61.32, adjClose: 61.72,
    adjVolume: 12000000, divCash: 0, splitFactor: 1 },
  { date: "2026-06-13T00:00:00.000Z", open: 61.70, high: 62.10, low: 61.50, close: 61.90,
    volume: 13500000, adjOpen: 61.70, adjHigh: 62.10, adjLow: 61.50, adjClose: 61.90,
    adjVolume: 13500000, divCash: 0.485, splitFactor: 1 }
];

const METADATA_AAPL = {
  ticker: "AAPL",
  name: "Apple Inc",
  exchangeCode: "NASDAQ",
  description: "Apple Inc. designs, manufactures, and markets smartphones.",
  startDate: "1980-12-12",
  endDate: "2026-09-04"
};

const IEX_QUOTE = [
  { ticker: "AAPL", timestamp: "2026-09-04T20:00:00+00:00", last: 232.80, prevClose: 231.05,
    open: 231.10, high: 233.40, low: 230.20, volume: 41000000 }
];

const IEX_INTRADAY = [
  { date: "2026-09-04T13:30:00.000Z", open: 231.10, high: 231.60, low: 230.90, close: 231.40, volume: 820000 },
  { date: "2026-09-04T13:35:00.000Z", open: 231.40, high: 231.95, low: 231.20, close: 231.85, volume: 640000 }
];

/* Fehlerformen. Tiingo antwortet mit passendem HTTP-Status und einem
   detail-Feld - anders als Twelve Data, das Fehler mit HTTP 200 schickt. */
const ERROR_UNAUTHORIZED = { detail: "Not authorized. Please check your API token." };
const ERROR_NOT_FOUND = { detail: "Error: Ticker 'ZZZZ' not found" };
const ERROR_RATE_LIMIT = { detail: "You have exceeded your hourly request allocation." };

/** Baut eine Antwort in der Form, die der MarketClient erwartet. */
function response(body, status) {
  return Promise.resolve({
    ok: (status || 200) < 400,
    status: status || 200,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body))
  });
}

module.exports = {
  AAPL_PLAIN, NVDA_SPLIT, KO_DIVIDEND,
  METADATA_AAPL, IEX_QUOTE, IEX_INTRADAY,
  ERROR_UNAUTHORIZED, ERROR_NOT_FOUND, ERROR_RATE_LIMIT,
  response
};
