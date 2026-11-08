/* Ein Screener (Konzept „Fundamental + Screener: Verstehen. Finden.“, Entscheidung 1):
   /screener/ ist der eine Screener. Quant- und Technical-Screener werden Einstiege mit vorgewählter Perspektive und leiten
   erst weiter, wenn /screener/ jedes ihrer Kriterien abdeckt. Dieser Test rechnet die Abdeckung aus und hält fest:
   - solange Kriterien fehlen: kein stilles Weiterleiten, aber ein sichtbarer Einstieg /screener/?p=<perspektive>;
   - sobald nichts mehr fehlt: der Test fordert die Weiterleitung (dann Menü und Leisten auf /screener/ umstellen). */
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

const SC = new Map(F.FIELDS.filter((f) => f.available !== false).map((f) => [f.id, f]));
/* Gleiche Kennzahl unter anderem Namen (nur eindeutige Entsprechungen; alles andere zählt als fehlend). */
const SAME = {
  aboveSma200: 'priceVsSma200', aboveSma50: 'priceVsSma50', sma50AboveSma200: 'sma50VsSma200', aboveEma20: null,
  distHigh52w: 'distance52wHigh', distLow52w: 'distance52wLow', macdPositive: 'macd', rsRank: 'relativeStrengthPct', bbPctB: 'bollinger',
  momentum6m: 'perf6m', priceTo200dma: 'priceVsSma200', priceTo50dma: 'priceVsSma50',
  'quantV2.factorEvidence.quality': 'qualityFactor', 'quantV2.factorEvidence.growth': 'growthFactor', 'quantV2.factorEvidence.momentum': 'momentumFactor',
  'quantV2.factorEvidence.value': 'valueFactor', 'quantV2.factorEvidence.profitability': 'profitabilityFactor', 'quantV2.factorEvidence.revisions': 'revisionsFactor',
  'quantV2.factorEvidence.risk': 'riskFactor'
};
const covered = (id) => SC.has(id) || (SAME[id] && SC.has(SAME[id]));
export function coverage() {
  const technical = TQ.FIELDS.map((f) => f.id).filter((id) => !covered(id));
  const quant = W.fields.map((f) => f.id).filter((id) => !covered(id));
  return { technical, quant, technicalTotal: TQ.FIELDS.length, quantTotal: W.fields.length };
}

test('Abdeckung: welche Kriterien von Quant und Technical /screener/ noch nicht kennt (Grund für die fehlende Weiterleitung)', () => {
  const c = coverage();
  console.log('Technical: ' + (c.technicalTotal - c.technical.length) + '/' + c.technicalTotal + ' abgedeckt, fehlend: ' + c.technical.join(', '));
  console.log('Quant (Profi): ' + (c.quantTotal - c.quant.length) + '/' + c.quantTotal + ' abgedeckt, fehlend: ' + c.quant.join(', '));
  /* Die sieben Quant-Faktoren (0–100) deckt die Perspektive „Faktoren“ vollständig ab. */
  for (const f of ['quality', 'growth', 'momentum', 'value', 'profitability', 'revisions', 'risk']) assert.ok(covered('quantV2.factorEvidence.' + f), f);
  assert.ok(c.technicalTotal >= 80 && c.quantTotal >= 20);
});

test('Weiterleitung nur bei voller Abdeckung; bis dahin ein sichtbarer Einstieg mit vorgewählter Perspektive', () => {
  const c = coverage();
  const techRedirects = /location\.(replace|assign)\(["']\/screener\//.test(TECH), quantRedirects = /location\.(replace|assign)\(["']\/screener\//.test(QUANT);
  if (c.technical.length) {
    assert.equal(techRedirects, false, 'Technical leitet weiter, obwohl ' + c.technical.length + ' Kriterien fehlen');
    assert.match(TECH, /href: "\/screener\/\?p=chart"/, 'Einstieg „Im Screener mit Perspektive Chart“');
  } else assert.ok(techRedirects, 'Alle Technical-Kriterien abgedeckt: jetzt #/screener auf /screener/?p=chart weiterleiten und Menü/Leisten umstellen');
  if (c.quant.length) {
    assert.equal(quantRedirects, false, 'Quant leitet weiter, obwohl ' + c.quant.length + ' Kriterien fehlen');
    /* quant/app/pages.js ist per UI-Sperre eingefroren (scripts/quality/ui-protection.mjs); den Einstieg „Faktoren“ baut der
       Quant-Umbau (docs/design/quant-2026-11/HANDOVER.md, PR 4). Bis dahin: keine Weiterleitung. */
  } else assert.ok(quantRedirects, 'Alle Quant-Kriterien abgedeckt: jetzt #/screener auf /screener/?p=faktoren weiterleiten');
});

test('/screener/?p=<perspektive> wählt die Perspektive vor', () => {
  assert.match(APP, /state\.persp = perspById\(p\.get\('p'\) \|\| ''\) \? p\.get\('p'\) : null;/);
  assert.match(APP, /if \(state\.persp\) openLibrary\(\{ persp: state\.persp \}\)/);
  for (const id of ['chart', 'faktoren']) assert.match(APP, new RegExp("\\{ id: '" + id + "', label: "));
});
