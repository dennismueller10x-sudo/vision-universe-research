// Phase 2B – Fidelity-Methode (gilt gleich fuer die Neubewertung von 2A und fuer den Kandidaten 1.1.0).
//
// 1. Belegstaerke je Quelle (tier), nicht nach Ansehen der Quelle, sondern nach Zugang:
//    PRIMARY_DIRECT   eigener Text Minervinis bzw. Interview im Volltext abgerufen; amtliche Regel (SEC)
//    OWN_POST_INDEX   eigener Beitrag auf X, Text nur ueber den Suchindex (x.com per Egress gesperrt)
//    BOOK_NOT_READ    Buch, nicht im Volltext zugaenglich
//    NOTES            Buch- oder Interviewnotizen Dritter (sekundaer)
//    SECONDARY        Sekundaere Web-Zusammenfassungen
// 2. Obergrenze der Belegstaerke einer Regel (nur Schicht A_CANONICAL; Formalisierungen B/C erben die Elternregel):
//    HIGH   nur mit mindestens einer PRIMARY_DIRECT-Quelle oder zwei unabhaengigen OWN_POST_INDEX-Beitraegen
//    MEDIUM mit einer OWN_POST_INDEX-, BOOK_NOT_READ- oder NOTES-Quelle
//    LOW    nur SECONDARY;  NONE ohne Quelle
//    Modellwissen ist keine Quelle; Sekundaerquellen heben nie auf HIGH.
// 3. Regel-Fidelity = min(Umsetzungs-Fidelity, Belegstaerke). Bereich = niedrigste Fidelity der filternden Regeln,
//    eine Stufe tiefer (nicht unter LOW), wenn eine Kernregel nicht filternd umgesetzt ist; ein Bereich ohne
//    filternde Regel ist NONE (2A setzte hier implizit HIGH - in 2A kam der Fall nicht vor).
export const ORDER = Object.freeze(['NONE', 'LOW', 'MEDIUM', 'HIGH']);
export const TIERS = Object.freeze(['PRIMARY_DIRECT', 'OWN_POST_INDEX', 'BOOK_NOT_READ', 'NOTES', 'SECONDARY']);
export const lower = (a, b) => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);
const down = (a) => ORDER[Math.max(ORDER.indexOf('LOW'), ORDER.indexOf(a) - 1)];

export function sourceCap(rule, sourcesById) {
  if (rule.layer !== 'A_CANONICAL') return 'HIGH';
  const tiers = (rule.sources || []).map((id) => {
    const s = sourcesById.get(id);
    if (!s) throw new Error(`${rule.id}: Quelle ${id} fehlt im Quellenverzeichnis`);
    if (!TIERS.includes(s.tier)) throw new Error(`${id}: tier fehlt oder unbekannt`);
    return s.tier;
  });
  if (!tiers.length) return 'NONE';
  if (tiers.includes('PRIMARY_DIRECT') || tiers.filter((t) => t === 'OWN_POST_INDEX').length >= 2) return 'HIGH';
  if (tiers.some((t) => t !== 'SECONDARY')) return 'MEDIUM';
  return 'LOW';
}

export function scoreRule(rule, sourcesById) {
  // Formalisierungen (B) und Messrahmen (C) tragen keine eigene Minervini-Quelle: Umsetzungs-Fidelity gilt.
  if (rule.layer !== 'A_CANONICAL') return { sourceConfidence: rule.sourceConfidence2A ?? rule.sourceConfidence, fidelity: rule.implementationFidelity, cap: null };
  const cap = sourceCap(rule, sourcesById);
  const sourceConfidence = lower(rule.sourceConfidence2A ?? rule.sourceConfidence, cap);
  return { sourceConfidence, fidelity: lower(rule.implementationFidelity, sourceConfidence), cap };
}

export function areaGrades(rules, areaMembers, coreRules) {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const core = new Set(coreRules);
  const out = {};
  for (const [area, ids] of Object.entries(areaMembers)) {
    let f = null, missingCore = false;
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) throw new Error(`areaGrades: ${id} fehlt`);
      if (r.implementation.status === 'IMPLEMENTED') f = f === null ? r.fidelity : lower(f, r.fidelity);
      else if (core.has(id)) missingCore = true;
    }
    out[area] = f === null ? 'NONE' : missingCore ? down(f) : f;
  }
  return out;
}

export const overall = (areas) => Object.values(areas).reduce((a, b) => lower(a, b), 'HIGH');

// Zehn Berichtsbereiche (Auftrag Phase 2B). Die acht Gate-Bereiche aus 2A bleiben fuer classify() bestehen.
export const REPORT_AREAS = Object.freeze({
  trend: ['MR-TT-01', 'MR-TT-02', 'MR-TT-03', 'MR-TT-04', 'MR-TT-05', 'MR-TT-06', 'MR-TT-07', 'MR-TT-08'],
  fundamental: ['MR-SEPA-00', 'MR-SEPA-01', 'MR-SEPA-02', 'MR-SEPA-03', 'MR-SEPA-04', 'MR-SEPA-05', 'MR-SEPA-06', 'MR-SEPA-07', 'MR-SEPA-08', 'MR-SEPA-09', 'MR-SEPA-10', 'MR-SEPA-11', 'MR-PIT-01'],
  vcp: ['MR-VCP-01', 'MR-VCP-02', 'MR-VCP-03', 'MR-VCP-04', 'MR-VCP-05', 'MR-VCP-06', 'MR-VCP-08'],
  entry: ['MR-ENT-01', 'MR-ENT-02', 'MR-ENT-03', 'MR-ENT-04', 'MR-RE-01'],
  exit: ['MR-EXIT-01', 'MR-EXIT-02', 'MR-EXIT-03', 'MR-EXIT-05', 'MR-EXIT-06', 'MR-EXIT-07'],
  sizing: ['MR-SIZ-01', 'MR-SIZ-02', 'MR-PF-03'],
  portfolio: ['MR-PF-01', 'MR-PF-02', 'MR-PF-04', 'MR-PF-06'],
  risk: ['MR-RSK-01', 'MR-RSK-02', 'MR-RSK-04', 'MR-RSK-05', 'MR-ERN-01'],
  market: ['MR-PF-07'],
  industry: ['MR-SEPA-12'],
});
