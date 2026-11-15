// Supertrader: die eigenen Module und Stylesheets, die supertrader.js nachlädt, tragen eine gemeinsame Kennung (?v=).
// Vorher luden st-redesign.js und st-redesign.css auf den Unterseiten ohne Kennung: nach einer Veröffentlichung konnte bis
// zu zehn Minuten lang ein neues Modul auf ein altes Stylesheet aus dem Zwischenspeicher treffen. Die Kennung steht in
// supertrader.js (ASSET_V); keine erzeugte Seite ändert sich. Seiten, die st-redesign.js im <head> ohne Kennung
// ankündigen (Start, Aktienseiten), laden das Paar weiter ohne Kennung – der Preload bleibt genutzt.
// Dazu: das historische Beispiel lädt die gemeinsamen Bausteine (vu-ui) wie die übrigen Seiten, und die Kandidatenliste
// nutzt die Bausteine von st-redesign.js nur, wenn sie vorhanden sind (sonst die vorige Oberfläche).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { HOME_HEAD, STOCK_PRELOAD_SCRIPTS } from '../build.mjs';

const SRC = (f) => fs.readFileSync(new URL('../../../' + f, import.meta.url), 'utf8');
const ST = SRC('supertrader/assets/supertrader.js'), RED = SRC('supertrader/assets/st-redesign.js'), SF = SRC('supertrader/assets/sf-research.js');

function stampedWith(preloadedBare) {
  const src = ST.slice(ST.indexOf('  var ASSET_V = '), ST.indexOf('  var SCRIPT_P = {};'));
  assert.ok(src.length > 100, 'ASSET_V, PAIR_BARE und stamped() stehen vor loadScript');
  const ctx = { BASE: '/supertrader/', document: { querySelector: (sel) => (preloadedBare && sel === 'link[rel="preload"][as="script"][href="/supertrader/assets/st-redesign.js"]' ? {} : null) } };
  vm.runInNewContext(src + '\nthis.out = { stamped: stamped, v: ASSET_V };', ctx);
  return ctx.out;
}

test('ASSET-MARKER-1: eine Kennung für Modul und Stylesheet; fremde Dateien und bereits gestempelte Adressen bleiben unberührt', () => {
  const { stamped, v } = stampedWith(false);
  assert.match(v, /^st-[0-9a-z.-]{4,40}$/);
  for (const f of ['st-redesign.js', 'st-redesign.css', 'sf-research.js', 'sf-research.css', 'st-names.js', 'st-flow.js']) assert.equal(stamped('/supertrader/assets/' + f), '/supertrader/assets/' + f + '?v=' + v, f);
  assert.equal(stamped('/assets/vu-ui.js?v=vu-ui-1.4.0'), '/assets/vu-ui.js?v=vu-ui-1.4.0');
  assert.equal(stamped('/assets/vu-chart.js'), '/assets/vu-chart.js');
  assert.equal(stamped('/core/identity.js'), '/core/identity.js');
  assert.equal(stamped('/supertrader/assets/st-redesign.js?v=x'), '/supertrader/assets/st-redesign.js?v=x');
});

test('ASSET-MARKER-2: kündigt die Seite st-redesign.js ohne Kennung an (Start, Aktienseite), bleibt das Paar st-redesign.js/.css ohne Kennung', () => {
  const { stamped, v } = stampedWith(true);
  assert.equal(stamped('/supertrader/assets/st-redesign.js'), '/supertrader/assets/st-redesign.js');
  assert.equal(stamped('/supertrader/assets/st-redesign.css'), '/supertrader/assets/st-redesign.css');
  assert.equal(stamped('/supertrader/assets/sf-research.css'), '/supertrader/assets/sf-research.css?v=' + v);
  // die erzeugten Seiten kündigen das Modul weiter ohne Kennung an (kein Neubau von rund 5.000 Aktienseiten)
  assert.ok(STOCK_PRELOAD_SCRIPTS.includes('/supertrader/assets/st-redesign.js'));
  assert.ok(HOME_HEAD.includes('<link rel="preload" href="/supertrader/assets/st-redesign.js" as="script">'));
  assert.ok(HOME_HEAD.includes('<link rel="stylesheet" href="/supertrader/assets/st-redesign.css">'));
});

test('ASSET-MARKER-3: loadScript und loadCss hängen die Kennung nur an, wenn kein Preload bzw. kein Stylesheet der Seite genutzt wird', () => {
  assert.match(ST, /s\.src = pre \? pre\.href : stamped\(src\);/);
  assert.match(ST, /if \(fresh\) link = h\('link', \{ rel: 'stylesheet', href: stamped\(href\) \}\);/);
  // beide Dateien des Paars gehen durch dieselben Lader
  assert.match(ST, /loadCss\(BASE \+ 'assets\/st-redesign\.css'\)/);
  assert.match(ST, /loadScript\(BASE \+ 'assets\/st-redesign\.js'\)/);
});

test('BEISPIEL-VU-UI: das historische Beispiel lädt vu-ui und das Seitenmodul wie die übrigen Seiten; ohne Modul bleibt die bisherige Ansicht', () => {
  assert.doesNotMatch(ST, /var UI = page === 'replay'/);
  assert.match(ST, /var UI = Promise\.all\(\[loadCss\('\/assets\/vu-ui\.css\?v=vu-ui-1\.4\.0'\), loadCss\(BASE \+ 'assets\/st-redesign\.css'\), loadScript\('\/assets\/vu-ui\.js\?v=vu-ui-1\.4\.0'\)/);
  assert.match(RED, /render: \{[^}]*\breplay: replay\b[^}]*\}/);
  assert.match(ST, /replay: renderReplay/, 'Rückfall: bisherige Ansicht');
  const replay = RED.slice(RED.indexOf('  function replay(D, X) {'), RED.indexOf('  function step(n, t, s)'));
  // Kennzeichnungen des Beispiels stehen wörtlich in der neuen Ansicht
  for (const t of ['Historisches Beispiel', 'Nicht im Protokoll der Musterdepots, in keiner Kennzahl, kein Rat. Auswahl nach fester Regel, nicht nach Ergebnis: ', 'Ergebnis dieses Beispiels', 'Ein Einzelfall – keine Aussage über die Methode.', ' vor Kosten nach ', '. Kein aktueller Treffer.', 'U.next(']) assert.ok(replay.includes(t), t);
  assert.match(replay, /class="st-demo-banner/);
});

test('KANDIDATENLISTE-KIT: Kacheln und Fenster nur mit den Bausteinen aus vu-ui.js und st-redesign.js; sonst die vorige Oberfläche', () => {
  assert.match(RED, /kit: \{ version: 1, page: page, sh: sh,/);
  assert.match(SF, /function kitOk\(\) \{/);
  assert.match(SF, /kit = KIT = kitOk\(\)/);
  assert.match(SF, /\} else if \(window\.VUUI\) \{/, 'vorige Oberfläche bleibt als Rückfall');
  // die Kachel trägt die Stufe (data-stage) und das Urteil; der Plan steht nur im Fenster, über dieselbe Stelle wie in der Karte
  const row = SF.slice(SF.indexOf('  function tileRow('), SF.indexOf('  function stageTiles('));
  assert.match(row, /data-stage="' \+ e\(v\.stage\) \+ '"/);
  assert.match(row, /U\.verdict\(sv\[0\], sv\[1\]\)/);
  assert.doesNotMatch(row, /v\.plan|p\.stop|p\.trigger/, 'keine Marke des modellierten Ablaufs in der Kachel');
  const sheet = SF.slice(SF.indexOf('  function candSheet('), SF.indexOf('  /* ----------------------------------------------- Kandidatenkarte */'));
  assert.match(sheet, /card\(v, s, L, \{ parts: true \}\)/);
  assert.match(sheet, /e\(DISCLAIMER\)/);
});
