#!/usr/bin/env node
/**
 * Generates the machine-derived documentation from the source-faithful artifacts (deterministic; tests compare):
 *   docs/SUPERTRADER_STRATEGY_COVERAGE_MATRIX.md       every candidate: #709 rules in scope and their status
 *   docs/SUPERTRADER_SOURCE_TO_CODE_TRACEABILITY.md    Source -> Edition -> Rule -> Candidate -> Executable rule -> Code -> Test -> Status
 *   docs/SUPERTRADER_STRATEGY_BACKTEST_READINESS.md    readiness per candidate with blockers
 * The narrative implementation report (docs/SUPERTRADER_SOURCE_FAITHFUL_IMPLEMENTATION_REPORT.md) is written by hand.
 *
 *   node scripts/supertrader/source-faithful/build-docs.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_DIR } from './build-artifacts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DOCS_DIR = path.resolve(HERE, '..', '..', '..', 'docs');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, f), 'utf8'));
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const HEAD = (title) => `# ${title}\n\nGeneriert aus \`scripts/supertrader/source-faithful/artifacts/\` mit \`node scripts/supertrader/source-faithful/build-docs.mjs\`. Nicht von Hand bearbeiten. Quelle: Draft-PR #709 @ \`8b766fa\` (hash-geprüft). Alle Ergebnisse \`DIAGNOSTIC_NOT_CERTIFIED\`; keine Methode ist live oder handelbar.\n\n`;

export function coverageDoc() {
  const cov = read('STRATEGY-COVERAGE-MATRIX.json'), reg = read('STRATEGY-REGISTRY.json');
  let md = HEAD('Supertrader – Strategy Coverage Matrix (13 Kandidaten)');
  md += '| Kandidat | Strategie | Status | Regeln im Kontext | HARD umgesetzt | EXACT | DERIVED | MANUAL | DATA_BLOCKED | AMBIGUOUS | NOT_IMPL. | ausgeschlossen (begründet) | offen |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const m of cov.methods) {
    const e = reg.entries.find((x) => x.strategyId === m.strategyId), s = m.summary;
    md += `| ${m.candidateId} | \`${m.strategyId}\` | ${e.implementationStatus} | ${s.rulesInScope} | ${s.hardRulesImplemented}/${s.hardRules} | ${s.implementedExact} | ${s.implementedDerived} | ${s.manualReview} | ${s.dataBlocked} | ${s.ambiguous} | ${s.notImplemented} | ${s.unmappedWithExclusion} | ${s.unmappedWithoutExclusion} |\n`;
  }
  md += '\nHARD umgesetzt = #709-Regeln mit Modalität HARD, die eine ausführbare Regel mit Status SOURCE_EXACT oder SOURCE_DERIVED abdeckt. Eine HARD-Regel kann trotzdem manuell oder datenblockiert sein, wenn ihre Anwendung ein Urteil oder fehlende Daten verlangt (z. B. WEIN-GROUP, TUR-LIMIT6).\n\n';
  for (const m of cov.methods) {
    md += `## ${m.candidateId} \`${m.strategyId}\`\n\nKontexte: ${m.contexts.map((c) => `\`${c}\``).join(', ')}\n\n| #709-Regel | Kontext | Modalität | Confidence | Clearance | Status | Ausschlussgrund |\n|---|---|---|---|---|---|---|\n`;
    for (const r of m.rows) md += `| ${r.ruleId} | ${esc(r.method)} | ${r.modal} | ${r.confidence} | ${esc(r.clearance)} | ${r.status} | ${esc(r.exclusion)} |\n`;
    md += '\n';
  }
  return md;
}

export function traceabilityDoc() {
  const sc = read('STRATEGY-SOURCE-CONTRACTS.json'), gold = fs.existsSync(path.join(ARTIFACT_DIR, 'STRATEGY-GOLDEN-CASE-RESULTS.json')) ? read('STRATEGY-GOLDEN-CASE-RESULTS.json') : null;
  const res = new Map((gold?.cases ?? []).map((c) => [c.test, c.result]));
  let md = HEAD('Supertrader – Source-to-Code Traceability');
  md += `Kette: ${sc.chain}. Testresultate aus \`STRATEGY-GOLDEN-CASE-RESULTS.json\`.\n\n`;
  for (const c of sc.contracts) {
    md += `## ${c.candidateId} \`${c.strategyId}\` – ${esc(c.trader)}\n\n${esc(c.method)}\n\n| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |\n|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of c.chain) {
      const tests = (r.tests || []).map((t) => `${t.split(': ')[1]} (${res.get(t) ?? 'n/a'})`).join('<br>');
      md += `| ${r.source ?? '–'}${r.sourceBasis === 'SECONDARY_SOURCE' ? ` (Primärquelle schweigt; Sekundärquelle ${r.secondarySource}, ${r.ownerDecision})` : ''} | ${esc(r.bookEdition ?? '–')} | ${esc(r.page ?? '–')} | ${r.ruleId ?? '– (Konvention)'} | ${r.modal ?? '–'}/${r.confidence ?? '–'}/${r.originalWordingChecked === null ? '–' : r.originalWordingChecked ? 'ja' : 'nein'} | ${r.executableRule} | ${r.status} | ${r.code ? `\`${r.code.replace('scripts/supertrader/source-faithful/', '')}\`` : '–'} | ${tests || '–'} |\n`;
    }
    md += '\n';
  }
  return md;
}

export function readinessDoc() {
  const rd = read('STRATEGY-IMPLEMENTATION-READINESS.json');
  let md = HEAD('Supertrader – Strategy Backtest Readiness');
  md += `Bindung: Snapshot \`${rd.binding.snapshotId}\`, Abrechnung \`${rd.binding.accounting}\`, Zertifizierung \`${rd.binding.certification}\`.\n\n`;
  md += '| Kandidat | Strategie | Status | Daten | Ausführung | Backtest | vollautomatisierbar | Blocker produktive Freigabe |\n|---|---|---|---|---|---|---|---|\n';
  for (const m of rd.methods) md += `| ${m.candidateId} | \`${m.strategyId}\` | ${m.implementationStatus} | ${m.dataReadiness} | ${m.executionReadiness} | ${m.backtestReadiness} | ${m.fullyAutomatable ? 'ja' : 'nein'} | ${esc(m.productiveReleaseBlockers.join('; '))} |\n`;
  md += '\n## Was diagnostisch gemessen werden darf\n\n';
  for (const m of rd.methods) md += `- **${m.candidateId} ${m.strategyId}:** ${esc(m.measurementScope)}\n`;
  md += '\n## Gemeinsame Blocker\n\n' + rd.commonBlockers.map((b) => `- ${esc(b)}`).join('\n') + '\n';
  return md;
}

export function buildDocs(outDir = DOCS_DIR) {
  const files = { 'SUPERTRADER_STRATEGY_COVERAGE_MATRIX.md': coverageDoc(), 'SUPERTRADER_SOURCE_TO_CODE_TRACEABILITY.md': traceabilityDoc(), 'SUPERTRADER_STRATEGY_BACKTEST_READINESS.md': readinessDoc() };
  fs.mkdirSync(outDir, { recursive: true });
  for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), v);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--out');
  const files = buildDocs(i >= 0 ? path.resolve(a[i + 1]) : DOCS_DIR);
  process.stdout.write(`written ${Object.keys(files).join(', ')}\n`);
}
