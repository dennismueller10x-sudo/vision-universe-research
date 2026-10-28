/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/split-evidence-supplements.mjs

   BELEGTE SPLITS, DIE DER ANBIETER NICHT FUEHRT - ALS KORREKTUR DER
   EINGABESPALTE, NICHT ALS ZWEITE ABLEITUNG

   Der splitFactor des Anbieters ist die Eingabe der einen Split-Bereinigung
   (ADR-002: quant/engines/return-series.js#splitFactors). Fehlt dort ein
   Split, der in den SEC-Originalen steht (PZZA, 2:1 als Aktiendividende,
   Ex-Tag 2013-12-30), springt die bereinigte Reihe um den Faktor.

   Diese Datei rechnet KEINEN Faktor. Sie traegt den belegten Split in die
   splitFactor-Spalte einer Kopie der Rohbalken ein - genau so, wie der
   Anbieter ihn haette liefern muessen -, und die Kopie geht unveraendert
   durch return-series.js#splitFactors. Kumulation, Zeitpunkt ("ab seinem
   Tag") und Rundung bleiben dort; es gibt weiter genau eine Ableitung.

   Bewusst unter scripts/market und nicht unter quant/engines: die Datei
   gehoert den Kursreihen-Herausgebern (publish-long-series.mjs,
   publish-discover-series.mjs). quant/engines/return-series.js und
   quant/engines/corporate-action-evidence.js bleiben bytegleich - beide
   sind in Code-Fingerabdruecken gebunden (Backtest-Materialisierung
   input.codes, technical-intelligence-build, Studien), deren Neuberechnung
   weit ueber PZZA hinausginge.

   Ein Eintrag (quant/config/split-evidence-supplements.json) wirkt nur, wenn
   alle drei Bedingungen halten; sonst wird er mit Grund uebersprungen:
     NO_BAR_ON_EX_DATE     kein Balken genau am Ex-Tag (oder kein Vortag)
     PROVIDER_SPLIT_NEARBY der Anbieter fuehrt innerhalb von 5 Sitzungen um
                           den Ex-Tag einen Split (doppelte Bereinigung)
     NO_RAW_JUMP           der Rohschluss am Ex-Tag zeigt den Sprung um
                           1/ratio nicht (15 % im Log) - womoeglich hat der
                           Anbieter den Rohschluss schon selbst bereinigt
   ========================================================================= */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Identity = require(join(ROOT, "core", "identity.js"));

export const SCHEMA = "split-evidence-supplements-1.0.0";
export const CONFIG_PATH = join("quant", "config", "split-evidence-supplements.json");
export const WINDOW_SESSIONS = 5;
export const RAW_JUMP_TOLERANCE = Math.log(1.15);
export const SOURCE = "SEC_FILING_SUPPLEMENT";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SEC_URL = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9_.\-]+$/;
const SECURITY_ID = /^ref_[A-Z0-9_]{1,24}$/;
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const isDate = (v) => typeof v === "string" && DATE.test(v) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const weekday = (v) => { const n = new Date(v + "T00:00:00Z").getUTCDay(); return n >= 1 && n <= 5; };

/** Vollstaendige Pruefung. securityId muss die aus core/identity.js sein (ADR-001). */
export function validate(config) {
  const errors = [];
  if (!config || config.schemaVersion !== SCHEMA) errors.push("SCHEMA_VERSION");
  if (!config || !Number.isInteger(config.version) || config.version < 1) errors.push("VERSION");
  if (!config || !Array.isArray(config.entries)) return { valid: false, errors: [...errors, "ENTRIES_MISSING"] };
  const seenId = new Set(), seenEvent = new Set();
  config.entries.forEach((e, i) => {
    const at = ":" + i;
    if (!e || typeof e !== "object") { errors.push("ENTRY_INVALID" + at); return; }
    if (typeof e.id !== "string" || !/^[A-Z0-9][A-Z0-9.\-]{3,60}$/.test(e.id)) errors.push("ID_INVALID" + at);
    else if (seenId.has(e.id)) errors.push("DUPLICATE_ID:" + e.id);
    else seenId.add(e.id);
    if (typeof e.ticker !== "string" || !/^[A-Z0-9.\-]{1,12}$/.test(e.ticker)) errors.push("TICKER_INVALID" + at);
    if (typeof e.securityId !== "string" || !SECURITY_ID.test(e.securityId)) errors.push("SECURITY_ID_INVALID" + at);
    else if (typeof e.ticker === "string" && Identity.securityIdForTicker(e.ticker) !== e.securityId) errors.push("SECURITY_ID_NOT_FROM_IDENTITY" + at);
    if (typeof e.cik !== "string" || !/^\d{10}$/.test(e.cik)) errors.push("CIK_INVALID" + at);
    if (!finite(e.ratio) || e.ratio <= 0 || e.ratio === 1) errors.push("RATIO_INVALID" + at);
    for (const k of ["recordDate", "payableDate", "exDate", "verifiedAt"]) if (!isDate(e[k])) errors.push(k.toUpperCase() + "_INVALID" + at);
    if (isDate(e.exDate) && !weekday(e.exDate)) errors.push("EX_DATE_NOT_WEEKDAY" + at);
    if (isDate(e.recordDate) && isDate(e.payableDate) && !(e.recordDate <= e.payableDate)) errors.push("RECORD_AFTER_PAYABLE" + at);
    /* Ex-Tag nach FINRA/UPC 11140(b)(2) (>= 25 %): nach dem Zahltag, hoechstens 4 Kalendertage (Wochenende + Feiertag). */
    if (isDate(e.payableDate) && isDate(e.exDate)) {
      const gap = (Date.parse(e.exDate) - Date.parse(e.payableDate)) / 864e5;
      if (!(gap >= 1 && gap <= 4)) errors.push("EX_DATE_NOT_AFTER_PAYABLE" + at);
    }
    if (isDate(e.verifiedAt) && isDate(e.exDate) && !(e.verifiedAt > e.exDate)) errors.push("VERIFIED_BEFORE_EVENT" + at);
    if (typeof e.exDateBasis !== "string" || e.exDateBasis.length < 20) errors.push("EX_DATE_BASIS_MISSING" + at);
    if (!Array.isArray(e.evidence) || !e.evidence.length) errors.push("EVIDENCE_MISSING" + at);
    else e.evidence.forEach((d, j) => {
      const dt = at + "." + j;
      if (!d || typeof d.accession !== "string" || !ACCESSION.test(d.accession)) errors.push("ACCESSION_INVALID" + dt);
      else if (typeof d.url !== "string" || !SEC_URL.test(d.url)) errors.push("URL_INVALID" + dt);
      else if (!d.url.includes("/" + d.accession.replace(/-/g, "") + "/")) errors.push("URL_NOT_OF_ACCESSION" + dt);
      else if (typeof e.cik === "string" && !d.url.includes("/edgar/data/" + String(Number(e.cik)) + "/")) errors.push("URL_NOT_OF_CIK" + dt);
      if (!d || typeof d.sha256 !== "string" || !SHA256.test(d.sha256)) errors.push("SHA256_INVALID" + dt);
      if (!d || typeof d.quote !== "string" || d.quote.length < 40) errors.push("QUOTE_MISSING" + dt);
      if (!d || !isDate(d.filed)) errors.push("FILED_INVALID" + dt);
      else if (isDate(e.verifiedAt) && d.filed > e.verifiedAt) errors.push("FILED_AFTER_VERIFICATION" + dt);
    });
    if (typeof e.securityId === "string" && isDate(e.exDate)) {
      const key = e.securityId + "|" + e.exDate;
      if (seenEvent.has(key)) errors.push("DUPLICATE_EVENT:" + key);
      seenEvent.add(key);
    }
  });
  return { valid: errors.length === 0, errors };
}

/** securityId -> Eintraege (nach Ex-Tag). Wirft bei ungueltiger Datei: eine kaputte Ergaenzung wirkt nie still. */
export function index(config) {
  const v = validate(config);
  if (!v.valid) throw new Error("SPLIT_EVIDENCE_SUPPLEMENTS_INVALID:" + v.errors.join(","));
  const map = {};
  for (const e of config.entries) (map[e.securityId] = map[e.securityId] || []).push(e);
  for (const k of Object.keys(map)) map[k].sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
  return map;
}

export function loadConfig(root = ROOT) { return JSON.parse(readFileSync(join(root, CONFIG_PATH), "utf8")); }
let DEFAULT_INDEX = null;
function defaultIndex() { return DEFAULT_INDEX || (DEFAULT_INDEX = index(loadConfig())); }

/**
 * applySupplements(bars, securityId, {index}) -> {bars, items}
 *
 * `bars`: dieselben Balken, an angewandten Ex-Tagen als Kopie mit
 * splitFactor = ratio (der Anbieter fuehrt dort per Bedingung 1); sonst
 * dasselbe Array (keine Kopie, keine Aenderung). `items`: je Eintrag dieser
 * ID Status APPLIED oder SKIPPED mit Grund - die Herkunft fuer den Herausgeber.
 */
export function applySupplements(bars, securityId, opts = {}) {
  const entries = securityId ? ((opts.index || defaultIndex())[securityId] || []) : [];
  const items = [];
  if (!entries.length || !Array.isArray(bars) || !bars.length) return { bars, items };
  const patch = new Map();
  for (const e of entries) {
    const item = { id: e.id, exDate: e.exDate, ratio: e.ratio, accession: e.evidence[0].accession, status: "SKIPPED", reason: null };
    items.push(item);
    const at = bars.findIndex((b) => String(b.date).slice(0, 10) === e.exDate);
    if (at < 1) { item.reason = "NO_BAR_ON_EX_DATE"; continue; }
    let nearby = false;
    for (let j = Math.max(0, at - WINDOW_SESSIONS); j <= Math.min(bars.length - 1, at + WINDOW_SESSIONS); j++) {
      const sf = bars[j].splitFactor;
      if (finite(sf) && sf > 0 && sf !== 1) { nearby = true; break; }
    }
    if (nearby) { item.reason = "PROVIDER_SPLIT_NEARBY"; continue; }
    const a = bars[at - 1].close, b = bars[at].close;
    if (!(finite(a) && a > 0 && finite(b) && b > 0) || Math.abs(Math.log((b / a) * e.ratio)) > RAW_JUMP_TOLERANCE) { item.reason = "NO_RAW_JUMP"; continue; }
    item.status = "APPLIED"; item.rawJump = Math.round((b / a) * 1e6) / 1e6;
    patch.set(at, e.ratio);
  }
  if (!patch.size) return { bars, items };
  return { bars: bars.map((bar, i) => (patch.has(i) ? { ...bar, splitFactor: patch.get(i) } : bar)), items };
}

/** Herkunft im Kapitalmassnahmen-Beleg der Wochenreihe: welche Eintraege in `splits` aus der SEC-Ergaenzung stammen. */
export function supplementedEntries(items) {
  return (items || []).filter((x) => x.status === "APPLIED")
    .map((x) => ({ date: x.exDate, factor: Math.round(x.ratio * 1e6) / 1e6, id: x.id, accession: x.accession, source: SOURCE }));
}
