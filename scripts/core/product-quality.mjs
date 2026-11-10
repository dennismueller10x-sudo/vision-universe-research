/* PQ-Regeln (core/product-quality.js): liest die veroeffentlichten Produktartefakte und meldet ihren Zustand.
   Kein Anbieterzugriff, schreibt nichts. Eingebunden in scripts/core/data-quality.mjs. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { require, REPO_ROOT } from './lib.mjs';
import { resolveProductUniverse } from '../market/universe-source.mjs';
import { loadDuplicateResolution, DEFAULT_DUPLICATE_RESOLUTION_FILE } from '../market/lib/security-master-duplicate-resolution.mjs';
const PQ = require(join(REPO_ROOT, 'core/product-quality.js'));

export function productRules({ root = REPO_ROOT, now = new Date() } = {}) {
  const p = rel => join(root, rel);
  const maybe = rel => { try { return existsSync(p(rel)) ? JSON.parse(readFileSync(p(rel), 'utf8')) : null; } catch { return null; } };
  const maybeGz = rel => { try { return existsSync(p(rel)) ? JSON.parse(gunzipSync(readFileSync(p(rel))).toString('utf8')) : null; } catch { return null; } };
  const rules = [];
  rules.push(PQ.universeList(maybeGz('quant/data/product/universe-list-v1.json.gz'), now.toISOString().slice(0, 10),
    require(join(REPO_ROOT, 'quant/engines/factor-evidence.js')).FACTOR_REASONS));
  rules.push(PQ.marketStatus(maybe('quant/data/market/status.json'), require(join(REPO_ROOT, 'quant/engines/data-mode.js')).MODES));
  let product = null; try { product = resolveProductUniverse(root).securities; } catch { /* Quelle fehlt: Liste entfaellt */ }
  const decisions = (maybe('quant/data/market/security-master/eligibility.json') || {}).decisions;
  rules.push(PQ.benchmarkNotInUniverse({
    Produktuniversum: product,
    'Gate-Universum': (maybe('quant/data/market/scale/universe-FULL_UNIVERSE.json') || {}).securities,
    Marktfaehigkeit: (maybe('quant/data/universe/market-capability.json') || {}).members,
    'Security Master': Array.isArray(decisions) ? decisions : decisions ? Object.values(decisions) : null,
    'Titelreihen der Studien': existsSync(p('quant/data/market/discover-series-long/ref_SPY.json')) ? [{ securityId: 'ref_SPY' }] : []
  }));
  rules.push(PQ.observationSummary(maybe('quant/data/product/setup-observations-v1/summary.json')));
  rules.push(PQ.secUniverse(maybe('quant/data/universe/sec-universe.json')));
  const V3 = 'quant/data/technical-intelligence/v3';
  rules.push(PQ.technicalV3({ index: maybeGz(V3 + '/index.json.gz'), meta: maybe(V3 + '/meta.json'),
    shard: (maybeGz(V3 + '/shards/AA.json.gz') || {}).instruments }, require(join(REPO_ROOT, 'quant/engines/technical/elliott/elliott-v3.js')).ENGINE_VERSION));
<<<<<<< HEAD
  let dup = null; try { dup = loadDuplicateResolution(DEFAULT_DUPLICATE_RESOLUTION_FILE).doc.records; } catch { /* Register unlesbar: prueft der Code-Test */ }
  rules.push(PQ.duplicateResolutionSeries(dup, rel => existsSync(p(rel))));
=======
  const search = maybe('discover/data/search/GLOBAL.json'), calendar = maybe('discover/data/europe/calendar.json'), manifest = maybe('discover/data/europe/manifest.json');
  if (search && calendar && manifest) {
    const Universe = require(join(REPO_ROOT, 'core/discover-universe.js'));
    const asOf = search.entries.filter(d => d.region === 'EUROPE').map(d => d.asOf).sort().at(-1);
    /* Stand der Europa-Daten als "jetzt": nur bewerten, was die Freigabe zulaesst */
    const authority = { allowed: true, catalogSha256: manifest.catalog.sha256, calendar }, at = asOf + 'T20:00:00Z';
    rules.push(PQ.requiredSearchTitles(search, (index, query) => Universe.search(index, query, { authority, now: at, limit: 5 }),
      [['NVIDIA', 'US'], ['Palantir', 'US'], ['Rheinmetall', 'EUROPE'], ['Allianz', 'EUROPE'], ['SAP', 'EUROPE'], ['2G Energy', 'EUROPE']]));
  } else rules.push(PQ.requiredSearchTitles(null));
>>>>>>> a4f9714a31 (Datenzustand: DQ-PQ-8 (Suchdatei-Pflichttitel), work-owns-the-post ohne Live-Zugriff, 10 weitere Scan-Fehlalarme)
  return rules;
}
