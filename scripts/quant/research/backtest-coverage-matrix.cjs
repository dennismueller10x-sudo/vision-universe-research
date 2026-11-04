#!/usr/bin/env node
'use strict';
// Backtesting-Coverage-Matrix als Erzeuger statt Handtabelle (Q1, backtest-coverage-matrix-1.0.0).
//   node scripts/quant/research/backtest-coverage-matrix.cjs                      -> Markdown nach stdout
//   node scripts/quant/research/backtest-coverage-matrix.cjs --out <datei>        -> schreibt nur diese Datei
//   node scripts/quant/research/backtest-coverage-matrix.cjs --check <datei>      -> Exit 1, wenn die Datei abweicht
// Liest ausschliesslich vorhandene Quellen und aendert keine davon:
//   quant/engines/backtest-kinds.cjs (KINDS, METHODS), scripts/quant/research/backtest-runner.cjs (METHOD_FIT,
//   ENGINE_KEYS), quant/data/product/backtest-certification-v1.json (Gates je Art), docs/quant/backtest-catalog/
//   (catalog.json, grid.json, results/, verify-report.json), scripts/quant/research/research-population.cjs (PROFILES),
//   scripts/quant/research/backtest-spec-builder.cjs (COST_PRESETS), quant/methodology/backtest-certification-v1.json
//   (Schwellen) und ueber pit-snapshot-integrity.cjs die PIT-Historien bis zum festen STICHTAG.
// Stabilitaet: Aus dem taeglich neu gebauten Zertifizierungsartefakt gehen nur Status, Zustaende, Gruende, Kategorien
// und Schwellen ein, keine Tageszaehlerstaende. Zaehlerstaende und Prognosen stehen zum festen STICHTAG im Dokument
// (veroeffentlichte Staende werden nie ueberschrieben, also bleibt der Abschnitt gleich). Kippt ein Gate oder ein
// Grund, weicht das Dokument ab: dann hat sich die Abdeckung geaendert, und das Dokument wird neu erzeugt.
// Fail closed: Ein Blocker ohne Eintrag in SOLVABILITY, eine Art oder Methode ohne Begruendung bricht ab.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const req = p => require(path.join(ROOT, p));
const SCHEMA = 'backtest-coverage-matrix-1.0.0';
const DOC = 'docs/quant/BACKTEST_COVERAGE_MATRIX.md';
const STICHTAG = '2026-10-31'; // asOf des Zertifizierungsartefakts beim Erstellen; nur hier aendern
const CATALOG_DIR = 'docs/quant/backtest-catalog';

/* ------------------------------------------------------------------ Bewertungstabellen (begruendet) */
// Warum eine Methode fuer eine Art nicht zugelassen ist (METHOD_FIT des Runners; Begruendung aus dem Runner-Code und
// docs/quant/BACKTEST_PRODUCT_READINESS_PLAN.md 1.2 bzw. BACKTEST_RUNNER.md).
const NOT_FIT = Object.freeze({
  'MONTE_CARLO:PATTERN_EVIDENCE': 'Musterereignisse überlappen und bilden keinen Ledger; Resampling setzt nicht überlappende Trades oder eine Periodenreihe voraus',
  'MONTE_CARLO:SETUP_BACKTEST': 'rekonstruierte Setup-Ereignisse ohne finanzierten Ledger; keine nicht überlappende Handelsfolge',
  'MONTE_CARLO:FACTOR_RANKING_BACKTEST': 'Quintil-Spreads je Stichtag, kein Portfolio-Ledger zum Neuziehen',
  'WALK_FORWARD:STRATEGY_BACKTEST': 'feste Gewichte ohne Anpassung: es gibt keinen Lernschritt, den eine Faltung prüfen könnte',
  'OUT_OF_SAMPLE:STRATEGY_BACKTEST': 'feste Gewichte ohne Anpassung: kein Lernzeitraum, also kein Testzeitraum',
  'PARAMETER_SENSITIVITY:SETUP_BACKTEST': 'kein registriertes Raster: die Setup-Zustandsmaschine (setup-mapping-1.0.0) ist fest',
  'PARAMETER_SENSITIVITY:FACTOR_RANKING_BACKTEST': 'kein registriertes Raster: Faktordefinitionen liegen fest im privaten V10-PIT-Panel',
  'PORTFOLIO_REBALANCING:SAME_STOCK_REPLAY': 'kein Portfolio: eine Aktie bzw. der echte Wochen-Ledger mit eigener Positionsführung',
  'PORTFOLIO_REBALANCING:PATTERN_EVIDENCE': 'Häufigkeitsauswertung von Ereignissen, kein finanzierter Ledger',
  'PORTFOLIO_REBALANCING:SETUP_BACKTEST': 'Ereignisstudie auf Setup-Zuständen, kein finanzierter Ledger',
  'PORTFOLIO_REBALANCING:FACTOR_RANKING_BACKTEST': 'Quintilvergleich, kein finanzierter Ledger (Produktadapter B2/C2 zurückgestellt)'
});

// Loesungsweg je Blocker. TECHNISCH = mit heutigen Engines und Daten in einem eigenen PR loesbar (Wirkung auf das
// Zertifizierungsartefakt nur ueber den Erzeuger, Fachmodell-PR mit Vorher/Nachher); OWNER = nur mit einer
// Owner-Entscheidung; ZEIT_DATEN = nur durch weiterlaufende Historie oder fehlende Daten; BEFUND = gueltiges negatives
// Forschungsergebnis, keine der drei Arten loest es (keine Alpha-Suche).
// Quellen: QUANT_FINAL_HANDOVER.md A3/A4/B3/B5/E, BACKTEST_PRODUCT_READINESS_PLAN.md 1.1 und P3–P5,
// BACKTEST_DELISTED_INTEGRATION.md D2–D7, SETUP_OOS_DECISION_A1_A6.md.
const SOLVABILITY = Object.freeze({
  'SAME_STOCK_REPLAY:survivorship:SURVIVOR_BY_CONSTRUCTION': ['OWNER', 'strukturell: eine Aktie mit langer Historie hat überlebt; Warten ändert nichts. Plan P3.4: die Art bleibt beschreibend. Eine Zertifizierung ginge nur über eine andere Norm (Gate-Änderung), die nicht vorgesehen ist.'],
  'SAME_STOCK_REPLAY:ruleTest:DESCRIPTIVE_NOT_A_TEST': ['OWNER', 'die Art beschreibt, sie prüft keine Regel (Stufe OBSERVED). Nur eine Produktentscheidung zur Kennzeichnung als Beschreibung, keine Zertifizierung.'],
  'PATTERN_EVIDENCE:survivorship:PRESENT_AND_UNQUANTIFIED_IN_PART': ['OWNER', 'P3.1 technisch erledigt: survivorship-sensitivity.cjs rechnet dieselbe Auswahl mit V10_LIFECYCLE (F0) und V13_DELISTED_F1 (Register 1.0.0) über den unveränderten Runner (Abschnitt I). Offen: der Lauf mit den privaten Reihen (Archivweg, Secret) und die Gate-Eingabe (P3.2 Tiingo-Rechte, P3.3), beides Freigabe FV-5; Security Master 1.3.0 (H1).'],
  'PATTERN_EVIDENCE:returnBasis:STUDY_RETURN_BASIS_NOT_TOTAL_RETURN': ['OWNER', 'P4.1 als Research erledigt (Abschnitt I): Gesamtrendite canonical-total-return-1.0.0 neben Kursrendite, Titel ohne Beleg ausgeschlossen und ausgewiesen, Parität mit dem Runner. Das Gate ist im Builder eine Konstante und liest die Produkt-Musterstudie (Kursrendite); P4.2 braucht deren Erzeuger in Gesamtrendite (Pipeline, --work-dir) und die Umverdrahtung, Freigabe FV-5.'],
  'PATTERN_EVIDENCE:certifiedAsBacktest:STUDY_DECLARES_BACKTEST_NOT_CERTIFIED': ['OWNER', 'die Musterstudie erklärt sich selbst als Häufigkeitsauswertung. Sie als zertifizierbaren Backtest zu führen, ist eine Normentscheidung.'],
  'SIGNAL_BACKTEST:survivorship:PARTIAL_SENSITIVITY_ONLY': ['ZEIT_DATEN', 'delistete Titel erst ab 2016 und nur in der Sensitivität; vor 2016 fehlen Reihen, der Delisting-Ausgang ist unbekannt (DELISTED_ONLY_FROM_2016, DELIST_OUTCOME_UNKNOWN). Kein neuer Anbieter erlaubt. P3.1 je Ereignis vorbereitet (survivorship-sensitivity.cjs, Lauf mit privaten Reihen = FV-5); D4 (finanzierter Zeitplan mit beendeten Listings) ist ein eigener Fachmodell-PR. Beides schließt die Lücke vor 2016 nicht.'],
  'SIGNAL_BACKTEST:ruleCertified:NO_RULE_CERTIFIED': ['BEFUND', 'V10–V13c: keine Regel mit robustem Überschuss gegen SPY nach Holm. Ein negatives Ergebnis ist ein gültiges Produktergebnis; keine neue Alpha-Suche.'],
  'SETUP_BACKTEST:historyDates:SETUP_HISTORY_TOO_SHORT': ['ZEIT_DATEN', 'wächst mit jedem veröffentlichten Stichtag (Abschnitt F).'],
  'SETUP_BACKTEST:historySpan:SETUP_HISTORY_SPAN_TOO_SHORT': ['ZEIT_DATEN', 'wächst mit der Zeit (Abschnitt F).'],
  'SETUP_BACKTEST:completedOutcomes:COMPLETED_OUTCOMES_TOO_FEW': ['ZEIT_DATEN', 'erste 6-Monats-Ergebnisse ab etwa 2027-03-26 (Abschnitt F).'],
  'SETUP_BACKTEST:titles:TOO_FEW_TITLES': ['ZEIT_DATEN', 'folgt aus den ersten abgeschlossenen 6-Monats-Ergebnissen.'],
  'SETUP_BACKTEST:independence:EVENTS_CLUSTERED_IN_TIME': ['ZEIT_DATEN', 'der Builder zählt verschiedene Monate mit Ereignissen (Schwellenname independentWeeks); beide Lesarten mit Datum in Abschnitt I und FV-1. Unter der aktiven Lesart bindet dieses Gate das früheste Datum.'],
  'SETUP_BACKTEST:returnBasis:TOTAL_RETURN_NOT_IN_THIS_RUN': ['TECHNISCH', 'das Setup-Ergebnisartefakt wurde mit Kursrendite gebaut (öffentliche Jahresreihe ohne Gesamtrendite); mit der kanonischen Historie (--work-dir, Pipeline) rechnet build-setup-outcomes.mjs Gesamtrendite. Lösung im Erzeuger-Lauf, kein Handeingriff in quant/data.'],
  'SETUP_BACKTEST:entryVariant:VARIANTS_NOT_MEASURABLE_YET': ['ZEIT_DATEN', 'messbar erst mit abgeschlossenen Ergebnissen; ob die Varianten übereinstimmen, ist offen (bei Abweichung über 1 Pp: Owner-Entscheidung).'],
  'SETUP_BACKTEST:oos:OOS_NOT_MEASURABLE_YET': ['ZEIT_DATEN', 'Segmentierung A1–A6 entschieden 04.11.2026 (SETUP_OOS_DECISION_A1_A6.md): Schnitt 2027-05-31, Embargo 183 Tage, je Ereignisart 30 effektive Ereignistage je Segment; messbar frühestens um 2028-01-08.'],
  'STRATEGY_BACKTEST:membershipHistory:HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING': ['ZEIT_DATEN', 'wächst mit den wöchentlichen Mitgliedschaftsständen; verlorene Monate holt man nicht nach (Abschnitt F).'],
  'STRATEGY_BACKTEST:factorHistory:FACTOR_HISTORY_TOO_SHORT': ['ZEIT_DATEN', 'wächst mit den täglichen Faktor-Snapshots (Abschnitt F).'],
  'FACTOR_RANKING_BACKTEST:factorHistory:FACTOR_HISTORY_TOO_SHORT': ['ZEIT_DATEN', 'wie Strategy (Abschnitt F).'],
  'FACTOR_RANKING_BACKTEST:completedForward:FORWARD_OUTCOMES_TOO_FEW': ['ZEIT_DATEN', 'Monate mit abgeschlossenem 3-Monats-Ergebnis = Faktormonate minus 3 (Abschnitt F).'],
  'FACTOR_RANKING_BACKTEST:membershipHistory:HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING': ['ZEIT_DATEN', 'wie Strategy (Abschnitt F).'],
  'SETUP_BACKTEST:ownerApproval:REQUIRED': ['OWNER', 'der Methodikvertrag (setup-state-v1.json requirements.backtestCertification) verlangt eine ausdrückliche Freigabe, auch wenn alle Gates bestehen.']
});
// Research-Nachweise zu einzelnen Gates (Abschnitt I). Sie speisen keine Zertifizierung; der Zustand bleibt der des Artefakts.
const RESEARCH_FILES = Object.freeze({
  P31: 'docs/quant/research/survivorship-sensitivity-p3.1.json',
  P41: 'docs/quant/research/pattern-total-return-p4.1.json',
  P41P: 'docs/quant/research/pattern-total-return-population-p4.1.json',
  P31P: 'docs/quant/research/survivorship-public-frame-p3.1.json',
  FV1: 'docs/quant/research/setup-independence-readings-fv1.json',
  FV4: 'docs/quant/research/catalog-private-expectations-fv4.json'
});
const RESEARCH_BY_GATE = Object.freeze({
  'PATTERN_EVIDENCE:survivorship': 'P31', 'SIGNAL_BACKTEST:survivorship': 'P31', 'PATTERN_EVIDENCE:returnBasis': 'P41', 'SETUP_BACKTEST:independence': 'FV1'
});
const SOLV_LABEL = { TECHNISCH: 'heute technisch', OWNER: 'nur mit Owner-Entscheidung', ZEIT_DATEN: 'nur durch Zeit/Daten', BEFUND: 'Befund (keine der drei)' };

// Abdeckung je Art, die nicht aus einer Datei ablesbar ist (Kapitalmassnahmen, Delisting-Behandlung).
// Quellen: QUANT_FINAL_HANDOVER.md A3/A4/B3, BACKTEST_DELISTED_INTEGRATION.md, Runner (dataQuality.corporateActions).
const COVERAGE_NOTES = Object.freeze({
  SAME_STOCK_REPLAY: { delisting: 'Regel-Replay auf dl_-Reihen möglich (Profil V13_DELISTED_F1, privat); Wochen-Ledger nur Produktstamm ohne delistete Titel', ca: 'Split-bereinigte Wochenschlüsse (ADR-002, Loader-Evidenz); keine Dividenden in der Ereignisrendite' },
  PATTERN_EVIDENCE: { delisting: 'Überlebenden-Kohorte; Sensitivität mit delisteten Reihen vorbereitet (P3.1, survivorship-sensitivity.cjs, Reihen privat)', ca: 'Split-bereinigt; Kursrendite; Gesamtrendite nur als Research (P4.1, pattern-total-return.mjs)' },
  SIGNAL_BACKTEST: { delisting: 'Ereignisse auf dl_-Reihen möglich (privat); finanziert: im Fenster delistete Titel fallen heraus (D4 offen); Ereignisse nach dem letzten Handelstag zensiert', ca: 'Gesamtrendite canonical-total-return-1.0.0' },
  SETUP_BACKTEST: { delisting: 'Rekonstruktion ohne delistete Titel (D6 offen); veröffentlichte Stände enthalten das Universum des Tages', ca: 'Rekonstruktion split-bereinigt; Ergebnisartefakt heute Kursrendite' },
  STRATEGY_BACKTEST: { delisting: 'feste Gewichte auf der heutigen Kohorte; Verkauf zum letzten Schluss erst mit D5', ca: 'Dividenden aus dem TR-Register (Variante dividends), sonst Kurs; Split-bereinigt' },
  FACTOR_RANKING_BACKTEST: { delisting: 'privates Panel nur ref_-Listings (D7 offen, dl_ werden ausgeschlossen)', ca: 'Panelrenditen laut V10-Panel (privat)' }
});

// Nicht unterstuetzte, aber relevante Anwendungsfaelle. [Fall, Nutzwert, heute machbar, Freigabe noetig, Bemerkung]
const USE_CASES = Object.freeze([
  ['Rechnen auf Abruf (beliebige Auswahl außerhalb des Katalogs)', 'hoch', 'Engine ja (Runner offline); Auslieferung nein: Pages ohne Node, Läufe bis 2,5 GB, private Archive', 'ja (Infrastruktur, Kosten)', 'heute heißt alles Nicht-Vorgerechnete „nicht vorgerechnet“'],
  ['Parametersensitivität im Katalog', 'mittel', 'ja: Methode zugelassen für Replay, Pattern, Signal, Strategy; im Katalog 0 Auswahlen', 'ja (Katalog-Generation 1 eingefroren, neue Generation H7)', 'nur registriertes Raster, Holm im Raster'],
  ['Ereignisstudie außerhalb von Dividenden (Quartalszahlen, Einreichungen)', 'mittel', 'nein: EVENT_DRIVEN liest nur das TR-Dividendenregister', 'ja (neue Ereignisquelle = neue Forschung)', 'SEC-Daten wären frei, aber kein registriertes Ereignisregister'],
  ['Delistete Titel in finanzierten Signal- und Strategy-Läufen', 'hoch', 'teilweise: Register und Reihen vorhanden (privat), Zeitplan fehlt (D4/D5)', 'ja (Fachmodell-PR, Archivweg mit Secret, nach H1)', 'schließt die Lücke vor 2016 nicht'],
  ['Delistete Titel im Faktorpanel', 'hoch', 'nein: Panel nur ref_ (D7, größter Aufwand)', 'ja', 'Voraussetzung für ein überlebensfreies Faktor-Ranking vor 2028'],
  ['Strategy-Profilvariante (Zustand B im Katalog)', 'hoch', 'nein: braucht PIT-Faktor-Snapshots mit Zeilenverfügbarkeit', 'nein (Zeit)', 'die Snapshots wachsen seit 2026-09-23'],
  ['Benchmark außer SPY-Kursrendite (SPY TR, QQQ, gleichgewichtet)', 'mittel', 'nein: Spec kennt nur SPY und NONE', 'ja (Spec- und Vertragsänderung)', 'Wochenreihen weiterer ETFs wären zu prüfen'],
  ['Backtest eines Nutzerportfolios oder der Watchlist', 'hoch', 'technisch ja (Strategy, feste Gewichte); fachlich mit Rückschaufehler (heute ausgewählt)', 'ja (Produkt, Kennzeichnung)', 'nur als Beschreibung, nie als Beleg'],
  ['Tägliche Granularität', 'mittel', 'nein: Runner rechnet wöchentlich (grain WEEKLY)', 'ja (Fachmodell)', 'Tageskurse liegen vor'],
  ['Short, Hebel, Steuern, Zins auf Kasse', 'gering bis mittel', 'nein: FRACTIONAL_LONG_ONLY, NO_CASH_INTEREST_OR_TAX', 'ja (Fachmodell)', 'bewusst ausgeschlossen'],
  ['Märkte außerhalb der USA', 'mittel', 'nein: Security Master und Reihen nur US', 'ja (Daten)', 'Discover zeigt Europa als „noch nicht verfügbar“'],
  ['Öffentliche Anzeige der Ergebnisse auf #/backtest', 'hoch', 'technisch vorbereitet (Adapter, Vorschau), UI byte-gesperrt', 'ja (Praxistest, UI-Revision, Freigabe)', 'ohne Zertifizierung nur „Forschung, nicht zertifiziert“']
]);

// Freigabevorlagen (Owner): was diese Arbeit nicht entscheiden darf.
const APPROVALS = Object.freeze([
  ['FV-1', 'Setup-Gate independence: Lesart der Schwelle', null, null, null], // aus setup-independence-readings.cjs zum STICHTAG (fv1Approval)
  ['FV-2', 'Kennzahlen-Hash im Runner-Ergebnis (P0.7 vollständig)', 'Heute steht der laufzeitfreie Kennzahlen-Hash nur in der Hilfsfunktion backtest-metrics-hash.cjs und in der Zusammenfassungszeile von run-backtest.cjs. Ein Feld im Ergebnis ändert backtest-runner.cjs (CODE_FILES): alle 16 Demos veralten, Neubau über den Archivweg [v13-archive:demos] (Secret), danach Bundle-Export; der Katalog bleibt Generation 1 und bekäme das Feld erst mit Generation 2 (H7).',
    'Freigabe für: Runner-Feld metricsHash, Demo-Neubau über das Archiv, Bundle-Export im selben PR.', 'empfohlen zusammen mit dem nächsten ohnehin nötigen Demo-Neubau'],
  ['FV-3', 'Determinismus-Prüfung in CI über zwei Node-Versionen (P0.6/P0.7)', 'Lokal belegt: gleicher Kennzahlen-Hash mit zwei verschiedenen Node-Binären (Test) und 16/16 öffentliche Katalogfälle mit gleichem Kennzahlen-Hash gegen den CI-Bau vom 31.10. Ein Workflow mit zwei Node-Versionen (workflow_dispatch, permissions: contents: read, ohne Secrets) fehlt.',
    'Freigabe für einen neuen Prüf-Workflow ohne Secrets (workflow_dispatch, Matrix zwei Node-Versionen, permissions: contents: read): node --test quant/tests/backtest-run-cli-metrics-hash.test.mjs und die 16 öffentlichen Katalogfälle neu rechnen, Kennzahlen-Hash gegen catalog.json. Laufzeit etwa 10 Minuten je Version.', 'Minutenverbrauch prüfen; ohne Workflow bleibt der lokale Nachweis'],
  ['FV-4', 'Gegenrechnung der 5 privaten Katalogfälle neu ausführen', 'Faktorpanel (3) und delistete Reihen (2) liegen nur im privaten R2-Archiv. Die committete Gegenrechnung (verify-report.json, 21 Fälle) bleibt gültig, solange der Code unverändert ist; lokal neu gerechnet wurden nur die 16 öffentlichen Fälle.',
    'Nur nötig nach einer Code-Änderung im Runner: [v13-archive:catalog] auf einem claude/**-Branch (Secret V13_ARCHIVE_PRIVATE_KEY). Vorbereitet: Erwartung je Fall (catalog-private-expectations-fv4.json) und Auswertung des Laufartefakts mit catalog-private-recheck.cjs --compare, Abbruchkriterien und Ablauf in BACKTEST_P2_DEFIZITE.md (R1).', 'heute nicht nötig; Archivgeneration 2.0.0 (#1241) ändert den Leseweg, nicht die Erwartung'],
  ['FV-5', 'Survivorship- und Renditebasis-Gates aus Sensitivitäten speisen (P3.3, P4.2)', 'Pattern und Signal bleiben LIMITED, bis die Gates die Sensitivität mit delisteten Titeln bzw. das Gesamtrendite-Ergebnis lesen. Das ändert die Eingabe der Zertifizierung.',
    'Drei Schritte, je eigene Freigabe: (1) P3.1-Lauf mit den privaten Reihen über den Archivweg (Secret, Ablauf R2 in BACKTEST_P2_DEFIZITE.md); (2) P4.1 auf der kanonischen Historie der Pipeline (--work-dir, 30 Katalogtitel statt 4 öffentlicher, R3) und Erzeuger der Produkt-Musterstudie in Gesamtrendite (Fachmodell-PR mit Vorher/Nachher); (3) Umverdrahtung der Gates (P3.3 nach P3.2, P4.2) im Builder.', 'Stand: P3.1-Code und P4.1-Research erledigt (Abschnitt I); Reihenfolge H1, (1)–(2), dann (3)'],
  ['FV-6', 'Setup-OOS A1–A6', 'Entschieden 04.11.2026 (Neustart-Freigabe): kinds.SETUP_BACKTEST.oosSegmentation in backtest-certification-1.1.0, Auswertung je Ereignisart, Zeilenexport im Runner.', 'erledigt, keine weitere Freigabe nötig.', 'Gate messbar frühestens um 2028-01-08'],
  ['FV-7', 'Kennzeichnung der strukturell beschreibenden Arten (Replay, Pattern)', 'SAME_STOCK_REPLAY und PATTERN_EVIDENCE erreichen unter der geltenden Norm nie CERTIFIED (P3.4).', 'Produktentscheidung: Anzeige als „Beschreibung, kein Test“ statt Warten auf Zertifizierung.', 'Teil von H4'],
  ['FV-8', 'Alarm bei fehlendem Snapshot-Monat (P2.3)', 'pit-snapshot-integrity.cjs liefert den Befund für den bestehenden Alarm: --fail-on-missing-month (Exit 1 bei Integritätsfehler oder fehlendem Monat einer gezählten Reihe, NDX/DJIA nur Information) und --alarm-detail <datei> (Text für ALARM_DETAIL_FILE von pipeline-alarm.mjs). Es fehlt nur der Schritt im Workflow.', 'Freigabe für einen Job im bestehenden freshness-monitor.yml: Schritt mit beiden Optionen, Ergebnis als RESULT_PIT an den vorhandenen alarm-Job (ohne neue Secrets, permissions wie dort).', 'die monatlichen Gates sind ab der ersten Lücke um einen Monat später']
]);

/* ------------------------------------------------------------------ Hilfen */
const esc = s => String(s == null ? '–' : s).replace(/\|/g, '\\|');
const row = cells => '| ' + cells.map(esc).join(' | ') + ' |';
const table = (head, rows, align) => [row(head), '|' + (align || head.map(() => '---')).join('|') + '|', ...rows.map(row)].join('\n');
const STATE_SHORT = { RESEARCH_EXECUTED: 'A', PREPARED_DATA_LIMITED: 'B', PRODUCT_CERTIFIED: 'C' };
const json = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // ohne ICU-Abhaengigkeit

function sources() {
  const Kinds = req('quant/engines/backtest-kinds.cjs');
  const R = req('scripts/quant/research/backtest-runner.cjs');
  const Pop = req('scripts/quant/research/research-population.cjs');
  const B = req('scripts/quant/research/backtest-spec-builder.cjs');
  const MH = req('scripts/quant/research/backtest-metrics-hash.cjs');
  const I = req('scripts/quant/research/pit-snapshot-integrity.cjs');
  const cert = json(R.CERTIFICATION_PATH);
  const methodology = json('quant/methodology/backtest-certification-v1.json');
  const catalog = json(CATALOG_DIR + '/catalog.json');
  const grid = json(CATALOG_DIR + '/grid.json');
  const verify = json(CATALOG_DIR + '/verify-report.json');
  const results = catalog.entries.map(e => json(CATALOG_DIR + '/results/' + e.specHash + '.json'));
  const integrity = I.report({ asOf: STICHTAG });
  const research = Object.fromEntries(Object.entries(RESEARCH_FILES).map(([k, f]) => [k, fs.existsSync(path.join(ROOT, f)) ? json(f) : null]));
  const independence = req('scripts/quant/research/setup-independence-readings.cjs').readings({ asOf: STICHTAG });
  return { Kinds, R, Pop, B, MH, cert, methodology, catalog, grid, verify, results, integrity, research, independence };
}

function costLabel(costs, presets) {
  const name = Object.keys(presets).find(k => presets[k].feeBps === costs.feeBps && presets[k].slippageBps === costs.slippageBps);
  return costs.feeBps + '+' + costs.slippageBps + ' bp' + (name ? ' (' + name + ')' : '');
}
function populationLabel(spec) {
  const p = spec.population, parts = [p.profile];
  if (p.tickers) parts.push(p.tickers.length === 1 ? p.tickers[0] : p.tickers.length + ' Titel');
  else if (p.securityIds) parts.push(p.securityIds.length + ' Listing' + (p.securityIds.length === 1 ? '' : 's'));
  else parts.push('ganzer Rahmen');
  if (p.sample) parts.push('Stichprobe ' + p.sample.size);
  if ((p.privateInputs || []).length) parts.push('privat: ' + p.privateInputs.join('+'));
  return parts.join(', ');
}
const methodsOf = r => r.envelope.methods.filter(m => m.state === 'EXECUTED').map(m => m.method);

const pct = (x, d = 2) => (x == null ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d).replace('.', ',') + ' Pp');
/** Kurzaussage je Research-Nachweis (Abschnitt I). Fehlt der Bericht, bricht der Bau ab. */
function researchLine(id, r) {
  if (!r) throw Error('RESEARCH_REPORT_MISSING:' + RESEARCH_FILES[id]);
  if (id === 'P31') {
    const a = r.cases.map(c => c.survivors.state === 'RESEARCH_EXECUTED' ? 'A' : 'B'), b = r.cases.map(c => c.withDelisted.state === 'RESEARCH_EXECUTED' ? 'A' : 'B');
    return r.state + ': ' + r.cases.length + ' Fälle (' + r.cases.map(c => c.template).join(', ') + '), Stichprobe ' + r.design.sample + '; Überlebende ' + a.join('/') + ', mit Delisteten ' + b.join('/') + (r.state === 'RESEARCH_EXECUTED' ? '' : ' (private Reihen fehlen, Freigabe FV-5)');
  }
  if (id === 'P41') {
    const d = r.paired.decomposition;
    return 'Research: ' + r.cohort.included + ' von ' + r.cohort.requested + ' Titeln mit bestätigter Gesamtrendite (ausgeschlossen: ' + (r.cohort.excluded.map(x => x.ticker + ' ' + x.reason).join(', ') || 'keiner') + '), ' + r.paired.pairs + ' Ereignispaare, Ausschüttungen im Mittel ' + pct(d.distributions.mean) + ' je Ereignis (' + r.horizonBars + ' Wochen), Wochenreihe gegen Tagesreihe ' + pct(d.weeklySeriesSource.mean, 3) + '; Parität mit dem Runner ' + r.parity.eventsCompared + ' Ereignisse, ' + r.parity.mismatches + ' Abweichungen';
  }
  if (id === 'P41P') {
    const p = r.paired, pp = r.population, ci = x => (x && x.interval95 ? '[' + pct(x.interval95[0]) + '; ' + pct(x.interval95[1]) + ']' : '–');
    return 'Research: Vollerhebung ' + pp.profile + ' (' + thousands(pp.frame) + ' Listings) plus Golden-Preview, ' + pp.confirmedTotalReturn + ' von ' + thousands(pp.candidates) + ' Kandidaten mit bestätigter Gesamtrendite (öffentliche Obergrenze: nur Golden-Preview; Ausschlüsse ' + Object.entries(pp.excludedByReasonAndSource).map(([k, v]) => k.split('|')[0] + ' ' + thousands(v)).join(', ') + '); gepaarte Differenz ' + p.pairs + ' Paare, Mittel ' + pct(p.mean) + ', 95 % t ' + ci({ interval95: p.tInterval95 && p.tInterval95.interval }) + ', Cluster Titel×Jahr (' + p.clusterTitleYear.clusters + ') ' + ci(p.clusterTitleYear) + ', Cluster Titel (' + p.clusterTitle.clusters + ', zu wenige) ' + ci(p.clusterTitle) + '; Parität ' + r.parity.eventsCompared + '/' + r.parity.mismatches;
  }
  if (id === 'P31P') {
    const f = r.frame, g = r.gap, e = r.events, est = e.frameEstimate, pc = (x, d = 2) => (x == null ? '–' : (x * 100).toFixed(d).replace('.', ',') + ' %');
    return 'Research: öffentlicher Rahmen ' + f.profile + ' ' + thousands(f.listings) + ' Listings, davon ' + f.endedListings + ' beendet (' + pc(f.endedShare) + '); Register V13 ' + thousands(g.publicFrameEndedVsQualifiedRegister.registerQualified) + ' qualifizierte delistete Reihen (privat), F1 ' + (g.frameGrowthWithDelistedF1 ? '+' + g.frameGrowthWithDelistedF1.addedListings + ' Listings' : '–') + '; Ereignisse (Stichprobe ' + e.design.limit + ' + alle beendeten): Anteil aus beendeten Listings ' + pc(est.shareFromEndedListings) + ', Ende im Horizont ' + pc(est.shareWithListingEndWithinHorizon, 3) + ', Zensurquote ' + pc(est.censoringRate, 3) + '; ' + g.privateProfile.profile + ' ' + g.privateProfile.status;
  }
  if (id === 'FV1') return 'A Monate ' + r.readingA.have + '/' + r.readingA.required + ' → ' + r.readingA.earliest + ' (Setup-Zeitgates frühestens ' + r.readingA.setupTimeGatesEarliest + '); B ISO-Wochen ' + r.readingB.have + '/' + r.readingB.required + ' → ' + r.readingB.earliest + ' (Setup-Zeitgates frühestens ' + r.readingB.setupTimeGatesEarliest + ', Untergrenze)';
  if (id === 'FV4') return r.privateCases + ' private Fälle mit Erwartung (specHash, Kennzahlen-Hash, private Eingabe-Hashes, Prüfzahl der Gegenrechnung), ' + r.publicCases + ' öffentliche; Lauf ' + r.run.mark + ' nicht ausgeführt';
  throw Error('RESEARCH_ID_UNKNOWN:' + id);
}
function fv1Approval(x) {
  return ['FV-1', 'Setup-Gate independence: Lesart der Schwelle',
    'Die Methodik nennt die Schwelle independentWeeks: 20 (seit Commit ' + x.origin.commit.slice(0, 10) + ' vom ' + x.origin.date + '), der Builder zählt im selben Commit verschiedene Kalendermonate mit Ereignissen (Label „verschiedene Monate mit Ereignissen“). Stand ' + x.asOf + ': A Monate ' + x.readingA.have + '/' + x.readingA.required + ', frühestens ' + x.readingA.earliest + ', das Gate bindet (Setup frühestens ' + x.readingA.setupTimeGatesEarliest.slice(0, 7) + '); B ISO-Wochen ' + x.readingB.have + '/' + x.readingB.required + ', frühestens ' + x.readingB.earliest + ', das Gate bindet nicht mehr (Setup-Zeitgates frühestens ' + x.readingB.setupTimeGatesEarliest + ', Untergrenze; oos bleibt offen). Keine der beiden Zählungen misst Unabhängigkeit (alle M6-Fenster überlappen, V10: effektive Fallzahl etwa 12,6 je Ereignisdatum). Vier frühere Vorlagen (V6, V8, V9, V10) sind nicht freigegeben.',
    'A) Monate bestätigen und das Feld ehrlich benennen (eventCalendarMonths, Zählung unverändert, nur Methodik-PR); B) Zählung auf ISO-Wochen (Gate-Änderung in build-backtest-certification.mjs mit Vorher/Nachher; Setup rund 13 Monate früher); C) V10-Vorschlag: Umbenennung wie A und ein neues Gate auf der effektiven Fallzahl (N_eff ≥ 50, ≥ 4 disjunkte M6-Fenster, frühestens 2029).',
    'Empfehlung aus der Analyse (keine Änderung in diesem PR): A jetzt, C als eigene Entscheidung; B nicht, weil es das bindende Gate ohne statistischen Beleg um rund 13 Monate lockert. Bis zur Entscheidung gilt A unverändert. A ist als eigener Entscheidungs-PR #1254 vorbereitet (Draft: Umbenennung mit Alias, Gate-Ergebnis vorher/nachher identisch); die Research-Leser hier lesen beide Namen'];
}

/* ------------------------------------------------------------------ Aufbau */
function build(src = sources()) {
  const { Kinds, R, Pop, B, MH, cert, methodology, catalog, grid, verify, results, integrity, research, independence } = src;
  const researchText = Object.fromEntries(Object.keys(RESEARCH_FILES).map(id => [id, researchLine(id, research[id])]));
  const KINDS = Kinds.KINDS, METHODS = Kinds.METHODS;
  if (KINDS.length !== 6 || METHODS.length !== 7) throw Error('KINDS_OR_METHODS_CHANGED:' + KINDS.length + '/' + METHODS.length);
  for (const m of METHODS) for (const k of KINDS) if (!R.METHOD_FIT[m].includes(k) && !NOT_FIT[m + ':' + k]) throw Error('NOT_FIT_REASON_MISSING:' + m + ':' + k);
  for (const key of Object.keys(NOT_FIT)) { const [m, k] = key.split(':'); if (R.METHOD_FIT[m].includes(k)) throw Error('NOT_FIT_REASON_FOR_SUPPORTED_PAIR:' + key); }
  const certKinds = new Map(cert.kinds.map(k => [k.id, k]));
  for (const k of KINDS) if (!certKinds.has(k)) throw Error('CERTIFICATION_KIND_MISSING:' + k);
  if (catalog.entries.length !== grid.selections.length) throw Error('CATALOG_GRID_MISMATCH');
  const certified = cert.kinds.filter(k => k.status === 'CERTIFIED').map(k => k.id);
  const byStatus = cert.kinds.reduce((a, k) => (a[k.status] = (a[k.status] || 0) + 1, a), {});
  const states = catalog.entries.reduce((a, e) => (a[STATE_SHORT[e.state]] = (a[STATE_SHORT[e.state]] || 0) + 1, a), {});
  const supported = METHODS.reduce((n, m) => n + R.METHOD_FIT[m].length, 0);
  const sig = certKinds.get('SIGNAL_BACKTEST'), rules = sig.rules || [];
  const L = [];
  const P = s => L.push(s);

  P('# Backtesting: Coverage-Matrix und Zertifizierungsstand');
  P('');
  P('> Erzeugt von `scripts/quant/research/backtest-coverage-matrix.cjs` (`' + SCHEMA + '`). **Nicht von Hand ändern.** Neubau: `node scripts/quant/research/backtest-coverage-matrix.cjs --out ' + DOC + '`; Prüfung: `--check ' + DOC + '` (Test `quant/tests/backtest-coverage-matrix.test.mjs`).');
  P('');
  P('**Quellen (nur gelesen):** `quant/engines/backtest-kinds.cjs` (' + Kinds.VERSION + '), `METHOD_FIT`/`ENGINE_KEYS` aus `scripts/quant/research/backtest-runner.cjs` (' + R.VERSION + '), `' + R.CERTIFICATION_PATH + '` (' + cert.schemaVersion + '), Schwellen aus `quant/methodology/backtest-certification-v1.json` (' + methodology.methodologyVersion + '), Katalog `' + CATALOG_DIR + '/` (`catalogHash` `' + catalog.catalogHash.slice(0, 16) + '…`), Populationsprofile aus `research-population.cjs` (' + Pop.VERSION + '), Kostenvorgaben aus `backtest-spec-builder.cjs`, PIT-Historien über `scripts/quant/research/pit-snapshot-integrity.cjs`.');
  P('');
  P('**Stabilität:** Aus dem täglich neu gebauten Zertifizierungsartefakt gehen nur Status, Gate-Zustände, Gründe, Kategorien und Schwellen ein, keine Tageszählerstände. Zählerstände und Prognosen stehen in Abschnitt F zum festen Stichtag **' + STICHTAG + '**; den aktuellen Stand liefert `node scripts/quant/research/pit-snapshot-integrity.cjs --out <datei>`. Kippt ein Gate oder ein Grund, weicht das Dokument ab und der Test schlägt fehl: Dann hat sich die Abdeckung geändert, und das Dokument wird im selben PR mit dem Erzeuger neu gebaut.');
  P('');
  P('## Kurzbefund');
  P('');
  P(table(['Größe', 'Wert', 'Quelle'], [
    ['Backtest-Arten', KINDS.length, 'backtest-kinds.cjs KINDS'],
    ['Zusatzmethoden', METHODS.length, 'backtest-kinds.cjs METHODS'],
    ['zugelassene Kombinationen Art × Methode', supported + ' von ' + KINDS.length * METHODS.length, 'METHOD_FIT'],
    ['Katalog-Auswahlen', catalog.entries.length + ' (Zustand A: ' + (states.A || 0) + ', B: ' + (states.B || 0) + ', C: ' + (states.C || 0) + ')', 'catalog.json'],
    ['zertifizierte Arten laut Artefakt', certified.length + ' von ' + KINDS.length + (certified.length ? ' (' + certified.join(', ') + ')' : ''), 'backtest-certification-v1.json'],
    ['Status der Arten', Object.keys(byStatus).sort().map(s => s + ' ' + byStatus[s]).join(', '), 'backtest-certification-v1.json'],
    ['zertifizierte Signalregeln', rules.filter(r => r.status === 'CERTIFIED').length + ' von ' + rules.length, 'SIGNAL_BACKTEST.rules'],
    ['productionApproved', String(catalog.productionApproved), 'catalog.json'],
    ['unabhängige Gegenrechnung des Katalogs', verify.results + ' Ergebnisse, ' + thousands(verify.checks) + ' Prüfungen, ' + verify.failures + ' Abweichungen (Python ' + verify.python + ', Toleranz ' + verify.tolerance + ')', 'verify-report.json']
  ], ['---', '---', '---']));
  P('');

  /* A */
  P('## A. Arten × Methoden');
  P('');
  P('„ja“: im Runner zugelassen (`METHOD_FIT`), dahinter, wie oft die Methode in den ' + catalog.entries.length + ' Katalog-Auswahlen tatsächlich ausgeführt wurde (EXECUTED). „nein“: der Runner lehnt die Kombination ab (`METHOD_NOT_APPLICABLE_TO_KIND`), Grund darunter. Keine der Methoden speist die Zertifizierung.');
  P('');
  const execCount = (k, m) => results.filter(r => r.kind === k && methodsOf(r).includes(m)).length;
  const kindCount = k => results.filter(r => r.kind === k).length;
  P(table(['Art (Katalog-Auswahlen)', ...METHODS], KINDS.map(k => [k + ' (' + kindCount(k) + ')', ...METHODS.map(m => R.METHOD_FIT[m].includes(k) ? 'ja · ' + execCount(k, m) + '×' : 'nein')])));
  P('');
  P('**Nicht anwendbar, mit Grund:**');
  P('');
  for (const m of METHODS) for (const k of KINDS) if (!R.METHOD_FIT[m].includes(k)) P('- `' + m + '` × `' + k + '`: ' + NOT_FIT[m + ':' + k] + '.');
  P('');
  const neverRun = [];
  for (const m of METHODS) for (const k of KINDS) if (R.METHOD_FIT[m].includes(k) && !execCount(k, m)) neverRun.push('`' + m + '` × `' + k + '`');
  P('**Zugelassen, aber im Katalog nicht vorgerechnet (' + neverRun.length + '):** ' + neverRun.join(', ') + '.');
  P('');
  P('**Engine-Parameter je Art** (`ENGINE_KEYS`): ' + KINDS.map(k => '`' + k + '` ' + R.ENGINE_KEYS[k].join(', ')).join('; ') + '.');
  P('');

  /* B */
  P('## B. Katalog-Auswahlen (' + catalog.entries.length + ')');
  P('');
  P('Zustand A = RESEARCH_EXECUTED, B = PREPARED_DATA_LIMITED (Eingaben fehlen, keine Zahlen). Methoden: angefordert → ausgeführt. Kosten je Seite in Basispunkten (Gebühr + Slippage), Vorgaben aus `backtest-spec-builder.cjs` (' + Object.keys(B.COST_PRESETS).map(k => k + ' ' + B.COST_PRESETS[k].feeBps + '+' + B.COST_PRESETS[k].slippageBps).join(', ') + '). Zertifizierung: Status der Art beim Katalogbau. Kennzahlen-Hash: laufzeitfreier Hash der Zahlen (`backtest-metrics-hash.cjs`, P0.7), erste 16 Zeichen.');
  P('');
  P(table(['#', 'Auswahl', 'Art', 'Zeitraum', 'Methoden', 'Zustand', 'Population', 'Kosten', 'Benchmark', 'Zertifizierung', 'Nachweisart', 'Kennzahlen-Hash'],
    catalog.entries.map((e, i) => { const r = results[i], s = r.spec, req = Object.keys(s.methods || {}); return [i + 1, e.label, e.kind, s.window.from + '..' + s.window.to, (req.length ? req.join(', ') : 'keine') + ' → ' + (methodsOf(r).join(', ') || 'keine'), STATE_SHORT[e.state], populationLabel(s), costLabel(s.costs, B.COST_PRESETS), s.benchmark, e.certificationStatus, e.evidenceKind, MH.metricsHash(r).slice(0, 16)]; }),
    ['--:', '---', '---', '---', '---', ':-:', '---', '---', '---', '---', '---', '---']));
  P('');

  /* C */
  P('## C. Zertifizierung je Art: Gates, Blocker, Lösungsweg');
  P('');
  P('Kategorien laut Methodik: HARD (Verstoß macht jede Zahl wertlos), STRUCTURAL (Datenlücke, verschwindet nicht von allein), QUALITY (Prüfung der Evidenz), HISTORY (wächst mit der Zeit). Lösungsweg: **' + Object.values(SOLV_LABEL).join('**, **') + '**. Die Zuordnung steht als Tabelle `SOLVABILITY` im Erzeuger; ein neuer Blocker ohne Zuordnung bricht den Bau ab.');
  P('');
  const summary = [];
  for (const k of KINDS) {
    const c = certKinds.get(k);
    const blockers = c.blockers.map(b => ({ ...b, key: k + ':' + b.id + ':' + b.reason }));
    if (c.ownerApproval && c.ownerApproval.required && !c.ownerApproval.given) blockers.push({ id: 'ownerApproval', category: 'OWNER', reason: 'REQUIRED', key: k + ':ownerApproval:REQUIRED' });
    for (const b of blockers) if (!SOLVABILITY[b.key]) throw Error('SOLVABILITY_MAPPING_MISSING:' + b.key);
    P('### ' + k + ' · ' + c.label);
    P('');
    P('Status **' + c.status + '**, Stufe ' + c.tier + ', Vertrauen ' + c.trust + ', Bereitschaft ' + c.readiness + ', Owner-Freigabe laut Methodik ' + (c.ownerApproval && c.ownerApproval.required ? 'nötig' : 'nicht nötig') + '. Hauptgrund: `' + c.reason + '`.');
    P('');
    const ev = id => { const r = RESEARCH_BY_GATE[k + ':' + id]; return r ? r + ' (Abschnitt I)' : '–'; };
    P(table(['Gate', 'Kategorie', 'Zustand', 'Grund', 'Schwelle', 'Lösungsweg', 'Begründung', 'Research-Nachweis'], [
      ...c.gates.map(g => { const s = g.state === 'PASS' ? null : SOLVABILITY[k + ':' + g.id + ':' + g.reason]; if (g.state !== 'PASS' && !s) throw Error('SOLVABILITY_MAPPING_MISSING:' + k + ':' + g.id + ':' + g.reason); return [g.id, g.category, g.state, g.reason || '–', g.required == null ? '–' : g.required, s ? SOLV_LABEL[s[0]] : '–', s ? s[1] : '–', g.state === 'PASS' ? '–' : ev(g.id)]; }),
      ...(blockers.some(b => b.id === 'ownerApproval') ? [['ownerApproval', 'OWNER', 'OFFEN', 'REQUIRED', '–', SOLV_LABEL.OWNER, SOLVABILITY[k + ':ownerApproval:REQUIRED'][1], '–']] : [])
    ]));
    P('');
    const cnt = t => blockers.filter(b => SOLVABILITY[b.key][0] === t).length;
    summary.push([k, c.status, blockers.length, cnt('TECHNISCH'), cnt('OWNER'), cnt('ZEIT_DATEN'), cnt('BEFUND')]);
  }
  P('### Übersicht Blocker je Art');
  P('');
  P(table(['Art', 'Status', 'Blocker', SOLV_LABEL.TECHNISCH, SOLV_LABEL.OWNER, SOLV_LABEL.ZEIT_DATEN, SOLV_LABEL.BEFUND], summary, ['---', '---', '--:', '--:', '--:', '--:', '--:']));
  P('');
  P('Survivorship-Kontrolle des Artefakts: Gate ' + cert.survivorship.gate + ', Kontrolle ' + cert.survivorship.control + ' (' + (cert.survivorship.SURVIVORSHIP_CONTROL.reasons || []).join(', ') + ').');
  P('');

  /* D */
  P('## D. Abdeckung je Art: Survivorship, Delisting, Kapitalmaßnahmen, OOS, Walk-Forward, Kosten, Benchmark');
  P('');
  const gateOf = (k, id) => { const g = certKinds.get(k).gates.find(x => x.id === id); return g ? g.state + (g.reason ? ' (' + g.reason + ')' : '') : 'kein ' + id + '-Gate'; };
  const delistedProfiles = Object.keys(Pop.PROFILES).filter(p => Pop.PROFILES[p].delistedFrame);
  P(table(['Art', 'Survivorship (Gate)', 'Delisting', 'Kapitalmaßnahmen und Renditebasis', 'Out-of-Sample', 'Walk-Forward', 'Kosten im Katalog', 'Benchmark im Katalog'], KINDS.map(k => {
    const rs = results.filter(r => r.kind === k);
    const dl = rs.filter(r => (r.spec.population.privateInputs || []).includes('delistedSeries')).length;
    const costs = [...new Set(rs.map(r => costLabel(r.spec.costs, B.COST_PRESETS)))].sort();
    const bm = [...new Set(rs.map(r => r.spec.benchmark))].sort();
    const fit = m => R.METHOD_FIT[m].includes(k) ? 'zugelassen, ' + execCount(k, m) + '× ausgeführt' : 'nicht anwendbar';
    const oos = k === 'SETUP_BACKTEST' ? fit('OUT_OF_SAMPLE') + '; Runner: RECONSTRUCTION_IS_NOT_OOS_EVIDENCE; Gate oos ' + gateOf(k, 'oos') : fit('OUT_OF_SAMPLE') + (certKinds.get(k).gates.some(g => g.id === 'oos') ? '; Gate oos ' + gateOf(k, 'oos') : '');
    return [k, gateOf(k, 'survivorship'), COVERAGE_NOTES[k].delisting + '; Katalog mit delisteten Reihen: ' + dl, COVERAGE_NOTES[k].ca + '; ' + (certKinds.get(k).gates.some(g => g.id === 'returnBasis') ? 'Gate returnBasis ' + gateOf(k, 'returnBasis') : gateOf(k, 'returnBasis')), oos, fit('WALK_FORWARD'), costs.join(', '), bm.join(', ')];
  })));
  P('');
  P('Delisting-Profile (`research-population.cjs`): ' + delistedProfiles.map(p => '`' + p + '` (' + Pop.PROFILES[p].delistedFrame + ')').join(', ') + '; alle privat, hashgebunden. Ereignisse nach dem letzten Handelstag werden zensiert, weder Totalverlust noch Abfindung angesetzt. Benchmark im Runner: `SPY_PRICE_RETURN` oder keiner.');
  P('');

  /* E */
  P('## E. Nicht unterstützte, aber relevante Anwendungsfälle');
  P('');
  P(table(['Anwendungsfall', 'Nutzwert', 'mit heutigen Engines und Daten machbar', 'braucht Freigabe', 'Bemerkung'], USE_CASES.map(x => x.slice())));
  P('');

  /* F */
  const I = integrity;
  P('## F. PIT-Historien: Integrität und frühestes Datum je Gate (Stichtag ' + I.asOf + ')');
  P('');
  P('Erzeugt mit `pit-snapshot-integrity.cjs` (`' + I.schemaVersion + '`), Stände bis einschließlich Stichtag. Zählung wie der Zertifizierungs-Builder (`profile-backtest.js#historyCoverage`), Handelstage laut `quant/config/market-calendar.json` (' + I.calendar.id + ', abgedeckt bis ' + I.calendar.coverage.to + '). Integrität gesamt: **' + I.integrity + '**.');
  P('');
  P(table(['Reihe', 'Stände', 'Monate', 'erster', 'letzter', 'größte Lücke (Tage)', 'fehlend', 'contentHash', 'Index = Platte', 'Hash-Kette', 'Integrität'], I.series.map(s => [
    s.label + (s.informationOnly ? ' (nur Information)' : ''), s.snapshots, s.months, s.earliest, s.latest, s.maxGapDays,
    s.missingSlots ? (s.missingSlots.unit === 'XNYS_TRADING_DAY' ? s.missingSlots.missing.length + ' von ' + s.missingSlots.expected + ' Handelstagen' + (s.missingSlots.missing.length ? ': ' + s.missingSlots.missing.join(', ') : '') : s.missingSlots.missing.length ? 'Wochen: ' + s.missingSlots.missing.join(', ') : 'keine Woche') : '–',
    s.contentHash.length ? s.contentHash.verified + '/' + s.contentHash.of : 'kein Feld (asOf geprüft)', s.index ? (s.index.onlyInIndex.length || s.index.onlyOnDisk.length ? 'nein' : 'ja') : 'kein Index', s.chainHash ? s.chainHash.slice(0, 16) : '–', s.integrity]),
  ['---', '--:', '--:', '---', '---', '--:', '---', '---', '---', '---', '---']));
  P('');
  P('Fehlende Monate seit dem ersten Stand: ' + (I.series.some(s => s.missingMonths.length) ? I.series.filter(s => s.missingMonths.length).map(s => s.id + ' ' + s.missingMonths.join(', ')).join('; ') : 'keine') + '.');
  P('');
  P(table(['Art', 'Gate', 'Stand', 'Schwelle', 'erfüllt', 'frühestens', 'Regel'], I.gates.map(g => [g.kind, g.gate, g.have == null ? (g.eventsToDate ? 'Ereignisse ' + Object.entries(g.eventsToDate).map(([a, b]) => a + ' ' + b).join(', ') : g.titlesToDate ? 'Titel ' + Object.entries(g.titlesToDate).map(([a, b]) => a + ' ' + b).join(', ') : '–') : g.have, g.required == null ? '–' : g.required, g.met ? 'ja' : 'nein',
    g.met ? '–' : (g.earliestMonth || g.earliestDate || 'nicht prognostizierbar') + (g.observedCadenceDate ? ' (beobachteter Takt: ' + g.observedCadenceDate + ')' : '') + (g.lowerBound ? ' (Untergrenze)' : '') + (g.calendarCoverage === false ? ' (außerhalb des Feiertagskalenders)' : ''), g.rule || '–'])));
  P('');
  P(table(['Art', 'offene zeitabhängige Gates', 'frühestens alle', 'nicht prognostizierbar', 'zusätzlich nötig (nicht zeitabhängig)'], I.kinds.map(x => {
    const c = certKinds.get(x.kind);
    const extra = c.blockers.filter(b => b.category !== 'HISTORY' && !I.gates.some(g => g.kind === x.kind && g.gate === b.id)).map(b => b.id + ' (' + SOLV_LABEL[SOLVABILITY[x.kind + ':' + b.id + ':' + b.reason][0]] + ')');
    if (c.ownerApproval && c.ownerApproval.required && !c.ownerApproval.given) extra.push('ownerApproval (' + SOLV_LABEL.OWNER + ')');
    return [x.kind, x.openHistoryGates.join(', '), x.earliestAllHistoryGates ? x.earliestAllHistoryGates.slice(0, 7) : 'offen (' + (x.latestKnownBound ? 'bekannte Grenzen bis ' + x.latestKnownBound.slice(0, 7) : '–') + ')', x.notForecastable.join(', ') || '–', extra.join(', ') || '–'];
  })));
  P('');
  P('Replay, Pattern und Signal haben keine zeitabhängigen Gates: Ihre Blocker sind strukturell, normativ oder ein Befund (Abschnitt C). Monatsgates zählen Kalendermonate mit mindestens einem Stand; ein ausgelassener Monat verschiebt das Datum um einen Monat und wird nie nachgeholt.');
  P('');

  /* G */
  P('## G. Reproduzierbarkeit');
  P('');
  P('- **P0.5:** `run-backtest.cjs --help`; die eigene Ausgabe wird vor dem Schreiben gegen den Ergebnisvertrag v2 (`validate()`, mit dem committeten Zertifizierungsartefakt) und gegen `envelopeHash`/`resultHash` geprüft. Ein Verstoß schreibt nichts (Exit 1); geschrieben wird nur `--out`, atomar.');
  P('- **P0.7:** `envelopeHash` und `resultHash` binden mittelbar die Laufzeit: `research-portfolio.cjs` und `research-monte-carlo.cjs` nehmen Node-Version und Binär-Hash in ihr eigenes `resultHash` auf, das im Umschlag steht. Der Kennzahlen-Hash (`scripts/quant/research/backtest-metrics-hash.cjs`) lässt Hash-Felder und Laufzeitangaben weg und bindet nur Zahlen und Texte. Er ist zusätzlich: Runner, Demos, Katalog und Bundle bleiben bytegleich. Das Runner-Feld selbst braucht eine Freigabe (FV-2).');
  P('');

  /* H */
  P('## H. Freigabevorlagen (Owner)');
  P('');
  for (const [id, title, situation, options, note] of APPROVALS.map(a => a[0] === 'FV-1' ? fv1Approval(independence) : a)) {
    P('**' + id + ' · ' + title + '**');
    P('- Lage: ' + situation);
    P('- Zur Entscheidung: ' + options);
    P('- Hinweis: ' + note + '.');
    P('');
  }

  /* I */
  P('## I. Research-Nachweise P2 (Master Completion 3.1, nicht zertifizierend)');
  P('');
  P('Erzeugt mit den Skripten unten, jeweils `--out` unter `docs/quant/research/`. Kein Bericht speist ein Gate, keine Zahl erscheint im Produkt (`gateInput: false`, `productionApproved: false`). Zustände in Abschnitt C kommen weiterhin aus dem Zertifizierungsartefakt. Ablauf der Freigabeläufe und Bewertung: [BACKTEST_P2_DEFIZITE.md](BACKTEST_P2_DEFIZITE.md).');
  P('');
  const META = { P31: ['P3.1 Survivorship-Sensitivität Pattern/Signal', 'scripts/quant/research/survivorship-sensitivity.cjs'], P41: ['P4.1 Gesamtrendite Pattern', 'scripts/quant/research/pattern-total-return.mjs'],
    P41P: ['P4.1 Gesamtrendite, öffentliche Population und Intervall', 'scripts/quant/research/pattern-total-return-population.mjs'], P31P: ['P3.1 Survivorship im öffentlichen Rahmen', 'scripts/quant/research/survivorship-public-frame.mjs'],
    FV1: ['FV-1 Lesarten independence', 'scripts/quant/research/setup-independence-readings.cjs --as-of ' + STICHTAG], FV4: ['FV-4 Erwartung private Katalogfälle', 'scripts/quant/research/catalog-private-recheck.cjs --expect'] };
  P(table(['Nachweis', 'Bericht', 'Erzeuger', 'Schema', 'Aussage (Research)', 'Hash'], Object.keys(RESEARCH_FILES).map(id => {
    const r = research[id];
    return [id + ' · ' + META[id][0], '`' + RESEARCH_FILES[id] + '`', '`' + META[id][1] + '`', r.schemaVersion, researchText[id], r.reportHash ? r.reportHash.slice(0, 16) : r.catalogHash ? 'Katalog ' + r.catalogHash.slice(0, 16) : '–'];
  })));
  P('');
  if (research.P41 && research.P41.gate) P('**Was das Gate `returnBasis` (Pattern) mit P4.1 sagen würde:** ' + research.P41.gate.underP42);
  P('');
  return L.join('\n').replace(/\n+$/, '') + '\n';
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--out' || argv[i] === '--check') && argv[i + 1] && !o.out && !o.check) o[argv[i].slice(2)] = argv[++i];
    else throw Error('INVALID_ARGUMENTS:' + argv[i]);
  }
  const text = build();
  if (o.check) {
    const have = fs.existsSync(o.check) ? fs.readFileSync(o.check, 'utf8') : null;
    if (have === text) { console.log('[coverage-matrix] aktuell: ' + o.check); return 0; }
    const a = (have || '').split('\n'), b = text.split('\n');
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    console.error('[coverage-matrix] weicht ab ab Zeile ' + (i + 1) + ' (' + o.check + '). Neu erzeugen: node scripts/quant/research/backtest-coverage-matrix.cjs --out ' + o.check);
    return 1;
  }
  if (o.out) { fs.writeFileSync(o.out, text); return 0; }
  process.stdout.write(text);
  return 0;
}
if (require.main === module) { try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error('ABBRUCH: ' + e.message); process.exitCode = 2; } }
module.exports = { SCHEMA, DOC, STICHTAG, NOT_FIT, SOLVABILITY, USE_CASES, APPROVALS, RESEARCH_FILES, RESEARCH_BY_GATE, researchLine, fv1Approval, sources, build, main };
