// Regression: Ein-/Ausstiegsblock der Strategy Lens muss auf kleinen Handys (iPhone 14, 664 px
// Viewport minus 64 px Produkt-Leiste, siehe browser-qa.mjs) ohne Scrollen sichtbar bleiben.
// Die Messung selbst macht browser-qa.mjs im Browser; dieser Test haelt nur die dafuer noetigen
// Kompaktregeln im mobilen Media-Block fest (CORT lag mit 602 px knapp ueber der Grenze 600 px).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../../supertrader/assets/supertrader.css', import.meta.url), 'utf8');

function mobileBlock() {
  const start = css.indexOf('@media (max-width: 640px) {\n  .st-hero');
  assert.ok(start >= 0, 'mobiler Media-Block der Lens fehlt');
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error('Media-Block nicht geschlossen');
}

test('Lens mobil: Kopf und Block sind kompakt gesetzt', () => {
  const m = mobileBlock();
  assert.match(m, /\.st-lens-h \{ padding: 8px 0 2px; \}/);
  assert.match(m, /\.st-lensblock \{ gap: 6px; padding: 10px; \}/);
  assert.match(m, /\.st-lensblock \.r1 \{ row-gap: 4px; \}/);
  assert.match(m, /\.st-lensblock \.st-next \{ padding: 8px 10px; \}/);
  assert.match(m, /\.st-lensblock \.st-cells \.c \{ padding: 7px 8px; \}/);
});
