#!/usr/bin/env node
/**
 * Generates the Supertrader 2.0 documents that are pure views of the completion artifacts (deterministic; tests compare):
 *   docs/SUPERTRADER_2_STRATEGY_COMPLETION_MATRIX.md   13 candidates x 15 dimensions, gap classes, status dimensions
 *   docs/SUPERTRADER_2_DATA_GAPS.md                    data needs, repository inventory, procurement contracts
 *   docs/SUPERTRADER_2_BACKTEST_READINESS.md           the eight measurement questions per candidate, reference runs
 * The narrative owner report (docs/SUPERTRADER_2_COMPLETE_TRADING_SYSTEMS_REPORT.md) is written by hand.
 *
 *   node scripts/supertrader/source-faithful/completion/build-completion-docs.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_DIR } from './build-completion.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DOCS_DIR = path.resolve(HERE, '..', '..', '..', '..', 'docs');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, f), 'utf8'));
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const HEAD = (title) => `# ${title}\n\nGeneriert aus \`scripts/supertrader/source-faithful/artifacts/\` mit \`node scripts/supertrader/source-faithful/completion/build-completion-docs.mjs\`. Nicht von Hand bearbeiten. Alle historischen Aussagen \`DIAGNOSTIC_NOT_CERTIFIED\`; keine Methode ist live oder handelbar. Bericht: [SUPERTRADER_2_COMPLETE_TRADING_SYSTEMS_REPORT.md](SUPERTRADER_2_COMPLETE_TRADING_SYSTEMS_REPORT.md).\n\n`;
const SHORT = { COMPLETE: 'ok', COMPLETE_WITH_DECLARED_LIMITS: 'ok*', PARTIAL: 'PARTIAL', NOT_APPLICABLE: 'n/a' };
const CLS = { IMPLEMENTATION_GAP: 'IMPL', DATA_GAP: 'DATA', SOURCE_GAP: 'SOURCE', MANUAL_DECISION: 'MANUAL', MEASUREMENT_GAP: 'MEAS', PRODUCT_GAP: 'PRODUCT' };

export function matrixDoc() {
  const g = read('STRATEGY-COMPLETION-GAPS.json'), s = read('STRATEGY-COMPLETION-STATUS.json');
  let md = HEAD('Supertrader 2.0 – Strategy Completion Matrix');
  md += '## Status je Kandidat (getrennte Dimensionen)\n\n| Kandidat | Strategie | Engine | Flags | Backtest | Live | blockierende Daten | quellenoffen | manuelle Entscheidungen |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const c of s.candidates) md += `| ${c.candidateId} | \`${c.strategyId}\` | **${c.engine}** | ${c.flags.join(', ')} | ${c.backtestReadiness} | ${c.liveReadiness} | ${c.blockingDataRules.join(', ') || '–'} | ${c.blockingSourceRules.join(', ') || '–'} | ${c.manualDecisions.length} |\n`;
  md += '\nEngine-Zustände: `RESEARCH_ENGINE_COMPLETE` nur mit bestandenem Acceptance Gate (Abschnitt 6 des Auftrags); `RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION` = Gate bestanden, aber eine wesentliche Regel ist datenblockiert (Mechanik umgesetzt und getestet, in keinem Lauf durchgesetzt); `MECHANICAL_SCREEN_COMPLETE` = jede maschinell entscheidbare, belegte Regel ist umgesetzt und getestet, der Rest ist laut Quelle manuell, datenblockiert oder quellenoffen (ein datenblockierter Filter erscheint als offene Review-Frage und in der Spalte „blockierende Daten“); `MECHANICAL_COMPONENTS_ONLY` = der wesentliche Einstieg ist datenblockiert, nur Komponenten laufen; `INCOMPLETE` = eine Implementierungslücke ist offen oder das Gate nicht bestanden.\n\n';
  if (s.acceptanceGates.length) {
    md += '## Turtle Acceptance Gate\n\n| Strategie | Prüfung | Ergebnis | Detail |\n|---|---|---|---|\n';
    for (const a of s.acceptanceGates) for (const c of a.checks) md += `| \`${a.strategyId}\` | ${c.id}: ${esc(c.title)} | ${c.pass ? 'PASS' : '**FAIL**'} | ${esc(Array.isArray(c.detail) ? c.detail.join('; ') : c.detail)} |\n`;
    md += '\n';
  }
  md += `## Matrix: 15 Dimensionen\n\nok = vollständig; ok* = vollständig mit deklarierten Grenzen (nicht wesentliche Regel, nur Futures-Original, oder Mechanik umgesetzt mit Daten-/Quellenausnahme); PARTIAL = eine wesentliche Lücke im deklarierten Umfang; n/a = die Quelle gibt der Methode keine Regel dieser Art. Lückenklassen: ${Object.entries(CLS).map(([k, v]) => `${v} = ${k}`).join(', ')}.\n\n`;
  const dims = g.dimensions;
  md += `| Kandidat | ${dims.map((d) => d.id.slice(0, 3)).join(' | ')} |\n|---|${dims.map(() => '---').join('|')}|\n`;
  for (const c of g.candidates) md += `| ${c.candidateId} | ${c.dimensions.map((d) => `${SHORT[d.status]}${d.gaps.length ? ` (${[...new Set(d.gaps.map((x) => CLS[x.class]))].join('/')})` : ''}`).join(' | ')} |\n`;
  md += `\n${dims.map((d) => `${d.id.slice(0, 3)} = ${d.title}`).join('; ')}.\n\nVorkommen je Dimension über alle Kandidaten (eine Regel kann in mehreren Dimensionen erscheinen, z. B. eine datenblockierte Regel in ihrer Dimension und in D09): ${Object.entries(g.totals).map(([k, v]) => `${k} ${v}`).join(', ')}. Offene Implementierungslücken: **${g.openImplementationGaps.length}**.\n\n`;
  for (const c of g.candidates) {
    md += `## ${c.candidateId} \`${c.strategyId}\` (Umfang: ${c.declaredScope})\n\n| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |\n|---|---|---|---|---|---|---|---|\n`;
    for (const d of c.dimensions) {
      if (!d.gaps.length) { md += `| ${d.title} | ${d.status} | – | – | – | – | – | ${esc(typeof d.note === 'string' ? d.note : '')} |\n`; continue; }
      for (const x of d.gaps) md += `| ${d.title} | ${d.status} | ${x.class} | ${esc(x.ruleId ?? '–')} | ${x.essential ? 'ja' : 'nein'} | ${x.scope} | ${x.mechanicsImplemented ? 'umgesetzt' : '–'} | ${esc(x.detail)} |\n`;
    }
    md += '\n';
  }
  return md;
}

export function dataGapsDoc() {
  const d = read('STRATEGY-DATA-DEPENDENCIES.json');
  let md = HEAD('Supertrader 2.0 – Data Gaps');
  md += `Regel: ${esc(d.rule)}.\n\nKein neuer Anbieter wurde abonniert, keine Massenabfrage ausgeführt, kein neues Datenqualitäts- oder Corporate-Action-Programm gestartet.\n\n## Datenkatalog\n\n| Bedarf | genutzt von | im Repository | PIT | Priorität | Empfehlung | Implementierungsvertrag | Owner-Entscheidung |\n|---|---|---|---|---|---|---|---|\n`;
  for (const c of d.catalogue) md += `| ${c.need} | ${esc(c.usedBy.join('; '))} | ${esc(c.inRepository)} | ${c.pointInTime} | ${c.priority} | ${esc(c.recommendation)} | ${esc(c.implementationContract)} | ${esc(c.ownerDecision)} |\n`;
  md += '\nPriorität: 1 = im Repository vorhanden, 2 = lizenzierter Anbieter, 3 = öffentliche, rechtmäßig nutzbare Quelle, 4 = externe Daten mit Owner-Entscheidung.\n\n## Belege\n\n';
  for (const c of d.catalogue) {
    md += `- **${c.need}:** ${esc(c.evidence)}\n`;
    if (c.availabilityCheck) { md += `  - Verfügbarkeitsprüfung ${c.availabilityCheck.date} (${esc(c.availabilityCheck.requests)}):\n`; for (const f of c.availabilityCheck.findings) md += `    - ${esc(f)}\n`; for (const l of c.availabilityCheck.limits) md += `    - Grenze: ${esc(l)}\n`; }
  }
  md += '\n## Je Methode\n\n| Strategie | benötigte Daten | datenblockierte Regeln | teilweise Daten | Katalogbedarf |\n|---|---|---|---|---|\n';
  for (const m of d.methods) md += `| \`${m.strategyId}\` | ${esc(m.requiredData.join('; '))} | ${esc(m.blockedRules.map((r) => `${r.ruleId}${r.scopes ? ` [${r.scopes.join('/')}]` : ''}${r.mechanicsImplemented ? ' (Mechanik umgesetzt)' : ''}`).join('; ') || '–')} | ${esc(m.dataPartial.join('; ') || '–')} | ${esc(m.needs.join('; ') || '–')} |\n`;
  md += '\n## Bekannte Messbefunde (kein neuer Audit)\n\n';
  for (const f of d.measurementFindings) md += `- **${f.id}** (${f.class}): ${esc(f.detail)}\n`;
  return md;
}

export function backtestDoc() {
  const b = read('STRATEGY-BACKTEST-READINESS.json'), x = read('STRATEGY-EXECUTION-RESULTS.json');
  let md = HEAD('Supertrader 2.0 – Backtest Readiness');
  md += `Regel: ${esc(b.rule)}.\n\nBindung: Snapshot \`${x.binding.snapshotId}\`, \`${x.binding.accounting}\`.\n\n| Strategie | ${b.questions.join(' | ')} | erlaubt | deklarierte Grenzen |\n|---|${b.questions.map(() => '---').join('|')}|---|---|\n`;
  for (const m of b.methods) md += `| \`${m.strategyId}\` | ${b.questions.map((q) => (m.answers[q] ? 'ja' : '**nein**')).join(' | ')} | **${m.allowed}** | ${esc(m.declaredLimits.join(', ') || '–')} |\n`;
  md += '\nBekannte Befunde, die jede historische Zahl erbt: V4-D1 (nicht deklarierte Reverse-Splits), V4-D2 (Aktiengattungen). Sie verhindern eine Zertifizierung, keine diagnostische Messung.\n\n## Snapshot-Läufe (nur öffentliche Belege)\n\n| Methode | Art | Lauf | Datum | Engine | Beleg | Ergebnisse | Abstimmung | Rolle |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const r of x.referenceRuns) md += `| \`${r.method}\` | ${r.kind} | ${r.runId} | ${r.date} | ${r.codeVersion} | \`${r.receiptSha256Prefix}\` | ${r.trades ? Object.entries(r.trades).map(([k, v]) => `${k} ${v}`).join(', ') : `${r.signals} Signale`} | ${r.allScenariosReconciled === undefined ? '–' : r.allScenariosReconciled ? 'PASS' : 'FAIL'} | ${r.role} |\n`;
  md += '\nKennzahlen (Rendite, Drawdown usw.) liegen nur versiegelt beim Owner. Eine Komponentenstudie ist nie eine Methodenrendite.\n\n## Modellannahmen (keine Quellenregeln)\n\nWas die Quelle nicht entscheidet oder Tagesbalken nicht zeigen. Jede Annahme hat eine Referenzlesart; die Gegenlesart läuft als eigenes Szenario. Keine Lesart wird nach Ergebnis gewählt.\n\n| Annahme | Art | offene Frage | warum nicht entschieden | Referenz | Gegenlesart (Szenario) | auflösbar mit |\n|---|---|---|---|---|---|---|\n';
  const seen = new Set();
  for (const m of x.methods) for (const a of m.modelAssumptions || []) if (a && !seen.has(a.id)) { seen.add(a.id); md += `| ${a.id} | ${a.kind} | ${esc(a.question)} | ${esc(a.source)} | ${esc(`${a.reference.option}: ${a.reference.meaning}`)} | ${a.alternative ? esc(`${a.alternative.option}: ${a.alternative.meaning} (${a.alternative.scenario})`) : 'keine (feste, deklarierte Konvention)'} | ${esc(a.resolvableWith)} |\n`; }
  md += '\n## Ausführungskonventionen\n\n';
  for (const m of x.methods) md += `- \`${m.strategyId}\` (${m.executionReadiness}): Signal ${esc(m.timing.signal)}; frühestens ausführbar ${esc(m.timing.earliestExecutable)}${m.conventions.length ? `; Konventionen: ${esc(m.conventions.join('; '))}` : ''}\n`;
  return md;
}

export function buildCompletionDocs(outDir = DOCS_DIR) {
  const files = { 'SUPERTRADER_2_STRATEGY_COMPLETION_MATRIX.md': matrixDoc(), 'SUPERTRADER_2_DATA_GAPS.md': dataGapsDoc(), 'SUPERTRADER_2_BACKTEST_READINESS.md': backtestDoc() };
  fs.mkdirSync(outDir, { recursive: true });
  for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), v);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--out');
  const files = buildCompletionDocs(i >= 0 ? path.resolve(a[i + 1]) : DOCS_DIR);
  process.stdout.write(`written ${Object.keys(files).join(', ')}\n`);
}
