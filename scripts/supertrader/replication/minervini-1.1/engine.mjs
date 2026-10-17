// Minervini Adaptation 1.1.0 (Phase 2B) – Identitaet, Fidelity und Produktklasse.
// Eigene Version neben 1.0.0 (Phase 2A, eingefroren). Minervini 2.0.0 (live) und 3.0.0 bleiben unveraendert.
// RESEARCH_ONLY: build.mjs (LIVE_ENGINES) importiert die Engine nicht, kein Ledger.
// Fidelity nach der 2B-Methode (fidelity-2b.mjs); der Name ist ein Ergebnis von classify().
import { RULEBOOK, PARAM_TABLE } from './params.mjs';
import { areaGrades, overall, REPORT_AREAS } from './fidelity-2b.mjs';
import { PRODUCT_CLASS, CORE_AREAS } from '../../fidelity/taxonomy.mjs';
import { NAMING } from '../../fidelity/product-classes.mjs';

export const ENGINE_ID = RULEBOOK.engine.id;
export const ENGINE_VERSION = RULEBOOK.engine.version;
export const RESEARCH_ONLY = RULEBOOK.engine.status === 'RESEARCH_ONLY_NOT_LIVE';

export function fidelityByArea(rulebook = RULEBOOK) {
  const fa = rulebook.fidelityAssessment;
  return areaGrades(rulebook.rules, fa.areaMembers, fa.coreRulesForDowngrade);
}
export function reportAreas(rulebook = RULEBOOK) { return areaGrades(rulebook.rules, REPORT_AREAS, rulebook.fidelityAssessment.coreRulesForDowngrade); }

// R15-Hard-Gate wie 2A: REPLICATION nur, wenn alle Kernbereiche und Fundamental HIGH sind und keine
// FOREIGN_RULE/UNRESOLVED-Regel wirkt.
export function classify(rulebook = RULEBOOK) {
  const areas = fidelityByArea(rulebook);
  const coreAreas = [...CORE_AREAS, 'fundamental'];
  const blockingActive = rulebook.rules.filter((r) => r.implementation.status === 'IMPLEMENTED' && ['FOREIGN_RULE', 'UNRESOLVED'].includes(r.provenanceClass)).map((r) => r.id);
  const notHigh = coreAreas.filter((a) => areas[a] !== 'HIGH');
  const replicationClaimAllowed = notHigh.length === 0 && blockingActive.length === 0;
  const all = overall(areas);
  const kind = replicationClaimAllowed ? 'replication' : 'adaptation';
  const canonicalName = `minervini-${kind}-${rulebook.engine.version}`;
  if (!NAMING.pattern.test(canonicalName)) throw new Error(`Name ${canonicalName} verletzt das Benennungsmuster`);
  const displayName = replicationClaimAllowed ? 'Minervini Replication'
    : all === 'HIGH' ? 'VU Adaptation – Minervini (High-Fidelity)'
    : 'VU Adaptation – Minervini Canonical (Research)';
  return { areas, overall: all, replicationClaimAllowed, productClass: replicationClaimAllowed ? PRODUCT_CLASS.REPLICATION : PRODUCT_CLASS.VU_ADAPTATION, canonicalName, displayName, blockingReasons: { coreAreasNotHigh: notHigh, foreignOrUnresolvedActive: blockingActive } };
}

export const CLASSIFICATION = classify();

export default Object.freeze({
  id: ENGINE_ID, version: ENGINE_VERSION, researchOnly: RESEARCH_ONLY, parent: RULEBOOK.engine.parent,
  canonicalName: CLASSIFICATION.canonicalName, displayName: CLASSIFICATION.displayName, productClass: CLASSIFICATION.productClass,
  rulebookVersion: RULEBOOK.rulebookVersion, params: PARAM_TABLE,
});
