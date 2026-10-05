/* Menschliches Extraktions-Audit (scripts/technical/practitioner/human-audit.mjs, quant/research/practitioner-audit/).
   PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH. Geprüft wird:
     1. Auswahl deterministisch und Schichtungsbedingungen erfüllt,
     2. Holdout-Ausschluss: keine versiegelte caseId in Auswahl/Prüfpaket/CSV/Markdown,
     3. keine VU-/Engine-Felder im Prüfpaket,
     4. CSV-Rundlauf: synthetisch ausgefüllte Prüfung (auch aus dem Seitenkern) → import (nur Temp-Verzeichnis),
     5. Fehlerquoten-Arithmetik, MEDIUM-Regel,
     6. Kandidat V1.1 als neue Datei mit Änderungsliste, V1-Freeze-Hash unverändert,
     7. ungültige Urteile / fehlende Pflichtangaben werden abgelehnt.
   Synthetische Urteile sind Testdaten, keine Prüfergebnisse; die echte results.json wird nie geschrieben. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as HA from "../../scripts/technical/practitioner/human-audit.mjs";
import { CORE_FIELDS as DUAL_CORE } from "../../scripts/technical/practitioner/dual-extraction.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const PageCore = require(join(ROOT, "quant/research/practitioner-audit/audit.js"));
const manifest = HA.loadManifest();
const opened = HA.openedCaseIds(manifest);
const sealed = Object.keys(manifest.splits.byCase).filter((c) => !opened.has(c)); // nur caseIds (gezählt/verglichen), keine Inhalte
const sha = (p) => HA.sha256(readFileSync(p));
const FREEZE_SHA = manifest.sha256;

const tmp = mkdtempSync(join(tmpdir(), "vu-human-audit-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
const sel = HA.buildSelection();
const pack = HA.buildPack(sel);
const packPath = join(tmp, "audit-pack.json");
writeFileSync(packPath, JSON.stringify(pack));

test("Kernfelder identisch mit dual-extraction.mjs", () => {
  assert.deepEqual([...HA.CORE_FIELDS], [...DUAL_CORE]);
  assert.deepEqual(HA.AUDIT_FIELDS.filter((f) => f.core).map((f) => f.abKey).sort(), [...DUAL_CORE].sort());
});

test("Auswahl: deterministisch, 20 Fälle, Bedingungen erfüllt", () => {
  const again = HA.buildSelection();
  assert.deepEqual(again.cases.map((c) => c.caseId), sel.cases.map((c) => c.caseId));
  assert.equal(sel.cases.length, 20);
  assert.equal(new Set(sel.cases.map((c) => c.caseId)).size, 20);
  assert.ok(sel.checks.allOk, JSON.stringify(sel.checks));
  const s = sel.strata.selected, o = sel.strata.opened;
  assert.equal(s.confidence.HIGH || 0, o.confidence.HIGH || 0, "alle HIGH aufgenommen");
  for (const fam of Object.keys(o.sourceFamily)) assert.ok((s.sourceFamily[fam] || 0) >= Math.min(2, o.sourceFamily[fam]), fam);
  for (const tf of ["1D", "1W", "1M"]) if (o.timeframe[tf]) assert.ok((s.timeframe[tf] || 0) >= 1, tf);
  assert.ok((s.family.CORRECTIVE || 0) >= Math.min(3, o.family.CORRECTIVE || 0));
  assert.ok((s.family.MOTIVE || 0) >= Math.min(12, o.family.MOTIVE || 0));
  assert.ok((s.btc.BTC || 0) <= 6);
  assert.ok(sel.cases.every((c) => c.hash === HA.sha256(HA.SEED + c.caseId)));
  // Auffüll-Fälle in aufsteigender Hash-Reihenfolge
  const fill = sel.cases.filter((c) => c.reason === "FILL").map((c) => c.hash);
  assert.deepEqual(fill, [...fill].sort());
});

test("Auswahl-Funktion: Obergrenzen und Mindestbelegungen auf synthetischen Fällen", () => {
  const infos = Array.from({ length: 40 }, (_, i) => ({ caseId: "s|X" + i, referenceId: "r" + i, split: "DEVELOPMENT", sourceFamily: i % 4 === 0 ? "rare" : "big",
    timeframe: i % 10 === 0 ? "1M" : i % 2 ? "1D" : "1W", family: i % 3 === 0 ? "CORRECTIVE" : "MOTIVE", pattern: "IMPULSE", confidence: i < 3 ? "HIGH" : "MEDIUM", btc: i % 2 === 1, hash: HA.sha256("t" + i) }));
  const r = HA.selectFromInfos(infos);
  assert.equal(r.selected.length, 20);
  assert.ok(r.checks.allOk, JSON.stringify(r.checks));
  assert.ok(r.selected.filter((c) => c.btc).length <= 6);
  assert.ok(r.selected.filter((c) => c.timeframe === "1M").length >= 1);
  assert.ok(r.selected.filter((c) => c.family === "MOTIVE").length >= 12);
});

test("Holdout-Ausschluss: keine versiegelte caseId in Auswahl, Paket, CSV oder Markdown", () => {
  assert.equal(sealed.length, 43);
  assert.equal(opened.size, 35);
  const texts = [JSON.stringify(sel), JSON.stringify(pack), HA.toCsv(HA.packToCsvRows(pack)), HA.packToMarkdown(pack, sel)];
  for (const cid of sealed) for (const t of texts) assert.ok(!t.includes(cid), "versiegelter Fall im Audit: " + cid);
  for (const c of pack.cases) { assert.ok(opened.has(c.caseId)); assert.ok(["DEVELOPMENT", "VALIDATION"].includes(c.split)); for (const v of c.revisions) assert.ok(opened.has(c.caseId) && v.referenceId); }
  // auch die eingecheckten Dateien (falls erzeugt)
  for (const f of ["selection.json", "audit-pack.json", "audit-pack.csv", "AUDIT_PACK.md", "extraction-agreement.json"]) {
    const p = join(HA.DEFAULTS.out, f); if (!existsSync(p)) continue;
    const t = readFileSync(p, "utf8"); for (const cid of sealed) assert.ok(!t.includes(cid), f + ": " + cid);
  }
  const ag = HA.buildAgreement();
  const t = JSON.stringify(ag); for (const cid of sealed) assert.ok(!t.includes(cid));
  assert.equal(ag.population.openedCases, 35);
});

test("Prüfpaket enthält keine VU-/Engine-Ausgaben", () => {
  const bad = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, path + "[" + i + "]"));
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      if (/^(vu(?!Symbol$)|replay|engine|comparison|benchmark|outcome|score|metric|nextMove$|currentWaveVU|a1|a2)/i.test(k)) bad.push(path + "." + k);
      walk(x, path + "." + k);
    }
  };
  walk(pack, "pack");
  assert.deepEqual(bad, []);
  const s = JSON.stringify(pack);
  assert.ok(!/elliott-3\.\d|replay-results|comparison\.json|benchmark\//.test(s));
  assert.equal(pack.cases.length, 20);
  assert.equal(pack.cases[0].auditRows.length, HA.AUDIT_FIELDS.length);
});

// ------------------------------------------------------------------ synthetische Prüfung
function fill(rows, verdictFor) {
  return rows.map((r) => ({ ...r, ...verdictFor(r), reviewerId: "TEST-01", reviewDate: "2026-10-05" }));
}
function correctionFor(field) {
  return { instrument: '{"asShown":"TEST"}', timeframe: "1D", "primary.family": "UNKNOWN", "primary.currentWave": "(iii)", directionalBias: "SIDEWAYS",
    invalidation: '{"price":1,"direction":"below"}', targetZones: "UNKNOWN", alternatives: "[]", "publication.timestamp": "2020-01-01T00:00:00+00:00",
    "primary.pattern": "FLAT", "primary.degree": '{"degreeLabel":"x","degreeRank":1}', "primary.state": "DEVELOPING", "primary.nextMoveAfterCurrent": "UP" }[field];
}

test("CSV-Rundlauf + Fehlerquoten + Kandidat V1.1 (Temp-Verzeichnis, Freeze unverändert)", () => {
  const out = join(tmp, "run1");
  const highCases = pack.cases.filter((c) => c.record.extraction.confidence === "HIGH").map((c) => c.caseId);
  const medCases = pack.cases.filter((c) => c.record.extraction.confidence === "MEDIUM").map((c) => c.caseId);
  const badHigh = new Set(highCases.slice(0, 1)), badMed = new Set(medCases.slice(0, 4));
  const rows = fill(HA.packToCsvRows(pack), (r) => {
    if (r.field === "primary.currentWave" && (badHigh.has(r.caseId) || badMed.has(r.caseId))) return { verdict: "INCORRECT", correctedValue: "(iii)", reviewerNote: "Test, \"zitiert\"; mit Komma, und\nZeilenumbruch" };
    if (r.field === "alternatives" && r.caseId === medCases[5]) return { verdict: "PARTIALLY_CORRECT", correctedValue: "", reviewerNote: "" };
    if (r.field === "targetZones" && r.caseId === medCases[6]) return { verdict: "UNKNOWN", correctedValue: "", reviewerNote: "" };
    return { verdict: "CORRECT", correctedValue: "", reviewerNote: "" };
  });
  const csv = join(tmp, "review1.csv");
  writeFileSync(csv, "﻿" + HA.toCsv(rows));
  // Parser-Rundlauf
  const back = HA.parseCsv(readFileSync(csv, "utf8"));
  assert.equal(back.length, rows.length);
  assert.equal(back.find((r) => r.reviewerNote.includes("Zeilenumbruch")).reviewerNote, "Test, \"zitiert\"; mit Komma, und\nZeilenumbruch");
  const before = sha(HA.DEFAULTS.freeze);
  assert.equal(before, FREEZE_SHA);
  const res = HA.runImport(csv, { out, pack: packPath });
  assert.equal(sha(HA.DEFAULTS.freeze), FREEZE_SHA, "V1-Freeze unverändert");
  assert.ok(!existsSync(join(HA.DEFAULTS.out, "results.json")), "echte results.json nicht geschrieben");
  const m = res.metrics;
  const N = 20 * HA.AUDIT_FIELDS.length;
  assert.equal(m.fieldLevel.all.n, N);
  assert.equal(m.fieldLevel.all.INCORRECT, 5);
  assert.equal(m.fieldLevel.all.UNKNOWN, 1);
  assert.equal(m.fieldLevel.all.PARTIALLY_CORRECT, 1);
  assert.equal(m.fieldLevel.all.decided, N - 1);
  assert.ok(Math.abs(m.fieldLevel.all.errorRate - 5 / (N - 1)) < 1e-12);
  assert.ok(Math.abs(m.fieldLevel.all.errorRateInclPartial - 6 / (N - 1)) < 1e-12);
  assert.ok(Math.abs(m.fieldLevel.coreOnly.errorRate - 5 / (20 * 6)) < 1e-12);
  assert.equal(m.caseLevel.withCoreError, 5);
  assert.ok(Math.abs(m.caseLevel.errorRate - 5 / 20) < 1e-12);
  const H = m.byConfidence.HIGH.case, M = m.byConfidence.MEDIUM.case;
  assert.ok(Math.abs(H.errorRate - 1 / highCases.length) < 1e-12);
  assert.ok(Math.abs(M.errorRate - 4 / medCases.length) < 1e-12);
  const expectUsable = 4 / medCases.length <= 1 / highCases.length + 0.10 + 1e-12;
  assert.equal(m.mediumPolicy.decision, expectUsable ? "MEDIUM_USABLE_FOR_DEVELOPMENT" : "MEDIUM_NOT_USABLE_FOR_DEVELOPMENT");
  // Wilson-Intervall enthält Punktschätzer
  assert.ok(m.caseLevel.ci95[0] <= 0.25 && m.caseLevel.ci95[1] >= 0.25);
  // Kandidat V1.1
  const candFile = join(out, "PRACTITIONER_REFERENCE_V1.1.candidate.jsonl");
  const chFile = join(out, "PRACTITIONER_REFERENCE_V1.1.candidate.changes.json");
  assert.ok(existsSync(candFile) && existsSync(chFile));
  assert.notEqual(candFile, HA.DEFAULTS.freeze);
  const ch = JSON.parse(readFileSync(chFile, "utf8"));
  assert.equal(ch.changes.length, 5);
  assert.equal(ch.base.sha256, FREEZE_SHA);
  assert.equal(ch.candidate.sha256, sha(candFile));
  assert.notEqual(ch.candidate.sha256, FREEZE_SHA);
  assert.equal(ch.notesWithoutChange.length, 1);
  const baseLines = readFileSync(HA.DEFAULTS.freeze, "utf8").split("\n"), candLines = readFileSync(candFile, "utf8").split("\n");
  assert.equal(candLines.length, baseLines.length);
  const changedIdx = candLines.map((l, i) => (l !== baseLines[i] ? i : -1)).filter((i) => i >= 0);
  assert.equal(changedIdx.length, 5, "nur korrigierte Zeilen verändert, alle anderen byte-identisch");
  for (const i of changedIdx) {
    const rec = JSON.parse(candLines[i]);
    assert.ok(opened.has(rec.caseId));
    assert.equal(rec.primary.currentWave, "(iii)");
    assert.match(rec.extraction.ambiguities.at(-1), /Mensch-Audit V1\.1-Kandidat \(TEST-01, 2026-10-05\)/);
  }
  const results = JSON.parse(readFileSync(join(out, "results.json"), "utf8"));
  assert.equal(results.status, "COMPLETED");
  assert.equal(results.reviewer.id, "TEST-01");
});

test("Seitenkern exportiert CSV und JSON, die der Import annimmt; Korrekturwerte werden angewandt", () => {
  const draft = PageCore.emptyDraft();
  draft.reviewerId = "PAGE-02"; draft.reviewDate = "2026-10-06";
  for (const c of pack.cases) for (const r of c.auditRows) draft.rows[r.auditRowId] = { verdict: "CORRECT", correctedValue: "", reviewerNote: "" };
  const c0 = pack.cases.find((c) => c.record.extraction.confidence === "MEDIUM");
  for (const r of c0.auditRows) draft.rows[r.auditRowId] = { verdict: "INCORRECT", correctedValue: correctionFor(r.field), reviewerNote: "synthetisch" };
  assert.deepEqual(PageCore.draftProblems(pack, draft), []);
  assert.deepEqual([...PageCore.CSV_COLUMNS], [...HA.CSV_COLUMNS]);
  for (const [ext, text] of [["csv", PageCore.toCsv(pack, draft)], ["json", PageCore.toJson(pack, draft)]]) {
    const f = join(tmp, "page." + ext), out = join(tmp, "page-" + ext);
    writeFileSync(f, text);
    const res = HA.runImport(f, { out, pack: packPath });
    assert.equal(res.reviewer.id, "PAGE-02");
    assert.equal(res.metrics.caseLevel.withCoreError, 1);
    const ch = JSON.parse(readFileSync(join(out, "PRACTITIONER_REFERENCE_V1.1.candidate.changes.json"), "utf8"));
    assert.equal(ch.changes.length, HA.AUDIT_FIELDS.length);
    const line = readFileSync(join(out, "PRACTITIONER_REFERENCE_V1.1.candidate.jsonl"), "utf8").split("\n").find((l) => l.includes(`"referenceId":"${c0.referenceId}"`));
    const rec = JSON.parse(line);
    assert.equal(rec.timeframe, "1D"); assert.equal(rec.directionalBias, "SIDEWAYS"); assert.equal(rec.primary.family, "UNKNOWN");
    assert.deepEqual(rec.targetZones, []); assert.deepEqual(rec.invalidation, { basis: "UNKNOWN", direction: "below", price: 1 });
    assert.equal(rec.instrument.asShown, "TEST"); assert.equal(rec.primary.degreeRank, 1);
    // Entwurf aus Export wiederherstellbar
    const d2 = PageCore.draftFromText(pack, text);
    assert.equal(d2.loaded, 20 * HA.AUDIT_FIELDS.length);
    assert.equal(d2.reviewerId, "PAGE-02");
  }
  assert.equal(sha(HA.DEFAULTS.freeze), FREEZE_SHA);
});

test("Import lehnt ungültige Prüfungen ab (nichts geschrieben)", () => {
  const base = HA.packToCsvRows(pack);
  const cases = [
    ["ungültiges Urteil", fill(base, (r) => ({ verdict: r.field === "timeframe" ? "WRONG" : "CORRECT" })), /unzulässig/],
    ["fehlendes Urteil", fill(base, (r) => ({ verdict: r.field === "timeframe" ? "" : "CORRECT" })), /verdict fehlt/],
    ["INCORRECT ohne Korrektur", fill(base, (r) => ({ verdict: r.field === "timeframe" ? "INCORRECT" : "CORRECT" })), /INCORRECT ohne correctedValue/],
    ["ungültige Korrektur", fill(base, (r) => ({ verdict: r.field === "timeframe" ? "INCORRECT" : "CORRECT", correctedValue: r.field === "timeframe" ? "2H" : "" })), /correctedValue für timeframe ungültig/],
    ["fehlende Zeile", fill(base.slice(1), () => ({ verdict: "CORRECT" })), /fehlende Zeile/],
    ["Prüfer fehlt", fill(base, () => ({ verdict: "CORRECT" })).map((r) => ({ ...r, reviewerId: "" })), /reviewerId/],
    ["Datum ungültig", fill(base, () => ({ verdict: "CORRECT" })).map((r) => ({ ...r, reviewDate: "2026-13-40" })), /reviewDate/],
    ["fremdes Paket", fill(base, () => ({ verdict: "CORRECT" })).map((r) => ({ ...r, packId: "deadbeefdeadbeef" })), /packId/],
    ["veränderter Wert", fill(base, () => ({ verdict: "CORRECT" })).map((r, i) => (i === 0 ? { ...r, extractedValue: "x" } : r)), /extractedValue verändert/],
  ];
  for (const [name, rows, re] of cases) {
    const f = join(tmp, "bad.csv"), out = join(tmp, "bad-out");
    writeFileSync(f, HA.toCsv(rows));
    assert.throws(() => HA.runImport(f, { out, pack: packPath }), re, name);
    assert.ok(!existsSync(join(out, "results.json")), name + ": nichts geschrieben");
  }
  // Excel-DE: Semikolon-getrennt wird erkannt
  const semi = HA.toCsv(fill(base, () => ({ verdict: "UNKNOWN" }))).replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/gm, ";");
  const f = join(tmp, "semi.csv"); writeFileSync(f, semi);
  const res = HA.runImport(f, { out: join(tmp, "semi-out"), pack: packPath });
  assert.equal(res.metrics.mediumPolicy.decision, "UNDECIDABLE");
  assert.equal(res.metrics.fieldLevel.all.errorRate, null);
});

test("Status-Zeile READY ohne Reviewer; Seite gekennzeichnet und ohne externe Ressourcen", () => {
  if (existsSync(join(HA.DEFAULTS.out, "audit-pack.json"))) {
    const s = HA.auditStatus();
    assert.equal(s.status, "READY", s.line);
    assert.equal(s.line, HA.STATUS_READY_LINE);
  }
  const html = readFileSync(join(ROOT, "quant/research/practitioner-audit/index.html"), "utf8");
  const js = readFileSync(join(ROOT, "quant/research/practitioner-audit/audit.js"), "utf8");
  assert.match(html, /Extraktions-Audit — blind, ohne VU-Ausgaben/);
  assert.match(html, /noindex/);
  assert.match(html, /INTERN/);
  assert.match(html, /\/quant\/ui\/shell\.js/);
  assert.ok(!/<(script|link)[^>]+(src|href)="https?:/i.test(html), "keine externen Skripte/Stile");
  assert.ok(!/benchmark|replay|comparison/i.test(js.replace(/\/\*[\s\S]*?\*\//g, "")), "Seite lädt keine VU-Ausgaben");
  assert.match(js, /try \{ localStorage\.setItem/);
});
