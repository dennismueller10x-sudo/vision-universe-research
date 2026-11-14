// Themen-Symbole (Owner 14.11.2026: „erstmal nur mit Icons arbeiten und die Bilder ausblenden“). Je Themenwelt ein
// Symbol im Sprite assets/theme-icons.svg, id = Slug aus discover/themes.js. Diese Tests sichern, dass kein Thema ohne
// Symbol bleibt, dass alle Symbole eine Handschrift haben (Raster 24, Linie 1.7, currentColor, keine Schrift, kein
// Verlauf) und dass Discover das Symbol ueber den gemeinsamen Baustein (VUUI.themeHud) zeigt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = new URL('../../', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, ROOT), 'utf8');
const U = createRequire(import.meta.url)('../../assets/vu-ui.js');
const sprite = read('assets/theme-icons.svg');
const STYLE = '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">';

function themes() {
  const ctx = { VUDiscover: {} }; ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInNewContext(read('discover/themes.js'), ctx);
  return ctx.VUDiscover.Views.Themes.all;
}
const symbols = [...sprite.matchAll(/<symbol id="([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g)].map((m) => ({ id: m[1], viewBox: m[2], body: m[3] }));

test('jede Themenwelt hat genau ein Symbol, kein Symbol ohne Themenwelt', () => {
  const slugs = Array.from(themes(), (t) => t.slug);
  assert.equal(slugs.length, 54);
  assert.deepEqual(symbols.map((s) => s.id), slugs, 'Sprite folgt der Themenliste (Reihenfolge wie discover/themes.js)');
  assert.equal((sprite.match(/<symbol\b/g) || []).length, symbols.length, 'jedes <symbol> hat id und viewBox');
});

test('eine Handschrift: Raster 24, Linie 1.7, currentColor, nur einfache Formen', () => {
  for (const s of symbols) {
    assert.equal(s.viewBox, '0 0 24 24', s.id);
    assert.ok(s.body.startsWith(STYLE) && s.body.endsWith('</g>'), s.id + ': Zeichenstil');
    const inner = s.body.slice(STYLE.length, -4);
    assert.ok(inner.length > 20, s.id + ' ist leer');
    for (const tag of inner.match(/<\/?([a-zA-Z]+)/g) || []) assert.match(tag, /^<\/?(path|circle|rect|ellipse|g)$/, s.id + ': ' + tag);
    assert.doesNotMatch(inner, /#[0-9a-f]{3,8}\b|rgb\(|url\(|style=|stroke-width|<text|Gradient/i, s.id + ': eigene Farbe, Schrift oder Verlauf');
    for (const f of inner.match(/fill="[^"]*"/g) || []) assert.equal(f, 'fill="currentColor"', s.id);
  }
});

test('kein Symbol doppelt: jede Themenwelt ist an ihrem Symbol erkennbar', () => {
  const seen = new Map();
  for (const s of symbols) {
    assert.ok(!seen.has(s.body), s.id + ' gleicht ' + seen.get(s.body));
    seen.set(s.body, s.id);
  }
});

test('der Baustein zeigt das Symbol aus dem Sprite auf neongruener Kachel', () => {
  const html = U.themeHud('kernenergie-uran', 74, 22);
  assert.match(html, /^<span class="vu-hud vu-hud--lime" style="--vu-hud:74px;border-radius:22px"><svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="\/assets\/theme-icons\.svg#kernenergie-uran"\/><\/svg><\/span>$/);
  assert.doesNotMatch(U.themeIcon('"><script>'), /<script>/, 'Slug wird maskiert');
  const css = read('assets/vu-ui.css');
  assert.match(css, /\.vu-hud--lime\{background:var\(--vu-lime\);color:#000\}/);
  assert.match(css, /\.vu-theme\{[^}]*background:var\(--vu-card\);color:var\(--vu-ink\)/, 'Kachel folgt Hell und Dunkel');
});

test('Discover zeigt Themen ueber den Baustein: Kachel, Zeile, Themenkopf, Kapitel-Bildchen', () => {
  const v3 = read('discover/ui/v3.js'), ov = read('discover/ui/overview.js');
  assert.match(v3, /function themeCard\(t, ctx, o\) \{[\s\S]*?U\(\)\.themeHud\(t\.slug, 74, 22\)/);
  assert.match(v3, /thumb \? U\(\)\.themeHud\(t\.slug, 56, 16\) : U\(\)\.themeHud\(t\.slug, 36, 11\)/, 'jede Zeile der Themenwelten traegt ihr Symbol');
  assert.match(v3, /<header class="dv3-themehead">[\s\S]{0,80}U\(\)\.themeHud\(theme\.slug, 74, 22\)/);
  assert.match(ov, /U\(\)\.themeHud\(th\.slug, 34, 10\)/);
  for (const src of [v3, ov]) assert.doesNotMatch(src, /<img[^>]*photo/);
});
