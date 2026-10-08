#!/usr/bin/env node
// Minervini Adaptation 1.1.0 – Source-to-Code und Data Mapping (reproduzierbar aus Regelbuch, Code und Tests).
//
//   node scripts/supertrader/replication/minervini-1.1/artifacts.mjs --write | --check
//
// Kette je Regel: SOURCE (mit Zugangsstufe und Aera) -> INTERPRETATION -> DATA -> FORMALIZATION -> CODE -> TEST -> FIDELITY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULEBOOK, PARAM_TABLE } from './params.mjs';
import { classify, reportAreas } from './engine.mjs';
import { testIdsInSuite } from '../minervini/artifacts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
export const S2C_PATH = path.join(root, 'scripts/supertrader/fidelity/MINERVINI-SOURCE-TO-CODE-1.1.0.json');
export const MAPPING_PATH = path.join(root, 'scripts/supertrader/fidelity/MINERVINI-DATA-MAPPING-1.1.0.json');
const MAPPING_2A = path.join(root, 'scripts/supertrader/fidelity/MINERVINI-DATA-MAPPING.json');
const SUITES = ['scripts/supertrader/tests/minervini-replication.test.mjs', 'scripts/supertrader/tests/minervini-adaptation-1-1.test.mjs', 'scripts/supertrader/tests/sec-data-layer.test.mjs'];

export async function buildSourceToCode() {
  const sources = new Map(RULEBOOK.sources.map((s) => [s.id, s]));
  const suite = new Set(SUITES.flatMap((f) => [...testIdsInSuite(fs.readFileSync(path.join(root, f), 'utf8'))]));
  const chains = [];
  for (const r of RULEBOOK.rules) {
    const impl = r.implementation;
    let exported = null;
    if (impl.module) exported = typeof (await import(path.join(root, impl.module)))[impl.function] === 'function';
    chains.push({
      ruleId: r.id, category: r.category, layer: r.layer,
      source: { refs: r.sources.map((id) => ({ id, type: sources.get(id).type, tier: sources.get(id).tier, era: sources.get(id).era })), confidence: r.sourceConfidence },
      interpretation: { provenanceClass: r.provenanceClass, reproducibility: r.reproducibility, canonical: r.canonicalDescription },
      data: { required: r.requiredData, available: r.availableData },
      formalization: { text: r.formalization.text, parameters: Object.keys(r.formalization.parameters).map((name) => ({ name, value: PARAM_TABLE[name].value, provenance: PARAM_TABLE[name].provenance })) },
      code: impl.module ? { status: impl.status, module: impl.module, function: impl.function, exported } : { status: impl.status },
      tests: r.test.map((id) => ({ id, present: suite.has(id) })),
      implementationFidelity: r.implementationFidelity, fidelity: r.fidelity,
    });
  }
  const count = (f) => chains.reduce((a, x) => { const k = f(x); a[k] = (k in a ? a[k] : 0) + 1; return a; }, {});
  return {
    schema: 'vu-minervini-source-to-code-1.1.0', rulebookVersion: RULEBOOK.rulebookVersion, engine: RULEBOOK.engine, methodEra: RULEBOOK.methodEra,
    principle: 'SOURCE -> RULE -> DATA -> FORMALIZATION -> CODE -> TEST -> FIDELITY FREEZE -> MEASUREMENT',
    classification: classify(), reportAreas: reportAreas(),
    summary: { rules: chains.length, byStatus: count((x) => x.code.status), byProvenance: count((x) => x.interpretation.provenanceClass), byReproducibility: count((x) => x.interpretation.reproducibility), byFidelity: count((x) => x.fidelity) },
    chains,
  };
}

export function buildDataMapping() {
  const m2a = JSON.parse(fs.readFileSync(MAPPING_2A, 'utf8'));
  return {
    schema: 'vu-minervini-data-mapping-1.1.0', rulebookVersion: RULEBOOK.rulebookVersion, createdAt: '2026-10-06', parent: 'scripts/supertrader/fidelity/MINERVINI-DATA-MAPPING.json (2A, unveraendert)',
    pointInTimeRule: m2a.pointInTimeRule,
    datasets: [
      ...m2a.datasets,
      { id: 'SEC-EVENTS-SIC-1', location: 'privater Eimer, sec-events-sic-1.json.gz je Fenster (DEV: tiingo-delisted, HOLDOUT: tiingo-holdout)', producer: 'scripts/supertrader/data-layer/sec/build-sec-events.mjs (Workflow-Modus sec-events / sec-events-holdout)',
        content: 'je CIK: Ergebnismitteilungen (8-K Item 2.02, Aenderungen, Duplikate, periodische Berichte) und SIC je gelesenem Einreichungskopf', pointInTime: true,
        visibility: '8-K: filingDate < Handelstag; SIC: juengste gelesene Einreichung mit filingDate < Handelstag', status: 'NEU in Phase 2B (generischer VU-Datenlayer, nur Protokoll in 1.1.0)',
        listingToCik: 'sec-pit-r12 (sonst r11) plus delistete Listings aus sec-delist-r13', coverageModel: 'Abbruch ohne Ablage bei > 1 % Abruffehlern; Messung verlangt >= 99 % fehlerfreie CIKs',
        knownGaps: ['Listings ohne CIK-Zuordnung (Namenszuordnung verlangte XBRL-Daten): fruehe HOLDOUT-Jahre, kleine Emittenten', 'SIC-Wechsel A->B->A zwischen zwei gelesenen Koepfen unentdeckt', 'kein kommender Ergebnistermin', 'Auslandsemittenten (6-K) ohne 8-K-Mitteilungen'] },
    ],
    gaps: [
      { item: 'Analystenschaetzungen, Revisionen, Ueberraschungen', class: 'C', status: 'NOT AVAILABLE FROM CURRENT OFFICIAL FREE SOURCES', rules: ['MR-SEPA-07', 'MR-SEPA-08'] },
      { item: 'Ergebnistermine (vergangene)', class: 'A', status: '8-K Item 2.02 point-in-time (SEC-EVENTS-SIC-1)', rules: [] },
      { item: 'Ergebnistermine (kommende)', class: 'C', status: 'nicht in SEC-Daten; kein Proxy', rules: ['MR-ERN-01'] },
      { item: 'Institutionelle Daten (13F)', class: 'B', status: 'kostenlos amtlich ab 2013Q2, known_from = Einreichung; CUSIP-Zuordnung lizenzrechtlich offen; keine Minervini-Regel - nicht gebaut', rules: ['MR-SEPA-11'] },
      { item: 'Branchenklassifikation SIC point-in-time', class: 'A', status: 'SEC-EVENTS-SIC-1 (andere Taxonomie als Minervini; nur Protokoll)', rules: ['MR-SEPA-12'] },
      { item: 'Minervinis Branchentaxonomie / IBD-Gruppenrang', class: 'C', status: 'proprietaer', rules: ['MR-SEPA-12'] },
      { item: 'Intraday-Volumen (alle Boersen)', class: 'C', status: 'nur IEX kostenlos (1-3 % des Volumens); keine bezahlte Pipeline', rules: ['MR-ENT-02', 'MR-VCP-05'] },
      { item: 'IBD RS Rating', class: 'C', status: 'proprietaer; VU-RS ist VU_FORMALIZATION (MR-TT-08)', rules: ['MR-TT-08'] },
      { item: 'Quartals-EPS, Umsatz, Margen point-in-time', class: 'A', status: 'SEC-PIT-MREPL-1 (Erstmeldung, filed < Handelstag)', rules: ['MR-SEPA-01', 'MR-SEPA-02', 'MR-SEPA-04', 'MR-SEPA-06'] },
      { item: 'Einmalposten', class: 'B', status: 'XBRL-Tags vorhanden, aber kein belastbares Mapping; nicht gebaut', rules: ['MR-SEPA-09'] },
    ],
    mapping: m2a.mapping,
  };
}

async function main() {
  const files = [[S2C_PATH, JSON.stringify(await buildSourceToCode(), null, 2) + '\n'], [MAPPING_PATH, JSON.stringify(buildDataMapping(), null, 2) + '\n']];
  if (process.argv.includes('--write')) { for (const [f, s] of files) fs.writeFileSync(f, s); console.log('geschrieben'); return; }
  let ok = true;
  for (const [f, s] of files) if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== s) { console.error('veraltet: ' + path.relative(root, f)); ok = false; }
  if (!ok) process.exit(1);
  console.log('aktuell');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
