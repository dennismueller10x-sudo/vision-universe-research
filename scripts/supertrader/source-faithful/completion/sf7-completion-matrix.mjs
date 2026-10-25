#!/usr/bin/env node
/**
 * Supertrader 7.0 – completion matrix of all 13 strategies (mandate section 11: twelve questions per method).
 * Machine part: primary state, measurement class, executable phases, certification criteria and live readiness are
 * read from artifacts/STRATEGY-SF6-READINESS.json (criteria 1.2.0, rebuilt by its builder with the 7.0 inputs); the
 * 7.0 text below may not contradict them (test SF7-COMPLETION-MATRIX: no criterion, state or readiness differs).
 * Text part: the 7.0 answers, each with its evidence (draft PR, run id, artifact or document). No grade is set here.
 * Output: artifacts/STRATEGY-SF7-COMPLETION.json and docs/SUPERTRADER_7_COMPLETION_MATRIX.md.
 *
 *   node scripts/supertrader/source-faithful/completion/sf7-completion-matrix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SF = path.resolve(HERE, '..'), ROOT = path.resolve(SF, '..', '..', '..');
export const SF7_COMPLETION_VERSION = 'sf7-completion-matrix-1.1.0'; // 1.1.0: SF7-D3 / SF7-D4 fixed as versioned variants (#911), #899 run 40172178386 (E7-2)

/** 7.0 draft PRs and authoritative runs (evidence keys). */
export const SF7_EVIDENCE = Object.freeze({
  PR899: 'Draft-PR #899 Minervini-Quelleninventur und E7-2-Klassifikation (Lauf 40172178386, sf7-minervini-1.3.0)',
  PR911: 'Draft-PR #911 SF7-D3 / SF7-D4 als versionierte Varianten, SF6-PAPER-2027 1.1.0 nicht aktiv (Läufe 40170829944 sf-research, 40170832007 sf4-lifecycle)',
  PR898: 'Draft-PR #898 Ausführung und Strategien (Läufe 40099831813 sf5, 40107434014 kk-intraday-cache)',
  PR902: 'Draft-PR #902 V4-D1-Auflösung (Regelsatz 1.3.0, Läufe 40110748496 sec-pit-r14, 40122736287 sf7-ca-resolution)',
  E76: 'docs/SUPERTRADER_7_EPPS_SAMPLE_E7_6.md: E7-6-Stichprobenerweiterung CLEAN_EXT_E7_6 (Läufe 40184926658 Plan, 40185337539 Abruf 481 Anfragen, 40185748527 kk-intraday-cache)',
  INV: 'docs/SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md',
  EXE: 'docs/SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md',
  CA: 'docs/SUPERTRADER_7_V4D1_RESOLUTION.md',
});

/** V4-D1 exposure after the 7.0 classification, rule set 1.3.0 (DQ-K5: exposed / confirmed genuine / unresolved), from PR902 run 40122736287. */
export const CA7 = Object.freeze({
  TURTLE_S1: [16, 0, 16, 41, 1, 40], TURTLE_S2: [14, 0, 14, 38, 0, 38], MINERVINI_SEPA: [0, 0, 0, 0, 0, 0], MINERVINI_POWER_PLAY: [12, 0, 12, 39, 0, 39], DARVAS: [15, 0, 15, 30, 0, 30], KK_BREAKOUT: [27, 0, 27, 95, 1, 94],
  POCKET_PIVOT: [9, 0, 9, 25, 0, 25], BUYABLE_GAP_UP: [14, 0, 14, 69, 1, 68], WEINSTEIN_INVESTOR: [0, 0, 0, 5, 1, 4], WEINSTEIN_TRADER: [4, 0, 4, 9, 0, 9], HOLY_GRAIL_W_RAS97: [29, 0, 29, 99, 0, 99],
});

/**
 * CC-5 sub-criteria (owner decision E7-1, 2026-10-25: check which parts are met for zero-exposure strategies; no
 * automatic upgrade). The test of CC-5 (criteria 1.2.0) is decomposed into its parts; CC-5 itself stays as the
 * readiness artifact derives it (false for every reference). Run 40122736287 (rule set 1.3.0, overlay empty).
 */
export const CC5_SUBCRITERIA = Object.freeze([
  Object.freeze({ id: 'CC5-a-K5-RESOLVED', test: 'every DQ-K5 session behind a reference trade verified (CONFIRMED_*)' }),
  Object.freeze({ id: 'CC5-b-K3-RESOLVED', test: 'every DQ-K3 session behind a reference trade verified (criteria 1.1.0: DQ-K3 reported as well)' }),
  Object.freeze({ id: 'CC5-c-DATA-PR', test: 'confirmed undeclared splits corrected in a versioned data PR (not required when none is confirmed)' }),
  Object.freeze({ id: 'CC5-d-RECOMPUTED', test: 'reference recomputed on the corrected data (CA run trade- and ledger-identical to BASE with the empty overlay)' }),
  Object.freeze({ id: 'CC5-e-DETECTION-COMPLETE', test: 'the detector can see every undeclared corporate action - NOT met by construction: undeclared splits with a jump below 3x (e.g. 2:1) are flagged by neither DQ-K5 nor DQ-K3' }),
  Object.freeze({ id: 'CC5-f-HOLDOUT', test: 'the same check on the second test window (HOLDOUT sts1-8595...) - not computed in 7.0' }),
]);
export function cc5Subcriteria(ca) {
  if (!ca) return null;
  const [, , k5u, , , k3u] = ca;
  return { 'CC5-a-K5-RESOLVED': k5u === 0, 'CC5-b-K3-RESOLVED': k3u === 0, 'CC5-c-DATA-PR': 'NOT_REQUIRED', 'CC5-d-RECOMPUTED': true, 'CC5-e-DETECTION-COMPLETE': false, 'CC5-f-HOLDOUT': false };
}

const S = (o) => Object.freeze(o);
/** The twelve answers per strategy (mandate 11). Short, evidence-backed; no performance statement. */
export const ANSWERS = Object.freeze({
  C01: S({ changed7: 'Unit-, Korrelationsgruppen- und Failsafe-Logik neu geprüft, kein Fehler in der Referenz; SF7-D3 (OPTIMISTIC-Alternative übersah einen sicheren Stop am Einstiegstag) als versionierte Lesart OPTIMISTIC_CERTAIN_RULE behoben (sf-turtle-1.3.0); Referenz und alte Lesarten hashgleich (Lauf 40170829944)', technical: '9/9 Phasen, vollständiger diagnostischer Backtest (Aktien-Adaption)', original: 'Original Turtle Rules (W-TUR, englisch); die Failsafe-Lesart ist im Original mehrdeutig, beide Lesarten laufen', assumptions: 'Aktien statt Futures, Units auf Eigenkapital, keine PIT-Korrelationsgruppen (SIC-Proxy nur Research, E4)', simulation: 'ja', backtest: 'ja, FULL_DIAGNOSTIC mit Datenausnahme', reliable: 'DEV-Snapshot 2016–2026 EXACT; Holdout survivorship-belastet', blocked: 'PIT-Korrelationsgruppen; V4-D1-Rest', execution: 'Tagesbalken, Stop intraday, pessimistische Reihenfolge am selben Tag', manual: 'keine', next: 'Quelle für PIT-Korrelationsgruppen (E7-5); V4-D1-Rest (E7-1)', evidence: ['PR898', 'PR902', 'PR911'] }),
  C02: S({ changed7: 'wie C01 (gemeinsame Engine): kein Fehler in der Referenz; SF7-D3 als versionierte Lesart behoben', technical: '9/9 Phasen, vollständiger diagnostischer Backtest', original: 'Original Turtle Rules (W-TUR, englisch)', assumptions: 'Aktien-Adaption, keine PIT-Korrelationsgruppen', simulation: 'ja', backtest: 'ja, FULL_DIAGNOSTIC mit Datenausnahme', reliable: 'DEV-Snapshot EXACT', blocked: 'PIT-Korrelationsgruppen; V4-D1-Rest', execution: 'Tagesbalken, pessimistisch', manual: 'keine', next: 'Quelle für PIT-Korrelationsgruppen (E7-5); V4-D1-Rest; SF6-PAPER-2027 1.1.0 (vorbereitet, nicht aktiv)', evidence: ['PR898', 'PR902', 'PR911'] }),
  C03: S({ changed7: 'SF7-D1: 8.596 von 17.002 angenommenen Stops am Einstiegstag sind sicher (Schluss am oder unter dem Stop); als Variante, Referenz unverändert', technical: '9/9 Phasen als Modellstudie', original: 'How I Made $2,000,000 (B06, englisch); Box-Konstruktion teils mehrdeutig', assumptions: 'Box-Beginn, Auswahl, Größe (8 manuelle Entscheidungen ersetzt)', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT', blocked: 'V4-D1-Rest', execution: 'Tagesbalken; die Referenz misst die pessimistische Intrabar-Annahme (Eigentümerentscheidung D-DARVAS-SIZE-INTRABAR)', manual: '8 essenzielle Entscheidungen', next: 'Eigentümerentscheidungen zu den manuellen Darvas-Regeln; V4-D1-Rest', evidence: ['PR898', 'PR902'] }),
  C04: S({ changed7: 'SF7-D1 gezählt (1 sicherer Ausstieg), nur Variante', technical: '9/9 Phasen als Modellstudie', original: 'Weinstein 1988 (B09, englisch)', assumptions: 'Stage-Urteil, Volumen, RS, Overhead Supply (14 manuelle Entscheidungen); SIC3-Gruppenstärke als Research-Proxy', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT', blocked: 'PIT-Branchen-Stage, NYSE-Breite', execution: 'Wochenschlüsse, tägliche Ausführung', manual: '14 essenzielle Entscheidungen', next: 'PIT-Branchenhistorie; Eigentümerentscheidung, ob V4-D1-Exposition 0 für CC-5 genügt', evidence: ['PR898', 'PR902'] }),
  C05: S({ changed7: 'SF7-D1 gezählt (4 sichere Ausstiege), nur Variante', technical: '9/9 Phasen als Modellstudie', original: 'Weinstein 1988 (B09, englisch)', assumptions: '12 manuelle Entscheidungen ersetzt', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT', blocked: 'PIT-Branchen-Stage, NYSE-Breite; V4-D1-Rest', execution: 'Wochenschlüsse, tägliche Ausführung', manual: '12 essenzielle Entscheidungen', next: 'PIT-Branchenhistorie; V4-D1-Rest', evidence: ['PR898', 'PR902'] }),
  C06: S({ changed7: 'Quelleninventur: 346 Befunde, englische W-MIN18-Zeilen im Vertrag, 3 quellengestützte Varianten (Flat Base, 25 %-Lesart, RS-Linie), Diagnosen (größter Rückgang, Halbgewinn-Stop, Nach-Ausbruch-Belege aus E7-2); 154 Befunde klassifiziert; REF ledger-identisch (Lauf 40172178386)', technical: '9/9 Phasen als Modellstudie (4.0-Engine unverändert)', original: 'Bücher vollständig im Projekt, nur Übersetzungen (B12 id, B07 id, B03 vi); englische Bestätigung nur über W-MIN18; Trend-Template-Zahlen in zwei Übersetzungen gleich', assumptions: '19 Lifecycle- und 6 sf7-Modellannahmen, jede klassifiziert (Inventur)', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT; PIT-EPS split-korrigiert, wo belegbar', blocked: 'IBD-RS-Historie, Schätzungen / Überraschungen / Guidance', execution: 'Buy-Stop-Limit am Pivot, pessimistisch; SF7-D4 (OPTIMISTIC-Alternative) als SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE behoben, alle 21 Varianten hashgleich (Lauf 40170832007)', manual: '11 essenzielle Entscheidungen (Priorität, Earnings-Qualität, VCP-Gültigkeit, RS)', next: 'Eigentümer: englische Ausgabe oder Entscheidung über Übersetzungsbelege (CC-1); CC-5-Teilkriterien (E7-1); Minervini-Ausstiegsvarianten (E7-7)', evidence: ['PR899', 'INV', 'PR898', 'PR902', 'PR911'] }),
  C07: S({ changed7: 'VCP-Differenz B12 / B03 zugunsten der Referenz aufgelöst; Korrekturspanne präzisiert (20 %, niedrigpreisig etwa 25 %); REF ledger-identisch', technical: '9/9 Phasen als Modellstudie', original: 'Bücher nur als Übersetzung; englische Bestätigung für Stop und Größe (W-MIN18)', assumptions: 'Pivot, Urteil zum Startvolumen, Schwelle „niedrigpreisig“', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT', blocked: 'V4-D1-Rest', execution: 'wie SEPA; SF7-D4 behoben (versionierte Variante)', manual: '6 essenzielle Entscheidungen', next: 'CC-1-Entscheidung wie SEPA; V4-D1-Rest', evidence: ['PR899', 'INV', 'PR902', 'PR911'] }),
  C08: S({ changed7: 'neu geprüft (Einstieg zur Eröffnung: keine Mehrdeutigkeit am Einstiegstag); keine technisch lösbare Lücke', technical: '9/9 Phasen als Modellstudie', original: 'Kullamägi-Webprimärquellen (englisch)', assumptions: 'Setup-Qualität, Größe (7 manuelle Entscheidungen)', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT', blocked: 'V4-D1-Rest', execution: 'nächste Eröffnung / Stop; geringe Trade-Stabilität durch Knock-on (E6)', manual: '7 essenzielle Entscheidungen', next: 'Eigentümerentscheidungen zu den manuellen Regeln; V4-D1-Rest', evidence: ['PR898', 'PR902'] }),
  C09: S({ changed7: 'SF7-D2: versiegelte EP-Trade-Kennzahlen waren leer (Feld pnl) – behoben; SF7-D5: sicherer Stop in der Füll-Minute unter der optimistischen Minutenregel – Variante; Cache-Lauf mit 0 Abrufen, EP-Referenz identisch; E7-6: vorregistrierte Erweiterung CLEAN_EXT_E7_6 (15 % je Schicht, 481 Anfragen) neben der unveränderten Referenz', technical: 'chartbasierte Intraday-Modellstudie auf einer Stichprobe', original: 'Kullamägi-EP-Artikel (englisch); Katalysator nicht prüfbar', assumptions: 'Gap-Screen, ORH-Einstieg, IEX-Volumentempo', simulation: 'Stichprobenstudie', backtest: 'als Strategie nicht messbar', reliable: 'IEX-Minuten ab 2017 (Cache)', blocked: 'Katalysator-/News-Historie, konsolidiertes Intraday-Volumen', execution: 'nur IEX-Minuten; Stop am selben Tag nur gegen IEX-Tiefs geprüft (offenes Risiko)', manual: '2 essenzielle Entscheidungen', next: 'Katalysatorkalender aus SEC-8-K-Zeitstempeln', evidence: ['PR898', 'E76'] }),
  C10: S({ changed7: 'Stichprobencode neu geprüft, kein Fehler; E7-6: vorregistrierte Erweiterung CLEAN_EXT_E7_6 (3,5 % je Schicht) neben der unveränderten Referenz', technical: 'hypothetische Einzeltrade-Studie', original: 'Kullamägi-Webprimärquellen', assumptions: 'Kontexturteil (4 manuelle Entscheidungen)', simulation: 'hypothetisch', backtest: 'nicht ausführbar: keine Borrow-/Locate-Historie', reliable: 'IEX-Minuten ab 2017', blocked: 'Borrow-, Locate-, Leihgebühr-Historie; Uptick-Rule-Modell', execution: 'nur hypothetische Shorts', manual: '4 essenzielle Entscheidungen', next: 'Quelle für Borrow-Historie (Lizenz-/Kostenentscheidung)', evidence: ['PR898', 'E76'] }),
  C11: S({ changed7: 'neu geprüft; keine technisch lösbare Lücke (Stop bleibt SOURCE_BLOCKED, Modellvariante nach E3)', technical: '8/9 Phasen; 9/9 nur als Modellvariante', original: 'Morales/Kacher-Webprimärquellen; Initialstop nicht in der Quelle', assumptions: '7 manuelle Entscheidungen; Stop am Signaltagstief als Variante', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT', blocked: 'Stopregel (Quelle); konsolidiertes Intraday-Volumen', execution: 'Schluss / nächste Eröffnung', manual: '7 essenzielle Entscheidungen', next: 'Quelle für die Stopregel', evidence: ['PR898', 'PR902'] }),
  C12: S({ changed7: 'neu geprüft; 50-Sitzungen-Fenster bleibt deklarierte Konvention', technical: '9/9 Phasen als Modellstudie', original: 'Morales/Kacher-Webprimärquellen; Volumenfenster mehrdeutig', assumptions: '8 manuelle Entscheidungen; D-BGU-VOLWINDOW', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT', blocked: 'V4-D1-Rest', execution: 'Eröffnungs-/Gap-Füllungen', manual: '8 essenzielle Entscheidungen', next: 'Eigentümerentscheidungen zu den manuellen Regeln; V4-D1-Rest', evidence: ['PR898', 'PR902'] }),
  C13: S({ changed7: 'SF7-D1 gezählt (127 sichere Ausstiege), nur Variante', technical: '8/9 Phasen; Trailing nur als Modellvariante', original: 'Einstieg/Stop aus der gekennzeichneten Sekundärquelle W-RAS97; Trailing und Größe nicht in den Quellen', assumptions: '3 manuelle Entscheidungen; Trailing über Swing-Tiefs als Variante (E3)', simulation: 'ja', backtest: 'nur Modellstudie', reliable: 'DEV-Snapshot EXACT', blocked: 'Trailing-Regel (Quelle)', execution: 'Tagesbalken, pessimistisch', manual: '3 essenzielle Entscheidungen', next: 'Primärquelle für Trailing / Größe', evidence: ['PR898', 'PR902'] }),
});

export function buildSf7Completion() {
  const r6 = JSON.parse(fs.readFileSync(path.join(SF, 'artifacts', 'STRATEGY-SF6-READINESS.json'), 'utf8'));
  const rows = r6.candidates.map((c) => {
    const a = ANSWERS[c.candidateId];
    const met = Object.entries(c.certificationCriteria).filter(([, v]) => v).map(([k]) => k), missing = Object.entries(c.certificationCriteria).filter(([, v]) => !v).map(([k]) => k);
    return { candidateId: c.candidateId, strategyId: c.strategyId, primaryState: c.primaryState, measurementClass: c.measurementClass, executablePhases: c.executablePhases, liveReadiness: c.liveReadiness, certification: c.certification, certificationMet: met, certificationMissing: missing, corporateActions7: c.lifecycleKey && CA7[c.lifecycleKey] ? { dqK5Exposed: CA7[c.lifecycleKey][0], confirmedGenuine: CA7[c.lifecycleKey][1], unresolved: CA7[c.lifecycleKey][2], dqK3Exposed: CA7[c.lifecycleKey][3], dqK3ConfirmedGenuine: CA7[c.lifecycleKey][4], dqK3Unresolved: CA7[c.lifecycleKey][5] } : null, cc5Subcriteria: cc5Subcriteria(c.lifecycleKey ? CA7[c.lifecycleKey] : null), ...a };
  });
  return { schema: 'supertrader-sf7-completion-1.0.0', version: SF7_COMPLETION_VERSION, basis: { readinessCriteria: r6.criteriaVersion, readinessSha256: r6.criteriaSha256 }, evidence: SF7_EVIDENCE, statusChange: 'Kein Zustand, keine Messklasse und kein Zertifizierungskriterium ändert sich in 7.0; alle 13 Strategien bleiben LIVE_NOT_APPROVED und DIAGNOSTIC_NOT_CERTIFIED', candidates: rows };
}

export function sf7CompletionMarkdown(a) {
  let md = `# Supertrader 7.0 – Abschlussmatrix der 13 Strategien\n\nGeneriert von \`scripts/supertrader/source-faithful/completion/sf7-completion-matrix.mjs\` (${a.version}). Maschinelle Felder aus \`STRATEGY-SF6-READINESS.json\` (Kriterien ${a.basis.readinessCriteria}); keine Note ist von Hand gesetzt. ${a.statusChange}.\n\nV4-D1-Spalte: direkt exponierte DQ-K5-Sitzungen der Referenztrades nach der 7.0-Klassifikation, Regelsatz 1.3.0 (Draft-PR #902).\n\n`;
  md += '| | Strategie | Zustand | Messklasse | Phasen | erfüllt | fehlt | V4-D1 (exponiert / echt / ungeklärt) | Live |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const c of a.candidates) md += `| ${c.candidateId} | \`${c.strategyId}\` | ${c.primaryState} | ${c.measurementClass} | ${c.executablePhases ?? '–'} | ${c.certificationMet.map((x) => x.split('-').slice(0, 2).join('-')).join(', ') || '–'} | ${c.certificationMissing.map((x) => x.split('-').slice(0, 2).join('-')).join(', ')} | ${c.corporateActions7 ? `${c.corporateActions7.dqK5Exposed} / ${c.corporateActions7.confirmedGenuine} / ${c.corporateActions7.unresolved}` : '–'} | ${c.liveReadiness} |\n`;
  md += '\n## CC-5-Teilkriterien (Entscheidung E7-1)\n\nCC-5 selbst bleibt, wie das Readiness-Artefakt es ableitet, für alle Referenzen offen. Die Teilkriterien zeigen, was erfüllt ist (Lauf 40122736287, Regelsatz 1.3.0):\n\n' + CC5_SUBCRITERIA.map((x) => `- \`${x.id}\`: ${x.test}`).join('\n') + '\n\n| | Strategie | K5 exponiert / ungeklärt | K3 exponiert / echt / ungeklärt | a | b | c | d | e | f |\n|---|---|---|---|---|---|---|---|---|---|\n';
  const yn = (v) => (v === true ? 'ja' : v === false ? 'nein' : 'entfällt');
  for (const c of a.candidates) if (c.cc5Subcriteria) { const k = c.cc5Subcriteria, ca = c.corporateActions7; md += `| ${c.candidateId} | \`${c.strategyId}\` | ${ca.dqK5Exposed} / ${ca.unresolved} | ${ca.dqK3Exposed} / ${ca.dqK3ConfirmedGenuine} / ${ca.dqK3Unresolved} | ${yn(k['CC5-a-K5-RESOLVED'])} | ${yn(k['CC5-b-K3-RESOLVED'])} | ${yn(k['CC5-c-DATA-PR'] === 'NOT_REQUIRED' ? null : k['CC5-c-DATA-PR'])} | ${yn(k['CC5-d-RECOMPUTED'])} | ${yn(k['CC5-e-DETECTION-COMPLETE'])} | ${yn(k['CC5-f-HOLDOUT'])} |\n`; }
  const Q = [['changed7', 'Was hat sich in 7.0 geändert?'], ['technical', 'Technisch vollständig'], ['original', 'Nachgewiesene Originalregeln'], ['assumptions', 'Modellannahmen'], ['simulation', 'Vollständige Research-Simulation'], ['backtest', 'Vollständiger diagnostischer Backtest'], ['reliable', 'Belastbare Daten'], ['blocked', 'Gesperrte Daten'], ['execution', 'Ausführungsrealismus'], ['manual', 'Manuelle Prüfung'], ['next', 'Nächster konkreter Schritt']];
  for (const c of a.candidates) {
    md += `\n## ${c.candidateId} \`${c.strategyId}\`\n\n| Frage | Antwort |\n|---|---|\n`;
    for (const [k, label] of Q) md += `| ${label} | ${c[k]} |\n`;
    md += `| Zertifizierung erfüllt / fehlt | ${c.certificationMet.join(', ') || '–'} / ${c.certificationMissing.join(', ')} |\n| Belege | ${c.evidence.map((e) => a.evidence[e]).join('; ')} |\n`;
  }
  return md;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = buildSf7Completion();
  fs.writeFileSync(path.join(SF, 'artifacts', 'STRATEGY-SF7-COMPLETION.json'), JSON.stringify(a, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, 'docs', 'SUPERTRADER_7_COMPLETION_MATRIX.md'), sf7CompletionMarkdown(a));
  process.stdout.write(`sf7 completion: ${a.candidates.length} strategies\n`);
}
