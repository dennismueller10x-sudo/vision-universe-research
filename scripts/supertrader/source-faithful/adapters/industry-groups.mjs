/**
 * Historische Branchenklassifikation (PIT-SIC) -> Turtle- und Weinstein-Eingaben. Research-Code, keine Aktivierung.
 *
 * Quelle: core/industry-classification.js auf quant/data/sec/sic-history (SIC zum Einreichungszeitpunkt, knownAt).
 * Dieser Adapter veraendert keine Engine. Er baut nur die Funktionen, die die Engines schon annehmen:
 *  - Turtle: groupsOf(securityId, priorSessionDate) -> { closely, loosely } | null (methods/turtle.mjs).
 *  - Weinstein: Gruppenzugehoerigkeit zum Zeitpunkt; Gruppen-Stage bleibt DATA_BLOCKED (kein Gruppenchart).
 *
 * Was NICHT hier entschieden wird (docs/SUPERTRADER_2_INDUSTRY_GROUP_DECISIONS.md):
 *  - TUR-LIMIT6 / TUR-LIMIT10 bestimmen ihre Gruppen nur durch Futures-Beispiele (W-TUR, gedruckt S. 16); die Quelle
 *    nennt weder Mass noch Fenster noch Schwelle. Eine SIC-Ebene ist ein Stellvertreter, keine Korrelation, und vom
 *    Owner nicht freigegeben.
 *  - wie lange eine SIC-Beobachtung fortgeschrieben werden darf (maxAgeDays, deklarierte Annahme);
 *  - welche Identitaetsbelege genuegen (acceptedIdentityEvidence);
 *  - welche Ebene Weinsteins "Gruppe" ist.
 * Ohne diese Entscheidung wirft der Adapter MODEL_ASSUMPTION_REQUIRED. Es gibt keine Voreinstellung.
 *
 * Identitaet: securityId -> CIK nur ueber die Snapshot-Zuordnung (validation/sec-pit.mjs), begrenzt auf das Fenster
 * des Segments und gekennzeichnet nach ihrer Herkunft (IDENTITY_EVIDENCE). Eine heutige Ticker-Zuordnung zaehlt nie
 * still als historische Bestaetigung: sie wird nur verwendet, wenn die Entscheidung genau diese Klasse annimmt.
 *
 * Fehlende Gruppe heisst UNBEKANNT, nicht unabhaengig. Die Engine begrenzt eine Aktie ohne Gruppe nur durch LIMIT4 /
 * LIMIT12; conformance() sagt das in jedem Lauf und behauptet nie Regelkonformitaet.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const IC = require('../../../../core/industry-classification.js');

export const ADAPTER_VERSION = 'sf-industry-groups-1.1.0';
export const LEVELS = ['industry', 'industryGroup', 'majorGroup']; // 4-, 3-, 2-stellig; fein -> grob
const PREFIX = { industry: 'SIC4', industryGroup: 'SIC3', majorGroup: 'SIC2' };

/**
 * Herkunft einer CIK je Snapshot-Listing (validation/sec-pit.mjs, Feld `how`):
 *  - KNOWN      -> CURRENT_TICKER_MAPPING: heutige Ticker->CIK-Liste (company-names.json), ohne Fensterpruefung.
 *  - NAME_MATCH -> NAME_EXACT_XBRL_IN_LISTING_WINDOW: exakter normierter Name aus cik-lookup-data.txt, genau ein
 *                  Kandidat mit XBRL-Werten im Listing-Fenster.
 *  - sonst      -> UNSPECIFIED (z. B. seg.fund.cik ohne `how`).
 */
export const IDENTITY_EVIDENCE = Object.freeze({
  CURRENT_TICKER_MAPPING: 'CURRENT_TICKER_MAPPING',
  NAME_EXACT_XBRL_IN_LISTING_WINDOW: 'NAME_EXACT_XBRL_IN_LISTING_WINDOW',
  UNSPECIFIED: 'UNSPECIFIED',
});
const EVIDENCE_OF_HOW = { KNOWN: IDENTITY_EVIDENCE.CURRENT_TICKER_MAPPING, NAME_MATCH: IDENTITY_EVIDENCE.NAME_EXACT_XBRL_IN_LISTING_WINDOW };

/** Stand der Bindung, solange keine Owner-Entscheidung vorliegt. Aendert keine Registry. */
export const BINDING_STATUS = Object.freeze({
  'TUR-SF-LIMIT-CORR': {
    status: 'DATA_BLOCKED',
    dataFoundation: 'PIT_SIC_AVAILABLE',
    blockedBy: ['SOURCE_DEFINES_GROUPS_BY_FUTURES_EXAMPLES_ONLY', 'NO_SOURCE_CORRELATION_MEASURE_WINDOW_OR_THRESHOLD', 'OWNER_DECISION_PENDING'],
    note: 'W-TUR S. 16: "closely correlated markets include: heating oil and crude oil; gold and silver; Swiss franc and Deutschmark; TBill and Eurodollar, etc." - eine SIC-Ebene oder eine Kurskorrelation mit gewaehltem Fenster und gewaehlter Schwelle waere eine Modellannahme ohne Quellenzahl',
  },
  'WEIN-SF-GROUP': {
    status: 'DATA_BLOCKED',
    dataFoundation: 'PIT_SIC_MEMBERSHIP_AVAILABLE',
    blockedBy: ['OWNER_DECISION_GROUP_LEVEL', 'GROUP_CHART_CONSTRUCTION'],
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
    throw new ModelAssumptionRequired('decision.maxAgeDays fehlt: bis zu welchem Alter darf die letzte SIC-Beobachtung fortgeschrieben werden?');
  }
  const ev = decision.acceptedIdentityEvidence;
  if (!Array.isArray(ev) || !ev.length || ev.some((e) => !Object.values(IDENTITY_EVIDENCE).includes(e))) {
    throw new ModelAssumptionRequired('decision.acceptedIdentityEvidence fehlt: welche Identitaetsbelege (IDENTITY_EVIDENCE) gelten?');
  }
}

/**
 * Snapshot-Segmente -> CIK-Kandidaten je securityId, begrenzt auf das Segmentfenster.
 * secPit (optional): { [listingId]: { cik, how } } aus validation/sec-pit.mjs - nur damit ist die Herkunft bekannt.
 * Ohne secPit gilt seg.fund.cik als UNSPECIFIED. Ein Segment ohne CIK bekommt keinen Eintrag (NO_CIK).
 */
export function cikCandidatesFromSegments(segs, secPit = null) {
  const out = new Map();
  for (const seg of segs || []) {
    const listingId = String(seg.id).split('#')[0];
    const pit = secPit ? secPit[listingId] : null;
    const cik = pit?.cik || seg?.fund?.cik;
    if (!cik) continue;
    const evidence = (pit && EVIDENCE_OF_HOW[pit.how]) || IDENTITY_EVIDENCE.UNSPECIFIED;
    const raw = seg.raw || seg.bars || [];
    const list = out.get(seg.id) || [];
    list.push({ cik, evidence, validFrom: raw[0]?.date ?? null, validTo: raw.at(-1)?.date ?? null });
    out.set(seg.id, list);
  }
  return out;
}

function classifier({ classification, cikCandidates, decision }) {
  const accepted = new Set(decision.acceptedIdentityEvidence);
  const counts = { lookups: 0, resolved: 0 };
  const reasons = {}, byEvidence = {};
  const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
  function classify(id, date) {
    counts.lookups++;
    const all = cikCandidates.get(id) || [];
    const usable = all.filter((c) => accepted.has(c.evidence));
    if (all.length && !usable.length) { bump(reasons, 'IDENTITY_EVIDENCE_NOT_ACCEPTED'); return null; }
    const who = IC.resolveIssuer(usable, date);
    if (who.status !== 'RESOLVED') { bump(reasons, 'IDENTITY_' + who.reason); return null; }
    const r = classification.getIndustryClassification(who.cik, date, { maxAgeDays: decision.maxAgeDays, assumptionRef: decision.ref });
    if (!r.carryForward || !r.carryForward.declared) { bump(reasons, 'CARRY_FORWARD_NOT_DECLARED'); return null; }
    if (r.status !== IC.STATUS.OBSERVED) { bump(reasons, r.status); return null; }
    counts.resolved++;
    bump(byEvidence, who.evidence || IDENTITY_EVIDENCE.UNSPECIFIED);
    return { cik: who.cik, sic: r.sic, levels: r.levels, knownAt: r.knownAt, ageDays: r.ageDays, accession: r.observation.accession };
  }
  function diagnostics() {
    const unknown = counts.lookups - counts.resolved;
    return {
      adapter: ADAPTER_VERSION,
      decision: decision.ref,
      ...counts,
      unknown,
      missingByReason: { ...reasons },
      resolvedByIdentityEvidence: { ...byEvidence },
      carryForwardAssumption: `letzte SIC-Beobachtung gilt hoechstens ${decision.maxAgeDays} Tage fort (INFERRED_INTERVAL, Annahme ${decision.ref}); aelter = STALE = unbekannt`,
      missingGroupMeaning: 'UNKNOWN_NOT_INDEPENDENT',
    };
  }
  return { classify, diagnostics };
}

/**
 * Turtle: groupsOf fuer runTurtle({ groupsOf }). decision = { ref, basis: 'SIC_PROXY', closely, loosely, maxAgeDays,
 * acceptedIdentityEvidence }. closely muss gleich fein oder feiner sein als loosely.
 * Unbekannte Zustaende liefern null; conformance(runResult) kennzeichnet den Lauf.
 */
export function makeTurtleGroupsOf({ classification, cikCandidates, decision }) {
  requireDecision(decision, ['basis', 'SIC-Ebene fuer TUR-LIMIT6 (closely)', 'SIC-Ebene fuer TUR-LIMIT10 (loosely)', 'maxAgeDays', 'acceptedIdentityEvidence']);
  if (decision.basis !== 'SIC_PROXY') throw new ModelAssumptionRequired('decision.basis muss SIC_PROXY sein (andere Gruppenbegriffe hat dieser Adapter nicht)');
  const ci = LEVELS.indexOf(decision.closely), li = LEVELS.indexOf(decision.loosely);
  if (ci < 0 || li < 0) throw new ModelAssumptionRequired(`unbekannte SIC-Ebene: ${decision.closely} / ${decision.loosely}`);
  if (ci > li) throw new RangeError('closely muss gleich fein oder feiner sein als loosely');
  const c = classifier({ classification, cikCandidates, decision });
  const cache = new Map();
  function groupsOf(id, date) {
    const key = id + '|' + date;
    if (cache.has(key)) return cache.get(key);
    const hit = c.classify(id, date);
    const g = hit ? { closely: `${PREFIX[decision.closely]}:${hit.levels[decision.closely]}`, loosely: `${PREFIX[decision.loosely]}:${hit.levels[decision.loosely]}` } : null;
    cache.set(key, g);
    return g;
  }
  /**
   * Kennzeichnung eines runTurtle-Ergebnisses. Nie "konform": die Gruppen sind ein SIC-Stellvertreter, und eine
   * Aktie ohne Gruppe war nur durch LIMIT4 / LIMIT12 begrenzt.
   */
  function conformance(runResult) {
    const d = c.diagnostics();
    const missing = runResult?.counts?.correlationGroupMissing ?? null;
    return {
      rules: ['TUR-LIMIT6', 'TUR-LIMIT10'],
      engineLabel: runResult?.correlationLimits ?? null,
      ruleConformance: 'NOT_ESTABLISHED',
      reasons: [
        'GROUPS_ARE_SIC_PROXY_NOT_SOURCE_CORRELATION',
        ...(missing ? ['UNKNOWN_GROUPS_LIMITED_ONLY_BY_LIMIT4_LIMIT12'] : []),
        ...(d.unknown ? ['UNKNOWN_GROUP_IS_NOT_PROVEN_INDEPENDENCE'] : []),
      ],
      entriesWithUnknownGroup: missing,
      diagnostics: d,
    };
  }
  return { groupsOf, diagnostics: c.diagnostics, conformance };
}

/**
 * Weinstein: Gruppenzugehoerigkeit zum Zeitpunkt (nur Zugehoerigkeit). decision = { ref, level, maxAgeDays,
 * acceptedIdentityEvidence }. rosterAt(ids, date) -> { groups, unknown, groupStage: 'DATA_BLOCKED' }.
 * Die Stage einer Gruppe wird hier NICHT berechnet (docs/SUPERTRADER_2_INDUSTRY_GROUP_DECISIONS.md).
 */
export function makeWeinsteinGroupMembership({ classification, cikCandidates, decision }) {
  requireDecision(decision, ['SIC-Ebene fuer Weinsteins Gruppe', 'maxAgeDays', 'acceptedIdentityEvidence']);
  if (!LEVELS.includes(decision.level)) throw new ModelAssumptionRequired(`unbekannte SIC-Ebene: ${decision.level}`);
  const c = classifier({ classification, cikCandidates, decision });
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
    return { date, groups, unknown, unknownMeaning: 'UNKNOWN_NOT_INDEPENDENT', groupStage: 'DATA_BLOCKED' };
  }
  return { groupOf, rosterAt, diagnostics: c.diagnostics };
}
