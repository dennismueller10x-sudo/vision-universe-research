/* =========================================================================
   VISION UNIVERSE — probe-index-sources.mjs   (Multi-Asset Core, Index Coverage P0)

   WER LIEFERT ECHTE INDEXSTAENDE - GEMESSEN, NICHT GELESEN.

   Tiingo fuehrt keine Indexstaende (multi-asset-probe.json). Das heisst
   nicht, dass es keine Quelle gibt. Diese Sondierung fragt jede
   erreichbare Quelle ab, in der vorgegebenen Reihenfolge:

     1. bereits vorhandene Provider/Vertraege    Twelve Data (Secret
                                                 TWELVE_DATA_API_KEY)
     2. offizielle Index-/Boersenquellen         Nikkei, STOXX/Qontigo,
                                                 Nasdaq, S&P DJI, Euronext,
                                                 SIX, Hang Seng, LSEG, MSCI,
                                                 Deutsche Boerse, SSE
     3. frei nutzbare institutionelle Spiegel    FRED (mit gemessenem
                                                 Lizenzhinweis)
     4. Drittanbieter-Aggregatoren               Stooq - nur gemessen, nie
                                                 ohne Owner-Entscheidung
                                                 angebunden

   KEIN ETF, KEIN FUTURE, KEINE EIGENBERECHNUNG

   Gefragt wird nach dem Index selbst. Die Identitaet wird ueber Namen
   (wo die Quelle einen liefert) und Groessenordnung belegt; ein Treffer
   mit falscher Groessenordnung ist ein anderes Instrument.

   WAS IM BERICHT STEHT

   Statuscodes, Anzahl, erster/letzter Tag, Zeitstempel-Alter, Groessen-
   ordnungstest (within true/false), Lizenzhinweise als kurze Textauszuege.
   KEINE Indexstaende.

   Ausfuehren:
     TWELVE_DATA_API_KEY=... node scripts/market/probe-index-sources.mjs --publish
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLISH = process.argv.includes("--publish");
const OUT = PUBLISH
  ? resolve(root, "quant/data/market/capabilities/index-source-probe.json")
  : resolve(root, ".market-cache/multi-asset/index-source-probe.json");
const TD_KEY = process.env.TWELVE_DATA_API_KEY || "";
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const VU_UA = "VisionUniverse-DataCore/1.0 (+https://research.visionuniverse.de)";

const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Die Zielindizes: Name fuer die Identitaet, Groessenordnung als Beleg. */
const TARGETS = {
  SPX:    { name: "S&P 500",                     re: /^S&P 500( INDEX)?$/i,                  range: [2000, 15000],  tier: "REQUIRED" },
  NDX:    { name: "Nasdaq-100",                  re: /NASDAQ[- ]?100(?! .*(ETF|FUND))/i,     range: [5000, 50000],  tier: "REQUIRED" },
  DJI:    { name: "Dow Jones Industrial Average",re: /DOW JONES INDUSTRIAL AVERAGE(?! .*ETF)/i, range: [15000, 100000], tier: "REQUIRED" },
  DAX:    { name: "DAX",                          re: /^DAX( PERFORMANCE)?( INDEX)?$|^DAX 40$/i, range: [8000, 50000], tier: "REQUIRED" },
  SX5E:   { name: "EURO STOXX 50",               re: /EURO STOXX 50(?! .*ETF)/i,             range: [2000, 12000],  tier: "REQUIRED" },
  UKX:    { name: "FTSE 100",                    re: /^FTSE 100( INDEX)?$/i,                 range: [4000, 20000],  tier: "REQUIRED" },
  N225:   { name: "Nikkei 225",                  re: /NIKKEI 225(?! .*(ETF|FUND))|NIKKEI STOCK AVERAGE/i, range: [10000, 100000], tier: "REQUIRED" },
  PX1:    { name: "CAC 40",                      re: /^CAC 40( INDEX)?$/i,                   range: [3000, 15000],  tier: "OPTIONAL" },
  SMI:    { name: "Swiss Market Index",          re: /^SMI$|SWISS MARKET INDEX/i,            range: [6000, 25000],  tier: "OPTIONAL" },
  HSI:    { name: "Hang Seng Index",             re: /^HANG SENG( INDEX)?$/i,                range: [10000, 50000], tier: "OPTIONAL" },
  SHCOMP: { name: "SSE Composite",               re: /SSE COMPOSITE|SHANGHAI COMPOSITE/i,    range: [1500, 8000],   tier: "OPTIONAL" },
  RUT:    { name: "Russell 2000",                re: /^RUSSELL 2000( INDEX)?$/i,             range: [800, 6000],    tier: "OPTIONAL" },
  MSCIW:  { name: "MSCI World",                  re: /^MSCI WORLD( INDEX)?$/i,               range: [1000, 10000],  tier: "OPTIONAL" }
};

let requests = 0;
async function get(url, { ua = VU_UA, accept = null, referer = null, timeoutMs = 30000 } = {}) {
  requests++;
  const headers = { "User-Agent": ua };
  if (accept) headers.Accept = accept;
  if (referer) headers.Referer = referer;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* */ }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, type: (res.headers.get("content-type") || "").split(";")[0],
             bytes: text.length, text, json, finalUrl: res.url };
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - started, error: String(e && e.message || e), text: "", json: null };
  } finally { clearTimeout(t); }
}

function redactUrl(u) { return String(u).replace(/apikey=[^&]+/i, "apikey=[REDACTED]"); }
function shape(r) {
  const o = { httpStatus: r.status, ms: r.ms, contentType: r.type || null, bytes: r.bytes || 0 };
  if (r.error) o.error = r.error.slice(0, 160);
  if (r.finalUrl) o.finalUrl = redactUrl(r.finalUrl).slice(0, 200);
  return o;
}
function magnitude(v, range) {
  return typeof v === "number" && isFinite(v) ? { expectedRange: range, within: v >= range[0] && v <= range[1] } : null;
}
function cover(dates) {
  const d = dates.filter(Boolean).map((x) => String(x).slice(0, 10)).sort();
  return d.length ? { observations: d.length, firstDate: d[0], lastDate: d[d.length - 1] } : { observations: 0 };
}
/* Ein kurzer Auszug um ein Stichwort - fuer Lizenz- und Nutzungshinweise. */
function excerpt(text, re, len = 280) {
  const s = String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = re.exec(s);
  if (!m) return null;
  const start = Math.max(0, m.index - 60);
  return s.slice(start, start + len).trim();
}
const LICENSE_RE = /(copyright|all rights reserved|reproduction|redistribut|permission|licen[cs]e|personal use|non-commercial|terms of use)/i;
const num = (s) => { const n = parseFloat(String(s).replace(/[,\s$]/g, "")); return isFinite(n) ? n : null; };
const isoFromMdy = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim()); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
const isoFromYmdSlash = (s) => { const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(String(s).trim()); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

const report = {
  schemaVersion: "1.0.0", generatedAtUtc: new Date().toISOString(),
  purpose: "Index Coverage P0: echte Indexstaende je Quelle gemessen. Keine ETF, keine Futures, keine Eigenberechnung.",
  valuesIncluded: false, sources: {}, perIndex: {}
};
function hit(index, sourceId, finding) {
  (report.perIndex[index] = report.perIndex[index] || {})[sourceId] = finding;
}

/* ------------------------------------------------ 1. Twelve Data (vorhanden) */
async function twelveData() {
  const src = { priority: 1, kind: "EXISTING_PROVIDER", keyPresent: Boolean(TD_KEY) };
  report.sources.twelveData = src;
  if (!TD_KEY) { src.result = "NOT_MEASURED_NO_KEY"; return; }
  const base = "https://api.twelvedata.com";
  const td = async (path) => { const r = await get(`${base}${path}${path.includes("?") ? "&" : "?"}apikey=${TD_KEY}`); await sleep(8500); return r; };
  const usage = await td("/api_usage");
  src.apiUsage = { ...shape(usage), planCategory: usage.json && usage.json.plan_category || null,
                   planLimit: usage.json && usage.json.plan_limit || null, dailyUsage: usage.json && usage.json.daily_usage || null,
                   planDailyLimit: usage.json && usage.json.plan_daily_limit || null };
  const list = await td("/indices");
  const rows = list.json && Array.isArray(list.json.data) ? list.json.data : [];
  src.indicesList = { ...shape(list), rows: rows.length, errorCode: list.json && list.json.code || null,
                      errorMessage: list.json && list.json.message ? String(list.json.message).slice(0, 200) : null };
  /* Runde 2: die Liste nach allen Familiennamen durchsuchen (nur Namen,
     keine Werte) - Runde 1 fand S&P, Nasdaq, Dow, DAX, STOXX, SMI nicht. */
  const FAMILY = /S&P|NASDAQ|DOW JONES|DAX|STOXX|FTSE 100|NIKKEI|SMI|SWISS|RUSSELL|MSCI WORLD|CAC|HANG SENG/i;
  src.familyCandidates = rows.filter((r) => FAMILY.test(String(r.name || ""))).slice(0, 80)
    .map((r) => ({ symbol: r.symbol, name: String(r.name).slice(0, 60), country: r.country, exchange: r.exchange || null, mic: r.mic_code || null }));
  src.fieldNames = rows[0] ? Object.keys(rows[0]) : [];
  /* Aufrufvarianten fuer ein gelistetes Symbol: nur symbol, symbol+country,
     symbol+mic_code. Runde 1: symbol+exchange -> 404. */
  const variants = [];
  for (const q of ["symbol=N225", "symbol=N225&country=Japan", "symbol=N225&mic_code=XJPX", "symbol=FTSE&country=United%20Kingdom", "symbol=SPX", "symbol=NDX", "symbol=DJI", "symbol=GDAXI", "symbol=DAX&country=Germany"]) {
    const r = await td(`/quote?${q}`);
    variants.push({ query: q, httpStatus: r.status, code: r.json && r.json.code || null,
                    message: r.json && r.json.message ? String(r.json.message).slice(0, 160) : null,
                    name: r.json && r.json.name ? String(r.json.name).slice(0, 60) : null,
                    type: r.json && r.json.type || null,
                    magnitudeN225: q.includes("N225") && r.json ? magnitude(num(r.json.close), TARGETS.N225.range) : undefined });
  }
  src.callVariants = variants;
  for (const [id, t] of Object.entries(TARGETS)) {
    const cands = rows.filter((r) => t.re.test(String(r.name || ""))).slice(0, 4)
      .map((r) => ({ symbol: r.symbol, name: r.name, country: r.country, exchange: r.exchange || r.mic_code || null, currency: r.currency || null }));
    const f = { listed: cands, timeSeries: null, intraday: null, quote: null };
    const c = cands[0];
    if (c) {
      /* Runde 1 mit exchange= lieferte 404; Runde 2 grenzt ueber country ein. */
      const q = `symbol=${encodeURIComponent(c.symbol)}${c.country ? "&country=" + encodeURIComponent(c.country) : ""}`;
      const ts = await td(`/time_series?${q}&interval=1day&outputsize=5000`);
      const vals = ts.json && Array.isArray(ts.json.values) ? ts.json.values : [];
      f.timeSeries = { ...shape(ts), ...cover(vals.map((v) => v.datetime)), status: ts.json && ts.json.status || null,
                       code: ts.json && ts.json.code || null, message: ts.json && ts.json.message ? String(ts.json.message).slice(0, 200) : null,
                       meta: ts.json && ts.json.meta ? { symbol: ts.json.meta.symbol, type: ts.json.meta.type, exchange: ts.json.meta.exchange,
                                                        currency: ts.json.meta.currency, timezone: ts.json.meta.exchange_timezone } : null,
                       magnitude: vals[0] ? magnitude(num(vals[0].close), t.range) : null };
      const intr = await td(`/time_series?${q}&interval=5min&outputsize=30`);
      const iv = intr.json && Array.isArray(intr.json.values) ? intr.json.values : [];
      f.intraday = { ...shape(intr), bars: iv.length, lastBar: iv[0] ? iv[0].datetime : null,
                     code: intr.json && intr.json.code || null, message: intr.json && intr.json.message ? String(intr.json.message).slice(0, 200) : null };
      const qu = await td(`/quote?${q}`);
      f.quote = { ...shape(qu), isMarketOpen: qu.json ? qu.json.is_market_open : null, timestamp: qu.json ? qu.json.timestamp || null : null,
                  code: qu.json && qu.json.code || null, message: qu.json && qu.json.message ? String(qu.json.message).slice(0, 200) : null };
    }
    hit(id, "twelveData", f);
  }
}

/* ------------------------------------------------ 2. Offizielle Quellen */
async function nikkei() {
  const url = "https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv";
  const r = await get(url);
  const lines = String(r.text).split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1).map((l) => l.replace(/"/g, "").split(",")).filter((c) => isoFromYmdSlash(c[0]));
  const last = rows.length ? rows[rows.length - 1] : null;
  const terms = await get("https://indexes.nikkei.co.jp/en/nkave/terms");
  report.sources.nikkeiOfficial = { priority: 2, kind: "OFFICIAL_INDEX_PROVIDER", url, ...shape(r), header: lines[0] ? lines[0].slice(0, 160) : null };
  hit("N225", "nikkeiOfficial", { ...shape(r), ...cover(rows.map((c) => isoFromYmdSlash(c[0]))),
    magnitude: last ? magnitude(num(last[1]), TARGETS.N225.range) : null,
    terms: { ...shape(terms), excerpt: excerpt(terms.text, LICENSE_RE) } });
}

async function stoxx() {
  const files = {
    SX5E: ["https://www.stoxx.com/document/Indices/Current/HistoricalData/h_3msx5e.txt",
           "https://www.stoxx.com/document/Indices/Current/HistoricalData/h_sx5e.txt",
           "https://www.stoxx.com/download/historical_values/h_sx5e.txt"],
    DAX:  ["https://www.stoxx.com/document/Indices/Current/HistoricalData/h_dax.txt",
           "https://www.stoxx.com/document/Indices/Current/HistoricalData/h_3mdax.txt"]
  };
  report.sources.stoxxOfficial = { priority: 2, kind: "OFFICIAL_INDEX_PROVIDER" };
  for (const [id, urls] of Object.entries(files)) {
    const tried = [];
    let best = null;
    for (const u of urls) {
      const r = await get(u, { ua: BROWSER_UA });
      const rows = String(r.text).split(/\r?\n/).map((l) => l.split(/[;,]/)).filter((c) => /^\d{2}\.\d{2}\.\d{4}$/.test((c[0] || "").trim()));
      const iso = rows.map((c) => { const [d, m, y] = c[0].trim().split("."); return `${y}-${m}-${d}`; });
      const lastVal = rows.length ? num(rows[rows.length - 1][rows[rows.length - 1].length - 1]) : null;
      const f = { url: u, ...shape(r), ...cover(iso), magnitude: magnitude(lastVal, TARGETS[id].range) };
      tried.push(f);
      if (rows.length && !best) best = f;
    }
    const page = await get(`https://www.stoxx.com/index-details?symbol=${id}`, { ua: BROWSER_UA });
    hit(id, "stoxxOfficial", { tried, resolved: best ? best.url : null,
      indexPage: { ...shape(page), mentionsName: new RegExp(TARGETS[id].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(page.text) },
      terms: excerpt(page.text, LICENSE_RE) });
  }
}

async function nasdaq() {
  report.sources.nasdaqOfficial = { priority: 2, kind: "OFFICIAL_INDEX_PROVIDER_WEBSITE_API" };
  const map = { NDX: "NDX", SPX: "SPX", DJI: "INDU", RUT: "RUT" };
  for (const [id, sym] of Object.entries(map)) {
    const h = await get(`https://api.nasdaq.com/api/quote/${sym}/historical?assetclass=index&fromdate=${daysAgo(3650)}&todate=${TODAY}&limit=9999`,
                        { ua: BROWSER_UA, accept: "application/json, text/plain, */*", referer: "https://www.nasdaq.com/" });
    const rows = h.json && h.json.data && h.json.data.tradesTable && Array.isArray(h.json.data.tradesTable.rows) ? h.json.data.tradesTable.rows : [];
    const info = await get(`https://api.nasdaq.com/api/quote/${sym}/info?assetclass=index`,
                           { ua: BROWSER_UA, accept: "application/json, text/plain, */*", referer: "https://www.nasdaq.com/" });
    const d = info.json && info.json.data || null;
    const pd = d && d.primaryData || null;
    hit(id, "nasdaqOfficial", {
      historical: { ...shape(h), ...cover(rows.map((r) => isoFromMdy(r.date))), magnitude: rows[0] ? magnitude(num(rows[0].close), TARGETS[id].range) : null,
                    status: h.json && h.json.status ? h.json.status : null },
      info: { ...shape(info), companyName: d ? String(d.companyName || "").slice(0, 80) : null,
              isRealTime: pd ? pd.isRealTime : null, lastTradeTimestamp: pd ? String(pd.lastTradeTimestamp || "").slice(0, 80) : null,
              magnitude: pd ? magnitude(num(pd.lastSalePrice), TARGETS[id].range) : null }
    });
  }
  const terms = await get("https://www.nasdaq.com/nasdaq-terms-use", { ua: BROWSER_UA });
  report.sources.nasdaqOfficial.terms = { ...shape(terms), excerpt: excerpt(terms.text, /(personal|non-commercial|redistribut|reproduc)/i) };
  const gi = await get(`https://indexes.nasdaqomx.com/Index/History/NDX`, { ua: BROWSER_UA });
  report.sources.nasdaqOfficial.globalIndexesPage = { ...shape(gi), mentionsExport: /export/i.test(gi.text) };
}

async function spdji() {
  report.sources.spdjiOfficial = { priority: 2, kind: "OFFICIAL_INDEX_PROVIDER_WEBSITE_API" };
  for (const [id, indexId] of Object.entries({ SPX: 340, DJI: 1720, MID: 92030 })) {
    const r = await get(`https://www.spglobal.com/spdji/en/util/redesign/index-data/get-performance-data-for-datawidget-redesign.dot?indexId=${indexId}&language_id=1`,
                        { ua: BROWSER_UA, accept: "application/json" });
    const levels = r.json && r.json.indexLevelsHolder && Array.isArray(r.json.indexLevelsHolder.indexLevels) ? r.json.indexLevelsHolder.indexLevels : [];
    const last = levels.length ? levels[levels.length - 1] : null;
    hit(id === "MID" ? "MID" : id, "spdjiOfficial", { indexId, ...shape(r), jsonKeys: r.json ? Object.keys(r.json).slice(0, 8) : null,
      ...cover(levels.map((l) => l.effectiveDate ? new Date(l.effectiveDate).toISOString() : null)),
      magnitude: last ? magnitude(num(last.indexValue), (TARGETS[id] || { range: [500, 10000] }).range) : null });
  }
  const terms = await get("https://www.spglobal.com/spdji/en/terms-of-use/", { ua: BROWSER_UA });
  report.sources.spdjiOfficial.terms = { ...shape(terms), excerpt: excerpt(terms.text, /(redistribut|reproduc|commercial|permission)/i) };
}

async function msci() {
  const url = `https://app2.msci.com/products/service/index/indexmaster/getLevelDataForGraph?currency_symbol=USD&index_variant=STRD&start_date=${daysAgo(3650).replace(/-/g, "")}&end_date=${TODAY.replace(/-/g, "")}&data_frequency=DAILY&index_codes=990100`;
  const r = await get(url, { ua: BROWSER_UA, accept: "application/json" });
  const lv = r.json && r.json.indexes && Array.isArray(r.json.indexes.INDEX_LEVELS) ? r.json.indexes.INDEX_LEVELS : [];
  const d = (x) => { const s = String(x.calc_date || ""); return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null; };
  report.sources.msciOfficial = { priority: 2, kind: "OFFICIAL_INDEX_PROVIDER_WEBSITE_API" };
  hit("MSCIW", "msciOfficial", { ...shape(r), variant: "STRD (Price, USD)", ...cover(lv.map(d)),
    magnitude: lv.length ? magnitude(num(lv[lv.length - 1].level_eod), TARGETS.MSCIW.range) : null });
}

async function euronext() {
  const url = `https://live.euronext.com/en/ajax/AwlHistoricalPrice/getFullDownloadAjax/FR0003500008-XPAR?format=csv&decimal_separator=.&date_form=d/m/Y&op=&adjusted=&base100=&startdate=${daysAgo(3650)}&enddate=${TODAY}`;
  const r = await get(url, { ua: BROWSER_UA });
  const rows = String(r.text).split(/\r?\n/).map((l) => l.replace(/"/g, "").split(/[;,]/)).filter((c) => /^\d{2}\/\d{2}\/\d{4}$/.test(c[0]));
  const iso = rows.map((c) => { const [d, m, y] = c[0].split("/"); return `${y}-${m}-${d}`; });
  report.sources.euronextOfficial = { priority: 2, kind: "OFFICIAL_EXCHANGE_DOWNLOAD" };
  hit("PX1", "euronextOfficial", { ...shape(r), ...cover(iso), magnitude: rows[0] ? magnitude(num(rows[0][4] || rows[0][1]), TARGETS.PX1.range) : null });
}

async function misc() {
  /* Nur Erreichbarkeit/Form - diese Endpunkte sind nicht dokumentiert
     und brauchen teils Browser-Signaturen. Das Ergebnis ist ein Befund
     zur Maschinenlesbarkeit, keine Einladung. */
  const probes = {
    UKX: { src: "lsegOfficial", url: "https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/UKX" },
    DAX: { src: "deutscheBoerseOfficial", url: "https://api.boerse-frankfurt.de/v1/data/price_history?isin=DE0008469008&mic=XETR&minDate=2026-01-01&maxDate=" + TODAY + "&offset=0&limit=50" },
    SMI: { src: "sixOfficial", url: "https://www.six-group.com/fqs/snap.json?select=ValorId,ClosingPrice,ClosingDate&where=ValorId=998089" },
    HSI: { src: "hangSengOfficial", url: "https://www.hsi.com.hk/data/eng/rt/index-series/hsi/performance.do" },
    SHCOMP: { src: "sseOfficial", url: "https://query.sse.com.cn/commonQuery.do?sqlId=COMMON_SSE_ZS_INDEX_HIS_L&INDEX_CODE=000001" }
  };
  for (const [id, p] of Object.entries(probes)) {
    const r = await get(p.url, { ua: BROWSER_UA, accept: "application/json, text/plain, */*" });
    report.sources[p.src] = report.sources[p.src] || { priority: 2, kind: "OFFICIAL_EXCHANGE_WEBSITE_API" };
    hit(id, p.src, { ...shape(r), jsonKeys: r.json && typeof r.json === "object" ? Object.keys(r.json).slice(0, 8) : null,
                     mentionsName: TARGETS[id].re.test(r.text) || new RegExp(TARGETS[id].name, "i").test(r.text) });
  }
}

/* ------------------------------------------------ Runde 2: weitere offizielle Quellen */

/* EZB Data Portal, Datensatz FM: Aktienindizes (Datastream, DS.EI). Ein
   Wildcard-Abruf liefert alle Reihen samt Titel - Metadaten, keine Werte. */
async function ecbStockIndices() {
  report.sources.ecbDataPortal = { priority: 2, kind: "OFFICIAL_INSTITUTIONAL" };
  const r = await get("https://data-api.ecb.europa.eu/service/data/FM/D....EI..HSTA?lastNObservations=1&format=csvdata");
  const lines = String(r.text).split(/\r?\n/).filter(Boolean);
  const split = (l) => { const o = []; let c = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i];
    if (q) { if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { o.push(c); c = ""; } else c += ch; } o.push(c); return o; };
  const h = lines.length ? split(lines[0]) : [];
  const iKey = h.indexOf("KEY"), iT = h.indexOf("TIME_PERIOD"), iTitle = h.indexOf("TITLE"), iCompl = h.indexOf("TITLE_COMPL"),
        iSrc = h.indexOf("SOURCE_AGENCY"), iPub = h.indexOf("SOURCE_PUB");
  const series = lines.slice(1).map(split).map((c) => ({ key: c[iKey], title: iTitle >= 0 ? String(c[iTitle]).slice(0, 90) : null,
    titleCompl: iCompl >= 0 ? String(c[iCompl]).slice(0, 200) : null, lastPeriod: c[iT],
    sourceAgency: iSrc >= 0 ? c[iSrc] : null, sourcePub: iPub >= 0 ? String(c[iPub]).slice(0, 120) : null }));
  report.sources.ecbDataPortal.wildcard = { ...shape(r), series: series.length, headerHasTitle: iTitle >= 0 };
  report.sources.ecbDataPortal.catalog = series.slice(0, 120);
  /* Zuordnung je Ziel ueber den Titel, danach die Tiefe der Reihe. */
  const want = { SX5E: /EURO STOXX 50/i, SPX: /S&P ?500|S&P COMPOSITE|STANDARD (&|AND) POOR/i, N225: /NIKKEI|JAPAN.*225/i,
                 UKX: /FTSE 100|FTSE-100|UK.*100/i, DAX: /\bDAX\b|GERMANY.*(DAX|CDAX)/i, DJI: /DOW JONES INDUSTRIAL/i, NDX: /NASDAQ/i };
  for (const [id, re] of Object.entries(want)) {
    const m = series.find((x) => re.test((x.title || "") + " " + (x.titleCompl || "")));
    if (!m) { hit(id, "ecbDataPortal", { matched: false }); continue; }
    const full = await get(`https://data-api.ecb.europa.eu/service/data/FM/${m.key.replace(/^FM\./, "")}?format=csvdata`);
    const fl = String(full.text).split(/\r?\n/).filter(Boolean);
    const fh = fl.length ? split(fl[0]) : [];
    const fT = fh.indexOf("TIME_PERIOD"), fV = fh.indexOf("OBS_VALUE");
    const obs = fl.slice(1).map(split).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[fT]) && isFinite(parseFloat(c[fV])));
    hit(id, "ecbDataPortal", { matched: true, key: m.key, title: m.title, titleCompl: m.titleCompl, sourceAgency: m.sourceAgency, sourcePub: m.sourcePub,
      ...shape(full), ...cover(obs.map((c) => c[fT])), magnitude: obs.length ? magnitude(parseFloat(obs[obs.length - 1][fV]), TARGETS[id].range) : null });
  }
}

/* Cboe: offizielle verzoegerte Indexkurse (Cboe verbreitet SPX, NDX, RUT
   als Basiswert seiner Indexoptionen). DJX ist 1/100 des Dow - ein
   anderes Instrument und wird nur als solches benannt. */
async function cboe() {
  report.sources.cboeOfficial = { priority: 2, kind: "OFFICIAL_EXCHANGE_DELAYED" };
  for (const [id, sym] of Object.entries({ SPX: "_SPX", NDX: "_NDX", RUT: "_RUT", DJI: "_DJX" })) {
    const q = await get(`https://cdn.cboe.com/api/global/delayed_quotes/quotes/${sym}.json`, { ua: BROWSER_UA, accept: "application/json" });
    const d = q.json && q.json.data || null;
    const h = await get(`https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/${sym}.json`, { ua: BROWSER_UA, accept: "application/json" });
    const rows = h.json && h.json.data && Array.isArray(h.json.data) ? h.json.data : [];
    const range = id === "DJI" ? [150, 1000] : TARGETS[id].range;
    hit(id, "cboeOfficial", { symbol: sym, note: id === "DJI" ? "DJX = Dow Jones Industrial Average / 100 - NICHT der DJIA-Stand" : null,
      quote: { ...shape(q), lastTradeTime: d ? String(d.last_trade_time || "").slice(0, 40) : null, delayMinutes: q.json ? q.json.delay || null : null,
               magnitude: d ? magnitude(num(d.current_price), range) : null },
      historical: { ...shape(h), ...cover(rows.map((x) => x.date)), magnitude: rows.length ? magnitude(num(rows[rows.length - 1].close), range) : null } });
  }
  const terms = await get("https://www.cboe.com/us/options/market_statistics/terms/", { ua: BROWSER_UA });
  report.sources.cboeOfficial.terms = { ...shape(terms), excerpt: excerpt(terms.text, /(delayed|personal|redistribut|commercial)/i) };
}

/* SNB (Schweizerische Nationalbank): Aktienindizes im Kapitalmarktwuerfel. */
async function snb() {
  report.sources.snbDataPortal = { priority: 2, kind: "OFFICIAL_INSTITUTIONAL" };
  const r = await get("https://data.snb.ch/api/cube/capchstocki/data/csv/en");
  const lines = String(r.text).split(/\r?\n/);
  const rows = lines.map((l) => l.replace(/"/g, "").split(";")).filter((c) => /^\d{4}-\d{2}(-\d{2})?$/.test(c[0]));
  const dims = [...new Set(rows.map((c) => c[1]))].slice(0, 20);
  hit("SMI", "snbDataPortal", { ...shape(r), header: lines.slice(0, 3).map((l) => l.slice(0, 160)), dimensions: dims,
    ...cover(rows.map((c) => c[0].length === 7 ? c[0] + "-01" : c[0])), frequencyHint: rows[0] && rows[0][0].length === 7 ? "MONTHLY" : "DAILY" });
}

/* Bundesbank: klassische Zeitreihen-Downloads fuer Aktienindizes. */
async function bundesbankIndices() {
  report.sources.bundesbankIndices = { priority: 2, kind: "OFFICIAL_INSTITUTIONAL" };
  const out = [];
  for (const ts of ["BBK01.WU3140", "BBK01.WU3141", "BBK01.WU001A"]) {
    const r = await get(`https://www.bundesbank.de/statistic-rmi/StatisticDownload?tsId=${ts}&its_csvFormat=en&its_fileFormat=csv&mode=its`, { ua: BROWSER_UA });
    const lines = String(r.text).split(/\r?\n/);
    const rows = lines.map((l) => l.split(/[;,]/)).filter((c) => /^\d{4}-\d{2}(-\d{2})?$/.test((c[0] || "").trim()));
    out.push({ tsId: ts, ...shape(r), header: lines.slice(0, 2).map((l) => l.slice(0, 160)), ...cover(rows.map((c) => c[0].trim().length === 7 ? c[0].trim() + "-01" : c[0].trim())) });
  }
  hit("DAX", "bundesbankIndices", { tried: out });
}

/* FRED: was die Lizenzklassen bedeuten - vom Herausgeber selbst. */
async function fredLegal() {
  const r = await get("https://fred.stlouisfed.org/legal/");
  report.sources.fredLegal = { ...shape(r),
    preApproval: excerpt(r.text, /pre-?approval/i, 520),
    citationRequired: excerpt(r.text, /citation required|copyrighted: citation/i, 520) };
}

async function nikkeiTerms() {
  const tried = [];
  for (const u of ["https://indexes.nikkei.co.jp/en/terms", "https://indexes.nikkei.co.jp/en/nkave/about/terms", "https://indexes.nikkei.co.jp/en/", "https://indexes.nikkei.co.jp/en/nkave"]) {
    const r = await get(u, { ua: BROWSER_UA });
    tried.push({ url: u, ...shape(r), excerpt: excerpt(r.text, /(copyright|reprodu|redistribut|permission|license)/i, 320) });
  }
  report.sources.nikkeiOfficial = Object.assign(report.sources.nikkeiOfficial || {}, { termsTried: tried });
}

async function reach() {
  const out = [];
  for (const u of ["https://www.stoxx.com/", "https://stoxx.com/", "https://www.hsi.com.hk/data/eng/indexes/00001.00/chart.json"]) {
    const r = await get(u, { ua: BROWSER_UA });
    out.push({ url: u, ...shape(r) });
  }
  report.sources.reachability = out;
}

/* ------------------------------------------------ 3. Institutioneller Spiegel */
async function fred() {
  report.sources.fred = { priority: 3, kind: "INSTITUTIONAL_MIRROR" };
  for (const [id, sid] of Object.entries({ SPX: "SP500", DJI: "DJIA", NDX: "NASDAQ100", N225: "NIKKEI225" })) {
    const r = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${sid}`);
    const rows = String(r.text).split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0]) && isFinite(parseFloat(c[1])));
    const page = await get(`https://fred.stlouisfed.org/series/${sid}`);
    hit(id, "fred", { series: sid, ...shape(r), ...cover(rows.map((c) => c[0])),
      magnitude: rows.length ? magnitude(parseFloat(rows[rows.length - 1][1]), TARGETS[id].range) : null,
      licenseNote: excerpt(page.text, /(copyright|reproduction|all rights reserved|permission)/i, 360) });
  }
}

/* ------------------------------------------------ 4. Aggregator (nur gemessen) */
async function stooq() {
  report.sources.stooq = { priority: 4, kind: "THIRD_PARTY_AGGREGATOR", note: "Nur gemessen. Anbindung nur mit Owner-Entscheidung (§12 Stufe 4)." };
  const map = { SPX: "^spx", NDX: "^ndx", DJI: "^dji", DAX: "^dax", SX5E: "^stx50e", UKX: "^ukx", N225: "^nkx", PX1: "^cac", SMI: "^smi", HSI: "^hsi", SHCOMP: "^shc" };
  for (const [id, s] of Object.entries(map)) {
    const r = await get(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`);
    const rows = String(r.text).split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0]));
    hit(id, "stooq", { symbol: s, ...shape(r), ...cover(rows.map((c) => c[0])),
      magnitude: rows.length ? magnitude(num(rows[rows.length - 1][4]), TARGETS[id].range) : null,
      bodyHint: rows.length ? null : String(r.text).slice(0, 80) });
    await sleep(1500);
  }
}

async function main() {
  for (const step of [twelveData, nikkei, nikkeiTerms, stoxx, nasdaq, spdji, msci, euronext, misc, ecbStockIndices, cboe, snb, bundesbankIndices, fred, fredLegal, reach]) {
    try { await step(); } catch (e) { report.sources["error_" + step.name] = String(e && e.message || e).slice(0, 200); }
  }
  report.requests = requests;
  const json = JSON.stringify(report, null, 1).split(TD_KEY || "\u0000never\u0000").join("[REDACTED]");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json + "\n");
  console.log(`Index-Quellen-Sondierung: ${OUT.replace(root + "/", "")} (${requests} Anfragen)`);
  for (const [id, srcs] of Object.entries(report.perIndex)) {
    const line = Object.entries(srcs).map(([s, f]) => {
      const c = f.timeSeries || f.historical || f;
      const obs = c && c.observations;
      const mag = c && c.magnitude ? (c.magnitude.within ? "id-ok" : "id-FAIL") : "";
      return `${s}:${obs ? obs + "obs " + (c.firstDate || "") + ".." + (c.lastDate || "") : (c && c.httpStatus) || "-"} ${mag}`;
    }).join(" | ");
    console.log(id.padEnd(7), line);
  }
}
main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
