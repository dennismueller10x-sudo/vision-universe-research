#!/usr/bin/env node
/* Practitioner Reference Benchmark — Gesamtlauf (Protokoll §10/§11).

   node scripts/technical/practitioner/run-benchmark.mjs [--refs <jsonl>] [--out <dir>] [--engine-version elliott-3.2.2]
        [--dynamics-before 10] [--dynamics-after 10] [--no-outcome]

   Ablauf: Referenzen laden → nur status INCLUDED (TEST_FIXTURE/CANDIDATE/EXCLUDED werden nie gerechnet; INCLUDED mit
   Testkennung → Abbruch) → Validierung (Fehler → Abbruch) → Duplikate (Original behalten) → Revisionsketten → Aufteilung →
   Abbildung (UNMAPPED gezaehlt, nicht gerechnet) → blinde Wiedergabe (nur Projektion) → Plausibilitaet → Vergleich (A–K, S,
   Mensch–Mensch, Dynamik) → getrennte Ergebnisstudie.
   Ohne INCLUDED-Referenzen: status NO_REFERENCES, keine Kennzahlen (nichts wird erfunden).
   Ausgabe: <out>/benchmark-summary.json, replay-results.json, comparison.json, outcome.json */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { PATHS, loadReferences, loadInstrumentMap, loadSourceRegistry, validateReference, effectiveMapping, isTestFixtureLike, detectDuplicates,
         revisionChains, assignSplits, plausibilityChecks, stripInternal, verifyFreeze } from "./lib.mjs";
import { replayProjection, replayOne, checkEngineVersion, EXPECTED_ENGINE_VERSION, ENGINE_VERSION } from "./replay.mjs";
import { compareCase, aggregate, attachKappaFields, pairHumanHuman, compareHumanPair, aggregateHuman, vuRelabel, detectionLatency, dynamicsSummary, stripPrivate } from "./compare.mjs";
import { outcomeForCase, aggregateOutcomes } from "./outcome.mjs";

const LABEL = "PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH";

export function runBenchmark(o = {}) {
  const refsPath = o.refsPath || PATHS.references, outDir = o.outDir || PATHS.benchmark, now = o.now || new Date().toISOString();
  const expected = o.expectedEngine || EXPECTED_ENGINE_VERSION;
  const map = o.map || loadInstrumentMap(), registry = o.registry || null;
  const write = (name, obj) => { if (o.write !== false) { mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, name), JSON.stringify(obj, null, 1) + "\n"); } return obj; };
  const head = { schemaVersion: "vu-practitioner-benchmark-1.0.0", generatedAt: now, label: LABEL, protocol: "docs/technical-intelligence/PRACTITIONER_PROTOCOL.md",
                 engine: { expected, actual: ENGINE_VERSION }, references: refsPath.startsWith(PATHS.references) ? "practitioner-v1/references.jsonl" : basename(refsPath) };
  checkEngineVersion(expected);
  /* Selbsttest (nur automatische Tests): rechnet die gekennzeichneten TEST_FIXTURE-Zeilen statt INCLUDED, Ausgabe nur ausserhalb
     von practitioner-v1 und als SELF_TEST markiert – nie ein Ergebnis. */
  const selfTest = o.selfTestMode === true;
  if (selfTest) {
    if (outDir.startsWith(PATHS.benchmark) || outDir.startsWith(dirname(PATHS.references)) || refsPath === PATHS.references) throw new Error("selfTestMode nur mit Testdatei und Ausgabe ausserhalb von practitioner-v1");
    head.label = "SELF TEST ON TEST_FIXTURE DATA – NOT A RESULT"; head.selfTest = true;
  }

  // Freeze-Pruefsumme, falls ein eingefrorener Datensatz gelesen wird
  const manFile = refsPath.replace(/\.jsonl$/, ".manifest.json");
  if (manFile !== refsPath && existsSync(manFile)) { if (!verifyFreeze(manFile)) throw new Error("SHA-256 des eingefrorenen Datensatzes stimmt nicht: " + refsPath); head.frozen = basename(manFile); }

  const { rows, errors: parseErrors } = loadReferences(refsPath);
  if (parseErrors.length) throw new Error("Referenzdatei nicht lesbar:\n" + parseErrors.map((e) => `  Zeile ${e.line}: ${e.error}`).join("\n"));
  // TEST_FIXTURE-Zeilen werden nirgends gezaehlt oder berichtet
  const byStatus = rows.filter((r) => !isTestFixtureLike(r) || r.status === "INCLUDED").reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const sneaky = rows.filter((r) => r.status === "INCLUDED" && isTestFixtureLike(r));
  if (sneaky.length) throw new Error("TEST_FIXTURE-Kennung in INCLUDED-Zeilen: " + sneaky.map((r) => r.referenceId).join(", "));
  const included = selfTest ? rows.filter((r) => r.status === "TEST_FIXTURE" && isTestFixtureLike(r)) : rows.filter((r) => r.status === "INCLUDED");
  const nonTest = rows.filter((r) => !isTestFixtureLike(r));
  const input = { rows: nonTest.length, byStatus, includedRows: included.length, notIncluded: nonTest.length - included.length };

  if (!included.length) {
    const s = Object.assign({}, head, { status: "NO_REFERENCES", input, note: "Keine eingeschlossenen Praktiker-Referenzen – es werden keine Kennzahlen berechnet." });
    write("benchmark-summary.json", s);
    for (const f of ["replay-results.json", "comparison.json", "outcome.json"]) write(f, Object.assign({}, head, { status: "NO_REFERENCES" }));
    return { summary: s };
  }

  // Validierung (laut)
  const invalid = [];
  for (const r of included) { const v = validateReference(r, { map, registry }); if (v.errors.length) invalid.push(`${r.referenceId}: ${v.errors.join("; ")}`); }
  if (invalid.length) throw new Error("Ungueltige INCLUDED-Referenzen:\n  " + invalid.join("\n  "));
  const refs = included.map(stripInternal);
  const chains = revisionChains(refs);
  if (chains.errors.length) throw new Error("Revisionsketten fehlerhaft:\n  " + chains.errors.join("\n  "));
  const dups = detectDuplicates(refs);
  const kept = refs.filter((r) => !dups.isDuplicate(r.referenceId));
  const splits = assignSplits(kept);
  const splitOf = (r) => r.split && r.split !== "UNASSIGNED" ? r.split : splits.byCase[r.caseId] || "UNASSIGNED";
  const mappingOf = (() => { const c = new Map(); return (r) => { if (!c.has(r.referenceId)) c.set(r.referenceId, effectiveMapping(r, map)); return c.get(r.referenceId); }; })();

  // Blinde Wiedergabe: nur die Projektion verlaesst diesen Block
  const dyn = { before: o.dynamicsBefore ?? 10, after: o.dynamicsAfter ?? 10 };
  const replays = new Map();
  for (const r of kept) {
    const m = mappingOf(r);
    replays.set(r.referenceId, replayOne(replayProjection(r, m), { loader: o.loader, expectedEngine: expected, dynamics: m.vuSymbol ? dyn : null }));
  }
  const replayOf = (id) => replays.get(id);

  // Plausibilitaet gegen VU-Schluss am Stichtag
  const plaus = {};
  for (const r of kept) { const rec = replayOf(r.referenceId), m = mappingOf(r); if (rec.status === "OK") plaus[r.referenceId] = plausibilityChecks(r, { closeAtCutoff: rec.market.closeAtCutoff, levelScale: m.levelsComparable ? m.levelScale : null }); }
  const plausFailed = new Set(Object.keys(plaus).filter((id) => plaus[id].errors.length));

  // Vergleich: Originalsicht (Hauptergebnis) und juengste Sicht
  const views = [...revisionChains(kept).chains.values()].map((c) => ({ original: c[0], latest: c[c.length - 1], chain: c }));
  const rowFor = (r) => {
    if (plausFailed.has(r.referenceId)) return { referenceId: r.referenceId, caseId: r.caseId, sourceId: r.sourceId, vuSymbol: mappingOf(r).vuSymbol, category: "PLAUSIBILITY_FAILED", plausibility: plaus[r.referenceId] };
    return attachKappaFields(compareCase(r, mappingOf(r), replayOf(r.referenceId), { split: splitOf(r) }), r, mappingOf(r), replayOf(r.referenceId));
  };
  const origRows = views.map((v) => rowFor(v.original)), latestRows = views.filter((v) => v.chain.length > 1).map((v) => rowFor(v.latest));
  const bySplit = {};
  for (const sp of ["DEVELOPMENT", "VALIDATION", "HOLDOUT_TEMPORAL", "HOLDOUT_SOURCE"]) { const rr = origRows.filter((x) => x.split === sp); if (rr.length) bySplit[sp] = aggregate(rr); }

  // Mensch–Mensch (Originale, nicht unplausibel)
  const hhRefs = views.map((v) => v.original).filter((r) => !plausFailed.has(r.referenceId));
  const hhRows = pairHumanHuman(hhRefs, mappingOf).map((p) => compareHumanPair(p, replayOf));

  // Dynamik
  const latency = views.map((v) => Object.assign({ referenceId: v.original.referenceId }, detectionLatency(v.original, mappingOf(v.original), replayOf(v.original.referenceId))));
  const relabel = views.map((v) => vuRelabel(replayOf(v.original.referenceId)));

  const comparison = Object.assign({}, head, {
    status: selfTest ? "SELF_TEST" : "OK", primaryView: "ORIGINAL_PUBLISHED",
    vuVsPractitioner: { all: aggregate(origRows), bySplit, latestView: latestRows.length ? aggregate(latestRows) : null },
    humanHuman: Object.assign({ pairingRule: "gleiche vuSymbol, gleicher Zeitrahmen, ≤ 5 Handelstage, verschiedene sourceId; je Referenz und Fremdquelle die zeitlich naechste" }, aggregateHuman(hhRows)),
    dynamics: Object.assign(dynamicsSummary(revisionChains(kept).chains, latency, relabel), { window: dyn }),
    rows: origRows.map(stripPrivate), latestRows: latestRows.map(stripPrivate), humanPairs: hhRows.map(stripPrivate), latency
  });

  // Ergebnisstudie (getrennt)
  let outcome = Object.assign({}, head, { status: "SKIPPED" });
  if (o.outcome !== false) {
    const oRows = views.filter((v) => !plausFailed.has(v.original.referenceId)).map((v) => outcomeForCase(v.original, mappingOf(v.original), replayOf(v.original.referenceId), v.chain, { loader: o.loader, horizon: o.horizon }));
    outcome = Object.assign({}, head, { status: selfTest ? "SELF_TEST" : "OK", separateFrom: "comparison.json", aggregate: aggregateOutcomes(oRows), rows: oRows });
  }

  const replayOut = Object.assign({}, head, { status: selfTest ? "SELF_TEST" : "OK", note: "Nur VU-seitige Felder; Eingang je Fall ausschliesslich die Projektion (referenceId, vuSymbol, seriesSource, market, timeframe, analysisCutoff).",
                                              results: [...replays.values()] });
  const mq = kept.reduce((a, r) => { const q = mappingOf(r).mappingQuality; a[q] = (a[q] || 0) + 1; return a; }, {});
  const summary = Object.assign({}, head, {
    status: selfTest ? "SELF_TEST" : "OK", input, cases: views.length, versions: kept.length, duplicatesRemoved: dups.duplicates, mappingQuality: mq,
    unmappedCounted: mq.UNMAPPED || 0, replayStatus: [...replays.values()].reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}),
    plausibilityFailed: [...plausFailed], splits: { counts: splits.counts, holdoutSource: splits.holdoutSource, note: splits.holdoutNote },
    headline: { S: comparison.vuVsPractitioner.all.metrics.S, A: comparison.vuVsPractitioner.all.metrics.A, humanHumanPairs: hhRows.length }
  });
  write("replay-results.json", replayOut); write("comparison.json", comparison); write("outcome.json", outcome); write("benchmark-summary.json", summary);
  return { summary, comparison, outcome, replay: replayOut };
}

function arg(name, d) { const i = process.argv.indexOf("--" + name); return i >= 0 ? process.argv[i + 1] : d; }
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const r = runBenchmark({ refsPath: arg("refs"), outDir: arg("out"), expectedEngine: arg("engine-version"), dynamicsBefore: arg("dynamics-before") !== undefined ? +arg("dynamics-before") : undefined,
                             dynamicsAfter: arg("dynamics-after") !== undefined ? +arg("dynamics-after") : undefined, outcome: !process.argv.includes("--no-outcome"),
                             registry: existsSync(PATHS.sourceRegistry) ? loadSourceRegistry() : null });
    console.log(JSON.stringify({ status: r.summary.status, input: r.summary.input, cases: r.summary.cases ?? 0, out: arg("out") || dirname(PATHS.benchmark + "/x") }, null, 1));
  } catch (e) { console.error(e.message); process.exit(1); }
}
