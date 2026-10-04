#!/usr/bin/env node
/* Practitioner Reference Benchmark — Ergebnisstudie (Protokoll §11) als EIGENER Schritt nach dem versiegelten Vergleich.

   node scripts/technical/practitioner/run-outcome.mjs --refs <freeze>/PRACTITIONER_REFERENCE_V1.jsonl [--bench <dir>]

   Verweigert, solange nicht ALLES gilt: Datensatz eingefroren (Manifest, SHA-256 stimmt), <bench>/comparison.seal.json existiert,
   gehoert zum selben Freeze-Hash, und comparison.json sowie replay-results.json sind seit der Versiegelung unveraendert.
   Ausgewertet werden nur die Faelle, die comparison.json enthaelt (versiegelte Holdouts bleiben versiegelt). Schreibt outcome.json. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { PATHS, PV1, loadReferences, loadInstrumentMap, effectiveMapping, isTestFixtureLike, revisionChains, stripInternal, verifyFreeze, readJson } from "./lib.mjs";
import { outcomeForCase, aggregateOutcomes } from "./outcome.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export class OutcomeRefusedError extends Error { constructor(m) { super("ERGEBNISSTUDIE VERWEIGERT: " + m); this.name = "OutcomeRefusedError"; } }

export function runOutcome(o = {}) {
  const refsPath = o.refsPath, bench = o.benchDir || PATHS.benchmark, now = o.now || new Date().toISOString(), selfTest = o.selfTestMode === true;
  if (!refsPath) throw new OutcomeRefusedError("--refs <eingefrorener Datensatz> fehlt");
  if (selfTest && (refsPath.startsWith(PV1) || bench.startsWith(PV1))) throw new OutcomeRefusedError("selfTestMode nur ausserhalb von practitioner-v1");
  const manFile = refsPath.replace(/\.jsonl$/, ".manifest.json");
  if (manFile === refsPath || !existsSync(manFile)) throw new OutcomeRefusedError("Datensatz ist nicht eingefroren (Manifest fehlt)");
  if (!verifyFreeze(manFile)) throw new OutcomeRefusedError("SHA-256 des eingefrorenen Datensatzes stimmt nicht");
  const manifest = readJson(manFile);
  const sealFile = join(bench, "comparison.seal.json"), cmpFile = join(bench, "comparison.json"), repFile = join(bench, "replay-results.json");
  if (!existsSync(sealFile) || !existsSync(cmpFile) || !existsSync(repFile)) throw new OutcomeRefusedError("versiegelter Vergleich fehlt (comparison.json / comparison.seal.json / replay-results.json)");
  const seal = readJson(sealFile), cmpText = readFileSync(cmpFile, "utf8"), repText = readFileSync(repFile, "utf8");
  if (seal.status !== "SEALED") throw new OutcomeRefusedError("Vergleich ist nicht versiegelt");
  if (seal.freezeSha256 !== manifest.sha256) throw new OutcomeRefusedError(`Siegel gehoert zu einem anderen Freeze (${String(seal.freezeSha256).slice(0, 12)} ≠ ${manifest.sha256.slice(0, 12)})`);
  if (sha256(cmpText) !== seal.comparisonSha256) throw new OutcomeRefusedError("comparison.json wurde nach der Versiegelung veraendert");
  if (sha256(repText) !== seal.replaySha256) throw new OutcomeRefusedError("replay-results.json wurde nach der Versiegelung veraendert");
  const comparison = JSON.parse(cmpText), replay = JSON.parse(repText);
  const map = o.map || loadInstrumentMap();
  const { rows } = loadReferences(refsPath);
  const refs = rows.filter((r) => (selfTest ? r.status === "TEST_FIXTURE" && isTestFixtureLike(r) : r.status === "INCLUDED")).map(stripInternal);
  const chains = revisionChains(refs).chains, chainOf = new Map();
  for (const c of chains.values()) for (const r of c) chainOf.set(r.referenceId, c);
  const recOf = new Map((replay.results || []).map((r) => [r.projection.referenceId, r]));
  const byId = new Map(refs.map((r) => [r.referenceId, r]));
  const caseRows = (comparison.rows || []).filter((x) => x.category !== "PLAUSIBILITY_FAILED");
  const out = caseRows.map((x) => {
    const ref = byId.get(x.referenceId);
    if (!ref) throw new OutcomeRefusedError(`Fall ${x.referenceId} fehlt im eingefrorenen Datensatz`);
    return outcomeForCase(ref, effectiveMapping(ref, map), recOf.get(x.referenceId), chainOf.get(x.referenceId), { loader: o.loader, horizon: o.horizon });
  });
  const res = { schemaVersion: "vu-practitioner-outcome-1.0.0", generatedAt: now, label: selfTest ? "SELF TEST ON TEST_FIXTURE DATA – NOT A RESULT" : "PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH — INTERN",
    status: selfTest ? "SELF_TEST" : "OK", freeze: { version: manifest.version, sha256: manifest.sha256 }, comparisonSha256: seal.comparisonSha256, scope: comparison.scope,
    directionSemantics: "erwartete Bewegung ab jetzt: Praktiker directionalBias, VU currentWave.direction", aggregate: aggregateOutcomes(out), rows: out };
  if (o.write !== false) writeFileSync(join(bench, "outcome.json"), JSON.stringify(res, null, 1) + "\n");
  return res;
}

function arg(name, d) { const i = process.argv.indexOf("--" + name); return i >= 0 ? process.argv[i + 1] : d; }
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try { const r = runOutcome({ refsPath: arg("refs"), benchDir: arg("bench") }); console.log(JSON.stringify({ status: r.status, cases: r.aggregate.cases }, null, 1)); }
  catch (e) { console.error(e.message); process.exit(1); }
}
