// Minervini Canonical Replication Engine (Phase 2A) – Parameter nur aus dem Regelbuch.
//
// HARD GATE "keine versteckten Defaults": Jeder strategiebestimmende Wert kommt aus
// scripts/supertrader/fidelity/MINERVINI-CANONICAL-REPLICATION.json und traegt dort eine
// Rule-ID und eine Herkunftsklasse. Es gibt hier keinen Ersatzwert: Ein fehlender Parameter,
// eine fehlende Herkunft oder ein Tippfehler im Namen wirft MissingProvenanceError.
// Der Code liest Werte ausschliesslich ueber das Proxy-Objekt P (P['size.riskPerTrade']).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RULEBOOK_PATH = path.resolve(here, '../../fidelity/MINERVINI-CANONICAL-REPLICATION.json');
export const PROVENANCE_CLASSES = Object.freeze(['ORIGINAL', 'ORIGINAL_INTERPRETATION', 'VU_FORMALIZATION', 'VU_OWN', 'FOREIGN_RULE', 'NOT_PUBLIC', 'UNRESOLVED']);
// Klassen, die ein strategiebestimmender Parameter dieser Engine tragen darf. FOREIGN_RULE und
// UNRESOLVED sind ausgeschlossen: eine Fremdregel oder eine ungeklaerte Regel darf nicht wirken.
export const ALLOWED_PARAM_PROVENANCE = Object.freeze(['ORIGINAL', 'ORIGINAL_INTERPRETATION', 'VU_FORMALIZATION', 'VU_OWN']);
// VU_OWN ist nur im offen ausgewiesenen Messrahmen (Schicht C) zulaessig.
export const VU_OWN_ALLOWED_LAYER = 'C_PORTFOLIO_EXECUTION';

export class MissingProvenanceError extends Error {
  constructor(msg) { super(msg); this.name = 'MissingProvenanceError'; }
}

export function loadRulebook(file = RULEBOOK_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Baut die Parametertabelle {name: {value, ruleId, provenance, layer, unit}} und prueft die Herkunft.
export function buildParamTable(rulebook) {
  if (!rulebook || !Array.isArray(rulebook.rules)) throw new MissingProvenanceError('Regelbuch ohne rules');
  const table = {};
  for (const rule of rulebook.rules) {
    if (!rule.id) throw new MissingProvenanceError('Regel ohne id');
    const params = rule.formalization?.parameters;
    if (params == null) throw new MissingProvenanceError(`${rule.id}: formalization.parameters fehlt (leeres Objekt verwenden)`);
    for (const [name, spec] of Object.entries(params)) {
      if (table[name]) throw new MissingProvenanceError(`Parameter ${name} doppelt (${table[name].ruleId}, ${rule.id})`);
      if (!spec || !('value' in spec)) throw new MissingProvenanceError(`${rule.id}/${name}: value fehlt`);
      if (!ALLOWED_PARAM_PROVENANCE.includes(spec.provenance)) throw new MissingProvenanceError(`${rule.id}/${name}: Herkunft ${spec.provenance} nicht zulaessig`);
      if (spec.provenance === 'VU_OWN' && rule.layer !== VU_OWN_ALLOWED_LAYER) throw new MissingProvenanceError(`${rule.id}/${name}: VU_OWN nur im Messrahmen (${VU_OWN_ALLOWED_LAYER})`);
      if (!spec.rationale) throw new MissingProvenanceError(`${rule.id}/${name}: Begruendung fehlt`);
      table[name] = Object.freeze({ value: deepFreeze(spec.value), ruleId: rule.id, provenance: spec.provenance, layer: rule.layer, unit: spec.unit || null });
    }
  }
  return Object.freeze(table);
}

function deepFreeze(v) { if (v && typeof v === 'object') { for (const x of Object.values(v)) deepFreeze(x); Object.freeze(v); } return v; }

// Proxy: unbekannter Name -> Fehler statt undefined (kein stiller Default moeglich).
export function paramAccessor(table) {
  return new Proxy(Object.create(null), {
    get(_t, name) {
      if (typeof name === 'symbol') return undefined;
      const entry = Object.prototype.hasOwnProperty.call(table, name) ? table[name] : null;
      if (!entry) throw new MissingProvenanceError(`Parameter ${String(name)} ohne Regelbuch-Eintrag`);
      return entry.value;
    },
    set() { throw new MissingProvenanceError('Parameter sind eingefroren'); },
  });
}

export const RULEBOOK = loadRulebook();
export const PARAM_TABLE = buildParamTable(RULEBOOK);
export const P = paramAccessor(PARAM_TABLE);

// Herkunft eines Parameters (fuer Protokolle und Source-to-Code-Tests).
export function provenanceOf(name, table = PARAM_TABLE) {
  const e = table[name];
  if (!e) throw new MissingProvenanceError(`Parameter ${name} ohne Regelbuch-Eintrag`);
  return { ruleId: e.ruleId, provenance: e.provenance, layer: e.layer };
}
