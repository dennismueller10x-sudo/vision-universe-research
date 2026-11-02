// Supertrader C09 (Kullamägi Episodic Pivot, Chart-Modell): öffentlicher Engpasszähler je EP-Variante.
//
// PR #1262 zählt in der Engine counts.intradayAllocationByMinute (Tage, an denen Plätze oder Kasse nicht für alle
// gefüllten INTRADAY_RESOLVED-Orders reichen und deshalb nach Füllminute zugeteilt wird). Der Runner
// (research/run-kk-intraday.mjs) veröffentlichte bisher nur ausgewählte EP-Zähler; Lauf 41504851988 zeigte den Zähler
// deshalb nicht. Jetzt steht er in jedem EP-Variantenblock (Referenz-Tagesmengen, SF7-Ausführung, E7-6-Erweiterung) als
// eine ganze Zahl (0 = kein Engpasstag). Nur Aggregat: kein Ticker, kein Datum, kein Kurs, kein Trade.
// Synthetische Fixtures (keine Anbieterdaten, keine Secrets); dieselben Gap-Tag-Fixtures wie sf-c09-intraday-allocation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KK_EP_ADAPTER, EP_REFERENCE_CONFIG } from '../source-faithful/research/kk-ep-lifecycle.mjs';
import { runResearchLifecycle, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from '../source-faithful/research/lifecycle-engine.mjs';
import { epAllocationDays } from '../source-faithful/research/run-kk-intraday.mjs';

function sessions(n, start) {
  const out = [], d = new Date(`${start}T00:00:00Z`);
  while (out.length < n) { const w = d.getUTCDay(); if (w > 0 && w < 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const quiet = (k, base = 50) => base + ((k % 5) - 2) * 0.1;
const bar = (date, open, close) => ({ date, open, high: Math.max(open, close) * 1.01, low: Math.min(open, close) * 0.99, close, volume: 1e6, rawClose: close, splitAdj: 1 });
const m = (k, open, high, low, close, volume = 1000) => ({ k, open, high, low, close, volume });
const EP_T = 80;
function epBars(n = 100) {
  const d = sessions(n, '2023-01-03'), out = [];
  for (let k = 0; k < EP_T; k++) out.push(bar(d[k], k ? quiet(k - 1) : quiet(0), quiet(k)));
  out.push({ date: d[EP_T], open: 57.5, high: 60, low: 56.5, close: 59, volume: 5e6, rawClose: 59, splitAdj: 1 });
  for (let k = EP_T + 1; k < n; k++) out.push(bar(d[k], 59 + 0.05 * (k - EP_T - 1), 59 + 0.05 * (k - EP_T)));
  return out;
}
function epMinutes() {
  const out = [m(0, 57.5, 57.8, 57.3, 57.6, 3000), m(1, 57.6, 57.7, 57.2, 57.4, 3000), m(2, 57.4, 57.5, 57.0, 57.1, 3000), m(3, 57.1, 57.4, 57.05, 57.3, 3000), m(4, 57.3, 57.6, 57.25, 57.55, 3000), m(5, 57.55, 57.75, 57.45, 57.7, 3000), m(6, 57.7, 58.1, 57.65, 58.0, 3000)];
  for (let k = 7; k < 390; k++) { const p = 58 + 0.005 * (k - 6); out.push(m(k, p - 0.002, p + 0.03, p - 0.03, p)); }
  return out;
}
const T = epBars()[EP_T].date;
function runEp(ids, policy) {
  const mins = Object.fromEntries(ids.map((id) => [`${id.split(':')[2]}|${T}`, epMinutes()]));
  const ds = { calendar: epBars().map((x) => x.date), securities: ids.map((id) => ({ id, bars: epBars(), terminal: null })), kkIntraday: { minutes: (t, d) => mins[`${t}|${d}`], iexBaseline: () => 20000 } };
  return runResearchLifecycle(ds, { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG, policy });
}

test('C09-COUNTER-VALUE: öffentlicher Zähler = Engpasstage der Engine; ohne Engpass 0 statt fehlendem Schlüssel', () => {
  const ids = ['US:EQ:EPA', 'US:EQ:EPB', 'US:EQ:EPC'];
  const scarce = runEp(ids, { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, maxOpenPositions: 1 });
  assert.equal(scarce.counts.intradayAllocationByMinute, 1);
  assert.equal(epAllocationDays(scarce), 1);
  const ample = runEp(ids, PLATFORM_RESEARCH_PORTFOLIO_POLICY);
  assert.equal(ample.counts.intradayAllocationByMinute, undefined, 'Engine unverändert: Zähler nur an Engpasstagen');
  assert.equal(epAllocationDays(ample), 0);
  // das Ergebnis der Läufe hängt nicht vom Lesen des Zählers ab (reine Lesefunktion)
  assert.equal(scarce.trades.length, 1); assert.equal(ample.trades.length, 3);
});

test('C09-COUNTER-PUBLIC-SAFE: nur eine nicht negative ganze Zahl; alles andere bricht den Lauf ab', () => {
  assert.equal(epAllocationDays({ counts: {} }), 0);
  assert.equal(epAllocationDays({ counts: { intradayAllocationByMinute: 7 } }), 7);
  for (const bad of [-1, 1.5, '3', NaN, { AAPL: 1 }, ['2020-01-02']]) assert.throws(() => epAllocationDays({ counts: { intradayAllocationByMinute: bad } }), /EP_ALLOCATION_COUNTER_INVALID/);
});

test('C09-COUNTER-RUNNER: jeder öffentliche EP-Variantenblock trägt den Zähler (Referenz-Tagesmengen, SF7, E7-6), kein PS-Block', () => {
  const src = fs.readFileSync(new URL('../source-faithful/research/run-kk-intraday.mjs', import.meta.url), 'utf8');
  const lines = src.split('\n');
  const sites = lines.filter((l) => l.includes('intradayAllocationByMinute: epAllocationDays(r)'));
  assert.equal(sites.length, 3, 'drei EP-Blöcke: pub.ep.sets, pub.ep.sf7Execution, E7-6 (runEpExt)');
  assert.ok(lines.some((l) => /pub\.ep\.sets\[setId\]\.variants\[v\.id\] = \{.*intradayAllocationByMinute: epAllocationDays\(r\)/.test(l)));
  assert.ok(lines.some((l) => /pub\.ep\.sf7Execution\.variants\[x\.id\] = \{.*intradayAllocationByMinute: epAllocationDays\(r\)/.test(l)));
  assert.ok(lines.some((l) => /const p = \{.*intradayAllocationByMinute: epAllocationDays\(r\)/.test(l)));
  // die PS-Studie hat keine Engine-Zuteilung: kein Zähler in ihren Blöcken
  for (const l of lines.filter((x) => /pub\.(extE7_6\.)?ps(\.sets)?\[/.test(x) && x.includes('= {'))) assert.doesNotMatch(l, /intradayAllocationByMinute/);
  // im Sealed-Block steht der Zähler nicht zusätzlich (er ist öffentlich), Kennzahlen bleiben versiegelt
  assert.ok(!lines.some((l) => /sealed\.[^=]*= \{.*intradayAllocationByMinute/.test(l)));
});
