#!/usr/bin/env node
/**
 * Supertrader 4.0 – Minervini lifecycle artifact: the Source-to-Execution matrix (research/minervini-lifecycle-matrix.mjs),
 * its validation, the model assumptions and research variants, and the six readiness dimensions SEPARATELY for SEPA /
 * VCP and Power Play (mandate phase I). Everything is derived from the matrix, the lifecycle module and the contracts;
 * the only hand-entered facts are the snapshot runs (SNAPSHOT_RUNS: run id and public counts of the workflow log).
 * No status is upgraded: tradability NOT_A_TRADABLE_STRATEGY, performanceClaim NONE and LIVE_NOT_APPROVED are fixed.
 *
 *   node scripts/supertrader/source-faithful/completion/build-minervini-lifecycle.mjs [--out <dir>] [--docs <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINERVINI_SEPA, MINERVINI_POWER_PLAY } from '../contracts/minervini.mjs';
import { MATRIX, MATRIX_VERSION, ROW_READINESS, validateLifecycleMatrix } from '../research/minervini-lifecycle-matrix.mjs';
import { CLASS, LIFECYCLE_PHASES, MODEL_ASSUMPTIONS, RUN_VARIANTS, REFERENCE_CONFIG, LIFECYCLE_VERSION } from '../research/minervini-lifecycle.mjs';
import { EQUITY_RESEARCH_PORTFOLIO_POLICY } from '../research/minervini-execution.mjs';
import { FOUNDATION } from '../contract.mjs';
import { SF7_MINERVINI_VARIANTS, SF7_MINERVINI_SUPERSEDED, SF7_MINERVINI_REVISIONS, SF7_MINERVINI_VERSION, sf7MinerviniVariantsSha256 } from '../research/sf7-minervini-variants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SF = path.resolve(HERE, '..');
const ROOT = path.resolve(SF, '..', '..', '..');
export const LIFECYCLE_ARTIFACT_SCHEMA = 'supertrader-sf4-minervini-lifecycle-1.0.0';
const CONTRACTS = { SEPA: MINERVINI_SEPA, POWER_PLAY: MINERVINI_POWER_PLAY };

/**
 * Snapshot runs of research/run-sf4-lifecycle.mjs (workflow mode sf4-lifecycle). Public counts only; metrics are sealed
 * on claude/supertrader-validation-results. Only a run whose research code fingerprint equals the current code counts
 * (test SF4-SNAPSHOT-RUN-CURRENT-CODE); earlier runs (39726911654, 39728252900) were superseded by code changes.
 * 40170832007 (Supertrader 7.0) supersedes 39746264325 with hash-identical public variant blocks (SF7-D4 variants added).
 */
export const SNAPSHOT_RUNS = Object.freeze([
  // Supertrader 7.0 (SF7-D3 / SF7-D4, owner decision E7-3): rerun on the code with the SF7 variants; every public variant
  // block (counts, exit reasons, ledgerSha256, tradesSha256) identical to 39746264325; plus the SF7 variants
  Object.freeze({"runId":"40170832007","commit":"d32d1013daad17df31ebd979ba7168969b1891b8","role":"AUTHORITATIVE","strategies":["SEPA","POWER_PLAY"],"snapshotId":"sts1-134d4d62eb88b6ff8d98fe6e56b12a6d","datasetVerified":"EXACT","datasetSha256":"3ea6443de70c790c2927ceb65653077fbd2095e83d03389d9a450bc47df8d454","researchCodeSha256":"c834b227045b758f78dcf417f188cbf663f4153433395113e06ee81e54b7f30f","engineCodeSha256":"89fbcf864a57041379bc62d4af64cfda7c5601aaaf1c08b38fd6b91b6472ef24","variantRegistrySha256":"f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75","allVariantsReconciled":true,"referenceDeterministic":true,"referenceTrades":{"SEPA":{"trades":954,"closed":937,"openAtDataEnd":17},"POWER_PLAY":{"trades":1007,"closed":998,"openAtDataEnd":9}},"tradesByVariant":{"SEPA":{"REF":954,"ALT-SETUP-TT-PIVOT":1160,"ALT-STOP-MAXLOSS10":632,"ALT-ORDER-STOP-MARKET":988,"ALT-ENTRY-VOLUME-NEXT-OPEN":738,"ALT-INTRABAR-OPTIMISTIC":987,"ALT-EXIT-STOP-BE3R":364,"ALT-EXIT-FREEROLL-2R":391,"ALT-EXIT-FREEROLL-3R":428,"ALT-RISK-0075":1114,"ALT-RISK-025":861},"POWER_PLAY":{"REF":1007,"ALT-STOP-MAXLOSS10":833,"ALT-ORDER-STOP-MARKET":1005,"ALT-ENTRY-VOLUME-NEXT-OPEN":577,"ALT-INTRABAR-OPTIMISTIC":929,"ALT-EXIT-STOP-BE3R":514,"ALT-EXIT-FREEROLL-2R":759,"ALT-EXIT-FREEROLL-3R":680,"ALT-RISK-0075":1143,"ALT-RISK-025":787}},"publicVariantBlocksIdenticalToRun":"39746264325","sf7Execution":{"variantsSha256":"496cad56c7eb71a3eef3e675679ecfbe02896f0997e464eab52b8139c0928b04","variants":{"SEPA":{"SF7-REF-CLOSE-RULE":{"compareTo":"REF","trades":954,"ledgerSha256":"5e2f5e296698ec371128eab563ee3b7de989fbb078bf3deab8f2bf2a06d87e67","tradesSha256":"3bfd54453f5a90afe21c404c24c113f33b480d41f34571f0b737f92ef1578bbb","reconciliation":true,"comparison":{"ledgerWithoutReasonsEqual":true,"ledgerRowsWithChangedReason":5,"tradesDelta":0,"sameBarStopCertainDelta":5,"sameBarStopAmbiguousDelta":-5}},"SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE":{"compareTo":"ALT-INTRABAR-OPTIMISTIC","trades":977,"ledgerSha256":"817c27a3843b37514025392bcd267513c5a42d146d1c5ef58118b7a34a4651e6","tradesSha256":"4e8ec48209181fe65708fdabf05e081e17a7f500677abfdcdf2a6259f983a0d5","reconciliation":true,"comparison":{"ledgerWithoutReasonsEqual":false,"ledgerRowsWithChangedReason":null,"tradesDelta":-10,"sameBarStopCertainDelta":8,"sameBarStopAmbiguousDelta":-8}}},"POWER_PLAY":{"SF7-REF-CLOSE-RULE":{"compareTo":"REF","trades":1007,"ledgerSha256":"4052522bdb3d9f9d1a6332ec59f899a2c3636e3798d651176b197451077bf5c2","tradesSha256":"18c3078912e7ed1fbef10b2b5c98c05750439f41761d7c9d1ad3897889f7538e","reconciliation":true,"comparison":{"ledgerWithoutReasonsEqual":true,"ledgerRowsWithChangedReason":19,"tradesDelta":0,"sameBarStopCertainDelta":19,"sameBarStopAmbiguousDelta":-19}},"SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE":{"compareTo":"ALT-INTRABAR-OPTIMISTIC","trades":931,"ledgerSha256":"38ba7d02784d3d30a6fe7fba25d778ea9c6966bda8a412d8598609b290790d7c","tradesSha256":"8be245555ab1f2255b633afa4e9317502607deeb2108ccd3b48504c80804d58d","reconciliation":true,"comparison":{"ledgerWithoutReasonsEqual":false,"ledgerRowsWithChangedReason":1023,"tradesDelta":2,"sameBarStopCertainDelta":22,"sameBarStopAmbiguousDelta":-23}}}}},"metrics":"SEALED (claude/supertrader-validation-results)"}),
  Object.freeze({ runId: '39746264325', commit: '77964daa9c94de1ee480b20bd299293098ffbcce', role: 'SUPERSEDED_BY_40170832007_SAME_REFERENCES', strategies: ['SEPA', 'POWER_PLAY'], snapshotId: 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', datasetVerified: 'EXACT', datasetSha256: '3ea6443de70c790c2927ceb65653077fbd2095e83d03389d9a450bc47df8d454', researchCodeSha256: 'b1d81fb8b67a167284868f2fcc473d66f1a78a43c7f544789ffca232a18da13c', engineCodeSha256: 'ae2a51ed86ae4d3ca10fcf263e1eb266437bbed851943e14dc1a984a3fd797a0', variantRegistrySha256: 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75', allVariantsReconciled: true, referenceDeterministic: true, referenceTrades: {"SEPA": {"trades": 954, "closed": 937, "openAtDataEnd": 17}, "POWER_PLAY": {"trades": 1007, "closed": 998, "openAtDataEnd": 9}}, tradesByVariant: {"SEPA": {"REF": 954, "ALT-SETUP-TT-PIVOT": 1160, "ALT-STOP-MAXLOSS10": 632, "ALT-ORDER-STOP-MARKET": 988, "ALT-ENTRY-VOLUME-NEXT-OPEN": 738, "ALT-INTRABAR-OPTIMISTIC": 987, "ALT-EXIT-STOP-BE3R": 364, "ALT-EXIT-FREEROLL-2R": 391, "ALT-EXIT-FREEROLL-3R": 428, "ALT-RISK-0075": 1114, "ALT-RISK-025": 861}, "POWER_PLAY": {"REF": 1007, "ALT-STOP-MAXLOSS10": 833, "ALT-ORDER-STOP-MARKET": 1005, "ALT-ENTRY-VOLUME-NEXT-OPEN": 577, "ALT-INTRABAR-OPTIMISTIC": 929, "ALT-EXIT-STOP-BE3R": 514, "ALT-EXIT-FREEROLL-2R": 759, "ALT-EXIT-FREEROLL-3R": 680, "ALT-RISK-0075": 1143, "ALT-RISK-025": 787}}, ledgersIdenticalToRun: '39729913772', ppMissingLowFix: { dailyBars: 13378246, dailyChanged: 0, monthEndBars: 639582, monthEndChanged: 0 }, metrics: 'SEALED (claude/supertrader-validation-results)' }),
  Object.freeze({ runId: '39729913772', commit: 'aad9066494d0f73683e22680e01c556ffef919d4', role: 'PRE_FIX_REFERENCE_SF_MINERVINI_1_0_0', strategies: ['SEPA', 'POWER_PLAY'], snapshotId: 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', datasetVerified: 'EXACT', datasetSha256: '3ea6443de70c790c2927ceb65653077fbd2095e83d03389d9a450bc47df8d454', researchCodeSha256: '16dbc24215fd1740b8f4598c25f806fa3fe5a9c1766ab31ff5ad368712cf87a8', engineCodeSha256: 'ae2a51ed86ae4d3ca10fcf263e1eb266437bbed851943e14dc1a984a3fd797a0', variantRegistrySha256: 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75', allVariantsReconciled: true, referenceDeterministic: true, referenceTrades: {"SEPA": {"trades": 954, "closed": 937, "openAtDataEnd": 17}, "POWER_PLAY": {"trades": 1007, "closed": 998, "openAtDataEnd": 9}}, tradesByVariant: {"SEPA": {"REF": 954, "ALT-SETUP-TT-PIVOT": 1160, "ALT-STOP-MAXLOSS10": 632, "ALT-ORDER-STOP-MARKET": 988, "ALT-ENTRY-VOLUME-NEXT-OPEN": 738, "ALT-INTRABAR-OPTIMISTIC": 987, "ALT-EXIT-STOP-BE3R": 364, "ALT-EXIT-FREEROLL-2R": 391, "ALT-EXIT-FREEROLL-3R": 428, "ALT-RISK-0075": 1114, "ALT-RISK-025": 861}, "POWER_PLAY": {"REF": 1007, "ALT-STOP-MAXLOSS10": 833, "ALT-ORDER-STOP-MARKET": 1005, "ALT-ENTRY-VOLUME-NEXT-OPEN": 577, "ALT-INTRABAR-OPTIMISTIC": 929, "ALT-EXIT-STOP-BE3R": 514, "ALT-EXIT-FREEROLL-2R": 759, "ALT-EXIT-FREEROLL-3R": 680, "ALT-RISK-0075": 1143, "ALT-RISK-025": 787}}, metrics: 'SEALED (claude/supertrader-validation-results)' }),
]);

function readinessOf(strategy, rows, contract) {
  const count = (pred) => rows.filter(pred).length;
  const byClass = Object.fromEntries(Object.values(CLASS).map((c) => [c, count((r) => r.class === c)]));
  const phases = Object.fromEntries(LIFECYCLE_PHASES.map((ph) => {
    const rs = rows.filter((r) => r.phase === ph);
    return [ph, { rows: rs.length, mechanical: rs.filter((r) => r.readiness === ROW_READINESS.MECHANICAL).length, underModelAssumption: rs.filter((r) => r.readiness === ROW_READINESS.MODEL).length, evidence: rs.filter((r) => r.readiness === ROW_READINESS.EVIDENCE).length, manual: rs.filter((r) => r.readiness === ROW_READINESS.MANUAL).length, blocked: rs.filter((r) => r.readiness === ROW_READINESS.BLOCKED).length }];
  }));
  // STRATEGY_READINESS is an assessment, not a trading phase: executability is measured over the nine operational phases
  const operational = LIFECYCLE_PHASES.filter((ph) => ph !== 'STRATEGY_READINESS');
  const executablePhases = operational.filter((ph) => phases[ph].mechanical + phases[ph].underModelAssumption > 0);
  const manualRows = rows.filter((r) => r.class === CLASS.MANUAL_REVIEW);
  const runs = SNAPSHOT_RUNS.filter((r) => r.strategies?.includes(strategy));
  return {
    sourceFidelity: { byClass, sourceExact: byClass.SOURCE_EXACT, translationOnlySource: contract.rules.some((r) => r.translationUnverified), contractVersion: contract.sourceContractVersion, contractRuleStatuses: contract.rules.reduce((o, r) => { o[r.status] = (o[r.status] || 0) + 1; return o; }, {}), statement: 'no Minervini rule is SOURCE_EXACT (#709: MEDIUM confidence, wording only via translation); printed numbers are used as bounds' },
    mechanicalCompleteness: { phases, executablePhases: executablePhases.length, operationalPhases: operational.length, lifecycle: executablePhases.length === operational.length ? 'MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS' : 'INCOMPLETE_LIFECYCLE', modelAssumptionsUsed: [...new Set(rows.flatMap((r) => r.modelAssumptions))].sort() },
    dataCoverage: { blocked: rows.filter((r) => r.class === CLASS.DATA_BLOCKED).map((r) => ({ row: r.id, data: r.data })), proxiesNotUnblocking: rows.filter((r) => r.class === CLASS.DATA_BLOCKED && r.implemented).map((r) => `${r.id} <- ${r.implemented.code}`), knownDataFindings: ['V4-D1 undeclared reverse splits (open, Quant PR)'] },
    backtestReadiness: { measurement: 'MODEL_LIFECYCLE_STUDY', strategyBacktest: false, why: `${manualRows.length} manual source decisions; those needed for an entry are substituted by MA-MIN-MANUAL-SUBSTITUTE, so a complete lifecycle run is a model study, never a strategy backtest`, snapshotRuns: runs, certification: FOUNDATION.certification },
    manualReview: { rows: manualRows.map((r) => r.id), substitutedInSimulation: rows.filter((r) => r.modelAssumptions.includes('MA-MIN-MANUAL-SUBSTITUTE') && r.class === CLASS.MANUAL_REVIEW).map((r) => r.id), required: true },
    liveReadiness: { status: 'LIVE_NOT_APPROVED', tradability: 'NOT_A_TRADABLE_STRATEGY', performanceClaim: 'NONE', liveActivation: false, orders: false, brokerConnection: false },
  };
}

export async function buildLifecycleArtifact() {
  const extract = JSON.parse(fs.readFileSync(path.join(SF, 'evidence', 'PSR709-EVIDENCE-EXTRACT.json'), 'utf8'));
  const validation = await validateLifecycleMatrix(MATRIX, extract, CONTRACTS);
  const R = new Map(extract.rules.map((r) => [r.rule_id, r]));
  const withSources = (rows) => rows.map((r) => ({ ...r, sources: [...new Set(r.psr709.map((p) => { const s = R.get(p); return s ? `${s.source_id} ${s.page_location} (${s.modal_strength}, ${s.confidence})` : null; }).filter(Boolean))] }));
  return {
    schema: LIFECYCLE_ARTIFACT_SCHEMA, matrixVersion: MATRIX_VERSION, lifecycleVersion: LIFECYCLE_VERSION, snapshot: FOUNDATION.snapshotId, accounting: FOUNDATION.accounting.mode,
    principles: ['a mechanically confirmed setup is not an executable trade', 'a model assumption is not a source rule', 'a lifecycle run with substituted manual decisions is a model study, not a strategy backtest', 'the original strategy and the platform research portfolio policy stay separate', 'no live activation, no orders, no broker'],
    validation,
    modelAssumptions: MODEL_ASSUMPTIONS, referenceConfig: REFERENCE_CONFIG, runVariants: RUN_VARIANTS.map((v) => ({ id: v.id, strategies: v.strategies ?? ['SEPA', 'POWER_PLAY'], changes: v.changes, ...(SF7_MINERVINI_SUPERSEDED[v.id] ? { status: SF7_MINERVINI_SUPERSEDED[v.id].status, supersededBy: SF7_MINERVINI_SUPERSEDED[v.id].supersededBy } : {}) })),
    sf7ExecutionVariants: { version: SF7_MINERVINI_VERSION, variantsSha256: sf7MinerviniVariantsSha256(), revisions: SF7_MINERVINI_REVISIONS, variants: SF7_MINERVINI_VARIANTS.map((v) => ({ id: v.id, compareTo: v.compareTo, revision: v.revision, strategies: v.strategies ?? ['SEPA', 'POWER_PLAY'], supersedes: v.supersedes ?? null })) },
    portfolioPolicy: EQUITY_RESEARCH_PORTFOLIO_POLICY,
    strategies: Object.fromEntries(Object.entries(MATRIX).map(([s, rows]) => [s, { strategyId: CONTRACTS[s].strategyId, candidateId: CONTRACTS[s].candidateId, matrix: withSources(rows), readiness: readinessOf(s, rows, CONTRACTS[s]) }])),
  };
}

const esc = (x) => String(x ?? '–').replace(/\|/g, '\\|');
export function lifecycleMarkdown(a) {
  let md = '# Supertrader 4.0 – Minervini Source-to-Execution-Matrix\n\n';
  md += 'Generiert mit `node scripts/supertrader/source-faithful/completion/build-minervini-lifecycle.mjs` aus `research/minervini-lifecycle-matrix.mjs`, den Verträgen und dem #709-Extrakt. Nicht von Hand bearbeiten. Bericht: [SUPERTRADER_4_MINERVINI_TRADE_LIFECYCLE_REPORT.md](SUPERTRADER_4_MINERVINI_TRADE_LIFECYCLE_REPORT.md).\n\n';
  md += `Validierung: ${a.validation.ok ? 'bestanden' : 'FEHLER ' + a.validation.errors.join(', ')}. Klassen: SOURCE_EXACT, SOURCE_BOUNDED, MODEL_ASSUMPTION, MANUAL_REVIEW, DATA_BLOCKED, SOURCE_BLOCKED. Verbindlicher Registry-Status bleibt der Regelstatus des Vertrags.\n\n`;
  md += 'Grundsätze: ' + a.principles.join('; ') + '.\n\n';
  for (const [s, v] of Object.entries(a.strategies)) {
    const rd = v.readiness;
    md += `## ${v.candidateId} \`${v.strategyId}\`\n\n`;
    md += `- Source Fidelity: ${Object.entries(rd.sourceFidelity.byClass).map(([k, n]) => `${k} ${n}`).join(', ')}; Vertrag ${rd.sourceFidelity.contractVersion} (${Object.entries(rd.sourceFidelity.contractRuleStatuses).map(([k, n]) => `${k} ${n}`).join(', ')})\n`;
    md += `- Mechanik: ${rd.mechanicalCompleteness.lifecycle} (${rd.mechanicalCompleteness.executablePhases}/${rd.mechanicalCompleteness.operationalPhases} operative Phasen ausführbar)\n`;
    md += `- Daten: blockiert ${rd.dataCoverage.blocked.map((b) => b.row).join(', ') || '–'}\n`;
    md += `- Backtest: ${rd.backtestReadiness.measurement} (Strategie-Backtest: nein), ${rd.backtestReadiness.certification}\n`;
    md += `- Manuell: ${rd.manualReview.rows.length} Zeilen; in der Simulation ersetzt: ${rd.manualReview.substitutedInSimulation.join(', ')}\n`;
    md += `- Live: ${rd.liveReadiness.status}, ${rd.liveReadiness.tradability}, performanceClaim ${rd.liveReadiness.performanceClaim}\n\n`;
    md += '| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
    for (const r of v.matrix) md += `| ${r.phase} | ${r.id} | ${esc(r.condition)} | ${esc(r.psr709.join(', '))}${r.sources.length ? ' (' + esc(r.sources.join('; ')) + ')' : ''} | ${esc(r.contractRules.join(', '))} | ${r.class} | ${esc(r.modelAssumptions.join(', '))} | ${r.implemented ? '`' + r.implemented.code + '`' : '–'} | ${r.implemented ? r.implemented.tests.length : 0} | ${r.readiness} | ${esc([r.missing, r.note].filter(Boolean).join(' / '))} |\n`;
    md += '\n';
  }
  md += '## Modellannahmen\n\n| ID | Phase | Referenz | Alternativen | Begründung |\n|---|---|---|---|---|\n';
  for (const m of a.modelAssumptions) md += `| ${m.id} | ${m.phase} | ${esc(m.reference)} | ${esc(m.alternatives.join(', '))} | ${esc(m.why)} |\n`;
  md += '\n## Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)\n\n| ID | Strategien | Änderung gegenüber REF |\n|---|---|---|\n';
  for (const v of a.runVariants) md += `| ${v.id}${v.status ? ` (${v.status}, ersetzt durch ${v.supersededBy})` : ''} | ${v.strategies.join(', ')} | ${esc(JSON.stringify(v.changes))} |\n`;
  md += `\n## Supertrader-7.0-Ausführungsvarianten (${a.sf7ExecutionVariants.version}, Register \`${a.sf7ExecutionVariants.variantsSha256.slice(0, 12)}…\`)\n\nRevision ${a.sf7ExecutionVariants.revisions.map((r) => `${r.id} (${r.defect})`).join(', ')}: Pivot-Berührung mit Schluss am oder unter dem Stop ist ein sicherer Stop am selben Balken. Bericht: [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md).\n\n| ID | Vergleich mit | Strategien | ersetzt |\n|---|---|---|---|\n`;
  for (const v of a.sf7ExecutionVariants.variants) md += `| ${v.id} | ${v.compareTo} | ${v.strategies.join(', ')} | ${v.supersedes ?? '–'} |\n`;
  return md;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? path.resolve(a[i + 1]) : d; };
  const out = opt('--out', path.join(SF, 'artifacts')), docs = opt('--docs', path.join(ROOT, 'docs'));
  const art = await buildLifecycleArtifact();
  if (!art.validation.ok) { process.stderr.write(`minervini lifecycle: validation failed, nothing written: ${art.validation.errors.join(', ')}\n`); process.exit(1); } // review SF4-C-L7
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(out, 'STRATEGY-MINERVINI-LIFECYCLE.json'), JSON.stringify(art, null, 1) + '\n');
  fs.writeFileSync(path.join(docs, 'SUPERTRADER_4_MINERVINI_LIFECYCLE_MATRIX.md'), lifecycleMarkdown(art));
  process.stdout.write(`minervini lifecycle: validation ${art.validation.ok ? 'ok' : art.validation.errors.join(', ')}; rows SEPA ${art.strategies.SEPA.matrix.length}, POWER_PLAY ${art.strategies.POWER_PLAY.matrix.length}\n`);
}
