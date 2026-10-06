#!/usr/bin/env node
// Phase 2B – erzeugt aus dem eingefrorenen 2A-Regelbuch (unveraendert gelesen) und der ausdruecklichen
// Aenderungsliste CHANGES:
//   scripts/supertrader/fidelity/MINERVINI-CANONICAL-REPLICATION-1.1.0.json   (Kandidat 1.1.0)
//   scripts/supertrader/fidelity/MINERVINI-PHASE2B-FIDELITY-DELTA.json        (2A -> 2A neu bewertet -> 2B)
//   scripts/supertrader/fidelity/MINERVINI-PHASE2A-BASELINE.json              (Referenz, nur gelesen aus 2A)
//
//   node scripts/supertrader/replication/minervini-1.1/build-rulebook.mjs --write | --check
//
// Jede Aenderung traegt RULE ID, SOURCE, NEW DATA, OLD, NEW, WHY. Keine Aenderung stammt aus einem Messergebnis:
// Die Liste wurde vor jeder 1.1-Messung festgelegt (Phase-2B-Kandidat, Commit-Historie).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scoreRule, areaGrades, overall, REPORT_AREAS, lower } from './fidelity-2b.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const FID = path.join(root, 'scripts/supertrader/fidelity');
export const RULEBOOK_2A = path.join(FID, 'MINERVINI-CANONICAL-REPLICATION.json');
export const FREEZE_2A = path.join(FID, 'MINERVINI-FIDELITY-FREEZE.json');
export const RULEBOOK_11 = path.join(FID, 'MINERVINI-CANONICAL-REPLICATION-1.1.0.json');
export const DELTA = path.join(FID, 'MINERVINI-PHASE2B-FIDELITY-DELTA.json');
export const BASELINE = path.join(FID, 'MINERVINI-PHASE2A-BASELINE.json');
const rel = (f) => path.relative(root, f);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));

// Zugangsstufe je Quelle (Methode siehe fidelity-2b.mjs).
const TIER = {
  'SRC-BOOK-TLSMW': 'BOOK_NOT_READ', 'SRC-BOOK-TTLAC': 'BOOK_NOT_READ',
  'SRC-NOTES-WHB-2014-05-04': 'NOTES', 'SRC-NOTES-WHB-2014-05-11': 'NOTES', 'SRC-NOTES-TH-2019-07-15': 'NOTES',
  'SRC-INT-STOCKOPEDIA-2018': 'PRIMARY_DIRECT', 'SRC-INT-MARKETWATCH': 'PRIMARY_DIRECT', 'SRC-SEC-FILING-RULES': 'PRIMARY_DIRECT',
  'SRC-SECONDARY-WEB-2026': 'SECONDARY',
};
// Methodenaera je Quelle ausdruecklich (keine Ableitung aus der Jahreszahl im Namen; unbekannte Quelle -> Fehler).
// Buchnotizen tragen die Aera des Buches, nicht das Jahr der Notiz.
const ERA_OF = {
  'SRC-BOOK-TLSMW': 'BOOK_ERA', 'SRC-BOOK-TTLAC': 'BOOK_ERA',
  'SRC-NOTES-WHB-2014-05-04': 'BOOK_ERA', 'SRC-NOTES-TH-2019-07-15': 'BOOK_ERA', 'SRC-NOTES-WHB-2014-05-11': 'BOOK_ERA',
  'SRC-INT-STOCKOPEDIA-2018': 'LATER_PUBLIC', 'SRC-INT-MARKETWATCH': 'BOOK_ERA',
  'SRC-X-2017-10-25': 'LATER_PUBLIC', 'SRC-X-2018-04-24': 'LATER_PUBLIC', 'SRC-X-2021-04-16': 'LATER_PUBLIC', 'SRC-X-2019-07-11': 'LATER_PUBLIC',
  'SRC-X-2021-04-03': 'LATER_PUBLIC', 'SRC-X-2020-10-20': 'LATER_PUBLIC', 'SRC-X-2020-10-21': 'LATER_PUBLIC', 'SRC-X-2021-01-17': 'LATER_PUBLIC',
  'SRC-X-2022-07-18': 'LATER_PUBLIC', 'SRC-X-2022-01-20': 'LATER_PUBLIC',
  'SRC-SECONDARY-WEB-2026': 'SECONDARY_UNDATED', 'SRC-SEC-FILING-RULES': 'REGULATION',
};
const ERA = (s) => { if (!(s.id in ERA_OF)) throw new Error(`Quelle ${s.id} ohne Aera`); return ERA_OF[s.id]; };

export const NEW_SOURCES = [
  { id: 'SRC-X-2022-07-18-EXPOSURE', title: '@markminervini auf X, Status 1549175636983517185 (2022-07-18): Einstieg in den Markt mit 25 % Exposure - fuenf 5-%-Positionen mit 8-%-Stops (Rechenbeispiel progressive Exposure)', type: 'OWN_POST', primary: true, access: 'Text ueber Suchindex 2026-10-06 (Lead geprueft); x.com per Egress gesperrt', tier: 'OWN_POST_INDEX', era: 'LATER_PUBLIC' },
  { id: 'SRC-X-2021-12-RS', title: '@markminervini auf X, Status 1468677355979915265 (2021-12): rund 90 % der Trades mit RS mindestens 89', type: 'OWN_POST', primary: true, access: 'Text ueber Suchindex 2026-10-06 (Worker A)', tier: 'OWN_POST_INDEX', era: 'LATER_PUBLIC' },
  { id: 'SRC-X-2024-EARNINGS', title: '@markminervini auf X, Status 1851690456607752491 (2024): Quartalszahlen nach impliziter Volatilitaet, Polster und Groesse abwaegen', type: 'OWN_POST', primary: true, access: 'Text ueber Suchindex 2026-10-06 (Worker A)', tier: 'OWN_POST_INDEX', era: 'CURRENT_PUBLIC' },
  { id: 'SRC-X-2018-PYRAMID', title: '@markminervini auf X, Status 955847525885468673 (2018): Zukaeufe nur an kaufbaren Pivots, nicht mehr als ein paar Prozent darueber', type: 'OWN_POST', primary: true, access: 'Text ueber Suchindex 2026-10-06 (Worker A)', tier: 'OWN_POST_INDEX', era: 'LATER_PUBLIC' },
  { id: 'SRC-SEC-8K-ITEM202', title: 'SEC Form 8-K, Item 2.02 Results of Operations and Financial Condition (seit 2004-08-23); EDGAR submissions API', type: 'REGULATION', primary: true, access: 'data.sec.gov/submissions abgerufen 2026-10-06', tier: 'PRIMARY_DIRECT', era: 'REGULATION' },
  { id: 'SRC-SEC-HEADER-SIC', title: 'EDGAR Einreichungskopf (<accession>.hdr.sgml), Feld ASSIGNED-SIC - SIC zum Einreichungszeitpunkt', type: 'REGULATION', primary: true, access: 'www.sec.gov/Archives abgerufen 2026-10-06 (z. B. CIK 798354: 7374 in 2020, 7389 in 2026)', tier: 'PRIMARY_DIRECT', era: 'REGULATION' },
];

// Neubewertung der Umsetzungs-Fidelity, die fuer 2A UND 2B gilt (neue Quelle zeigt einen Mangel der 2A-Umsetzung).
export const REASSESS_2A = {
  'MR-PF-02': { implementationFidelity: 'LOW', why: 'Primaerbeitrag SRC-X-2022-07-18-EXPOSURE (in 2A nicht bekannt) nennt fuer die Startphase 25 % Exposure mit 5-%-Positionen; 2A startet mit 50 % und bis zu 25 % je Position - die Umsetzung widerspricht der Konkretisierung.' },
};

// Ausdrueckliche Aenderungsliste Phase 2B -> Kandidat 1.1.0.
export const CHANGES = [
  {
    ruleId: 'MR-PF-02', kind: 'RULE_CHANGE', source: 'SRC-X-2022-07-18-EXPOSURE (primaer, LATER_PUBLIC) konkretisiert SRC-NOTES-WHB-2014-05-04 (25-50 %) am unteren Ende', newData: 'keine',
    old: 'Startphase: Exposure-Obergrenze 50 %, je Position bis 25 % (size.maxPositionPct)', new: 'Startphase: Exposure-Obergrenze 25 %, je Position hoechstens 5 % (pf.initialMaxPositionPct); nach einem Gewinn-Trade volle Stufe 100 % / 25 %, nach einem Verlust-Trade zurueck (Uebergang unveraendert VU_FORMALIZATION)',
    why: 'Primaerbeleg fuer die Zahlen der Startphase; widerspricht der Buchspanne nicht (Konflikt CF-06). Keine Messung beteiligt.',
    apply(r) {
      r.sources = [...r.sources, 'SRC-X-2022-07-18-EXPOSURE'];
      r.canonicalDescription = 'Progressive Exposure: nie von 0 auf 100 %; Einstieg mit Pilotpositionen (Beispiel 2022: 25 % Exposure als fuenf 5-%-Positionen mit 8-%-Stops), erst bei Erfolg erhoehen; laufen die Trades nicht, zurueckfahren.';
      r.formalization.text = 'Diese Regel ist eine VU-Formalisierung einer diskretionaeren Minervini-Regel. Zwei Stufen. Startstufe (zu Beginn und nach jedem verlustbringenden abgeschlossenen Trade): Exposure-Obergrenze initialExposureCeiling und Hoechstgewicht je neuer Position initialMaxPositionPct (Zahlen aus SRC-X-2022-07-18-EXPOSURE). Volle Stufe (nach jedem gewinnbringenden abgeschlossenen Trade): fullExposureCeiling und size.maxPositionPct (MR-SIZ-02). Ergebnis = alle Teilverkaeufe inkl. Kosten und Dividenden. Bestehende Positionen werden nicht zwangsverkauft. Der Wechsel nach einem einzelnen Trade ist VU_FORMALIZATION (Quelle: "erst bei Erfolg erhoehen", ohne Zahl).';
      r.formalization.parameters = {
        'pf.initialExposureCeiling': { value: 0.25, unit: 'fraction_of_equity', provenance: 'ORIGINAL_INTERPRETATION', rationale: "'enter the market with 25% exposure' (SRC-X-2022-07-18-EXPOSURE); Rechenbeispiel, daher Interpretation (gleiche Massgabe wie MR-SIZ-02)" },
        'pf.initialMaxPositionPct': { value: 0.05, unit: 'fraction_of_equity', provenance: 'ORIGINAL_INTERPRETATION', rationale: "'five 5% positions' (SRC-X-2022-07-18-EXPOSURE); Rechenbeispiel, daher Interpretation" },
        'pf.fullExposureCeiling': { value: 1.0, unit: 'fraction_of_equity', provenance: 'VU_FORMALIZATION', rationale: 'voll investiert ohne Margin (MR-PF-04); Zwischenstufen nicht oeffentlich beziffert' },
      };
      r.implementation = { status: 'IMPLEMENTED', module: 'scripts/supertrader/replication/minervini-1.1/portfolio-policy.mjs', function: 'exposureStage' };
      r.test = ['MR11-T-PF-STAGE', 'MR11-T-PF-STAGE-SIM'];
      r.implementationFidelity = 'MEDIUM';
      r.decision = 'Phase 2B: Startstufe nach Primaerbeleg 2022';
    },
  },
  {
    ruleId: 'MR-SIZ-02', kind: 'PROVENANCE_CORRECTION', source: 'Konflikt CF-04: 25 % nur als Rechenbeispiel (SRC-X-2018-04-24) und Interviewnotizen; 50 % nur in Drittzitaten', newData: 'keine',
    old: 'size.maxPositionPct 0,25 als ORIGINAL', new: 'size.maxPositionPct 0,25 als ORIGINAL_INTERPRETATION; gilt in der vollen Stufe (Startstufe: MR-PF-02)',
    why: 'Keine Primaerfundstelle nennt 25 % ausdruecklich als Obergrenze.',
    apply(r) {
      r.provenanceClass = 'ORIGINAL_INTERPRETATION';
      r.formalization.parameters['size.maxPositionPct'] = { ...r.formalization.parameters['size.maxPositionPct'], provenance: 'ORIGINAL_INTERPRETATION', rationale: '25 % aus Interviewnotizen und dem Rechenbeispiel 2018 (25-%-Position mit <= 5 % Stop); keine ausdrueckliche Primaer-Obergrenze' };
      r.formalization.text += ' Phase 2B: gilt in der vollen Stufe; in der Startstufe begrenzt MR-PF-02 auf initialMaxPositionPct.';
    },
  },
  {
    ruleId: 'MR-PF-01', kind: 'PROVENANCE_CORRECTION', source: 'Konflikt CF-05: SRC-X-2020-10-20 nennt "8, 12 or more" (keine Obergrenze)', newData: 'keine',
    old: 'pf.maxPositions 12 als ORIGINAL_INTERPRETATION', new: 'pf.maxPositions 12 als VU_FORMALIZATION',
    why: "'or more' ist keine Obergrenze; 12 ist eine VU-Wahl am oberen Ende der normalen Spanne.",
    apply(r) {
      r.formalization.parameters['pf.maxPositions'] = { ...r.formalization.parameters['pf.maxPositions'], provenance: 'VU_FORMALIZATION', rationale: "obere Grenze der normalen Spanne ('8-10, maybe 12'); Primaerbeitrag 2020 nennt '8, 12 or more' ohne Obergrenze" };
    },
  },
  {
    ruleId: 'MR-SEPA-12', kind: 'DATA_AND_STATUS', source: 'SRC-SEC-HEADER-SIC (Daten); Regel: SRC-NOTES-WHB-2014-05-04', newData: 'SIC point-in-time je Einreichung (data-layer/sec/industry-sic.mjs, Speicher sec-events-sic-1)',
    old: 'NOT_IMPLEMENTED, NOT_REPRODUCIBLE_WITH_CURRENT_DATA (nur heutige SIC)', new: 'RECORDED_ONLY: Rang des Titels in seiner SIC-Gruppe (point-in-time) nach VU-RS und Gruppenstaerke werden je Setup protokolliert, filtern nicht',
    why: "Die Daten sind jetzt point-in-time vorhanden. Kein Filter: Minervinis Branchen (vermutlich IBD-Gruppen) sind nicht oeffentlich abbildbar, SIC ist eine andere Taxonomie, und '4-5 fuehrende Sektoren' ist ohne Sektordefinition. Ein Gate waere eine VU-Taxonomie-Entscheidung mit Wirkung auf die Auswahl (Konflikt CF-12).",
    apply(r) {
      r.sources = [...r.sources, 'SRC-SEC-HEADER-SIC'];
      r.reproducibility = 'RECORDED_OTHER_TAXONOMY';
      r.requiredData = ['Branchenzugehoerigkeit point-in-time', 'RS-Querschnitt'];
      r.availableData = 'sec-events-sic-1 (SIC je Einreichung, point-in-time, privater Eimer); RS-Querschnitt aus loadPitData';
      r.formalization.text = "VU-FORMALISIERUNG, nur protokolliert: Gruppe = SIC-Industriegruppe (3-stellig) zum Stand der letzten Einreichung vor dem Tag; Fallback Hauptgruppe (2-stellig) bei weniger als minMembers Mitgliedern; SPAC/Mantel (6770/6799) ausgeschlossen. Protokolliert: Rang des Titels nach VU-RS-Rangwert in der Gruppe (Top topN = 'Nr. 1-3 der Branche') und Median-RS der Gruppe ohne den Titel. Filtert nicht.";
      r.formalization.parameters = {
        'ind.groupLevel': { value: 3, unit: 'sic_digits', provenance: 'VU_FORMALIZATION', rationale: 'SIC-Industriegruppe; Gruppengroessen (Worker D): 3-stellig Median 7, 4-stellig Median 5' },
        'ind.fallbackLevel': { value: 2, unit: 'sic_digits', provenance: 'VU_FORMALIZATION', rationale: 'Hauptgruppe, wenn die Industriegruppe zu klein ist' },
        'ind.minMembers': { value: 5, unit: 'count', provenance: 'VU_FORMALIZATION', rationale: 'Mindestgroesse fuer einen Rang (Worker D: Untergrenze 5)' },
        'ind.topN': { value: 3, unit: 'rank', provenance: 'ORIGINAL_INTERPRETATION', rationale: "'Nr. 1-3 der Branche' (Buchnotizen)" },
      };
      r.implementation = { status: 'RECORDED_ONLY', module: 'scripts/supertrader/replication/minervini-1.1/industry-record.mjs', function: 'industryRecord' };
      r.test = ['MR11-T-IND-RECORD'];
      r.implementationFidelity = 'LOW';
      r.decision = 'Phase 2B: Daten point-in-time, nur protokolliert';
    },
  },
  {
    ruleId: 'MR-ERN-01', kind: 'DATA_DOCUMENTED', source: 'SRC-SEC-8K-ITEM202; Regel SRC-X-2017-10-25 (kanonisch in Aera 2013-2022), SRC-X-2024-EARNINGS (CURRENT_PUBLIC, nicht uebernommen)', newData: 'Ergebnis-Ereignisse 8-K Item 2.02 point-in-time (data-layer/sec/earnings-events.mjs)',
    old: 'NOT_REPRODUCIBLE: Meldetermin fehlt', new: 'weiter NOT_REPRODUCIBLE: vergangene Termine sind jetzt point-in-time vorhanden, die Regel braucht den NAECHSTEN Termin; den kennen SEC-Daten nicht. Keine Fortschreibung aus Vorjahresterminen (Proxy).',
    why: 'Neue Daten aendern die Reproduzierbarkeit nicht; ehrlich ausgewiesen statt Proxy.',
    apply(r) {
      r.sources = [...r.sources, 'SRC-X-2024-EARNINGS', 'SRC-SEC-8K-ITEM202'];
      r.availableData = 'sec-events-sic-1: vergangene Ergebnismitteilungen (8-K Item 2.02) point-in-time; kuenftige Termine nicht aus SEC-Daten';
      r.formalization.text = 'NOT REPRODUCIBLE WITH CURRENT DATA: die Regel verlangt den kommenden Meldetermin. Vergangene Termine sind point-in-time vorhanden (bekannt ab dem Handelstag nach der Einreichung), kuenftige nicht. Kein Proxy aus dem Vorjahrestermin. Aera: Regel von 2017 kanonisch; Fassung 2024 (implizite Volatilitaet) nicht uebernommen (CF-08).';
    },
  },
  {
    ruleId: 'MR-SEPA-07', kind: 'DATA_DOCUMENTED', source: 'Worker E/B: keine amtliche kostenlose Quelle fuer Erwartungen', newData: 'keine',
    old: 'NOT_REPRODUCIBLE', new: 'NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES', why: 'Konsens und Ueberraschung sind Anbieterdaten; kein Proxy (Kurssprung am Meldetag).',
    apply(r) { r.availableData = 'NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES'; },
  },
  {
    ruleId: 'MR-SEPA-08', kind: 'DATA_DOCUMENTED', source: 'Worker E/B', newData: 'keine',
    old: 'NOT_REPRODUCIBLE', new: 'NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES', why: 'Schaetzungsrevisionen sind Anbieterdaten.',
    apply(r) { r.availableData = 'NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES'; },
  },
  {
    ruleId: 'MR-SEPA-11', kind: 'DATA_DOCUMENTED', source: 'Worker A/C: Minervini beschreibt institutionelle Nachfrage ueber Kurs-Volumen-Akkumulation; 13F-Zaehlung ist O\'Neils "I" (CAN SLIM)', newData: 'keine (13F bewusst nicht gebaut)',
    old: 'NOT_REPRODUCIBLE_WITH_CURRENT_DATA (13F dokumentiert)', new: 'DISCRETIONARY_NOT_FORMALIZED; 13F nicht als Minervini-Regel',
    why: '13F-Daten erst ab 2013Q2 strukturiert, bekannt erst ab Einreichung (bis 45 Tage nach Quartalsende), CUSIP-Zuordnung lizenzpflichtig; vor allem keine Minervini-Fundstelle fuer eine 13F-Regel.',
    apply(r) {
      r.reproducibility = 'DISCRETIONARY_NOT_FORMALIZED';
      r.availableData = '13F nicht gebaut (keine Minervini-Regel; Daten ab 2013Q2, known_from = Einreichung, CUSIP-Lizenz)';
      r.formalization.text = "Nicht formalisiert. Minervinis eigene Texte beschreiben institutionelle Nachfrage als Akkumulation in Kurs und Volumen (Urteil), nicht als 13F-Zaehlung; eine 13F-Regel waere O'Neils 'I' (FOREIGN_RULE).";
    },
  },
];

function buildRulebook(rb2a) {
  const rb = clone(rb2a);
  rb.schema = rb2a.schema;
  rb.rulebookVersion = 'minervini-canonical-replication-1.1.0';
  rb.engine = { id: 'MINERVINI_CANONICAL', version: '1.1.0', status: 'RESEARCH_ONLY_NOT_LIVE', parent: { version: '1.0.0', freeze: rel(FREEZE_2A) } };
  rb.createdAt = '2026-10-06';
  rb.phase = '2B-CANDIDATE';
  rb.methodEra = { id: 'SEPA-PUBLISHED-2013-2022', register: 'scripts/supertrader/fidelity/MINERVINI-SOURCE-CONFLICTS.json', rule: 'Wirkende Parameter duerfen nicht allein auf CURRENT_PUBLIC-Quellen (2023+) beruhen.' };
  rb.classes = { ...rb.classes, reproducibility: { ...rb.classes.reproducibility, RECORDED_OTHER_TAXONOMY: 'Daten point-in-time vorhanden, aber in einer anderen Taxonomie als die Quelle (SIC statt Minervinis Branchen); nur protokolliert, kein Filter.' } };
  rb.sources = [...rb.sources.map((s) => ({ ...s, tier: TIER[s.id] || (s.type === 'OWN_POST' ? 'OWN_POST_INDEX' : null), era: ERA(s) })), ...NEW_SOURCES];
  for (const s of rb.sources) if (!s.tier) throw new Error(`Quelle ${s.id} ohne tier`);
  for (const r of rb.rules) { r.sourceConfidence2A = r.sourceConfidence; r.implementationFidelity = REASSESS_2A[r.id]?.implementationFidelity || r.fidelity; }
  for (const c of CHANGES) {
    const r = rb.rules.find((x) => x.id === c.ruleId);
    if (!r) throw new Error(`Aenderung fuer unbekannte Regel ${c.ruleId}`);
    c.apply(r);
  }
  const byId = new Map(rb.sources.map((s) => [s.id, s]));
  for (const r of rb.rules) { const s = scoreRule(r, byId); r.sourceConfidence = s.sourceConfidence; r.fidelity = s.fidelity; }
  rb.fidelityAssessment = {
    method: 'Phase 2B (scripts/supertrader/replication/minervini-1.1/fidelity-2b.mjs): Belegstaerke nach Zugangsstufe der Quellen begrenzt (HIGH nur mit Primaerquelle im Volltext oder zwei eigenen Beitraegen); Regel-Fidelity = min(Umsetzungs-Fidelity, Belegstaerke); Bereich wie 2A, ohne filternde Regel NONE. Gleich angewendet auf die Neubewertung von 2A.',
    areaMembers: rb2a.fidelityAssessment.areaMembers,
    coreRulesForDowngrade: rb2a.fidelityAssessment.coreRulesForDowngrade,
    reportAreas: REPORT_AREAS,
  };
  rb.fidelityAssessment.areas = areaGrades(rb.rules, rb.fidelityAssessment.areaMembers, rb.fidelityAssessment.coreRulesForDowngrade);
  rb.changes = CHANGES.map(({ apply, ...c }) => c);
  return rb;
}

function rescore2A(rb2a) {
  const rules = clone(rb2a.rules);
  const sources = rb2a.sources.map((s) => ({ ...s, tier: TIER[s.id] || (s.type === 'OWN_POST' ? 'OWN_POST_INDEX' : null) }));
  // Neue Quelle fuer die Neubewertung nur, wo sie einen Mangel der 2A-Umsetzung zeigt (REASSESS_2A).
  const byId = new Map([...sources, ...NEW_SOURCES].map((s) => [s.id, s]));
  for (const r of rules) {
    r.sourceConfidence2A = r.sourceConfidence;
    r.implementationFidelity = REASSESS_2A[r.id]?.implementationFidelity || r.fidelity;
    const s = scoreRule(r, byId); r.sourceConfidence = s.sourceConfidence; r.fidelity = s.fidelity;
  }
  return rules;
}

export function build() {
  const buf2a = fs.readFileSync(RULEBOOK_2A), rb2a = JSON.parse(buf2a);
  const freeze = JSON.parse(fs.readFileSync(FREEZE_2A, 'utf8'));
  const rb11 = buildRulebook(rb2a);
  const r2aRe = rescore2A(rb2a);
  const fa = rb2a.fidelityAssessment;
  const g = (rules, members) => areaGrades(rules, members, fa.coreRulesForDowngrade);
  const asFrozen = g(rb2a.rules, REPORT_AREAS), rescored = g(r2aRe, REPORT_AREAS), cand = g(rb11.rules, REPORT_AREAS);
  const gateAsFrozen = fa.areas, gateRescored = g(r2aRe, fa.areaMembers), gateCand = rb11.fidelityAssessment.areas;
  const ruleRows = rb11.rules.map((r) => {
    const a = rb2a.rules.find((x) => x.id === r.id), b = r2aRe.find((x) => x.id === r.id);
    return { ruleId: r.id, phase2A: { status: a.implementation.status, sourceConfidence: a.sourceConfidence, fidelity: a.fidelity }, phase2ARescored: { sourceConfidence: b.sourceConfidence, fidelity: b.fidelity }, phase2B: { status: r.implementation.status, sourceConfidence: r.sourceConfidence, fidelity: r.fidelity }, changed: a.fidelity !== r.fidelity || a.sourceConfidence !== r.sourceConfidence || a.implementation.status !== r.implementation.status || b.fidelity !== r.fidelity || b.fidelity !== a.fidelity };
  }).filter((x) => x.changed).map(({ changed, ...x }) => x);
  const improvedRules = rb11.rules.filter((r) => { const b = r2aRe.find((x) => x.id === r.id); const O = ['NONE', 'LOW', 'MEDIUM', 'HIGH']; return O.indexOf(r.fidelity) > O.indexOf(b.fidelity) || (b.implementation.status === 'NOT_IMPLEMENTED' && r.implementation.status !== 'NOT_IMPLEMENTED'); }).map((r) => r.id);
  const reason = {
    trend: 'Belegstaerke Trend Template auf MEDIUM begrenzt (Wortlaut nur ueber Buchnotizen; Modellwissen zaehlt nicht). Regeln unveraendert.',
    fundamental: 'Unveraendert; Schaetzungen/Ueberraschungen NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES, 13F keine Minervini-Regel. Margen: Regressionstests ergaenzt, Regel bleibt protokolliert.',
    vcp: 'Unveraendert; keine Primaerzahlen fuer VCP gefunden. Belegstaerke auf MEDIUM begrenzt.',
    entry: 'Unveraendert; Intraday-Volumen am Ausbruch mit Tagesdaten nicht bestaetigbar, keine bezahlte Intraday-Pipeline.',
    exit: 'Unveraendert; Einstand 3R nur Buchaera (CF-09), keine Zahl fuer Verkauf in die Staerke, kein Zeitstop.',
    sizing: 'MR-SIZ-02 Herkunft korrigiert (ORIGINAL_INTERPRETATION); Startstufe begrenzt die Positionsgroesse jetzt auf 5 % (MR-PF-02).',
    portfolio: 'MR-PF-02 Startstufe 25 % / 5 % nach Primaerbeleg 2022 (Regel-Fidelity LOW -> MEDIUM gegen die Neubewertung); Bereich bleibt LOW wegen Margin (MR-PF-04, out of scope).',
    risk: 'Unveraendert; MR-ERN-01 bleibt nicht reproduzierbar (kommender Termin fehlt), vergangene Termine jetzt point-in-time vorhanden.',
    market: 'Unveraendert; kein Indexfilter in der Aera 2013-2022, Marktmodell 2023+ proprietaer (CF-10).',
    industry: 'Daten point-in-time neu (SIC je Einreichung); Regel nur protokolliert, kein Gate (CF-12).',
  };
  const matrix = Object.keys(REPORT_AREAS).map((area) => ({ area, phase2AAsFrozen: asFrozen[area], phase2ARescored: rescored[area], phase2B: cand[area], change: rescored[area] === cand[area] ? 'unveraendert' : `${rescored[area]} -> ${cand[area]}`, reason: reason[area] }));
  const delta = {
    schema: 'vu-minervini-phase2b-fidelity-delta-1.0.0', createdAt: '2026-10-06',
    parent: { freeze: rel(FREEZE_2A), commit: freeze.commit, rulebookHash: freeze.rulebookHash, codeHash: freeze.codeHash, name: freeze.classification.canonicalName },
    candidate: { rulebook: rel(RULEBOOK_11), version: rb11.engine.version },
    method: rb11.fidelityAssessment.method,
    note: 'phase2AAsFrozen = Werte des eingefrorenen 2A-Regelbuchs, in die zehn Berichtsbereiche umgelegt (Industrie in 2A: kein filternder Inhalt -> NONE). phase2ARescored = 2A nach der 2B-Methode. Der faire Vergleich ist phase2ARescored -> phase2B.',
    areas: matrix,
    gateAreas: { phase2AAsFrozen: gateAsFrozen, phase2ARescored: gateRescored, phase2B: gateCand, overall: { phase2AAsFrozen: overall(gateAsFrozen), phase2ARescored: overall(gateRescored), phase2B: overall(gateCand) } },
    rules: ruleRows,
    changes: rb11.changes,
    hardQuestion: {
      question: 'Hat Phase 2B die Fidelity tatsaechlich erhoeht?',
      improvedRulesVsRescored2A: improvedRules,
      areaGradesImproved: Object.keys(REPORT_AREAS).filter((a) => { const O = ['NONE', 'LOW', 'MEDIUM', 'HIGH']; return O.indexOf(cand[a]) > O.indexOf(rescored[a]); }),
      circularityNote: 'MR-PF-02 hatte im eingefrorenen 2A die Umsetzungs-Fidelity MEDIUM. Die Neubewertung senkt sie mit der in 2B gefundenen Quelle auf LOW, 1.1 hebt sie wieder auf MEDIUM. Gegen 2A wie eingefroren ist MR-PF-02 also unveraendert MEDIUM; die Verbesserung besteht darin, dass die Umsetzung der Primaerquelle nicht mehr widerspricht. Der Sprung von 25 % auf 100 % nach einem Gewinn-Trade bleibt eine grobe VU-Formalisierung.',
      answer: 'Ja, aber nur auf Regelebene: MR-PF-02 setzt jetzt die primaer belegten Zahlen der Startphase um (LOW -> MEDIUM) und MR-SEPA-12 wird point-in-time protokolliert statt fehlend. Keine Bereichsnote steigt (Portfolio bleibt wegen Margin LOW, Fundamental wegen Schaetzungen LOW). Die Gesamtnote bleibt LOW. Die 2A-Noten waren teils zu hoch (Belegstaerke), das zeigt die Neubewertung.',
      newVersionJustified: 'ja: eine quellengetriebene Regelaenderung mit Wirkung (MR-PF-02), nicht nur zusaetzliche Daten',
    },
  };
  const baseline = {
    schema: 'vu-minervini-phase2a-baseline-1.0.0', createdAt: '2026-10-06',
    statement: 'PHASE2A_BASELINE: Phase 2A ist eingefroren und bleibt die historische Referenz. Phase 2B aendert keine 2A-Datei; ein besserer Stand bekommt eine neue Version (1.1.0) mit eigenem Freeze.',
    freeze: { path: rel(FREEZE_2A), sha256: sha(fs.readFileSync(FREEZE_2A)), status: freeze.status, commit: freeze.commit, rulebookHash: freeze.rulebookHash, codeHash: freeze.codeHash, frozenAt: freeze.frozenAt },
    rulebook: { path: rel(RULEBOOK_2A), sha256: sha(buf2a), version: rb2a.rulebookVersion, rules: rb2a.rules.length, parameters: rb2a.rules.reduce((n, r) => n + Object.keys(r.formalization.parameters).length, 0) },
    classification: freeze.classification,
    areasAsFrozen: fa.areas,
    measurement: { report: 'docs/SUPERTRADER_MINERVINI_REPLICATION_PHASE2.md', dev: { run: 37461915341, segments: 9048, signals: 2075, portfolioTrades: 650, cagrVsSpy: 'darunter', maxDrawdownVsSpy: 'kleiner' }, holdout: { run: 37461929479, segments: 5218, signals: 937, portfolioTrades: 229, cagrVsSpy: 'darunter', maxDrawdownVsSpy: 'kleiner' }, dataStatus: 'DEV und HOLDOUT sind GESEHENE DATEN' },
    guard: 'Test MR-T-FREEZE (2A) und MR11-T-BASELINE pruefen, dass Freeze, Regelbuch und Code von 2A byte-gleich bleiben.',
  };
  return { rb11, delta, baseline };
}

const fmt = (o) => JSON.stringify(o, null, 2) + '\n';
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { rb11, delta, baseline } = build();
  const files = [[RULEBOOK_11, rb11], [DELTA, delta], [BASELINE, baseline]];
  if (process.argv.includes('--write')) { for (const [f, o] of files) fs.writeFileSync(f, fmt(o)); console.log('geschrieben:', files.map(([f]) => rel(f)).join(', ')); }
  else {
    let ok = true;
    for (const [f, o] of files) if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== fmt(o)) { console.error('veraltet:', rel(f)); ok = false; }
    if (!ok) process.exit(1);
    console.log('ok');
  }
}
