#!/usr/bin/env node
/**
 * Supertrader 3.0 readiness: six separate dimensions per candidate (mandate phase 8), DERIVED from the contracts, the
 * completion status artifact and the research components; nothing is set by hand except the declared mapping of a
 * research component to the rules it informs (the researchEvidence field of each rule).
 *
 *  1. sourceFidelity          rule statuses of the contract (EXACT / DERIVED / MANUAL / DATA / AMBIGUOUS)
 *  2. mechanicalCompleteness  engine state of the completion status + mechanical research components
 *  3. dataCoverage            blocking data rules, proxies available (a proxy never unblocks a rule)
 *  4. backtestReadiness       measurement class: FULL_DIAGNOSTIC_STRATEGY_BACKTEST / MECHANICAL_COMPONENT_STUDY /
 *                             SCREEN_STATISTICS / NOT_MEASURABLE (a component or screen result is never a strategy return)
 *  5. manualReview            essential manual decisions
 *  6. liveReadiness           always LIVE_NOT_APPROVED (no live path, no orders)
 *
 *   node scripts/supertrader/source-faithful/completion/build-readiness-sf3.mjs [--out <dir>] [--docs <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACTS } from '../registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SF = path.resolve(HERE, '..');
const ROOT = path.resolve(SF, '..', '..', '..');
export const READINESS_SF3_SCHEMA = 'supertrader-sf3-strategy-readiness-1.0.0';
export const MEASUREMENT = Object.freeze({
  FULL: 'FULL_DIAGNOSTIC_STRATEGY_BACKTEST',
  COMPONENT: 'MECHANICAL_COMPONENT_STUDY',
  SCREEN: 'SCREEN_STATISTICS',
  NONE: 'NOT_MEASURABLE',
});
/** Which parts of research/run-sf3-research.mjs measure a candidate on the snapshot. */
const SF3_RUNNER_PARTS = Object.freeze({ SF_TURTLE_S1: ['turtle'], SF_TURTLE_S2: ['turtle'], SF_WEINSTEIN_INVESTOR: ['weinstein'], SF_WEINSTEIN_TRADER: ['weinstein'], SF_MINERVINI_SEPA_VCP: ['minervini'], SF_MINERVINI_POWER_PLAY: ['minervini'], SF_DARVAS_BOX: ['context: leadership coverage only, no method candidates'], SF_KK_BREAKOUT: ['context: leadership coverage only, no method candidates'], SF_MOKA_POCKET_PIVOT: ['context: leadership coverage only, no method candidates'], SF_MOKA_BUYABLE_GAP_UP: ['context: leadership coverage only, no method candidates'] });

function measurementOf(st, contract) {
  if (st.backtestReadiness === 'DIAGNOSTIC_READY') return { class: MEASUREMENT.FULL, note: st.fullMethodMeasurable ? 'complete engine' : `diagnostic run WITH DATA EXCEPTION (${st.blockingDataRules.join(', ')} not enforced in reference runs)` };
  if (st.backtestReadiness === 'COMPONENT_SIGNAL_STUDY_ONLY') return { class: MEASUREMENT.COMPONENT, note: 'mechanical signals with their mechanical exit, equal weight, no selection or sizing; not a method return' };
  const entryOrStopBlocked = contract.rules.some((r) => ['ENTRY', 'STOP'].includes(r.kind) && r.essential !== false && ((r.status === 'DATA_BLOCKED' && !(r.scopes && !r.scopes.includes('EQUITY_ADAPTATION'))) || r.status === 'SOURCE_AMBIGUOUS'));
  if (st.engine === 'MECHANICAL_COMPONENTS_ONLY' || entryOrStopBlocked) return { class: MEASUREMENT.NONE, note: 'the essential entry or stop is data- or source-blocked; no daily-bar substitute; setup counts are evidence only' };
  return { class: MEASUREMENT.SCREEN, note: 'machine screen with manual layer: counts and coverage of candidates; a forward price change after a screen is a screen statistic, not a strategy return' };
}

export function buildReadiness() {
  const status = JSON.parse(fs.readFileSync(path.join(SF, 'artifacts', 'STRATEGY-COMPLETION-STATUS.json'), 'utf8'));
  const rows = status.candidates.map((st) => {
    const c = CONTRACTS.find((x) => x.strategyId === st.strategyId);
    const count = (s) => c.rules.filter((r) => r.status === s).length;
    const evidence = c.rules.flatMap((r) => (r.researchEvidence || []).map((e) => ({ rule: r.id, ruleStatus: r.status, code: e.code, note: e.note })));
    const proxies = evidence.filter((e) => e.ruleStatus === 'DATA_BLOCKED').map((e) => `${e.rule}: ${e.note}`);
    const translationOnly = c.rules.some((r) => r.translationUnverified);
    return {
      candidateId: st.candidateId, strategyId: st.strategyId, sourceContractVersion: c.sourceContractVersion,
      sourceFidelity: { exact: count('SOURCE_EXACT'), derived: count('SOURCE_DERIVED'), manual: count('MANUAL_REVIEW_REQUIRED'), dataBlocked: count('DATA_BLOCKED'), sourceAmbiguous: count('SOURCE_AMBIGUOUS'), notImplemented: count('NOT_IMPLEMENTED'), implementationStatus: st.implementationStatus, translationOnlySource: translationOnly, sourceOpenRules: st.blockingSourceRules, modelAssumptions: st.modelAssumptions },
      mechanicalCompleteness: { engine: st.engine, acceptanceGate: st.acceptanceGate, researchComponents: evidence.map((e) => `${e.rule} <- ${e.code.split('/').at(-1)}`) },
      dataCoverage: { blockingDataRules: st.blockingDataRules, proxiesAvailableNotUnblocking: proxies },
      backtestReadiness: { registry: st.backtestReadiness, measurement: measurementOf(st, c), sf3RunnerParts: SF3_RUNNER_PARTS[st.strategyId] ?? [], certification: 'DIAGNOSTIC_NOT_CERTIFIED' },
      manualReview: { essentialDecisions: st.manualDecisions, required: st.manualDecisions.length > 0 },
      liveReadiness: { status: st.liveReadiness, liveActivation: false, orders: false },
    };
  });
  return {
    schema: READINESS_SF3_SCHEMA, derivedFrom: ['STRATEGY-COMPLETION-STATUS.json', 'contracts/*.mjs (researchEvidence)'],
    principles: ['a mechanically complete screening component is not a tradable strategy', 'a historical model assumption is not a source rule', 'a diagnostic performance is not a certified performance', 'a proxy (SIC group, universe breadth, VU RS percentile) never unblocks a DATA_BLOCKED rule'],
    measurementClasses: Object.values(MEASUREMENT),
    candidates: rows,
    summary: Object.fromEntries(Object.values(MEASUREMENT).map((m) => [m, rows.filter((r) => r.backtestReadiness.measurement.class === m).map((r) => r.strategyId)])),
  };
}

export function readinessMarkdown(r) {
  let md = '# Supertrader 3.0 – Strategy Readiness (sechs Dimensionen)\n\nGeneriert mit `node scripts/supertrader/source-faithful/completion/build-readiness-sf3.mjs` aus `STRATEGY-COMPLETION-STATUS.json` und den Verträgen. Nicht von Hand bearbeiten. Bericht: [SUPERTRADER_3_STRATEGY_ADVANCEMENT_REPORT.md](SUPERTRADER_3_STRATEGY_ADVANCEMENT_REPORT.md).\n\n';
  md += 'Grundsätze: ' + r.principles.join('; ') + '.\n\n';
  md += '| Kandidat | Strategie | 1 Source Fidelity (exakt/abgel./manuell/Daten/offen) | 2 Mechanik (Engine) | 3 blockierende Daten | 4 Messklasse | 5 manuelle Entscheidungen | 6 Live |\n|---|---|---|---|---|---|---|---|\n';
  for (const c of r.candidates) {
    const f = c.sourceFidelity;
    md += `| ${c.candidateId} | \`${c.strategyId}\` | ${f.exact}/${f.derived}/${f.manual}/${f.dataBlocked}/${f.sourceAmbiguous}${f.translationOnlySource ? ' (nur Übersetzung)' : ''} | ${c.mechanicalCompleteness.engine} | ${c.dataCoverage.blockingDataRules.join(', ') || '–'} | ${c.backtestReadiness.measurement.class} | ${c.manualReview.essentialDecisions.length} | ${c.liveReadiness.status} |\n`;
  }
  md += '\n## Messklassen\n\n';
  for (const [k, v] of Object.entries(r.summary)) md += `- **${k}**: ${v.map((x) => `\`${x}\``).join(', ') || '–'}\n`;
  md += '\n## Research-Komponenten und Stellvertreter je Kandidat\n\n';
  for (const c of r.candidates) {
    md += `### ${c.candidateId} \`${c.strategyId}\` (Vertrag ${c.sourceContractVersion})\n\n`;
    md += `- Messung: ${c.backtestReadiness.measurement.note}\n`;
    md += `- Research-Komponenten: ${c.mechanicalCompleteness.researchComponents.join('; ') || '–'}\n`;
    md += `- Stellvertreter (heben keine Datensperre auf): ${c.dataCoverage.proxiesAvailableNotUnblocking.join('; ') || '–'}\n`;
    md += `- quellenoffen: ${c.sourceFidelity.sourceOpenRules.join(', ') || '–'}; Modellannahmen: ${c.sourceFidelity.modelAssumptions.join(', ') || '–'}\n\n`;
  }
  return md;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? path.resolve(a[i + 1]) : d; };
  const out = opt('--out', path.join(SF, 'artifacts')), docs = opt('--docs', path.join(ROOT, 'docs'));
  const r = buildReadiness();
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(out, 'STRATEGY-READINESS-SF3.json'), JSON.stringify(r, null, 1) + '\n');
  fs.writeFileSync(path.join(docs, 'SUPERTRADER_3_STRATEGY_READINESS.md'), readinessMarkdown(r));
  process.stdout.write(`readiness: ${r.candidates.length} candidates; ${Object.entries(r.summary).map(([k, v]) => `${k} ${v.length}`).join(', ')}\n`);
}
