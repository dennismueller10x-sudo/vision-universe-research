#!/usr/bin/env node
/* Practitioner Reference V1 — menschliches Extraktions-Audit (blind, ohne VU-Ausgaben).

   PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH. Geprüft wird nur: Praktiker-Primärquelle → extrahierte Zeile.
   Doku: docs/technical-intelligence/PRACTITIONER_HUMAN_AUDIT.md

   Unterbefehle
     select     deterministische, geschichtete Auswahl von 20 Fällen aus den 35 geöffneten Fällen (DEVELOPMENT/VALIDATION)
                → human-audit/selection.json
     export     Prüfpaket → human-audit/audit-pack.json, audit-pack.csv (leere Prüfspalten), AUDIT_PACK.md (druckbar)
     import F   ausgefüllte Prüfung (CSV oder JSON) validieren, Fehlerquoten berechnen → human-audit/results.json,
                Datensatz-KANDIDAT V1.1 als NEUE Datei (+ Änderungsliste). freeze/ wird nie verändert.
     agreement  A↔B-Übereinstimmung je Kernfeld + beschreibende Zählungen (nur geöffnete Fälle)
                → human-audit/extraction-agreement.json
     status     READY / BLOCKED / COMPLETED

   Optionen: --out <dir> (Standard human-audit/), --freeze <jsonl>, --manifest <json>, --refs <jsonl>, --pack <json>

   Harte Regeln (im Code erzwungen):
     • Holdout-Fälle (HOLDOUT_TEMPORAL, HOLDOUT_SOURCE, alles außer DEVELOPMENT/VALIDATION) bleiben versiegelt: Zeilen werden
       VOR dem Parsen über die caseId im Rohtext gegen die Manifest-Aufteilung gefiltert; Holdout-Zeilen werden nie geparst,
       nur gezählt. Ausnahme Kandidat V1.1: Holdout-Zeilen werden ungelesen byte-identisch durchgereicht.
     • Keine VU-/Engine-Ausgaben: es wird nichts aus benchmark/ gelesen.
     • Keine Screenshots/Transkripte/Volltexte: nur URL, Fundstellen und die bereits vorhandenen Kurz-Notizen.
   Keine Abhängigkeiten, Node ≥ 22. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve, basename, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const PV1 = join(ROOT, "quant/data/technical-intelligence/practitioner-v1");
export const DEFAULTS = Object.freeze({
  out: join(PV1, "human-audit"),
  freeze: join(PV1, "freeze/PRACTITIONER_REFERENCE_V1.jsonl"),
  manifest: join(PV1, "freeze/PRACTITIONER_REFERENCE_V1.manifest.json"),
  refs: join(PV1, "references.jsonl"),
  registry: join(PV1, "source-registry.json"),
  schema: join(PV1, "schema/practitioner-reference-1.2.0.json"),
});

export const LABEL = "PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH";
export const AUDIT_LABEL = "Extraktions-Audit — blind, ohne VU-Ausgaben";
export const OPEN_SPLITS = Object.freeze(["DEVELOPMENT", "VALIDATION"]);
export const SEED = "20261005|human-audit|";
export const VERDICTS = Object.freeze(["CORRECT", "INCORRECT", "PARTIALLY_CORRECT", "UNKNOWN"]);
/* gleiche Kernfelder wie scripts/technical/practitioner/dual-extraction.mjs CORE_FIELDS (Test prüft Gleichheit) */
export const CORE_FIELDS = Object.freeze(["family", "currentWave", "direction", "invalidation", "timeframe", "instrument"]);
export const STATUS_READY_LINE = "HUMAN EXTRACTION AUDIT: READY (kein Reviewer verfügbar — keine Ergebnisse)";

/* Auswahlregel (vorab festgelegt, Stand 05.10.2026) */
export const RULE = Object.freeze({
  size: 20,
  includeAllHigh: true,
  minPerSourceFamily: 2,
  minPerTimeframe: 1,
  timeframes: ["1D", "1W", "1M"],
  minCorrective: 3,
  minMotiveShare: 0.6,
  maxBtc: 6,
  order: "aufsteigend SHA-256(\"20261005|human-audit|\" + caseId)",
});

/* Geprüfte Felder je Fall (eine CSV-Zeile je Feld). abKey = Kernfeld der A/B-Übereinstimmung. */
export const AUDIT_FIELDS = Object.freeze([
  { field: "instrument", label: "Instrument (asShown → vuSymbol)", core: true, abKey: "instrument", format: "JSON {asShown, vuSymbol, instrumentType, mappingQuality, …} oder UNKNOWN", ev: ["instrument"] },
  { field: "timeframe", label: "Zeitrahmen", core: true, abKey: "timeframe", format: "1D | 1W | 1M | INTRADAY | MIXED | UNKNOWN", ev: ["timeframe"] },
  { field: "publication.timestamp", label: "Veröffentlichung (Zeitstempel)", core: false, abKey: null, format: "ISO-8601 mit Offset, z. B. 2023-01-08T14:00:00+00:00", ev: ["publication"] },
  { field: "primary.pattern", label: "Primärmuster", core: false, abKey: null, format: "IMPULSE | LEADING_DIAGONAL | ENDING_DIAGONAL | ZIGZAG | FLAT | TRIANGLE | WXY | DOUBLE_ZIGZAG | TRIPLE_ZIGZAG | COMBINATION | UNKNOWN", ev: ["pattern", "primary"] },
  { field: "primary.family", label: "Musterfamilie", core: true, abKey: "family", format: "MOTIVE | CORRECTIVE | UNKNOWN", ev: ["family", "pattern"] },
  { field: "primary.degree", label: "Grad (degreeLabel / degreeRank)", core: false, abKey: null, format: "JSON {degreeLabel, degreeRank (−2…5 oder null)} oder UNKNOWN", ev: ["degreeLabel", "degreeRank"] },
  { field: "primary.currentWave", label: "Laufende Welle", core: true, abKey: "currentWave", format: "Label wie gezeigt, z. B. (iii), C, 4 — oder UNKNOWN", ev: ["currentWave", "currentWaveRole", "waveStartPrice", "waveStartDate"] },
  { field: "primary.state", label: "Zustand (laufend/abgeschlossen)", core: false, abKey: null, format: "DEVELOPING | CONFIRMED_COMPLETE | UNKNOWN", ev: ["state"] },
  { field: "directionalBias", label: "Richtung ab jetzt (A1)", core: true, abKey: "direction", format: "UP | DOWN | SIDEWAYS | UNKNOWN", ev: ["directionalBias"] },
  { field: "primary.nextMoveAfterCurrent", label: "Bewegung nach der laufenden Welle (A2)", core: false, abKey: null, format: "UP | DOWN | SIDEWAYS | UNKNOWN", ev: ["nextMoveAfterCurrent"] },
  { field: "targetZones", label: "Zielzonen", core: false, abKey: null, format: "JSON [{low, high, label}] oder UNKNOWN (= keine)", ev: ["targetZones"] },
  { field: "invalidation", label: "Invalidierung", core: true, abKey: "invalidation", format: "JSON {price, direction: below|above, basis: CLOSE|INTRADAY|UNKNOWN} oder UNKNOWN (= null)", ev: ["invalidation"] },
  { field: "alternatives", label: "Alternativszenarien", core: false, abKey: null, format: "JSON [{pattern, currentWave, directionalBias, trigger, note}] oder UNKNOWN (= keine)", ev: ["alternatives"] },
]);
export const CSV_COLUMNS = Object.freeze(["packId", "auditRowId", "caseId", "referenceId", "confidence", "field", "core", "extractedValue", "abAgreement", "sourceUrl", "evidence",
  "verdict", "correctedValue", "reviewerNote", "reviewerId", "reviewDate"]);
const REVIEW_COLUMNS = ["verdict", "correctedValue", "reviewerNote", "reviewerId", "reviewDate"];
const REVIEWER_RE = /^[A-Za-z0-9_-]{2,24}$/;

// ------------------------------------------------------------------ Helfer
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const rel = (p) => relative(ROOT, p).split("\\").join("/");
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) o[k] = canonical(v[k]); return o; }
  return v;
}
const stableJson = (v) => JSON.stringify(canonical(v));
function writeJson(p, obj) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 1) + "\n"); }
const pct = (x) => (x === null || x === undefined ? "–" : (Math.round(x * 1000) / 10).toFixed(1) + " %");
function rate(k, n) { return n > 0 ? k / n : null; }
/** Wilson-Intervall 95 % */
export function wilson(k, n, z = 1.959964) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}
function getPath(o, path) { return path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o); }

// ------------------------------------------------------------------ Laden (Holdout-Filter vor dem Parsen)
export function loadManifest(path = DEFAULTS.manifest) { return readJson(path); }
export function openedCaseIds(manifest) {
  return new Set(Object.entries(manifest.splits.byCase).filter(([, s]) => OPEN_SPLITS.includes(s)).map(([c]) => c));
}
const CASE_RE = /"caseId"\s*:\s*"((?:[^"\\]|\\.)*)"/;
/** Liest eine JSONL-Datei; parst NUR Zeilen geöffneter Fälle. Versiegelte Zeilen werden nur gezählt. */
export function loadOpenedLines(path, opened) {
  const raw = readFileSync(path, "utf8");
  const rows = []; let sealed = 0, unknown = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(CASE_RE);
    if (!m) { unknown++; continue; }
    const cid = JSON.parse('"' + m[1] + '"');
    if (!opened.has(cid)) { sealed++; continue; }
    const r = JSON.parse(line);
    if (r.caseId !== cid) throw new Error("caseId-Filter inkonsistent: " + cid);
    rows.push(r);
  }
  return { rows, sealed, unparsable: unknown, sha256: sha256(raw) };
}
export function loadRegistry(path = DEFAULTS.registry) {
  const r = readJson(path); const list = Array.isArray(r) ? r : r.sources || Object.values(r);
  const by = {}; for (const s of list) by[s.sourceId] = s; return by;
}
function sourceFamilyOf(reg, sid) { return (reg[sid] && reg[sid].sourceFamily) || sid; }
const isBtc = (r) => /^BTC/i.test((r.instrument && r.instrument.vuSymbol) || "");

// ------------------------------------------------------------------ select
function caseInfo(orig, reg) {
  return {
    caseId: orig.caseId, referenceId: orig.referenceId, split: orig.split, sourceId: orig.sourceId,
    sourceFamily: sourceFamilyOf(reg, orig.sourceId), timeframe: orig.timeframe,
    family: (orig.primary && orig.primary.family) || "UNKNOWN", pattern: (orig.primary && orig.primary.pattern) || "UNKNOWN",
    confidence: orig.extraction.confidence, btc: isBtc(orig), hash: sha256(SEED + orig.caseId),
  };
}
function strata(list) {
  const cnt = (key) => { const o = {}; for (const c of list) { const k = typeof key === "function" ? key(c) : c[key]; o[k] = (o[k] || 0) + 1; } return Object.fromEntries(Object.entries(o).sort()); };
  return {
    n: list.length, sourceFamily: cnt("sourceFamily"), timeframe: cnt("timeframe"), family: cnt("family"), pattern: cnt("pattern"),
    confidence: cnt("confidence"), btc: cnt((c) => (c.btc ? "BTC" : "NON_BTC")), split: cnt("split"),
  };
}
/** Reine Auswahlfunktion über Fall-Infos der geöffneten Originale. */
export function selectFromInfos(infos, rule = RULE) {
  const pool = [...infos].sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
  const avail = (pred) => pool.filter(pred).length;
  const motiveMin = Math.min(Math.ceil(rule.minMotiveShare * rule.size), avail((c) => c.family === "MOTIVE"));
  const maxNonMotive = rule.size - motiveMin;
  const sel = [], reasons = {}, log = [];
  const count = (pred) => sel.filter(pred).length;
  const admissible = (c) => !(c.btc && count((x) => x.btc) >= rule.maxBtc) && !(c.family !== "MOTIVE" && count((x) => x.family !== "MOTIVE") >= maxNonMotive);
  const take = (c, why) => { sel.push(c); reasons[c.caseId] = why; pool.splice(pool.indexOf(c), 1); };
  // 1. alle HIGH (in Hash-Reihenfolge, Obergrenzen gelten)
  if (rule.includeAllHigh) for (const c of pool.filter((x) => x.confidence === "HIGH")) {
    if (sel.length >= rule.size) break;
    if (admissible(c)) take(c, "HIGH"); else log.push("HIGH " + c.caseId + " wegen Obergrenze nicht aufgenommen");
  }
  // 2. Mindestbelegungen
  const families = [...new Set(infos.map((c) => c.sourceFamily))].sort();
  const tfs = rule.timeframes.filter((t) => infos.some((c) => c.timeframe === t));
  const mins = [
    ...families.map((f) => ({ name: "sourceFamily=" + f, pred: (c) => c.sourceFamily === f, min: rule.minPerSourceFamily })),
    ...tfs.map((t) => ({ name: "timeframe=" + t, pred: (c) => c.timeframe === t, min: rule.minPerTimeframe })),
    { name: "family=CORRECTIVE", pred: (c) => c.family === "CORRECTIVE", min: rule.minCorrective },
    { name: "family=MOTIVE", pred: (c) => c.family === "MOTIVE", min: motiveMin },
  ];
  for (const m of mins) {
    const target = Math.min(m.min, avail(m.pred) + count(m.pred));
    while (count(m.pred) < target && sel.length < rule.size) {
      const c = pool.find((x) => m.pred(x) && admissible(x));
      if (!c) { log.push("Mindestbelegung " + m.name + " nicht erreichbar"); break; }
      take(c, "MIN:" + m.name);
    }
  }
  // 3. auffüllen in Hash-Reihenfolge
  while (sel.length < rule.size) {
    const c = pool.find(admissible);
    if (!c) { log.push("Auffüllen vorzeitig beendet (Obergrenzen)"); break; }
    take(c, "FILL");
  }
  const checks = {
    size: { value: sel.length, target: rule.size, ok: sel.length === Math.min(rule.size, infos.length) },
    allHigh: { value: count((c) => c.confidence === "HIGH"), available: infos.filter((c) => c.confidence === "HIGH").length },
    sourceFamilies: Object.fromEntries(families.map((f) => [f, { value: count((c) => c.sourceFamily === f), min: Math.min(rule.minPerSourceFamily, infos.filter((c) => c.sourceFamily === f).length) }])),
    timeframes: Object.fromEntries(tfs.map((t) => [t, { value: count((c) => c.timeframe === t), min: rule.minPerTimeframe }])),
    corrective: { value: count((c) => c.family === "CORRECTIVE"), min: Math.min(rule.minCorrective, infos.filter((c) => c.family === "CORRECTIVE").length) },
    motive: { value: count((c) => c.family === "MOTIVE"), min: motiveMin, share: rate(count((c) => c.family === "MOTIVE"), sel.length) },
    btc: { value: count((c) => c.btc), max: rule.maxBtc },
  };
  checks.allOk = checks.size.ok && checks.allHigh.value === checks.allHigh.available
    && Object.values(checks.sourceFamilies).every((x) => x.value >= x.min) && Object.values(checks.timeframes).every((x) => x.value >= x.min)
    && checks.corrective.value >= checks.corrective.min && checks.motive.value >= checks.motive.min && checks.btc.value <= checks.btc.max;
  return { selected: sel, reasons, log, checks };
}
export function buildSelection(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const manifest = loadManifest(o.manifest);
  const opened = openedCaseIds(manifest);
  const { rows, sealed, sha256: freezeSha } = loadOpenedLines(o.freeze, opened);
  if (manifest.sha256 && freezeSha !== manifest.sha256) throw new Error("Freeze-Hash weicht vom Manifest ab — Abbruch");
  const reg = loadRegistry(o.registry);
  const originals = rows.filter((r) => r.viewKind === "ORIGINAL_PUBLISHED");
  const infos = originals.map((r) => caseInfo(r, reg));
  if (infos.length !== opened.size) throw new Error(`geöffnete Originale ${infos.length} ≠ geöffnete Fälle ${opened.size}`);
  const res = selectFromInfos(infos);
  const revisionsByCase = {};
  for (const r of rows) if (r.viewKind === "LATER_REVISION") (revisionsByCase[r.caseId] ||= []).push(r.referenceId);
  return {
    format: "vu-practitioner-human-audit-selection-1",
    label: LABEL, audit: AUDIT_LABEL,
    createdFor: "Mission V — menschliches Extraktions-Audit (Stichprobe der geöffneten Fälle)",
    dataset: { version: manifest.version, file: rel(o.freeze), sha256: freezeSha },
    population: { openedSplits: OPEN_SPLITS, openedCases: opened.size, sealedCases: Object.keys(manifest.splits.byCase).length - opened.size, sealedLinesNotRead: sealed },
    rule: { ...RULE, seed: SEED, steps: [
      "1. alle geöffneten Fälle mit extraction.confidence = HIGH (Obergrenzen gelten)",
      "2. Mindestbelegungen in fester Reihenfolge, je erster zulässiger Fall in Hash-Reihenfolge: je Quellenfamilie ≥ 2, je vorhandenem Zeitrahmen (1D/1W/1M) ≥ 1, CORRECTIVE ≥ 3, MOTIVE ≥ 60 % (je soweit vorhanden)",
      "3. Auffüllen bis 20 in Hash-Reihenfolge",
      "zulässig = BTC ≤ 6 und Nicht-MOTIVE ≤ 20 − MOTIVE-Minimum (damit die MOTIVE-Quote erreichbar bleibt)",
      "geprüft wird die Fassung ORIGINAL_PUBLISHED; spätere Revisionen desselben Falls erscheinen nur als Kontext",
    ] },
    checks: res.checks, log: res.log,
    strata: { opened: strata(infos), selected: strata(res.selected) },
    cases: res.selected.map((c) => ({ caseId: c.caseId, referenceId: c.referenceId, split: c.split, sourceFamily: c.sourceFamily, timeframe: c.timeframe,
      family: c.family, pattern: c.pattern, confidence: c.confidence, btc: c.btc, reason: res.reasons[c.caseId], hash: c.hash, contextRevisions: revisionsByCase[c.caseId] || [] })),
  };
}

// ------------------------------------------------------------------ export
function valueOf(rec, field) {
  const p = rec.primary || {};
  switch (field) {
    case "instrument": { const i = rec.instrument || {}; return { asShown: i.asShown, vuSymbol: i.vuSymbol, instrumentType: i.instrumentType, mappingQuality: i.mappingQuality }; }
    case "publication.timestamp": return rec.publication ? rec.publication.timestamp : null;
    case "primary.degree": return { degreeLabel: p.degreeLabel ?? null, degreeRank: p.degreeRank ?? null };
    default: { const v = field.startsWith("primary.") ? p[field.slice(8)] : getPath(rec, field); return v === undefined ? null : v; }
  }
}
export function formatValue(v) { return v === null || v === undefined ? "null" : typeof v === "string" ? v : JSON.stringify(v); }
const evKey = (f) => String(f || "").replace(/^primary\./, "").replace(/\[\d+\].*$/, "").replace(/\..*$/, "");
function evidenceFor(rec, spec) { return (rec.evidence || []).filter((e) => spec.ev.includes(evKey(e.field))).map((e) => `[${e.locator}] ${e.note}`); }
function abFlag(rec, spec) {
  const pa = rec.extraction && rec.extraction.passes;
  if (!spec.abKey || !pa || !pa.coreFieldAgreement) return "";
  const v = pa.coreFieldAgreement[spec.abKey];
  return v === true ? "AGREE" : v === false ? "DISAGREE" : v === "NOT_STATED" ? "NOT_STATED" : "";
}
function caseView(rec) {
  const pa = (rec.extraction && rec.extraction.passes) || null;
  return {
    referenceId: rec.referenceId, version: rec.version, viewKind: rec.viewKind,
    publication: rec.publication, sourceUrl: rec.sourceUrl, crossPosts: rec.crossPosts || [], analysisCutoff: rec.analysisCutoff,
    instrument: rec.instrument, timeframe: rec.timeframe, primary: rec.primary, directionalBias: rec.directionalBias,
    targetZones: rec.targetZones || [], invalidation: rec.invalidation, alternatives: rec.alternatives || [],
    keySupportZones: rec.keySupportZones || [], entryZones: rec.entryZones || [],
    structuralScenario: rec.structuralScenario, commentarySummary: rec.commentarySummary,
    extraction: { confidence: rec.extraction.confidence, method: rec.extraction.method, ambiguities: rec.extraction.ambiguities || [],
      coreFieldAgreement: pa ? pa.coreFieldAgreement : null, adjudicated: !!(pa && pa.adjudication) },
    evidence: (rec.evidence || []).map((e) => ({ field: e.field, locator: e.locator, note: e.note })),
  };
}
export function buildPack(selection, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const manifest = loadManifest(o.manifest);
  const opened = openedCaseIds(manifest);
  const { rows, sha256: freezeSha } = loadOpenedLines(o.freeze, opened);
  if (freezeSha !== selection.dataset.sha256) throw new Error("Auswahl gehört zu einem anderen Freeze-Stand — erst `select` neu ausführen");
  const reg = loadRegistry(o.registry);
  const cases = selection.cases.map((sc) => {
    if (!opened.has(sc.caseId)) throw new Error("Fall nicht geöffnet: " + sc.caseId);
    const orig = rows.find((r) => r.referenceId === sc.referenceId && r.viewKind === "ORIGINAL_PUBLISHED");
    if (!orig) throw new Error("Original fehlt: " + sc.referenceId);
    const revs = rows.filter((r) => r.caseId === sc.caseId && r.viewKind === "LATER_REVISION").sort((a, b) => a.version - b.version);
    const src = reg[orig.sourceId] || {};
    return {
      caseId: sc.caseId, referenceId: sc.referenceId, split: orig.split, selectionReason: sc.reason,
      source: { sourceId: orig.sourceId, practitioner: src.name || orig.sourceId, sourceFamily: sourceFamilyOf(reg, orig.sourceId), sourceType: orig.sourceType },
      record: caseView(orig),
      revisions: revs.map(caseView),
      auditRows: AUDIT_FIELDS.map((spec) => ({
        auditRowId: orig.referenceId + "#" + spec.field, field: spec.field, label: spec.label, core: spec.core,
        extractedValue: formatValue(valueOf(orig, spec.field)), abAgreement: abFlag(orig, spec), evidence: evidenceFor(orig, spec),
      })),
    };
  });
  const packId = sha256(stableJson({ d: freezeSha, rows: cases.flatMap((c) => c.auditRows.map((r) => [r.auditRowId, r.extractedValue])) })).slice(0, 16);
  return {
    format: "vu-practitioner-human-audit-pack-1",
    label: LABEL, audit: AUDIT_LABEL, packId,
    blindness: "Enthält keine VU-/Engine-Ausgaben, keine Vergleichs- oder Ergebniskennzahlen. Nur Praktikerquelle → extrahierte Zeile.",
    copyright: "Keine Screenshots, Transkripte oder Volltexte. Nur Quell-URL, Fundstellen und Kurz-Notizen der Extraktion.",
    dataset: selection.dataset, selection: { rule: selection.rule.order, seed: SEED, n: cases.length },
    verdicts: VERDICTS,
    verdictHelp: {
      CORRECT: "Extrahierter Wert entspricht der Quelle",
      INCORRECT: "Wert widerspricht der Quelle — correctedValue PFLICHT (Wert laut Quelle oder UNKNOWN)",
      PARTIALLY_CORRECT: "teilweise richtig (z. B. Preis stimmt, Richtung nicht) — correctedValue optional",
      UNKNOWN: "aus der Quelle nicht entscheidbar / Quelle nicht erreichbar",
    },
    fields: AUDIT_FIELDS.map(({ field, label, core, abKey, format }) => ({ field, label, core, abKey, format })),
    csvColumns: CSV_COLUMNS, cases,
  };
}
// ------------------------------------------------------------------ CSV
function csvCell(v) { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
export function packToCsvRows(pack) {
  return pack.cases.flatMap((c) => c.auditRows.map((r) => ({
    packId: pack.packId, auditRowId: r.auditRowId, caseId: c.caseId, referenceId: c.referenceId, confidence: c.record.extraction.confidence,
    field: r.field, core: r.core ? "Y" : "N", extractedValue: r.extractedValue, abAgreement: r.abAgreement, sourceUrl: c.record.sourceUrl,
    evidence: r.evidence.join(" | "), verdict: "", correctedValue: "", reviewerNote: "", reviewerId: "", reviewDate: "",
  })));
}
export function toCsv(rows, columns = CSV_COLUMNS) { return [columns.join(","), ...rows.map((r) => columns.map((k) => csvCell(r[k])).join(","))].join("\r\n") + "\r\n"; }
/** RFC-4180-Parser; Trennzeichen „,“ oder „;“ (Excel DE) wird aus der Kopfzeile erkannt. */
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const out = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x !== "")) out.push(row); row = []; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((x) => x !== "")) out.push(row); }
  if (!out.length) return [];
  const head = out[0].map((h) => h.trim());
  return out.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
// ------------------------------------------------------------------ Markdown (druckbar)
export function packToMarkdown(pack, selection) {
  const L = [];
  L.push(`# Prüfpaket — ${AUDIT_LABEL}`, "", `**${LABEL}.** Geprüft wird ausschließlich, ob die extrahierte Zeile die Praktikerquelle richtig wiedergibt — nicht, ob der Praktiker recht hatte. Keine VU-Ausgaben.`, "");
  L.push(`Paket \`${pack.packId}\` · Datensatz ${pack.dataset.version} (SHA-256 \`${pack.dataset.sha256.slice(0, 12)}…\`) · ${pack.cases.length} Fälle · Auswahl ${pack.selection.rule}`, "");
  L.push("Urteile: " + VERDICTS.map((v) => `\`${v}\` = ${pack.verdictHelp[v]}`).join("; ") + ".", "");
  L.push("Prüfer-Code (pseudonym): ____________  Datum: ____-__-__", "");
  if (selection) {
    L.push("## Schichtung der Auswahl", "", "| Merkmal | geöffnet (35) | ausgewählt (20) |", "|---|---|---|");
    for (const k of ["sourceFamily", "timeframe", "family", "confidence", "btc", "split"]) {
      const keys = [...new Set([...Object.keys(selection.strata.opened[k]), ...Object.keys(selection.strata.selected[k])])].sort();
      for (const v of keys) L.push(`| ${k} = ${v} | ${selection.strata.opened[k][v] || 0} | ${selection.strata.selected[k][v] || 0} |`);
    }
    L.push("");
  }
  const md = (s) => String(s ?? "–").replace(/\|/g, "\\|").replace(/\n/g, " ");
  pack.cases.forEach((c, i) => {
    const r = c.record;
    L.push(`## ${i + 1}. ${c.caseId}`, "");
    L.push(`* Quelle: ${c.source.practitioner} (\`${c.source.sourceId}\`, ${c.source.sourceType}) — ${r.sourceUrl}`);
    if (r.crossPosts.length) L.push(`* Weitere Fundstellen: ${r.crossPosts.map((x) => (typeof x === "string" ? x : x.url || JSON.stringify(x))).join(", ")}`);
    L.push(`* Veröffentlicht: ${r.publication.timestamp} (${r.publication.timestampPrecision}, ${r.publication.basis}; bearbeitet: ${r.publication.editedAfterPublication})`);
    L.push(`* referenceId \`${c.referenceId}\` · Aufteilung ${c.split} · Auswahlgrund ${c.selectionReason} · Sicherheit **${r.extraction.confidence}** · Schiedsdurchgang: ${r.extraction.adjudicated ? "ja" : "nein"}`);
    L.push(`* Szenario (eigene Kurzfassung der Extraktion): ${md(r.structuralScenario)}`);
    L.push("", "Fundstellen:", ...r.evidence.map((e) => `* \`${md(e.field)}\` [${md(e.locator)}] ${md(e.note)}`));
    if (r.extraction.ambiguities.length) L.push("", "Unklarheiten:", ...r.extraction.ambiguities.map((a) => `* ${md(a)}`));
    L.push("", "| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |", "|---|---|---|---|---|---|---|");
    for (const a of c.auditRows) L.push(`| ${md(a.label)} | ${a.core ? "ja" : ""} | \`${md(a.extractedValue)}\` | ${a.abAgreement || ""} | ☐C ☐I ☐P ☐U | | |`);
    if (c.revisions.length) {
      L.push("", "Spätere Revisionen (nur Kontext, nicht prüfen):");
      for (const v of c.revisions) L.push(`* v${v.version} ${v.publication.timestamp} ${v.timeframe} — ${v.sourceUrl} — Muster ${v.primary && v.primary.pattern}, Welle ${v.primary && v.primary.currentWave}, Richtung ${v.directionalBias}, Invalidierung ${formatValue(v.invalidation)}`);
    }
    L.push("");
  });
  return L.join("\n");
}

// ------------------------------------------------------------------ import
const SCHEMA_ENUMS = () => {
  const s = readJson(DEFAULTS.schema), P = s.properties;
  return { timeframe: P.timeframe.enum, directionalBias: P.directionalBias.enum, pattern: P.primary.properties.pattern.enum, family: P.primary.properties.family.enum,
    state: P.primary.properties.state.enum, next: P.primary.properties.nextMoveAfterCurrent.enum, instrumentType: P.instrument.properties.instrumentType.enum,
    mappingQuality: P.instrument.properties.mappingQuality.enum, priceAdjustment: P.instrument.properties.priceAdjustment.enum, basis: P.invalidation.properties.basis.enum };
};
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
/** correctedValue → Wert für den Datensatz. Wirft Error bei ungültiger Eingabe. "UNKNOWN" = laut Quelle unbekannt. */
export function parseCorrection(field, text, E = SCHEMA_ENUMS()) {
  const t = String(text).trim(), U = t.toUpperCase() === "UNKNOWN" || t === "null";
  const json = () => { try { return JSON.parse(t); } catch { throw new Error("kein gültiges JSON"); } };
  const en = (list) => { const v = t.toUpperCase(); if (!list.includes(v)) throw new Error("erlaubt: " + list.join("|")); return v; };
  switch (field) {
    case "timeframe": return en(E.timeframe);
    case "directionalBias": return en(E.directionalBias);
    case "primary.pattern": return en(E.pattern);
    case "primary.family": return en(E.family);
    case "primary.state": return en(E.state);
    case "primary.nextMoveAfterCurrent": return en(E.next);
    case "primary.currentWave": if (U) return null; if (t.length > 40) throw new Error("zu lang"); return t;
    case "publication.timestamp":
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(t) || isNaN(Date.parse(t))) throw new Error("ISO-8601 mit Offset erwartet");
      return t;
    case "primary.degree": {
      if (U) return { degreeLabel: null, degreeRank: null };
      const v = json(); if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Objekt erwartet");
      for (const k of Object.keys(v)) if (!["degreeLabel", "degreeRank"].includes(k)) throw new Error("unbekannter Schlüssel " + k);
      if (v.degreeRank !== undefined && v.degreeRank !== null && !(Number.isInteger(v.degreeRank) && v.degreeRank >= -2 && v.degreeRank <= 5)) throw new Error("degreeRank −2…5 oder null");
      if (v.degreeLabel !== undefined && v.degreeLabel !== null && typeof v.degreeLabel !== "string") throw new Error("degreeLabel Text oder null");
      return v;
    }
    case "targetZones": {
      if (U) return [];
      const v = json(); if (!Array.isArray(v)) throw new Error("Liste erwartet");
      for (const z of v) { if (!z || !isNum(z.low) || !isNum(z.high)) throw new Error("Zone braucht low/high (Zahl)"); for (const k of Object.keys(z)) if (!["low", "high", "label"].includes(k)) throw new Error("unbekannter Schlüssel " + k); }
      return v;
    }
    case "invalidation": {
      if (U) return null;
      const v = json(); if (!v || !isNum(v.price) || !["below", "above"].includes(v.direction)) throw new Error("{price: Zahl, direction: below|above} erwartet");
      for (const k of Object.keys(v)) if (!["price", "direction", "basis"].includes(k)) throw new Error("unbekannter Schlüssel " + k);
      if (v.basis !== undefined && !E.basis.includes(v.basis)) throw new Error("basis: " + E.basis.join("|"));
      return { price: v.price, direction: v.direction, basis: v.basis || "UNKNOWN" };
    }
    case "alternatives": {
      if (U) return [];
      const v = json(); if (!Array.isArray(v) || v.some((a) => !a || typeof a !== "object" || Array.isArray(a))) throw new Error("Liste von Objekten erwartet");
      for (const a of v) for (const k of Object.keys(a)) if (!["pattern", "currentWave", "directionalBias", "trigger", "note"].includes(k)) throw new Error("unbekannter Schlüssel " + k);
      return v;
    }
    case "instrument": {
      if (U) return { vuSymbol: null, mappingQuality: "UNMAPPED", instrumentType: "UNKNOWN" };
      const v = json(); if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Objekt erwartet");
      const allowed = { asShown: null, vuSymbol: null, instrumentType: E.instrumentType, mappingQuality: E.mappingQuality, priceAdjustment: E.priceAdjustment, levelScale: null };
      for (const [k, x] of Object.entries(v)) { if (!(k in allowed)) throw new Error("unbekannter Schlüssel " + k); if (allowed[k] && !allowed[k].includes(x)) throw new Error(k + ": " + allowed[k].join("|")); }
      return v;
    }
    default: throw new Error("unbekanntes Feld " + field);
  }
}
function applyCorrection(rec, field, value) {
  rec.primary ||= {};
  switch (field) {
    case "instrument": rec.instrument = { ...rec.instrument, ...value }; break;
    case "publication.timestamp": rec.publication = { ...rec.publication, timestamp: value }; break;
    case "primary.degree": Object.assign(rec.primary, value); break;
    default:
      if (field.startsWith("primary.")) rec.primary[field.slice(8)] = value;
      else rec[field] = value;
  }
}
/** Liest eine ausgefüllte Prüfung (CSV oder JSON) in eine einheitliche Zeilenliste. */
export function readReview(path) {
  const text = readFileSync(path, "utf8");
  if (/\.json$/i.test(path) || /^\s*\{/.test(text.replace(/^\uFEFF/, ""))) {
    const j = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (!Array.isArray(j.rows)) throw new Error("JSON-Prüfung ohne rows[]");
    return j.rows.map((r) => ({ packId: j.packId, reviewerId: j.reviewerId, reviewDate: j.reviewDate, ...r }));
  }
  return parseCsv(text);
}
/** Validiert die Prüfung gegen das Paket. Rückgabe {errors, rows (je auditRowId), reviewer}. */
export function validateReview(pack, rawRows) {
  const errors = [], byId = new Map(), E = SCHEMA_ENUMS();
  const expected = new Map(pack.cases.flatMap((c) => c.auditRows.map((r) => [r.auditRowId, { c, r }])));
  const reviewers = new Set(), dates = new Set();
  rawRows.forEach((raw, i) => {
    const at = `Zeile ${i + 2}`;
    const id = String(raw.auditRowId || "").trim();
    if (!expected.has(id)) { errors.push(`${at}: unbekannte auditRowId „${id}“`); return; }
    if (byId.has(id)) { errors.push(`${at}: auditRowId doppelt ${id}`); return; }
    if (String(raw.packId || "").trim() !== pack.packId) errors.push(`${at}: packId „${raw.packId}“ ≠ ${pack.packId} (anderes Prüfpaket)`);
    const { r } = expected.get(id);
    if (raw.extractedValue !== undefined && String(raw.extractedValue) !== r.extractedValue) errors.push(`${at}: extractedValue verändert (${id})`);
    const verdict = String(raw.verdict || "").trim().toUpperCase();
    if (!verdict) errors.push(`${at}: verdict fehlt (${id})`);
    else if (!VERDICTS.includes(verdict)) errors.push(`${at}: verdict „${raw.verdict}“ unzulässig — erlaubt ${VERDICTS.join(", ")}`);
    const corr = String(raw.correctedValue ?? "").trim();
    let parsed;
    if (verdict === "INCORRECT" && !corr) errors.push(`${at}: INCORRECT ohne correctedValue (${id}) — Wert laut Quelle oder UNKNOWN eintragen`);
    if (corr && (verdict === "INCORRECT" || verdict === "PARTIALLY_CORRECT")) {
      try { parsed = parseCorrection(r.field, corr, E); } catch (e) { errors.push(`${at}: correctedValue für ${r.field} ungültig: ${e.message}`); }
    }
    const rid = String(raw.reviewerId || "").trim(), rd = String(raw.reviewDate || "").trim();
    reviewers.add(rid); dates.add(rd);
    byId.set(id, { auditRowId: id, verdict, correctedValue: corr, parsed, reviewerNote: String(raw.reviewerNote || "").trim() });
  });
  for (const id of expected.keys()) if (!byId.has(id)) errors.push(`fehlende Zeile: ${id}`);
  const reviewerId = reviewers.size === 1 ? [...reviewers][0] : null, reviewDate = dates.size === 1 ? [...dates][0] : null;
  if (reviewers.size !== 1) errors.push(`reviewerId muss in allen Zeilen gleich und gesetzt sein (gefunden: ${[...reviewers].map((x) => x || "∅").join(", ")})`);
  else if (!REVIEWER_RE.test(reviewerId)) errors.push(`reviewerId „${reviewerId}“ ungültig (pseudonymer Code, 2–24 Zeichen A–Z 0–9 _ -)`);
  if (dates.size !== 1) errors.push(`reviewDate muss in allen Zeilen gleich und gesetzt sein`);
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate) || isNaN(Date.parse(reviewDate + "T00:00:00Z")) || new Date(reviewDate + "T00:00:00Z").toISOString().slice(0, 10) !== reviewDate) errors.push(`reviewDate „${reviewDate}“ ungültig (JJJJ-MM-TT)`);
  return { errors, rows: byId, reviewer: { id: reviewerId, date: reviewDate } };
}
function tally(items) {
  const t = { n: items.length, CORRECT: 0, INCORRECT: 0, PARTIALLY_CORRECT: 0, UNKNOWN: 0 };
  for (const v of items) t[v]++;
  const decided = t.n - t.UNKNOWN;
  return { ...t, decided, errorRate: rate(t.INCORRECT, decided), errorRateInclPartial: rate(t.INCORRECT + t.PARTIALLY_CORRECT, decided), ci95: wilson(t.INCORRECT, decided) };
}
function caseTally(caseList) {
  // Fall = fehlerhaft, wenn mindestens ein Kernfeld INCORRECT; entscheidbar, wenn mindestens ein Kernfeld nicht UNKNOWN
  const decided = caseList.filter((c) => c.core.some((v) => v !== "UNKNOWN"));
  const bad = decided.filter((c) => c.core.includes("INCORRECT")).length;
  const badP = decided.filter((c) => c.core.some((v) => v === "INCORRECT" || v === "PARTIALLY_CORRECT")).length;
  return { n: caseList.length, decided: decided.length, withCoreError: bad, errorRate: rate(bad, decided.length), errorRateInclPartial: rate(badP, decided.length), ci95: wilson(bad, decided.length) };
}
export const MEDIUM_POLICY = Object.freeze({
  rule: "MEDIUM-Fälle sind für die Entwicklung (DEVELOPMENT/VALIDATION) nutzbar, wenn ihre Fall-Fehlerquote (Kernfeld INCORRECT) ≤ Fall-Fehlerquote HIGH + 10 Prozentpunkte. Vorab festgelegt am 05.10.2026, vor jedem Ergebnis.",
  marginPp: 10,
});
/** Reine Kennzahlberechnung. */
export function computeMetrics(pack, rows) {
  const fieldItems = [], cases = [];
  for (const c of pack.cases) {
    const core = [];
    for (const r of c.auditRows) {
      const v = rows.get(r.auditRowId).verdict;
      fieldItems.push({ v, field: r.field, core: r.core, conf: c.record.extraction.confidence, fam: c.source.sourceFamily, ab: r.abAgreement });
      if (r.core) core.push(v);
    }
    cases.push({ caseId: c.caseId, conf: c.record.extraction.confidence, fam: c.source.sourceFamily, core });
  }
  const by = (list, key) => { const o = {}; for (const x of list) (o[x[key]] ||= []).push(x); return o; };
  const fieldT = (list) => tally(list.map((x) => x.v));
  const byConf = {};
  for (const [k, list] of Object.entries(by(fieldItems, "conf"))) byConf[k] = { field: fieldT(list), coreField: fieldT(list.filter((x) => x.core)) };
  for (const [k, list] of Object.entries(by(cases, "conf"))) (byConf[k] ||= {}).case = caseTally(list);
  const byFam = {};
  for (const [k, list] of Object.entries(by(fieldItems, "fam"))) byFam[k] = { field: fieldT(list) };
  for (const [k, list] of Object.entries(by(cases, "fam"))) byFam[k].case = caseTally(list);
  const coreItems = fieldItems.filter((x) => x.core);
  const H = byConf.HIGH && byConf.HIGH.case, M = byConf.MEDIUM && byConf.MEDIUM.case;
  let decision = "UNDECIDABLE", threshold = null;
  if (H && M && H.errorRate !== null && M.errorRate !== null) {
    threshold = H.errorRate + MEDIUM_POLICY.marginPp / 100;
    decision = M.errorRate <= threshold + 1e-12 ? "MEDIUM_USABLE_FOR_DEVELOPMENT" : "MEDIUM_NOT_USABLE_FOR_DEVELOPMENT";
  }
  return {
    fieldLevel: { all: fieldT(fieldItems), coreOnly: fieldT(coreItems), byField: Object.fromEntries(AUDIT_FIELDS.map((s) => [s.field, fieldT(fieldItems.filter((x) => x.field === s.field))])) },
    caseLevel: { definition: "Fall fehlerhaft = mindestens ein Kernfeld (family, currentWave, direction, invalidation, timeframe, instrument) INCORRECT", ...caseTally(cases) },
    byConfidence: byConf, bySourceFamily: byFam,
    abAgreementVsHuman: Object.fromEntries(["AGREE", "DISAGREE", "NOT_STATED"].map((k) => [k, fieldT(coreItems.filter((x) => x.ab === k))])),
    mediumPolicy: { ...MEDIUM_POLICY, highCaseErrorRate: H ? H.errorRate : null, mediumCaseErrorRate: M ? M.errorRate : null, threshold, decision },
  };
}
/** Schreibt den Datensatz-Kandidaten V1.1 als NEUE Datei. Unveränderte Zeilen (auch versiegelte) werden ungelesen byte-identisch übernommen. */
export function writeCandidate(pack, rows, reviewer, o) {
  const raw = readFileSync(o.freeze, "utf8");
  const baseSha = sha256(raw);
  if (baseSha !== pack.dataset.sha256) throw new Error("Freeze-Datei passt nicht zum Prüfpaket");
  const byRef = {};
  const changes = [], notes = [];
  for (const c of pack.cases) for (const r of c.auditRows) {
    const x = rows.get(r.auditRowId);
    if ((x.verdict === "INCORRECT" || x.verdict === "PARTIALLY_CORRECT") && x.correctedValue) {
      (byRef[c.referenceId] ||= []).push({ field: r.field, value: x.parsed });
      changes.push({ referenceId: c.referenceId, caseId: c.caseId, field: r.field, verdict: x.verdict, from: r.extractedValue, to: formatValue(x.parsed), reviewerNote: x.reviewerNote || null });
    } else if (x.verdict === "PARTIALLY_CORRECT") notes.push({ referenceId: c.referenceId, field: r.field, verdict: x.verdict, reviewerNote: x.reviewerNote || null, change: "keine (ohne correctedValue)" });
  }
  const outLines = [];
  const done = new Set();
  for (const line of raw.split("\n")) {
    if (!line.trim()) { outLines.push(line); continue; }
    const id = Object.keys(byRef).find((ref) => line.includes(`"referenceId":"${ref}"`));
    if (!id) { outLines.push(line); continue; }
    const rec = JSON.parse(line);
    if (rec.referenceId !== id) { outLines.push(line); continue; }
    for (const ch of byRef[id]) applyCorrection(rec, ch.field, ch.value);
    rec.extraction.ambiguities = [...(rec.extraction.ambiguities || []),
      `Mensch-Audit V1.1-Kandidat (${reviewer.id}, ${reviewer.date}): korrigiert ${byRef[id].map((c) => c.field).join(", ")}`.slice(0, 400)];
    outLines.push(stableJson(rec)); done.add(id);
  }
  for (const id of Object.keys(byRef)) if (!done.has(id)) throw new Error("Zeile für Korrektur nicht gefunden: " + id);
  const text = outLines.join("\n");
  const file = join(o.out, "PRACTITIONER_REFERENCE_V1.1.candidate.jsonl");
  const changesFile = join(o.out, "PRACTITIONER_REFERENCE_V1.1.candidate.changes.json");
  mkdirSync(o.out, { recursive: true });
  writeFileSync(file, text);
  const meta = {
    version: "PRACTITIONER_REFERENCE_V1.1-CANDIDATE", status: "CANDIDATE — nicht eingefroren, ersetzt V1 nicht",
    label: LABEL, base: { version: pack.dataset.version, file: pack.dataset.file, sha256: baseSha },
    candidate: { file: basename(file), sha256: sha256(text) },
    reviewer, packId: pack.packId,
    rule: "INCORRECT/PARTIALLY_CORRECT mit correctedValue → Feld ersetzt; UNKNOWN als Korrektur → Feld unbekannt (UNKNOWN/null/[]); sonst unverändert. Revisionen und nicht geprüfte Zeilen unverändert.",
    changes, notesWithoutChange: notes,
  };
  writeJson(changesFile, meta);
  return { file, changesFile, sha256: meta.candidate.sha256, changes: changes.length };
}
export function runImport(reviewPath, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const packPath = o.pack || join(o.out, "audit-pack.json");
  if (!existsSync(packPath)) throw new Error("Prüfpaket fehlt: " + packPath + " — erst `select` und `export`");
  const pack = readJson(packPath);
  const freezeBefore = sha256(readFileSync(o.freeze));
  const { errors, rows, reviewer } = validateReview(pack, readReview(reviewPath));
  if (errors.length) { const e = new Error("Prüfung ungültig:\n  " + errors.slice(0, 50).join("\n  ") + (errors.length > 50 ? `\n  … (${errors.length} Fehler)` : "")); e.errors = errors; throw e; }
  const metrics = computeMetrics(pack, rows);
  const cand = writeCandidate(pack, rows, reviewer, o);
  if (sha256(readFileSync(o.freeze)) !== freezeBefore) throw new Error("Freeze-Datei wurde verändert — darf nicht passieren");
  const results = {
    format: "vu-practitioner-human-audit-results-1", status: "COMPLETED", label: LABEL, audit: AUDIT_LABEL,
    packId: pack.packId, dataset: pack.dataset, reviewer, importedFrom: basename(reviewPath), cases: pack.cases.length,
    rows: rows.size, metrics,
    candidate: { file: rel(cand.file), changesFile: rel(cand.changesFile), sha256: cand.sha256, changes: cand.changes },
    caveats: ["Ein einzelner Prüfer; Prüfer-Fehler nicht gemessen.", "Holdout-Fälle nicht geprüft (versiegelt); zweite Welle nach Entsiegelung möglich.", "n = 20 Fälle: Wilson-95-%-Intervalle beachten."],
  };
  writeJson(join(o.out, "results.json"), results);
  return results;
}

// ------------------------------------------------------------------ agreement (§15/§16/§45)
export function buildAgreement(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const manifest = loadManifest(o.manifest);
  const opened = openedCaseIds(manifest);
  const reg = loadRegistry(o.registry);
  const work = loadOpenedLines(o.refs, opened);
  const rows = work.rows.filter((r) => r.extraction && r.extraction.passes && r.extraction.passes.coreFieldAgreement);
  const fieldStats = (list) => Object.fromEntries(CORE_FIELDS.map((f) => {
    const t = { agree: 0, disagree: 0, notStated: 0 };
    for (const r of list) { const v = r.extraction.passes.coreFieldAgreement[f]; if (v === true) t.agree++; else if (v === false) t.disagree++; else t.notStated++; }
    return [f, { ...t, n: list.length, agreementRate: rate(t.agree, t.agree + t.disagree) }];
  }));
  const summary = (list) => ({
    rows: list.length,
    anyDisagreement: list.filter((r) => Object.values(r.extraction.passes.coreFieldAgreement).includes(false)).length,
    adjudicated: list.filter((r) => r.extraction.passes.adjudication).length,
    perField: fieldStats(list),
  });
  const group = (list, keyFn) => { const g = {}; for (const r of list) (g[keyFn(r)] ||= []).push(r); return Object.fromEntries(Object.entries(g).sort().map(([k, v]) => [k, summary(v)])); };
  const evPrefix = {}, ambAB = { rowsWithABNote: 0, notes: 0 };
  for (const r of rows) {
    for (const e of r.evidence || []) { const p = (String(e.note).match(/^([A-Z]):/) || [])[1] || "none"; evPrefix[p] = (evPrefix[p] || 0) + 1; }
    const n = (r.extraction.ambiguities || []).filter((a) => /^A\/B:/.test(a)).length; ambAB.notes += n; if (n) ambAB.rowsWithABNote++;
  }
  // beschreibend, geöffnete Originale des eingefrorenen V1
  const fr = loadOpenedLines(o.freeze, opened);
  const origs = fr.rows.filter((r) => r.viewKind === "ORIGINAL_PUBLISHED");
  const cnt = (list, fn) => { const c = {}; for (const r of list) { const k = fn(r); c[k] = (c[k] || 0) + 1; } return Object.fromEntries(Object.entries(c).sort()); };
  const imp = (list) => ({ n: list.length, impulse: list.filter((r) => r.primary && r.primary.pattern === "IMPULSE").length, impulseRate: rate(list.filter((r) => r.primary && r.primary.pattern === "IMPULSE").length, list.length),
    motive: list.filter((r) => r.primary && r.primary.family === "MOTIVE").length, motiveRate: rate(list.filter((r) => r.primary && r.primary.family === "MOTIVE").length, list.length) });
  const by = (fn) => { const g = {}; for (const r of origs) (g[fn(r)] ||= []).push(r); return Object.fromEntries(Object.entries(g).sort().map(([k, v]) => [k, { ...imp(v), pattern: cnt(v, (r) => r.primary.pattern) }])); };
  const fam = (r) => sourceFamilyOf(reg, r.sourceId);
  return {
    format: "vu-practitioner-extraction-agreement-1", label: LABEL, audit: "nur geöffnete Fälle (DEVELOPMENT/VALIDATION); Holdouts versiegelt, nur gezählt; keine VU-Ausgaben",
    sources: { workingFile: rel(o.refs), workingFileSha256: work.sha256, freeze: rel(o.freeze), freezeSha256: fr.sha256 },
    population: { openedCases: opened.size, sealedCases: Object.keys(manifest.splits.byCase).length - opened.size, workingRowsOpened: work.rows.length, workingRowsSealedNotRead: work.sealed,
      rowsWithPasses: rows.length, byStatus: cnt(work.rows, (r) => r.status), byViewKind: cnt(work.rows, (r) => r.viewKind) },
    definitions: {
      coreFieldAgreement: "aus extraction.passes (dual-extraction.mjs): true = A und B gleich, false = abweichend, NOT_STATED = in beiden nicht genannt; agreementRate = agree/(agree+disagree)",
      note: "HIGH setzt per Definition (Nachtrag 2 Punkt 3) Übereinstimmung aller genannten Kernfelder voraus — Abweichungsquote bei HIGH ist daher konstruktionsbedingt 0. passes enthält außer a, b, adjudication und coreFieldAgreement keine weiteren Feldangaben.",
    },
    agreement: {
      overall: summary(rows),
      byConfidence: group(rows, (r) => r.extraction.confidence),
      bySourceFamily: group(rows, fam),
      byViewKind: group(rows, (r) => r.viewKind),
      byStatus: group(rows, (r) => r.status),
      evidenceNotesByPass: evPrefix, ambiguityNotesAB: ambAB,
    },
    descriptiveOpenedCases: {
      basis: "eingefrorene Originale (ORIGINAL_PUBLISHED) der 35 geöffneten Fälle",
      overall: { ...imp(origs), pattern: cnt(origs, (r) => r.primary.pattern), family: cnt(origs, (r) => r.primary.family) },
      bySourceFamily: by(fam), byTimeframe: by((r) => r.timeframe), byBtc: by((r) => (isBtc(r) ? "BTC" : "NON_BTC")), byConfidence: by((r) => r.extraction.confidence),
      familyBySourceFamily: Object.fromEntries(Object.entries((() => { const g = {}; for (const r of origs) (g[fam(r)] ||= []).push(r); return g; })()).sort().map(([k, v]) => [k, cnt(v, (r) => r.primary.family)])),
    },
  };
}

// ------------------------------------------------------------------ status
export function auditStatus(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const problems = [];
  const files = ["selection.json", "audit-pack.json", "audit-pack.csv", "AUDIT_PACK.md"].map((f) => join(o.out, f));
  for (const f of files) if (!existsSync(f)) problems.push("fehlt: " + rel(f));
  const manifest = loadManifest(o.manifest);
  const freezeSha = sha256(readFileSync(o.freeze));
  if (freezeSha !== manifest.sha256) problems.push("Freeze-Hash ≠ Manifest");
  let pack = null;
  if (!problems.length) {
    const sel = readJson(files[0]); pack = readJson(files[1]);
    const fresh = buildSelection(o);
    if (JSON.stringify(sel.cases.map((c) => c.caseId)) !== JSON.stringify(fresh.cases.map((c) => c.caseId))) problems.push("selection.json nicht reproduzierbar");
    if (pack.dataset.sha256 !== freezeSha) problems.push("Prüfpaket gehört zu anderem Freeze");
    const opened = openedCaseIds(manifest);
    if (pack.cases.some((c) => !opened.has(c.caseId))) problems.push("Prüfpaket enthält nicht geöffnete Fälle");
    if (!sel.checks.allOk) problems.push("Schichtungsbedingungen nicht erfüllt");
  }
  const resultsPath = join(o.out, "results.json");
  if (problems.length) return { status: "BLOCKED", line: "HUMAN EXTRACTION AUDIT: BLOCKED — " + problems.join("; "), problems };
  if (existsSync(resultsPath)) {
    const r = readJson(resultsPath);
    if (r.packId === pack.packId) return { status: "COMPLETED", line: `HUMAN EXTRACTION AUDIT: COMPLETED (Prüfer ${r.reviewer.id}, ${r.reviewer.date}; Fall-Fehlerquote ${pct(r.metrics.caseLevel.errorRate)}; MEDIUM-Regel: ${r.metrics.mediumPolicy.decision})`, problems };
  }
  return { status: "READY", line: STATUS_READY_LINE, problems, packId: pack.packId, cases: pack.cases.length, rows: pack.cases.reduce((s, c) => s + c.auditRows.length, 0) };
}

// ------------------------------------------------------------------ CLI
function parseArgs(argv) {
  const o = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) o[a.slice(2)] = argv[++i]; else pos.push(a); }
  for (const k of ["out", "freeze", "manifest", "refs", "pack", "registry"]) if (o[k]) o[k] = resolve(o[k]);
  return { o, pos };
}
export function main(argv) {
  const { o, pos } = parseArgs(argv);
  const opts = { ...DEFAULTS, ...o };
  const cmd = pos[0];
  if (cmd === "select") {
    const sel = buildSelection(opts);
    writeJson(join(opts.out, "selection.json"), sel);
    console.log(`selection.json: ${sel.cases.length} Fälle (geöffnet ${sel.population.openedCases}, versiegelt ${sel.population.sealedCases} nur gezählt); Bedingungen ${sel.checks.allOk ? "erfüllt" : "NICHT erfüllt"}`);
    for (const k of ["sourceFamily", "timeframe", "family", "confidence", "btc", "split"]) console.log(`  ${k}: ${JSON.stringify(sel.strata.selected[k])}`);
    if (sel.log.length) console.log("  Hinweise: " + sel.log.join("; "));
    return sel.checks.allOk ? 0 : 1;
  }
  if (cmd === "export") {
    const selPath = join(opts.out, "selection.json");
    if (!existsSync(selPath)) throw new Error("selection.json fehlt — erst `select`");
    const sel = readJson(selPath);
    const pack = buildPack(sel, opts);
    writeJson(join(opts.out, "audit-pack.json"), pack);
    writeFileSync(join(opts.out, "audit-pack.csv"), "\uFEFF" + toCsv(packToCsvRows(pack)));
    writeFileSync(join(opts.out, "AUDIT_PACK.md"), packToMarkdown(pack, sel));
    console.log(`Prüfpaket ${pack.packId}: ${pack.cases.length} Fälle, ${pack.cases.reduce((s, c) => s + c.auditRows.length, 0)} Feldzeilen → audit-pack.json / audit-pack.csv / AUDIT_PACK.md`);
    return 0;
  }
  if (cmd === "import") {
    if (!pos[1]) throw new Error("Aufruf: import <reviewed.csv|json>");
    const r = runImport(resolve(pos[1]), opts);
    const m = r.metrics;
    console.log(`Import ok (${r.reviewer.id}, ${r.reviewer.date}): Feld-Fehlerquote ${pct(m.fieldLevel.all.errorRate)}, Kernfelder ${pct(m.fieldLevel.coreOnly.errorRate)}, Fall-Fehlerquote ${pct(m.caseLevel.errorRate)}`);
    for (const k of ["HIGH", "MEDIUM"]) if (m.byConfidence[k]) console.log(`  ${k}: Fall ${pct(m.byConfidence[k].case.errorRate)} (n=${m.byConfidence[k].case.decided}), Feld ${pct(m.byConfidence[k].field.errorRate)}`);
    console.log(`  MEDIUM-Regel: ${m.mediumPolicy.decision}`);
    console.log(`  Kandidat V1.1: ${r.candidate.file} (${r.candidate.changes} Änderungen) — freeze/ unverändert`);
    return 0;
  }
  if (cmd === "agreement") {
    const a = buildAgreement(opts);
    writeJson(join(opts.out, "extraction-agreement.json"), a);
    const ov = a.agreement.overall;
    console.log(`extraction-agreement.json: ${ov.rows} Zeilen (geöffnet), Abweichung in ≥1 Kernfeld: ${ov.anyDisagreement}, Schiedsdurchgang: ${ov.adjudicated}`);
    for (const [f, s] of Object.entries(ov.perField)) console.log(`  ${f}: gleich ${s.agree}, abweichend ${s.disagree}, nicht genannt ${s.notStated} → ${pct(s.agreementRate)}`);
    return 0;
  }
  if (cmd === "status") {
    const s = auditStatus(opts);
    console.log(s.line);
    return s.status === "BLOCKED" ? 1 : 0;
  }
  console.error("Aufruf: node scripts/technical/practitioner/human-audit.mjs select|export|import <datei>|agreement|status [--out dir]");
  return 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error("Fehler: " + e.message); process.exitCode = 1; }
}
