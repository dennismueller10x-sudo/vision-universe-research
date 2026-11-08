// Aktienseite: Technical-Stand derselben Aktie (supertrader/assets/st-technical.js).
// Nur lesen: Anzeigemodell aus meta.json + Scherbe, Scherbe nach core/identity.js#shardKey, Anfrage nur fuer genannte
// Scherben, fehlende oder fremde Daten = "keine Angabe", keine Signal- oder Kaufsprache, Link ueber core/stock-context.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const T = require(path.join(root, 'supertrader/assets/st-technical.js'));
const SC = require(path.join(root, 'core/stock-context.js'));
const FX = JSON.parse(fs.readFileSync(path.join(root, 'scripts/supertrader/tests/fixtures/technical-stock-sample.json'), 'utf8'));
const chartHref = (t) => SC.href(SC.fromUs(t), 'technical');
const shardFor = (t) => { const p = T.shardPath(FX.meta, t); return p ? FX.shards[p.slice(T.DIR.length, -5)] : null; };
const v = (t, o) => T.view(FX.meta, shardFor(t), t, Object.assign({ chartHref, supertraderAsOf: FX.meta.asOf }, o || {}));

test('Scherbe nur, wenn meta.json sie nennt (keine vergebliche Anfrage)', () => {
  assert.equal(T.shardPath(FX.meta, 'NVDA'), '/technical/data/stock/NV.json');
  assert.equal(T.shardPath(FX.meta, 'ZZZZ'), null);
  assert.equal(T.shardPath({ schemaVersion: 'vu-technical-meta-1.0.0' }, 'NVDA'), null, 'vor der ersten Veroeffentlichung');
  assert.equal(T.shardPath({ stock: { schema: 'anders', shards: ['NV'] } }, 'NVDA'), null);
});

test('keine Angabe statt "nichts erkannt"', () => {
  assert.deepEqual(T.view({ asOf: '2026-11-02' }, null, 'NVDA', { chartHref }).reason, 'NOT_PUBLISHED');
  assert.equal(T.view(FX.meta, null, 'ZZZZ', { chartHref }).reason, 'NOT_COVERED');
  assert.equal(T.view(FX.meta, { schema: 'x' }, 'NVDA', { chartHref }).reason, 'INVALID_ARTIFACT');
  /* Scherbe einer anderen Aktie (falscher shardKey) wird nicht gelesen. */
  assert.equal(T.view(FX.meta, FX.shards.AA, 'NVDA', { chartHref }).reason, 'INVALID_ARTIFACT');
  /* Kuerzel fehlt in seiner Scherbe. */
  assert.equal(T.view(FX.meta, FX.shards.NV, 'NVDX', { chartHref }).reason, 'NOT_COVERED');
});

test('Anzeigemodell uebernimmt die Daten unveraendert, Link ueber core/stock-context.js', () => {
  const sym = 'AAMI', r = FX.shards.AA.stocks[sym], m = v(sym);
  assert.equal(m.state, 'AVAILABLE');
  assert.equal(m.chart, '/technical/#/chart/AAMI');
  assert.equal(m.asOf, r.asOf);
  const shown = r.templates.concat(r.goals).filter((f) => f.status !== 'INCOMPLETE');
  assert.equal(m.fits.length, shown.length);
  assert.ok(m.fits.some((f) => f.status === 'FULL'));
  m.fits.forEach((f) => {
    assert.match(f.href, /^\/technical\/#\/chart\/AAMI\?(v|z)=/);
    assert.ok(['Vorlage', 'Analyseziel'].includes(f.kind));
  });
  assert.deepEqual(m.trend.map((t) => t.value), r.trend);
  assert.deepEqual(m.trend.map((t) => t.label), FX.shards.AA.labels.trend.map((t) => t.label));
  assert.equal(m.formations.length, r.formations.length);
  assert.equal(m.otherDay, false);
  assert.equal(v(sym, { supertraderAsOf: '2026-10-30' }).otherDay, true);
});

test('eingefrorener Kurs: keine Einordnung, Hinweis sichtbar', () => {
  const m = v('AACB');
  assert.equal(m.state, 'AVAILABLE');
  assert.equal(m.fresh, false);
  assert.equal(m.excluded, true);
  assert.equal(m.fits.length, 0);
  assert.ok(m.dq.some((d) => /unverändert seit/.test(d.short)));
});

test('Kurssprung: Text aus Technical, Ton Warnung', () => {
  const m = v('ABOS');
  const d = m.dq.find((x) => /Datenverdacht|Datenfehler/.test(x.short));
  assert.ok(d);
  assert.equal(d.tone, 'warn');
  assert.match(d.long, /Kurssprung/);
});

test('Wochenformationen gekennzeichnet; Namen aus den Kopf-Labels', () => {
  for (const sym of ['ADP', 'NVDA']) {
    const sh = shardFor(sym), m = v(sym);
    m.formations.forEach((f, k) => assert.equal(f.name, sh.labels.formations[sh.stocks[sym].formations[k].type]));
    assert.equal(m.formations.filter((f) => f.weekly).length, sh.stocks[sym].formations.filter((f) => f.tf === '1W').length);
  }
});

test('Quelle der Seite: nur Lesen, keine Signal- oder Kaufsprache, keine internen Codes im Text', () => {
  const src = fs.readFileSync(path.join(root, 'supertrader/assets/st-technical.js'), 'utf8');
  assert.match(src, /kein Supertrader-Signal/);
  assert.doesNotMatch(src.replace(/Kauf- oder Verkaufssignal/g, ''), /jetzt kaufen|Kaufsignal|Kaufempfehlung|Rendite/i);
  /* Technical-Codes (PRICE_JUMP_*, FROZEN, Vorlagen-IDs) nur als Schluessel, sichtbar sind Texte aus den Daten. */
  for (const sym of ['AAMI', 'AACB', 'ADP', 'NVDA', 'ABOS']) {
    const m = v(sym), texts = [].concat(m.fits.map((f) => f.title + ' ' + f.mark + ' ' + f.label), m.formations.map((f) => f.name + ' ' + f.badge + ' ' + f.text), m.dq.map((d) => d.short));
    texts.forEach((t) => assert.doesNotMatch(t, /[A-Z]{3,}_[A-Z_]{3,}|Kaufsignal|Rendite/, t));
  }
});

test('supertrader.js laedt das Modul nur auf der Aktienseite und setzt den Abschnitt vor den Haftungshinweis', () => {
  const src = fs.readFileSync(path.join(root, 'supertrader/assets/supertrader.js'), 'utf8');
  const fn = src.slice(src.indexOf('function renderStock('), src.indexOf('function lensBlock('));
  assert.equal((fn.match(/mountTechnical\(main, sym, kit, sig\);\n\s+main\.appendChild\(disclaimer\(sig\)\)/g) || []).length, 2, 'mit und ohne Supertrader-Modell');
  assert.match(src, /loadScript\(BASE \+ 'assets\/st-technical\.js'\)/);
  assert.match(src, /SC\.href\(SC\.fromUs\(t\), 'technical'\)/);
});
