// Minervini Canonical Replication Engine – Identitaet, Fidelity und Produktklasse.
//
// Eigene ID; Minervini 2.0.0 (live) und 3.0.0 (Forschung) bleiben unveraendert. Die Engine ist
// RESEARCH_ONLY: build.mjs (LIVE_ENGINES) importiert sie nicht, sie schreibt kein Ledger.
// Der Name ist ein ERGEBNIS des Audits: classify() leitet Produktklasse und Anzeigename aus den
// Fidelity-Werten des Regelbuchs ab und wendet den R15-Hard-Gate an.
import { RULEBOOK, PARAM_TABLE } from './params.mjs';
import { PRODUCT_CLASS, CORE_AREAS } from '../../fidelity/taxonomy.mjs';
import { NAMING } from '../../fidelity/product-classes.mjs';

export const ENGINE_ID = RULEBOOK.engine.id;
export const ENGINE_VERSION = RULEBOOK.engine.version;
export const RESEARCH_ONLY = RULEBOOK.engine.status === 'RESEARCH_ONLY_NOT_LIVE';

const ORDER = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
const lower = (a, b) => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);
const down = (a) => ORDER[Math.max(ORDER.indexOf('LOW'), ORDER.indexOf(a) - 1)];

// Methode aus dem Regelbuch (fidelityAssessment.method).
export function fidelityByArea(rulebook = RULEBOOK) {
  const byId = new Map(rulebook.rules.map((r) => [r.id, r]));
  const core = new Set(rulebook.fidelityAssessment.coreRulesForDowngrade);
  const out = {};
  for (const [area, ids] of Object.entries(rulebook.fidelityAssessment.areaMembers)) {
    let f = 'HIGH', missingCore = false;
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) throw new Error(`fidelityByArea: ${id} fehlt im Regelbuch`);
      if (r.implementation.status === 'IMPLEMENTED') f = lower(f, r.fidelity);
      else if (core.has(id)) missingCore = true;
    }
    out[area] = missingCore ? down(f) : f;
  }
  return out;
}

export function overallFidelity(areas) { return Object.values(areas).reduce((a, b) => lower(a, b), 'HIGH'); }

// R15-Hard-Gate: REPLICATION nur, wenn alle Kernbereiche (inkl. Fundamental bei einer Fundamentalmethode) HIGH sind
// und keine FOREIGN_RULE/UNRESOLVED-Regel wirkt.
export function classify(rulebook = RULEBOOK) {
  const areas = fidelityByArea(rulebook);
  const coreAreas = [...CORE_AREAS, 'fundamental'];
  const blockingActive = rulebook.rules.filter((r) => r.implementation.status === 'IMPLEMENTED' && ['FOREIGN_RULE', 'UNRESOLVED'].includes(r.provenanceClass)).map((r) => r.id);
  const notHigh = coreAreas.filter((a) => areas[a] !== 'HIGH');
  const replicationClaimAllowed = notHigh.length === 0 && blockingActive.length === 0;
  const overall = overallFidelity(areas);
  const productClass = replicationClaimAllowed ? PRODUCT_CLASS.REPLICATION : PRODUCT_CLASS.VU_ADAPTATION;
  const kind = replicationClaimAllowed ? 'replication' : 'adaptation';
  const canonicalName = `minervini-${kind}-${ENGINE_VERSION}`;
  if (!NAMING.pattern.test(canonicalName)) throw new Error(`Name ${canonicalName} verletzt das Benennungsmuster`);
  const displayName = replicationClaimAllowed ? 'Minervini Replication'
    : overall === 'HIGH' ? 'VU Adaptation – Minervini (High-Fidelity)'
    : 'VU Adaptation – Minervini Canonical (Research)';
  return { areas, overall, replicationClaimAllowed, productClass, canonicalName, displayName, blockingReasons: { coreAreasNotHigh: notHigh, foreignOrUnresolvedActive: blockingActive } };
}

export const CLASSIFICATION = classify();

export default Object.freeze({
  id: ENGINE_ID, version: ENGINE_VERSION, researchOnly: RESEARCH_ONLY,
  canonicalName: CLASSIFICATION.canonicalName, displayName: CLASSIFICATION.displayName, productClass: CLASSIFICATION.productClass,
  rulebookVersion: RULEBOOK.rulebookVersion, params: PARAM_TABLE,
});
