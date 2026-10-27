// Supertrader 8.0 – die Ansichten der quellentreuen Research-Kandidaten sind ohne Owner-Freigabe AUS (Review H1):
// supertrader.js laedt sf-research.js nur mit Vorschau-Schalter; das Modul bindet keinen Produktvertrag oder Producer ein.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ST = fs.readFileSync(new URL('../../../supertrader/assets/supertrader.js', import.meta.url), 'utf8');
const SF = fs.readFileSync(new URL('../../../supertrader/assets/sf-research.js', import.meta.url), 'utf8');

test('SF8-PREVIEW-DEFAULT-OFF: mountResearch kehrt ohne Vorschau-Schalter sofort zurück', () => {
  const fn = ST.slice(ST.indexOf('  var SF_PREVIEW_KEY'), ST.indexOf('  /* ============================================================= BOOT */'));
  const run = (search, stored) => {
    const store = new Map(stored ? [['vu-supertrader-sf-preview', stored]] : []), loaded = [];
    const ctx = { location: { search }, URLSearchParams, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }, page: 'home', BASE: '/supertrader/', main: {}, SYM: '', window: {}, Promise,
      loadCss: (x) => loaded.push(x), loadScript: (x) => { loaded.push(x); return Promise.resolve(); } };
    vm.runInNewContext(fn + '\nmountResearch();', ctx);
    return loaded;
  };
  assert.deepEqual(run('', null), []);
  assert.deepEqual(run('?sfPreview=0', '1'), []);
  assert.deepEqual(run('?sfPreview=1', null), ['/supertrader/assets/sf-research.css', '/supertrader/assets/sf-research.js']);
  assert.deepEqual(run('', '1').length, 2);
});

test('SF8-PREVIEW-ISOLATION: Modul liest nur Datendateien, keinen Vertrag, keinen Producer, keine Signal-Sprache', () => {
  assert.doesNotMatch(SF, /candidate-contract|source-faithful|build-candidates/);
  const strings = (SF.match(/'(?:[^'\\]|\\.)*'/g) || []).join(' ').replace(/keine Kauf- oder Verkaufsempfehlung/g, '');
  assert.doesNotMatch(strings, /\bsignal|validiert|kaufen|kaufsignal/i);
});
