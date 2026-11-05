'use strict';
// Softwarevalidierung des E3-Supertrader-Overlays auf synthetischen Läufen.
const test = require('node:test');
const assert = require('node:assert/strict');
const ST = require('./st-e3.cjs');

function run(n = 120) {
  const daily = [], holdings = [], fills = [];
  let eq = 1e6;
  for (let i = 0; i < n; i++) {
    const date = new Date(Date.UTC(2016, 0, 4) + i * 86400000).toISOString().slice(0, 10);
    if (i) eq *= 1 + (i % 3 === 0 ? 0.004 : -0.001);
    daily.push({ date, equity: eq, cash: eq * 0.2, exposure: 0.8 });
    holdings.push({ date, positions: [['ref_A', 1000, eq * 0.8 / 1000]] });
    if (i === 10 || i === 60) fills.push({ date, securityId: 'ref_A', side: i === 10 ? 'BUY' : 'SELL', units: 100, price: 10, notional: 100000, reason: 'SIGNAL', close: 10, volume: 1e6, adv20: 50e6 });
  }
  return { daily, holdings, fills, terminals: [] };
}

test('ohne Filter und ohne Fills: Overlay = Kurve des Laufs; mit Fills: Kosten nach Protokoll', () => {
  const r = run(), noFill = { ...r, fills: [] }, o = ST.overlay(noFill);
  o.equity.forEach(([, v], i) => assert.ok(Math.abs(v - r.daily[i].equity) < 1e-6));
  const c = ST.overlay(r);
  assert.ok(c.costs > 0);
  // ADV 50 Mio. -> halber Spread 5 bp; je Seite 1 + 5 + 5 = 11 bp auf 100.000 USD (skaliert).
  assert.ok(Math.abs(ST.sideCostRate(50e6) - 0.0011) < 1e-15);
});

test('Filter: Wechsel am Schluss d, Ausführung Folgesitzung; Cash-Phase flach; Wiederaufbau kostenpflichtig', () => {
  const r = run(), dates = r.daily.map(d => d.date);
  const off = new Set(dates.slice(30, 50));
  const o = ST.overlay({ ...r, fills: [] }, { filterStateAt: d => !off.has(d) });
  assert.equal(o.filterSwitches, 3, 'Erstkauf aus Cash + aus + an');
  const seg = o.equity.slice(32, 50).map(e => e[1]);
  assert.ok(seg.every(v => Math.abs(v - seg[0]) < 1e-6), 'Cash unverzinst');
  assert.ok(o.costs > 0, 'Schließen und Wiederaufbau kosten');
});

test('Endwert nach Klasse: Notlage 0 %, Übernahme 100 %; TOP5 = fünf Sleeves zu 20 % ohne Umschichtung', () => {
  const r = run(), d = r.daily[40].date;
  const term = (cls, distress) => ST.overlay({ ...r, fills: [{ date: d, securityId: 'ref_A', side: 'SELL', units: 1000, price: 1, notional: 200000, reason: 'TERMINAL', adv20: 50e6 }],
    terminals: [{ securityId: 'ref_A', date: d, cause: 'LISTING_INACTIVE', distress, delistClass: cls, settlePrice: 200 }] });
  const m = term('MERGER', false), x = term(null, true);
  assert.equal(m.terminalByKind.MERGER, 1); assert.equal(x.terminalByKind.DISTRESS, 1);
  assert.ok(x.equity.at(-1)[1] < m.equity.at(-1)[1]);
  assert.equal(ST.terminalClass({ cause: 'LISTING_INACTIVE', distress: false, delistClass: null }), 'UNKNOWN');
  const base = ST.overlay({ ...r, fills: [] }), s = ST.sleeves([base, base, base, base, base]);
  assert.ok(Math.abs(s.equity.at(-1)[1] - base.equity.at(-1)[1]) < 1e-6);
});
