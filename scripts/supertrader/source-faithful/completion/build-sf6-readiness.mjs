#!/usr/bin/env node
/**
 * Supertrader 6.0 – certification readiness matrix of all 13 candidates (mandate sections 31/32), evaluated with the
 * criteria fixed in completion/sf6-readiness-criteria.mjs before any Supertrader 6.0 result existed.
 * Inputs (artifacts only; no hand-set grade, no performance number):
 *  - STRATEGY-READINESS-SF3.json        source fidelity, engine state, measurement class, manual decisions, data blockers
 *  - STRATEGY-SF5-LIFECYCLE.json        lifecycle phases of the seven sf5 lifecycles
 *  - STRATEGY-MINERVINI-LIFECYCLE.json  lifecycle phases of SEPA / Power Play
 *  - STRATEGY-KK-EP-PS-CHART.json       chart-first EP / PS model studies
 *  - completion/sf6-run-facts.mjs       public receipts of the Supertrader 6.0 snapshot runs (integrity, validation, holdout)
 *  - completion/sf6-paper-protocol-2027.mjs  the prospective paper protocol (E2); the only source of CC-8 evidence
 * Output: artifacts/STRATEGY-SF6-READINESS.json and docs/SUPERTRADER_6_READINESS_MATRIX.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SF6_READINESS_VERSION, DIMENSIONS, CERTIFICATION_CRITERIA, CC5, SF6_OWNER_DECISIONS, sf6ReadinessCriteriaSha256 } from './sf6-readiness-criteria.mjs';
import { SF6_PAPER_PROTOCOL, sf6PaperProtocolSha256 } from './sf6-paper-protocol-2027.mjs';
import { SF6_RUN_FACTS } from './sf6-run-facts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SF = path.resolve(HERE, '..'), ROOT = path.resolve(SF, '..', '..', '..');
const art = (f) => JSON.parse(fs.readFileSync(path.join(SF, 'artifacts', f), 'utf8'));

/** Candidate -> lifecycle key of the Supertrader 6.0 runs (null = not a snapshot lifecycle). */
export const LIFECYCLE_KEY = Object.freeze({ C01: 'TURTLE_S1', C02: 'TURTLE_S2', C03: 'DARVAS', C04: 'WEINSTEIN_INVESTOR', C05: 'WEINSTEIN_TRADER', C06: 'MINERVINI_SEPA', C07: 'MINERVINI_POWER_PLAY', C08: 'KK_BREAKOUT', C09: null, C10: null, C11: 'POCKET_PIVOT', C12: 'BUYABLE_GAP_UP', C13: 'HOLY_GRAIL_W_RAS97' });
const PHASES = Object.freeze({ SETUP_COMPLETENESS: ['SETUP_QUALIFICATION', 'ENTRY_ELIGIBILITY'], ENTRY_COMPLETENESS: ['ENTRY_EXECUTION'], STOP_COMPLETENESS: ['INITIAL_STOP'], POSITION_MANAGEMENT: ['POSITION_SIZING', 'POSITION_MANAGEMENT'], EXIT_COMPLETENESS: ['EXIT_CONDITIONS'] });
const g = (grade, evidence) => ({ grade, evidence });

/** Grade of a set of lifecycle phases from the matrix counts (rows / mechanical / model / evidence / manual / blocked). */
export function phaseGrade(phases, names) {
  const p = names.map((n) => phases?.[n]).filter(Boolean);
  if (!p.length) return g('NOT_EVIDENCED', 'no lifecycle matrix row');
  const sum = (k) => p.reduce((a, x) => a + (x[k] || 0), 0), rows = sum('rows'), mech = sum('mechanical'), model = sum('underModelAssumption'), manual = sum('manual'), blocked = sum('blocked');
  const ev = `${names.join('+')}: ${rows} rows, ${mech} mechanical, ${model} under model assumption, ${manual} manual, ${blocked} blocked`;
  if (mech + model === 0) return g(blocked ? 'BLOCKED' : 'PARTIAL', ev);
  if (manual || blocked) return g('PARTIAL', ev);
  if (model) return g('MODEL_ASSUMPTION', ev);
  return g('PASS', ev);
}

function sourceGrade(c) {
  const s = c.sourceFidelity, ev = `contract ${c.sourceContractVersion}: ${s.exact} exact, ${s.derived} derived (${s.derivedFromSecondarySource} from a secondary source), ${s.manual} manual, ${s.dataBlocked} data-blocked, ${s.sourceAmbiguous} ambiguous${s.translationOnlySource ? '; wording only via translation' : ''}`;
  if (s.translationOnlySource) return g('PARTIAL', ev);
  if (s.sourceAmbiguous || s.derivedFromSecondarySource) return g('PASS_WITH_DECLARED_LIMITS', ev);
  return g(s.manual ? 'PASS_WITH_DECLARED_LIMITS' : 'PASS', ev);
}

/** Readiness row of one candidate. */
export function candidateRow(c, { sf5, min, kk, facts = SF6_RUN_FACTS }) {
  const key = LIFECYCLE_KEY[c.candidateId], isTurtle = key?.startsWith('TURTLE');
  const lc = key && (sf5.strategies[key] ?? (key === 'MINERVINI_SEPA' ? min.strategies.SEPA : key === 'MINERVINI_POWER_PLAY' ? min.strategies.POWER_PLAY : null));
  const ep = kk.strategies[c.candidateId] ?? null;
  const phases = lc?.readiness?.mechanicalCompleteness?.phases ?? null, executable = lc?.readiness?.mechanicalCompleteness?.executablePhases ?? null;
  const model = facts.validation?.models ? Object.values(facts.validation.models).find((m) => m.candidateId === c.candidateId && m.phaseClosed) : null;
  const integ = key ? facts.integrity?.lifecycles?.[key]?.[CC5.policy]?.comparisonWithBase ?? null : null;
  const valRef = key ? facts.validation?.references?.[key] ?? null : null, hold = key ? facts.holdout?.references?.[key] ?? null : null;
  const d = {};
  d.SOURCE_FIDELITY = sourceGrade(c);
  for (const [dim, names] of Object.entries(PHASES)) {
    if (isTurtle) d[dim] = g(c.mechanicalCompleteness.engine.startsWith('RESEARCH_ENGINE_COMPLETE') ? 'PASS_WITH_DECLARED_LIMITS' : 'PARTIAL', `${c.mechanicalCompleteness.engine}; acceptance gate AG-1..AG-7; data exception ${c.dataCoverage.blockingDataRules.join(', ') || '-'}`);
    else if (ep) d[dim] = g('MODEL_ASSUMPTION', `${ep.label}; ${ep.researchStage ?? ''}`.trim());
    else d[dim] = phaseGrade(phases, names);
  }
  if (model && d[{ INITIAL_STOP: 'STOP_COMPLETENESS', POSITION_MANAGEMENT: 'POSITION_MANAGEMENT' }[model.phaseClosed]]) {
    const dim = { INITIAL_STOP: 'STOP_COMPLETENESS', POSITION_MANAGEMENT: 'POSITION_MANAGEMENT' }[model.phaseClosed];
    d[dim] = { ...d[dim], sf6ModelVariant: { id: model.id ?? null, assumption: model.assumption, trades: model.trades, note: 'phase closed only by an SF6 model variant (never a source rule); the reference stays without this phase' } };
  }
  d.PORTFOLIO_ACCOUNTING = c.candidateId === 'C10' ? g('PARTIAL', 'hypothetical one-unit short single-trade study; no portfolio') : (valRef?.costLevels?.REF?.reconciliation || lc || isTurtle || ep) ? g('PASS_WITH_DECLARED_LIMITS', 'research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)') : g('NOT_EVIDENCED', '-');
  d.PIT_DATA_INTEGRITY = g(c.dataCoverage.blockingDataRules.length ? 'PARTIAL' : 'PASS_WITH_DECLARED_LIMITS', `snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); ${c.dataCoverage.blockingDataRules.length ? 'data-blocked rules: ' + c.dataCoverage.blockingDataRules.join(', ') : 'no data-blocked essential rule'}`);
  // E1: the quarantine is a diagnostic containment; V4-D1 stays an open data-integrity blocker, so this dimension is at most PARTIAL
  const caResolved = key ? facts.v4d1Resolution?.[key] === 'RESOLVED' : false;
  d.CORPORATE_ACTION_INTEGRITY = !integ ? g('NOT_EVIDENCED', key ? 'no SF6 integrity run recorded' : 'not a snapshot lifecycle (EP / PS candidate days come from the same snapshot; not separately contained)') : g(caResolved ? 'PASS_WITH_DECLARED_LIMITS' : 'PARTIAL', `V4-D1 ${caResolved ? 'resolved by verified corporate-action evidence' : 'CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker)'}; ${CC5.policy} diagnostic: ${integ.directlyExposed} of ${integ.baseTrades} reference trades directly exposed (${(100 * integ.directlyExposedShare).toFixed(2)} %${integ.directlyExposedShare <= CC5.reportedExposureBound ? '' : `, above the reported bound of ${100 * CC5.reportedExposureBound} %`}); ${integ.unchanged} unchanged, ${integ.removed} removed, ${integ.changed} changed (knock-on ${integ.knockOnChanged + integ.knockOnRemoved})`);
  const shortHypo = c.candidateId === 'C10';
  d.EXECUTION_REALISM = shortHypo ? g('BLOCKED', 'short execution hypothetical: no historical borrow, locates or fees') : ep ? g('MODEL_ASSUMPTION', 'IEX venue minutes only (1-5 % of consolidated volume); buy stop resolved in time order') : g(valRef?.costLevels?.['COST-50'] ? 'PASS_WITH_DECLARED_LIMITS' : 'MODEL_ASSUMPTION', `daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared${valRef?.costLevels?.['COST-50'] ? '; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)' : '; cost sensitivity not yet measured'}`);
  const auth = key ? facts.integrity?.baseMatchesAuthoritative?.[key] ?? null : null;
  const hashEqual = auth?.ledgerSha256 === 'EQUAL' && auth.tradesSha256 !== 'DIFFERENT';
  d.BACKTEST_REPRODUCIBILITY = key && facts.integrity?.runId ? g(hashEqual ? 'PASS' : 'PARTIAL', `frozen snapshot ${facts.integrity.snapshotId}, research-v1, reconciled; BASE vs authoritative run ${auth?.authoritativeRunId ?? '-'}: ledger hash ${auth?.ledgerSha256 ?? 'NOT_COMPARED'}, trade hash ${auth?.tradesSha256 ?? 'NOT_COMPARED'}`) : ep ? g('PASS_WITH_DECLARED_LIMITS', 'snapshot + private IEX cache (not frozen in the snapshot)') : g('NOT_EVIDENCED', '-');
  // E6: three statements that are never merged into one
  const ref = valRef?.costLevels?.REF?.trades, c50 = valRef?.costLevels?.['COST-50']?.trades;
  d.BACKTEST_REPRODUCIBILITY.e6 = {
    numericalReproducibility: !auth ? 'NOT_EVIDENCED' : hashEqual ? (auth.tradesSha256 === 'EQUAL' ? 'LEDGER_AND_TRADE_HASH_IDENTICAL' : 'LEDGER_HASH_IDENTICAL') : 'NOT_IDENTICAL',
    tradeStability: integ ? { underQuarantine: `${integ.unchanged} of ${integ.baseTrades} trades unchanged (${(100 * integ.unchanged / integ.baseTrades).toFixed(0)} %)`, underCost50: ref != null && c50 != null ? `${ref} -> ${c50} trades` : 'not measured' } : 'NOT_EVIDENCED',
    robustness: 'NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)',
  };
  d.OUT_OF_SAMPLE_EVIDENCE = hold ? g('PASS_WITH_DECLARED_LIMITS', `historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): ${hold.costLevels?.REF?.trades ?? 0} reference trades; untouched window only ${SF6_PAPER_PROTOCOL.id} from ${SF6_PAPER_PROTOCOL.window.start} (${SF6_PAPER_PROTOCOL.activation.status})`) : g('NOT_EVIDENCED', ep ? 'IEX minutes start 2017: no second period' : 'no untouched holdout; DEV 2016-2026 read by earlier rounds');
  const manual = c.manualReview.essentialDecisions.length;
  d.MANUAL_REVIEW_REQUIREMENTS = g(manual ? 'PARTIAL' : 'PASS', manual ? `${manual} essential manual source decisions substituted by declared model assumptions` : 'none');
  // certification criteria
  const cc = {
    'CC-1-SOURCE': !c.sourceFidelity.sourceAmbiguous && !c.sourceFidelity.derivedFromSecondarySource && !c.sourceFidelity.translationOnlySource && !(c.flags ?? []).includes('PARTIAL_SOURCE_BLOCKED') && !(executable !== null && executable < 9),
    'CC-2-LIFECYCLE': isTurtle ? true : executable === 9,
    'CC-3-NO-MANUAL': manual === 0,
    'CC-4-DATA': c.dataCoverage.blockingDataRules.length === 0,
    'CC-5-CORPORATE-ACTIONS': CC5.satisfiesCriterion || caResolved, // E1: containment never passes; only a verified resolution
    'CC-6-REPRODUCIBLE': d.BACKTEST_REPRODUCIBILITY.grade === 'PASS',
    'CC-7-EXECUTION': !shortHypo && !ep && !!valRef?.costLevels?.['COST-50'],
    'CC-8-OOS': !!key && facts.paper?.protocolSha256 === sf6PaperProtocolSha256() && facts.paper?.references?.[key]?.cc8Evidenced === true, // E2: only SF6-PAPER-2027
  };
  const failed = Object.entries(cc).filter(([, v]) => !v).map(([k]) => k);
  d.CERTIFICATION_READINESS = g(failed.length ? 'BLOCKED' : 'PASS', failed.length ? `failed: ${failed.join(', ')}` : 'all eight hard criteria pass (no certification is implied)');
  d.LIVE_READINESS = g('BLOCKED', 'LIVE_NOT_APPROVED (no live activation, no broker, no orders)');
  // primary completion state, in the fixed order of sf6-readiness-criteria.mjs
  const sourceBlockedPhase = !isTurtle && executable !== null && executable < 9; // a phase the source does not disclose
  const dataBlocked = !lc && !isTurtle && !ep;
  const validationBlocked = !!ep;
  const technicallyIncomplete = c.mechanicalCompleteness.engine === 'INCOMPLETE';
  const state = technicallyIncomplete ? 'TECHNICALLY_INCOMPLETE' : sourceBlockedPhase ? 'SOURCE_BLOCKED' : dataBlocked ? 'DATA_BLOCKED' : validationBlocked ? 'VALIDATION_BLOCKED' : failed.length ? 'RESEARCH_COMPLETE_WITH_EXCEPTIONS' : 'CERTIFICATION_CANDIDATE';
  return { candidateId: c.candidateId, strategyId: c.strategyId, lifecycleKey: key, primaryState: state, technicallyComplete: c.mechanicalCompleteness.engine !== 'INCOMPLETE', liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED', measurementClass: c.backtestReadiness.measurement?.class ?? c.backtestReadiness.measurement ?? null, executablePhases: isTurtle ? 9 : executable, certificationCriteria: cc, dimensions: d };
}

export function buildSf6Readiness({ facts = SF6_RUN_FACTS } = {}) {
  const sf3 = art('STRATEGY-READINESS-SF3.json'), sf5 = art('STRATEGY-SF5-LIFECYCLE.json'), min = art('STRATEGY-MINERVINI-LIFECYCLE.json'), kk = art('STRATEGY-KK-EP-PS-CHART.json'), status = art('STRATEGY-COMPLETION-STATUS.json');
  const flags = new Map(status.candidates.map((x) => [x.candidateId, x.flags]));
  const rows = sf3.candidates.map((c) => candidateRow({ ...c, flags: flags.get(c.candidateId) }, { sf5, min, kk, facts }));
  for (const r of rows) if (!DIMENSIONS.every((k) => r.dimensions[k])) throw new Error(`SF6_DIMENSION_MISSING:${r.candidateId}`);
  const tally = (f) => rows.reduce((o, r) => { const k = f(r); o[k] = (o[k] || 0) + 1; return o; }, {});
  return { schema: 'supertrader-sf6-readiness-1.1.0', criteriaVersion: SF6_READINESS_VERSION, criteriaSha256: sf6ReadinessCriteriaSha256(), criteria: CERTIFICATION_CRITERIA, ownerDecisions: SF6_OWNER_DECISIONS, paperProtocol: { id: SF6_PAPER_PROTOCOL.id, version: SF6_PAPER_PROTOCOL.version, start: SF6_PAPER_PROTOCOL.window.start, status: SF6_PAPER_PROTOCOL.status, activation: SF6_PAPER_PROTOCOL.activation.status, sha256: sf6PaperProtocolSha256() }, runs: { integrity: facts.integrity?.runId ?? null, validation: facts.validation?.runId ?? null, holdout: facts.holdout?.runId ?? null }, liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED', summary: { byPrimaryState: tally((r) => r.primaryState), certificationCandidates: rows.filter((r) => r.primaryState === 'CERTIFICATION_CANDIDATE').map((r) => r.candidateId) }, candidates: rows };
}

const SHORT = { PASS: 'PASS', PASS_WITH_DECLARED_LIMITS: 'PASS*', MODEL_ASSUMPTION: 'MA', PARTIAL: 'TEIL', BLOCKED: 'GESPERRT', NOT_EVIDENCED: 'NICHT BELEGT', NOT_APPLICABLE: '–' };
export function sf6ReadinessMarkdown(a) {
  let md = '# Supertrader 6.0 – Certification-Readiness-Matrix (generiert)\n\n';
  md += `Erzeugt von \`scripts/supertrader/source-faithful/completion/build-sf6-readiness.mjs\` aus Artefakten und Lauf-Receipts. Kriterien \`${a.criteriaVersion}\` (Fingerabdruck \`${a.criteriaSha256.slice(0, 12)}…\`), festgeschrieben vor dem ersten Supertrader-6.0-Ergebnis. Keine Note ist von Hand gesetzt; keine Kennzahl geht ein.\n\n`;
  md += `Eigentümerentscheidungen E1–E6 vom 24.10.2026 sind eingearbeitet: V4-D1 bleibt ein offener Datenintegritätsblocker (CC-5 nie durch die Quarantäne erfüllt); CC-8 nur aus dem prospektiven Paper-Protokoll \`${a.paperProtocol.id}\` ${a.paperProtocol.version} ab ${a.paperProtocol.start} (${a.paperProtocol.activation}, Fingerabdruck \`${a.paperProtocol.sha256.slice(0, 12)}…\`); Modellvarianten und SIC-Proxys zählen nie.\n\n`;
  md += 'Legende: PASS = belegt; PASS* = belegt mit deklarierten Grenzen; MA = nur unter deklarierter Modellannahme; TEIL = teilweise (manuell oder Lücke); GESPERRT = gesperrt; NICHT BELEGT = keine Evidenz.\n\n';
  const dims = DIMENSIONS;
  md += `| # | Strategie | Abschlusszustand | ${dims.map((x) => x.replace(/_/g, ' ').toLowerCase()).join(' | ')} |\n|---|---|---|${dims.map(() => '---').join('|')}|\n`;
  for (const r of a.candidates) md += `| ${r.candidateId} | ${r.strategyId} | ${r.primaryState} | ${dims.map((k) => SHORT[r.dimensions[k].grade]).join(' | ')} |\n`;
  md += '\n## Evidenz je Strategie\n';
  for (const r of a.candidates) {
    md += `\n### ${r.candidateId} ${r.strategyId} – ${r.primaryState}\n\n`;
    for (const k of dims) md += `- **${k}**: ${SHORT[r.dimensions[k].grade]} – ${r.dimensions[k].evidence}${r.dimensions[k].sf6ModelVariant ? ` (SF6-Modellvariante ${r.dimensions[k].sf6ModelVariant.assumption}: Phase nur als Modellannahme geschlossen)` : ''}\n`;
    const e6 = r.dimensions.BACKTEST_REPRODUCIBILITY.e6;
    if (e6) md += `- **E6**: numerische Reproduzierbarkeit ${e6.numericalReproducibility}; Trade-Stabilität ${typeof e6.tradeStability === 'string' ? e6.tradeStability : `${e6.tradeStability.underQuarantine} unter DQ-K5, Kosten 50 bps ${e6.tradeStability.underCost50}`}; Robustheit ${e6.robustness}\n`;
    md += `- Harte Kriterien: ${Object.entries(r.certificationCriteria).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(', ')}\n`;
  }
  return md;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = buildSf6Readiness();
  fs.writeFileSync(path.join(SF, 'artifacts', 'STRATEGY-SF6-READINESS.json'), JSON.stringify(a, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, 'docs', 'SUPERTRADER_6_READINESS_MATRIX.md'), sf6ReadinessMarkdown(a));
  console.log(JSON.stringify(a.summary));
}
