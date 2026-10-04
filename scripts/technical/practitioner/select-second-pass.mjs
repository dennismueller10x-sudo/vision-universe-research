#!/usr/bin/env node
/* Doppelextraktion (§7): deterministische Auswahl von 25 % der Faelle (Seed 20261004) aus references.jsonl (alle Nicht-Test-Faelle
   mit Status CANDIDATE oder INCLUDED, Originale). Ausgabe: sortierte caseId-Liste (stdout, JSON). Gleiche Eingabe → gleiche Auswahl.
   node scripts/technical/practitioner/select-second-pass.mjs [--refs <jsonl>] */
import { loadReferences, selectSecondPass, isTestFixtureLike, SECOND_PASS_SEED, PATHS } from "./lib.mjs";
const i = process.argv.indexOf("--refs"), refsPath = i >= 0 ? process.argv[i + 1] : PATHS.references;
const { rows } = loadReferences(refsPath);
const ids = rows.filter((r) => !isTestFixtureLike(r) && (r.status === "CANDIDATE" || r.status === "INCLUDED") && r.viewKind !== "LATER_REVISION").map((r) => r.caseId);
console.log(JSON.stringify({ seed: SECOND_PASS_SEED, share: 0.25, cases: new Set(ids).size, selected: selectSecondPass(ids) }, null, 1));
