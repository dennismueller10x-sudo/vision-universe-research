#!/usr/bin/env node
'use strict';
// Metadata inspection only. Does not run strategies or open holdout returns.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PROTOCOL_SHA256, sha, variants, verdict } = require('./study.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const SOURCE = 'dfa38ce2794b03267ef0c21b671e6ff50bffbf72';
function git(...args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 20e6 }); }
function inspect() {
  const protocol = fs.readFileSync(path.join(ROOT, 'docs/research/edge/PROTOKOLL.md'));
  if (sha(protocol) !== PROTOCOL_SHA256) throw Error('PROTOCOL_CHANGED');
  const benchmarks = ['SPY', 'RSP', 'IWM'].map(symbol => {
    const file = `vorsorge/data/series/${symbol}.json`;
    const bytes = git('show', `${SOURCE}:${file}`), d = JSON.parse(bytes);
    return { symbol, file, sha256: sha(bytes), asOf: d.asOf, totalReturnState: d.totalReturn?.state,
      dailyPresent: !!d.total?.daily, weeklyPresent: !!d.total?.weekly,
      status: d.symbol === symbol && d.asOf >= '2026-10-02' && d.totalReturn?.state === 'TOTAL_RETURN_RECONSTRUCTED' && d.total?.daily && d.total?.weekly ? 'METADATA_PRESENT_NOT_COVERAGE_VALIDATED' : 'BLOCKED' };
  });
  // Never read secret values or claim that a configured flag establishes working access.
  const credentialNames = ['V13_ARCHIVE_PRIVATE_KEY', 'VU_HISTORY_S3_ENDPOINT', 'VU_HISTORY_S3_ACCESS_KEY_ID', 'VU_HISTORY_S3_SECRET_ACCESS_KEY'];
  const credentials = credentialNames.map(name => ({ name, configured: !!process.env[name] }));
  const blockers = [
    { code: 'PRIVATE_INPUTS_NOT_RESTORED', detail: 'Keine hashverifizierten Tageshistorien inkl. V13-Delistings und originalen PIT-Bündeln lokal bereitgestellt. Kein automatischer Price-only-/Consumer-Fallback.' },
    { code: 'RESEARCH_ADAPTERS_NOT_IMPLEMENTED', detail: 'Kein geprüfter E3-Adapter für tägliche Filter-Ausführung, persistente Rebalancing-Uhr, gemeinsamen Kosten-/Terminal-Ledger und Top5-Sleeves. Unveränderte Supertrader-REF-Läufe allein erfüllen das Protokoll nicht.' },
    { code: 'BENCHMARK_COVERAGE_NOT_VALIDATED', detail: 'ETF-Metadaten vorhanden; gemeinsame Wochenstichtage, täglicher Filter-Warm-up und lückenlose Fenster müssen vor einem Strategielauf geprüft werden.' }
  ];
  return { schemaVersion: 'edge-preflight-1', label: 'Forschung, nicht zertifiziert', state: 'BLOCKED', sourceCommit: SOURCE,
    protocolCommit: 'e253393', protocolSha256: sha(protocol), variantCount: 96, hypothesisCount: 192,
    strategyRuns: 0, holdoutOpenedByE3: false, projectWideUntouchedHoldout: false, benchmarks, credentials, blockers,
    variants: variants().map(v => ({ ...v, state: 'BLOCKED', metrics: null, pLogHolm: null, pSharpeHolm: null, verdict: verdict(null), blockers: blockers.map(b => b.code) })) };
}
function render(d) {
  const lines = ['# E3 – Edge-Studie: Vorbereitungsbefund', '', '**Forschung, nicht zertifiziert. Status: BLOCKIERT – keine E3-Renditeergebnisse.**', '',
    `Basis: main \`${d.sourceCommit}\`. Protokoll vor jedem E3-Lauf im Commit \`${d.protocolCommit}\` eingefroren; SHA-256 \`${d.protocolSha256}\`.`, '',
    'Die Leitfrage ist derzeit nicht beantwortbar. Kein Strategie- oder Auswertungslauf wurde ausgeführt. Fehlende Evidenz wird nicht als Underperformance gewertet. Die drei gewünschten Ergebnisurteile dürfen erst nach einem gültigen Lauf vergeben werden.', '',
    '## Verfügbarkeit und Grenzen', '',
    ...d.blockers.map(b => `- **${b.code}:** ${b.detail}`), '',
    'Der Runtime-Status meldete keine konfigurierten Secrets oder Identitäten. Die folgende Prüfung meldet ausschließlich Variablen-Präsenz, keinen Inhalt und keinen erfolgreichen Archivzugriff:', '',
    ...d.credentials.map(c => `- ${c.name}: ${c.configured ? 'konfiguriert, Zugriff ungeprüft' : 'nicht konfiguriert'}`), '',
    '| Benchmark | Stand | Gesamtrendite | Prüfung |', '|---|---|---|---|',
    ...d.benchmarks.map(b => `| ${b.symbol} | ${b.asOf} | ${b.totalReturnState} | ${b.status} |`), '',
    '2026 ist ein Teiljahr bis 02.10. Frühere Studien haben 2020–2026 bereits verwendet. Die E3-Prüfung wäre eine Replikation mit eingefrorenen Regeln und zeitlich getrennter Auswahl, kein neuer projektweiter Holdout. Ein späterer Vorwärtstest bleibt erforderlich.', '',
    '## Vollständige Variantentabelle', '',
    '96 Varianten, 192 gemeinsam zu korrigierende Hypothesen. „—“ bedeutet nicht berechnet. Bei einem späteren gültigen Lauf sind zusätzlich die SPY/RSP/IWM-Kennzahlen, Kosten, Turnover und Delisting-Zählungen gemäß Protokoll auszugeben. Es gibt noch keine Entwicklungs-Auswahl.', '',
    '| Variante | Netto-TR | CAGR | Sharpe | Max. Verlust | Δ SPY/RSP/IWM | Holm p Rendite / Sharpe | Urteil |',
    '|---|---:|---:|---:|---:|---|---|---|',
    ...d.variants.map(v => `| ${v.id} | — | — | — | — | — / — / — | — / — | ${v.verdict} |`), '',
    '## Empfehlung für die Produktdarstellung', '',
    'Derzeit keine Methode als S&P-500-Sieger herausstellen. SPY-Gesamtrendite als passive Vergleichsbasis; vorhandene Strategien mit Kosten, Drawdown, Sharpe und Grenzen nebeneinander als „Forschung, nicht zertifiziert“. Für eine konkrete Methodenauswahl fehlt E3-Evidenz. Dieser PR ändert keine Produktdarstellung.', '',
    '## Konkrete Fortsetzung', '',
    '1. Bestehende R2-Archive nach dem vorhandenen Runbook hashverifiziert wiederherstellen; Tiingo-Tageshistorien und originale PIT-Bündel bereitstellen. Keine neuen Anbieter nötig.',
    '2. Forschungsadapter ausschließlich unter scripts/research/edge/ implementieren; Ledger-Parität für Gebühren/Spread/Slippage, Terminal-Cash, Filterverkauf/Wiedereinstieg und Sleeve-Kapital prüfen. Vorhandene Engines nur importieren.',
    '3. Datenabdeckung und Benchmarkkalender validieren. Dann 2012–2019 rechnen und Gewinner samt Eingabe-/Ergebnishashes unveränderlich festhalten; erst danach 2020–2026 öffnen. Alle 96 Varianten ausweisen, Holm über 192 Hypothesen.', '',
    'Die Statistikfunktionen in study.cjs sind mit synthetischen Daten getestet. Sie sind kein ausführbarer Strategieadapter und kein Ersatz für diese offenen Schritte. Wiederholung der Vorprüfung: siehe README.md.'];
  return lines.join('\n') + '\n';
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') throw Error('Usage: node scripts/research/edge/preflight.cjs --out DIRECTORY');
  const out = path.resolve(args[1]);
  if (out !== path.join(ROOT, 'docs/research/edge') && !out.startsWith(path.join(ROOT, 'docs/research/edge') + path.sep)) throw Error('OUTPUT_MUST_BE_IN_DOCS_RESEARCH_EDGE');
  const d = inspect(); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'preflight.json'), JSON.stringify(d, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'BERICHT.md'), render(d));
  console.log(JSON.stringify({ state: d.state, variants: d.variants.length, strategyRuns: 0 }));
  process.exitCode = 2; // Missing prerequisites are not a successful study.
}
module.exports = { inspect, render };
