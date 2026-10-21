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

test('Lens mobil: bei Modellposition (4 Zellen) steht der naechste Schritt vor dem Zellenraster', () => {
  // IOVA 21.10.2026: Positionsgroesse als vierte Zelle -> 2x2-Raster, .st-next unten bei 720 px (Grenze 600 px).
  const m = mobileBlock();
  assert.match(m, /\.st-lensblock > \.st-cells\.four,\s*\.st-lensblock > \.st-cells\.four ~ :not\(\.st-next\):not\(\.st-clamp-wrap\) \{ order: 1; \}/);
  // nur mobil: ausserhalb des Media-Blocks keine Umordnung
  assert.equal(css.replace(m, '').includes('.st-cells.four ~'), false);
});

test('Browser-QA prueft den ersten Bildschirm auch fuer die Lens im Positionszustand', () => {
  const qa = fs.readFileSync(new URL('../browser-qa.mjs', import.meta.url), 'utf8');
  assert.match(qa, /\(name === 'lens' \|\| name === 'lens-position'\) && isMobile/);
});

