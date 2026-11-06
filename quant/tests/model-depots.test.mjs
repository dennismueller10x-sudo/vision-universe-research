// Quant-Musterdepots (scripts/quant/portfolio/model-depots.cjs): Rechenmodell vorwärts, öffentlicher Export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const D = require('../../scripts/quant/portfolio/model-depots.cjs');
const Identity = require('../../core/identity.js');
const Close = require('../engines/published-close.js');
const COMMITTED = join(ROOT, 'quant/data/product/model-depots-v1.json');
const approved = () => readFileSync(join(ROOT, 'docs/PLAN_NEUSTART_2026-11.md'), 'utf8').includes(D.APPROVAL_MARKER);

function contract(doc) {
  assert.equal(doc.schemaVersion, D.SCHEMA);
  assert.equal(doc.label, 'Rechenmodell, kein echtes Geld');
  assert.equal(doc.legalNotice, 'modelPortfolio');
  assert.equal(doc.recommendation, false);
  assert.match(doc.liveStart, /^\d{4}-\d{2}-\d{2}$/); assert.ok(doc.asOf >= doc.liveStart);
  assert.deepEqual(doc.depots.map(d => d.profileId), D.PROFILES);
  /* Öffentliche Renditeaussage nur mit Owner-Freigabe; Backtest-Renditen nie. */
  const text = JSON.stringify(doc);
  assert.equal(/"(cagr|benchmarkCagr|excessCagr|totalReturn|equity)"/.test(text), false, 'Backtest-Kennzahlen im öffentlichen Export');
  if (!approved()) {
    assert.equal(doc.performance.state, 'AWAITING_OWNER_APPROVAL');
    assert.ok(doc.depots.every(d => d.nav === undefined && !('navInternal' in d)), 'Wertentwicklung ohne Freigabe');
  }
  for (const d of doc.depots) {
    assert.ok(d.rule && d.rule.length > 20, d.profileId + ' ohne Regel');
    if (d.positions.length) {
      assert.ok(d.positions.length >= 15 && d.positions.length <= 30, d.profileId + ' Titelzahl');
      const w = d.positions.reduce((s, p) => s + p.weight, 0);
      assert.ok(Math.abs(w - 1) < 1e-3, d.profileId + ' Gewichte ' + w);
      assert.ok(d.cash >= 0);
    }
    for (const p of d.positions) {
      assert.equal(Identity.securityIdForTicker(p.ticker), p.securityId, p.ticker + ': Identität');
      assert.ok(p.weight > 0 && p.weight <= 0.08 + 1e-9, p.ticker + ' Gewicht');
      assert.ok(p.entryPrice > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.since) && p.since >= doc.liveStart);
    }
    /* Protokoll: jede gehaltene Position hat ihren REIN-Eintrag, kein REIN ohne Kurs. */
    const ins = new Map(d.protocol.filter(e => e.action === 'REIN').map(e => [e.securityId + '|' + e.date, e]));
    for (const p of d.positions) assert.ok(ins.has(p.securityId + '|' + p.since), p.ticker + ' ohne Protokolleintrag');
    assert.ok(d.protocol.every(e => ['REIN', 'RAUS'].includes(e.action) && e.price > 0 && e.date >= doc.liveStart));
    for (let i = 1; i < d.protocol.length; i++) assert.ok(d.protocol[i].date >= d.protocol[i - 1].date, 'Protokoll zeitlich geordnet');
  }
}

test('Musterdepots: Erstlauf baut fünf Depots nach Regel, Aufnahmekurs = veröffentlichter Schluss, keine Wertentwicklung ohne Freigabe', () => {
  const dir = mkdtempSync(join(tmpdir(), 'depots-'));
  try {
    const out = join(dir, 'model-depots.json');
    const today = '2026-11-06';
    const doc = D.build({ out, today });
    contract(doc);
    assert.ok(doc.depots.every(d => d.decision.state === 'CONSTRUCTED' && d.protocol.every(e => e.action === 'REIN')));
    const p = doc.depots[0].positions[0];
    const series = JSON.parse(readFileSync(join(ROOT, 'quant/data/market/discover-series', p.securityId + '.json'), 'utf8'));
    assert.equal(p.entryPrice, Close.lastPoint(series, today).close);

    /* Zweiter Lauf im selben Monat: nichts wird umgeschichtet, das Protokoll bleibt byte-gleich. */
    writeFileSync(out, JSON.stringify(doc));
    const same = D.build({ out, today });
    assert.ok(same.depots.every(d => !d.decision.due));
    assert.deepEqual(same.depots.map(d => d.protocol), doc.depots.map(d => d.protocol));

    /* Neuer Monat: Umschichtung nach Regel; frühere Einträge bleiben unverändert, abgegebene Titel stehen als RAUS. */
    const prev = JSON.parse(JSON.stringify(doc));
    for (const d of prev.depots) {
      d.lastRebalance = '2026-10-02';
      d.positions.push({ ticker: 'ZZZQ', securityId: Identity.securityIdForTicker('ZZZQ'), weight: 0.01, units: 1, since: d.lastRebalance, entryPrice: 10, entryDate: d.lastRebalance, lastPrice: 10, lastDate: d.lastRebalance, priceStale: false });
      d.protocol.unshift({ date: '2026-10-02', action: 'REIN', ticker: 'ZZZQ', securityId: Identity.securityIdForTicker('ZZZQ'), weight: 0.01, price: 10 });
    }
    prev.liveStart = '2026-10-02';
    writeFileSync(out, JSON.stringify(prev));
    const next = D.build({ out, today });
    for (const d of next.depots) {
      const old = prev.depots.find(x => x.profileId === d.profileId);
      assert.deepEqual(d.protocol.slice(0, old.protocol.length), old.protocol, d.profileId + ': Protokoll umgeschrieben');
      assert.ok(d.protocol.some(e => e.action === 'RAUS' && e.ticker === 'ZZZQ' && e.since === '2026-10-02'), d.profileId + ': RAUS fehlt');
      assert.ok(!d.positions.some(p => p.ticker === 'ZZZQ'));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Musterdepots: committeter Export erfüllt den Vertrag', { skip: !existsSync(COMMITTED) }, () => {
  contract(JSON.parse(readFileSync(COMMITTED, 'utf8')));
});

test('Musterdepots: nächster Umschichtungsmonat', () => {
  assert.equal(D.nextMonthFirst('2026-11'), '2026-12-01');
  assert.equal(D.nextMonthFirst('2026-12'), '2027-01-01');
});

test('Musterdepots-Seite: Bestand, Protokoll und Kennzeichnung; keine Rendite ohne Freigabe; unbekanntes Depot ehrlich', () => {
  globalThis.VUUI = require('../../assets/vu-ui.js');
  delete require.cache[require.resolve('../musterdepots/depots.js')];
  const P = require('../musterdepots/depots.js');
  const pos = (t, w) => ({ ticker: t, securityId: Identity.securityIdForTicker(t), weight: w, units: 1, since: '2026-11-05', entryPrice: 100, entryDate: '2026-11-05', lastPrice: 150, lastDate: '2026-11-20' });
  const depot = { profileId: 'garp', name: 'GARP', rule: 'Kauft wachsende Firmen mit guter Qualität, die im Vergleich noch günstig bewertet sind.', positions: [pos('AAA', 0.6), pos('BBB', 0.4)],
    protocol: [{ date: '2026-11-05', action: 'REIN', ticker: 'AAA', weight: 0.6, price: 100 }, { date: '2026-11-05', action: 'REIN', ticker: 'BBB', weight: 0.4, price: 100 }, { date: '2026-12-03', action: 'RAUS', ticker: 'CCC', since: '2026-11-05', price: 90 }],
    lastRebalance: '2026-12-03', nextRebalance: '2027-01-01', invested: 1, cash: 0 };
  const doc = { schemaVersion: 'model-depots-1.0.0', label: 'Rechenmodell, kein echtes Geld', recommendation: false, liveStart: '2026-11-05', asOf: '2026-12-03', rules: { engine: 'portfolio-backtest-1.1.0', costsBpsPerSide: 6 },
    performance: { state: 'AWAITING_OWNER_APPROVAL' }, depots: [depot] };
  assert.equal(P.validate(doc), null);
  assert.equal(P.validate({ ...doc, recommendation: true }), 'SCHEMA');
  const over = P.render(doc, ''), det = P.render(doc, '#/garp');
  for (const html of [over, det]) {
    assert.ok(html.includes('Rechenmodell, kein echtes Geld'));
    assert.ok(html.includes('erscheint hier nach der Freigabe'), 'Wertentwicklung ohne Freigabe sichtbar');
    assert.equal(/\+50|50,0 %|Rendite von|seit Aufnahme/.test(html), false, 'Veränderung je Position gezeigt');
  }
  for (const x of ['/quant/#/aktie/AAA', '60,0 %', '05.11.2026']) assert.ok(det.includes(x), x);
  assert.match(det, /100,00\s\$/, 'Aufnahmekurs');
  assert.ok(det.includes('Umschichtung 03.12.2026') && det.includes('− CCC'));
  assert.deepEqual(P.groupedLog(depot).map(g => g.date), ['2026-12-03', '2026-11-05']);
  assert.ok(P.render(doc, '#/gibtsnicht').includes('gibt es nicht'));
  const pub = P.render({ ...doc, performance: { state: 'PUBLISHED' }, depots: [{ ...depot, nav: [['2026-11-05', 1], ['2026-12-03', 1.021]]}] }, '#/garp');
  assert.ok(pub.includes('Wertentwicklung ab Live-Start') && pub.includes('+2,1 %'));
});
