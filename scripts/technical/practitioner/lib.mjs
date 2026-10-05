/* Practitioner Reference Benchmark — gemeinsame Bausteine (Protokoll docs/technical-intelligence/PRACTITIONER_PROTOCOL.md).

   PRACTITIONER REFERENCE ≠ OBJECTIVE GROUND TRUTH. Dieses Modul
     • laedt Referenzen (JSONL, eine Zeile = eine Fassung eines Falls) und validiert sie gegen das Schema
       practitioner-reference-1.2.0 (kleiner, handgeschriebener Validator, der die Schema-Datei SELBST interpretiert —
       damit bleiben Validator und Schema konsistent) plus fachliche Pruefungen,
     • prueft Plausibilitaet (Niveaus ±60 % um den VU-Schluss am Stichtag, Label-Syntax, Zeitrahmen vs. Wellendauer),
     • bildet Instrumente auf VU-Reihen ab (instrument-map.json),
     • erkennt Duplikate/Cross-Posts, fuehrt Revisionsketten (Original bleibt unveraendert),
     • teilt Faelle deterministisch auf (§8) und friert den Datensatz ein (§9).
   Keine npm-Abhaengigkeiten. TEST_FIXTURE-Zeilen werden nie gezaehlt; ein Freeze mit TEST_FIXTURE bricht laut ab. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeAnalysisCutoff, parsePublication, timestampConsistency, isIsoDate, localDate, MARKETS, SYMBOL_MARKET, sessionDaysBetween } from "./cutoff.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const PV1 = join(ROOT, "quant/data/technical-intelligence/practitioner-v1");
export const PATHS = Object.freeze({
  schema: join(PV1, "schema/practitioner-reference-1.2.0.json"),
  references: join(PV1, "references.jsonl"),
  instrumentMap: join(PV1, "instrument-map.json"),
  sourceRegistry: join(PV1, "source-registry.json"),
  benchmark: join(PV1, "benchmark"),
  freeze: join(PV1, "freeze")
});
export const FREEZE_VERSION = "PRACTITIONER_REFERENCE_V1";
export const TEST_SOURCE_RE = /^test-fixture-/;

export function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
let _schema = null, _map = null;
export function loadSchema() { return _schema || (_schema = readJson(PATHS.schema)); }
export function loadInstrumentMap() { return _map || (_map = readJson(PATHS.instrumentMap)); }
export function loadSourceRegistry(p = PATHS.sourceRegistry) { return existsSync(p) ? readJson(p) : { sources: [] }; }
/** Registry-Eintrag (sources als Array mit sourceId oder als Objekt). */
export function registryEntry(reg, id) {
  const s = reg && reg.sources;
  return Array.isArray(s) ? s.find((x) => x && x.sourceId === id) || null : s && s[id] ? s[id] : null;
}
export const registryHas = (reg, id) => !!registryEntry(reg, id);
/** Quellenfamilie (Red-Team H7/M3): registry.sourceFamily, sonst organisation, sonst 'hkcm' fuer jede sourceId mit 'hkcm', sonst sourceId.
    hkcm und phantom-hkcm sind EINE Familie – fuer Unabhaengigkeit (Mensch–Mensch), Cluster, Holdout-Quelle und Quellenzahl. */
export function sourceFamily(sourceId, reg = null) {
  const e = reg ? registryEntry(reg, sourceId) : null;
  if (e && e.sourceFamily) return String(e.sourceFamily);
  if (e && e.organisation && e.organisation !== "—") return "org:" + String(e.organisation).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return /hkcm/i.test(String(sourceId)) ? "hkcm" : String(sourceId);
}
export function registryTier(reg, id) { const e = registryEntry(reg, id); const t = e && (e.benchmarkTier || e.tier); return t ? String(t).trim().split(/\s/)[0] : null; }

// ------------------------------------------------------------------ JSONL
/** JSONL lesen; leere Zeilen und Zeilen mit '//' werden ignoriert, Parse-Fehler mit Zeilennummer gesammelt (nicht verschluckt). */
export function parseJsonl(text) {
  const rows = [], errors = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("//")) return;
    try {
      const o = JSON.parse(t);
      if (!o || typeof o !== "object" || Array.isArray(o)) errors.push({ line: i + 1, error: "Zeile ist kein JSON-Objekt" });
      else rows.push(Object.assign(o, { __line: i + 1 }));
    } catch (e) { errors.push({ line: i + 1, error: "JSON-Fehler: " + e.message }); }
  });
  return { rows, errors };
}
export function loadReferences(p = PATHS.references) { return existsSync(p) ? parseJsonl(readFileSync(p, "utf8")) : { rows: [], errors: [] }; }
export function stripInternal(r) { const o = Object.assign({}, r); delete o.__line; return o; }

// ------------------------------------------------------------------ Schema-Validator (interpretiert die Schema-Datei)
const typeOk = (t, v) => t === "null" ? v === null : t === "string" ? typeof v === "string" : t === "integer" ? Number.isInteger(v)
  : t === "number" ? typeof v === "number" && Number.isFinite(v) : t === "boolean" ? typeof v === "boolean"
  : t === "array" ? Array.isArray(v) : t === "object" ? v !== null && typeof v === "object" && !Array.isArray(v) : false;
function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error("nur lokale $ref: " + ref);
  return ref.slice(2).split("/").reduce((o, k) => o[k], root);
}
/* Strikter Modus (Standard, Red-Team M5): jedes Objekt mit `properties` ist geschlossen (auch verschachtelte, fuer die das Schema
   additionalProperties nicht setzt) – erlaubt sind nur Schemafelder plus die dokumentierten Pipeline-Erweiterungen
   (SCHEMA_EXTENSIONS). Strings ohne maxLength im Schema werden begrenzt: URLs 2048, sonst 400 Zeichen (keine Transkripte/Volltexte). */
export const STRING_CAP = 400, URI_CAP = 2048;
export const SCHEMA_EXTENSIONS = Object.freeze({
  /* C1: Bewegung NACH Abschluss der laufenden Welle. directionalBias = laufende/naechste Bewegung ab jetzt (= laufende Welle).
     Formal gehoert das Feld ins Schema (1.1); bis dahin nimmt der Validator es als einzige zulaessige Zusatzangabe in `primary` an. */
  "$.primary": { nextMoveAfterCurrent: { enum: ["UP", "DOWN", "SIDEWAYS", "UNKNOWN"] } }
});
export function validateSchema(value, schema = loadSchema(), root = schema, path = "$", errors = [], strict = true) {
  if (schema.$ref) return validateSchema(value, resolveRef(root, schema.$ref), root, path, errors, strict);
  if (value === undefined) return errors;
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(t, value))) { errors.push({ path, error: `Typ ${JSON.stringify(schema.type)} erwartet, erhalten ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}` }); return errors; }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push({ path, error: `Wert ${JSON.stringify(value)} nicht in ${JSON.stringify(schema.enum)}` });
  if (typeOk("object", value)) {
    for (const k of schema.required || []) if (value[k] === undefined) errors.push({ path: path + "." + k, error: "Pflichtfeld fehlt" });
    const props = schema.properties || {}, ext = (strict && SCHEMA_EXTENSIONS[path]) || {};
    const closed = schema.additionalProperties === false || (strict && schema.properties);
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("__") && path === "$") continue;   // interne Lade-Metadaten
      if (props[k]) validateSchema(v, props[k], root, path + "." + k, errors, strict);
      else if (ext[k]) validateSchema(v, ext[k], root, path + "." + k, errors, strict);
      else if (closed) errors.push({ path: path + "." + k, error: "Feld im Schema nicht erlaubt" });
    }
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) errors.push({ path, error: `mindestens ${schema.minItems} Eintraege` });
    if (schema.items) value.forEach((v, i) => validateSchema(v, schema.items, root, `${path}[${i}]`, errors, strict));
    else if (strict) value.forEach((v, i) => { if (typeof v === "string" && [...v].length > STRING_CAP) errors.push({ path: `${path}[${i}]`, error: `laenger als ${STRING_CAP} Zeichen` }); });
  }
  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push({ path, error: `entspricht nicht ${schema.pattern}` });
    const cap = Number.isInteger(schema.maxLength) ? schema.maxLength : strict ? (schema.format === "uri" ? URI_CAP : STRING_CAP) : null;
    if (cap !== null && [...value].length > cap) errors.push({ path, error: `laenger als ${cap} Zeichen` });
    if (schema.format === "uri" && !isHttpUrl(value)) errors.push({ path, error: "keine gueltige http(s)-URL" });
  }
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) errors.push({ path, error: `kleiner als ${schema.minimum}` });
  return errors;
}
export function isHttpUrl(s) { try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } }
export function isTestFixtureLike(r) {
  if (!r || typeof r !== "object") return false;
  if (r.status === "TEST_FIXTURE" || TEST_SOURCE_RE.test(String(r.sourceId || ""))) return true;
  try { return new URL(r.sourceUrl).hostname.endsWith(".invalid"); } catch { return false; }
}

// ------------------------------------------------------------------ Wellenlabels
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
const DEGREE_WORDS = ["grand supercycle", "supercycle", "cycle", "primary", "intermediate", "minor", "minute", "minuette", "subminuette", "submicro", "micro"];
/* Normalisierter Grad (README-Tabelle): −2 Subminuette, −1 Minuette, 0 Minute, 1 Minor, 2 Intermediate, 3 Primary, 4 Cycle, 5 Supercycle. */
export const DEGREE_RANK_BY_WORD = { subminuette: -2, minuette: -1, minute: 0, minor: 1, intermediate: 2, primary: 3, cycle: 4, supercycle: 5 };
export const DEGREE_RANK_MIN = -2, DEGREE_RANK_MAX = 5;
const LABEL_CORE = /^(i{1,3}|iv|v|[1-5]|[a-e]|[wxyz]|x2)$/i;
function bracketsBalanced(s) {
  const pairs = { "(": ")", "[": "]", "{": "}", "<": ">" }, st = [];
  for (const ch of s) { if (pairs[ch]) st.push(pairs[ch]); else if (")]}>".includes(ch)) { if (st.pop() !== ch) return false; } }
  return st.length === 0;
}
/** Syntaxpruefung eines Wellenlabels wie gezeigt, z. B. '3', '(iii)', '[C]', '((v))', 'Primary 4', 'Minor (B)'. */
export function labelSyntaxOk(label) {
  if (label === null || label === undefined) return true;
  let s = String(label).trim();
  if (!s || !bracketsBalanced(s)) return false;
  const low = s.toLowerCase();
  for (const w of DEGREE_WORDS) if (low.startsWith(w + " ")) { s = s.slice(w.length).trim(); break; }
  return LABEL_CORE.test(s.replace(/[()[\]{}<>\s]/g, ""));
}
/** Normalform: Klammern/Gradwort weg, roemisch → arabisch, Buchstaben gross. '(iii)'→'3', '[c]'→'C', 'Primary 4'→'4'. */
export function normalizeWaveLabel(label) {
  if (label === null || label === undefined) return null;
  let s = String(label).trim().toLowerCase();
  for (const w of DEGREE_WORDS) if (s.startsWith(w + " ")) { s = s.slice(w.length).trim(); break; }
  s = s.replace(/[()[\]{}<>\s₂]/g, "");
  if (!s) return null;
  if (ROMAN[s]) return String(ROMAN[s]);
  if (/^[1-5]$/.test(s)) return s;
  if (s === "x2") return "X";
  if (/^[a-ewxyz]$/.test(s)) return s.toUpperCase();
  return null;
}
export const PATTERN_FAMILY = { IMPULSE: "MOTIVE", LEADING_DIAGONAL: "MOTIVE", ENDING_DIAGONAL: "MOTIVE", ZIGZAG: "CORRECTIVE", FLAT: "CORRECTIVE",
  TRIANGLE: "CORRECTIVE", WXY: "CORRECTIVE", DOUBLE_ZIGZAG: "CORRECTIVE", TRIPLE_ZIGZAG: "CORRECTIVE", COMBINATION: "CORRECTIVE" };
export const PATTERN_LABELS = { IMPULSE: ["1", "2", "3", "4", "5"], LEADING_DIAGONAL: ["1", "2", "3", "4", "5"], ENDING_DIAGONAL: ["1", "2", "3", "4", "5"],
  ZIGZAG: ["A", "B", "C"], FLAT: ["A", "B", "C"], TRIANGLE: ["A", "B", "C", "D", "E"], WXY: ["W", "X", "Y"], DOUBLE_ZIGZAG: ["W", "X", "Y", "A", "B", "C"],
  TRIPLE_ZIGZAG: ["W", "X", "Y", "Z"], COMBINATION: ["W", "X", "Y", "Z"] };
/** Rolle einer laufenden Welle wie in VU (V2.currentRole): MOTIVE = Welle unterteilt sich motivisch (5), CORRECTIVE = Korrektur (3).
    Impuls/Diagonale: 1/3/5 motivisch; Zigzag A/C motivisch; Flat nur C; Dreieck/WXY/Triple/Kombination korrektiv. */
export function roleOfLabel(norm, pattern) {
  if (!norm) return "UNKNOWN";
  if (["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL"].includes(pattern)) return ["1", "3", "5"].includes(norm) ? "MOTIVE" : ["2", "4"].includes(norm) ? "CORRECTIVE" : "UNKNOWN";
  if (pattern === "ZIGZAG" || pattern === "DOUBLE_ZIGZAG") return ["A", "C"].includes(norm) ? "MOTIVE" : "CORRECTIVE";
  if (pattern === "FLAT") return norm === "C" ? "MOTIVE" : "CORRECTIVE";
  if (["TRIANGLE", "WXY", "TRIPLE_ZIGZAG", "COMBINATION"].includes(pattern)) return "CORRECTIVE";
  if (["1", "3", "5"].includes(norm)) return "MOTIVE";
  if (["2", "4", "B", "D", "E", "W", "X", "Y", "Z"].includes(norm)) return "CORRECTIVE";
  return "UNKNOWN";   // A/C ohne Muster: Zigzag (motivisch) oder Flat (korrektiv)
}

/** Rolle der laufenden Bewegung bei VU: bei abgeschlossenem Muster die Rolle der naechsten Welle des hoeheren Grades, sonst
    Gegenrolle der Musterfamilie (nach Motiv → Korrektur, nach Korrektur → Motiv). Als "inferred" zu verstehen. */
export function vuEffectiveRole(count, higher) {
  if (!count) return "UNKNOWN";
  if (!count.complete) return count.currentWave && count.currentWave.role || "UNKNOWN";
  if (higher && higher.nextLabel) { const r = roleOfLabel(higher.nextLabel, higher.pattern); if (r !== "UNKNOWN") return r; }
  return count.family === "MOTIVE" ? "CORRECTIVE" : count.family === "CORRECTIVE" ? "MOTIVE" : "UNKNOWN";
}

// ------------------------------------------------------------------ Grad-Heuristik (NAEHERUNG)
/* VU kennt keinen absoluten Elliott-Grad (nur relative Ebenen). Abbildung auf degreeRank −1..5 ueber die MEDIANE DAUER der
   bestaetigten Wellen der Hauptzaehlung (Kalendertage), angelehnt an die ueblichen Groessenordnungen nach Frost & Prechter:
     < 3 T → −1 Minuette   3–14 T → 0 Minute   14–60 T → 1 Minor   60–180 T → 2 Intermediate
     180–730 T → 3 Primary   730–3650 T → 4 Cycle   ≥ 3650 T → 5 Supercycle
   NAEHERUNG: Grade sind praktikerabhaengig; D/E nur, wenn beide Raenge bekannt sind, E (±1) ist die belastbarere Kennzahl. */
export const DEGREE_THRESHOLDS_DAYS = [3, 14, 60, 180, 730, 3650];
export function degreeRankFromDays(days) {
  if (!Number.isFinite(days) || days <= 0) return null;
  let r = -1; for (const t of DEGREE_THRESHOLDS_DAYS) if (days >= t) r++;
  return r;
}
export const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

// ------------------------------------------------------------------ Instrumentabbildung
export const normSym = (s) => String(s || "").toUpperCase().replace(/Ö/g, "OE").replace(/[^A-Z0-9]/g, "");
/** Default-Abbildung aus instrument-map.json; {vuSymbol:null, mappingQuality:'UNMAPPED'} wenn nichts passt. */
export function resolveInstrument(instr, map = loadInstrumentMap(), opts = {}) {
  const a = normSym(instr && instr.asShown), type = (instr && instr.instrumentType) || "UNKNOWN";
  for (const e of map.entries) {
    if (!e.instrumentTypes.includes(type)) continue;
    if (e.aliases.some((x) => normSym(x) === a)) {
      return { mapId: e.id, vuSymbol: e.vuSymbol, seriesSource: e.seriesSource, market: marketOfSymbol(e.vuSymbol, map) || e.market, mappingQuality: e.mappingQuality, levelScale: e.levelScale, note: e.note };
    }
  }
  const rule = map.usStockRule;
  if (rule && rule.instrumentTypes.includes(type) && /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(instr.asShown || "").trim().toUpperCase())) {
    /* Aktienklassen: VU fuehrt "BRK.B" ohne Trennzeichen (ref_BRKB) */
    const has = (x) => (opts.stockExists ? opts.stockExists(x) : existsSync(join(ROOT, "quant/data/market/discover-series-long", "ref_" + x + ".json")));
    const raw = String(instr.asShown).trim().toUpperCase(), bare = raw.replace(/[.\-\/]/g, "");
    const t = has(raw) || bare === raw || !has(bare) ? raw : bare;
    const exists = has(t);
    if (exists) {
      const q = instr.priceAdjustment === "TOTAL_RETURN" ? "PROXY_SAME_UNDERLYING" : "EXACT";
      return { mapId: "us-stock", vuSymbol: t, seriesSource: rule.seriesSource, market: rule.market, mappingQuality: q, levelScale: null, note: rule.priceAdjustmentNote };
    }
  }
  return { mapId: null, vuSymbol: null, seriesSource: null, market: guessMarket(type), mappingQuality: "UNMAPPED", levelScale: null, note: "keine VU-Reihe" };
}
function guessMarket(type) { return type === "CRYPTO_SPOT" ? "CRYPTO" : type === "FX" || type === "COMMODITY_SPOT" ? "FX_METALS_UTC" : "US_EQUITY"; }
/** Markt (Bar-Schlusszeit) einer VU-Reihe: instrument-map seriesMarkets, sonst SYMBOL_MARKET der Stichtagsregel. */
export function marketOfSymbol(vuSymbol, map = loadInstrumentMap()) {
  if (!vuSymbol) return null;
  const e = map.seriesMarkets && map.seriesMarkets.symbols && map.seriesMarkets.symbols[vuSymbol];
  return (e && e.market) || SYMBOL_MARKET[vuSymbol] || null;
}
/**
 * Wirksame Abbildung einer Referenz: Reihe/Markt aus der Karte; mappingQuality/levelScale aus der Referenz, falls dort
 * gesetzt (Mensch hat den Chart gesehen), sonst aus der Karte. EXACT → Skala 1. Proxy ohne Skala → Niveaus nicht vergleichbar.
 */
export function effectiveMapping(ref, map = loadInstrumentMap(), opts = {}) {
  const d = resolveInstrument(ref.instrument || {}, map, opts);
  const i = ref.instrument || {};
  const quality = i.mappingQuality === "UNMAPPED" || d.mappingQuality === "UNMAPPED" ? "UNMAPPED" : (i.mappingQuality || d.mappingQuality);
  const scale = quality === "EXACT" ? (Number.isFinite(i.levelScale) ? i.levelScale : 1) : Number.isFinite(i.levelScale) ? i.levelScale : d.levelScale;
  return { vuSymbol: quality === "UNMAPPED" ? null : d.vuSymbol, seriesSource: quality === "UNMAPPED" ? null : d.seriesSource, market: d.market, mappingQuality: quality,
           levelScale: Number.isFinite(scale) ? scale : null, levelsComparable: quality !== "UNMAPPED" && Number.isFinite(scale), mapId: d.mapId, mapDefault: d };
}

// ------------------------------------------------------------------ Fachliche Validierung
/**
 * Schema + Fachregeln. Fehler (errors) blockieren Einschluss/Freeze; Hinweise (warnings) werden berichtet.
 * opts.registry: source-registry; opts.map: instrument-map; opts.stockExists.
 */
export function validateReference(ref, opts = {}) {
  const errors = validateSchema(stripInternal(ref), opts.schema || loadSchema()).map((e) => `${e.path}: ${e.error}`), warnings = [];
  if (!ref || typeof ref !== "object") return { errors: ["kein Objekt"], warnings };
  // Testdaten nie mit echten Kennungen mischen
  const testSrc = TEST_SOURCE_RE.test(String(ref.sourceId || ""));
  if (ref.status === "TEST_FIXTURE" && !testSrc) errors.push("TEST_FIXTURE erfordert sourceId 'test-fixture-*'");
  if (testSrc && ref.status !== "TEST_FIXTURE") errors.push("sourceId 'test-fixture-*' nur mit status TEST_FIXTURE");
  if (ref.status === "TEST_FIXTURE") { try { if (!new URL(ref.sourceUrl).hostname.endsWith(".invalid")) errors.push("TEST_FIXTURE erfordert eine .invalid-URL"); } catch { /* Schema meldet */ } }
  // Zeit
  let market = null;
  try {
    const m = effectiveMapping(ref, opts.map, opts);
    market = m.market;
    const tc = timestampConsistency(ref.publication);
    if (tc) errors.push("publication: " + tc);
    if (!isIsoDate(ref.analysisCutoff)) errors.push("analysisCutoff ist kein Datum YYYY-MM-DD");
    else {
      const c = computeAnalysisCutoff(ref.publication, market);
      if (ref.analysisCutoff !== c.analysisCutoff) errors.push(`analysisCutoff ${ref.analysisCutoff} ≠ berechnet ${c.analysisCutoff} (${c.rule}) — nie von Hand setzen`);
    }
    // Abbildung gegen Karte
    const i = ref.instrument || {};
    if (i.mappingQuality === "UNMAPPED" && i.vuSymbol !== null) errors.push("instrument: UNMAPPED erfordert vuSymbol null");
    if (i.mappingQuality && i.mappingQuality !== "UNMAPPED" && !i.vuSymbol) errors.push("instrument: vuSymbol fehlt trotz Abbildung " + i.mappingQuality);
    if (i.vuSymbol && m.mapDefault.vuSymbol && i.vuSymbol !== m.mapDefault.vuSymbol) errors.push(`instrument.vuSymbol ${i.vuSymbol} ≠ Karte ${m.mapDefault.vuSymbol}`);
    if (i.vuSymbol && !m.mapDefault.vuSymbol) errors.push(`instrument.vuSymbol ${i.vuSymbol}, aber keine Abbildung in instrument-map.json fuer '${i.asShown}' (${i.instrumentType})`);
    if (i.mappingQuality && m.mapDefault.mappingQuality !== i.mappingQuality) warnings.push(`mappingQuality ${i.mappingQuality} weicht von der Karte (${m.mapDefault.mappingQuality}) ab`);
    if (i.mappingQuality === "EXACT" && Number.isFinite(i.levelScale) && i.levelScale !== 1) warnings.push("EXACT mit levelScale ≠ 1 (z. B. spaeterer Split) – bitte in ambiguities begruenden");
  } catch (e) { errors.push("publication/cutoff: " + e.message); }
  // Revision
  if (ref.viewKind === "LATER_REVISION" && !ref.revisionOf) errors.push("LATER_REVISION erfordert revisionOf");
  if ((ref.viewKind === "ORIGINAL_PUBLISHED" || ref.viewKind === undefined) && ref.revisionOf) errors.push("revisionOf gesetzt, aber viewKind nicht LATER_REVISION");
  if (ref.version > 1 && !ref.revisionOf) errors.push("version > 1 erfordert revisionOf");
  if (ref.status === "EXCLUDED" && !ref.exclusionReason) errors.push("EXCLUDED erfordert exclusionReason");
  // Inhalt (§2.3): mindestens Zaehlung, Muster, Invalidation oder Zielzone
  const p = ref.primary || null;
  const hasContent = (p && (p.pattern && p.pattern !== "UNKNOWN" || p.currentWave)) || ref.invalidation || (ref.targetZones || []).length;
  if (!hasContent && ref.status === "INCLUDED") errors.push("§2.3: weder Zaehlung/Muster noch Invalidation noch Zielzone");
  if (p) {
    if (p.pattern && PATTERN_FAMILY[p.pattern] && p.family && p.family !== "UNKNOWN" && p.family !== PATTERN_FAMILY[p.pattern]) errors.push(`primary.family ${p.family} widerspricht Muster ${p.pattern}`);
    if (!labelSyntaxOk(p.currentWave)) errors.push(`primary.currentWave '${p.currentWave}' hat keine gueltige Label-Syntax`);
    if (p.degreeLabel && !labelSyntaxOk(p.degreeLabel) && !DEGREE_WORDS.some((w) => String(p.degreeLabel).toLowerCase().startsWith(w))) warnings.push(`primary.degreeLabel '${p.degreeLabel}' unuebliche Notation`);
    if (p.degreeRank !== null && p.degreeRank !== undefined && (p.degreeRank < DEGREE_RANK_MIN || p.degreeRank > DEGREE_RANK_MAX)) errors.push(`primary.degreeRank ausserhalb ${DEGREE_RANK_MIN}..${DEGREE_RANK_MAX}`);
    const n = normalizeWaveLabel(p.currentWave);
    if (n && PATTERN_LABELS[p.pattern] && !PATTERN_LABELS[p.pattern].includes(n)) warnings.push(`Label '${p.currentWave}' passt nicht zu Muster ${p.pattern}`);
    const r = roleOfLabel(n, p.pattern);
    if (r !== "UNKNOWN" && p.currentWaveRole && p.currentWaveRole !== "UNKNOWN" && p.currentWaveRole !== r) warnings.push(`currentWaveRole ${p.currentWaveRole} ungewoehnlich fuer Welle '${p.currentWave}' (${r})`);
    if (p.waveStartDate && !isIsoDate(p.waveStartDate)) errors.push("primary.waveStartDate ist kein Datum");
    if (p.waveStartDate && isIsoDate(ref.analysisCutoff) && p.waveStartDate > ref.analysisCutoff) errors.push("primary.waveStartDate liegt nach dem Stichtag");
  }
  for (const k of ["keySupportZones", "entryZones", "targetZones"]) for (const z of ref[k] || []) if (z && z.low > z.high) errors.push(`${k}: low > high`);
  if (ref.invalidation && !(ref.invalidation.direction === "below" || ref.invalidation.direction === "above")) errors.push("invalidation.direction fehlt");
  if (ref.invalidation && ref.directionalBias === "UP" && ref.invalidation.direction === "above") warnings.push("Bias UP mit Invalidation 'above' – pruefen");
  if (ref.invalidation && ref.directionalBias === "DOWN" && ref.invalidation.direction === "below") warnings.push("Bias DOWN mit Invalidation 'below' – pruefen");
  if (opts.registry && ref.status !== "TEST_FIXTURE" && !registryHas(opts.registry, ref.sourceId)) errors.push(`sourceId '${ref.sourceId}' fehlt in source-registry.json`);
  if (opts.registry && registryTier(opts.registry, ref.sourceId) === "REJECT" && ref.status === "INCLUDED") errors.push(`Quelle '${ref.sourceId}' ist REJECT`);
  return { errors, warnings };
}

/**
 * Plausibilitaet gegen die VU-Reihe am Stichtag (§7): jedes Niveau (skaliert) innerhalb ±60 % des VU-Schlusses;
 * Zeitrahmen vs. Wellendauer (wo bekannt); Grad vs. Dauer (Hinweis).
 */
export function plausibilityChecks(ref, { closeAtCutoff, levelScale }) {
  const errors = [], warnings = [];
  const lv = [];
  const push = (name, v) => { if (Number.isFinite(v)) lv.push([name, v]); };
  if (ref.invalidation) push("invalidation.price", ref.invalidation.price);
  for (const k of ["keySupportZones", "entryZones", "targetZones"]) (ref[k] || []).forEach((z, i) => { push(`${k}[${i}].low`, z.low); push(`${k}[${i}].high`, z.high); });
  (ref.alternatives || []).forEach((a, i) => push(`alternatives[${i}].trigger`, a.trigger));
  if (ref.primary) push("primary.waveStartPrice", ref.primary.waveStartPrice);
  if (Number.isFinite(levelScale) && Number.isFinite(closeAtCutoff) && closeAtCutoff > 0) {
    /* Nachtrag 4: Zonen/Trigger je Zeitrahmen (1D ±60 %, 1W/1M −90 %…+400 %); Invalidation und Wellenstart liegen an
       vergangenen Wendepunkten (z. B. Welle-II-Tief) und duerfen weiter entfernt sein: Faktor 10 (1D) bzw. 100 (1W/1M). */
    const long = ref.timeframe === "1W" || ref.timeframe === "1M";
    const anchor = (n) => n === "invalidation.price" || n === "primary.waveStartPrice";
    for (const [name, v] of lv) {
      const x = v * levelScale / closeAtCutoff, rel = x - 1;
      if (anchor(name)) {
        const f = long ? 100 : 10;
        if (!(x > 0) || x > f || x < 1 / f) errors.push(`${name}=${v} (skaliert ${round(v * levelScale, 4)}) liegt ${round(rel * 100, 1)} % vom VU-Schluss ${closeAtCutoff} am Stichtag (> Faktor ${f}, Nachtrag 4)`);
      } else if (long ? (rel < -0.9 || rel > 4) : Math.abs(rel) > 0.6) errors.push(`${name}=${v} (skaliert ${round(v * levelScale, 4)}) liegt ${round(rel * 100, 1)} % vom VU-Schluss ${closeAtCutoff} am Stichtag (> ${long ? "−90 %/+400 %" : "±60 %"})`);
    }
  } else if (lv.length) warnings.push("Niveaus nicht pruefbar (Proxy ohne levelScale oder kein Schluss)");
  const p = ref.primary;
  if (p && p.waveStartDate && isIsoDate(ref.analysisCutoff)) {
    const days = daysBetween(p.waveStartDate, ref.analysisCutoff);
    if (ref.timeframe === "1D" && days > 3 * 365) warnings.push(`Tageschart, laufende Welle aber ${days} Tage alt`);
    if (ref.timeframe === "1W" && days < 21) warnings.push(`Wochenchart, laufende Welle erst ${days} Tage alt`);
    if (ref.timeframe === "1M" && days < 90) warnings.push(`Monatschart, laufende Welle erst ${days} Tage alt`);
    const est = degreeRankFromDays(days);
    if (Number.isInteger(p.degreeRank) && est !== null && Math.abs(est - p.degreeRank) > 2) warnings.push(`degreeRank ${p.degreeRank} passt kaum zur Dauer der laufenden Welle (${days} T ≈ Rang ${est})`);
  }
  return { errors, warnings };
}

// ------------------------------------------------------------------ Fallidentitaet, Duplikate, Revisionen
export function publicationLocalDate(ref) { return localDate(parsePublication(ref.publication).instantMs, ref.publication.timezone); }
export function instrumentKey(ref) { const i = ref.instrument || {}; return i.vuSymbol || "UNMAPPED:" + normSym(i.asShown); }
/** caseId = sourceId|vuSymbol (oder UNMAPPED:asShown)|Veroeffentlichungsdatum des ORIGINALS (lokal)|Szenario-Nr. */
export function buildCaseId(ref, root = ref, scenario = 1) { return `${ref.sourceId}|${instrumentKey(ref)}|${publicationLocalDate(root)}|${scenario}`; }

/** Revisionsketten: Wurzel → Fassungen. Prueft Verweise, Quelle/Instrument, Versionsfolge, Zeitfolge, keine Ueberschreibung. */
export function revisionChains(refs) {
  const byId = new Map(), errors = [];
  for (const r of refs) {
    if (byId.has(r.referenceId)) {
      const same = canonicalJson(stripInternal(byId.get(r.referenceId))) === canonicalJson(stripInternal(r));
      errors.push(same ? `referenceId ${r.referenceId} doppelt (identische Zeile)` : `referenceId ${r.referenceId} mehrfach mit anderem Inhalt – Ueberschreiben verboten, Revision als neue Zeile mit revisionOf anlegen`);
      continue;
    }
    byId.set(r.referenceId, r);
  }
  const rootOf = new Map();
  const findRoot = (r) => {
    const seen = new Set(); let cur = r;
    while (cur.revisionOf) {
      if (seen.has(cur.referenceId)) { errors.push(`Revisionszyklus bei ${r.referenceId}`); return null; }
      seen.add(cur.referenceId);
      const parent = byId.get(cur.revisionOf);
      if (!parent) { errors.push(`${cur.referenceId}: revisionOf ${cur.revisionOf} existiert nicht`); return null; }
      if (parent.sourceId !== cur.sourceId) errors.push(`${cur.referenceId}: Revision einer anderen Quelle (${parent.sourceId})`);
      if (instrumentKey(parent) !== instrumentKey(cur)) errors.push(`${cur.referenceId}: Revision eines anderen Instruments`);
      if (Number.isInteger(parent.version) && cur.version !== parent.version + 1) errors.push(`${cur.referenceId}: version ${cur.version} ≠ Vorfassung+1 (${parent.version + 1})`);
      try { if (parsePublication(cur.publication).instantMs <= parsePublication(parent.publication).instantMs) errors.push(`${cur.referenceId}: Revision nicht nach der Vorfassung veroeffentlicht`); } catch { /* Validierung meldet */ }
      cur = parent;
    }
    return cur;
  };
  const chains = new Map();
  for (const r of byId.values()) {
    const root = findRoot(r); if (!root) continue;
    rootOf.set(r.referenceId, root.referenceId);
    if (!chains.has(root.referenceId)) chains.set(root.referenceId, []);
    chains.get(root.referenceId).push(r);
  }
  for (const [rid, list] of chains) {
    list.sort((a, b) => (a.version || 1) - (b.version || 1));
    const root = byId.get(rid);
    if (root.viewKind === "LATER_REVISION") errors.push(`${rid}: Kettenanfang ist LATER_REVISION`);
    const cids = new Set(list.map((x) => x.caseId));
    if (cids.size > 1) errors.push(`Kette ${rid}: Fassungen mit verschiedenen caseIds (${[...cids].join(", ")})`);
  }
  return { chains, rootOf, byId, errors };
}
/** Original- und juengste Sicht einer Kette (optional nur Fassungen bis asOf). Das Original wird nie ersetzt. */
export function chainViews(chain, asOfMs = Infinity) {
  const vis = chain.filter((r) => { try { return parsePublication(r.publication).instantMs <= asOfMs; } catch { return false; } });
  return { original: chain[0], latest: vis.length ? vis[vis.length - 1] : chain[0], revisions: chain.length - 1 };
}
/** Anfuegen statt Ueberschreiben: neue Zeilen duerfen keine bestehende referenceId veraendern. */
export function appendReferences(existing, incoming) {
  const ids = new Map(existing.map((r) => [r.referenceId, canonicalJson(stripInternal(r))]));
  const out = existing.slice();
  for (const r of incoming) {
    if (ids.has(r.referenceId)) {
      if (ids.get(r.referenceId) !== canonicalJson(stripInternal(r))) throw new Error(`Ueberschreiben verboten: ${r.referenceId} existiert mit anderem Inhalt – Revision als neue Zeile (revisionOf) anlegen`);
      continue;
    }
    out.push(r); ids.set(r.referenceId, canonicalJson(stripInternal(r)));
  }
  return out;
}

/**
 * Duplikate / Cross-Posts (§7): gleiche Quelle + gleiches Instrument + Veroeffentlichung innerhalb von 2 Tagen + gleiche Richtung
 * + gleiche Primaerzaehlung (Muster + normalisierte laufende Welle) → ein Fall; ebenso gleiche URL (auch als crossPost).
 * Original = frueheste Veroeffentlichung (Gleichstand: ORIGINAL_PUBLISHED, dann referenceId). Fassungen derselben
 * Revisionskette sind keine Duplikate.
 */
export function detectDuplicates(refs, windowDays = 2) {
  const { rootOf } = revisionChains(refs);
  /* Minutengenau (Nachtrag 9 d): Neuextraktionen speichern Zeitpunkte oft ohne Sekunden; sonst gaelte die eingefrorene Zeile als Duplikat */
  const pubMin = (r) => Math.floor(pubMs(r) / 60000);
  const sorted = refs.slice().sort((a, b) => pubMin(a) - pubMin(b) || (a.viewKind === "LATER_REVISION") - (b.viewKind === "LATER_REVISION") || String(a.referenceId).localeCompare(String(b.referenceId)));
  const urlsOf = (r) => new Set([r.sourceUrl, ...(r.crossPosts || [])].filter(Boolean).map(normUrl));
  const primKey = (r) => `${(r.primary && r.primary.pattern) || "-"}|${normalizeWaveLabel(r.primary && r.primary.currentWave) || "-"}`;
  const dupOf = new Map(), pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (dupOf.has(b.referenceId)) continue;
    for (let j = 0; j < i; j++) {
      const a = sorted[j];
      if (dupOf.has(a.referenceId)) continue;
      if (rootOf.get(a.referenceId) && rootOf.get(a.referenceId) === rootOf.get(b.referenceId)) continue;
      const ua = urlsOf(a), sharedUrl = [...urlsOf(b)].some((u) => ua.has(u));
      let reason = null;
      if (sharedUrl) reason = "SAME_URL";
      else if (a.sourceId === b.sourceId && instrumentKey(a) === instrumentKey(b) && Math.abs(pubMs(b) - pubMs(a)) <= windowDays * 86400000
               && a.directionalBias === b.directionalBias && primKey(a) === primKey(b)) reason = a.sourceType !== b.sourceType ? "CROSS_POST" : "REPOST_SAME_ANALYSIS";
      if (reason) { dupOf.set(b.referenceId, a.referenceId); pairs.push({ originalId: a.referenceId, duplicateId: b.referenceId, reason, suggestedCrossPost: b.sourceUrl }); break; }
    }
  }
  return { duplicates: pairs, isDuplicate: (id) => dupOf.has(id), keep: refs.filter((r) => !dupOf.has(r.referenceId)) };
}
function pubMs(r) { try { return parsePublication(r.publication).instantMs; } catch { return Infinity; } }
function normUrl(u) { try { const x = new URL(u); x.hash = ""; return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + x.search).toLowerCase(); } catch { return String(u); } }

// ------------------------------------------------------------------ Aufteilung (§8, Red-Team H3)
export const isHkcmDefault = (sourceId) => sourceFamily(sourceId) === "hkcm";
export function hashUnit(s) { return parseInt(createHash("sha256").update(String(s)).digest("hex").slice(0, 8), 16) / 4294967296; }
export const SPLIT_GUARD_SESSIONS = 20;
/**
 * Aufteilung auf Ebene von Fallketten (Original + Revisionen; Revisionen und Cross-Posts erben die Aufteilung des Originals):
 *   HOLDOUT_SOURCE   alle Faelle der zweitgroessten Nicht-HKCM-QUELLENFAMILIE (beim Freeze festgelegt; opts.holdoutSource
 *                    uebernimmt den Wert aus dem Manifest statt neu zu rechnen)
 *   HOLDOUT_TEMPORAL Original ab 01.01.2025 (uebrige Familien)
 *   DEVELOPMENT/VALIDATION  70/30 per SHA-256 nicht je Fall, sondern je MARKTFENSTER-CLUSTER: Faelle desselben vuSymbol, deren
 *                    Stichtage (aller Fassungen) <= 20 Handelstage auseinanderliegen, bilden eine Zusammenhangskomponente und
 *                    landen gemeinsam in einem Split (der VU-Replay haengt nur an vuSymbol/Zeitrahmen/Stichtag).
 *   QUARANTINE       DEV/VAL-Faelle, die mit einem Holdout-Fall vuSymbol und einen Stichtag innerhalb ±20 Handelstagen teilen –
 *                    sonst saehe die Entwicklung denselben Kursausschnitt wie der Holdout. Werden in keinem Split ausgewertet.
 */
export function assignSplits(refs, opts = {}) {
  const fam = (id) => sourceFamily(id, opts.registry);
  const isHkcm = opts.isHkcm || ((id) => fam(id) === "hkcm");
  const map = opts.map || loadInstrumentMap(), guard = opts.guardSessions ?? SPLIT_GUARD_SESSIONS;
  const { chains } = revisionChains(refs);
  const units = [...chains.values()].map((c) => ({ root: c[0], caseId: c[0].caseId, family: fam(c[0].sourceId), sym: instrumentKey(c[0]),
    market: marketOfSymbol(c[0].instrument && c[0].instrument.vuSymbol, map) || "US_EQUITY", cutoffs: c.map((v) => v.analysisCutoff).filter(isIsoDate).sort() }));
  const perFamily = {};
  for (const u of units) perFamily[u.family] = (perFamily[u.family] || 0) + 1;
  const ranked = Object.entries(perFamily).filter(([f]) => !isHkcm(f) && f !== "hkcm").sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const holdoutSource = opts.holdoutSource !== undefined ? opts.holdoutSource : ranked.length >= 2 ? ranked[1][0] : null;
  const near = (u, v) => u.sym === v.sym && u.cutoffs.some((a) => v.cutoffs.some((b) => Math.abs(sessionDaysBetween(a, b, u.market)) <= guard));
  const byCase = {};
  const pending = [];
  for (const u of units) {
    if (holdoutSource && u.family === holdoutSource) byCase[u.caseId] = "HOLDOUT_SOURCE";
    else if (publicationLocalDate(u.root) >= "2025-01-01") byCase[u.caseId] = "HOLDOUT_TEMPORAL";
    else pending.push(u);
  }
  // Zusammenhangskomponenten (Union-Find) ueber Marktfenster
  const parent = pending.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pending.length; i++) for (let j = i + 1; j < pending.length; j++) if (near(pending[i], pending[j])) parent[find(i)] = find(j);
  const compKey = {};
  pending.forEach((u, i) => { const r = find(i); compKey[r] = compKey[r] && compKey[r] < u.caseId ? compKey[r] : u.caseId; });
  pending.forEach((u, i) => { byCase[u.caseId] = hashUnit("cluster|" + compKey[find(i)]) < 0.7 ? "DEVELOPMENT" : "VALIDATION"; u.cluster = compKey[find(i)]; });
  // Schutz: keine DEV/VAL-Faelle im Marktfenster eines Holdout-Falls
  const holdouts = units.filter((u) => byCase[u.caseId].startsWith("HOLDOUT"));
  const quarantine = [];
  for (const u of pending) {
    const hit = holdouts.find((h) => near(u, h));
    if (hit) { quarantine.push({ caseId: u.caseId, was: byCase[u.caseId], collidesWith: hit.caseId, holdout: byCase[hit.caseId] }); byCase[u.caseId] = "QUARANTINE"; }
  }
  // Fassungen und Duplikate erben die Aufteilung ihres Originals
  const byReference = {};
  for (const c of chains.values()) for (const v of c) byReference[v.referenceId] = byCase[c[0].caseId];
  for (const d of opts.duplicates || []) if (byReference[d.originalId]) byReference[d.duplicateId] = byReference[d.originalId];
  const counts = {}; for (const x of Object.values(byCase)) counts[x] = (counts[x] || 0) + 1;
  return { byCase, byReference, holdoutSource, holdoutFixed: opts.holdoutSource !== undefined,
           holdoutNote: holdoutSource ? null : "weniger als zwei Nicht-HKCM-Quellenfamilien – kein HOLDOUT_SOURCE moeglich", perFamily, perSource: perFamily, counts, quarantine, guardSessions: guard };
}
/** Prueft die Schutzregel auf einer fertigen Aufteilung (fuer Tests/Manifest): Liste verletzender Paare. */
export function splitGuardViolations(refs, byCase, opts = {}) {
  const map = opts.map || loadInstrumentMap(), guard = opts.guardSessions ?? SPLIT_GUARD_SESSIONS, { chains } = revisionChains(refs);
  const units = [...chains.values()].map((c) => ({ caseId: c[0].caseId, sym: instrumentKey(c[0]), market: marketOfSymbol(c[0].instrument && c[0].instrument.vuSymbol, map) || "US_EQUITY", cutoffs: c.map((v) => v.analysisCutoff) }));
  const out = [];
  for (const h of units.filter((u) => String(byCase[u.caseId]).startsWith("HOLDOUT")))
    for (const d of units.filter((u) => byCase[u.caseId] === "DEVELOPMENT" || byCase[u.caseId] === "VALIDATION"))
      if (h.sym === d.sym && h.cutoffs.some((a) => d.cutoffs.some((b) => Math.abs(sessionDaysBetween(a, b, h.market)) <= guard))) out.push([d.caseId, h.caseId]);
  return out;
}
/** Doppelextraktion (§7): deterministische Auswahl von 25 % der Faelle mit Seed 20261004 (SHA-256(seed|caseId) aufsteigend). */
export const SECOND_PASS_SEED = 20261004;
export function selectSecondPass(caseIds, { seed = SECOND_PASS_SEED, share = 0.25 } = {}) {
  const uniq = [...new Set(caseIds)].sort();
  const n = Math.ceil(uniq.length * share);
  return uniq.map((c) => [createHash("sha256").update(seed + "|" + c).digest("hex"), c]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, n).map((x) => x[1]).sort();
}

// ------------------------------------------------------------------ Freeze (§9)
export function canonicalJson(v) {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
export class FreezeRefusedError extends Error {
  constructor(reasons) { super("FREEZE VERWEIGERT:\n  - " + reasons.join("\n  - ")); this.name = "FreezeRefusedError"; this.reasons = reasons; }
}
/** Gruende, warum eine Zeile nicht in einen Freeze darf (leer = ok). */
export function freezeBlockers(r, opts = {}) {
  const out = [], id = r.referenceId || `Zeile ${r.__line}`;
  if (isTestFixtureLike(r)) out.push(`${id}: TEST_FIXTURE/Testquelle im Freeze-Eingang`);
  if (r.status !== "INCLUDED") return out;
  const ex = r.extraction || {};
  if (ex.confidence === "LOW") out.push(`${id}: Extraktionssicherheit LOW`);
  if (ex.method === "LLM_DRAFT_UNREVIEWED") out.push(`${id}: LLM_DRAFT_UNREVIEWED zaehlt nie`);
  /* Protokoll-Nachtrag 2: zwei unabhaengige Durchgaenge aus der Primaerquelle mit dokumentierter Kernfeld-Uebereinstimmung */
  if (ex.method === "LLM_DUAL_INDEPENDENT_PRIMARY") {
    const ps = ex.passes || {};
    if (!ps.a || !ps.b || ps.a === ps.b) out.push(`${id}: LLM_DUAL_INDEPENDENT_PRIMARY ohne zwei verschiedene Durchgaenge (passes.a/b)`);
    if (!ps.coreFieldAgreement || typeof ps.coreFieldAgreement !== "object") out.push(`${id}: LLM_DUAL_INDEPENDENT_PRIMARY ohne coreFieldAgreement`);
    else if (ex.confidence === "HIGH" && Object.values(ps.coreFieldAgreement).some((v) => v !== true && v !== "NOT_STATED")) out.push(`${id}: HIGH trotz abweichender Kernfelder zwischen Durchgang A und B`);
  }
  if (!Array.isArray(r.evidence) || !r.evidence.length || r.evidence.some((e) => !e || !e.note)) out.push(`${id}: Fundstellen-Nachweis (evidence) fehlt`);
  const v = validateReference(r, opts);
  for (const e of v.errors) out.push(`${id}: ${e}`);
  if (opts.plausibility) for (const e of opts.plausibility(r).errors || []) out.push(`${id}: Plausibilitaet: ${e}`);
  return out;
}
/** Qualitaetsgate §107 (nur Bericht; nicht erreicht → PILOT). */
export function qualityGate(included, isHkcm = isHkcmDefault, registry = null) {
  const originals = included.filter((r) => r.viewKind !== "LATER_REVISION");
  const n = originals.length, src = new Set(originals.map((r) => sourceFamily(r.sourceId, registry))), inst = new Set(originals.map(instrumentKey));
  const years = new Set(originals.map((r) => publicationLocalDate(r).slice(0, 4))), fam = new Set(originals.map((r) => r.primary && r.primary.family).filter((f) => f && f !== "UNKNOWN"));
  const high = n ? originals.filter((r) => r.extraction.confidence === "HIGH").length / n : 0, hk = n ? originals.filter((r) => isHkcm(r.sourceId)).length / n : 0;
  const checks = { sources: { value: src.size, min: 2, ok: src.size >= 2 }, cases: { value: n, min: 100, ok: n >= 100 }, highShare: { value: round(high, 3), min: 0.7, ok: high >= 0.7 },
    instruments: { value: inst.size, min: 2, ok: inst.size >= 2 }, years: { value: years.size, min: 2, ok: years.size >= 2 }, patternFamilies: { value: fam.size, min: 2, ok: fam.size >= 2 },
    hkcmShare: { value: round(hk, 3), max: 0.4, ok: hk <= 0.4 } };
  return { status: Object.values(checks).every((c) => c.ok) ? "FULL" : "PILOT", checks, failed: Object.keys(checks).filter((k) => !checks[k].ok) };
}
/**
 * Freeze: nur INCLUDED, sortiert nach referenceId, kanonisches JSON je Zeile, SHA-256 ueber den Dateiinhalt, Manifest.
 * Verweigert (wirft FreezeRefusedError) bei TEST_FIXTURE, LOW, LLM_DRAFT_UNREVIEWED, fehlender Evidenz, Validierungs-/
 * Plausibilitaetsfehlern, ungeklaerten Duplikaten, Revisionsfehlern oder einer bereits existierenden anderen Fassung.
 */
export function freezeReferences(rows, opts = {}) {
  const version = opts.version || FREEZE_VERSION, outDir = opts.outDir || PATHS.freeze;
  /* Selbsttest-Modus NUR fuer automatische Tests: Version 'TEST_*', Ausgabe ausserhalb von practitioner-v1; dann bilden die
     (gekennzeichneten) TEST_FIXTURE-Zeilen den Freeze-Satz. Echte Freezes koennen diesen Modus nicht nutzen. */
  const testMode = opts.selfTestMode === true;
  if (testMode && (!/^TEST_/.test(version) || outDir.startsWith(PV1))) throw new FreezeRefusedError(["selfTestMode nur mit Version TEST_* und Ausgabe ausserhalb von practitioner-v1"]);
  const reasons = [];
  const setStatus = testMode ? "TEST_FIXTURE" : "INCLUDED";
  for (const r of rows) {
    if (testMode) { if (!isTestFixtureLike(r)) reasons.push(`${r.referenceId}: selfTestMode akzeptiert nur TEST_FIXTURE`); else reasons.push(...freezeBlockers(Object.assign({}, r, { status: "INCLUDED" }), opts).filter((x) => !/TEST_FIXTURE|sourceId 'test-fixture|\.invalid/.test(x))); }
    else reasons.push(...freezeBlockers(r, opts));
  }
  const included = rows.filter((r) => r.status === setStatus).map(stripInternal);
  if (!included.length) reasons.push("keine INCLUDED-Referenzen");
  const chains = revisionChains(included); reasons.push(...chains.errors);
  const d = detectDuplicates(included); for (const x of d.duplicates) reasons.push(`Duplikat ungeklaert: ${x.duplicateId} ≙ ${x.originalId} (${x.reason}) – als crossPosts eintragen`);
  if (reasons.length) throw new FreezeRefusedError(reasons);
  const splits = assignSplits(included, opts);
  /* Schema kennt QUARANTINE nicht → in der Zeile UNASSIGNED; massgeblich ist die Tabelle splits.byCase im Manifest. */
  const lineSplit = (r) => { const x = splits.byCase[r.caseId]; return x && x !== "QUARANTINE" ? x : "UNASSIGNED"; };
  const lines = included.map((r) => Object.assign({}, r, { split: lineSplit(r) }))
    .sort((a, b) => a.referenceId.localeCompare(b.referenceId)).map(canonicalJson);
  const content = lines.join("\n") + "\n", sha256 = createHash("sha256").update(content).digest("hex");
  const file = join(outDir, version + ".jsonl"), manFile = join(outDir, version + ".manifest.json");
  if (existsSync(manFile)) {
    const prev = readJson(manFile);
    if (prev.sha256 !== sha256) throw new FreezeRefusedError([`${version} existiert bereits mit anderem Inhalt (${prev.sha256.slice(0, 12)}…) – Korrekturen nur als neue Version (V1.1 …)`]);
  }
  const gate = qualityGate(included, opts.isHkcm, opts.registry);
  const manifest = { version, schema: "practitioner-reference-1.2.0", file: version + ".jsonl", sha256, lines: lines.length,
    cases: new Set(included.map((r) => r.caseId)).size, sourceFamilies: splits.perFamily,
    splits: { counts: splits.counts, byCase: splits.byCase, quarantine: splits.quarantine, guardSessions: splits.guardSessions },
    holdoutSource: splits.holdoutSource, holdoutSourceKind: "SOURCE_FAMILY", holdoutNote: splits.holdoutNote,
    expectedEngine: opts.expectedEngine || "elliott-3.2.2", qualityGate: gate, label: gate.status === "FULL" ? "PRACTITIONER REFERENCE" : "PRACTITIONER REFERENCE — PILOT",
    createdAt: opts.now || new Date().toISOString(), note: "PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH" };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(file, content);
  writeFileSync(manFile, JSON.stringify(manifest, null, 1) + "\n");
  return { file, manifestFile: manFile, manifest };
}
/** Pruefsumme eines eingefrorenen Datensatzes nachrechnen. */
export function verifyFreeze(manFile) {
  const m = readJson(manFile), content = readFileSync(join(dirname(manFile), m.file), "utf8");
  return createHash("sha256").update(content).digest("hex") === m.sha256;
}

export function round(v, d = 4) { return Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null; }
export { MARKETS };
