// Aktienbasis der Bewertung (scripts/discover/build-discover-data.mjs, valuationOf).
// Prueft die AUSGELIEFERTEN Daten: keine Marktkapitalisierung aus veralteter,
// fremder oder unplausibler Aktienbasis. Anlass und Messwerte vom 29.09.2026:
// Chewy 1 827 $, TSMC 11,7 Bio. $, LATAM 30 Bio. $, Tempus AI 15 Mio. $.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../data/stocks/US_REAL/', import.meta.url).pathname;
const load = (s) => JSON.parse(readFileSync(join(dir, s + '.json'), 'utf8'));
const has = (s) => existsSync(join(dir, s + '.json'));
const REASONS = new Set(['NON_USD_REPORTING', 'FOREIGN_FILER', 'IMPLAUSIBLE_SHARE_BASIS', 'NO_CURRENT_SHARE_COUNT',
  'SHARE_BASIS_UNVERIFIED', 'ADR_RATIO_UNVERIFIED', 'REPORTING_TRADING_CURRENCY_MISMATCH']);

test('Marktkapitalisierung nur aus passender, aktueller Aktienbasis', () => {
  let checked = 0;
  for (const f of readdirSync(dir)) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const v = d.fundamentals && d.fundamentals.valuation;
    if (!v) continue;
    if (v.marketCapReason) { assert.ok(REASONS.has(v.marketCapReason), f + ' ' + v.marketCapReason); assert.equal(v.marketCap, undefined, f); }
    if (!v.marketCap) continue;
    checked++;
    const m = v.marketCap.value, dv = d.qualification && d.qualification.avgDollarVolume20d;
    assert.ok(m > 0 && m < 7e12, f + ' ' + m);
    if (dv) assert.ok(dv / m <= 1 && dv / m >= 2e-5, f + ' Umsatzquote ' + dv / m);
    const units = d.fundamentals.units || {};
    const cur = units.revenue || units.net_income || units.stockholders_equity || units.total_assets;
    if (cur) assert.equal(cur, 'USD', f);
  }
  assert.ok(checked > 3000, 'zu wenige Bewertungen: ' + checked);
});

test('Bekannte Faelle: korrigiert oder zurueckgehalten', () => {
  const cap = (s) => load(s).fundamentals.valuation.marketCap?.value ?? null;
  if (has('CHWY')) assert.ok(cap('CHWY') > 1e9, 'Chewy aus aktueller Aktienzahl');
  if (has('HNGE')) assert.ok(cap('HNGE') > 1e9, 'Hinge Health aus verwaesserter Aktienzahl');
  for (const s of ['TSM', 'LTM', 'BHP', 'TEM']) if (has(s)) {
    const v = load(s).fundamentals.valuation;
    assert.equal(v.marketCap, undefined, s); assert.ok(REASONS.has(v.marketCapReason), s);
    assert.equal(v.pe, undefined, s + ' kein KGV aus fremder Basis');
  }
});
