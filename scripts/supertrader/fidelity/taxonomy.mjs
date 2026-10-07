// Supertrader R15 – Fidelity-Layer: Begriffe.
//
// Leitprinzip: SOURCE → CANONICAL RULE → FORMALIZATION → CODE → TEST → BACKTEST.
// Keine Regel darf einer Trader-Methode zugeordnet werden, wenn ihre Herkunft nicht nachvollziehbar ist.

// Herkunftsklassen je Regel (R15, Abschnitt "neue harte Architekturregel").
export const PROVENANCE = Object.freeze({
  ORIGINAL: 'ORIGINAL',                                 // 1 – vom Trader selbst, eindeutig
  ORIGINAL_INTERPRETATION: 'ORIGINAL_INTERPRETATION',   // 2 – Original, aber Auslegung nötig
  VU_FORMALIZATION: 'VU_FORMALIZATION',                 // 3 – VU macht eine Originalregel messbar
  VU_OWN: 'VU_OWN',                                     // 4 – eigene VU-Regel ohne Quelle beim Trader
  FOREIGN_RULE: 'FOREIGN_RULE',                         // 5 – Regel aus einer anderen Methode / anderen Quelle
  NOT_PUBLIC: 'NOT_PUBLIC',                             // 6 – nicht öffentlich reproduzierbar
  UNRESOLVED: 'UNRESOLVED',                             // 7 – Herkunft ungeklärt
});
export const PROVENANCE_ORDER = Object.values(PROVENANCE);

// Drei Schichten je Strategie (R15 Abschnitt 12).
export const LAYER = Object.freeze({
  A_CANONICAL: 'A_CANONICAL',                     // Originalregeln, keine Optimierung, keine Fremdregeln
  B_FORMALIZATION: 'B_FORMALIZATION',             // messbare Fassung nicht vollständig algorithmischer Regeln
  C_PORTFOLIO_EXECUTION: 'C_PORTFOLIO_EXECUTION', // Portfolio und Ausführung, je Feld ORIGINAL oder VU_ADAPTATION
});

// Produktklassen (R15 Abschnitt 13).
export const PRODUCT_CLASS = Object.freeze({
  REPLICATION: 'REPLICATION',       // so nahe am Original, wie öffentlich reproduzierbar
  VU_ADAPTATION: 'VU_ADAPTATION',   // Originalmethode mit transparenten VU-Anpassungen
  VU_NATIVE: 'VU_NATIVE',           // eigene Vision-Universe-Strategie
});

export const SEVERITY = Object.freeze({ NONE: 'NONE', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' });
export const FIDELITY = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', UNKNOWN: 'UNKNOWN' });
export const FIDELITY_AREAS = Object.freeze(['entry', 'exit', 'sizing', 'portfolio', 'fundamental', 'marketRegime']);

// Hard Gate (R15 Abschnitt 29): Kernbereiche, die für einen Replication-Claim geklärt und originalnah sein müssen.
export const CORE_AREAS = Object.freeze(['entry', 'exit', 'sizing', 'portfolio', 'risk']);

// Klassen, die in einer REPLICATION nur als offen ausgewiesene Formalisierung vorkommen dürfen.
export const TRADER_ATTRIBUTABLE = new Set([PROVENANCE.ORIGINAL, PROVENANCE.ORIGINAL_INTERPRETATION, PROVENANCE.VU_FORMALIZATION]);
// Klassen, die einen Replication-Claim in einem Kernbereich ausschließen.
export const CLAIM_BLOCKING = new Set([PROVENANCE.FOREIGN_RULE, PROVENANCE.VU_OWN, PROVENANCE.UNRESOLVED]);
