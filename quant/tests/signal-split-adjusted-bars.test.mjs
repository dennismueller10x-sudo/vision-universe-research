/* Reverse Split im Signalfenster: kein TREND_UP aus der Split-Kante.

   Anlass (14.10.2026): DFLI, MDCX, NXGL, ZBAO, POAS meldeten am 12.10. ein
   'above-long-trend ENTERED' (priceTo200dma -76,8 % -> +74,1 %). Ursache: Der
   Signalpfad ersetzte nur adjustedClose, `close` blieb der Rohschluss, und
   factors.js bildet die 200-Tage-Linie auf `close`. Die Bars des Tests sind
   echte MSFT-Tageskurse bis 2026-09-18 mit einem eingebauten Reverse Split 1:8,
   dessen Rohkurse VOR dem Split durch 8 geteilt sind - der bereinigte Preis ist
   damit durchgehend der echte MSFT-Verlauf. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { splitAdjustedSignalBars } from '../../scripts/technical/materialize-product-intelligence.mjs';
const require = createRequire(import.meta.url);
const Signals = require('../api/market-signal-contract.js');
const Service = require('../api/product-services.js');
const Policy = require('../engines/display-policy.js');
const Query = require('../engines/query.js');
const Canonical = require('../engines/technical/canonical-bars.js');
const CUTOFF = '2026-09-18';
const read = (p) => JSON.parse(readFileSync(new URL('../..' + p, import.meta.url)));
const api = Service.create({ loadJSON: (p) => Promise.resolve(read(p)), displayPolicy: Policy, queryEngine: Query });
const recipes = api.getRecipes();
const DAYS = 40;   // Split 40 Handelstage vor dem Ende: im 60-Tage-Fenster, MSFT liegt davor unter der 200-Tage-Linie

function mitReverseSplit(ratio, daysFromEnd) {
  const src = read('/quant/data/market/golden-preview/daily/ref_MSFT.json');
  src.bars = src.bars.filter((b) => b.date <= CUTOFF);
  const k = src.bars.length - daysFromEnd;
  const bars = src.bars.map((b, i) => {
    const f = i < k ? 1 / ratio : 1;
    return { ...b, open: b.open * f, high: b.high * f, low: b.low * f, close: b.close * f, adjustedClose: b.close * f,
      splitFactor: i === k ? 1 / ratio : 1 };
  });
  return { src, bars, k };
}
function quelle(src, bars, signalBars) {
  return { ...src, bars: signalBars, adjustmentStatus: 'adjusted', publishBasis: 'CANONICAL_PRODUCT_MATERIALIZATION',
    corporateActionReconciliation: { status: 'PASS', method: 'CANONICAL_SPLIT_FACTORS_V1', priceSeriesType: 'SPLIT_ADJUSTED', events: 1 } };
}
function lauf(ratio, daysFromEnd) {
  const { src, bars, k } = mitReverseSplit(ratio, daysFromEnd);
  const actions = bars.filter((b) => b.splitFactor !== 1).map((b) => ({ type: 'split', exDate: b.date, ratio: b.splitFactor }));
  const series = Canonical.fromPriceBars(bars, actions, { instrumentId: 'MSFT', source: 'tiingo', sourceRevision: src.updatedAt, currency: 'USD', exchange: 'US' }).SPLIT_ADJUSTED;
  const ohne = bars.map((b, i) => ({ ...b, adjustedClose: series.close[i] }));           // Stand vor der Korrektur
  const mit = splitAdjustedSignalBars(bars, series);
  const ev = (sb) => Signals.build(quelle(src, bars, sb), { ticker: 'MSFT', recipes, lookback: 60 });
  return { k, bars, src, ohne: ev(ohne), mit: ev(mit), referenz: Signals.build(src, { ticker: 'MSFT', recipes, lookback: 60 }) };
}

test('Reverse Split 1:8: die bereinigten Signalbars liefern dieselben Ereignisse wie die Reihe ohne Split', () => {
  const r = lauf(8, DAYS);
  assert.equal(r.mit.state, 'AVAILABLE');
  assert.deepEqual(r.mit.events.map((e) => [e.asOf, e.definitionId, e.transition]),
    r.referenz.events.map((e) => [e.asOf, e.definitionId, e.transition]));
});

test('Negativkontrolle: nur adjustedClose zu ersetzen (alter Stand) erzeugt an der Split-Kante falsche Ereignisse', () => {
  const r = lauf(8, DAYS);
  assert.equal(r.ohne.state, 'AVAILABLE', JSON.stringify(r.ohne).slice(0, 300));
  const falsch = r.ohne.events.filter((e) => e.asOf >= r.bars[r.k].date);
  assert.ok(falsch.length > 0, 'ohne die Korrektur muss die Split-Kante ein Ereignis erzeugen');
  assert.equal(r.mit.events.filter((e) => e.asOf >= r.bars[r.k].date).length,
    r.referenz.events.filter((e) => e.asOf >= r.bars[r.k].date).length);
});

test('Volumen und Rohdaten der Bars bleiben unberuehrt; nur Preisspalten sind bereinigt', () => {
  const { bars } = mitReverseSplit(8, DAYS);
  const actions = bars.filter((b) => b.splitFactor !== 1).map((b) => ({ type: 'split', exDate: b.date, ratio: b.splitFactor }));
  const series = Canonical.fromPriceBars(bars, actions, { instrumentId: 'MSFT', source: 'tiingo', sourceRevision: 'x', currency: 'USD', exchange: 'US' }).SPLIT_ADJUSTED;
  const out = splitAdjustedSignalBars(bars, series);
  assert.equal(out.length, bars.length);
  assert.deepEqual(out.map((b) => b.volume), bars.map((b) => b.volume));
  assert.deepEqual(out.map((b) => b.splitFactor), bars.map((b) => b.splitFactor));
  assert.deepEqual(out.map((b) => b.date), bars.map((b) => b.date));
});

test('ohne Split ist das Ergebnis unveraendert (kein Nebeneffekt auf Titel ohne Kapitalmassnahme)', () => {
  const src = read('/quant/data/market/golden-preview/daily/ref_MSFT.json');
  src.bars = src.bars.filter((b) => b.date <= CUTOFF);
  const series = Canonical.fromPriceBars(src.bars, [], { instrumentId: 'MSFT', source: 'tiingo', sourceRevision: src.updatedAt, currency: 'USD', exchange: 'US' }).SPLIT_ADJUSTED;
  const mit = splitAdjustedSignalBars(src.bars, series);
  const ohne = src.bars.map((b, i) => ({ ...b, adjustedClose: series.close[i] }));    // Stand vor der Korrektur
  const a = Signals.build({ ...src, bars: ohne }, { ticker: 'MSFT', recipes, lookback: 60 });
  const b = Signals.build({ ...src, bars: mit }, { ticker: 'MSFT', recipes, lookback: 60 });
  assert.deepEqual(b.events.map((e) => e.id), a.events.map((e) => e.id));
  assert.deepEqual(b.events.map((e) => e.evidence), a.events.map((e) => e.evidence));
});
