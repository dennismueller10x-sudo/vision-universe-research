#!/usr/bin/env node
/* Experten-Uebereinstimmung (Mission III §64–§67): wertet exportierte Annotationen der Werkbank aus
   (Schema vu-elliott-annotation-1.0.0). Zaehlt NUR Annotationen mit sourceType MANUAL_VU_REVIEW oder EXTERNAL_PRACTITIONER
   und einer annotierenden Person/Quelle; AUTOMATED wird nie als Expertenurteil gezaehlt.
   Kennzahlen
     Engine ↔ Mensch: Muster gleich · Wellenenden (F1, ±2 Bars) · Grad (Spannenverhaeltnis 0,5–2 = gleiche Ebene) ·
                      naechste Richtung gleich · Ungueltig-Niveau innerhalb 3 % · Enthaltung gleich (NO_RELIABLE_COUNT ↔ Engine enthaelt sich)
     Mensch ↔ Mensch: paarweise Uebereinstimmung (Muster, Richtung, Zaehlbarkeit) und Krippendorffs α (nominal) je Merkmal
     Blindmodus: Anteil der Annotationen, die im Blindmodus entstanden (Engine verdeckt)
   Aufruf: node scripts/technical/elliott-expert-agreement.mjs annotations1.json [annotations2.json …]
           → quant/data/technical-intelligence/elliott-validation/practitioner/expert-agreement.json
   Ohne echte Annotationen: Ergebnis "BLOCKED – keine Expertenannotation vorhanden". Keine erfundenen Labels. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/ti-data.mjs";

const files = process.argv.slice(2);
const DATA = join(ROOT, "quant/research/elliott-workbench/data.json");
const data = existsSync(DATA) ? JSON.parse(readFileSync(DATA, "utf8")) : { cases: [] };   // Werkbank-Daten: scripts/technical/elliott-workbench-data.mjs
const byId = {}; data.cases.forEach((c) => { byId[c.id] = c; byId[c.symbol + "|" + c.date] = c; });
const ann = [];
for (const f of files) { const j = JSON.parse(readFileSync(f, "utf8")); (j.annotations || []).forEach((a) => ann.push(a)); }
const human = ann.filter((a) => (a.sourceType === "MANUAL_VU_REVIEW" || a.sourceType === "EXTERNAL_PRACTITIONER") && a.annotator && String(a.annotator).trim());
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
const caseOf = (a) => byId[String(a.annotationId || "").split("|").slice(0, -1).join("|")] || byId[a.symbol + "|" + a.asOfDate] || null;
function pivots(a) { return String(a.pivots || "").split(";").map((x) => x.trim().split(":")).filter((x) => x.length >= 2 && x[0]).map((x) => ({ d: x[0], p: +x[1], l: x[2] || "" })); }
function enginePivots(cn) { if (!cn) return []; const out = [{ d: cn.waves[0].a, p: cn.waves[0].pa }]; cn.waves.forEach((w) => out.push({ d: w.b, p: w.pb })); return out; }
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
function f1(A, B, tolDays) { if (!A.length || !B.length) return null; const hit = A.filter((x) => B.some((y) => days(x.d, y.d) <= tolDays)).length, hit2 = B.filter((y) => A.some((x) => days(x.d, y.d) <= tolDays)).length; const p = hit / A.length, r = hit2 / B.length; return p + r ? 2 * p * r / (p + r) : 0; }
const span = (P) => (P.length > 1 ? days(P[0].d, P[P.length - 1].d) : null);
const dirOf = (cn) => (cn ? (cn.next === "UP" ? "UP" : cn.next === "DOWN" ? "DOWN" : "UNKNOWN") : "UNKNOWN");

const rows = [];
for (const a of human) {
  const c = caseOf(a); if (!c) continue;
  const e = c.v3 && c.v3.primary, tol = c.timeframe === "1W" ? 14 : 3, A = pivots(a), E = enginePivots(e);
  const sA = span(A), sE = span(E), abst = !!(c.v3 && c.v3.applicability && c.v3.applicability.abstain);
  rows.push({ id: c.id, annotator: a.annotator, blind: !!a.blind, patternMatch: e && a.pattern ? (e.pattern === a.pattern ? 1 : 0) : null, pivotF1: f1(A, E, tol),
              degreeMatch: sA && sE ? (sA / sE >= 0.5 && sA / sE <= 2 ? 1 : 0) : null, directionMatch: a.nextDirection && a.nextDirection !== "UNKNOWN" ? (dirOf(e) === a.nextDirection ? 1 : 0) : null,
              invalidationMatch: a.invalidation && e && e.inv ? (Math.abs(+a.invalidation - e.inv) <= 0.03 * Math.abs(e.inv) ? 1 : 0) : null,
              abstentionMatch: a.validity ? ((a.validity === "NO_RELIABLE_COUNT") === abst ? 1 : 0) : null, pattern: a.pattern || null, dir: a.nextDirection || null, validity: a.validity || null });
}
const mean = (k) => { const v = rows.map((r) => r[k]).filter((x) => x !== null && x !== undefined); return v.length ? { value: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(3), n: v.length } : { value: null, n: 0 }; };
/* Krippendorffs α (nominal) ueber Faelle mit ≥ 2 Annotationen */
function alpha(key) {
  const units = {}; rows.forEach((r) => { if (r[key]) (units[r.id] = units[r.id] || []).push(r[key]); });
  const U = Object.values(units).filter((u) => u.length >= 2); if (!U.length) return { value: null, units: 0 };
  const cats = {}; let n = 0; U.forEach((u) => u.forEach((v) => { cats[v] = (cats[v] || 0) + 1; n++; }));
  let Do = 0; U.forEach((u) => { const m = u.length; for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i !== j && u[i] !== u[j]) Do += 1 / (m - 1); }); Do /= n;
  let De = 0; const ks = Object.keys(cats); ks.forEach((a) => ks.forEach((b) => { if (a !== b) De += cats[a] * cats[b]; })); De /= n * (n - 1);
  return { value: De ? +(1 - Do / De).toFixed(3) : null, units: U.length };
}
const status = human.length ? "OK" : "BLOCKED";
const out = { schemaVersion: "vu-elliott-expert-agreement-1.0.0", generatedAt: new Date().toISOString(), status,
  note: status === "BLOCKED" ? "Keine Expertenannotation vorhanden (nur MANUAL_VU_REVIEW/EXTERNAL_PRACTITIONER zaehlen). Die Engine ist NICHT expert-validiert." : "Praktiker-Referenzen sind keine objektive Wahrheit.",
  inputs: files, annotations: { total: ann.length, counted: human.length, ignoredAutomated: ann.filter((a) => a.sourceType === "AUTOMATED").length, blindShare: pct(rows.filter((r) => r.blind).length, rows.length), annotators: [...new Set(rows.map((r) => r.annotator))].length },
  engineVsHuman: { patternMatch: mean("patternMatch"), pivotF1: mean("pivotF1"), degreeMatch: mean("degreeMatch"), directionMatch: mean("directionMatch"), invalidationMatch: mean("invalidationMatch"), abstentionMatch: mean("abstentionMatch") },
  interExpert: { pattern: alpha("pattern"), direction: alpha("dir"), validity: alpha("validity") }, rows };
const dst = join(ROOT, "quant/data/technical-intelligence/elliott-validation/practitioner/expert-agreement.json");
if (files.length || !existsSync(dst)) writeFileSync(dst, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ status, annotations: out.annotations, engineVsHuman: out.engineVsHuman, interExpert: out.interExpert }));
