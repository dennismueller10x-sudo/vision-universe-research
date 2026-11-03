/**
 * Supertrader 8.0 – Schutz der Core-Registrierung des Kandidatenpfads (Voraussetzung V2).
 *
 * core/registry/domains.json darf den Produktpfad (source-faithful/product, Kandidatenvertrag, sf-candidates) an
 * GENAU EINER Stelle nennen: im Eintrag `supertrader-sf8-candidates`. Dessen Felder sind festgeschrieben; der
 * Aktivierungszustand ist `PREPARED_DISABLED` oder, nach Owner-Freigabe in einem eigenen Core-PR, `ACTIVATING`
 * (erste Veröffentlichung, docs/SUPERTRADER_8_FIRST_RELEASE.md). Ohne Feld `activation` ist der Eintrag im Dauerbetrieb
 * (V6 e, docs/SUPERTRADER_9_DAILY_OPERATIONS.md; das Feld entfernt ein eigener Core-PR). Ein dritter Zustand ist verboten.
 * Jeder zweite Eintrag, jedes geänderte Feld und jeder andere Verweis ist eine Verletzung.
 *
 * Zweite und letzte Ausnahme (Owner-Freigabe Option A vom 03.11.2026: das Gate um genau einen explizit definierten,
 * gepinnten Eintrag für das Paper-Test-Protokoll 2027 erweitern, keine allgemeine Abschwächung): GENAU EIN weiterer
 * Eintrag, `supertrader-paper-2027-log`, darf den Pfad des Paper-Test-Protokolls 2027 nennen, und nur mit exakt dem
 * Inhalt aus PAPER2027_DOMAIN_ENTRY. Gepinnt ist der ganze
 * Eintrag (sha256 seines kanonischen JSON, PAPER2027_DOMAIN_SHA256): jedes geänderte, fehlende oder zusätzliche Feld,
 * ein zweites Exemplar und jeder andere Eintrag mit Bezug zu source-faithful/ bleiben Verletzungen. Ein Wechsel des
 * Aktivierungszustands braucht einen neuen Pin in einem eigenen, freigegebenen Supertrader-PR.
 *
 * Rein: liest nur den übergebenen Text, schreibt nichts. Genutzt von SF-PRODUCT-NO-RUN-INTEGRATION und
 * SF2-LEGACY-ISOLATION (dort samt Gegenproben).
 */
import crypto from 'node:crypto';
import { canonicalJson } from '../../snapshot/contract.mjs';

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
/** Zulässige Zustände: vorbereitet, oder freigegeben für die erste Veröffentlichung (Core-PR mit Owner-Freigabe). Den
 *  Commit sperrt zusätzlich der Workflow (nur ACTIVATING) und die Repository-Variable SF8_CANDIDATES_ENABLED. */
export const SF8_ACTIVATION_STATES = Object.freeze([SF8_ACTIVATION_STATE, 'ACTIVATING']);
/** Was in der Registry nur dieser Eintrag nennen darf: der Produktpfad und alles, was SF2-LEGACY-ISOLATION verbietet
 *  (Completion- und Signalmodule), unabhängig von Groß-/Kleinschreibung. */
export const SF8_PRODUCT_REF = /candidate-contract|supertraderCandidates|source-faithful\/|sf-candidates|research-signal\.mjs|completion\/(gaps|status|facts|build-completion)/i;
/** Vollständiger Schlüsselsatz des Eintrags (Format der Datenart `supertrader`, dazu `activation`). */
export const SF8_DOMAIN_KEYS = Object.freeze(['id', 'label', 'layer', 'group', 'critical', 'artifact', 'asOf', 'timestamp', 'records', 'role', 'producer', 'workflow', 'schedule', 'freshness', 'activation', 'consumers']);
/** Paper-Test-Protokoll 2027: Schlüssel, Pfade und der vollständige, festgeschriebene Inhalt des einen Eintrags. */
export const PAPER2027_DOMAIN_ID = 'supertrader-paper-2027-log';
export const PAPER2027_LOG_ARTIFACT = '/scripts/supertrader/source-faithful/paper/log/SF6-PAPER-2027.jsonl';
export const PAPER2027_PRODUCER = 'scripts/supertrader/source-faithful/paper/run-paper-2027.mjs record';
export const PAPER2027_WORKFLOW = 'supertrader-paper-2027.yml';
const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };
export const PAPER2027_DOMAIN_ENTRY = deepFreeze({
  id: PAPER2027_DOMAIN_ID,
  label: 'Supertrader Paper-Test 2027 (Protokoll)',
  layer: 'PRODUCT',
  group: 'Products',
  critical: false,
  artifact: PAPER2027_LOG_ARTIFACT,
  repositoryOnly: true,
  timestamp: [],
  records: null,
  role: 'Prospektiver Paper-Test SF6-PAPER-2027: je XNYS-Sitzung ein hash-verketteter, nur angehaengter Eintrag (oeffentlich Zaehlungen und Hashes; Positions-IDs und Trade-Schluessel versiegelt fuer den Owner unter log/sealed). Keine Signale, keine Empfehlungen, keine Orders, kein Broker, keine Produktflaeche, LIVE_NOT_APPROVED.',
  producer: PAPER2027_PRODUCER,
  workflow: PAPER2027_WORKFLOW,
  schedule: 'Di-Sa 02:37 UTC, Rueckfall 09:41 UTC, je fuer die letzte XNYS-Sitzung; Wirkung nur, wenn der Owner-Schalter (paper/activation-2027.mjs) ACTIVE meldet, und nur auf main. Vorher kein Commit.',
  freshness: { kind: 'none' },
  activation: {
    state: 'PREPARED_DISABLED',
    decision: 'Owner-Freigabe Option A: das Registry-Gate (registry-guard.mjs) erlaubt genau diesen gepinnten Eintrag. Aufzeichnung erst nach eigener Owner-Aktivierung des Paper-Tests (FP-ST-02); bis dahin darf das Protokoll nicht existieren.',
  },
  consumers: ['Owner (Auswertung des Paper-Tests, docs/SUPERTRADER_PAPER_2027_ACTIVATION.md)'],
  knownGaps: ['Das Protokoll ist JSONL (eine Zeile je Sitzung), der Systemzustand liest JSON. Vor dem Wechsel auf ACTIVATING (eigener Core-PR mit neuem Pin und Owner-Freigabe) braucht der Eintrag einen lesbaren Kopf oder einen JSONL-Leser; solange PREPARED_DISABLED gilt, wird nur das Fehlen geprueft.'],
});
/** sha256 des kanonischen JSON (snapshot/contract.mjs#canonicalJson) von PAPER2027_DOMAIN_ENTRY; doppelt gepinnt. */
export const PAPER2027_DOMAIN_SHA256 = '4039aa836a6de27e6589f8ed32db34f6845aaa8cef9ea207183918818dae753a';
export const paper2027EntrySha256 = (d) => crypto.createHash('sha256').update(canonicalJson(d)).digest('hex');
/** Der Eintrag ist genau dann zulässig, wenn er Byte für Byte (kanonisch) dem Pin entspricht. */
const isPinnedPaper2027 = (d) => !!d && typeof d === 'object' && !Array.isArray(d) && d.id === PAPER2027_DOMAIN_ID && paper2027EntrySha256(d) === PAPER2027_DOMAIN_SHA256;

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
    // Dauerbetrieb (V6 e, Supertrader 9): ohne Feld `activation` zulässig; ein vorhandenes Feld nur mit erlaubtem Zustand
    if (d.activation !== undefined && !SF8_ACTIVATION_STATES.includes(d.activation?.state)) out.push('SF8_DOMAIN_ACTIVATION_NOT_ALLOWED');
    for (const k of Object.keys(d)) if (!SF8_DOMAIN_KEYS.includes(k)) out.push(`SF8_DOMAIN_UNKNOWN_FIELD:${k}`);
    // nur die festgeschriebenen Felder artifact/producer dürfen den Produktpfad nennen; Texte, Verbraucher, Entscheidung nicht
    for (const [k, v] of Object.entries(d)) if (!PINNED_REF_FIELDS.has(k) && strings(v).some((x) => SF8_PRODUCT_REF.test(x))) out.push(`SF8_DOMAIN_REF_IN:${k}`);
  }
  // Paper-Test-Protokoll 2027: höchstens ein Eintrag mit diesem Schlüssel, und nur exakt gepinnt
  const paper = domains.filter((d) => d && d.id === PAPER2027_DOMAIN_ID);
  if (paper.length > 1) out.push('PAPER2027_DOMAIN_DUPLICATE');
  if (paper.some((d) => !isPinnedPaper2027(d))) out.push('PAPER2027_DOMAIN_NOT_PINNED');
  const pinnedPaper = paper.length === 1 && isPinnedPaper2027(paper[0]) ? paper[0] : null;
  // jeder andere Teil der Registry (andere Einträge, Kopf) bleibt ohne Bezug zum Produktpfad; ausgenommen sind nur der
  // SF8-Eintrag (oben geprüft) und der eine exakt gepinnte Paper-Eintrag (dasselbe Objekt, kein zweites Exemplar)
  const rest = { ...reg, domains: domains.filter((d) => !(d && d.id === SF8_DOMAIN_ID) && d !== pinnedPaper) };
  if (SF8_PRODUCT_REF.test(JSON.stringify(rest))) out.push('SF8_PRODUCT_REF_OUTSIDE_OWN_DOMAIN');
  return out;
}
