/* Screener in Quant und Technical bleiben, der Hauptscreener kann alles (Owner-Entscheidung 09.11.2026, ersetzt
   Entscheidung 1 des Konzepts „Fundamental + Screener: Verstehen. Finden.“):
   - Quant- und Technical-Screener bleiben in ihren Welten und leiten NICHT auf /screener/ weiter;
   - /screener/ kennt jedes Kriterium beider Screener (Technical im Tageschart; Wochen-/Monatsvarianten bleiben im
     Technical-Screener), damit man dort alles mit Zahlen, Faktoren und Methoden kombinieren kann;
   - /screener/?p=<perspektive> wählt die Perspektive vor (Einstieg aus Technical: „Im Screener mit Perspektive Chart“). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../engine/fields.js');
const TQ = require('../../quant/engines/technical/technical-query.js');
const W = require('../../quant/api/screener-workspace.js');
const APP = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const TECH = readFileSync(new URL('../../technical/app.js', import.meta.url), 'utf8');
const QUANT = readFileSync(new URL('../../quant/app/pages.js', import.meta.url), 'utf8');
const PRODUCER = readFileSync(new URL('../../products/screener/producer/build-universe.mjs', import.meta.url), 'utf8');

const SC = new Map(F.FIELDS.filter((f) => f.available !== false).map((f) => [f.id, f]));
/* Gleiche Kennzahl unter anderem Namen (der Hauptscreener führt sie schon mit eigener Spalte). */
const SAME = {
  aboveSma200: 'priceVsSma200', aboveSma50: 'priceVsSma50', sma50AboveSma200: 'sma50VsSma200', distSma200: 'priceVsSma200',
  distHigh52w: 'distance52wHigh', distLow52w: 'distance52wLow', macdPositive: 'macd', rsRank: 'relativeStrengthPct', bbPctB: 'bollinger',
  rsi14: 'rsi', chg1d: 'perf1d', close: 'price', relVol: 'relativeVolume',
  atrPct: 'atr', formationActive: 'chartPattern', formationConfirmed: 'chartPatternConfirmed', formationOpen: 'chartPatternOpen',
  momentum6m: 'perf6m', priceTo200dma: 'priceVsSma200', priceTo50dma: 'priceVsSma50', operatingMargin: 'operatingMargin',
  'quantV2.factorEvidence.quality': 'qualityFactor', 'quantV2.factorEvidence.growth': 'growthFactor', 'quantV2.factorEvidence.momentum': 'momentumFactor',
  'quantV2.factorEvidence.value': 'valueFactor', 'quantV2.factorEvidence.profitability': 'profitabilityFactor', 'quantV2.factorEvidence.revisions': 'revisionsFactor',
  'quantV2.factorEvidence.risk': 'riskFactor', 'quantV2.factorEvidence.availableFactors': 'factorCoverage'
};
/* Abgelöste V1-Werte im Quant-Profi-Screener: sie liegen nur für fünf Demo-Titel vor (quant/data/technical/index.json)
   und sind durch das Chartbild ersetzt, das der Hauptscreener führt (Ausblick, Kursstruktur, Elliott-Klarheit). */
const SUPERSEDED = { technicalOpportunityScore: 'tiOutlook', technicalTrend: 'tiOutlook', technicalPrimaryDirection: 'tiOutlook', elliottCountStatus: 'tiElliottApplicable' };
const covered = (id) => SC.has(id) || (SAME[id] && SC.has(SAME[id])) || (SUPERSEDED[id] && SC.has(SUPERSEDED[id]));
export function coverage() {
  return {
    technical: TQ.FIELDS.filter((f) => f.tfs.includes('1D')).map((f) => f.id).filter((id) => !covered(id)),
    quant: W.fields.map((f) => f.id).filter((id) => !covered(id)),
    technicalTotal: TQ.FIELDS.length, quantTotal: W.fields.length
  };
}

test('der Hauptscreener kennt jedes Kriterium des Technical- und des Quant-Screeners', () => {
  const c = coverage();
  assert.ok(c.technicalTotal >= 80 && c.quantTotal >= 20);
  assert.deepEqual(c.technical, [], 'Technical-Kriterien fehlen in /screener/');
  assert.deepEqual(c.quant, [], 'Quant-Kriterien fehlen in /screener/');
});

test('übernommene Technical-Kriterien lesen dieselbe Spalte der Technical-Datei (eine Berechnung, nie neu gerechnet)', () => {
  for (const f of F.FIELDS.filter((x) => x.group === 'technicalWorld')) {
    const src = (PRODUCER.match(new RegExp("\\b" + f.col + ": '([A-Za-z0-9]+)'")) || [])[1];
    assert.ok(src, f.id + ': Spalte ' + f.col + ' fehlt im Erzeuger');
    assert.ok(TQ.FIELDS.some((t) => t.id === src && t.tfs.includes('1D')), f.id + ' -> ' + src);
    assert.equal(f.label, typeof TQ.FIELDS.find((t) => t.id === src).label === 'string' ? TQ.FIELDS.find((t) => t.id === src).label : TQ.FIELDS.find((t) => t.id === src).label['1D'], f.id + ': Wortlaut wie im Technical-Screener');
  }
});

test('Quant- und Technical-Screener bleiben und leiten nicht weiter; Technical zeigt den Weg in den Hauptscreener', () => {
  assert.doesNotMatch(TECH, /location\.(replace|assign)\(["']\/screener\//);
  assert.doesNotMatch(QUANT, /location\.(replace|assign)\(["']\/screener\//);
  assert.match(TECH, /href: "\/screener\/\?p=chart"/, 'Einstieg „Im Screener mit Perspektive Chart“');
});

test('/screener/?p=<perspektive> wählt die Perspektive vor; „Chart“ zeigt auch die Technical-Kriterien', () => {
  assert.match(APP, /state\.persp = perspById\(p\.get\('p'\) \|\| ''\) \? p\.get\('p'\) : null;/);
  assert.match(APP, /if \(state\.persp\) openLibrary\(\{ persp: state\.persp \}\)/);
  assert.match(APP, /world: 'technical', groups: \['momentum', 'technical', 'technicalWorld'\]/);
});
