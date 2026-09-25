/* =========================================================================
   VISION UNIVERSE — ingest-multi-asset.mjs   (Multi-Asset Data Core)

   HOLT, PRUEFT UND VEROEFFENTLICHT DAS MULTI-ASSET-SEGMENT.

   Eine Strecke fuer alle Nicht-Aktien-Instrumente, ueber die bestehenden
   Adapter (providers/tiingo, providers/ecb) und die offiziellen
   Primaerquellen (providers/us-treasury, nyfed, bundesbank, eia). Welche
   Quelle ein Instrument traegt, steht in quant/config/multi-asset.json -
   gemessen, nicht angenommen (multi-asset-probe.json).

   WAS WOHIN GEHT

     Oeffentlich (--publish)  quant/data/market/multi-asset/
       instruments.json   das aufgeloeste Master-Segment (alle Instrumente,
                          auch Luecken - mit Grund)
       snapshot.json      der Product Contract je Instrument
       series/<SYM>.json  Tageshistorie - NUR fuer Quellen mit
                          publicDisplay: true
     Arbeitsstand         .market-cache/multi-asset/
       internal-snapshot.json, series/<SYM>.json fuer LICENSE_PENDING
       (Tiingo Krypto, Edelmetalle): technisch vorhanden, nicht
       ausgeliefert, bis der Owner freigibt.

   PRUEFUNG VOR DEM SCHREIBEN

   Aufsteigende, eindeutige Tage; endliche Werte; der juengste Wert in der
   Groessenordnung des Katalogs (expectedRange). Eine Reihe, die das nicht
   besteht, wird nicht veroeffentlicht - der Vertrag sagt SOURCE_MISSING
   mit Grund. Eine falsch ausgezeichnete Reihe ist schlimmer als eine
   fehlende.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/ingest-multi-asset.mjs --publish
     node scripts/market/ingest-multi-asset.mjs --publish --only=US10Y,DE10Y
     node scripts/market/ingest-multi-asset.mjs --publish --backfill   (Treasury ab 1990)
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Catalog = require(join(root, "quant/engines/multi-asset/instrument-catalog.js"));
const Contract = require(join(root, "quant/api/multi-asset-contract.js"));
const Tiingo = require(join(root, "providers/tiingo/adapter.js"));
const Ecb = require(join(root, "providers/ecb/adapter.js"));
const Treasury = require(join(root, "providers/us-treasury/adapter.js"));
const NyFed = require(join(root, "providers/nyfed/adapter.js"));
const Bundesbank = require(join(root, "providers/bundesbank/adapter.js"));
const Eia = require(join(root, "providers/eia/adapter.js"));
const Fred = require(join(root, "providers/fred/adapter.js"));
const Nikkei = require(join(root, "providers/nikkei/adapter.js"));
const Fmp = require(join(root, "providers/fmp/adapter.js"));
const CONFIG = require(join(root, "quant/config/multi-asset.json"));
const CALENDAR = require(join(root, "quant/config/market-calendar.json"));
const RAW_CATALOG = require(join(root, "quant/config/multi-asset-instruments.json"));

const args = process.argv.slice(2);
const PUBLISH = args.includes("--publish");
const BACKFILL = args.includes("--backfill");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const NOW = process.env.VU_NOW ? new Date(process.env.VU_NOW) : new Date();
const KEY = process.env.TIINGO_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";
const UA = "VisionUniverse-DataCore/1.0 (+https://research.visionuniverse.de)";

const PUBLIC_DIR = resolve(root, "quant/data/market/multi-asset");
const CACHE_DIR = resolve(root, ".market-cache/multi-asset");
const PUBLIC_PATH = "/quant/data/market/multi-asset/series/";
/* Tagesverlauf (5-Minuten-Bars) freigegebener Quellen - neben den
   Tagesreihen, nicht in deren Verzeichnis. */
const PUBLIC_INTRADAY_PATH = "/quant/data/market/multi-asset/intraday/";
const SCHEMA = "vu-multi-asset-series-1.0.0";

function iso(d) { return d.toISOString().slice(0, 10); }
/* Handelstag in New York (ein ETF-Kurs um 20:00 UTC gehoert zum New Yorker Tag). */
function nyDate(ts) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  return p.slice(0, 10);
}
function daysAgo(n) { return iso(new Date(NOW.getTime() - n * 86400000)); }
function redact(v) {
  let text = JSON.stringify(v);
  for (const k of [KEY, FMP_KEY]) if (k && k.length >= 8) text = text.split(k).join("[REDACTED]");
  return JSON.parse(text);
}

const log = [];
function note(symbol, msg) { log.push({ symbol, msg }); console.log(`  ${symbol.padEnd(10)} ${msg}`); }

/* ------------------------------------------------------------ Transport */
let officialRequests = 0;
async function getText(url, timeoutMs = 90000) {
  officialRequests++;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return text;
  } finally { clearTimeout(t); }
}

const tiingo = KEY ? Tiingo.createTiingoProvider({
  apiKey: KEY, capabilities: Tiingo.commercialPlanCapabilities(),
  baseUrl: process.env.TIINGO_BASE_URL || undefined, fetchImpl: (u, i) => fetch(u, i)
}) : null;

/* ------------------------------------------------------ Bestand lesen */
function readJson(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } }
function existingPoints(symbol) {
  const f = readJson(join(PUBLIC_DIR, "series", `${symbol}.json`)) || readJson(join(CACHE_DIR, "series", `${symbol}.json`));
  return f && Array.isArray(f.points) ? f : null;
}
function mergePoints(old, fresh) {
  const m = new Map();
  for (const p of old || []) m.set(p[0], p);
  for (const p of fresh || []) m.set(p[0], p);      /* der neue Abruf gewinnt (Korrekturen der Quelle) */
  return [...m.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/* -------------------------------------------------------- Quellen */

/* US Treasury: je Jahr eine CSV. Voller Abruf nur beim ersten Lauf oder
   mit --backfill; sonst das laufende Jahr (im Januar zusaetzlich das
   Vorjahr - die letzten Dezembertage kommen sonst nie an). */
let treasuryCache = null;
/* FMP: die Indexliste einmal je Lauf - sie ist der Identitaetsbeleg. */
let fmpList = null, fmpRequests = 0;
async function fmpText(url) {
  fmpRequests++;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json };
}
async function fmpIndexList() {
  if (!fmpList) {
    const r = await fmpText(Fmp.indexListUrl(FMP_KEY));
    fmpList = Fmp.parseIndexList(r.json);
    if (!fmpList.size) throw new Error(`FMP-Indexliste leer (HTTP ${r.status})`);
  }
  return fmpList;
}

async function treasuryAll() {
  if (treasuryCache) return treasuryCache;
  const year = NOW.getUTCFullYear();
  const existing = existingPoints("US10Y");
  const haveDeep = existing && existing.points.length && existing.points[0][0] <= `${Treasury.EARLIEST_YEAR}-01-31`;
  const years = [];
  const from = (BACKFILL || !haveDeep) ? Treasury.EARLIEST_YEAR : (NOW.getUTCMonth() === 0 ? year - 1 : year);
  for (let y = from; y <= year; y++) years.push(y);
  const out = { US2Y: [], US5Y: [], US10Y: [], US30Y: [] };
  for (const y of years) {
    try {
      const parsed = Treasury.parseYearCsv(await getText(Treasury.yearUrl(y)));
      for (const k of Object.keys(out)) out[k].push(...(parsed[k] || []));
    } catch (e) { note("TREASURY", `${y}: ${e.message}`); }
  }
  treasuryCache = { series: out, years: [years[0], years[years.length - 1]] };
  return treasuryCache;
}

let nyfedCache = null;
async function nyfedAll() {
  if (nyfedCache) return nyfedCache;
  const json = JSON.parse(await getText(NyFed.effrSearchUrl(NyFed.EARLIEST, iso(NOW))));
  nyfedCache = NyFed.parseEffr(json);
  return nyfedCache;
}

async function fetchSeries(inst) {
  const id = inst.providerIdentifiers || {};
  const fetchedAt = new Date().toISOString();
  switch (inst.source) {
    case "us-treasury": {
      const t = await treasuryAll();
      const old = existingPoints(inst.symbol);
      return { points: mergePoints(old && old.points, t.series[inst.symbol]), frequency: "DAILY", fetchedAt,
               note: `Treasury-Jahre ${t.years[0]}-${t.years[1]} abgerufen` };
    }
    case "bundesbank": {
      const key = Bundesbank.SERIES[inst.symbol];
      const parsed = Bundesbank.parseCsv(await getText(Bundesbank.seriesUrl(key)));
      return { points: parsed.points, frequency: "DAILY", fetchedAt, seriesTitle: parsed.title };
    }
    case "nyfed": {
      const n = await nyfedAll();
      if (inst.symbol === "US_EFFR") return { points: n.effr, frequency: "DAILY", fetchedAt };
      /* Zielband: Stufen (Tag des Inkrafttretens, Unter-, Obergrenze).
         Fuer Veraenderung und Zeitraeume zaehlt die Obergrenze - benannt. */
      const steps = NyFed.toSteps(n.target);
      const last = n.target[n.target.length - 1];
      const lastStep = steps[steps.length - 1];
      return { points: steps.map((s) => [s[0], s[2]]), rangePoints: steps, frequency: "EVENT", representation: "STEPS",
               changeBasis: "UPPER_BOUND", observedThrough: last ? last[0] : null, fetchedAt,
               latest: lastStep ? { value: lastStep[2], lower: lastStep[1], upper: lastStep[2], asOf: lastStep[0],
                                    observationDate: last[0], effectiveSince: lastStep[0], frequency: "EVENT", checkedAt: fetchedAt } : null };
    }
    case "ecb-data-portal": {
      const parsed = Ecb.parseKeyRateCsv(await getText(Ecb.keyRateUrl(Ecb.KEY_RATES[inst.symbol])));
      /* Ein angekuendigter, noch nicht wirksamer Satz ist nicht der
         geltende. Er wird als scheduledChange mitgefuehrt. */
      const today = iso(NOW);
      const effective = parsed.steps.filter((p) => p[0] <= today);
      const upcoming = parsed.steps.filter((p) => p[0] > today);
      const lastStep = effective[effective.length - 1];
      return { points: effective, frequency: "EVENT", representation: "STEPS", observedThrough: parsed.observedThrough, fetchedAt,
               scheduledChange: upcoming.length ? { effectiveFrom: upcoming[0][0], value: upcoming[0][1] } : null,
               latest: lastStep ? { value: lastStep[1], asOf: lastStep[0], observationDate: parsed.observedThrough,
                                    effectiveSince: lastStep[0], frequency: "EVENT", checkedAt: fetchedAt } : null };
    }
    case "eia": {
      const f = join(CACHE_DIR, "eia", `${id.eia}.csv`);
      if (!existsSync(f)) throw new Error(`EIA-Tabelle ${id.eia} nicht umgewandelt (eia-xls-to-csv.py)`);
      const meta = readJson(join(CACHE_DIR, "eia", `${id.eia}.meta.json`)) || {};
      return { points: Eia.parseCsv(readFileSync(f, "utf8")), frequency: "DAILY", fetchedAt, seriesTitle: meta.title || null };
    }
    case "fred-index": {
      /* Die Lizenzklasse wird bei jedem Lauf auf der Reihenseite gelesen.
         Weicht sie von der gemessenen ab, wird nichts ausgeliefert. */
      const spec = Fred.SERIES[inst.symbol];
      if (!spec) throw new Error(`keine FRED-Reihe fuer ${inst.symbol}`);
      const lic = Fred.licenseOf(await getText(Fred.seriesPageUrl(spec.series)));
      if (lic !== spec.licenseClass) throw new Error(`FRED-Lizenzklasse ${lic || "nicht lesbar"} statt ${spec.licenseClass}`);
      const parsed = Fred.parseCsv(await getText(Fred.seriesUrl(spec.series)));
      let crossCheck = null;
      if (inst.symbol === "N225") {
        try {
          const ref = Nikkei.parseDailyCsv(await getText(Nikkei.DAILY_CSV));
          crossCheck = Object.assign({ against: "Nikkei Inc. (offizielle Tagesdatei)" }, Nikkei.crossCheck(parsed.points, ref.points));
        } catch (e) { crossCheck = { against: "Nikkei Inc. (offizielle Tagesdatei)", ok: null, error: e.message }; }
      }
      return { points: parsed.points, frequency: "DAILY", fetchedAt, licenseClass: lic, seriesTitle: spec.series, crossCheck };
    }
    case "fmp-index": {
      if (!FMP_KEY) throw new Error("kein FMP_API_KEY");
      const idc = Fmp.identity(inst.symbol, await fmpIndexList());
      if (!idc.ok) throw new Error(`FMP-Identitaet ${idc.reason}${idc.listedName ? " (" + idc.listedName + ")" : ""}`);
      /* Eine Anfrage je Index und Lauf (Tarif: 250/Tag, geteilt mit
         Fundamentaldaten und Analystenurteilen). */
      const r = await fmpText(Fmp.eodUrl(idc.fmpSymbol, daysAgo(3650), FMP_KEY));
      const parsed = Fmp.parseEod(r.json);
      if (parsed.error) throw new Error(`FMP HTTP ${r.status}: ${parsed.error}`);
      const daily = parsed.points.filter((p) => p[0] <= iso(NOW));
      return { points: daily, frequency: "DAILY", fetchedAt, identity: { fmpSymbol: idc.fmpSymbol, listedName: idc.listedName } };
    }
    case "tiingo-equity": {
      /* Index-Tracker (ETF) ueber den bestehenden Tiingo-Vertrag - derselbe
         Adapter wie der Aktienbereich. Die Reihe ist der Schlusskurs,
         um Splits bereinigt (Tiingo liefert splitFactor je Tag), ohne
         Ausschuettungen: Kursbewegung des Trackers, keine Indexrechnung. */
      if (!tiingo) throw new Error("kein TIINGO_API_KEY");
      const ticker = id.tiingo;
      const res = await tiingo.getDailyBars(ticker, { from: "1995-01-01" });
      if (!res.available) throw new Error(`Tagesreihe: ${res.reason}`);
      const daily = Tiingo.splitAdjustedCloses(res.data.bars).filter((p) => p[0] <= iso(NOW));
      const intr = await tiingo.getIntradayBars(ticker, { from: daysAgo(4), interval: "5min", extendedHours: false });
      const ibars = intr.available ? intr.data.bars : [];
      const quote = await tiingo.getQuote(ticker);
      const q = quote.available ? quote.data : null;
      /* Der juengste Stand: Tiingos Referenzkurs (tngoLast) ueber IEX,
         wenn er juenger ist als der letzte Tagesschluss. */
      const qv = q ? (typeof q.referencePrice === "number" ? q.referencePrice : q.last) : null;
      const qDate = q && q.timestamp ? nyDate(q.timestamp) : null;
      const lastDaily = daily.length ? daily[daily.length - 1][0] : null;
      const latest = typeof qv === "number" && qDate && lastDaily && qDate > lastDaily
        ? { value: qv, asOf: q.timestamp, observationDate: qDate, frequency: "INTRADAY", checkedAt: fetchedAt }
        : null;
      return { points: daily, frequency: "DAILY", fetchedAt, seriesTitle: `${ticker.toUpperCase()} (Tiingo, split-bereinigter Schlusskurs)`,
               intraday: ibars.map((b) => [b.timestamp, b.close]), latest };
    }
    case "ecb-fx-reference": {
      /* Kein Abruf: der Currency Core liefert diese Reihe bereits aus. */
      const s = readJson(join(root, "quant/data/market/fx/ecb/EURUSD.json"));
      if (!s || s.base !== "EUR" || s.quote !== "USD") throw new Error("EURUSD aus dem Currency Core nicht lesbar");
      return { points: s.points, frequency: "DAILY", fetchedAt: s.asOf, reusedFrom: "quant/data/market/fx/ecb/EURUSD.json",
               noCopy: true };
    }
    case "tiingo-crypto": {
      if (!tiingo) throw new Error("kein TIINGO_API_KEY");
      /* Gemessen: eine Anfrage ab 2009 endet 2022 - deshalb in
         Fuenf-Jahres-Scheiben. */
      const all = [];
      let quote = null;
      for (let y = 2010; y <= NOW.getUTCFullYear(); y += 5) {
        const res = await tiingo.getCryptoBars(id.tiingo, { from: `${y}-01-01`, to: `${Math.min(y + 4, NOW.getUTCFullYear())}-12-31`, interval: "1day" });
        if (!res.available) { note(inst.symbol, `Scheibe ${y}: ${res.reason}`); continue; }
        quote = res.data.quoteCurrency || quote;
        for (const b of res.data.bars) all.push([b.date, b.close]);
      }
      const intr = await tiingo.getCryptoBars(id.tiingo, { from: daysAgo(2), interval: "5min" });
      const bars = intr.available ? intr.data.bars : [];
      const last = bars[bars.length - 1];
      /* Der laufende UTC-Tag ist noch kein Tagesschluss. */
      const daily = mergePoints([], all).filter((p) => p[0] < iso(NOW));
      return { points: daily, frequency: "DAILY", fetchedAt, quoteCurrency: quote,
               intraday: bars.map((b) => [b.timestamp, b.close]),
               latest: last ? { value: last.close, asOf: last.timestamp, observationDate: last.date, frequency: "INTRADAY" } : null };
    }
    case "tiingo-fx-metals": {
      if (!tiingo) throw new Error("kein TIINGO_API_KEY");
      /* Gemessen: Startdaten vor ~5 Jahren beantwortet der FX-Endpunkt mit
         HTTP 400. 1.800 Tage liegen sicher darin. */
      const res = await tiingo.getFxEndpointBars(id.tiingo, { from: daysAgo(1800), interval: "1day" });
      if (!res.available) throw new Error(`Tagesreihe: ${res.reason}`);
      const top = await tiingo.getFxEndpointTop(id.tiingo);
      const q = top.available ? top.data : null;
      const intr = await tiingo.getFxEndpointBars(id.tiingo, { from: daysAgo(2), interval: "5min" });
      const daily = res.data.bars.map((b) => [b.date, b.close]).filter((p) => p[0] < iso(NOW));
      return { points: daily, frequency: "DAILY", fetchedAt,
               intraday: intr.available ? intr.data.bars.map((b) => [b.timestamp, b.close]) : [],
               latest: q && q.mid !== null ? { value: q.mid, asOf: q.quoteTimestamp, observationDate: String(q.quoteTimestamp).slice(0, 10), frequency: "INTRADAY" } : null };
    }
    default:
      throw new Error(`keine Quelle fuer ${inst.symbol}`);
  }
}

/* ------------------------------------------------------------ Pruefung */
function validate(symbol, s, expectedRange) {
  const f = [];
  const pts = s.points || [];
  for (let i = 0; i < pts.length; i++) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pts[i][0])) { f.push(`badDate@${i}`); break; }
    if (!pts[i].slice(1).every((v) => typeof v === "number" && isFinite(v))) { f.push(`nonFinite@${pts[i][0]}`); break; }
    if (i && pts[i][0] <= pts[i - 1][0]) { f.push(`notAscending@${pts[i][0]}`); break; }
  }
  if (pts.length && pts[pts.length - 1][0] > iso(NOW) && s.representation !== "STEPS") f.push("futureDate");
  const latest = s.latest ? s.latest.value : (pts.length ? pts[pts.length - 1][1] : null);
  if (expectedRange && typeof latest === "number" && (latest < expectedRange[0] || latest > expectedRange[1])) f.push("latestOutsideExpectedRange");
  if (!pts.length && !s.latest) f.push("empty");
  if (s.crossCheck && s.crossCheck.ok === false) f.push(`crossCheckMismatch(${s.crossCheck.maxRelativeDeviation}@${s.crossCheck.worstDate})`);
  return f;
}

/* ------------------------------------------------------------ Schreiben */
/* Eine Zeile je Punkt: ein neuer Tag ist im Git-Diff eine neue Zeile,
   nicht eine neu geschriebene Datei. */
function seriesJson(head, points) {
  const h = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  const body = points.map((p) => "    " + JSON.stringify(p)).join(",\n");
  return `${h},\n  "points": [\n${body}\n  ]\n}\n`;
}

function writeFile(file, text) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); }

/* --------------------------------------------------------------- Lauf */
async function main() {
  const rawBySymbol = Object.fromEntries(RAW_CATALOG.instruments.map((i) => [i.symbol, i]));
  const instruments = Catalog.resolved().filter((i) => !ONLY.length || ONLY.includes(i.symbol));
  const publicContracts = [], internalContracts = [], master = [];
  console.log(`Multi-Asset-Ingest: ${instruments.length} Instrumente, ${PUBLISH ? "veroeffentlichen" : "Arbeitsstand"}`);

  for (const inst of instruments) {
    const src = inst.source ? CONFIG.sourceRegistry[inst.source] : null;
    let series = null, findings = [];
    if (inst.status === "ACTIVE" || inst.status === "LICENSE_PENDING") {
      try {
        series = await fetchSeries(inst);
        findings = validate(inst.symbol, series, rawBySymbol[inst.symbol].expectedRange);
        note(inst.symbol, `${series.points.length} Punkte ${series.points[0] ? series.points[0][0] : "-"}..${series.points.length ? series.points[series.points.length - 1][0] : "-"}` +
                          (findings.length ? `  BEFUNDE: ${findings.join(",")}` : ""));
      } catch (e) {
        findings = [`fetchFailed: ${e.message}`];
        note(inst.symbol, `Abruf fehlgeschlagen: ${e.message}`);
      }
    }
    const usable = series && !findings.length;
    const isPublic = !!(src && src.publicDisplay) && inst.status === "ACTIVE";
    const seriesFile = usable ? `${inst.symbol}.json` : null;
    const effective = usable ? inst : Object.assign({}, inst, { status: inst.status === "ACTIVE" ? "ACTIVE" : inst.status });

    const base = {
      instrument: effective, source: src,
      series: usable ? series : null,
      latest: usable ? series.latest || null : null,
      capabilities: {
        eod: usable, intraday: !!(usable && series.intraday && series.intraday.length),
        intradayPublished: !!(usable && isPublic && PUBLISH && series.intraday && series.intraday.length),
        realtime: ["tiingo-crypto", "tiingo-fx-metals", "tiingo-equity"].includes(inst.source),
        websocket: ["tiingo-crypto", "tiingo-fx-metals", "tiingo-equity"].includes(inst.source),
        /* Der bestehende Echtzeitpfad der Quelle (Registry), sonst keiner. */
        realtimePath: src && src.realtimePath ? src.realtimePath : null
      },
      now: NOW, calendar: CALENDAR, config: CONFIG
    };
    const historyPath = usable && isPublic && !series.noCopy ? PUBLIC_PATH + seriesFile
      : usable && series.noCopy ? "/" + series.reusedFrom : null;
    const intradayPath = base.capabilities.intradayPublished ? PUBLIC_INTRADAY_PATH + seriesFile : null;
    const pub = Contract.build(Object.assign({}, base, { historyPath, intradayPath }));
    if (!usable && (inst.status === "ACTIVE" || inst.status === "LICENSE_PENDING")) {
      pub.quote.state = inst.status === "LICENSE_PENDING" ? "WITHHELD_LICENSE" : "SOURCE_MISSING";
      pub.quote.stateReason = findings.join("; ") || null;
    }
    publicContracts.push(pub);
    /* Intern: dieselbe Rechnung, aber mit Werten auch fuer LICENSE_PENDING -
       fuer den Nachweis im selben Lauf, nicht zur Auslieferung. */
    const internalInst = Object.assign({}, effective, { status: usable ? "ACTIVE" : effective.status });
    const internalSrc = src ? Object.assign({}, src, { publicDisplay: true }) : src;
    const internal = Contract.build(Object.assign({}, base, { instrument: internalInst, source: internalSrc, historyPath: null }));
    internal.internalOnly = !isPublic;
    internalContracts.push(internal);

    master.push({
      instrumentId: inst.instrumentId, symbol: inst.symbol, name: inst.name, nameDe: inst.nameDe,
      assetClass: inst.assetClass, assetType: inst.assetClass, subType: inst.subType, subTypeNote: inst.subTypeNote || null,
      exchangeOrVenue: inst.exchangeOrVenue || null, currency: inst.currency || null, currencyContext: inst.currencyContext || null,
      country: inst.country || null, timezone: inst.timezone || null, providerIdentifiers: inst.providerIdentifiers || {},
      sessionProfile: inst.sessionProfile, sessionExchange: inst.sessionExchange || null, publisherProfile: inst.publisherProfile || null,
      valueSemantics: inst.valueSemantics, priceSemantics: inst.priceSemantics || null, unit: inst.unit, unitId: inst.unitId,
      changeSemantics: inst.changeSemantics, conversion: inst.conversion, source: inst.source, status: inst.status,
      tier: inst.tier, knownProxiesNotUsed: inst.knownProxies || [], gap: inst.gap || null, measured: inst.measured || null,
      segment: "MULTI_ASSET", findings: findings
    });

    /* Reihen */
    if (usable && !series.noCopy) {
      const head = { schemaVersion: SCHEMA, instrumentId: inst.instrumentId, symbol: inst.symbol, assetClass: inst.assetClass,
                     subType: inst.subType, valueSemantics: inst.valueSemantics, unit: inst.unit, unitId: inst.unitId,
                     source: inst.source, attribution: src ? src.attribution : null, frequency: series.frequency,
                     representation: series.representation || "OBSERVATIONS", changeBasis: series.changeBasis || null,
                     seriesTitle: series.seriesTitle || null, observedThrough: series.observedThrough || null,
                     from: series.points.length ? series.points[0][0] : null,
                     to: series.points.length ? series.points[series.points.length - 1][0] : null,
                     observations: series.points.length, fetchedAt: series.fetchedAt,
                     licenseClass: series.licenseClass || null, crossCheck: series.crossCheck || null };
      const pts = series.rangePoints || series.points;
      writeFile(join(CACHE_DIR, "series", seriesFile), seriesJson(Object.assign({ internalOnly: !isPublic }, head), pts));
      if (series.intraday && series.intraday.length) {
        writeFile(join(CACHE_DIR, "intraday", seriesFile), JSON.stringify({ symbol: inst.symbol, points: series.intraday }) + "\n");
      }
      if (PUBLISH && isPublic) writeFile(join(PUBLIC_DIR, "series", seriesFile), seriesJson(head, pts));
      if (PUBLISH && isPublic && series.intraday && series.intraday.length) {
        writeFile(join(PUBLIC_DIR, "intraday", seriesFile), JSON.stringify({
          schemaVersion: SCHEMA, instrumentId: inst.instrumentId, symbol: inst.symbol, source: inst.source,
          attribution: src ? src.attribution : null, interval: "5min", unitId: inst.unitId, fetchedAt: series.fetchedAt,
          points: series.intraday }) + "\n");
      }
    }
  }

  /* Eine nicht mehr oeffentliche Reihe darf nicht im Auslieferungspfad
     liegen bleiben (z. B. nach einem Lizenz-Rueckzug). */
  if (PUBLISH && existsSync(join(PUBLIC_DIR, "series")) && !ONLY.length) {
    const allowed = new Set(publicContracts.filter((c) => c.history.path && c.history.path.startsWith(PUBLIC_PATH))
      .map((c) => c.instrument.symbol + ".json"));
    for (const f of readdirSync(join(PUBLIC_DIR, "series"))) if (!allowed.has(f)) unlinkSync(join(PUBLIC_DIR, "series", f));
  }
  if (PUBLISH && existsSync(join(PUBLIC_DIR, "intraday")) && !ONLY.length) {
    const allowedI = new Set(publicContracts.filter((c) => c.history.intradayPath).map((c) => c.instrument.symbol + ".json"));
    for (const f of readdirSync(join(PUBLIC_DIR, "intraday"))) if (!allowedI.has(f)) unlinkSync(join(PUBLIC_DIR, "intraday", f));
  }

  const summary = {};
  for (const c of publicContracts) {
    const k = `${c.instrument.assetClass}:${c.quote.state}`;
    summary[k] = (summary[k] || 0) + 1;
  }
  const snapshot = {
    schemaVersion: "vu-multi-asset-snapshot-1.0.0", contractVersion: Contract.CONTRACT_VERSION,
    generatedAt: new Date().toISOString(), asOfRun: NOW.toISOString(),
    note: "Product Contract des Multi-Asset-Segments. Freshness ist zum Bauzeitpunkt bewertet; Consumer bewerten sie mit VUMultiAssetContract.refresh() zur Anzeigezeit neu.",
    summary, instruments: publicContracts
  };
  const masterDoc = {
    schemaVersion: "vu-multi-asset-master-1.0.0", catalogId: RAW_CATALOG.catalogId, generatedAt: snapshot.generatedAt,
    idNamespace: RAW_CATALOG.idNamespace, sourcesDecidedAt: CONFIG.sourcesDecidedAt || null, instruments: master
  };
  writeFile(join(CACHE_DIR, "internal-snapshot.json"), JSON.stringify(redact(Object.assign({}, snapshot, { instruments: internalContracts })), null, 1) + "\n");
  writeFile(join(CACHE_DIR, "ingest-log.json"), JSON.stringify(redact({ at: snapshot.generatedAt, officialRequests, fmpRequests, tiingo: tiingo ? tiingo.stats() : null, log }), null, 1) + "\n");
  if (PUBLISH && !ONLY.length) {
    writeFile(join(PUBLIC_DIR, "snapshot.json"), JSON.stringify(redact(snapshot), null, 1) + "\n");
    writeFile(join(PUBLIC_DIR, "instruments.json"), JSON.stringify(redact(masterDoc), null, 1) + "\n");
  }
  console.log("Zusammenfassung:", JSON.stringify(summary));
  console.log(`Offizielle Anfragen: ${officialRequests}, FMP: ${fmpRequests}${tiingo ? ", Tiingo: " + JSON.stringify(tiingo.stats()) : ""}`);
}

main().catch((e) => { console.error(redact(String(e && e.stack || e))); process.exit(1); });
