// Vertrag der Barrierefreiheits-Pruefung (scripts/quality/a11y-axe-qa.mjs): Seitenliste, Basis und CI-Einbindung.
// Die Pruefung selbst laeuft im Job shell-browser-qa (chromium-390) gegen den gebauten Stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const script = read('scripts/quality/a11y-axe-qa.mjs');

test('A11Y-1: die geforderten Seiten stehen in der Liste', () => {
  for (const p of ["'/'", "'/willkommen/'", "'/discover/#/'", "'/discover/#/suche'", "'/discover/#/s/EUROPE/'", "'/quant/#/'", "'/quant/#/aktie/NVDA'",
    "'/technical/#/'", "'/supertrader/'", "'/mein-dashboard/'", "'/konto/'"]) assert.ok(script.includes(p), 'Seite fehlt: ' + p);
  assert.match(script, /hell|light/);
  assert.ok(script.includes("'1440x900,390x844'"), 'Desktop und 390 px');
});

test('A11Y-2: Basis ist gueltig und enthaelt nur serious/critical-Regeln je Seite', () => {
  const b = JSON.parse(read('scripts/quality/a11y-baseline.json'));
  const pages = [...script.matchAll(/^\s*\['([a-z0-9-]+)', '/gm)].map((m) => m[1]);
  for (const [page, rules] of Object.entries(b)) {
    if (page.startsWith('_')) continue;
    assert.ok(pages.includes(page), 'unbekannte Seite in der Basis: ' + page);
    for (const [rule, n] of Object.entries(rules)) { assert.match(rule, /^[a-z0-9-]+$/); assert.ok(Number.isInteger(n) && n > 0, `${page}/${rule}`); }
  }
});

test('A11Y-3: CI fuehrt die Pruefung strikt mit Basis aus und pinnt axe-core', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /a11y-axe-qa\.mjs[^\n]*--baseline=scripts\/quality\/a11y-baseline\.json[^\n]*--strict/);
  assert.match(ci, /playwright@1\.56\.1 axe-core@4\.10\.3/);
  const checks = read('scripts/ci/ci-checks.json');
  assert.ok(checks.includes('scripts/quality/a11y-axe-qa.mjs') && checks.includes('scripts/quality/a11y-baseline.json'));
  assert.equal(ci.split("'scripts/quality/a11y-axe-qa.mjs'").length - 1, 2, 'Pfad in pull_request und push');
});

test('A11Y-4: Befundliste ist vorhanden', () => { assert.ok(existsSync(new URL('../../docs/quality/A11Y_BEFUNDE.md', import.meta.url))); });
