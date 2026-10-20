/**
 * Historische Branchenklassifikation (PIT-SIC) -> Turtle- und Weinstein-Eingaben. Research-Code, keine Aktivierung.
 *
 * Quelle: core/industry-classification.js auf quant/data/sec/sic-history (SIC zum Einreichungszeitpunkt, knownAt).
 * Dieser Adapter veraendert keine Engine. Er baut nur die Funktionen, die die Engines schon annehmen:
 *  - Turtle: groupsOf(securityId, priorSessionDate) -> { closely, loosely } | null (methods/turtle.mjs).
 *  - Weinstein: Gruppenzugehoerigkeit zum Zeitpunkt; Gruppen-Stage bleibt DATA_BLOCKED (kein Gruppenchart).
 *
 * Was NICHT hier entschieden wird (Owner, docs/SUPERTRADER_2_PIT_INDUSTRY_GROUPS_CONTRACT.md):
 *  - welche SIC-Ebene "eng" und welche "lose korreliert" heisst (TUR-LIMIT6 / TUR-LIMIT10 sprechen von Futures-Gruppen;
 *    eine SIC-Ebene ist keine gemessene Kurskorrelation);
 *  - wie alt eine Beobachtung hoechstens sein darf (maxAgeDays);
 *  - welche Ebene Weinsteins "Gruppe" ist.
 * Ohne diese Entscheidung wirft der Adapter MODEL_ASSUMPTION_REQUIRED. Es gibt keine Voreinstellung.
 *
 * Identitaet: securityId -> CIK nur ueber die Snapshot-Zuordnung (seg.fund.cik aus validation/sec-pit.mjs, mit
 * Listing-Fenster-Pruefung), begrenzt auf das Fenster des Segments. Kein Ticker-, kein Namensabgleich.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const IC = require('../../../../core/industry-classification.js');

export const ADAPTER_VERSION = 'sf-industry-groups-1.0.0';
export const LEVELS = ['industry', 'industryGroup', 'majorGroup']; // 4-, 3-, 2-stellig; fein -> grob
const PREFIX = { industry: 'SIC4', industryGroup: 'SIC3', majorGroup: 'SIC2' };

/** Stand der Bindung, solange keine Owner-Entscheidung vorliegt. Aendert keine Registry. */
export const BINDING_STATUS = Object.freeze({
  'TUR-SF-LIMIT-CORR': {
    status: 'DATA_BLOCKED',
    dataFoundation: 'PIT_SIC_AVAILABLE',
    blockedBy: ['OWNER_DECISION_SIC_LEVEL_FOR_CLOSELY_LOOSELY', 'OWNER_DECISION_MAX_OBSERVATION_AGE'],
    note: 'SIC-Gleichheit ist keine belegte Kurskorrelation; die Abbildung auf eng/lose ist eine Modellannahme ohne Quellenzahl',
  },
  'WEIN-SF-GROUP': {
    status: 'DATA_BLOCKED',
    dataFoundation: 'PIT_SIC_MEMBERSHIP_AVAILABLE',
    blockedBy: ['OWNER_DECISION_SIC_LEVEL_FOR_GROUP', 'GROUP_CHART_CONSTRUCTION (Gewichtung, Mitgliederwechsel, Mindestzahl)'],
    note: 'Zugehoerigkeit allein beweist keine Gruppenstaerke; WEIN-GROUP verlangt die Stage des Gruppencharts',
  },
});

class ModelAssumptionRequired extends Error {
  constructor(message) { super(message); this.code = 'MODEL_ASSUMPTION_REQUIRED'; }
}

function requireDecision(decision, needs) {
  if (!decision || typeof decision.ref !== 'string' || !decision.ref.trim()) {
    throw new ModelAssumptionRequired('Owner-Entscheidung fehlt (decision.ref): ' + needs.join(', '));
  }
  if (!Number.isFinite(decision.maxAgeDays) || decision.maxAgeDays <= 0) {
    throw new ModelAssumptionRequired('decision.maxAgeDays fehlt: wie alt darf die letzte SIC-Beobachtung sein?');
  }
}

/**
 * Snapshot-Segmente -> CIK-Kandidaten je securityId. Ein Segment ohne seg.fund.cik bekommt keinen Eintrag (NO_CIK).
 * Fenster = erste bis letzte Sitzung des Segments: nur dafuer hat sec-pit.mjs die Zuordnung geprueft.
 */
export function cikCandidatesFromSegments(segs) {
  const out = new Map();
  for (const seg of segs || []) {
    const cik = seg?.fund?.cik;
    if (!cik) continue;
    const raw = seg.raw || seg.bars || [];
    const list = out.get(seg.id) || [];
    list.push({ cik, evidence: 'SNAPSHOT_SEC_PIT_LISTING_MATCH', validFrom: raw[0]?.date ?? null, validTo: raw.at(-1)?.date ?? null });
    out.set(seg.id, list);
  }
  return out;
}

function classifier({ classification, cikCandidates, level, maxAgeDays }) {
  const counts = { lookups: 0, resolved: 0 };
  const reasons = {};
  const bump = (k) => { reasons[k] = (reasons[k] || 0) + 1; };
  function classify(id, date) {
    counts.lookups++;
    const who = IC.resolveIssuer(cikCandidates.get(id) || [], date);
    if (who.status !== 'RESOLVED') { bump('IDENTITY_' + who.reason); return null; }
    const r = classification.getIndustryClassification(who.cik, date, { maxAgeDays });
    if (r.status !== IC.STATUS.OBSERVED) { bump(r.status); return null; }
    counts.resolved++;
    return { cik: who.cik, sic: r.sic, levels: r.levels, knownAt: r.knownAt, accession: r.observation.accession };
  }
  return { classify, diagnostics: () => ({ ...counts, missingByReason: { ...reasons } }) };
}

/**
 * Turtle: groupsOf fuer runTurtle({ groupsOf }). decision = { ref, closely, loosely, maxAgeDays }.
 * closely muss gleich fein oder feiner sein als loosely (eine enge Gruppe liegt in ihrer losen Gruppe).
 * Unbekannte Zustaende liefern null; die Engine zaehlt sie (correlationGroupMissing) und meldet dann
 * ENFORCED_PARTIAL_GROUP_COVERAGE, der Adapter zaehlt den Grund (diagnostics).
 */
export function makeTurtleGroupsOf({ classification, cikCandidates, decision }) {
  requireDecision(decision, ['SIC-Ebene fuer TUR-LIMIT6 (closely)', 'SIC-Ebene fuer TUR-LIMIT10 (loosely)', 'maxAgeDays']);
  const ci = LEVELS.indexOf(decision.closely), li = LEVELS.indexOf(decision.loosely);
  if (ci < 0 || li < 0) throw new ModelAssumptionRequired(`unbekannte SIC-Ebene: ${decision.closely} / ${decision.loosely}`);
  if (ci > li) throw new RangeError('closely muss gleich fein oder feiner sein als loosely');
  const c = classifier({ classification, cikCandidates, level: decision.closely, maxAgeDays: decision.maxAgeDays });
  const cache = new Map();
  function groupsOf(id, date) {
    const key = id + '|' + date;
    if (cache.has(key)) return cache.get(key);
    const hit = c.classify(id, date);
    const g = hit ? { closely: `${PREFIX[decision.closely]}:${hit.levels[decision.closely]}`, loosely: `${PREFIX[decision.loosely]}:${hit.levels[decision.loosely]}` } : null;
    cache.set(key, g);
    return g;
  }
  return { groupsOf, diagnostics: () => ({ adapter: ADAPTER_VERSION, decision: decision.ref, ...c.diagnostics() }) };
}

/**
 * Weinstein: Gruppenzugehoerigkeit zum Zeitpunkt (nur Zugehoerigkeit). decision = { ref, level, maxAgeDays }.
 * rosterAt(ids, date) -> { groups: { key: [ids] }, unknown: [ids] } - die Grundlage eines spaeteren Gruppencharts.
 * Die Stage einer Gruppe wird hier NICHT berechnet (Konstruktion des Gruppencharts ist offen).
 */
export function makeWeinsteinGroupMembership({ classification, cikCandidates, decision }) {
  requireDecision(decision, ['SIC-Ebene fuer Weinsteins Gruppe', 'maxAgeDays']);
  if (!LEVELS.includes(decision.level)) throw new ModelAssumptionRequired(`unbekannte SIC-Ebene: ${decision.level}`);
  const c = classifier({ classification, cikCandidates, level: decision.level, maxAgeDays: decision.maxAgeDays });
  function groupOf(id, date) {
    const hit = c.classify(id, date);
    return hit ? `${PREFIX[decision.level]}:${hit.levels[decision.level]}` : null;
  }
  function rosterAt(ids, date) {
    const groups = {}, unknown = [];
    for (const id of ids) {
      const g = groupOf(id, date);
      if (g) (groups[g] ||= []).push(id); else unknown.push(id);
    }
    return { date, groups, unknown, groupStage: 'DATA_BLOCKED' };
  }
  return { groupOf, rosterAt, diagnostics: () => ({ adapter: ADAPTER_VERSION, decision: decision.ref, ...c.diagnostics() }) };
}
