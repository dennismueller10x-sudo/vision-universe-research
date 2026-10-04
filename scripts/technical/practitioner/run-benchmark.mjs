#!/usr/bin/env node
/* Practitioner Reference Benchmark — Vergleichslauf (Protokoll §10). Die Ergebnisstudie (§11) ist ein EIGENER Schritt:
   run-outcome.mjs, erst nach versiegeltem Vergleich (Red-Team M8).

   node scripts/technical/practitioner/run-benchmark.mjs [--refs <jsonl>] [--out <dir>] [--engine-version elliott-3.2.2]
        [--dynamics-before 10] [--dynamics-after 10] [--unseal-holdout HOLDOUT_SOURCE|HOLDOUT_TEMPORAL]

   Ablauf: Referenzen laden → nur status INCLUDED (INCLUDED mit Testkennung → Abbruch) → Validierung (Fehler → Abbruch) →
   Duplikate (Original behalten) → Revisionsketten → Aufteilung (eingefroren: Tabelle und Holdout-Quelle aus dem Manifest; sonst
   vorlaeufig berechnet) → VERSIEGELT: HOLDOUT_* und QUARANTINE werden weder wiedergegeben noch verglichen noch ausgegeben, nur
   gezaehlt (Red-Team H4). --unseal-holdout <name> (nur auf eingefrorenem Datensatz, je Name und Freeze-Hash genau einmal,
   protokolliert in <out>/unseal-log.jsonl) schreibt comparison-holdout-<name>.json.
   Ohne INCLUDED-Referenzen: status NO_REFERENCES, keine Kennzahlen.
   Ausgabe: benchmark-summary.json, replay-results.json, comparison.json, comparison.seal.json (SHA-256 von Vergleich/Replay + Freeze). */
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { PATHS, PV1, loadReferences, loadInstrumentMap, loadSourceRegistry, validateReference, effectiveMapping, isTestFixtureLike, detectDuplicates,
         revisionChains, assignSplits, plausibilityChecks, stripInternal, verifyFreeze, readJson, sourceFamily } from "./lib.mjs";
import { replayProjection, replayOne, checkEngineVersion, EXPECTED_ENGINE_VERSION, ENGINE_VERSION } from "./replay.mjs";
import { compareCase, aggregate, pairHumanHuman, compareHumanPair, aggregateHuman, vuRelabel, detectionLatency, dynamicsSummary, stripPrivate } from "./compare.mjs";

const LABEL = "PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH — INTERN, keine Produktaussage";
export const VISIBLE_SPLITS = Object.freeze(["DEVELOPMENT", "VALIDATION"]);
export const SEALED_SPLITS = Object.freeze(["HOLDOUT_SOURCE", "HOLDOUT_TEMPORAL"]);
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const insidePV1 = (p) => p.startsWith(PV1);

export function runBenchmark(o = {}) {
  const refsPath = o.refsPath || PATHS.references, outDir = o.outDir || PATHS.benchmark, now = o.now || new Date().toISOString();
  const expected = o.expectedEngine || EXPECTED_ENGINE_VERSION;
  const map = o.map || loadInstrumentMap(), registry = o.registry || null;
  const json = (obj) => JSON.stringify(obj, null, 1) + "\n";
  const written = {};
  const write = (name, obj) => { const t = json(obj); written[name] = t; if (o.write !== false) { mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, name), t); } return obj; };
  const head = { schemaVersion: "vu-practitioner-benchmark-1.1.0", generatedAt: now, label: LABEL, protocol: "docs/technical-intelligence/PRACTITIONER_PROTOCOL.md",
                 engine: { expected, actual: ENGINE_VERSION }, references: refsPath === PATHS.references ? "practitioner-v1/references.jsonl" : basename(refsPath) };
  checkEngineVersion(expected);
  /* Selbsttest (nur automatische Tests): rechnet die gekennzeichneten TEST_FIXTURE-Zeilen statt INCLUDED; Ausgabe nur ausserhalb
     von practitioner-v1 und als SELF_TEST markiert – nie ein Ergebnis. */
  const selfTest = o.selfTestMode === true;
  if (selfTest) {
    if (insidePV1(outDir) || insidePV1(refsPath)) throw new Error("selfTestMode nur mit Testdatei und Ausgabe ausserhalb von practitioner-v1");
    head.label = "SELF TEST ON TEST_FIXTURE DATA – NOT A RESULT"; head.selfTest = true;
  }

  // Eingefrorener Datensatz? → Pruefsumme, Aufteilung und Holdout-Quelle aus dem Manifest
  const manFile = refsPath.replace(/\.jsonl$/, ".manifest.json");
  let manifest = null;
  if (manFile !== refsPath && existsSync(manFile)) {
    if (!verifyFreeze(manFile)) throw new Error("SHA-256 des eingefrorenen Datensatzes stimmt nicht: " + refsPath);
    manifest = readJson(manFile); head.frozen = { version: manifest.version, sha256: manifest.sha256 };
  }
  const unseal = o.unsealHoldout || null;
  if (unseal) {
    if (!SEALED_SPLITS.includes(unseal)) throw new Error("--unseal-holdout erwartet " + SEALED_SPLITS.join(" oder "));
    if (!manifest) throw new Error("Holdouts duerfen nur auf einem eingefrorenen Datensatz entsiegelt werden (Manifest fehlt)");
  }

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
    for (const f of ["replay-results.json", "comparison.json"]) write(f, Object.assign({}, head, { status: "NO_REFERENCES" }));
    return { summary: s };
  }

  // Validierung (laut)
  const invalid = [];
  for (const r of included) { const v = validateReference(r, { map, registry }); if (v.errors.length) invalid.push(`${r.referenceId}: ${v.errors.join("; ")}`); }
  if (invalid.length) throw new Error("Ungueltige INCLUDED-Referenzen:\n  " + invalid.join("\n  "));
  const refs = included.map(stripInternal);
  const chains0 = revisionChains(refs);
  if (chains0.errors.length) throw new Error("Revisionsketten fehlerhaft:\n  " + chains0.errors.join("\n  "));
  const dups = detectDuplicates(refs);
  const kept = refs.filter((r) => !dups.isDuplicate(r.referenceId));
  const splits = manifest && manifest.splits && manifest.splits.byCase
    ? { byCase: manifest.splits.byCase, holdoutSource: manifest.holdoutSource, provisional: false, quarantine: manifest.splits.quarantine || [] }
    : Object.assign(assignSplits(kept, { registry, map, duplicates: dups.duplicates }), { provisional: true });
  const splitOf = (r) => splits.byCase[r.caseId] || "UNASSIGNED";
  const mappingOf = (() => { const c = new Map(); return (r) => { if (!c.has(r.referenceId)) c.set(r.referenceId, effectiveMapping(r, map)); return c.get(r.referenceId); }; })();
  const views = [...revisionChains(kept).chains.values()].map((c) => ({ original: c[0], latest: c[c.length - 1], chain: c, split: splitOf(c[0]) }));
  const splitCounts = views.reduce((a, v) => { a[v.split] = (a[v.split] || 0) + 1; return a; }, {});

  /* Sichtbare Faelle: DEVELOPMENT/VALIDATION (vorlaeufig ohne Freeze auch UNASSIGNED). Holdouts/QUARANTINE bleiben versiegelt. */
  const isVisible = (sp) => VISIBLE_SPLITS.includes(sp) || sp === "UNASSIGNED";
  const evaluate = (sel, tag) => {
    const dyn = { before: o.dynamicsBefore ?? 10, after: o.dynamicsAfter ?? 10 };
    const vs = views.filter((v) => sel(v.split));
    const replays = new Map();
    for (const v of vs) for (const r of v.chain) {
      const m = mappingOf(r);
      replays.set(r.referenceId, replayOne(replayProjection(r, m), { loader: o.loader, expectedEngine: expected, dynamics: m.vuSymbol && r === v.original ? dyn : null }));
    }
    const replayOf = (id) => replays.get(id);
    const plaus = {};
    for (const [id, rec] of replays) { const r = vs.flatMap((v) => v.chain).find((x) => x.referenceId === id), m = mappingOf(r); if (rec.status === "OK") plaus[id] = plausibilityChecks(r, { closeAtCutoff: rec.market.closeAtCutoff, levelScale: m.levelsComparable ? m.levelScale : null }); }
    const plausFailed = new Set(Object.keys(plaus).filter((id) => plaus[id].errors.length));
    const rowFor = (r, split) => {
      if (plausFailed.has(r.referenceId)) return { referenceId: r.referenceId, caseId: r.caseId, sourceId: r.sourceId, sourceFamily: sourceFamily(r.sourceId, registry), vuSymbol: mappingOf(r).vuSymbol, split, category: "PLAUSIBILITY_FAILED", plausibility: plaus[r.referenceId] };
      return compareCase(r, mappingOf(r), replayOf(r.referenceId), { split, registry });
    };
    const origRows = vs.map((v) => rowFor(v.original, v.split)), latestRows = vs.filter((v) => v.chain.length > 1).map((v) => rowFor(v.latest, v.split));
    const bySplit = {};
    for (const sp of [...new Set(vs.map((v) => v.split))]) bySplit[sp] = aggregate(origRows.filter((x) => x.split === sp));
    const hhRows = pairHumanHuman(vs.map((v) => v.original).filter((r) => !plausFailed.has(r.referenceId)), mappingOf, 5, (id) => sourceFamily(id, registry)).map((p) => compareHumanPair(p, replayOf));
    const latency = vs.map((v) => Object.assign({ referenceId: v.original.referenceId }, detectionLatency(v.original, mappingOf(v.original), replayOf(v.original.referenceId))));
    const relabel = vs.map((v) => vuRelabel(replayOf(v.original.referenceId)));
    const comparison = Object.assign({}, head, {
      status: selfTest ? "SELF_TEST" : "OK", scope: tag, primaryView: "ORIGINAL_PUBLISHED",
      directionSemantics: "A1 = laufende Bewegung ab jetzt (Praktiker directionalBias vs. VU currentWave.direction); A2 = Bewegung nach der laufenden Welle (Praktiker primary.nextMoveAfterCurrent vs. VU nextMove); S = A1 + Rolle (+ Trend, wo ableitbar)",
      vuVsPractitioner: { all: aggregate(origRows), bySplit, latestView: latestRows.length ? aggregate(latestRows) : null,
        /* Nachtrag 6 b: S getrennt nach Herkunft der VU-Rolle (Engine bei laufendem Muster / vom Vergleich abgeleitet bei abgeschlossenem) */
        sByRoleSource: Object.fromEntries(["ENGINE", "INFERRED"].map((k) => { const x = origRows.filter((r) => r.sRoleSource === k); return [k, x.length ? aggregate(x).metrics.S : null]; })) },
      humanHuman: Object.assign({ pairingRule: "gleiche vuSymbol, gleicher Zeitrahmen, ≤ 5 Handelstage, verschiedene Quellenfamilie; je Referenz und Fremdfamilie die zeitlich naechste" }, aggregateHuman(hhRows)),
      dynamics: Object.assign(dynamicsSummary(revisionChains(vs.flatMap((v) => v.chain)).chains, latency, relabel), { window: dyn }),
      rows: origRows.map(stripPrivate), latestRows: latestRows.map(stripPrivate), humanPairs: hhRows.map(stripPrivate), latency
    });
    const replay = Object.assign({}, head, { status: selfTest ? "SELF_TEST" : "OK", scope: tag,
      note: "Nur VU-seitige Felder; Eingang je Fall ausschliesslich die Projektion (referenceId, vuSymbol, seriesSource, market, timeframe, analysisCutoff).", results: [...replays.values()] });
    return { comparison, replay, replays, plausFailed, vs };
  };

  if (unseal) {
    const logFile = join(outDir, "unseal-log.jsonl");
    const log = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    if (log.some((x) => x.holdout === unseal && x.freezeSha256 === manifest.sha256)) throw new Error(`${unseal} wurde fuer diesen Freeze (${manifest.sha256.slice(0, 12)}…) bereits entsiegelt – genau einmal (§8)`);
    const E = evaluate((sp) => sp === unseal, unseal);
    mkdirSync(outDir, { recursive: true });
    appendFileSync(logFile, JSON.stringify({ holdout: unseal, freezeVersion: manifest.version, freezeSha256: manifest.sha256, at: now, cases: E.vs.length, selfTest }) + "\n");
    const name = "comparison-holdout-" + unseal.toLowerCase().replace(/_/g, "-") + ".json";
    write(name, Object.assign(E.comparison, { unsealed: unseal }));
    return { comparison: E.comparison, unsealed: unseal, file: join(outDir, name) };
  }

  const E = evaluate(isVisible, "DEVELOPMENT+VALIDATION");
  const mq = kept.reduce((a, r) => { const q = mappingOf(r).mappingQuality; a[q] = (a[q] || 0) + 1; return a; }, {});
  write("replay-results.json", E.replay);
  write("comparison.json", E.comparison);
  const seal = Object.assign({}, head, { status: "SEALED", comparisonSha256: sha256(written["comparison.json"]), replaySha256: sha256(written["replay-results.json"]),
    freezeSha256: manifest ? manifest.sha256 : null, freezeVersion: manifest ? manifest.version : null, sealedAt: now,
    note: "Ergebnisstudie (run-outcome.mjs) nur mit eingefrorenem Datensatz und unveraendertem comparison.json/replay-results.json." });
  write("comparison.seal.json", seal);
  const summary = Object.assign({}, head, {
    status: selfTest ? "SELF_TEST" : "OK", input, cases: views.length, versions: kept.length, duplicatesRemoved: dups.duplicates, mappingQuality: mq,
    unmappedCounted: mq.UNMAPPED || 0, replayStatus: [...E.replays.values()].reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}),
    plausibilityFailed: [...E.plausFailed],
    splits: { counts: splitCounts, holdoutSource: splits.holdoutSource, provisional: splits.provisional, quarantined: (splits.quarantine || []).length,
              sealed: Object.fromEntries(SEALED_SPLITS.map((s) => [s, splitCounts[s] || 0])), evaluated: E.vs.length,
              note: "HOLDOUT_* und QUARANTINE werden nicht berechnet; Entsiegelung nur mit --unseal-holdout auf eingefrorenem Datensatz." },
    internalHeadline: { note: "INTERN – nicht ins Produkt uebernehmen", S: E.comparison.vuVsPractitioner.all.metrics.S, A1: E.comparison.vuVsPractitioner.all.metrics.A1, humanHumanPairs: E.comparison.humanHuman.pairs }
  });
  write("benchmark-summary.json", summary);
  return { summary, comparison: E.comparison, replay: E.replay, seal };
}

function arg(name, d) { const i = process.argv.indexOf("--" + name); return i >= 0 ? process.argv[i + 1] : d; }
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const r = runBenchmark({ refsPath: arg("refs"), outDir: arg("out"), expectedEngine: arg("engine-version"), dynamicsBefore: arg("dynamics-before") !== undefined ? +arg("dynamics-before") : undefined,
                             dynamicsAfter: arg("dynamics-after") !== undefined ? +arg("dynamics-after") : undefined, unsealHoldout: arg("unseal-holdout"),
                             registry: existsSync(PATHS.sourceRegistry) ? loadSourceRegistry() : null });
    console.log(JSON.stringify(r.unsealed ? { unsealed: r.unsealed, file: r.file } : { status: r.summary.status, input: r.summary.input, cases: r.summary.cases ?? 0, splits: r.summary.splits }, null, 1));
  } catch (e) { console.error(e.message); process.exit(1); }
}
