/* =========================================================================
   VISION UNIVERSE — providers/fmp/adapter.js   (Multi-Asset Core, Indexstaende)

   FINANCIAL MODELING PREP - VORHANDENER ZUGANG (FMP_API_KEY, bereits von
   update-fundamentals und update-analyst-ratings verwendet).

   Gemessen (index-source-probe.json, Tarif des vorhandenen Schluessels):
     Tagesschluss 10 Jahre, Name und Groessenordnung passend:
       ^GSPC S&P 500, ^DJI Dow Jones Industrial Average, ^STOXX50E Euro
       STOXX 50, ^FTSE FTSE 100, ^N225 Nikkei 225, ^HSI Hang Seng Index,
       ^RUT Russell 2000
     Nicht im Tarif (HTTP 402 "Premium Query Parameter"): ^NDX, ^GDAXI,
       ^FCHI, ^SSMI
     Intraday (historical-chart/5min): "Restricted Endpoint" fuer alle.

   Der Name aus der Indexliste wird bei jedem Lauf gegen den Katalog
   geprueft (identity) - ein gleichlautendes Kuerzel eines anderen
   Instruments darf nicht durchrutschen (Twelve Data: "000001" war eine
   Aktie, kein Index).

   Die Anzeige-Lizenz ist nicht gemessen (UNKNOWN) - die Reihen laufen als
   LICENSE_PENDING: technisch angebunden, nicht ausgeliefert.

   Nur Node. URL und Parser; der Abruf liegt im Ingest. Der Schluessel
   wird vom Aufrufer eingesetzt und nie zurueckgegeben.
   ========================================================================= */
"use strict";

const PROVIDER_ID = "fmp";
const BASE = "https://financialmodelingprep.com/stable";
/* Symbol -> FMP-Kuerzel und der Name, den die Indexliste dafuer fuehren muss. */
const INDICES = {
  SPX: { symbol: "^GSPC", name: /^S&P 500$/i },
  DJI: { symbol: "^DJI", name: /^Dow Jones Industrial Average$/i },
  SX5E: { symbol: "^STOXX50E", name: /^Euro STOXX 50$/i },
  UKX: { symbol: "^FTSE", name: /^FTSE 100$/i },
  N225: { symbol: "^N225", name: /^Nikkei 225$/i },
  HSI: { symbol: "^HSI", name: /^Hang Seng Index$/i },
  RUT: { symbol: "^RUT", name: /^Russell 2000$/i }
};

function eodUrl(fmpSymbol, from, key) {
  return `${BASE}/historical-price-eod/light?symbol=${encodeURIComponent(fmpSymbol)}` + (from ? `&from=${from}` : "") + `&apikey=${key}`;
}
function indexListUrl(key) { return `${BASE}/index-list?apikey=${key}`; }
function redact(s) { return String(s).replace(/apikey=[^&\s"]+/gi, "apikey=[REDACTED]"); }

/** index-list JSON -> Map fmpSymbol -> name */
function parseIndexList(json) {
  const m = new Map();
  if (Array.isArray(json)) for (const r of json) if (r && r.symbol) m.set(r.symbol, String(r.name || ""));
  return m;
}

/** Identitaet: steht das Kuerzel mit dem erwarteten Namen in der Liste? */
function identity(symbol, list) {
  const spec = INDICES[symbol];
  if (!spec) return { ok: false, reason: "notMapped" };
  const name = list.get(spec.symbol);
  if (name === undefined) return { ok: false, reason: "notListed", fmpSymbol: spec.symbol };
  return { ok: spec.name.test(name.trim()), reason: spec.name.test(name.trim()) ? "nameMatches" : "nameMismatch", fmpSymbol: spec.symbol, listedName: name };
}

/** historical-price-eod/light JSON -> {points: [[date, close]]}; Fehlerobjekt -> error. */
function parseEod(json) {
  if (!Array.isArray(json)) {
    const msg = json && (json["Error Message"] || json.message || json.error);
    return { points: [], error: msg ? redact(msg).slice(0, 200) : "keine Liste" };
  }
  const points = [];
  for (const r of json) {
    const v = typeof r.price === "number" ? r.price : parseFloat(r.price);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) && isFinite(v)) points.push([r.date, v]);
  }
  points.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const out = [];
  for (const p of points) if (!out.length || out[out.length - 1][0] !== p[0]) out.push(p);
  return { points: out };
}

module.exports = { PROVIDER_ID, INDICES, eodUrl, indexListUrl, parseIndexList, identity, parseEod, redact };
