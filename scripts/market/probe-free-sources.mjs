/* =========================================================================
   VISION UNIVERSE — probe-free-sources.mjs   (Free Data Source Discovery)

   MISST KOSTENLOSE, MOEGLICHST OFFIZIELLE DATENQUELLEN JE CAPABILITY -
   UND DIE FMP-ABDECKUNG DES VORHANDENEN ZUGANGS ALS VERGLEICHSMASS.

   Ein Source Audit, keine Integration. Je Quelle wird festgehalten:
   Erreichbarkeit ohne Anmeldung, Format, Form (Kopfzeile, Feldnamen,
   Anzahl Zeilen/Eintraege), zeitliche Abdeckung (erstes/letztes Datum,
   kuenftige Termine bei Kalendern) und - wo lesbar - ein Auszug aus den
   Nutzungsbedingungen. KEINE Werte: Kopfzeilen werden auf Feldnamen
   gekuerzt, Zahlen mit Nachkommastellen maskiert.

   Kein Scraping als Kernquelle: HTML-Seiten werden nur gemessen, um
   festzustellen, DASS es keinen maschinenlesbaren Weg gibt, oder um
   offizielle Downloadverweise zu finden.

   Schluessel: FMP_API_KEY, FINNHUB_API_KEY (vorhandene Zugaenge, nur fuer
   den Abdeckungsvergleich), SEC_USER_AGENT (SEC verlangt eine Kontakt-
   angabe). Keiner erscheint im Bericht; Schluesselparameter werden aus
   URLs entfernt.

   Ausfuehren (GitHub Actions, Marker [ma-free-probe]):
     node scripts/market/probe-free-sources.mjs --publish
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLISH = process.argv.includes("--publish");
const OUT = PUBLISH ? resolve(root, "quant/data/market/capabilities/free-source-probe.json")
                    : resolve(root, ".market-cache/free-source-probe.json");
const FMP_KEY = process.env.FMP_API_KEY || "";
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const SEC_UA = process.env.SEC_USER_AGENT || "";
const VU_UA = "VisionUniverse-DataCore/1.0 (+https://research.visionuniverse.de)";
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ymd = (d) => d.replace(/-/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* Letzter US-Handelstag vor heute (Wochenende zurueck) - fuer Tagesdateien. */
function lastWeekday(offset = 1) {
  const d = new Date(Date.now() - offset * 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const Q = (() => { const y = NOW.getUTCFullYear(), q = Math.floor(NOW.getUTCMonth() / 3); return q === 0 ? `${y - 1}q4` : `${y}q${q}`; })();

let requests = 0;
async function get(url, { ua = VU_UA, accept = null, method = "GET", headers = {}, timeoutMs = 45000, maxBytes = 30e6 } = {}) {
  requests++;
  const h = Object.assign({ "User-Agent": ua }, headers);
  if (accept) h.Accept = accept;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const post = method === "POST_SI";
    if (post) h["Content-Type"] = "application/json";
    const res = await fetch(url, { method: post ? "POST" : method, headers: h, signal: ctrl.signal, redirect: "follow",
      body: post ? JSON.stringify({ limit: 2, sortFields: ["-settlementDate"] }) : undefined });
    const meta = { ok: res.ok, status: res.status, ms: 0, type: (res.headers.get("content-type") || "").split(";")[0],
                   length: Number(res.headers.get("content-length")) || null, lastModified: res.headers.get("last-modified"),
                   finalUrl: res.url };
    if (method === "HEAD") { meta.ms = Date.now() - started; return Object.assign(meta, { text: "", bytes: 0 }); }
    const buf = Buffer.from(await res.arrayBuffer());
    meta.ms = Date.now() - started;
    meta.bytes = buf.length;
    meta.magic = buf.slice(0, 4).toString("hex");
    meta.text = buf.length <= maxBytes ? buf.toString("utf8") : "";
    try { meta.json = JSON.parse(meta.text); } catch { meta.json = null; }
    return meta;
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - started, error: String(e && e.message || e).slice(0, 160), text: "", bytes: 0 };
  } finally { clearTimeout(t); }
}

/* ------------------------------------------------------------ Form */
function stripKeys(u) {
  return String(u || "").replace(/([?&])(apikey|api_key|token|api_token|registrationkey|UserID)=[^&]*&?/gi, (m, sep) => sep).replace(/[?&]$/, "");
}
function mask(s) { return String(s).replace(/-?\d+\.\d+/g, "#").slice(0, 220); }
function dates(text) {
  const iso = String(text).match(/\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g) || [];
  const compact = (String(text).match(/\b(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?=T|\b)/g) || []).map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`);
  const us = (String(text).match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19|20)\d{2}\b/g) || [])
    .map((d) => { const [m, dd, y] = d.split("/"); return `${y}-${m.padStart(2, "0")}-${dd.padStart(2, "0")}`; });
  const all = iso.concat(compact, us).sort();
  if (!all.length) return null;
  return { datesSeen: all.length, firstDate: all[0], lastDate: all[all.length - 1], futureDates: all.filter((d) => d > TODAY).length };
}
function shape(r, fmt) {
  const o = { httpStatus: r.status, ms: r.ms, contentType: r.type || null, bytes: r.bytes || r.length || 0 };
  if (r.error) o.error = r.error;
  if (r.lastModified) o.lastModified = r.lastModified;
  if (r.finalUrl) o.finalUrl = stripKeys(r.finalUrl).slice(0, 220);
  if (!r.ok || !r.text) { if (r.text && !r.ok) o.bodyStart = mask(r.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 160); return o; }
  const text = r.text;
  if (fmt === "zip") { o.isZip = r.magic === "504b0304"; return o; }
  if (fmt === "xlsx") { o.isZipContainer = r.magic === "504b0304"; o.isXls = r.magic === "d0cf11e0"; return o; }
  if (r.json !== null && r.json !== undefined) {
    const j = r.json;
    o.json = Array.isArray(j) ? { array: j.length, fieldNames: j[0] && typeof j[0] === "object" ? Object.keys(j[0]).slice(0, 20) : null }
                              : { keys: Object.keys(j).slice(0, 16) };
    if (!Array.isArray(j)) {
      const arrKey = Object.keys(j).find((k) => Array.isArray(j[k]) && j[k].length);
      if (arrKey) o.json.firstArray = { key: arrKey, length: j[arrKey].length,
        fieldNames: typeof j[arrKey][0] === "object" && j[arrKey][0] ? Object.keys(j[arrKey][0]).slice(0, 20) : null };
      const msg = j.message || j.error || j["Error Message"] || j.Message;
      if (msg) o.message = mask(stripKeys(typeof msg === "string" ? msg : JSON.stringify(msg))).slice(0, 200);
    }
  } else if (/^\s*</.test(text)) {
    const rootTag = (/<(?!\?|!)([\w:.-]+)/.exec(text) || [])[1] || null;
    o.markup = { root: rootTag, items: (text.match(/<item[\s>]/g) || []).length, entries: (text.match(/<entry[\s>]/g) || []).length,
                 title: ((/<title[^>]*>([^<]{0,120})/i.exec(text) || [])[1] || "").trim() || null };
  } else if (/BEGIN:VCALENDAR/.test(text)) {
    o.ics = { events: (text.match(/BEGIN:VEVENT/g) || []).length };
  } else {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    o.table = { lines: lines.length, header: mask(lines[0] || ""), delimiter: /\|/.test(lines[0]) ? "|" : /;/.test(lines[0]) ? ";" : /\t/.test(lines[0]) ? "tab" : "," };
  }
  const d = dates(text.length > 5e6 ? text.slice(0, 2e6) + text.slice(-2e6) : text);
  if (d) o.coverage = d;
  return o;
}
function excerpt(text, re, len = 420) {
  const s = String(text || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const m = re.exec(s);
  if (!m) return null;
  const start = Math.max(0, m.index - 80);
  return s.slice(start, start + len).trim();
}

/* ------------------------------------------------------------ Quellen
   cats: Buchstaben der Taxonomie (A..AK). priority: 1 Behoerde/Regulator,
   2 Boerse/Index/Emittent, 3 akademisch/institutionell, 4 offene
   Datensaetze, 5 Freemium. auth: wie die Quelle erreicht wird. */
const SEC = { ua: "sec" };
const SOURCES = [
  /* A Indizes (Nachtrag zur Index-P0-Messung) */
  { id: "cboe-vix-history", cats: ["A", "AH"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv", note: "offizielle Cboe-Tagesdatei VIX" },
  { id: "cboe-spx-history", cats: ["A"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/SPX_History.csv", note: "gleiches Verzeichnis, S&P 500?" },
  { id: "cboe-ndx-history", cats: ["A"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/NDX_History.csv", note: "gleiches Verzeichnis, Nasdaq-100?" },
  { id: "cboe-rut-history", cats: ["A"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/RUT_History.csv" },
  { id: "cboe-djx-history", cats: ["A"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/DJX_History.csv", note: "DJX = DJIA/100 - anderes Instrument" },
  { id: "nasdaq-giw-ndx-export", cats: ["A", "U"], priority: 2, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://indexes.nasdaqomx.com/Index/History/NDX", note: "Nasdaq Global Index Watch" },
  { id: "nasdaq-giw-ndx-weighting", cats: ["U"], priority: 2, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://indexes.nasdaqomx.com/Index/Weighting/NDX" },

  /* B/C Rohstoffe, Metalle */
  { id: "worldbank-pinksheet-monthly", cats: ["B", "C"], priority: 3, auth: "NO_AUTH", fmt: "xlsx", url: "https://thedocs.worldbank.org/en/doc/18675f1d1639c7a34d463f59263ba0a2-0050012025/related/CMO-Historical-Data-Monthly.xlsx", note: "World Bank Commodity Price Data (Pink Sheet)" },
  { id: "worldbank-pinksheet-page", cats: ["B", "C"], priority: 3, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://www.worldbank.org/en/research/commodity-markets", linkRe: /https?:\/\/[^"'\s]+CMO-Historical-Data-(Monthly|Annual)\.xlsx/gi },
  { id: "imf-pcps-sdmx", cats: ["B", "C"], priority: 3, auth: "NO_AUTH", fmt: "json", url: "https://api.imf.org/external/sdmx/2.1/data/PCPS/M.W00.PCOPP.USD?startPeriod=2024-01&format=jsondata", note: "IMF Primary Commodity Prices, Kupfer" },
  { id: "lbma-gold-json", cats: ["C"], priority: 2, auth: "NO_AUTH", fmt: "json", url: "https://prices.lbma.org.uk/json/gold_pm.json", note: "LBMA Gold Price PM" },
  { id: "cftc-cot-legacy-futures", cats: ["AI", "B"], priority: 1, auth: "NO_AUTH", fmt: "csv", url: "https://www.cftc.gov/dea/newcot/deafut.txt", note: "Commitments of Traders, woechentlich" },
  { id: "cftc-socrata-cot", cats: ["AI", "B"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=2&$order=report_date_as_yyyy_mm_dd%20DESC" },

  /* D/E/F/AG Zinsen, Makro, Zentralbanken */
  { id: "bls-api-v1-cpi", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0", note: "BLS Public API v1 (ohne Schluessel, Tageslimit)" },
  { id: "bls-api-v1-payrolls", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://api.bls.gov/publicAPI/v1/timeseries/data/CES0000000001" },
  { id: "bls-api-v1-unrate", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000" },
  { id: "bea-api-nokey", cats: ["E", "F"], priority: 1, auth: "FREE_API_KEY", fmt: "json", url: "https://apps.bea.gov/api/data?method=GETDATASETLIST&ResultFormat=JSON", note: "ohne UserID - erwartet Fehler" },
  { id: "census-eits-retail", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "json", url: `https://api.census.gov/data/timeseries/eits/marts?get=cell_value,time_slot_id,category_code,data_type_code&for=us:*&time=from+${NOW.getUTCFullYear() - 1}`, note: "Advance Retail Sales" },
  { id: "treasury-fiscaldata-debt", cats: ["E", "AG"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounts/od/debt_to_penny?sort=-record_date&page[size]=2" },
  { id: "fed-h41-ddp", cats: ["AG"], priority: 1, auth: "NO_AUTH", fmt: "csv", url: "https://www.federalreserve.gov/datadownload/Output.aspx?rel=H41&series=ae2d1d0e9ec6e6c9e7a3e8de54dc3b30&lastobs=5&from=&to=&filetype=csv&label=include&layout=seriescolumn", note: "Fed Data Download Program - Serien-Hash geraten" },
  { id: "fed-ddp-choose-h15", cats: ["D", "AG"], priority: 1, auth: "NO_AUTH", fmt: "html", url: "https://www.federalreserve.gov/datadownload/Choose.aspx?rel=H15" },
  { id: "ecb-hicp", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "csv", url: "https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?format=csvdata&lastNObservations=3" },
  { id: "ecb-m3", cats: ["E", "AG"], priority: 1, auth: "NO_AUTH", fmt: "csv", url: "https://data-api.ecb.europa.eu/service/data/BSI/M.U2.Y.V.M30.X.I.U2.2300.Z01.A?format=csvdata&lastNObservations=3" },
  { id: "ecb-balance-sheet", cats: ["AG"], priority: 1, auth: "NO_AUTH", fmt: "csv", url: "https://data-api.ecb.europa.eu/service/data/ILM/W.U2.C.T000000.Z5.Z01?format=csvdata&lastNObservations=3" },
  { id: "eurostat-hicp", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=EA&coicop=CP00&lastTimePeriod=3" },
  { id: "eurostat-gdp", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/namq_10_gdp?geo=EA20&unit=CLV_PCH_PRE&s_adj=SCA&na_item=B1GQ&lastTimePeriod=3" },
  { id: "eurostat-unemployment", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=EA20&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT&lastTimePeriod=3" },
  { id: "destatis-genesis-guest", cats: ["E", "F"], priority: 1, auth: "NO_AUTH", fmt: "text", url: "https://www-genesis.destatis.de/genesisWS/rest/2020/data/tablefile?username=GAST&password=GAST&name=61111-0002&area=all&format=ffcsv&language=de", note: "Gastzugang Verbraucherpreisindex" },
  { id: "bundesbank-api-cpi", cats: ["E"], priority: 1, auth: "NO_AUTH", fmt: "csv", url: "https://api.statistiken.bundesbank.de/rest/data/BBDP1/M.DE.N.VPI.C.A00000.I20.A?format=csv&lang=en&lastNObservations=3" },
  { id: "oecd-cli", cats: ["E", "F"], priority: 3, auth: "NO_AUTH", fmt: "csv", url: "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,/USA.M.LI...AA...H?lastNObservations=3&format=csvfilewithlabels" },
  { id: "worldbank-gdp", cats: ["E"], priority: 3, auth: "NO_AUTH", fmt: "json", url: "https://api.worldbank.org/v2/country/US;DE;JP/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=6&mrv=2" },
  { id: "imf-weo-datamapper", cats: ["E"], priority: 3, auth: "NO_AUTH", fmt: "json", url: "https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/USA/DEU" },
  { id: "boe-iadb-bankrate", cats: ["D", "AG"], priority: 1, auth: "NO_AUTH", fmt: "csv", ua: "browser", url: `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/${NOW.getUTCFullYear() - 1}&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N` },
  { id: "snb-policy-rate", cats: ["D", "AG"], priority: 1, auth: "NO_AUTH", fmt: "csv", url: "https://data.snb.ch/api/cube/snbgwdzid/data/csv/en" },
  { id: "boj-api", cats: ["D", "AG"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=FM01&code=STRDCLUCON" },

  /* H Filings, AB Unternehmensereignisse, AF M&A, O IPO */
  { id: "sec-company-tickers-exchange", cats: ["H", "AB", "V"], priority: 1, auth: "NO_AUTH", fmt: "json", ...SEC, url: "https://www.sec.gov/files/company_tickers_exchange.json" },
  { id: "sec-submissions-aapl", cats: ["H", "V", "AB"], priority: 1, auth: "NO_AUTH", fmt: "json", ...SEC, url: "https://data.sec.gov/submissions/CIK0000320193.json" },
  { id: "sec-daily-form-index", cats: ["H", "O", "AF", "Q"], priority: 1, auth: "NO_AUTH", fmt: "text", ...SEC, url: `https://www.sec.gov/Archives/edgar/daily-index/${NOW.getUTCFullYear()}/QTR${Math.floor(NOW.getUTCMonth() / 3) + 1}/form.${ymd(lastWeekday(1))}.idx`, note: "Tagesindex nach Formular (S-1, 424B4, S-4, 425, DEFM14A, 4, 13F-HR)" },
  { id: "sec-current-8k-atom", cats: ["Y", "L", "H"], priority: 1, auth: "NO_AUTH", fmt: "xml", ...SEC, url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=40&output=atom" },
  { id: "sec-efts-fulltext", cats: ["H", "Y", "L"], priority: 1, auth: "NO_AUTH", fmt: "json", ...SEC, url: `https://efts.sec.gov/LATEST/search-index?q=%22Item%202.02%22&forms=8-K&dateRange=custom&startdt=${daysAgo(7)}&enddt=${TODAY}` },
  { id: "sec-financial-statement-datasets", cats: ["G"], priority: 1, auth: "NO_AUTH", fmt: "zip", method: "HEAD", ...SEC, url: `https://www.sec.gov/files/dera/data/financial-statement-data-sets/${Q}.zip` },
  { id: "sec-companyfacts-aapl", cats: ["G", "AA"], priority: 1, auth: "NO_AUTH", fmt: "json", ...SEC, url: "https://data.sec.gov/api/xbrl/companyconcept/CIK0000320193/dei/EntityCommonStockSharesOutstanding.json" },

  /* Q Insider, R/S 13F, T Fondsbestaende */
  { id: "sec-insider-datasets", cats: ["Q"], priority: 1, auth: "NO_AUTH", fmt: "zip", method: "HEAD", ...SEC, url: `https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/${Q}_form345.zip` },
  { id: "sec-insider-datasets-page", cats: ["Q"], priority: 1, auth: "NO_AUTH", fmt: "html", ...SEC, url: "https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets", linkRe: /\/files\/structureddata\/data\/insider-transactions-data-sets\/[^"']+\.zip/gi },
  { id: "sec-13f-datasets-page", cats: ["R", "S"], priority: 1, auth: "NO_AUTH", fmt: "html", ...SEC, url: "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets", linkRe: /\/files\/structureddata\/data\/form-13f-data-sets\/[^"']+\.zip/gi },
  { id: "sec-nport-datasets-page", cats: ["T", "S"], priority: 1, auth: "NO_AUTH", fmt: "html", ...SEC, url: "https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets", linkRe: /\/files\/[^"']*n-port[^"']*\.zip/gi },
  { id: "sec-13f-securities-list", cats: ["S"], priority: 1, auth: "NO_AUTH", fmt: "html", ...SEC, url: "https://www.sec.gov/rules-regulations/staff-guidance/division-investment-management-frequently-asked-questions/official-list-section-13f-securities", linkRe: /\/files\/investment\/13flist\d{4}q\d\.(pdf|txt)/gi },

  /* T ETF-Bestaende beim Emittenten */
  { id: "ishares-ivv-holdings", cats: ["T", "U"], priority: 2, auth: "NO_AUTH", fmt: "csv", ua: "browser", url: "https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/1467271812596.ajax?fileType=csv&fileName=IVV_holdings&dataType=fund" },
  { id: "ssga-spy-holdings", cats: ["T", "U"], priority: 2, auth: "NO_AUTH", fmt: "xlsx", ua: "browser", url: "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx" },
  { id: "ssga-dia-holdings", cats: ["T", "U"], priority: 2, auth: "NO_AUTH", fmt: "xlsx", ua: "browser", url: "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-dia.xlsx" },
  { id: "invesco-qqq-holdings", cats: ["T", "U"], priority: 2, auth: "NO_AUTH", fmt: "csv", ua: "browser", url: "https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=QQQ" },
  { id: "ark-arkk-holdings", cats: ["T"], priority: 2, auth: "NO_AUTH", fmt: "csv", ua: "browser", url: "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv" },
  { id: "ishares-exs1-dax-holdings", cats: ["T", "U"], priority: 2, auth: "NO_AUTH", fmt: "csv", ua: "browser", url: "https://www.ishares.com/de/privatanleger/de/produkte/251464/ishares-dax-ucits-etf-de-fund/1478358465952.ajax?fileType=csv&fileName=EXS1_holdings&dataType=fund" },

  /* Z Short Interest, AB Symbolverzeichnisse */
  { id: "finra-regsho-daily", cats: ["Z"], priority: 1, auth: "NO_AUTH", fmt: "text", url: `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${ymd(lastWeekday(1))}.txt`, note: "Reg SHO Daily Short Sale Volume (nicht Short Interest)" },
  { id: "finra-api-short-interest", cats: ["Z"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest?limit=2", accept: "application/json" },
  { id: "sec-fails-to-deliver-page", cats: ["Z"], priority: 1, auth: "NO_AUTH", fmt: "html", ...SEC, url: "https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data", linkRe: /\/files\/data\/fails-deliver-data\/cnsfails\d{6}[ab]\.zip/gi },
  { id: "nasdaqtrader-nasdaqlisted", cats: ["AB", "V"], priority: 2, auth: "NO_AUTH", fmt: "text", url: "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt" },
  { id: "nasdaqtrader-otherlisted", cats: ["AB"], priority: 2, auth: "NO_AUTH", fmt: "text", url: "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt" },

  /* P/L Kalender */
  { id: "bls-schedule-ics", cats: ["P"], priority: 1, auth: "NO_AUTH", fmt: "ics", ua: "browser", url: "https://www.bls.gov/schedule/news_release/bls.ics" },
  { id: "bea-schedule-json", cats: ["P"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://apps.bea.gov/API/signup/release_dates.json" },
  { id: "census-econ-calendar", cats: ["P"], priority: 1, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://www.census.gov/economic-indicators/calendar-listview.html" },
  { id: "fed-fomc-calendar", cats: ["P", "AG"], priority: 1, auth: "NO_AUTH", fmt: "html", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" },
  { id: "ecb-calendar-ics", cats: ["P", "AG"], priority: 1, auth: "NO_AUTH", fmt: "html", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", linkRe: /[^"'\s]+\.ics/gi },
  { id: "eurostat-release-calendar", cats: ["P"], priority: 1, auth: "NO_AUTH", fmt: "json", url: `https://ec.europa.eu/eurostat/api/dissemination/catalogue/calendar?format=json&from=${TODAY}&to=${daysAhead(30)}` },
  { id: "destatis-calendar", cats: ["P"], priority: 1, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://www.destatis.de/DE/Presse/Termine/_inhalt.html" },

  /* Y Nachrichten (amtlich) */
  { id: "fed-press-rss", cats: ["Y", "AG"], priority: 1, auth: "NO_AUTH", fmt: "xml", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { id: "ecb-press-rss", cats: ["Y", "AG"], priority: 1, auth: "NO_AUTH", fmt: "xml", url: "https://www.ecb.europa.eu/rss/press.html" },
  { id: "sec-press-rss", cats: ["Y"], priority: 1, auth: "NO_AUTH", fmt: "xml", ...SEC, url: "https://www.sec.gov/news/pressreleases.rss" },
  { id: "bls-news-rss", cats: ["Y", "E"], priority: 1, auth: "NO_AUTH", fmt: "xml", ua: "browser", url: "https://www.bls.gov/feed/bls_latest.rss" },

  /* AD/AE Kongress */
  { id: "house-clerk-fd-zip", cats: ["AD", "AE"], priority: 1, auth: "NO_AUTH", fmt: "zip", url: `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${NOW.getUTCFullYear()}FD.zip` },
  { id: "senate-efd-search", cats: ["AD", "AE"], priority: 1, auth: "NO_AUTH", fmt: "html", url: "https://efdsearch.senate.gov/search/" },

  /* AH Optionen, AC ESG, V Sektoren, akademisch */
  { id: "cboe-putcall-daily", cats: ["AH", "W"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/totalpc.csv" },
  { id: "occ-volume", cats: ["AH"], priority: 2, auth: "NO_AUTH", fmt: "json", url: "https://marketdata.theocc.com/volume-query?reportDate=" + ymd(lastWeekday(1)) + "&format=csv&volumeQueryType=O&symbolType=ALL&symbol=&reportType=D&accountType=ALL&productKind=ALL&porc=BOTH" },
  { id: "french-data-library", cats: ["V", "W"], priority: 3, auth: "NO_AUTH", fmt: "zip", url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip" },
  { id: "french-industry-portfolios", cats: ["V"], priority: 3, auth: "NO_AUTH", fmt: "zip", url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/12_Industry_Portfolios_daily_CSV.zip" },
  { id: "coingecko-list", cats: ["AK"], priority: 5, auth: "NO_AUTH", fmt: "json", url: "https://api.coingecko.com/api/v3/coins/list" }
];

/* FRED-Reihen: je Reihe die Lizenzklasse (Reihenseite) und die Abdeckung. */
const FRED = [
  ["CPIAUCSL", "E"], ["PCEPI", "E"], ["UNRATE", "E"], ["PAYEMS", "E"], ["GDPC1", "E"], ["INDPRO", "E"], ["RSAFS", "E"],
  ["HOUST", "E"], ["UMCSENT", "E"], ["M2SL", "E"], ["WALCL", "AG"], ["DFF", "D"], ["T10Y2Y", "D"], ["BAMLH0A0HYM2", "D"],
  ["BAA10Y", "D"], ["DCOILWTICO", "B"], ["GOLDAMGBD228NLBM", "C"], ["PCOPPUSDM", "B"], ["VIXCLS", "AH"], ["NASDAQCOM", "A"], ["DEXUSEU", "AJ"]
];

/* Nutzungsbedingungen je Quelle (Auszug um das Stichwort). */
const TERMS = [
  ["sec", "https://www.sec.gov/about/privacy-information", /(public information|may be copied|further distributed|copyright)/i, "sec"],
  ["sec-access", "https://www.sec.gov/about/webmaster-frequently-asked-questions", /(10 requests per second|fair access|user agent)/i, "sec"],
  ["bls", "https://www.bls.gov/opub/copyright-information.htm", /(public domain|may be reproduced|copyright)/i, "browser"],
  ["bea", "https://www.bea.gov/help/guidelines-for-citing-bea", /(public domain|cite|copyright)/i, "browser"],
  ["census", "https://www.census.gov/about/policies/citation.html", /(public domain|copyright|cite)/i, "browser"],
  ["fed", "https://www.federalreserve.gov/disclaimer.htm", /(public domain|copyright|may be copied|reproduc)/i, "vu"],
  ["treasury-fiscaldata", "https://fiscaldata.treasury.gov/about-us/", /(open data|public domain|free)/i, "browser"],
  ["ecb", "https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html", /(reproduc|source is acknowledged|free of charge|copyright)/i, "vu"],
  ["eurostat", "https://ec.europa.eu/eurostat/about-us/policies/copyright", /(Creative Commons|CC BY|reuse|re-use)/i, "vu"],
  ["worldbank", "https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets", /(Creative Commons|CC BY|commercial)/i, "browser"],
  ["oecd", "https://www.oecd.org/en/about/terms-conditions.html", /(Creative Commons|CC BY|commercial|reuse)/i, "browser"],
  ["imf", "https://www.imf.org/en/About/copyright-and-terms", /(commercial|free of charge|permission|data)/i, "browser"],
  ["destatis", "https://www.destatis.de/DE/Service/Impressum/nutzungsbedingungen.html", /(Datenlizenz|dl-de|Namensnennung|kommerziell)/i, "browser"],
  ["bundesbank", "https://www.bundesbank.de/en/homepage/terms-of-use", /(reproduc|source|commercial|permitted)/i, "browser"],
  ["boe", "https://www.bankofengland.co.uk/legal", /(Open Government Licence|reuse|re-use|copyright)/i, "browser"],
  ["snb", "https://data.snb.ch/en/help/copyright", /(source|commercial|permitted|copyright)/i, "vu"],
  ["cftc", "https://www.cftc.gov/Disclaimers/index.htm", /(public domain|copyright|reproduc)/i, "browser"],
  ["finra", "https://www.finra.org/finra-data/terms-of-use", /(commercial|redistribut|personal|license)/i, "browser"],
  ["nasdaqtrader", "https://www.nasdaqtrader.com/Trader.aspx?id=TermsOfUse", /(redistribut|commercial|personal|license)/i, "browser"],
  ["cboe", "https://www.cboe.com/about/legal/website-terms-of-use/", /(redistribut|commercial|personal|license)/i, "browser"],
  ["lbma", "https://www.lbma.org.uk/prices-and-data/lbma-prices-terms-of-use", /(licen[cs]e|commercial|redistribut|delay)/i, "browser"],
  ["ishares", "https://www.ishares.com/us/terms-conditions", /(redistribut|commercial|personal|reproduc)/i, "browser"],
  ["ssga", "https://www.ssga.com/us/en/intermediary/terms-of-use", /(redistribut|commercial|personal|reproduc)/i, "browser"],
  ["invesco", "https://www.invesco.com/us/en/terms-of-use.html", /(redistribut|commercial|personal|reproduc)/i, "browser"],
  ["ark", "https://www.ark-funds.com/terms-of-use", /(redistribut|commercial|personal|reproduc)/i, "browser"],
  ["house-clerk", "https://disclosures-clerk.house.gov/FinancialDisclosure", /(commercial|unlawful|purpose)/i, "browser"],
  ["french", "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html", /(copyright|permission|use)/i, "browser"],
  ["coingecko", "https://www.coingecko.com/en/api_terms", /(attribution|commercial|redistribut)/i, "browser"],
  ["fmp", "https://site.financialmodelingprep.com/terms-of-service", /(redistribut|display|commercial|personal)/i, "browser"],
  ["finnhub", "https://finnhub.io/terms-of-service", /(redistribut|display|commercial|personal)/i, "browser"]
];

/* FMP-Abdeckung des vorhandenen Zugangs: je Datenprodukt ein Endpunkt.
   Festgehalten: HTTP, Zeilen, Feldnamen - nie Werte. */
const FMP = [
  ["A", "/stable/index-list"], ["A", "/stable/historical-price-eod/light?symbol=%5EGSPC&from=" + daysAgo(10)],
  ["B", "/stable/commodities-list"], ["B", "/stable/historical-price-eod/light?symbol=GCUSD&from=" + daysAgo(10)],
  ["D", "/stable/treasury-rates"], ["F", "/stable/economic-indicators?name=GDP"], ["P", "/stable/economic-calendar"],
  ["G", "/stable/income-statement?symbol=AAPL&limit=1"], ["G", "/stable/key-metrics-ttm?symbol=AAPL"], ["G", "/stable/profile?symbol=SAP"],
  ["G", "/stable/income-statement?symbol=SAP&limit=1"], ["H", "/stable/sec-filings-search/symbol?symbol=AAPL&from=" + daysAgo(60) + "&to=" + TODAY],
  ["I", "/stable/analyst-estimates?symbol=AAPL&period=annual&limit=1"], ["J", "/stable/grades?symbol=AAPL"], ["J", "/stable/grades-consensus?symbol=AAPL"],
  ["K", "/stable/price-target-consensus?symbol=AAPL"], ["L", "/stable/earnings-calendar"], ["M", "/stable/dividends-calendar"],
  ["N", "/stable/splits-calendar"], ["O", "/stable/ipos-calendar"], ["Q", "/stable/insider-trading/latest?limit=5"],
  ["R", "/stable/institutional-ownership/symbol-positions-summary?symbol=AAPL&year=2026&quarter=1"], ["S", "/stable/institutional-ownership/latest?limit=5"],
  ["T", "/stable/etf/holdings?symbol=SPY"], ["U", "/stable/sp500-constituent"], ["U", "/stable/nasdaq-constituent"], ["U", "/stable/dowjones-constituent"],
  ["V", "/stable/sector-performance-snapshot?date=" + lastWeekday(1)], ["W", "/stable/historical-sector-performance?sector=Energy"],
  ["X", "/stable/biggest-gainers"], ["X", "/stable/most-actives"], ["Y", "/stable/news/stock-latest?limit=5"], ["Y", "/stable/news/press-releases-latest?limit=5"],
  ["Z", "/stable/shares-float?symbol=AAPL"], ["AA", "/stable/shares-float-all?limit=5"], ["AB", "/stable/symbol-change"], ["AB", "/stable/delisted-companies?limit=5"],
  ["AC", "/stable/esg-disclosures?symbol=AAPL"], ["AD", "/stable/senate-latest?limit=5"], ["AE", "/stable/house-latest?limit=5"],
  ["AF", "/stable/mergers-acquisitions-latest?limit=5"], ["AH", "/stable/historical-price-eod/light?symbol=%5EVIX&from=" + daysAgo(10)],
  ["AI", "/stable/batch-commodity-quotes"], ["AJ", "/stable/forex-list"], ["AK", "/stable/cryptocurrency-list"], ["AG", "/stable/economic-indicators?name=federalFunds"]
];
const FINNHUB = [
  ["L", `/calendar/earnings?from=${TODAY}&to=${daysAhead(7)}`], ["O", `/calendar/ipo?from=${TODAY}&to=${daysAhead(30)}`],
  ["J", "/stock/recommendation?symbol=AAPL"], ["K", "/stock/price-target?symbol=AAPL"], ["I", "/stock/eps-estimate?symbol=AAPL"],
  ["Q", "/stock/insider-transactions?symbol=AAPL"], ["Y", `/company-news?symbol=AAPL&from=${daysAgo(3)}&to=${TODAY}`],
  ["P", "/calendar/economic"], ["U", "/index/constituents?symbol=%5EGSPC"], ["R", "/stock/ownership?symbol=AAPL&limit=5"]
];

/* Runde 2: korrigierte Adressen, zusaetzliche Kandidaten, Nutzungsbedingungen,
   die in Runde 1 nicht lesbar waren. */
const ROUND2 = [
  { id: "cboe-spx-history", cats: ["A"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/SPX_History.csv", note: "offizielle Cboe-Tagesdatei S&P 500 (Runde 2: Datumsabdeckung)" },
  { id: "cboe-vix-history", cats: ["A", "AH"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv" },
  { id: "cboe-rut-history", cats: ["A"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/RUT_History.csv" },
  { id: "cboe-historical-page", cats: ["A", "AH"], priority: 2, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://www.cboe.com/tradable_products/vix/vix_historical_data/", linkRe: /https?:\/\/cdn\.cboe\.com\/api\/global\/us_indices\/daily_prices\/[A-Z0-9_]+\.csv/gi },
  { id: "nasdaq-datalink-ndx-anon", cats: ["A"], priority: 2, auth: "NO_AUTH", fmt: "csv", url: "https://data.nasdaq.com/api/v3/datasets/NASDAQOMX/NDX.csv?rows=5", note: "Nasdaq Data Link, anonym" },
  { id: "nasdaq-datalink-ndx-meta", cats: ["A"], priority: 2, auth: "NO_AUTH", fmt: "json", url: "https://data.nasdaq.com/api/v3/datasets/NASDAQOMX/NDX/metadata.json" },
  { id: "treasury-fiscaldata-debt", cats: ["E", "AG"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounts/od/debt_to_penny?sort=-record_date&page%5Bsize%5D=2" },
  { id: "treasury-fiscaldata-avg-rates", cats: ["D"], priority: 1, auth: "NO_AUTH", fmt: "json", url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounts/od/avg_interest_rates?sort=-record_date&page%5Bsize%5D=2" },
  { id: "oecd-cli", cats: ["E", "F"], priority: 3, auth: "NO_AUTH", fmt: "csv", url: "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI/USA.M.LI...AA...H?lastNObservations=3&format=csvfilewithlabels" },
  { id: "oecd-dataflows", cats: ["E"], priority: 3, auth: "NO_AUTH", fmt: "xml", url: "https://sdmx.oecd.org/public/rest/dataflow/OECD.SDD.STES/DSD_STES@DF_CLI/latest" },
  { id: "destatis-genesis-logincheck", cats: ["E"], priority: 1, auth: "FREE_ACCOUNT", fmt: "json", url: "https://www-genesis.destatis.de/genesisWS/rest/2020/helloworld/logincheck?username=GAST&password=GAST&language=de" },
  { id: "eurostat-calendar-ics", cats: ["P"], priority: 1, auth: "NO_AUTH", fmt: "ics", url: "https://ec.europa.eu/eurostat/o/calendars/eventsIcal?theme=0&category=0" },
  { id: "eurostat-euro-indicators-page", cats: ["P"], priority: 1, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://ec.europa.eu/eurostat/news/release-calendar", linkRe: /[^"'\s]*(ical|\.ics)[^"'\s]*/gi },
  { id: "bls-schedule-page", cats: ["P"], priority: 1, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://www.bls.gov/schedule/news_release/", linkRe: /[^"'\s]*\.ics/gi },
  { id: "imf-pcps-copper-csv", cats: ["B"], priority: 3, auth: "NO_AUTH", fmt: "csv", url: "https://api.imf.org/external/sdmx/2.1/data/PCPS/M.W00.PCOPP.USD?startPeriod=2024-01&format=csv" },
  { id: "worldbank-pinksheet-current", cats: ["B", "C"], priority: 3, auth: "NO_AUTH", fmt: "xlsx", url: "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx" },
  { id: "sec-insider-datasets", cats: ["Q"], priority: 1, auth: "NO_AUTH", fmt: "zip", method: "HEAD", ...SEC, url: "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/2026q1_form345.zip" },
  { id: "sec-13f-dataset-latest", cats: ["R", "S"], priority: 1, auth: "NO_AUTH", fmt: "zip", method: "HEAD", ...SEC, url: "https://www.sec.gov/files/structureddata/data/form-13f-data-sets/01mar2026-31may2026_form13f.zip" },
  { id: "sec-nport-dataset-latest", cats: ["T", "S"], priority: 1, auth: "NO_AUTH", fmt: "zip", method: "HEAD", ...SEC, url: "https://www.sec.gov/files/dera/data/form-n-port-data-sets/2026q2_nport.zip" },
  { id: "sec-ftd-latest", cats: ["Z"], priority: 1, auth: "NO_AUTH", fmt: "zip", method: "HEAD", ...SEC, url: "https://www.sec.gov/files/data/fails-deliver-data/cnsfails202608b.zip" },
  { id: "sec-form4-xml-sample", cats: ["Q"], priority: 1, auth: "NO_AUTH", fmt: "json", ...SEC, url: "https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=" + daysAgo(2) + "&enddt=" + TODAY },
  { id: "finra-short-interest-files", cats: ["Z"], priority: 1, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://www.finra.org/finra-data/browse-catalog/equity-short-interest/files", linkRe: /https?:\/\/[^"'\s]*shrt[^"'\s]*\.(csv|txt|zip)/gi },
  { id: "finra-api-short-interest-recent", cats: ["Z"], priority: 1, auth: "NO_AUTH", fmt: "json", method: "POST_SI", url: "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest", accept: "application/json" },
  { id: "house-clerk-fd-index-txt", cats: ["AD", "AE"], priority: 1, auth: "NO_AUTH", fmt: "zip", url: `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${NOW.getUTCFullYear()}FD.zip`, note: "Index (TXT/XML) der Meldungen; PTR selbst als PDF" },
  { id: "house-clerk-ptr-pdf-dir", cats: ["AD", "AE"], priority: 1, auth: "NO_AUTH", fmt: "html", url: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${NOW.getUTCFullYear()}/` },
  { id: "invesco-qqq-holdings", cats: ["T", "U"], priority: 2, auth: "NO_AUTH", fmt: "csv", ua: "browser", accept: "text/csv,application/octet-stream,*/*", url: "https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=QQQ" },
  { id: "nasdaq-ndx-constituents-official-page", cats: ["U"], priority: 2, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://www.nasdaq.com/solutions/global-indexes/nasdaq-100/companies" },
  { id: "spdji-index-page-spx", cats: ["A", "U"], priority: 2, auth: "NO_AUTH", fmt: "html", ua: "browser", url: "https://www.spglobal.com/spdji/en/indices/equity/sp-500/" },
  { id: "cme-settlements", cats: ["AI"], priority: 2, auth: "NO_AUTH", fmt: "json", ua: "browser", url: "https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/437/FUT?tradeDate=&strategy=DEFAULT" },
  { id: "sec-company-facts-bulk", cats: ["G"], priority: 1, auth: "NO_AUTH", fmt: "zip", method: "HEAD", ...SEC, url: "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip" },
  { id: "sec-submissions-bulk", cats: ["H"], priority: 1, auth: "NO_AUTH", fmt: "zip", method: "HEAD", ...SEC, url: "https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip" }
];
const TERMS2 = [
  ["sec", "https://www.sec.gov/about/privacy-information", /(considered public information|may be copied|further distributed)/i, "sec"],
  ["sec-access", "https://www.sec.gov/about/webmaster-frequently-asked-questions", /(requests per second|Fair Access|declare your user agent)/i, "sec"],
  ["ecb", "https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html", /(source is acknowledged|reproduction is permitted|free of charge)/i, "vu"],
  ["ecb-data-portal", "https://data.ecb.europa.eu/help/terms-use", /(reuse|re-use|source|commercial|free)/i, "vu"],
  ["eurostat", "https://ec.europa.eu/eurostat/web/main/help/copyright-notice", /(Creative Commons|CC BY|reuse|re-use|commercial)/i, "browser"],
  ["worldbank-commodity-dataset", "https://datacatalog.worldbank.org/search/dataset/0037798", /(Creative Commons|CC[- ]BY|License)/i, "browser"],
  ["worldbank-data-terms", "https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets", /(Creative Commons Attribution|CC BY 4\.0|commercial purposes)/i, "browser"],
  ["treasury-fiscaldata-license", "https://fiscaldata.treasury.gov/about-us/#licensing", /(public domain|no restrictions|freely|licens)/i, "browser"],
  ["cftc", "https://www.cftc.gov/Disclaimers/index.htm", /(public domain|copyright|reproduc)/i, "browser"],
  ["cftc-2", "https://www.cftc.gov/Privacy/index.htm", /(public domain|copyright|reproduc)/i, "browser"],
  ["finra-data-terms", "https://www.finra.org/finra-data/about-finra-data/terms-of-use", /(commercial|redistribut|personal|license|non-commercial)/i, "browser"],
  ["finra-api-terms", "https://developer.finra.org/terms", /(commercial|redistribut|personal|license|non-commercial)/i, "browser"],
  ["cboe-legal", "https://www.cboe.com/legal/", /(redistribut|commercial|personal|license|without the prior)/i, "browser"],
  ["cboe-data-terms", "https://www.cboe.com/about/legal/terms_of_use/", /(redistribut|commercial|personal|license|without the prior)/i, "browser"],
  ["lbma", "https://www.lbma.org.uk/prices-and-data/precious-metal-prices", /(licen[cs]e|commercial|redistribut|delay|IBA)/i, "browser"],
  ["nasdaq-datalink", "https://data.nasdaq.com/terms", /(redistribut|commercial|personal|license)/i, "browser"],
  ["nasdaqtrader", "https://www.nasdaqtrader.com/Trader.aspx?id=SymbolDirDefs", /(redistribut|commercial|personal|license|terms)/i, "browser"],
  ["ishares", "https://www.ishares.com/us/terms-and-conditions", /(redistribut|commercial|personal|reproduc)/i, "browser"],
  ["invesco", "https://www.invesco.com/corporate/en/legal.html", /(redistribut|commercial|personal|reproduc)/i, "browser"],
  ["ark", "https://www.ark-funds.com/terms-and-conditions", /(redistribut|commercial|personal|reproduc)/i, "browser"],
  ["oecd", "https://www.oecd.org/en/about/terms-conditions.html", /(Creative Commons|CC BY|commercial|reuse)/i, "vu"],
  ["imf", "https://www.imf.org/en/About/copyright-and-terms", /(commercial|free of charge|permission|data)/i, "vu"],
  ["destatis", "https://www.destatis.de/DE/Service/Impressum/_inhalt.html", /(Datenlizenz|dl-de|Namensnennung|kommerziell)/i, "browser"],
  ["bundesbank-reproduction", "https://www.bundesbank.de/en/homepage/reproduction-regulations", /(reproduc|source|commercial|permitted)/i, "browser"],
  ["boe-statistics", "https://www.bankofengland.co.uk/statistics/details/further-details-about-data-terms-and-conditions", /(free of charge|reproduc|re-use|reuse|source)/i, "browser"],
  ["snb", "https://data.snb.ch/en/copyright", /(source|commercial|permitted|copyright|free)/i, "browser"],
  ["boj", "https://www.boj.or.jp/en/about/services/notice.htm", /(reproduc|source|commercial|permission|copyright)/i, "browser"],
  ["house-clerk", "https://disclosures-clerk.house.gov/FinancialDisclosure", /(commercial|unlawful|purpose|credit rating)/i, "browser"],
  ["senate-efd", "https://efdsearch.senate.gov/search/home/", /(commercial|unlawful|purpose|credit rating|agree)/i, "browser"],
  ["occ", "https://www.theocc.com/terms-of-use", /(redistribut|commercial|personal|reproduc)/i, "browser"],
  ["coingecko", "https://www.coingecko.com/en/api_terms", /(attribution|commercial|redistribut)/i, "browser"],
  ["french", "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html", /(copyright|permission|Kenneth R\. French)/i, "browser"]
];

const report = {
  schemaVersion: "1.0.0", generatedAtUtc: NOW.toISOString(),
  purpose: "Free Data Source Discovery: kostenlose, moeglichst offizielle Quellen je Capability gemessen; FMP- und Finnhub-Abdeckung des vorhandenen Zugangs als Vergleich. Keine Werte.",
  valuesIncluded: false, sources: {}, fred: {}, terms: {}, fmpBenchmark: {}, finnhubBenchmark: {}
};

function uaFor(s) { return s === "sec" ? (SEC_UA || VU_UA) : s === "browser" ? BROWSER_UA : VU_UA; }

async function run() {
  for (const s of SOURCES) {
    const r = await get(s.url, { ua: uaFor(s.ua), method: s.method || "GET", accept: s.accept || null });
    const out = { cats: s.cats, priority: s.priority, auth: s.auth, format: s.fmt, url: stripKeys(s.url), note: s.note || null, ...shape(r, s.fmt) };
    if (s.linkRe && r.text) out.officialLinks = [...new Set(r.text.match(s.linkRe) || [])].slice(0, 8);
    report.sources[s.id] = out;
    if (s.ua === "sec") await sleep(250);
  }
  for (const [sid, cat] of FRED) {
    const csv = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${sid}`);
    const page = await get(`https://fred.stlouisfed.org/series/${sid}`);
    const lic = (/"license"\s*:\s*"([^"]+)"/.exec(page.text || "") || [])[1] || null;
    const src = excerpt(page.text, /Source:/, 160);
    const rows = String(csv.text || "").split(/\r?\n/).slice(1).filter((l) => /^\d{4}-\d{2}-\d{2},[-\d.]/.test(l));
    report.fred[sid] = { cat, httpStatus: csv.status, observations: rows.length, firstDate: rows[0] ? rows[0].slice(0, 10) : null,
                         lastDate: rows.length ? rows[rows.length - 1].slice(0, 10) : null,
                         licenseClass: lic ? lic.split("#")[1] || lic : null, sourceLine: src ? src.slice(0, 160) : null };
  }
  for (const [id, url, re, ua] of TERMS) {
    const r = await get(url, { ua: uaFor(ua) });
    report.terms[id] = { url, httpStatus: r.status, finalUrl: stripKeys(r.finalUrl || "").slice(0, 200), excerpt: r.ok ? excerpt(r.text, re) : null };
    if (ua === "sec") await sleep(250);
  }
  if (FMP_KEY) {
    for (const [cat, path] of FMP) {
      const r = await get(`https://financialmodelingprep.com${path}${path.includes("?") ? "&" : "?"}apikey=${FMP_KEY}`, { accept: "application/json" });
      const j = r.json;
      report.fmpBenchmark[path.split("?")[0] + (path.includes("symbol=") ? "?" + (/symbol=([^&]+)/.exec(path) || [])[1] : "")] = {
        cat, httpStatus: r.status,
        rows: Array.isArray(j) ? j.length : j && typeof j === "object" ? Object.keys(j).length : 0,
        fieldNames: Array.isArray(j) && j[0] && typeof j[0] === "object" ? Object.keys(j[0]).slice(0, 18) : null,
        message: !Array.isArray(j) ? mask(stripKeys(String(r.text || "").replace(/\s+/g, " "))).slice(0, 160) : null };
    }
  } else report.fmpBenchmark = { result: "NOT_MEASURED_NO_KEY" };
  if (FINNHUB_KEY) {
    for (const [cat, path] of FINNHUB) {
      const r = await get(`https://finnhub.io/api/v1${path}`, { headers: { "X-Finnhub-Token": FINNHUB_KEY }, accept: "application/json" });
      const j = r.json;
      const arr = Array.isArray(j) ? j : j && typeof j === "object" ? Object.values(j).find(Array.isArray) : null;
      report.finnhubBenchmark[path.split("?")[0]] = { cat, httpStatus: r.status, rows: arr ? arr.length : 0,
        fieldNames: arr && arr[0] && typeof arr[0] === "object" ? Object.keys(arr[0]).slice(0, 18) : null,
        message: j && !Array.isArray(j) && j.error ? String(j.error).slice(0, 160) : null };
      await sleep(1100);
    }
  } else report.finnhubBenchmark = { result: "NOT_MEASURED_NO_KEY" };
}

async function runRound2() {
  /* Der Bericht aus Runde 1 bleibt; Runde 2 ueberschreibt nur, was sie misst. */
  const { readFileSync, existsSync } = await import("node:fs");
  if (process.argv.includes("--round2") && existsSync(OUT)) Object.assign(report, JSON.parse(readFileSync(OUT, "utf8")));
  report.round2AtUtc = NOW.toISOString();
  for (const s of ROUND2) {
    const r = await get(s.url, { ua: uaFor(s.ua), method: s.method || "GET", accept: s.accept || null });
    const out = { cats: s.cats, priority: s.priority, auth: s.auth, format: s.fmt, url: stripKeys(s.url), note: s.note || null, round: 2, ...shape(r, s.fmt) };
    if (s.linkRe && r.text) out.officialLinks = [...new Set(r.text.match(s.linkRe) || [])].slice(0, 8);
    report.sources[s.id] = out;
    if (s.ua === "sec") await sleep(250);
  }
  for (const [id, url, re, ua] of TERMS2) {
    const r = await get(url, { ua: uaFor(ua) });
    report.terms[id] = { url, httpStatus: r.status, finalUrl: stripKeys(r.finalUrl || "").slice(0, 200), excerpt: r.ok ? excerpt(r.text, re) : null, round: 2 };
    if (ua === "sec") await sleep(250);
  }
}

async function main() {
  /* Standard: beide Runden. --round2: nur Runde 2, in den vorhandenen Bericht. */
  try { if (!process.argv.includes("--round2")) await run(); await runRound2(); }
  catch (e) { report.error = String(e && e.message || e).slice(0, 200); }
  report.requests = requests;
  let json = JSON.stringify(report, null, 1);
  for (const k of [FMP_KEY, FINNHUB_KEY, SEC_UA]) if (k && k.length >= 6) json = json.split(k).join("[REDACTED]");
  json = json.replace(/https?:\/\/[^\s"']*/g, (u) => stripKeys(u));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json + "\n");
  console.log(`Free-Source-Sondierung: ${OUT.replace(root + "/", "")} (${requests} Anfragen)`);
  for (const [id, s] of Object.entries(report.sources)) {
    const cov = s.coverage ? `${s.coverage.firstDate}..${s.coverage.lastDate}${s.coverage.futureDates ? " +" + s.coverage.futureDates + " kuenftig" : ""}` : "";
    const form = s.table ? `${s.table.lines} Zeilen` : s.json ? JSON.stringify(s.json).slice(0, 60) : s.markup ? `${s.markup.root} items=${s.markup.items} entries=${s.markup.entries}` : s.ics ? `${s.ics.events} Termine` : "";
    console.log(`${id.padEnd(36)} ${String(s.httpStatus).padEnd(4)} ${form} ${cov}`);
  }
}
main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
