// Regression: Ein-/Ausstiegsblock der Strategy Lens muss auf kleinen Handys (iPhone 14, 664 px
// Viewport minus 64 px Produkt-Leiste, siehe browser-qa.mjs) ohne Scrollen sichtbar bleiben.
// Die Messung selbst macht browser-qa.mjs im Browser; dieser Test haelt nur die dafuer noetigen
// Kompaktregeln im mobilen Media-Block fest (CORT lag mit 602 px knapp ueber der Grenze 600 px;
// ILMN und PRSU 22.10.2026 siehe unten).
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

test('Lens mobil: der naechste Schritt steht vor jedem Zellenraster (Position und vorbereitetes Setup)', () => {
  // IOVA 21.10.2026: Positionsgroesse als vierte Zelle -> 2x2-Raster, .st-next unten bei 720 px (Grenze 600 px).
  // ILMN 22.10.2026: vorbereitetes Setup (3 Zellen) -> .st-next unten bei 619 px; 57 von 340 Setup-Seiten betroffen.
  const m = mobileBlock();
  assert.match(m, /\.st-lensblock > \.st-cells,\s*\.st-lensblock > \.st-cells ~ :not\(\.st-next\):not\(\.st-clamp-wrap\) \{ order: 1; \}/);
  // nur mobil: ausserhalb des Media-Blocks keine Umordnung
  assert.equal(css.replace(m, '').includes('.st-cells ~'), false);
});

test('Lens mobil: naechster Schritt kompakt, Text vollstaendig (Kennzeile und Datenstand in einer Zeile)', () => {
  // PRSU 22.10.2026: Modellposition mit sechszeiliger Halte- und Ausstiegsregel, unten bei 624 px.
  const m = mobileBlock();
  assert.match(m, /\.st-lensblock \.st-next \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(m, /\.st-lensblock \.st-next \.r \{ grid-area: 1 \/ 2;/);
  assert.match(m, /\.st-lensblock \.st-next p \{ grid-column: 1 \/ -1; line-height: 1\.35; \}/);
  // kein Text wird abgeschnitten oder versteckt
  assert.equal(/\.st-next[^{]*\{[^}]*(display: none|line-clamp|overflow: hidden|text-overflow)/.test(m), false);
});

test('Browser-QA prueft den ersten Bildschirm fuer Lens, Position und vorbereitetes Setup', () => {
  const qa = fs.readFileSync(new URL('../browser-qa.mjs', import.meta.url), 'utf8');
  assert.match(qa, /\(name === 'lens' \|\| name === 'lens-position' \|\| name === 'lens-prepared'\) && isMobile/);
  assert.match(qa, /routes\.push\(\['lens-prepared'/);
  // die Grenze bleibt die volle Viewport-Hoehe minus Produkt-Leiste (keine Lockerung)
  assert.match(qa, /m\.lensPlanBottom <= vp\.viewport\.height - 64/);
});
