/* Emerging Leaders, Gruppe E: die FCF-Marge am Stichtag (scripts/quant/lib/emerging-leaders-inputs.mjs#fundamentalsAt).
 *
 * Anlass: #944 ergaenzt bei NVIDIA Investitionen und damit den Free Cashflow fuer GJ 2013-2021. Die Studie bekommt dadurch
 * an fruehen Stichtagen eine FCF-Marge, wo vorher keine war. Geprueft wird, dass zusaetzliche aeltere Jahre nur Luecken
 * fuellen: kein bereits sichtbarer Wert aendert sich, nichts wird vor seiner Einreichung sichtbar, und fehlt der FCF des
 * juengsten sichtbaren Umsatzjahres, bleibt die Marge leer (kein Rueckgriff auf ein aelteres Jahr). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fundamentalsAt } from '../../scripts/quant/lib/emerging-leaders-inputs.mjs';

const row = (fy, v, filed) => [fy, 'FY', `${fy}-12-31`, v, filed, `0000000001-${String(filed).slice(2, 4)}-000001`, 0];
// Wie im Consumer-Buendel ("as of latest"): jede Zeile traegt die juengste Meldung, die das Jahr enthaelt - Umsatz und FCF
// desselben Jahres dieselbe (hier die zwei Jahre spaetere 10-K mit dem dritten Vergleichsjahr).
const filedOf = (fy) => `${fy + 2}-02-20`;
const revenue = [2013, 2014, 2015, 2016, 2017].map((fy) => row(fy, 100 + 20 * (fy - 2013), filedOf(fy)));
const fcf = (years) => years.map((fy) => row(fy, 10 + 5 * (fy - 2013), filedOf(fy)));
// Vorher: FCF nur fuer die juengeren Jahre (wie bei NVIDIA vor #944: Investitionen erst ab GJ 2022).
const before = { annual: { revenue, net_income: [], free_cash_flow: fcf([2016, 2017]) } };
// Nachher: zusaetzlich die aelteren Jahre mit derselben Einreichung wie ihr Umsatz.
const after = { annual: { revenue, net_income: [], free_cash_flow: fcf([2013, 2014, 2015, 2016, 2017]) } };
const days = []; for (let d = new Date('2014-01-01'); d <= new Date('2021-01-01'); d.setUTCDate(d.getUTCDate() + 7)) days.push(d.toISOString().slice(0, 10));

test('zusaetzliche aeltere FCF-Jahre fuellen nur Luecken und aendern keinen bereits sichtbaren Wert', () => {
  let filled = 0, kept = 0;
  for (const d of days) {
    const a = fundamentalsAt(before, d).fcfMargin, b = fundamentalsAt(after, d).fcfMargin;
    if (Number.isFinite(a)) { assert.equal(b, a, d); kept++; }
    else if (Number.isFinite(b)) filled++;
  }
  assert.ok(kept > 0 && filled > 0, `vorher sichtbar ${kept}, neu gefuellt ${filled}`);
});

test('nichts wird vor seiner Einreichung sichtbar', () => {
  assert.ok(Number.isNaN(fundamentalsAt(after, '2015-02-19').fcfMargin));            // GJ 2013 erst am 2015-02-20 eingereicht
  assert.equal(fundamentalsAt(after, '2015-02-20').fcfMargin, 10 / 100);             // GJ 2013, genau ab seiner Einreichung
  assert.equal(fundamentalsAt(after, '2017-06-01').fcfMargin, 20 / 140);             // GJ 2015 ist das juengste sichtbare Jahr
  assert.ok(Number.isNaN(fundamentalsAt(before, '2017-06-01').fcfMargin));           // vorher: leer
});

test('fehlt der FCF des juengsten sichtbaren Umsatzjahres, bleibt die Marge leer (kein Rueckgriff)', () => {
  const gap = { annual: { revenue, net_income: [], free_cash_flow: fcf([2013, 2014, 2016, 2017]) } };
  assert.ok(Number.isNaN(fundamentalsAt(gap, '2017-06-01').fcfMargin));              // GJ 2015 fehlt -> nicht GJ 2014
  assert.equal(fundamentalsAt(gap, '2016-06-01').fcfMargin, 15 / 120);
});
