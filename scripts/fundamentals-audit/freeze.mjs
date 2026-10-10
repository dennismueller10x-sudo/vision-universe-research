// Data-Freeze des korrigierten Fundamental-Layers.
//   v1 FUNDAMENTAL-DATA-FREEZE.json     Stand 1.11.0, gegen den der Data-Holdout lief (unveraendert, nicht ueberschreiben)
//   v2 FUNDAMENTAL-DATA-FREEZE-v2.json  Stand 1.12.0 (E9, gefunden in der Consumer-Wirkungsanalyse nach dem Holdout; unveraendert)
//   v3 FUNDAMENTAL-DATA-FREEZE-v3.json  Stand 1.15.0 + Registry 1.8.0 (Red-Team-Korrektur; unveraendert)
//   v4 FUNDAMENTAL-DATA-FREEZE-v4.json  Stand 1.19.0 + Registry 1.9.0 + Umsatzbelege 1.1.0 (TTM-Integritaet, Belege, Sichten; unveraendert)
//   v5 FUNDAMENTAL-DATA-FREEZE-v5.json  Stand 1.20.0 (F-TTM-2/F-TTM-3, Stub-/Fiscal-Year-/Same-Day-Policy) - DEVELOPMENT_FREEZE vor Holdout v3 (FAILED_VALIDATION)
//   v6 FUNDAMENTAL-DATA-FREEZE-v6.json  Stand 1.21.0 (F-TTM-4/F-TTM-5, Kalender liest 10-KT) - DEVELOPMENT_FREEZE vor Holdout v4 (FAILED_VALIDATION)
//   v7 FUNDAMENTAL-DATA-FREEZE-v7.json  Stand 1.22.0 (F-TTM-6, Uebergangsberichte als Wertquelle) - DEVELOPMENT_FREEZE vor der Holdout-v5-Entscheidung
// node scripts/fundamentals-audit/freeze.mjs --write --commit <sha> [--reason <text>] | --check [--freeze v1|v2|v3|v4|v5|v6|v7]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
export const FREEZE_V1_PATH = path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE.json');
export const FREEZE_PATHS = { v1: FREEZE_V1_PATH, v2: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v2.json'), v3: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v3.json'), v4: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v4.json'), v5: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v5.json'), v6: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v6.json'), v7: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v7.json') };
export const FREEZE_PATH = FREEZE_PATHS.v7;
const PREVIOUS_FREEZE = FREEZE_PATHS.v6;
export const CODE = ['scripts/quant/sec/provider.py', 'scripts/quant/sec/pipeline.py', 'scripts/quant/sec/normalize.py', 'scripts/quant/sec/fiscal.py', 'scripts/quant/sec/periods.py', 'scripts/quant/sec/restatements.py', 'scripts/quant/sec/model.py', 'scripts/quant/sec/derived.py', 'scripts/quant/sec/registry.py', 'scripts/quant/sec/consumer.py', 'scripts/quant/sec/canonical.py', 'scripts/quant/sec/version.py', 'scripts/quant/sec/daily.py'];
export const MAPPING = ['quant/config/sec-metric-registry.json', 'quant/config/sec-revenue-statement-evidence.json'];
export const AUDIT = ['scripts/fundamentals-audit/sec-ground-truth.mjs', 'scripts/fundamentals-audit/compare.mjs', 'scripts/fundamentals-audit/error-rates.mjs', 'scripts/fundamentals-audit/quant_core_dump.py', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-HOLDOUT-PREREG.json',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT-PREREG.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT-RESULT.json', 'scripts/fundamentals-audit/ttm_holdout_eval.py', 'scripts/fundamentals-audit/ttm_holdout_failures.py',
  'scripts/fundamentals-audit/build_revenue_evidence.py', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-CONSUMER-VIEW-CONTRACTS.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-GROUND-TRUTH.json',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT2-PREREG.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT2-RESULT.json', 'scripts/fundamentals-audit/ttm_holdout3_eval.py', 'scripts/fundamentals-audit/ttm_holdout3_gates.py',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT3-PREREG.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT3-RESULT.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT3-POSTMORTEM.json',
  'scripts/fundamentals-audit/ttm_holdout4_eval.py', 'scripts/fundamentals-audit/ttm_holdout4_gates.py', 'scripts/fundamentals-audit/ttm_period_chain.py', 'scripts/fundamentals-audit/make_fixture.py',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-121-NEIGHBOR-SEARCH.json',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT4-PREREG.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT4-RESULT.json',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-122-NEIGHBOR-SEARCH.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-122-REDTEAM.json',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT5-ELIGIBILITY-SPEC.json', 'scripts/fundamentals-audit/ttm_holdout5_eligibility.py',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT5-EXCLUDE.json', 'scripts/fundamentals-audit/ttm_coverage_report.py', 'scripts/quant/audit_primary_source.py'];
export const TESTS = ['scripts/quant/tests/test_sec_ground_truth_regressions.py', 'scripts/quant/tests/test_sec_ttm_integrity.py', 'scripts/quant/tests/test_normalize_periods.py', 'core/tests/fundamental-cross-consumer.test.mjs',
  'scripts/quant/tests/test_ttm_core_120.py', 'scripts/quant/tests/test_restatements.py', 'scripts/quant/tests/test_fiscal.py',
  'scripts/quant/tests/test_ttm_core_121.py', 'scripts/quant/tests/test_version_discipline.py', 'scripts/quant/tests/test_ttm_core_122.py'];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const group = (list) => { const files = Object.fromEntries(list.map((p) => [p, sha(p)])); return { files, hash: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex') }; };

export function verify(freezePath = FREEZE_PATH) {
  if (!fs.existsSync(freezePath)) return { ok: false, reason: 'NO_FREEZE' };
  const f = JSON.parse(fs.readFileSync(freezePath, 'utf8'));
  const changed = [];
  for (const k of ['code', 'mapping', 'audit', 'tests']) for (const [p, h] of Object.entries(f[k].files)) if (sha(p) !== h) changed.push(p);
  return changed.length ? { ok: false, reason: 'CHANGED', changed } : { ok: true, codeHash: f.code.hash, mappingHash: f.mapping.hash };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) { const r = verify(argv.includes('--freeze') ? FREEZE_PATHS[argv[argv.indexOf('--freeze') + 1]] : FREEZE_PATH); console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1); }
  const commit = argv[argv.indexOf('--commit') + 1];
  const reg = JSON.parse(fs.readFileSync(path.join(root, MAPPING[0]), 'utf8'));
  const ver = fs.readFileSync(path.join(root, 'scripts/quant/sec/version.py'), 'utf8');
  const gt = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-GROUND-TRUTH.json'), 'utf8'));
  const out = {
    schema: 'vu-fundamental-data-freeze-1.0.0', status: argv.includes('--status') ? argv[argv.indexOf('--status') + 1] : 'FROZEN', frozenAt: new Date().toISOString(), commit,
    dataVersion: { normalizationLogic: /NORMALIZATION_LOGIC_VERSION = "([^"]+)"/.exec(ver)[1], registryMapping: reg.mapping_version, consumerSchema: 'vu-consumer-fundamentals-1.0.0 (unveraendert)', label: `vu-fundamentals-core-${/NORMALIZATION_LOGIC_VERSION = "([^"]+)"/.exec(ver)[1]}+registry-${reg.mapping_version}` },
    code: group(CODE), mapping: group(MAPPING), audit: group(AUDIT), tests: group(TESTS),
    supersedes: { file: path.relative(root, PREVIOUS_FREEZE), hash: crypto.createHash('sha256').update(fs.readFileSync(PREVIOUS_FREEZE)).digest('hex'), note: 'fruehere Freezes bleiben unveraendert; der Data-Holdout ist gegen v1 gelaufen' },
    reason: argv.includes('--reason') ? argv[argv.indexOf('--reason') + 1] : null,
    parent: 'v6 (FUNDAMENTAL-DATA-FREEZE-v6.json, Kern 1.21.0, DEVELOPMENT_FREEZE, durch Holdout v4 FAILED_VALIDATION: Accuracy-Gates sauber, Spezialschichten zu klein)',
    policies1220: {
      amendmentPolicy: 'eine Regel fuer alle Wertformulare: Amendment = Formular mit /A (10-K/A, 10-Q/A, 20-F/A, 40-F/A, 10-KT/A, 10-QT/A); jede Fassung gilt ab ihrer Verfuegbarkeit (Annahmezeit, sonst Einreichungstag); AS_OF_LATEST = juengste bis as_of sichtbare Fassung, LATEST_KNOWN = juengste ueberhaupt; Same-Day-Konflikt = AMBIGUOUS (unveraendert 1.20.0); kein rueckwirkender Ersatz',
      valueForms: 'provider.VALUE_FORMS = PERIODIC_FORMS + 10-KT, 10-KT/A, 10-QT, 10-QT/A; Auswahl nur in provider.fundamental_facts; Kalender liest unveraendert CALENDAR_FORMS',
      transitionPeriodPolicy: 'Zelle nach Zeitraum und Kalender, nie nach Formular; Uebergangszeitraeume ohne Kennung bleiben ohne Jahres-/Quartalszelle (TTM darueber nicht verfuegbar); verkuerztes Geschaeftsjahr (>= 330 Tage, direkt nach dem Vorjahresende) behaelt seine Kennung; ein Wert aus einem Uebergangsbericht nur mit dem Zeitraum seiner Zelle (vom Kalender erwartet oder von allen bis dahin verfuegbaren Regelberichten der Zelle einstimmig gemeldet, Beginn und Ende +-7 Tage) und nie in einem vorwaerts fortgeschriebenen Geschaeftsjahr; Deckblattangaben nach der letzten abgeschlossenen Periode; sonst UNPLACEABLE_PERIOD (fehlt, nie falsch)',
      changeDetection: 'latest_filing_signature, filing_index/filing_years und daily.WATCHED_FORMS sehen VALUE_FORMS' },
    redTeam1220: (() => { const r = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-TTM-122-REDTEAM.json'), 'utf8')); return r; })(),
    neighborSearch1220: (() => { const n = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-TTM-122-NEIGHBOR-SEARCH.json'), 'utf8')); return { file: 'artifacts/FUNDAMENTAL-TTM-122-NEIGHBOR-SEARCH.json', transitionReports: n.transitionReports, coreComparison: { issuers: n.coreComparison.issuers, counts: n.coreComparison.counts }, newDefect: n.newDefect }; })(),
    regressionFixtures1220: ['OA', 'EIGHTPOINT3', 'DTHERA', 'SWK', 'MSTMIND', 'SPTN'],
    holdout4: 'FAIL (Kern 1.21.0, ein offizieller Lauf): FALSE_AVAILABLE/WRONG_VALUE/WRONG_CONCEPT/WRONG_PERIOD 0, FALSE_MISSING 11,4 %; Spezialschichten fy_change 3/30, same_day 4/20, stub 7/20, split_year 2/20 nicht pruefbar = formaler FAIL; F-TTM-6 ausserhalb des Holdouts gefunden; v4 validiert 1.22.0 nicht',
    revenueEvidence: (() => { const e = JSON.parse(fs.readFileSync(path.join(root, MAPPING[1]), 'utf8')); return { version: e.version, summary: e.summary, filings: Object.keys(e.decisions).length }; })(),
    ttmDefinition: {
      EPS_TTM: 'Summe von vier GEMELDETEN Dreimonats-EPS (keine Q4-Ableitung), Enden verschieden und 12-17 Wochen auseinander, keine Zelle mit zwei Perioden, Fenster nicht vor dem juengsten veroeffentlichten Geschaeftsjahr, eine Einheit, eine Konzeptklasse (gesamt; fortgefuehrt allein = kein EPS-TTM), eine Aktienbasis (kein Sprung >= 1,5 oder um ein Splitverhaeltnis), EPS konsistent mit Ergebnis/Aktien',
      basicDiluted: 'getrennt: eps_diluted / eps_basic, nie gemischt', fallback: 'nie EPS_FY als TTM; Bundle-Felder eps.ttmDiluted/ttmBasic VERIFIED|NOT_AVAILABLE(+Grund), fy*/latestQuarter* mit Konzeptklasse',
      additive: 'Umsatz/Ergebnis: Konzeptwechsel nur ohne Unterschiedsbeleg oder im gemeinsamen Konzept (ALT)', reconstruction: 'keine EPS_TTM_RECONSTRUCTED (Q4-Ableitung verfehlt das Genauigkeitsziel; Eigentuemer-Option)'},
    revenueAmbiguityPolicy: 'Revenues kleiner als ein anderes Umsatzkonzept derselben Zelle: Beleg der Einreichung entscheidet (TOTAL / OTHER:<Konzept>), sonst leer (AMBIGUOUS > GUESSED)',
    views: { bundle: 'LATEST_RESTATED', ttm: 'CURRENT_TTM', resolver: 'PIT_TTM(as_of) = PeriodResolver.ttm/ttm_ending(as_of)', notInBundle: 'AS_REPORTED_AT_TIME' },
    ttmHoldout: (() => { const r = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-TTM-HOLDOUT3-RESULT.json'), 'utf8')); return { previous: { v1: 'FAILED (Kern 1.16.0)', v2: 'FAIL (Kern 1.19.0)', v3: r.verdict + ' (Kern 1.20.0, unveraendert; Post-mortem FUNDAMENTAL-TTM-HOLDOUT3-POSTMORTEM.json)' }, v3Findings: ['F-TTM-4 Geschaeftsjahreswechsel mit altem Jahresende nur als Vergleichsjahr (8point3, Diamond S)', 'F-TTM-5 geteiltes Predecessor/Successor-Jahr: v3-Wahrheitsfehler; Kern-Defekt derselben Struktur = Jahreskennung (FairPoint)'], note: 'Holdout v3 validiert 1.21.0 nicht; Holdout v4 nach diesem Freeze, genau ein offizieller Lauf' }; })(),
    policies1210: {
      fiscalYearChange: 'Kalender geht EINEN Schritt der Periodenkette eines Jahresberichts zurueck: 12-Monats-Zeitraum direkt (-3..+8 Tage) vor einem anerkannten Jahr = Vorjahr (auch alter Zyklus); kuerzerer Zeitraum 61-329 Tage auf dem Berichtszyklus davor mit vorausgehendem 12-Monats-Jahr = Uebergangszeitraum; nicht der Vergleichszeitraum eines spaeteren Uebergangs, nichts was ein anerkanntes Jahr ueberlappt (ausser dem umgerechneten Zwilling gleichen Endes)',
      transitionReport: '10-KT/10-KT/A speisen nur den Kalender (provider.CALENDAR_FORMS; Werte weiter PERIODIC_FORMS): eigener Zeitraum = juengster Zeitraum direkt nach einem 12-Monats-Jahr des Berichts; dessen Ende und das Ende des Jahres davor sind Jahresenden; kein Kennungsanker',
      reconciliation: 'ein gelerntes Ende teilt nie ein 12-Monats-Jahr, das ein FRUEHER eingereichter Bericht erklaert, und liegt nie im Clustering-Fenster (60 Tage) eines bekannten Endes',
      labels: 'ein Ende ohne Anker, das einen Zeitraum unter 350 Tagen schliesst, bleibt Grenze ohne Kennung (keine Zelle fuer Perioden des Uebergangs), ausser ein >=330-Tage-Zeitraum beginnt direkt nach dem Vorjahresende (verkuerztes Geschaeftsjahr); Anker mit Einreichung > 366 Tage nach dem eigenen Jahresende und Bruch der Kennungskonvention sind Vergleichsjahre; bei mehreren Berichten desselben Jahresendes spricht der zuegigste',
      ttmChain: 'ttm_ending geht ueber die Folge vorhandener Kennungen zurueck; _ttm_window prueft die tatsaechlichen Perioden unveraendert (77-119 Tage, Kette -3..+8, Spanne 357-374)' },
    redTeam1210: (() => { const n = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-TTM-121-NEIGHBOR-SEARCH.json'), 'utf8')); return n.redTeam; })(),
    neighborSearch: (() => { const n = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-TTM-121-NEIGHBOR-SEARCH.json'), 'utf8')); return { file: 'artifacts/FUNDAMENTAL-TTM-121-NEIGHBOR-SEARCH.json', summary: n.summary }; })(),
    regressionFixtures1210: ['EIGHTPOINT3', 'DSSI', 'FRP', 'UNTC', 'COOP', 'OSKCAL', 'ADM', 'VMW', 'DFS', 'DWSN', 'RKFL', 'RNF', 'PCP', 'ISG', 'CLBK', 'BBY', 'MFLX'],
    policies1200: {
      ttmWindow: 'vier Quartale als Kette tatsaechlicher Perioden: je 77-119 Tage, Beginn -3 bis +8 Tage um das Ende des vorigen, zusammen 357-374 Tage; jede Quartalszelle auf ihrem Kalenderslot; ein Fenster mit neuerer sichtbarer Periode derselben Kennzahl ist nicht aktuell (TTM_WINDOW_NOT_CURRENT)',
      fiscalYearChange: 'Geschaeftsjahr ausserhalb 350-380 Tagen = Uebergangsjahr: keine Quartalsslots (NOT_QUARTER_ELIGIBLE), kein Klemmen auf Q4, Jahresbilanz bleibt FY; ein Jahresende nach dem Einreichungsdatum ist kein Geschaeftsjahr',
      stub: 'NORMAL_QUARTER 77-119 Tage; SHORT_STUB < 77, LONG_STUB > 119: NOT_QUARTER_ELIGIBLE; Fensterspanne 357-374 Tage (TTM_STUB_PERIOD)',
      derivation: 'YTD/FY-Differenz nur bei gleichem Beginn (+-8 Tage), nie fuer eine am selben Tag mehrdeutige Zelle; keine Q4-EPS-Ableitung (nicht additiv)',
      sameDay: 'Fassungen zum selben Zeitpunkt mit Wertabweichung > 1e-4 relativ: AMBIGUOUS_SAME_DAY bis zur naechsten eindeutigen Fassung; keine Entscheidung per Formular/Accession; mit Annahmezeit entscheidet die Zeit; kein rueckwirkender Ersatz',
      epsPlausibility: 'ein EPS mit impliziter Aktienzahl < 1.000 ist kein EPS (TTM_EPS_INCONSISTENT)' },
    redTeam1200: { rounds: 3, findingsFixed: ['HIGH-1 Ableitung aus Kumulwerten verschiedenen Beginns (Best Buy, Wendys)', 'HIGH-2 Same-Day-None durch YTD-Ableitung umgangen (Rayonier)', 'HIGH veraltetes TTM als aktuell nach Geschaeftsjahreswechsel (e.l.f., Royal Gold, ADM, Smithfield, Deckers)', 'MEDIUM-1 Kettentoleranz (Vishay, Loews)', 'MEDIUM-2 Zellen ausserhalb des Kalenderslots (161 Emittenten)', 'MEDIUM Jahresende nach Einreichung (Nucor)', 'Jahresbilanz im Uebergangsjahr', 'EPS < 1.000 Aktien (Stanley Black & Decker)'], open: ['MEDIUM-3 canonical.py behaelt die vorige Revision waehrend AMBIGUOUS_SAME_DAY (Golden-Five-Revisionen, nicht TTM)', 'LOW Rundung < 1e-4 per Rang entschieden', 'LOW gemischte Annahme-/Tageszeitstempel', 'LOW unplaced-Perioden mit Tagesdatum statt Annahmezeit', 'vorbestehend: negative abgeleitete Umsatzquartale bei gleichem Beginn (298 Emittenten, restated FY minus altes YTD)'], result: 'kein CRITICAL/HIGH offen (Nachpruefung auf d743d8d)', compare119: 'ttm_ending (jedes 4. Universumsemittent): 92.839 gleich verfuegbar, 0 Wertaenderungen, 0 gewonnen, 325 verloren' },
    consumerContracts: 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-CONSUMER-VIEW-CONTRACTS.json',
    groundTruthCoreV4: gt.coreV4 ? { development: gt.coreV4.development, holdout: gt.coreV4.holdout } : null,
    regressionSuite: { files: TESTS.slice(0, 2), cases: ['E1 TNDM', 'E2 AMT', 'E3 DE', 'E3b CERN', 'E4 REPL', 'E9 CECO', 'E2-R FLS, PESI, AMT, UPST', 'E10 NTRS, NVDA', 'E11 FUBO', 'E12 CSWC', 'TTM PEP, MUR, PIPR, CLIR, CSWC', 'F-TTM-1 VFC', 'Red Team NEOG, WBHC, VFC, HOV, CHDN, VSYS, ESCA, OSK'] },
    groundTruthCoreFinal: gt.coreFinal ? { version: gt.coreFinal.version, devRates: gt.coreFinal.devRates, holdoutRates: gt.coreFinal.holdoutRates, stepEffects: gt.coreFinal.stepEffects } : null,
    groundTruthResult: { label: gt.label, beforeAfterQuant: gt.beforeAfterQuant, quantRatesAfter: Object.fromEntries(Object.entries(gt.rates.byPipelineMetric).filter(([k]) => k.startsWith('QUANT|')).map(([k, v]) => [k, { fact: v.factAccuracy, value: v.valueAccuracy, pit: v.pitAccuracy, falseMissing: v.falseMissingRate, falseAvailable: v.falseAvailableRate, wrong: v.wrongValueRate }])) },
    rule: (argv.includes('--status') ? 'DEVELOPMENT_FREEZE: ' : '') + 'Nach diesem Freeze keine Aenderung an Kern-Code, Mapping, Ground-Truth-Methode oder Gates. Consumer-Impact und Data-Holdout nur gegen diesen Stand. Builds anderer Staende gelten als STALE_BUILD.',
    gitClean: execFileSync('git', ['status', '--porcelain', '--', ...CODE, ...MAPPING, ...TESTS], { cwd: root }).toString().trim() === '',
  };
  fs.writeFileSync(FREEZE_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log('frozen', out.code.hash.slice(0, 12), out.mapping.hash.slice(0, 12), 'clean', out.gitClean);
}
