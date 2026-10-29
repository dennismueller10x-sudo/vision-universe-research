// Supertrader 8.0 – Ansichten der quellentreuen Research-Kandidaten (Beta seit 29.10.2026): das Modul bindet keinen
// Produktvertrag oder Producer ein und zeigt jeden Stand datiert.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ST = fs.readFileSync(new URL('../../../supertrader/assets/supertrader.js', import.meta.url), 'utf8');
const SF = fs.readFileSync(new URL('../../../supertrader/assets/sf-research.js', import.meta.url), 'utf8');

// Owner-Freigabe 29.10.2026 (kontrollierter Livegang als Beta): das Modul lädt ohne Vorschau-Schalter, aber nur auf Start,
// Methoden und Aktienseite. Ob Kandidaten erscheinen, entscheidet allein der freigegebene Datenlauf (Leerzustand sonst).
test('SF8-BETA-MOUNT: mountResearch lädt das Modul ohne Schalter, nur auf Start, Methoden und Aktienseite', () => {
  const fn = ST.slice(ST.indexOf('  function mountResearch()'), ST.indexOf('  /* ============================================================= BOOT */'));
  const run = (page, search) => {
    const loaded = [];
    const ctx = { location: { search }, URLSearchParams, page, BASE: '/supertrader/', main: {}, SYM: '', window: {}, Promise,
      loadCss: (x) => loaded.push(x), loadScript: (x) => { loaded.push(x); return Promise.resolve(); } };
    vm.runInNewContext(fn + '\nmountResearch();', ctx);
    return loaded;
  };
  for (const p of ['home', 'strategies', 'stock']) assert.deepEqual(run(p, ''), ['/supertrader/assets/sf-research.css', '/supertrader/assets/sf-research.js'], p);
  for (const p of ['signals', 'strategy', 'backtests', 'house', 'sources']) assert.deepEqual(run(p, ''), [], p);
  assert.doesNotMatch(ST, /sfPreview|vu-supertrader-sf-preview/, 'kein interner Vorschau-Parameter mehr');
});

test('SF8-BETA-DATED: Beta-Kennzeichnung mit Datenstand; ein älterer Stand heißt ausdrücklich „nicht aktuell“, nie „heute“', () => {
  assert.match(SF, /'Beta · Research, keine Empfehlung'/);
  assert.match(SF, /' – nicht aktuell, kein Hinweis für heute'/);
  assert.match(SF, /function stale\(sum\) \{ return !!\(sum && sum\.nextSession && new Date\(\)\.toISOString\(\)\.slice\(0, 10\) > String\(sum\.nextSession\)/);
  assert.doesNotMatch(SF, /'Heute erkannte Aktien'|erkennt heute|text: 'heute'|Vorschau · noch nicht freigeschaltet/);
  assert.match(SF, /Tiingo, Inc\./, 'Quelle der Kurse genannt (Lizenzbedingung)');
  // jede Ansicht mit Daten trägt die datierte Beta-Zeile
  assert.equal((SF.match(/previewBanner\(sum\)/g) || []).length - (SF.match(/function previewBanner\(sum\)/g) || []).length, 5, 'fünf Aufrufe (Start, Methoden, Strategie, Aktie mit und ohne Treffer)');
  assert.doesNotMatch(SF, /previewBanner\(\)/);
});

test('SF8-PREVIEW-ISOLATION: Modul liest nur Datendateien, keinen Vertrag, keinen Producer, keine Signal-Sprache', () => {
  assert.doesNotMatch(SF, /candidate-contract|source-faithful|build-candidates/);
  const strings = (SF.match(/'(?:[^'\\]|\\.)*'/g) || []).join(' ').replace(/keine Kauf- oder Verkaufsempfehlung/g, '');
  assert.doesNotMatch(strings, /\bsignal|validiert|kaufen|kaufsignal/i);
});
