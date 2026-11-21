import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src = readFileSync(new URL('../global-live-qa.mjs', import.meta.url), 'utf8');

test('GQ-US US-Suchtreffer oeffnen die Aktien-Vorschau; die QA prueft sie und geht dann ueber die Lesezeichen-Route weiter (21.11.2026)', () => {
  /* v3.js openStock: ein US-Treffer oeffnet VUStockSheet und aendert den Hash NICHT. Die QA wartete 60 s auf #/s/US_REAL/<T>. */
  assert.match(src, /if\(region==='US_REAL'\)\{[^]*?\.vu-sheet-ui'\)\.filter\(\{hasText:id\}\)\.first\(\)\.waitFor\(\)/, 'Vorschau mit dem Kuerzel pruefen');
  assert.match(src, /keyboard\.press\('Escape'\)[^]*?waitFor\(\{state:'hidden'\}\)/, 'Vorschau schliessen, sonst verdeckt sie den Watchlist-Knopf');
  assert.match(src, /location\.hash=h;\},'#\/s\/'\+region\+'\/'\+id\)/, 'Lesezeichen-Route oeffnen');
  assert.ok(src.indexOf("if(region==='US_REAL')") < src.indexOf("waitForURL('**/#/s/'+region+'/'+id)"), 'erst Vorschau, dann URL-Pruefung');
});
