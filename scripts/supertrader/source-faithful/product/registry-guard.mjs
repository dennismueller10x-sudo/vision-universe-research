/**
 * Supertrader 8.0 – Schutz der Core-Registrierung des Kandidatenpfads (Voraussetzung V2).
 *
 * core/registry/domains.json darf den Produktpfad (source-faithful/product, Kandidatenvertrag, sf-candidates) an
 * GENAU EINER Stelle nennen: im Eintrag `supertrader-sf8-candidates`. Dessen Felder sind festgeschrieben; der
 * Aktivierungszustand bleibt `PREPARED_DISABLED`, bis der Owner die Aktivierung (V6) in einem eigenen PR freigibt.
 * Jeder zweite Eintrag, jedes geänderte Feld und jeder andere Verweis ist eine Verletzung.
 *
 * Rein: liest nur den übergebenen Text, schreibt nichts. Genutzt von SF-PRODUCT-NO-RUN-INTEGRATION und
 * SF2-LEGACY-ISOLATION (dort samt Gegenproben).
 */
export const SF8_DOMAIN_ID = 'supertrader-sf8-candidates';
/** Festgeschriebene Felder des einen erlaubten Eintrags (docs/SUPERTRADER_8_INTEGRATION_BLOCKER_V2_V3.md, Schritt 2). */
export const SF8_DOMAIN_PINNED = Object.freeze({
  id: SF8_DOMAIN_ID,
  layer: 'PRODUCT',
  critical: false,
  artifact: '/supertrader/data/sf-candidates/summary.json',
  producer: 'scripts/supertrader/source-faithful/product/build-candidates.mjs',
  workflow: 'supertrader-sf8-candidates.yml',
});
/** Solange V6 nicht freigegeben ist, bleibt der Eintrag vorbereitet und abgeschaltet. */
export const SF8_ACTIVATION_STATE = 'PREPARED_DISABLED';
/** Was in der Registry nur dieser Eintrag nennen darf: der Produktpfad und alles, was SF2-LEGACY-ISOLATION verbietet
 *  (Completion- und Signalmodule), unabhängig von Groß-/Kleinschreibung. */
export const SF8_PRODUCT_REF = /candidate-contract|supertraderCandidates|source-faithful\/|sf-candidates|research-signal\.mjs|completion\/(gaps|status|facts|build-completion)/i;
/** Vollständiger Schlüsselsatz des Eintrags (Format der Datenart `supertrader`, dazu `activation`). */
export const SF8_DOMAIN_KEYS = Object.freeze(['id', 'label', 'layer', 'group', 'critical', 'artifact', 'asOf', 'timestamp', 'records', 'role', 'producer', 'workflow', 'schedule', 'freshness', 'activation', 'consumers']);
const PINNED_REF_FIELDS = new Set(['artifact', 'producer']);
const strings = (x) => (typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(strings) : []);

/** Verletzungen der engen Ausnahme; [] = zulässig (auch: kein Eintrag). */
export function sf8RegistryViolations(text) {
  let reg;
  try { reg = JSON.parse(text); } catch { return ['REGISTRY_NOT_JSON']; }
  const domains = Array.isArray(reg?.domains) ? reg.domains : [];
  const out = [];
  const own = domains.filter((d) => d && d.id === SF8_DOMAIN_ID);
  if (own.length > 1) out.push('SF8_DOMAIN_DUPLICATE');
  for (const d of own) {
    for (const [k, v] of Object.entries(SF8_DOMAIN_PINNED)) if (d[k] !== v) out.push(`SF8_DOMAIN_FIELD:${k}`);
    if (d.activation?.state !== SF8_ACTIVATION_STATE) out.push('SF8_DOMAIN_ACTIVATION_NOT_PREPARED_DISABLED');
    for (const k of Object.keys(d)) if (!SF8_DOMAIN_KEYS.includes(k)) out.push(`SF8_DOMAIN_UNKNOWN_FIELD:${k}`);
    // nur die festgeschriebenen Felder artifact/producer dürfen den Produktpfad nennen; Texte, Verbraucher, Entscheidung nicht
    for (const [k, v] of Object.entries(d)) if (!PINNED_REF_FIELDS.has(k) && strings(v).some((x) => SF8_PRODUCT_REF.test(x))) out.push(`SF8_DOMAIN_REF_IN:${k}`);
  }
  // jeder andere Teil der Registry (andere Einträge, Kopf) bleibt ohne Bezug zum Produktpfad
  const rest = { ...reg, domains: domains.filter((d) => !(d && d.id === SF8_DOMAIN_ID)) };
  if (SF8_PRODUCT_REF.test(JSON.stringify(rest))) out.push('SF8_PRODUCT_REF_OUTSIDE_OWN_DOMAIN');
  return out;
}
