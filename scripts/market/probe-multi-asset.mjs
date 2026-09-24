/* =========================================================================
   VISION UNIVERSE — probe-multi-asset.mjs   (Multi-Asset Data Core, §9/§10/§13)

   MISST, WAS DER BESTEHENDE ZUGANG FUER INDIZES, ROHSTOFFE, EDELMETALLE,
   KRYPTO, RENDITEN UND LEITZINSEN TATSAECHLICH LIEFERT.

   Dieselbe Regel wie probe-tiingo-fx.mjs: keine Faehigkeit gilt aus
   Dokumentation oder Vermutung als vorhanden. Gemessen wird - und was
   nicht gemessen werden konnte, bleibt UNKNOWN. UNKNOWN wird nirgends zu
   SUPPORTED umgedeutet.

   ZWEI GRUPPEN VON QUELLEN

   1. Tiingo (bestehender, lizenzierter Anbieter; Schluessel nur im
      Runner). Zuerst gefragt - §12: wenn Tiingo eine Assetklasse sauber
      liefert, wird der bestehende Pfad bevorzugt.
   2. Offizielle Primaerquellen (US Treasury, NY Fed, EZB, Bundesbank,
      EIA) und - nur als Vergleich - FRED. Sie werden hier NUR gemessen.
      Angebunden wird eine davon erst, wenn Tiingo die Faehigkeit
      objektiv nicht hat (§12).

   WAS IM BERICHT STEHT - UND WAS NICHT

   Statuscodes, Antwortform, Anzahl der Beobachtungen, aeltester und
   juengster Zeitpunkt, Wochenend-Verhalten, Zeitstempelsemantik,
   Kontingent-Header. KEINE Kurse, keine Renditen, keine Zinssaetze: fuer
   die Identitaetspruefung genuegt ein Groessenordnungs-Test
   (magnitude.within = true/false), der den Wert selbst nicht nennt.

   ZUM SCHLUESSEL

   Nur aus der Umgebung, nur im Authorization-Header, nie in einer URL.
   Jeder Bericht laeuft vor dem Schreiben durch redact(). Ohne Schluessel
   wird der Tiingo-Teil als UNKNOWN (nicht gemessen) geschrieben, und die
   offiziellen Quellen werden trotzdem gemessen.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/probe-multi-asset.mjs --publish
     node scripts/market/probe-multi-asset.mjs --dry-run      (keine Abrufe)
     node scripts/market/probe-multi-asset.mjs --no-ws        (ohne WebSocket)
   ========================================================================= */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Catalog = require(join(root, "quant", "engines", "multi-asset", "instrument-catalog.js"));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const PUBLISH = args.has("--publish");
const NO_WS = args.has("--no-ws");
const OUT = PUBLISH
  ? resolve(root, "quant", "data", "market", "capabilities", "multi-asset-probe.json")
  : resolve(root, ".market-cache", "multi-asset", "multi-asset-probe.json");

const BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
const KEY = process.env.TIINGO_API_KEY || "";
const UA = "VisionUniverse-DataCore/1.0 (+https://research.visionuniverse.de)";

const STATUS = Object.freeze({ SUPPORTED: "SUPPORTED", PARTIAL: "PARTIAL",
                                UNSUPPORTED: "UNSUPPORTED", UNKNOWN: "UNKNOWN" });

function redact(value) {
  if (!KEY || KEY.length < 8) return value;
  const json = JSON.stringify(value);
  if (!json.includes(KEY)) return value;
  return JSON.parse(json.split(KEY).join("[REDACTED]"));
}

function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function weekdayUtc(iso) { return new Date(String(iso).slice(0, 10) + "T12:00:00Z").getUTCDay(); }

/* --------------------------------------------------------------------- */
/* Transport                                                               */
/* --------------------------------------------------------------------- */
const requests = { tiingo: 0, official: 0 };
const rateLimitHeaders = {};

async function httpGet(url, { tiingo = false, accept = null, timeoutMs = 30000 } = {}) {
  const headers = { "User-Agent": UA };
  if (tiingo) {
    requests.tiingo++;
    headers.Authorization = `Token ${KEY}`;
    headers["Content-Type"] = "application/json";
  } else {
    requests.official++;
  }
  if (accept) headers.Accept = accept;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
    if (tiingo) {
      for (const [name, value] of res.headers.entries()) {
        if (/rate|limit|quota|remaining|retry/i.test(name)) rateLimitHeaders[name] = value;
      }
    }
    return { ok: res.ok, status: res.status, durationMs: Date.now() - started,
             contentType: res.headers.get("content-type") || null,
             bytes: text.length, json, text };
  } catch (err) {
    return { ok: false, status: null, durationMs: Date.now() - started, json: null, text: "",
             networkError: String(err && err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

const tiingo = (path) => httpGet(BASE + path, { tiingo: true });

/* Kurzform einer Antwort fuer den Bericht: nie der Inhalt, nur die Form. */
function shape(res) {
  const out = { httpStatus: res.status, durationMs: res.durationMs };
  if (res.networkError) out.networkError = res.networkError;
  if (res.contentType) out.contentType = res.contentType.split(";")[0];
  if (Array.isArray(res.json)) out.arrayLength = res.json.length;
  else if (res.json && typeof res.json === "object") {
    out.objectKeys = Object.keys(res.json).slice(0, 12);
    if (res.json.detail) out.errorDetail = String(res.json.detail).slice(0, 160);
  } else if (res.text) out.textBytes = res.bytes;
  return out;
}

/* Liegt ein Wert in der erwarteten Groessenordnung? Nennt den Wert nicht. */
function magnitude(value, range) {
  if (!range || typeof value !== "number" || !isFinite(value)) return null;
  return { expectedRange: range, within: value >= range[0] && value <= range[1] };
}

/* Eine Reihe von {date|timestamp} auf ihre Abdeckung reduziert. */
function coverage(dates) {
  const list = dates.filter(Boolean).map(String).sort();
  if (!list.length) return { observations: 0 };
  const days = list.map((d) => d.slice(0, 10));
  const weekend = days.filter((d) => { const w = weekdayUtc(d); return w === 0 || w === 6; });
  const sat = days.filter((d) => weekdayUtc(d) === 6).length;
  const sun = days.filter((d) => weekdayUtc(d) === 0).length;
  /* Die groesste Luecke in Kalendertagen - ein Hinweis auf Feiertage,
     Ausfaelle oder eine Reihe, die nicht taeglich ist. */
  let maxGapDays = 0;
  for (let i = 1; i < days.length; i++) {
    const gap = (Date.parse(days[i]) - Date.parse(days[i - 1])) / 86400000;
    if (gap > maxGapDays) maxGapDays = gap;
  }
  return { observations: list.length, firstDate: list[0], lastDate: list[list.length - 1],
           weekendObservations: weekend.length, saturday: sat, sunday: sun, maxGapDays };
}

/* Zeitstempelform: Datum, UTC-Zeitpunkt oder Zeitpunkt mit Offset. */
function timestampSemantics(sample) {
  if (!sample) return null;
  const s = String(sample);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "DATE_ONLY";
  if (/Z$/.test(s)) return /T00:00:00(\.0+)?Z$/.test(s) ? "UTC_MIDNIGHT_DATE" : "UTC_TIMESTAMP";
  if (/[+-]\d{2}:\d{2}$/.test(s)) return "OFFSET_TIMESTAMP";
  return "OTHER";
}

/* --------------------------------------------------------------------- */
/* Befunde                                                                 */
/* --------------------------------------------------------------------- */
const report = {
  schemaVersion: "1.0.0",
  generatedAtUtc: new Date().toISOString(),
  purpose: "Multi-Asset Capability Audit (§9/§10/§13). Gemessen, nicht angenommen.",
  valuesIncluded: false,
  valuesNote: "Der Bericht enthaelt keine Kurse, Renditen oder Zinssaetze. Identitaet wird ueber magnitude.within belegt.",
  keyPresent: Boolean(KEY),
  dryRun: DRY_RUN,
  statusVocabulary: Object.values(STATUS),
  tiingo: { measured: false, probes: {}, matrix: {} },
  official: { probes: {} },
  instruments: {},
  requests
};

function setInstrument(id, patch) {
  report.instruments[id] = Object.assign(report.instruments[id] || { instrumentId: id }, patch);
}

/* --------------------------------------------------------------------- */
/* Tiingo                                                                  */
/* --------------------------------------------------------------------- */

/* Die Suchfunktion sagt, welche Gattungen der Anbieter zu einem Begriff
   ueberhaupt fuehrt. Ein Index, der nur als ETF auftaucht, ist ein
   Befund - kein Anlass, den ETF als Index zu nehmen (§11). */
async function tiingoSearch(query) {
  const res = await tiingo(`/tiingo/utilities/search?query=${encodeURIComponent(query)}&limit=20`);
  const list = Array.isArray(res.json) ? res.json : [];
  const assetTypes = {};
  for (const r of list) assetTypes[r.assetType || "?"] = (assetTypes[r.assetType || "?"] || 0) + 1;
  return {
    query, ...shape(res), results: list.length, assetTypes,
    candidates: list.slice(0, 8).map((r) => ({ ticker: r.ticker, assetType: r.assetType || null,
                                               name: r.name ? String(r.name).slice(0, 80) : null,
                                               countryCode: r.countryCode || null }))
  };
}

async function probeTiingoIndices() {
  const out = {};
  for (const inst of Catalog.byAssetClass("INDEX")) {
    const t = inst.providerCandidates && inst.providerCandidates.tiingo || {};
    const entry = { search: null, metadata: [] };
    if (t.search) entry.search = await tiingoSearch(t.search);
    for (const ticker of (t.dailyTickers || [])) {
      const res = await tiingo(`/tiingo/daily/${encodeURIComponent(ticker)}`);
      const meta = res.json && !Array.isArray(res.json) && res.json.ticker ? res.json : null;
      entry.metadata.push({ ticker, ...shape(res),
                            found: Boolean(meta),
                            name: meta && meta.name ? String(meta.name).slice(0, 80) : null,
                            exchangeCode: meta ? meta.exchangeCode || null : null,
                            startDate: meta ? meta.startDate || null : null });
    }
    /* Ein Treffer zaehlt nur, wenn der Name den Index nennt und die
       Gattung kein ETF/Fonds ist. Ein Treffer mit ETF-Gattung ist ein
       Proxy und wird hier ausdruecklich NICHT als Index gewertet. */
    /* Erster Lauf (36002559332): `spx` loeste auf "Spenda Limited" (ASX)
       auf, `px1` auf "Plexure Group", `dax` auf den Global-X-DAX-ETF.
       Ein Treffer auf das Kuerzel ist keine Identitaet. Gezaehlt wird
       nur, was den Indexnamen traegt und keine Gattung eines
       Wertpapiers (Aktie, Fonds, ETF). */
    const NOT_AN_INDEX = /\b(ETF|ETN|FUND|TRUST|INC|LTD|LIMITED|GROUP|CORP|PLC|HOLDINGS?|SHARES|UCITS)\b/i;
    const nameKey = String(inst.nameDe || inst.name).toUpperCase().replace(/[^A-Z0-9& ]/g, " ").split(/\s+/).filter((w) => w.length > 1);
    const namesIndex = (n) => {
      const u = String(n || "").toUpperCase();
      return nameKey.every((w) => u.includes(w)) && !NOT_AN_INDEX.test(u);
    };
    const searchIndex = (entry.search && entry.search.candidates || [])
      .filter((c) => c.assetType && !/etf|fund|stock/i.test(c.assetType) && namesIndex(c.name));
    const metaIndex = entry.metadata.filter((m) => m.found && namesIndex(m.name));
    entry.sameTickerOtherInstrument = entry.metadata.filter((m) => m.found && !namesIndex(m.name))
      .map((m) => ({ ticker: m.ticker, resolvesTo: m.name, exchangeCode: m.exchangeCode }));
    entry.indexLevelFound = searchIndex.length > 0 || metaIndex.length > 0;
    entry.etfProxiesSeen = (entry.search && entry.search.candidates || [])
      .filter((c) => /etf/i.test(c.assetType || "")).map((c) => c.ticker);
    out[inst.instrumentId] = entry;
    setInstrument(inst.instrumentId, {
      tiingo: { indexLevel: entry.indexLevelFound ? STATUS.PARTIAL : STATUS.UNSUPPORTED,
                reason: entry.indexLevelFound
                  ? "Kandidat gefunden - Identitaet muss vor Nutzung bestaetigt werden."
                  : "Weder Suche noch Stammdaten fuehren eine Indexreihe; nur ETF-Proxys oder nichts." }
    });
  }
  return out;
}

/* FX-Endpunkt: Edelmetalle und moegliche Rohstoff-CFD-Symbole. Ein
   einziger /top-Abruf fragt viele Symbole zugleich; was fehlt, fehlt
   in der Antwort. */
async function probeTiingoFxFamily() {
  const candidates = new Set();
  for (const inst of Catalog.all()) {
    const t = inst.providerCandidates && inst.providerCandidates.tiingo || {};
    (t.fxTickers || []).forEach((x) => candidates.add(x));
  }
  const list = [...candidates];
  /* Erster Lauf: die Sammelabfrage lieferte 6 Zeilen fuer 18 Symbole -
     OHNE Tickerfeld (Felder: index, quoteTimestamp, bid/ask, midPrice).
     Welche 6 es waren, laesst sich daraus nicht sagen; dieselbe
     Unentscheidbarkeit hatte schon tiingo-fx-probe.json (fxBulkQuotes
     null). Deshalb eine Anfrage je Symbol. */
  const bulk = await tiingo(`/tiingo/fx/top?tickers=${list.join(",")}`);
  const quotes = {};
  for (const t of list) {
    const r = await tiingo(`/tiingo/fx/top?tickers=${t}`);
    const row = Array.isArray(r.json) && r.json.length ? r.json[0] : null;
    if (row) quotes[t] = row;
  }
  const servedTickers = new Set(Object.keys(quotes));
  const any = Object.values(quotes)[0] || null;
  const top = {
    requested: list, bulk: { ...shape(bulk), tickerFieldPresent: Array.isArray(bulk.json) && bulk.json[0] ? "ticker" in bulk.json[0] : null },
    served: [...servedTickers],
    quoteFields: any ? Object.keys(any) : [],
    quoteTimestampSemantics: any ? timestampSemantics(any.quoteTimestamp) : null,
    ages: Object.fromEntries(Object.entries(quotes).map(([t, r]) => [t,
      r.quoteTimestamp ? Math.round((Date.now() - Date.parse(r.quoteTimestamp)) / 1000) : null]))
  };
  const perTicker = {};
  for (const ticker of servedTickers) {
    const q = quotes[ticker];
    const mid = q ? (typeof q.midPrice === "number" ? q.midPrice : null) : null;
    /* Der FX-Probe-Lauf hat gezeigt: ein Startdatum vor der Historie
       beantwortet der Anbieter mit HTTP 400, nicht mit einer kuerzeren
       Reihe. Deshalb wird von tief nach flach gefragt, und der erste
       Treffer bestimmt die gemessene Tiefe. */
    const depthAttempts = [];
    let d = null, drows = [];
    for (const start of ["1990-01-01", isoDaysAgo(3650), isoDaysAgo(1825), isoDaysAgo(365)]) {
      d = await tiingo(`/tiingo/fx/${ticker}/prices?startDate=${start}&resampleFreq=1day`);
      depthAttempts.push({ startDate: start, httpStatus: d.status, rows: Array.isArray(d.json) ? d.json.length : null });
      if (d.ok && Array.isArray(d.json) && d.json.length) { drows = d.json; break; }
    }
    const i = await tiingo(`/tiingo/fx/${ticker}/prices?startDate=${isoDaysAgo(4)}&resampleFreq=5min`);
    const irows = Array.isArray(i.json) ? i.json : [];
    perTicker[ticker] = {
      quoteAgeSeconds: top.ages[ticker],
      magnitude: null, midPricePresent: mid !== null,
      daily: { ...shape(d), ...coverage(drows.map((r) => r.date)), depthAttempts,
               timestampSemantics: timestampSemantics(drows[0] && drows[0].date),
               fields: drows[0] ? Object.keys(drows[0]) : [] },
      intraday5min: { ...shape(i), ...coverage(irows.map((r) => r.date)),
                      timestampSemantics: timestampSemantics(irows[0] && irows[0].date) }
    };
    const inst = Catalog.all().find((x) => ((x.providerCandidates || {}).tiingo || {}).fxTickers &&
                                          x.providerCandidates.tiingo.fxTickers.includes(ticker));
    if (inst && mid !== null) perTicker[ticker].magnitude = magnitude(mid, inst.expectedRange);
  }
  for (const inst of Catalog.all()) {
    const fx = ((inst.providerCandidates || {}).tiingo || {}).fxTickers;
    if (!fx || !fx.length) continue;
    const hit = fx.find((x) => servedTickers.has(x));
    const p = hit ? perTicker[hit] : null;
    setInstrument(inst.instrumentId, {
      tiingoFx: hit ? { ticker: hit, status: (p.magnitude && p.magnitude.within === false) ? STATUS.PARTIAL : STATUS.SUPPORTED,
                        identityCheck: p.magnitude, dailyFirst: p.daily.firstDate || null,
                        dailyObservations: p.daily.observations || 0,
                        intradayObservations: p.intraday5min.observations || 0,
                        quoteAgeSeconds: p.quoteAgeSeconds }
                    : { ticker: null, status: STATUS.UNSUPPORTED, tried: fx,
                        reason: "Keines der Symbole wird vom FX-Endpunkt gefuehrt." }
    });
  }
  return { top, perTicker };
}

async function probeTiingoCrypto() {
  const tickers = [];
  for (const inst of Catalog.byAssetClass("CRYPTO")) {
    const c = ((inst.providerCandidates || {}).tiingo || {}).cryptoTickers || [];
    tickers.push(...c);
  }
  const meta = await tiingo(`/tiingo/crypto?tickers=${tickers.join(",")}`);
  const top = await tiingo(`/tiingo/crypto/top?tickers=${tickers.join(",")}`);
  const topRows = Array.isArray(top.json) ? top.json : [];
  const out = {
    metadata: { ...shape(meta), served: Array.isArray(meta.json) ? meta.json.map((m) => m.ticker) : [],
                fields: Array.isArray(meta.json) && meta.json[0] ? Object.keys(meta.json[0]) : [] },
    top: { ...shape(top), served: topRows.map((r) => r.ticker),
           fields: topRows[0] ? Object.keys(topRows[0]) : [],
           topOfBookFields: topRows[0] && Array.isArray(topRows[0].topOfBookData) && topRows[0].topOfBookData[0]
             ? Object.keys(topRows[0].topOfBookData[0]) : [] },
    perTicker: {}
  };
  for (const ticker of tickers) {
    const d = await tiingo(`/tiingo/crypto/prices?tickers=${ticker}&startDate=2009-01-01&resampleFreq=1day`);
    const dBody = Array.isArray(d.json) && d.json[0] ? d.json[0] : null;
    const drows = dBody && Array.isArray(dBody.priceData) ? dBody.priceData : [];
    const i = await tiingo(`/tiingo/crypto/prices?tickers=${ticker}&startDate=${isoDaysAgo(3)}&resampleFreq=5min`);
    const iBody = Array.isArray(i.json) && i.json[0] ? i.json[0] : null;
    const irows = iBody && Array.isArray(iBody.priceData) ? iBody.priceData : [];
    const last = irows.length ? irows[irows.length - 1] : null;
    const inst = Catalog.byAssetClass("CRYPTO").find((x) =>
      (((x.providerCandidates || {}).tiingo || {}).cryptoTickers || []).includes(ticker));
    out.perTicker[ticker] = {
      daily: { ...shape(d), ...coverage(drows.map((r) => r.date)),
               timestampSemantics: timestampSemantics(drows[0] && drows[0].date),
               fields: drows[0] ? Object.keys(drows[0]) : [],
               quoteCurrency: dBody ? dBody.quoteCurrency || null : null,
               baseCurrency: dBody ? dBody.baseCurrency || null : null,
               exchangeAggregation: dBody && dBody.exchangeData ? Object.keys(dBody.exchangeData).length : null },
      intraday5min: { ...shape(i), ...coverage(irows.map((r) => r.date)),
                      lastBarAgeSeconds: last ? Math.round((Date.now() - Date.parse(last.date)) / 1000) : null },
      magnitude: last && inst ? magnitude(last.close, inst.expectedRange) : null
    };
    if (inst) {
      const p = out.perTicker[ticker];
      const existing = (report.instruments[inst.instrumentId] || {}).tiingoCrypto;
      if (!existing || existing.status !== STATUS.SUPPORTED) {
        setInstrument(inst.instrumentId, {
          tiingoCrypto: {
            ticker, status: p.daily.observations > 0 ? STATUS.SUPPORTED : STATUS.UNSUPPORTED,
            identityCheck: p.magnitude, dailyFirst: p.daily.firstDate || null,
            dailyObservations: p.daily.observations || 0, weekendDaily: p.daily.weekendObservations || 0,
            intradayObservations: p.intraday5min.observations || 0,
            intradayWeekend: p.intraday5min.weekendObservations || 0,
            lastBarAgeSeconds: p.intraday5min.lastBarAgeSeconds, quoteCurrency: p.daily.quoteCurrency
          }
        });
      }
    }
  }
  /* Zwei Fragen, die der erste Lauf offen liess:
     1. Die Tagesreihe ab 2009 endete am 2022-09-10 - eine Zeilengrenze
        je Anfrage, kein Ende der Historie. Gemessen wird deshalb die
        juengste Jahresscheibe getrennt.
     2. Das Intraday-Fenster lag Montag bis Donnerstag. Ob am Wochenende
        Bars kommen, zeigt nur ein Fenster, das eines enthaelt. */
  const sat = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7 || 7)); return d.toISOString().slice(0, 10); })();
  const mon = new Date(Date.parse(sat) + 2 * 86400000).toISOString().slice(0, 10);
  const recent = await tiingo(`/tiingo/crypto/prices?tickers=btcusd&startDate=${isoDaysAgo(400)}&resampleFreq=1day`);
  const rrows = Array.isArray(recent.json) && recent.json[0] ? recent.json[0].priceData || [] : [];
  const wk = await tiingo(`/tiingo/crypto/prices?tickers=btcusd&startDate=${sat}&endDate=${mon}&resampleFreq=60min`);
  const wrows = Array.isArray(wk.json) && wk.json[0] ? wk.json[0].priceData || [] : [];
  out.dailyRowLimit = { note: "Eine Anfrage ab 2009 endet vor der Gegenwart - die Ingest-Strecke muss in Scheiben abrufen.",
                        fullRangeRows: out.perTicker.btcusd ? out.perTicker.btcusd.daily.observations : null,
                        fullRangeLastDate: out.perTicker.btcusd ? out.perTicker.btcusd.daily.lastDate : null,
                        recent400Days: { ...shape(recent), ...coverage(rrows.map((r) => r.date)) } };
  out.weekendIntraday = { window: { from: sat, to: mon }, ...shape(wk), ...coverage(wrows.map((r) => r.date)) };
  return out;
}

/* Renditen: Tiingo fuehrt nach eigener Dokumentation keine. Das wird
   nicht angenommen, sondern ueber die Suche und den FX-Endpunkt gefragt
   (die Symbole stehen im Katalog unter fxTickers bzw. search). */
async function probeTiingoYieldSearch() {
  const out = {};
  for (const q of ["treasury yield", "10 year treasury", "bund yield", "fed funds"]) {
    out[q] = await tiingoSearch(q);
  }
  return out;
}

/* Fehler- und Leerverhalten: wie meldet der Anbieter "gibt es nicht"? */
async function probeTiingoErrorSemantics() {
  const missingDaily = await tiingo("/tiingo/daily/vu-does-not-exist-zz");
  const missingFx = await tiingo(`/tiingo/fx/zzzusd/prices?startDate=${isoDaysAgo(5)}&resampleFreq=1day`);
  const missingCrypto = await tiingo(`/tiingo/crypto/prices?tickers=zzzusd&startDate=${isoDaysAgo(5)}&resampleFreq=1day`);
  return { missingDaily: shape(missingDaily), missingFx: shape(missingFx), missingCrypto: shape(missingCrypto) };
}

/* WebSocket: ein kurzer, gezaehlter Mitschnitt. Kein Inhalt im Bericht,
   nur Anzahl, Nachrichtentypen und der juengste Zeitabstand. */
async function probeTiingoWebsocket(endpoint, tickers, seconds) {
  if (typeof WebSocket === "undefined") return { attempted: false, reason: "noWebSocketRuntime" };
  return new Promise((resolveP) => {
    const result = { attempted: true, endpoint, tickers, seconds, opened: false,
                     messages: 0, messageTypes: {}, dataMessages: 0, perTicker: {},
                     subscribeAck: null, error: null };
    let ws;
    try { ws = new WebSocket(`wss://api.tiingo.com/${endpoint}`); }
    catch (err) { result.error = String(err && err.message || err); return resolveP(result); }
    const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } }, seconds * 1000);
    ws.addEventListener("open", () => {
      result.opened = true;
      ws.send(JSON.stringify({ eventName: "subscribe", authorization: KEY,
                               eventData: { thresholdLevel: endpoint === "crypto" ? 2 : 5, tickers } }));
    });
    ws.addEventListener("message", (ev) => {
      result.messages++;
      let m = null;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      const type = m.messageType || "?";
      result.messageTypes[type] = (result.messageTypes[type] || 0) + 1;
      if (type === "I" && m.response) result.subscribeAck = { code: m.response.code, message: String(m.response.message || "").slice(0, 120) };
      if (type === "E" && m.response) result.error = { code: m.response.code, message: String(m.response.message || "").slice(0, 120) };
      if (type === "A" && Array.isArray(m.data)) {
        result.dataMessages++;
        const tk = String(m.data[1] || "").toLowerCase();
        result.perTicker[tk] = (result.perTicker[tk] || 0) + 1;
      }
    });
    ws.addEventListener("error", (ev) => { result.error = result.error || String(ev && ev.message || "wsError"); });
    ws.addEventListener("close", () => { clearTimeout(timer); resolveP(result); });
  });
}

/* --------------------------------------------------------------------- */
/* Offizielle Quellen                                                      */
/* --------------------------------------------------------------------- */

/* CSV in Zeilen; genuegt fuer die flachen Formate dieser Quellen. */
function csvRows(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { header: [], rows: [] };
  const split = (l) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  return { header: split(lines[0]), rows: lines.slice(1).map(split) };
}

function toDateIso(s) {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);           // Treasury: MM/DD/YYYY
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

async function probeTreasury() {
  const year = new Date().getUTCFullYear();
  const out = {};
  for (const y of [year, 1990]) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
    const res = await httpGet(url);
    const { header, rows } = csvRows(res.text);
    const dates = rows.map((r) => toDateIso(r[0])).filter(Boolean);
    const col = (name) => header.indexOf(name);
    const tenors = ["2 Yr", "5 Yr", "10 Yr", "30 Yr"];
    const latest = rows[0] || null;                               // neueste Zeile zuerst
    out[String(y)] = {
      url: url.replace(/\?.*$/, "?type=daily_treasury_yield_curve&..."), ...shape(res),
      header, ...coverage(dates),
      tenorsPresent: Object.fromEntries(tenors.map((t) => [t, col(t) !== -1])),
      magnitude10y: latest && col("10 Yr") !== -1 ? magnitude(parseFloat(latest[col("10 Yr")]), [0, 20]) : null
    };
  }
  return out;
}

async function probeNyFed() {
  const last = await httpGet("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/5.json");
  const rates = last.json && Array.isArray(last.json.refRates) ? last.json.refRates : [];
  const hist = await httpGet(`https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=2000-07-01&endDate=${isoDaysAgo(0)}`);
  const hrates = hist.json && Array.isArray(hist.json.refRates) ? hist.json.refRates : [];
  return {
    latest: { ...shape(last), fields: rates[0] ? Object.keys(rates[0]) : [],
            ...coverage(rates.map((r) => r.effectiveDate)),
            targetRangePresent: rates[0] ? ("targetRateFrom" in rates[0] && "targetRateTo" in rates[0]) : false,
            magnitude: rates[0] ? magnitude(rates[0].percentRate, [0, 25]) : null },
    history: { ...shape(hist), ...coverage(hrates.map((r) => r.effectiveDate)),
               targetRangeObservations: hrates.filter((r) => r.targetRateFrom !== undefined && r.targetRateFrom !== null).length }
  };
}

async function probeEcb() {
  const out = {};
  const keys = {
    DFR_B: "FM/B.U2.EUR.4F.KR.DFR.LEV",
    DFR_D: "FM/D.U2.EUR.4F.KR.DFR.LEV",
    MRO_B: "FM/B.U2.EUR.4F.KR.MRR_FR.LEV"
  };
  for (const [k, key] of Object.entries(keys)) {
    const res = await httpGet(`https://data-api.ecb.europa.eu/service/data/${key}?format=csvdata`);
    const { header, rows } = csvRows(res.text);
    const iT = header.indexOf("TIME_PERIOD"), iV = header.indexOf("OBS_VALUE");
    const dates = iT === -1 ? [] : rows.map((r) => r[iT]);
    const lastVal = iV === -1 || !rows.length ? null : parseFloat(rows[rows.length - 1][iV]);
    /* Stufenserie? Anzahl der Wertwechsel gegenueber der Zeilenzahl. */
    let changes = 0;
    for (let i = 1; i < rows.length; i++) if (iV !== -1 && rows[i][iV] !== rows[i - 1][iV]) changes++;
    out[k] = { key, ...shape(res), ...coverage(dates), valueChanges: changes,
               magnitude: magnitude(lastVal, [-2, 10]) };
  }
  return out;
}

async function probeBundesbank() {
  const out = {};
  const tenors = { "2Y": "R02XX", "10Y": "R10XX", "30Y": "R30XX" };
  for (const [tenor, code] of Object.entries(tenors)) {
    const key = `BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.${code}.R.A.A._Z._Z.A`;
    /* Das Format wird nicht angenommen: drei Schreibweisen, die erste
       mit Datenzeilen gewinnt. */
    const variants = [
      { id: "format=csv", url: `https://api.statistiken.bundesbank.de/rest/data/${key}?format=csv&lang=en`, accept: "text/csv" },
      { id: "format=sdmx_csv", url: `https://api.statistiken.bundesbank.de/rest/data/${key}?format=sdmx_csv`, accept: null },
      { id: "accept=sdmx-csv", url: `https://api.statistiken.bundesbank.de/rest/data/${key}`, accept: "application/vnd.sdmx.data+csv;version=1.0.0" }
    ];
    let res = null; const tried = [];
    for (const v of variants) {
      res = await httpGet(v.url, { accept: v.accept });
      const hasRows = /\n"?\d{4}-\d{2}-\d{2}/.test(res.text || "") || /,\d{4}-\d{2}-\d{2},/.test(res.text || "");
      tried.push({ variant: v.id, httpStatus: res.status, hasRows });
      if (res.ok && hasRows) break;
    }
    /* Das Bundesbank-CSV traegt Kopfzeilen und dann "Datum,Wert"-Zeilen. */
    const lines = String(res.text || "").split(/\r?\n/);
    const obs = lines.map((l) => l.split(/[;,]/)).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test((c[0] || "").replace(/"/g, "")));
    const dates = obs.map((c) => c[0].replace(/"/g, ""));
    const numeric = obs.filter((c) => isFinite(parseFloat(String(c[1]).replace(/"/g, ""))));
    const lastVal = numeric.length ? parseFloat(String(numeric[numeric.length - 1][1]).replace(/"/g, "")) : null;
    /* Die Kopfzeilen tragen Titel und Einheit der Reihe - Metadaten,
       keine Werte. Sie belegen, WAS die Reihe ist. */
    const headerLines = lines.filter((l) => l && !/^"?\d{4}-\d{2}-\d{2}/.test(l)).slice(0, 6)
      .map((l) => l.slice(0, 220));
    out[tenor] = { key, tried, ...shape(res), ...coverage(dates), numericObservations: numeric.length,
                   headerLines, magnitude: magnitude(lastVal, [-2, 15]) };
  }
  return out;
}

async function probeEia() {
  /* Die EIA-API v2 verlangt einen (kostenlosen) Schluessel. Ohne ihn wird
     das Ergebnis gemessen, nicht vermutet. Der Tabellenexport ist
     schluessellos, aber ein Excel-Format. */
  const api = await httpGet("https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RWTC&length=5");
  const xlsWti = await httpGet("https://www.eia.gov/dnav/pet/hist_xls/RWTCd.xls");
  const xlsBrent = await httpGet("https://www.eia.gov/dnav/pet/hist_xls/RBRTEd.xls");
  const xlsGas = await httpGet("https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls");
  const s = (r) => ({ ...shape(r), text: undefined });
  /* Die HTML-Historientabellen sind schluessellos und maschinenlesbar:
     je Woche eine Zeile, je Handelstag eine Zelle (class B3). Gemessen
     wird, ob sie Werte tragen und bis wann - nicht die Werte selbst. */
  const html = {};
  for (const [id, url] of Object.entries({
    RWTC: "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=D",
    RBRTE: "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RBRTE&f=D",
    RNGWHHD: "https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm"
  })) {
    const r = await httpGet(url);
    /* Erster Lauf: 0 Zellen - die Tabelle rueckt mit &nbsp; ein. */
    const txt = String(r.text || "").replace(/&nbsp;/g, " ");
    const cells = (txt.match(/class="?B3"?[^>]*>\s*-?[\d.]+\s*</g) || []).length;
    const weeks = txt.match(/class="?B6"?[^>]*>\s*([^<]+)</g) || [];
    const lastWeek = weeks.length ? weeks[weeks.length - 1].replace(/^[^>]*>\s*/, "").replace(/<$/, "").trim() : null;
    const firstWeek = weeks.length ? weeks[0].replace(/^[^>]*>\s*/, "").replace(/<$/, "").trim() : null;
    html[id] = { url, ...shape({ ...r, json: null }), text: undefined, numericCells: cells,
                 weekRows: weeks.length, firstWeekLabel: firstWeek, lastWeekLabel: lastWeek };
  }
  return { apiV2WithoutKey: s(api), xlsWti: s(xlsWti), xlsBrent: s(xlsBrent), xlsHenryHub: s(xlsGas), htmlTables: html };
}

async function probeFred() {
  /* Nur zum Vergleich (Stufe 3, §12). FRED spiegelt EIA/H.15-Reihen. */
  const out = {};
  for (const id of ["DGS10", "DCOILWTICO", "DCOILBRENTEU", "DHHNGSP", "DFEDTARU", "DFEDTARL", "PCOPPUSDM"]) {
    const res = await httpGet(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
    const { rows } = csvRows(res.text);
    const valid = rows.filter((r) => r[1] && r[1] !== "." && isFinite(parseFloat(r[1])));
    out[id] = { ...shape(res), ...coverage(valid.map((r) => r[0])), missingMarkers: rows.length - valid.length };
  }
  return out;
}

/* --------------------------------------------------------------------- */
/* Matrix                                                                  */
/* --------------------------------------------------------------------- */
function tiingoMatrix() {
  const inst = report.instruments;
  const classStatus = (cls, field, pick) => {
    const list = Catalog.byAssetClass(cls).map((i) => inst[i.instrumentId] && inst[i.instrumentId][field]).filter(Boolean);
    if (!report.tiingo.measured) return STATUS.UNKNOWN;
    if (!list.length) return STATUS.UNSUPPORTED;
    const ok = list.filter(pick).length;
    return ok === 0 ? STATUS.UNSUPPORTED : ok === list.length ? STATUS.SUPPORTED : STATUS.PARTIAL;
  };
  const m = {};
  const T = report.tiingo.probes;
  const wsOk = (w) => w && w.dataMessages > 0;
  m.INDEX = { HISTORY: classStatus("INDEX", "tiingo", (x) => x.indexLevel !== STATUS.UNSUPPORTED),
              DAILY: null, INTRADAY: null, LATEST: null, REALTIME: null, WEBSOCKET: null };
  ["DAILY", "INTRADAY", "LATEST", "REALTIME", "WEBSOCKET"].forEach((k) => { m.INDEX[k] = m.INDEX.HISTORY; });
  const fxGroup = (cls) => {
    const st = classStatus(cls, "tiingoFx", (x) => x.status === STATUS.SUPPORTED);
    const intr = classStatus(cls, "tiingoFx", (x) => x.intradayObservations > 0);
    const live = classStatus(cls, "tiingoFx", (x) => typeof x.quoteAgeSeconds === "number" && x.quoteAgeSeconds < 600);
    return { HISTORY: st, DAILY: st, INTRADAY: intr, LATEST: st, REALTIME: live,
             WEBSOCKET: !report.tiingo.measured || !T.wsFx ? STATUS.UNKNOWN
               : wsOk(T.wsFx) ? STATUS.PARTIAL : STATUS.UNSUPPORTED };
  };
  m.PRECIOUS_METAL = fxGroup("PRECIOUS_METAL");
  m.COMMODITY = fxGroup("COMMODITY");
  const cr = classStatus("CRYPTO", "tiingoCrypto", (x) => x.status === STATUS.SUPPORTED);
  m.CRYPTO = { HISTORY: cr, DAILY: cr,
               INTRADAY: classStatus("CRYPTO", "tiingoCrypto", (x) => x.intradayObservations > 0),
               LATEST: cr,
               REALTIME: classStatus("CRYPTO", "tiingoCrypto", (x) => typeof x.lastBarAgeSeconds === "number" && x.lastBarAgeSeconds < 900),
               WEBSOCKET: !report.tiingo.measured || !T.wsCrypto ? STATUS.UNKNOWN
                 : wsOk(T.wsCrypto) ? STATUS.SUPPORTED : STATUS.UNSUPPORTED };
  const ys = T.yieldSearch ? Object.values(T.yieldSearch).some((s) => Object.keys(s.assetTypes || {})
    .some((a) => !/etf|fund|stock/i.test(a))) : null;
  const yst = !report.tiingo.measured ? STATUS.UNKNOWN : ys ? STATUS.PARTIAL : STATUS.UNSUPPORTED;
  m.YIELD = { HISTORY: yst, DAILY: yst, INTRADAY: yst, LATEST: yst, REALTIME: yst, WEBSOCKET: yst };
  m.RATE = { ...m.YIELD };
  m.FX = { note: "Bereits gemessen: quant/data/market/capabilities/tiingo-fx-probe.json (nicht erneut abgefragt)." };
  return m;
}

/* --------------------------------------------------------------------- */
async function main() {
  if (DRY_RUN) {
    report.note = "Trockenlauf: keine Anfrage gestellt. Alle Befunde UNKNOWN.";
  } else {
    if (KEY) {
      report.tiingo.measured = true;
      const T = report.tiingo.probes;
      T.indices = await probeTiingoIndices();
      T.fxFamily = await probeTiingoFxFamily();
      T.crypto = await probeTiingoCrypto();
      T.yieldSearch = await probeTiingoYieldSearch();
      T.errorSemantics = await probeTiingoErrorSemantics();
      if (!NO_WS) {
        T.wsCrypto = await probeTiingoWebsocket("crypto", ["btcusd", "ethusd"], 20);
        T.wsFx = await probeTiingoWebsocket("fx", ["xauusd", "eurusd"], 20);
      }
      T.rateLimitHeaders = rateLimitHeaders;
    } else {
      report.tiingo.reason = "Kein TIINGO_API_KEY in der Umgebung - Tiingo-Befunde bleiben UNKNOWN.";
    }
    const O = report.official.probes;
    O.treasury = await probeTreasury();
    O.nyFed = await probeNyFed();
    O.ecb = await probeEcb();
    O.bundesbank = await probeBundesbank();
    O.eia = await probeEia();
    /* Die Umwandlung der EIA-Tabellen laeuft vorher im Workflow
       (eia-xls-to-csv.py). Hier wird nur ihr Ergebnis gelesen: Titel,
       Anzahl, erster und letzter Tag - keine Werte. */
    O.eia.xlsConverted = {};
    for (const series of ["RWTC", "RBRTE", "RNGWHHD"]) {
      const f = resolve(root, ".market-cache", "multi-asset", "eia", `${series}.meta.json`);
      O.eia.xlsConverted[series] = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { converted: false };
    }
    O.fred = await probeFred();
  }
  report.tiingo.matrix = tiingoMatrix();
  report.requests = requests;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(redact(report), null, 2) + "\n");
  console.log(`Multi-Asset-Sondierung geschrieben: ${OUT.replace(root + "/", "")}`);
  console.log(`Anfragen: Tiingo ${requests.tiingo}, offizielle Quellen ${requests.official}`);
  console.log(JSON.stringify(redact(report.tiingo.matrix), null, 2));
}

main().catch((err) => { console.error(redact(String(err && err.stack || err))); process.exit(1); });
