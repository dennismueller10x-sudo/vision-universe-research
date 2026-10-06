// Minervini Adaptation 1.1.0 (Phase 2B) – Parameter nur aus dem 1.1.0-Regelbuch.
// Gleiche Pruefung wie 2A (buildParamTable/paramAccessor aus dem eingefrorenen 2A-Modul, unveraendert):
// jeder Wert mit Rule-ID und Herkunft, unbekannter Name -> MissingProvenanceError.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRulebook, buildParamTable, paramAccessor, MissingProvenanceError } from '../minervini/params.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RULEBOOK_PATH = path.resolve(here, '../../fidelity/MINERVINI-CANONICAL-REPLICATION-1.1.0.json');
export const RULEBOOK = loadRulebook(RULEBOOK_PATH);
export const PARAM_TABLE = buildParamTable(RULEBOOK);
export const P = paramAccessor(PARAM_TABLE);
export { MissingProvenanceError };

export function provenanceOf(name, table = PARAM_TABLE) {
  const e = table[name];
  if (!e) throw new MissingProvenanceError(`Parameter ${name} ohne Regelbuch-Eintrag`);
  return { ruleId: e.ruleId, provenance: e.provenance, layer: e.layer };
}

// Sicht auf P mit stufenabhaengigem Hoechstgewicht (MR-PF-02). Nur size.maxPositionPct wird ersetzt;
// jeder andere Name geht unveraendert an P (unbekannte Namen werfen weiter).
export function withMaxPositionPct(P0, value) {
  if (!(value > 0)) throw new MissingProvenanceError('withMaxPositionPct: Wert fehlt');
  return new Proxy(Object.create(null), {
    get(_t, name) { return name === 'size.maxPositionPct' ? value : P0[name]; },
    set() { throw new MissingProvenanceError('Parameter sind eingefroren'); },
  });
}
