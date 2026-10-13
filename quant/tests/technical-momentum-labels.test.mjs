/* Kursdynamik auf der Aktienseite: jede Klasse der Momentum-Engine hat eine Beschriftung.
 *
 * Fund beim Produktions-Audit (13.10.2026): AAPL und MSFT zeigten "Kursdynamik: Nicht verfügbar", obwohl das
 * veröffentlichte Bundle momentum.state = STRONG_POSITIVE trägt. Die Beschriftungstabelle in
 * getTechnicalIntelligence kannte nur POSITIVE/NEGATIVE/NEUTRAL, die Engine (momentum-engine.js) liefert aber
 * auch STRONG_POSITIVE und STRONG_NEGATIVE. UNDETERMINED bleibt ehrlich "Nicht verfügbar". */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), Service = require('../api/product-services.js'), Policy = require('../engines/display-policy.js'), Query = require('../engines/query.js');
const root = new URL('../../', import.meta.url);
const engineSource = await readFile(new URL('quant/engines/technical/momentum-engine.js', root), 'utf8');
const engineStates = [...new Set([...engineSource.matchAll(/"([A-Z_]+)"/g)].map(m => m[1]).filter(s => /^(STRONG_)?(POSITIVE|NEGATIVE)$|^NEUTRAL$|^UNDETERMINED$/.test(s)))];
const apiWith = state => Service.create({
  loadJSON: async p => {
    const x = JSON.parse(await readFile(new URL(p.slice(1), root), 'utf8'));
    if (p.endsWith('technical/instruments/NVDA.json')) x.bundle.momentum.state = state;
    return x;
  },
  displayPolicy: Policy, queryEngine: Query
});
test('die Engine liefert die fünf Klassen plus UNDETERMINED', () => {
  assert.deepEqual(engineStates.sort(), ['NEGATIVE', 'NEUTRAL', 'POSITIVE', 'STRONG_NEGATIVE', 'STRONG_POSITIVE', 'UNDETERMINED']);
});
test('jede bestimmte Momentum-Klasse hat eine Beschriftung, nur UNDETERMINED bleibt "Nicht verfügbar"', async () => {
  const expected = {STRONG_POSITIVE: 'Stark positiv', POSITIVE: 'Positiv', NEUTRAL: 'Neutral', NEGATIVE: 'Negativ', STRONG_NEGATIVE: 'Stark negativ', UNDETERMINED: 'Nicht verfügbar'};
  for (const [state, label] of Object.entries(expected)) {
    const technical = await apiWith(state).getTechnicalIntelligence('NVDA');
    assert.equal(technical.state, 'AVAILABLE', state);
    assert.equal(technical.momentum.label, label, state);
  }
});
