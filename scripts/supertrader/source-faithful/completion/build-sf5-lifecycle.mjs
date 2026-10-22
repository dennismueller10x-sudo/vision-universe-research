#!/usr/bin/env node
/**
 * Supertrader 5.0 – lifecycle artifact of the methods on the shared research engine: the Source-to-Execution matrix
 * (research/sf5-lifecycle-matrix.mjs), its validation, model assumptions and pre-registered variants, the platform
 * policy and the six readiness dimensions per strategy. Derived from the matrix, the registry and the contracts; the
 * only hand-entered facts are the snapshot runs (SF5_SNAPSHOT_RUNS: run id and public counts of the workflow log).
 * No status is upgraded: NOT_A_TRADABLE_STRATEGY, performanceClaim NONE and LIVE_NOT_APPROVED are fixed.
 *
 *   node scripts/supertrader/source-faithful/completion/build-sf5-lifecycle.mjs [--out <dir>] [--docs <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DARVAS } from '../contracts/darvas.mjs';
import { KK_BREAKOUT } from '../contracts/kullamagi.mjs';
import { POCKET_PIVOT, BUYABLE_GAP_UP } from '../contracts/morales-kacher.mjs';
import { HOLY_GRAIL } from '../contracts/holy-grail.mjs';
import { WEINSTEIN_INVESTOR, WEINSTEIN_TRADER } from '../contracts/weinstein.mjs';
import { SF5_MATRIX, SF5_MATRIX_VERSION, SF5_CLASS, validateSf5Matrix } from '../research/sf5-lifecycle-matrix.mjs';
import { ROW_READINESS } from '../research/minervini-lifecycle-matrix.mjs';
import { LIFECYCLE_PHASES } from '../research/minervini-lifecycle.mjs';
import { SF5_LIFECYCLES, sf5VariantRegistrySha256 } from '../research/sf5-lifecycles.mjs';
import { ENGINE_VERSION, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from '../research/lifecycle-engine.mjs';
import { FOUNDATION } from '../contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SF = path.resolve(HERE, '..');
const ROOT = path.resolve(SF, '..', '..', '..');
export const SF5_ARTIFACT_SCHEMA = 'supertrader-sf5-lifecycle-1.0.0';
export const SF5_CONTRACTS = Object.freeze({ DARVAS, KK_BREAKOUT, POCKET_PIVOT, BUYABLE_GAP_UP, WEINSTEIN_INVESTOR, WEINSTEIN_TRADER, HOLY_GRAIL_W_RAS97: HOLY_GRAIL });

/**
 * Snapshot runs of research/run-sf5-lifecycle.mjs (workflow mode sf5-lifecycle). Public counts only; metrics are sealed
 * on claude/supertrader-validation-results. Only a run whose research code fingerprint equals the current code counts
 * (test SF5-SNAPSHOT-RUN-CURRENT-CODE).
 */
export const SF5_SNAPSHOT_RUNS = Object.freeze([]);

function readinessOf(lc, rows, contract) {
  const count = (pred) => rows.filter(pred).length;
  const byClass = Object.fromEntries(Object.values(SF5_CLASS).map((c) => [c, count((r) => r.class === c)]));
  const operational = LIFECYCLE_PHASES.filter((ph) => ph !== 'STRATEGY_READINESS');
  const phases = Object.fromEntries(LIFECYCLE_PHASES.map((ph) => {
    const rs = rows.filter((r) => r.phase === ph);
    return [ph, { rows: rs.length, mechanical: rs.filter((r) => r.readiness === ROW_READINESS.MECHANICAL).length, underModelAssumption: rs.filter((r) => r.readiness === ROW_READINESS.MODEL).length, evidence: rs.filter((r) => r.readiness === ROW_READINESS.EVIDENCE).length, manual: rs.filter((r) => r.readiness === ROW_READINESS.MANUAL).length, blocked: rs.filter((r) => r.readiness === ROW_READINESS.BLOCKED).length }];
  }));
  const executable = operational.filter((ph) => phases[ph].mechanical + phases[ph].underModelAssumption > 0);
  const manualRows = rows.filter((r) => r.class === SF5_CLASS.MANUAL_REVIEW);
  const substituted = manualRows.filter((r) => r.readiness === ROW_READINESS.MODEL).map((r) => r.id);
  const pending = lc.sourceStatus === 'RESEARCH_VARIANT_SOURCE_PENDING_OWNER_DECISION', dataException = lc.sourceStatus === 'CONTRACT_SOURCES_WITH_DATA_EXCEPTION';
  const runs = SF5_SNAPSHOT_RUNS.filter((r) => r.strategies?.includes(lc.key));
  return {
    sourceFidelity: { byClass, contractVersion: contract.sourceContractVersion, contractRuleStatuses: contract.rules.reduce((o, r) => { o[r.status] = (o[r.status] || 0) + 1; return o; }, {}), sourceStatus: lc.sourceStatus },
    mechanicalCompleteness: { phases, executablePhases: executable.length, operationalPhases: operational.length, lifecycle: executable.length === operational.length ? 'MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS' : 'INCOMPLETE_LIFECYCLE', modelAssumptionsUsed: [...new Set(rows.flatMap((r) => r.modelAssumptions))].sort() },
    dataCoverage: { blocked: rows.filter((r) => r.class === SF5_CLASS.DATA_BLOCKED).map((r) => ({ row: r.id, data: r.data, missing: r.missing })), sourceBlocked: rows.filter((r) => r.class === SF5_CLASS.SOURCE_BLOCKED).map((r) => r.id) },
    backtestReadiness: { measurement: pending ? 'MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT' : dataException ? 'MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION' : 'MODEL_LIFECYCLE_STUDY', dataException: dataException ? lc.adapter.dataException : [], strategyBacktest: false, contractMeasurementUnchanged: true, why: `${manualRows.length} manual source decisions; ${substituted.length} are substituted by declared model assumptions in the simulation${pending ? '; entry and stop come from a source the owner has not accepted (contract status unchanged)' : ''}${dataException ? '; DATA_BLOCKED filters are not applied (data exception)' : ''}, so a complete run is a model study, never a strategy backtest`, snapshotRuns: runs, certification: FOUNDATION.certification },
    manualReview: { rows: manualRows.map((r) => r.id), substitutedInSimulation: substituted, required: true },
    liveReadiness: { status: 'LIVE_NOT_APPROVED', tradability: 'NOT_A_TRADABLE_STRATEGY', performanceClaim: 'NONE', liveActivation: false, orders: false, brokerConnection: false },
  };
}

export async function buildSf5Artifact() {
  const extract = JSON.parse(fs.readFileSync(path.join(SF, 'evidence', 'PSR709-EVIDENCE-EXTRACT.json'), 'utf8'));
  const validation = await validateSf5Matrix(SF5_MATRIX, extract, SF5_CONTRACTS);
  const R = new Map(extract.rules.map((r) => [r.rule_id, r]));
  const withSources = (rows) => rows.map((r) => ({ ...r, sources: [...new Set(r.psr709.map((p) => { const s = R.get(p); return s ? `${s.source_id} ${s.page_location} (${s.modal_strength}, ${s.confidence})` : null; }).filter(Boolean))] }));
  return {
    schema: SF5_ARTIFACT_SCHEMA, matrixVersion: SF5_MATRIX_VERSION, engineVersion: ENGINE_VERSION, snapshot: FOUNDATION.snapshotId, accounting: FOUNDATION.accounting.mode, variantRegistrySha256: sf5VariantRegistrySha256(),
    principles: ['a mechanically confirmed setup is not an executable trade', 'a model assumption is not a source rule', 'a lifecycle run with substituted manual decisions is a model study, not a strategy backtest', 'the original strategy and the platform research portfolio policy stay separate', 'a research variant from a source the owner has not accepted never changes a contract status', 'no live activation, no orders, no broker'],
    validation, portfolioPolicy: PLATFORM_RESEARCH_PORTFOLIO_POLICY,
    strategies: Object.fromEntries(SF5_LIFECYCLES.map((lc) => [lc.key, { strategyId: lc.strategyId, candidateId: lc.candidateId, adapterVersion: lc.adapter.version, label: lc.adapter.label, referenceConfig: lc.reference, runVariants: lc.variants.map((v) => ({ id: v.id, changes: v.changes })), modelAssumptions: lc.modelAssumptions, matrix: withSources(SF5_MATRIX[lc.key]), readiness: readinessOf(lc, SF5_MATRIX[lc.key], SF5_CONTRACTS[lc.key]) }])),
  };
}

const esc = (x) => String(x ?? '–').replace(/\|/g, '\\|');
export function sf5Markdown(a) {
  let md = '# Supertrader 5.0 – Source-to-Execution-Matrix (Darvas, Kullamägi Breakout, Pocket Pivot, Buyable Gap-Up, Weinstein Investor / Trader, Holy Grail Research-Variante)\n\n';
  md += 'Generiert mit `node scripts/supertrader/source-faithful/completion/build-sf5-lifecycle.mjs` aus `research/sf5-lifecycle-matrix.mjs`, `research/sf5-lifecycles.mjs`, den Verträgen und dem #709-Extrakt. Nicht von Hand bearbeiten. Bericht: [SUPERTRADER_5_FULL_STRATEGY_ADVANCEMENT_REPORT.md](SUPERTRADER_5_FULL_STRATEGY_ADVANCEMENT_REPORT.md).\n\n';
  md += `Validierung: ${a.validation.ok ? 'bestanden' : 'FEHLER ' + a.validation.errors.join(', ')}. Engine \`${a.engineVersion}\`, Varianten-Fingerabdruck \`${a.variantRegistrySha256.slice(0, 12)}…\`. Verbindlicher Registry-Status bleibt der Regelstatus des Vertrags.\n\n`;
  md += 'Grundsätze: ' + a.principles.join('; ') + '.\n\n';
  for (const v of Object.values(a.strategies)) {
    const rd = v.readiness;
    md += `## ${v.candidateId} \`${v.strategyId}\` (${v.adapterVersion})\n\n`;
    md += `- Source Fidelity: ${Object.entries(rd.sourceFidelity.byClass).map(([k, n]) => `${k} ${n}`).join(', ')}; Vertrag ${rd.sourceFidelity.contractVersion}; Quellenstatus ${rd.sourceFidelity.sourceStatus}\n`;
    md += `- Mechanik: ${rd.mechanicalCompleteness.lifecycle} (${rd.mechanicalCompleteness.executablePhases}/${rd.mechanicalCompleteness.operationalPhases} operative Phasen ausführbar)\n`;
    md += `- Daten: blockiert ${rd.dataCoverage.blocked.map((b) => b.row).join(', ') || '–'}; quellenblockiert ${rd.dataCoverage.sourceBlocked.join(', ') || '–'}\n`;
    md += `- Backtest: ${rd.backtestReadiness.measurement} (Strategie-Backtest: nein), ${rd.backtestReadiness.certification}; Snapshot-Läufe: ${rd.backtestReadiness.snapshotRuns.map((r) => r.runId).join(', ') || 'keiner'}\n`;
    md += `- Manuell: ${rd.manualReview.rows.length} Zeilen; in der Simulation ersetzt: ${rd.manualReview.substitutedInSimulation.join(', ') || '–'}\n`;
    md += `- Live: ${rd.liveReadiness.status}, ${rd.liveReadiness.tradability}, performanceClaim ${rd.liveReadiness.performanceClaim}\n\n`;
    md += '| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
    for (const r of v.matrix) md += `| ${r.phase} | ${r.id} | ${esc(r.condition)} | ${esc(r.psr709.join(', '))}${r.sources.length ? ' (' + esc(r.sources.join('; ')) + ')' : ''} | ${esc(r.contractRules.join(', '))} | ${r.class} | ${esc(r.modelAssumptions.join(', '))} | ${r.implemented ? '`' + r.implemented.code + '`' : '–'} | ${r.implemented ? r.implemented.tests.length : 0} | ${r.readiness} | ${esc([r.missing, r.note].filter(Boolean).join(' / '))} |\n`;
    md += '\n### Modellannahmen\n\n| ID | Phase | Referenz | Alternativen | Begründung |\n|---|---|---|---|---|\n';
    for (const m of v.modelAssumptions) md += `| ${m.id} | ${m.phase} | ${esc(m.reference)} | ${esc(m.alternatives.join('; '))} | ${esc(m.why)} |\n`;
    md += '\n### Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)\n\n| ID | Änderung gegenüber REF |\n|---|---|\n';
    for (const x of v.runVariants) md += `| ${x.id} | ${esc(JSON.stringify(x.changes))} |\n`;
    md += '\n';
  }
  return md;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? path.resolve(a[i + 1]) : d; };
  const out = opt('--out', path.join(SF, 'artifacts')), docs = opt('--docs', path.join(ROOT, 'docs'));
  const art = await buildSf5Artifact();
  if (!art.validation.ok) { process.stderr.write(`sf5 lifecycle: validation failed, nothing written: ${art.validation.errors.join(', ')}\n`); process.exit(1); }
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(out, 'STRATEGY-SF5-LIFECYCLE.json'), JSON.stringify(art, null, 1) + '\n');
  fs.writeFileSync(path.join(docs, 'SUPERTRADER_5_LIFECYCLE_MATRIX.md'), sf5Markdown(art));
  process.stdout.write(`sf5 lifecycle: validation ok; ${Object.entries(art.strategies).map(([k, v]) => `${k} ${v.matrix.length}`).join(', ')}\n`);
}
