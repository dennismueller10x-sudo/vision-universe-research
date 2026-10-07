// Schreibt MINERVINI-GROUND-TRUTH-RESULTS.json und -FAILURES.json aus den oeffentlichen Logs (DEV-Faelle,
// Trichter DEV + HOLDOUT) mit der eingefrorenen Auswertung (build-results.mjs, unveraendert). Ergaenzt nach dem
// Replay: Lead-Pruefung je Fall (lead-review.json, praeregistriert zulaessig) und die explorative SEC-Tag-Diagnose.
// node scripts/supertrader/ground-truth/finalize-results.mjs --dev <log> --holdout <log> --explore <json> --runs <devRunId>,<holdoutRunId>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLog, evaluate, blockers, layerOf } from './build-results.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FID = path.resolve(here, '../fidelity');
const argv = process.argv.slice(2); const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const dev = parseLog(fs.readFileSync(arg('--dev'), 'utf8')), hold = parseLog(fs.readFileSync(arg('--holdout'), 'utf8'));
const res = evaluate(dev.cases, [...dev.funnels, ...hold.funnels]);
const lead = JSON.parse(fs.readFileSync(path.join(here, 'lead-review.json'), 'utf8'));
const explore = JSON.parse(fs.readFileSync(arg('--explore'), 'utf8'));
const freeze = JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-FREEZE.json'), 'utf8'));
const [devRun, holdRun] = String(arg('--runs') || ',').split(',');
const header = {
  label: 'Diagnose, keine Optimierung, keine Rueckwirkung auf Engine/Regelbuch/Live. Performance ist keine Ground Truth. DEV/HOLDOUT gelten als gesehene Daten.',
  engine: { name: 'minervini-adaptation-1.1.0', codeHash: freeze.engine.codeHash, rulebookHash: freeze.engine.rulebookHash },
  groundTruthFreeze: { casesHash: freeze.casesHash, commit: freeze.commit, frozenAt: freeze.frozenAt },
  runs: { DEV: { runId: devRun, cases: dev.cases.length }, HOLDOUT: { runId: holdRun, cases: hold.cases.length, note: 'alle Faelle ausserhalb des Fensters (2008-2015); nur Trichter. Zwei Vortagsanker (ACAD, RVNC) ohne Logzeile, weil der Vortag im HOLDOUT-Kalender fehlt (ohne Einfluss)' } },
};
fs.writeFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-RESULTS.json'), JSON.stringify({ schema: 'vu-minervini-ground-truth-results-1.0.0', ...header, ...res, exploratoryPostFreeze: { secTagDiagnosis: explore }, cases: dev.cases }, null, 2) + '\n');
const failures = dev.cases.filter((c) => c.replay && c.replay.decision !== 'DETECTED').map((c) => {
  const b = c.replay.trend ? blockers(c.replay) : [];
  const ex = explore.cases.find((x) => x.case_id === c.case_id);
  return { case_id: c.case_id, ticker: c.ticker, group: c.group, stratum: c.stratum || null, tags: c.tags || [], decision: c.replay.decision, reason: c.replay.reason || null, blockingRules: b, blockingLayers: [...new Set(b.map(layerOf))], mechanicalAttribution: c.replay.attribution || [], leadReview: lead[c.case_id] || null, secEarliestAcrossTags: ex ? ex.earliestAcrossTags : null, identity: c.identity || null };
});
fs.writeFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-FAILURES.json'), JSON.stringify({ schema: 'vu-minervini-ground-truth-failures-1.0.0', ...header, failures }, null, 2) + '\n');
console.log(`RESULTS/FAILURES geschrieben; Recall MAIN ${res.recall.MAIN.recall}; Baum ${res.decisionTree.join(',')}; Fehlfaelle ${failures.length}`);
