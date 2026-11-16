/* Fundamental-Start nach Prototyp „App-Konzept 2“ (#fundamental, Owner 14./15.11.2026): Aufbau, Reiter im Inhalt und die
 * Meldewoche aus der SEC-Historie (products/fundamental/producer/build-history.mjs#filingWeek). Nur Darstellung. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filingWeek } from '../producer/build-history.mjs';

const APP = readFileSync(new URL('../../../fundamental/app.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../../../fundamental/index.html', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../../../fundamental/app.css', import.meta.url), 'utf8');

const issuer = (cik, name, filed, rev) => ({ cik, name, filings: filed.map((d, i) => ['0000000000-26-00000' + i, d]), annual: { revenue: [[2025, '2025-12-31', rev, 0, 0]] } });

test('Meldewoche: Montag bis Freitag des neuesten Meldedatums, jede Firma einmal am ersten Tag, größte nach Umsatz', () => {
  const shards = {
    AA: { issuers: {
      AAA: issuer('0000000001', 'Alpha Inc', ['2026-08-01', '2026-11-10', '2026-11-12'], 50),
      AAB: issuer('0000000002', 'Beta Corp', ['2026-11-12'], 900),
      'BRK-A': issuer('0000000003', 'Berkshire - Class A', ['2026-11-09'], 400),
      'BRK-B': issuer('0000000003', 'Berkshire - Class A', ['2026-11-09'], 400),
      OLD: issuer('0000000004', 'Old', ['2026-11-06'], 1000),
      LATE: issuer('0000000005', 'Late', ['2026-11-14'], 2000) } } };
  const w = filingWeek(shards, '2026-11-13');
  assert.equal(w.from, '2026-11-09'); assert.equal(w.to, '2026-11-13'); assert.equal(w.last, '2026-11-12');
  assert.deepEqual(w.days.map((d) => d.date), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  assert.deepEqual(w.days.map((d) => d.t), [['BRK-B'], ['AAA'], [], ['AAB'], []], 'eine CIK einmal, erster Tag zählt, Meldung nach dem Stand nicht');
  assert.equal(w.count, 3);
  assert.deepEqual(w.top.map((x) => x[0]), ['AAB', 'BRK-B', 'AAA']);
  assert.equal(filingWeek({}, '2026-11-13'), null);
});

test('Start: Reiter im Inhalt (Heute · Ranglisten · Checklisten · Branchen), eine h1, Blöcke in der Reihenfolge des Prototyps', () => {
  const tabs = Function('return ' + APP.match(/var FP_TABS = (\[[^;]*\]);/)[1])();
  assert.deepEqual(tabs.map((t) => t[0]), ['Heute', 'Ranglisten', 'Checklisten', 'Branchen']);
  assert.match(HTML, /h\.setAttribute\("data-vu-tabs","inhalt"\)/, 'Start trägt die Reiter selbst, schon vor dem ersten Bild');
  assert.match(HTML, /<meta name="theme-color" content="#08080a">/, 'Dunkel ist Standard');
  const start = APP.slice(APP.indexOf('Start nach Prototyp'), APP.indexOf('F02 Ranglisten')), home = start.slice(start.indexOf('  function homeView() {'));
  const order = ["fpSh('Höchste Margen'", "fpSh('Checklisten'", "fpSh('Weitere Ranglisten'", "fpSh('Zahlen lesen in 30 Sekunden')", "fpSh('Branchen im Vergleich'", "fpSh('Firma suchen')", "title: 'Hedgefonds: was Investoren halten'", "class: 'fp-end' }, endLink"];
  let at = -1;
  for (const o of order) { const i = home.indexOf(o); assert.ok(i > at, o); at = i; }
  assert.equal((start.match(/el\('h1'/g) || []).length, 3, 'h1 nur in der Startkachel (Platzhalter, mit und ohne Meldewoche), sonst h2');
  assert.match(home, /'data-vu-frame-hinweise': ''/, '„Daten & Hinweise“ öffnet das Fenster des Rahmens');
  assert.doesNotMatch(home, /Schätz mal|Termine/, 'Quiz zurückgestellt, kein Terminkalender in den Daten');
});

test('Start: Aktien-Elemente öffnen die Vorschau, Höchste Margen ist die bestehende Rangliste (Regel unverändert)', () => {
  assert.match(APP, /function stockLink\(t, name, cls, kids, label\) \{\s*return el\('a', \{ class: cls, href: '\/aktie\/#\/' \+ encodeURIComponent\(t\), 'data-vu-stock': t, 'data-vu-stock-name': name \|\| t/);
  assert.match(APP, /C\.ranking\(U, 'margen', FP_MARGIN_SIZE, 6\)/);
  assert.match(CSS, /\.fp \.fp-race-b\{[^}]*height:30px[^}]*border-radius:9px/, 'Spur 30 px wie im Prototyp');
  assert.match(CSS, /\.fp \.fp-tab::after\{content:"";position:absolute;inset:-4px 0\}/, 'Reiter: 44 px Tippfläche');
});
