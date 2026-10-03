#!/usr/bin/env node
/* Experten-Uebereinstimmung (Mission IV §6–§13, §63–§67, §76–§80) fuer die Elliott-Werkbank (Schema vu-elliott-annotation-2.0.0).
   Zaehlt NUR menschliche Annotationen (sourceType MANUAL_VU_REVIEW / EXTERNAL_PRACTITIONER) mit pseudonymem Annotator-Code.
   TEST und AUTOMATED werden nie gezaehlt. Je annotationId gilt die LETZTE BLINDE Version (postReveal=false).
   EXPERT_HOLDOUT-Faelle (cases-sealed.json) werden nicht ausgewertet, ausser mit --unseal-expert-holdout (nur fuer die spaetere,
   einmalige Holdout-Auswertung).
   Paare: Engine↔A, Engine↔B, A↔B (Rollen ueber raterSlot); Fleiss' Kappa fuer Faelle mit A, B und C.
   Kennzahlen je Paar: exakter Grad, Grad ±1 (ordinal, Frost & Prechter), gleiche laufende Welle, gleiche Musterfamilie, gleiche Richtung,
   Invalidierung nahe (≤ max(3 %, 1 ATR-Aequivalent)), Zielzonen schneiden sich, Haupt/Alternative-Ueberlappung, Anwendbarkeit gleich,
   Enthaltung gleich; Cohens Kappa (nominal), linear gewichtetes Kappa (Grad, Anwendbarkeit). Nur bei ≥ 2 Ratern und ≥ 10 Einheiten,
   sonst null mit Grund.
   Engine-Grad ist HEURISTISCH (mittlere Wellendauer → F&P-Grad, siehe cases-sealed.json degreeMethod).
   Aufruf: node scripts/technical/elliott-expert-agreement.mjs [export1.json …] [--unseal-expert-holdout] [--out pfad]
           ohne Dateien: liest quant/research/elliott-workbench/annotations/*.json (falls vorhanden)
           node scripts/technical/elliott-expert-agreement.mjs --selftest   (mechanischer Formeltest, schreibt NICHTS)
   Ergebnis: quant/research/elliott-workbench/expert-agreement-results.json */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WB = join(ROOT, "quant/research/elliott-workbench");
const SCHEMA = "vu-elliott-annotation-2.0.0";
const MIN_UNITS = 10;
export const DEGREES = ["Grand Supercycle", "Supercycle", "Cycle", "Primary", "Intermediate", "Minor", "Minute", "Minuette", "Subminuette"];
const PATTERNS = ["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL", "ZIGZAG", "FLAT", "TRIANGLE", "WXY", "DOUBLE_ZIGZAG", "TRIPLE_ZIGZAG", "COMBINATION", "UNCLEAR"];
const WAVES = ["1", "2", "3", "4", "5", "A", "B", "C", "D", "E", "W", "X", "Y", "X2", "Z", "COMPLETE"];
const STATUS = ["DEVELOPING", "CONFIRMED", "POSSIBLE"], DIRS = ["UP", "DOWN", "SIDEWAYS"], APPL = ["HIGH", "MODERATE", "LOW"];
const CODE_RE = /^[A-Za-z0-9_-]{2,24}$/;
const r3 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const family = (p) => (!p ? null : /IMPULSE|DIAGONAL/.test(p) ? "MOTIVE" : p === "UNCLEAR" ? "NONE" : "CORRECTIVE");

/* ───────────── Kappa-Formeln ───────────── */
/** Cohens Kappa (2 Rater, nominal). pairs: [[a, b], …] */
export function cohenKappa(pairs) {
  const n = pairs.length; if (n < 1) return { value: null, reason: "keine Einheiten" };
  const cats = [...new Set(pairs.flat())], ma = {}, mb = {}; let agree = 0;
  pairs.forEach(([a, b]) => { ma[a] = (ma[a] || 0) + 1; mb[b] = (mb[b] || 0) + 1; if (a === b) agree++; });
  const po = agree / n, pe = cats.reduce((s, c) => s + ((ma[c] || 0) / n) * ((mb[c] || 0) / n), 0);
  if (Math.abs(1 - pe) < 1e-12) return { value: null, po, pe, reason: "erwartete Uebereinstimmung = 1 (keine Varianz) — Kappa undefiniert" };
  return { value: (po - pe) / (1 - pe), po, pe };
}
/** Linear gewichtetes Kappa (Cohen 1968), ordinal. pairs: [[i, j], …] Indizes 0..k-1. Disagreement-Gewichte |i−j|/(k−1). */
export function weightedKappaLinear(pairs, k) {
  const n = pairs.length; if (n < 1) return { value: null, reason: "keine Einheiten" };
  if (k < 2) return { value: null, reason: "weniger als 2 Kategorien" };
  const ma = new Array(k).fill(0), mb = new Array(k).fill(0); let obs = 0;
  pairs.forEach(([i, j]) => { ma[i]++; mb[j]++; obs += Math.abs(i - j) / (k - 1); });
  let exp = 0; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) exp += (ma[i] / n) * (mb[j] / n) * Math.abs(i - j) / (k - 1);
  obs /= n;
  if (exp < 1e-12) return { value: null, reason: "erwartete Abweichung = 0 (keine Varianz) — Kappa undefiniert" };
  return { value: 1 - obs / exp, observedDisagreement: obs, expectedDisagreement: exp };
}
/** Unabhaengige Zweitberechnung (Agreement-Gewichte w = 1 − |i−j|/(k−1)) — nur fuer den Selbsttest. */
function weightedKappaAgreementForm(pairs, k) {
  const n = pairs.length, ma = new Array(k).fill(0), mb = new Array(k).fill(0), w = (i, j) => 1 - Math.abs(i - j) / (k - 1);
  let po = 0; pairs.forEach(([i, j]) => { ma[i]++; mb[j]++; po += w(i, j); }); po /= n;
  let pe = 0; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) pe += (ma[i] / n) * (mb[j] / n) * w(i, j);
  return (po - pe) / (1 - pe);
}
/** Fleiss' Kappa. counts: Matrix N×k (je Einheit Anzahl Rater je Kategorie), gleiche Raterzahl m ≥ 2 je Einheit. */
export function fleissKappa(counts) {
  const N = counts.length; if (N < 1) return { value: null, reason: "keine Einheiten" };
  const m = counts[0].reduce((a, b) => a + b, 0);
  if (m < 2) return { value: null, reason: "weniger als 2 Rater je Einheit" };
  if (counts.some((row) => row.reduce((a, b) => a + b, 0) !== m)) return { value: null, reason: "ungleiche Raterzahl je Einheit" };
  const k = counts[0].length, pj = new Array(k).fill(0); let Pbar = 0;
  counts.forEach((row) => { row.forEach((x, j) => { pj[j] += x; }); Pbar += (row.reduce((s, x) => s + x * x, 0) - m) / (m * (m - 1)); });
  Pbar /= N; for (let j = 0; j < k; j++) pj[j] /= N * m;
  const Pe = pj.reduce((s, p) => s + p * p, 0);
  if (Math.abs(1 - Pe) < 1e-12) return { value: null, Pbar, Pe, reason: "erwartete Uebereinstimmung = 1 — Kappa undefiniert" };
  return { value: (Pbar - Pe) / (1 - Pe), Pbar, Pe };
}

/* ───────────── Validierung (identisch zur Werkbank) ───────────── */
function validCount(c, cutoff, e, who) {
  if (!c || typeof c !== "object") { e.push(who + ": fehlt"); return; }
  if (!PATTERNS.includes(c.pattern)) e.push(who + ": pattern");
  if (!DEGREES.includes(c.degree)) e.push(who + ": degree");
  if (!WAVES.includes(c.currentWave)) e.push(who + ": currentWave");
  if (!STATUS.includes(c.status)) e.push(who + ": status");
  if (!DIRS.includes(c.direction)) e.push(who + ": direction");
  if (!Array.isArray(c.pivots)) e.push(who + ": pivots");
  else c.pivots.forEach((p, i) => { if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !(p.price > 0)) e.push(who + ": pivot " + (i + 1)); else if (cutoff && p.date > cutoff) e.push(who + ": pivot nach Stichtag"); });
  if (c.invalidation != null && !Number.isFinite(c.invalidation)) e.push(who + ": invalidation");
  if (c.targetZone != null && !(Array.isArray(c.targetZone) && c.targetZone.length === 2 && c.targetZone.every(Number.isFinite) && c.targetZone[0] <= c.targetZone[1])) e.push(who + ": targetZone");
}
export function validate(a, knownCases) {
  const e = [];
  if (!a || typeof a !== "object") return ["kein Objekt"];
  if (a.schemaVersion !== SCHEMA) e.push("schemaVersion");
  if (!CODE_RE.test(a.annotatorCode || "")) e.push("annotatorCode nicht pseudonym/ungueltig");
  if (a.annotationId !== a.caseId + "|" + a.annotatorCode) e.push("annotationId");
  if (!(Number.isInteger(a.version) && a.version >= 1)) e.push("version");
  if (!["A", "B", "C"].includes(a.raterSlot)) e.push("raterSlot");
  if (!["MANUAL_VU_REVIEW", "EXTERNAL_PRACTITIONER", "TEST"].includes(a.sourceType)) e.push("sourceType (AUTOMATED nie zulaessig)");
  if (typeof a.blindMode !== "boolean" || typeof a.postReveal !== "boolean" || typeof a.noReliableCount !== "boolean") e.push("boolesche Felder");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.cutoff || "")) e.push("cutoff");
  if (!APPL.includes(a.applicability)) e.push("applicability");
  if (!(Number.isInteger(a.confidence) && a.confidence >= 1 && a.confidence <= 5)) e.push("confidence");
  if (!a.noReliableCount || a.primary) validCount(a.primary, a.cutoff, e, "primary");
  if (a.alternative) validCount(a.alternative, a.cutoff, e, "alternative");
  if (!a.createdAt || !a.savedAt) e.push("Zeitstempel");
  if (knownCases && !knownCases.has(a.caseId)) e.push("unbekannter Fall");
  return e;
}

/* ───────────── Rater-Sicht je Fall ───────────── */
function humanView(a, atr) {
  const p = a.noReliableCount ? null : a.primary, alt = a.alternative;
  return { pattern: p ? p.pattern : null, family: p ? family(p.pattern) : null, degree: p ? DEGREES.indexOf(p.degree) : null, wave: p ? p.currentWave : null, dir: p ? p.direction : null,
           inv: p && Number.isFinite(p.invalidation) ? p.invalidation : null, zone: p && p.targetZone ? p.targetZone : null,
           key: p ? p.pattern + "|" + p.currentWave : null, altKey: alt ? alt.pattern + "|" + alt.currentWave : null,
           appl: a.applicability, abstain: !!a.noReliableCount, atr };
}
function engineView(sc) {
  const v3 = sc && sc.engine && sc.engine.v3; if (!v3) return null;
  const p = v3.primary, alt = v3.alternative, atr = Number.isFinite(v3.atr) ? v3.atr : null;
  const wave = (c) => (c ? (c.complete ? "COMPLETE" : String(c.wave)) : null);
  return { pattern: p ? p.pattern : null, family: p ? family(p.pattern) : null, degree: p && p.degreeHeuristic ? DEGREES.indexOf(p.degreeHeuristic) : null, wave: wave(p), dir: p ? p.direction : null,
           inv: p && Number.isFinite(p.inv) ? p.inv : null, zone: p && p.targetZone ? p.targetZone : null,
           key: p ? p.pattern + "|" + wave(p) : null, altKey: alt ? alt.pattern + "|" + wave(alt) : null,
           appl: v3.applicability ? v3.applicability.level : null, abstain: v3.applicability ? !!v3.applicability.abstain : !p, atr };
}
const has = (v) => v !== null && v !== undefined && !(typeof v === "number" && v < 0);
const METRICS = {
  exactDegree: (x, y) => has(x.degree) && has(y.degree) ? x.degree === y.degree : null,
  degreeWithinOne: (x, y) => has(x.degree) && has(y.degree) ? Math.abs(x.degree - y.degree) <= 1 : null,
  sameCurrentWave: (x, y) => x.wave && y.wave ? x.wave === y.wave : null,
  samePatternFamily: (x, y) => x.family && y.family ? x.family === y.family : null,
  sameDirection: (x, y) => x.dir && y.dir ? x.dir === y.dir : null,
  invalidationOverlap: (x, y) => x.inv !== null && y.inv !== null ? Math.abs(x.inv - y.inv) <= Math.max(0.03 * Math.max(Math.abs(x.inv), Math.abs(y.inv)), x.atr || y.atr || 0) : null,
  targetZoneOverlap: (x, y) => x.zone && y.zone ? x.zone[0] <= y.zone[1] && y.zone[0] <= x.zone[1] : null,
  primaryAlternativeOverlap: (x, y) => x.key && y.key ? x.key === y.key || x.key === y.altKey || (!!x.altKey && y.key === x.altKey) : null,
  applicabilityAgreement: (x, y) => x.appl && y.appl ? x.appl === y.appl : null,
  abstentionAgreement: (x, y) => typeof x.abstain === "boolean" && typeof y.abstain === "boolean" ? x.abstain === y.abstain : null
};
const NOMINAL = { pattern: "pattern", patternFamily: "family", currentWave: "wave", direction: "dir", applicability: "appl", abstention: "abstain" };
function gate(n, raters) { return raters < 2 ? "weniger als 2 Rater" : n < MIN_UNITS ? "n=" + n + " < " + MIN_UNITS + " Einheiten" : null; }
export function pairStats(units) {   // units: [{ x, y }]
  const out = { units: units.length, agreement: {}, kappa: {} };
  for (const [name, fn] of Object.entries(METRICS)) {
    const v = units.map((u) => fn(u.x, u.y)).filter((b) => b !== null), why = gate(v.length, 2);
    out.agreement[name] = why ? { value: null, n: v.length, reason: why } : { value: r3(v.filter(Boolean).length / v.length), n: v.length };
  }
  for (const [name, k] of Object.entries(NOMINAL)) {
    const pr = units.filter((u) => u.x[k] !== null && u.x[k] !== undefined && u.y[k] !== null && u.y[k] !== undefined).map((u) => [String(u.x[k]), String(u.y[k])]), why = gate(pr.length, 2);
    if (why) { out.kappa[name + "_cohen"] = { value: null, n: pr.length, reason: why }; continue; }
    const r = cohenKappa(pr); out.kappa[name + "_cohen"] = { value: r3(r.value), n: pr.length, po: r3(r.po), pe: r3(r.pe), reason: r.reason || null };
  }
  const ord = (name, get, k) => {
    const pr = units.map((u) => [get(u.x), get(u.y)]).filter(([a, b]) => a >= 0 && b >= 0 && a !== null && b !== null), why = gate(pr.length, 2);
    if (why) { out.kappa[name] = { value: null, n: pr.length, reason: why }; return; }
    const r = weightedKappaLinear(pr, k); out.kappa[name] = { value: r3(r.value), n: pr.length, reason: r.reason || null };
  };
  ord("degree_weightedLinear", (v) => (has(v.degree) ? v.degree : null), DEGREES.length);
  ord("applicability_weightedLinear", (v) => (v.appl ? APPL.indexOf(v.appl) : null), APPL.length);
  return out;
}
function fleissFor(triples, key, cats) {
  const rows = triples.filter((t) => t.every((v) => v[key] !== null && v[key] !== undefined)).map((t) => cats.map((c) => t.filter((v) => String(v[key]) === c).length));
  const why = rows.length < MIN_UNITS ? "n=" + rows.length + " < " + MIN_UNITS + " Einheiten mit 3 Ratern" : null;
  if (why) return { value: null, n: rows.length, reason: why };
  const r = fleissKappa(rows); return { value: r3(r.value), n: rows.length, reason: r.reason || null };
}

/* ───────────── Auswertung ───────────── */
export function evaluate(annotations, sealedCases, opts = {}) {
  const known = new Set(Object.keys(sealedCases));
  const rejected = [], ignored = { TEST: 0, AUTOMATED: 0, postRevealOnly: 0, expertHoldout: 0, slotConflict: 0 };
  const latest = new Map();
  for (const a of annotations) {
    if (a && a.sourceType === "AUTOMATED") { ignored.AUTOMATED++; continue; }
    const e = validate(a, known); if (e.length) { rejected.push({ annotationId: a && a.annotationId, version: a && a.version, errors: e }); continue; }
    if (a.sourceType === "TEST") { ignored.TEST++; continue; }
    if (a.postReveal) continue;
    const prev = latest.get(a.annotationId); if (!prev || a.version > prev.version) latest.set(a.annotationId, a);
  }
  const blindIds = new Set([...latest.keys()]);
  ignored.postRevealOnly = new Set(annotations.filter((a) => a && a.postReveal && a.sourceType !== "TEST" && a.sourceType !== "AUTOMATED" && !blindIds.has(a.annotationId)).map((a) => a.annotationId)).size;
  const byCase = {};
  for (const a of latest.values()) {
    const sc = sealedCases[a.caseId];
    if (sc.split === "EXPERT_HOLDOUT" && !opts.unsealHoldout) { ignored.expertHoldout++; continue; }
    const slots = (byCase[a.caseId] = byCase[a.caseId] || {});
    if (slots[a.raterSlot]) { ignored.slotConflict++; if (a.createdAt >= slots[a.raterSlot].createdAt) continue; }
    slots[a.raterSlot] = a;
  }
  const units = { EA: [], EB: [], AB: [] }, triples = [];
  for (const [cid, slots] of Object.entries(byCase)) {
    const sc = sealedCases[cid], E = engineView(sc), atr = E ? E.atr : null;
    const A = slots.A ? humanView(slots.A, atr) : null, B = slots.B ? humanView(slots.B, atr) : null, C = slots.C ? humanView(slots.C, atr) : null;
    if (E && A) units.EA.push({ x: E, y: A, id: cid }); if (E && B) units.EB.push({ x: E, y: B, id: cid }); if (A && B) units.AB.push({ x: A, y: B, id: cid });
    if (A && B && C) triples.push([A, B, C]);
  }
  const humans = [...latest.values()];
  const fleiss = {};
  for (const [name, k] of Object.entries(NOMINAL)) {
    const cats = [...new Set(triples.flat().map((v) => v[k]).filter((v) => v !== null && v !== undefined).map(String))];
    fleiss[name] = fleissFor(triples, k, cats);
  }
  const counted = Object.values(byCase).reduce((s, x) => s + Object.keys(x).length, 0);
  return {
    status: counted === 0 ? "BLOCKED – no expert annotations" : [units.AB, units.EA, units.EB].some((u) => u.length >= MIN_UNITS) ? "COMPUTED – human review of results required" : "INSUFFICIENT – fewer than " + MIN_UNITS + " units per pair",
    expertValidated: false,
    annotations: { input: annotations.length, rejected: rejected.length, ignored, countedBlindLatest: counted, annotators: new Set(humans.map((a) => a.annotatorCode)).size, cases: Object.keys(byCase).length,
                   bySlot: { casesWithA: Object.values(byCase).filter((s) => s.A).length, casesWithB: Object.values(byCase).filter((s) => s.B).length, casesWithC: Object.values(byCase).filter((s) => s.C).length } },
    pairs: { "Engine↔A": pairStats(units.EA), "Engine↔B": pairStats(units.EB), "A↔B": pairStats(units.AB) },
    fleissABC: { units: triples.length, kappa: fleiss },
    rejected: rejected.slice(0, 50)
  };
}

/* ───────────── Selbsttest (nur im Speicher, schreibt nie) ───────────── */
function selftest() {
  const checks = [], near = (a, b, tol) => a !== null && Math.abs(a - b) <= tol;
  const ok = (name, cond, detail) => checks.push({ name, pass: !!cond, detail });
  const tab = (yy, yn, ny, nn) => [].concat(Array(yy).fill(["Y", "Y"]), Array(yn).fill(["Y", "N"]), Array(ny).fill(["N", "Y"]), Array(nn).fill(["N", "N"]));
  /* Lehrbuchwerte: Cohens Kappa (Wikipedia „Cohen's kappa“, Beispiele): 20/5/10/15 → 0,4; 45/15/25/15 → 0,1304; 25/35/5/35 → 0,2593 */
  let k = cohenKappa(tab(20, 5, 10, 15)); ok("TEST Cohen 20/5/10/15 = 0.400", near(k.value, 0.4, 1e-9), k.value);
  k = cohenKappa(tab(45, 15, 25, 15)); ok("TEST Cohen 45/15/25/15 = 0.1304", near(k.value, 0.1304, 5e-5), k.value);
  k = cohenKappa(tab(25, 35, 5, 35)); ok("TEST Cohen 25/35/5/35 = 0.2593", near(k.value, 0.2593, 5e-5), k.value);
  k = cohenKappa(tab(10, 0, 0, 0)); ok("TEST Cohen ohne Varianz → null mit Grund", k.value === null && !!k.reason, k.reason);
  /* Fleiss' Kappa: Wikipedia „Fleiss' kappa“ (10 Einheiten, 14 Rater, 5 Kategorien) → P̄ = 0,378, P̄e = 0,213, κ = 0,210 */
  const W = [[0, 0, 0, 0, 14], [0, 2, 6, 4, 2], [0, 0, 3, 5, 6], [0, 3, 9, 2, 0], [2, 2, 8, 1, 1], [7, 7, 0, 0, 0], [3, 2, 6, 3, 0], [2, 5, 3, 2, 2], [6, 5, 2, 1, 0], [0, 2, 2, 3, 7]];
  const fk = fleissKappa(W);
  ok("TEST Fleiss Wikipedia P̄ = 0.378", near(fk.Pbar, 0.378, 5e-4), fk.Pbar); ok("TEST Fleiss Wikipedia P̄e = 0.213", near(fk.Pe, 0.213, 5e-4), fk.Pe); ok("TEST Fleiss Wikipedia κ = 0.210", near(fk.value, 0.210, 5e-4), fk.value);
  ok("TEST Fleiss ungleiche Raterzahl → null", fleissKappa([[1, 1], [2, 1]]).value === null, null);
  /* Gewichtetes Kappa: (a) k=2 ⇒ identisch mit Cohen (0,4); (b) Handrechnung A=[0,1,2], B=[0,2,2], k=3 ⇒ 1 − (1/6)/(1/2) = 2/3;
     (c) perfekte Uebereinstimmung ⇒ 1; (d) Disagreement- und Agreement-Form stimmen ueberein (zufaellige Tabelle, fester Seed) */
  const bin = tab(20, 5, 10, 15).map(([a, b]) => [a === "Y" ? 0 : 1, b === "Y" ? 0 : 1]);
  ok("TEST gewichtet k=2 = Cohen 0.400", near(weightedKappaLinear(bin, 2).value, 0.4, 1e-9), weightedKappaLinear(bin, 2).value);
  ok("TEST gewichtet Handrechnung = 0.6667", near(weightedKappaLinear([[0, 0], [1, 2], [2, 2]], 3).value, 2 / 3, 1e-9), weightedKappaLinear([[0, 0], [1, 2], [2, 2]], 3).value);
  ok("TEST gewichtet perfekt = 1", near(weightedKappaLinear([[0, 0], [3, 3], [5, 5], [8, 8]], 9).value, 1, 1e-12), null);
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const R = Array.from({ length: 60 }, () => { const i = Math.floor(rnd() * 9); return [i, Math.max(0, Math.min(8, i + Math.floor(rnd() * 5) - 2))]; });
  ok("TEST gewichtet Disagreement- = Agreement-Form", near(weightedKappaLinear(R, 9).value, weightedKappaAgreementForm(R, 9), 1e-12), [weightedKappaLinear(R, 9).value, weightedKappaAgreementForm(R, 9)]);
  /* Pipeline mit synthetischen TEST-Fixtures (nur im Speicher; Fallcodes TEST-…; nie geschrieben) */
  const sealed = {}, ann = [], now = "2026-01-01T00:00:00.000Z";
  for (let i = 0; i < 14; i++) {
    const id = "TEST-CASE-" + i;
    sealed[id] = { split: i === 13 ? "EXPERT_HOLDOUT" : "DEVELOPMENT", engine: { v3: { atr: 1, primary: { pattern: i % 2 ? "ZIGZAG" : "IMPULSE", complete: false, wave: i % 2 ? "C" : "3", direction: "UP", degreeHeuristic: "Primary", inv: 100, targetZone: [110, 120] }, alternative: null, applicability: { level: "LOW", abstain: true } } } };
    for (const [slot, code] of [["A", "TESTA"], ["B", "TESTB"], ["C", "TESTC"]]) {
      const p = { pattern: i % 2 ? "ZIGZAG" : "IMPULSE", degree: slot === "B" && i % 3 === 0 ? "Intermediate" : "Primary", currentWave: i % 2 ? "C" : "3", status: "DEVELOPING", direction: slot === "C" && i % 4 === 0 ? "DOWN" : "UP", pivots: [], invalidation: 101, targetZone: [115, 125] };
      ann.push({ schemaVersion: SCHEMA, annotationId: id + "|" + code, version: 1, caseId: id, cutoff: "2020-01-03", annotatorCode: code, raterSlot: slot, sourceType: "MANUAL_VU_REVIEW", blindMode: true, postReveal: false,
                 noReliableCount: false, primary: p, alternative: null, applicability: slot === "A" ? "LOW" : "MODERATE", confidence: 3, comment: "", createdAt: now, savedAt: now });
    }
  }
  ann.push({ schemaVersion: SCHEMA, annotationId: "TEST-CASE-0|TESTA", version: 2, caseId: "TEST-CASE-0", cutoff: "2020-01-03", annotatorCode: "TESTA", raterSlot: "A", sourceType: "MANUAL_VU_REVIEW", blindMode: true, postReveal: true,
             noReliableCount: true, primary: null, alternative: null, applicability: "LOW", confidence: 1, comment: "postReveal darf nicht zaehlen", createdAt: now, savedAt: now });
  ann.push({ sourceType: "AUTOMATED", annotationId: "x" });
  const ev = evaluate(ann, sealed, {});
  const ab = ev.pairs["A↔B"], ea = ev.pairs["Engine↔A"];
  ok("TEST Pipeline: EXPERT_HOLDOUT ausgeschlossen (13 Einheiten)", ab.units === 13 && ev.annotations.ignored.expertHoldout === 3, ab.units);
  ok("TEST Pipeline: postReveal-Version ignoriert", ea.agreement.abstentionAgreement.n === 13 && ea.agreement.abstentionAgreement.value === 0, ea.agreement.abstentionAgreement);
  ok("TEST Pipeline: AUTOMATED ignoriert", ev.annotations.ignored.AUTOMATED === 1, ev.annotations.ignored);
  ok("TEST Pipeline: Engine↔A Grad exakt = 1", ea.agreement.exactDegree.value === 1, ea.agreement.exactDegree);
  ok("TEST Pipeline: Invalidierung 100 vs 101 nahe (ATR 1)", ea.agreement.invalidationOverlap.value === 1, null);
  ok("TEST Pipeline: Zielzonen [110,120]∩[115,125]", ea.agreement.targetZoneOverlap.value === 1, null);
  ok("TEST Pipeline: Kappa ohne Varianz → null mit Grund", ab.kappa.pattern_cohen.value !== null && ea.kappa.applicability_cohen.value === null && !!ea.kappa.applicability_cohen.reason, ea.kappa.applicability_cohen);
  ok("TEST Pipeline: Fleiss A,B,C berechnet", ev.fleissABC.units === 13 && ev.fleissABC.kappa.pattern.value === 1, ev.fleissABC.kappa.pattern);
  const small = evaluate(ann.filter((a) => /CASE-[0-4]\|/.test(a.annotationId || "")), sealed, {});
  ok("TEST Pipeline: n<10 → null mit Grund", small.pairs["A↔B"].agreement.exactDegree.value === null && /< 10/.test(small.pairs["A↔B"].agreement.exactDegree.reason), small.pairs["A↔B"].agreement.exactDegree);
  const asTest = evaluate(ann.map((a) => Object.assign({}, a, { sourceType: a.sourceType === "AUTOMATED" ? "AUTOMATED" : "TEST" })), sealed, {});
  ok("TEST Pipeline: sourceType TEST wird nie gezaehlt → BLOCKED", asTest.status.startsWith("BLOCKED"), asTest.status);
  const empty = evaluate([], sealed, {});
  ok("TEST Pipeline: ohne Annotation → BLOCKED – no expert annotations", empty.status === "BLOCKED – no expert annotations", empty.status);
  const failed = checks.filter((c) => !c.pass);
  checks.forEach((c) => console.log((c.pass ? "PASS " : "FAIL ") + c.name + (c.pass ? "" : "  → " + JSON.stringify(c.detail))));
  console.log(JSON.stringify({ selftest: failed.length ? "FAIL" : "PASS", checks: checks.length, failed: failed.length, note: "TEST-Fixtures nur im Speicher; es wurde keine Datei geschrieben." }));
  process.exit(failed.length ? 1 : 0);
}

/* ───────────── CLI ───────────── */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) selftest();
  else {
    const oi = args.indexOf("--out"), out = oi >= 0 ? args[oi + 1] : join(WB, "expert-agreement-results.json");
    let files = args.filter((a, i) => !a.startsWith("--") && !(oi >= 0 && i === oi + 1));
    const annDir = join(WB, "annotations");
    if (!files.length && existsSync(annDir)) files = readdirSync(annDir).filter((f) => f.endsWith(".json")).map((f) => join(annDir, f));
    const sealedPath = join(WB, "cases-sealed.json"), blindPath = join(WB, "cases-blind.json");
    if (!existsSync(sealedPath)) { console.error("cases-sealed.json fehlt — node scripts/technical/elliott-workbench-data.mjs ausfuehren"); process.exit(2); }
    const sealedText = readFileSync(sealedPath, "utf8"), sealedSha = createHash("sha256").update(sealedText, "utf8").digest("hex");
    const manifestSha = existsSync(blindPath) ? JSON.parse(readFileSync(blindPath, "utf8")).manifest.sealedSha256 : null;
    const sealed = JSON.parse(sealedText);
    const ann = []; for (const f of files) { const j = JSON.parse(readFileSync(f, "utf8")); (Array.isArray(j) ? j : j.annotations || []).forEach((a) => ann.push(a)); }
    const res = evaluate(ann, sealed.cases, { unsealHoldout: args.includes("--unseal-expert-holdout") });
    const result = Object.assign({ schemaVersion: "vu-elliott-expert-agreement-2.0.0", generatedAt: new Date().toISOString(),
      note: res.status.startsWith("BLOCKED") ? "Keine Expertenannotation vorhanden. Die Engine ist NICHT expert-validiert." : "Annotationen sind Praktiker-Urteile, keine objektive Wahrheit. Engine-Grad ist heuristisch.",
      inputs: files.map((f) => f.replace(ROOT + "/", "")), sealedSha256: sealedSha, commitmentMatchesManifest: manifestSha ? manifestSha === sealedSha : null, engines: sealed.engines,
      expertHoldout: args.includes("--unseal-expert-holdout") ? "UNSEALED (einmalige Holdout-Auswertung)" : "SEALED (nicht ausgewertet)", minUnits: MIN_UNITS }, res);
    writeFileSync(out, JSON.stringify(result, null, 1));
    console.log(JSON.stringify({ status: result.status, expertValidated: false, annotations: result.annotations, commitmentMatchesManifest: result.commitmentMatchesManifest, out: out.replace(ROOT + "/", "") }));
  }
}
