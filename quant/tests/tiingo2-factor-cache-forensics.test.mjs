import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('cache forensics separates an adjusted-history restatement from raw prices and provider actions', () => {
  const root = mkdtempSync(join(tmpdir(), 'tiingo2-cache-compare-'));
  try {
    const oldCache = join(root, 'old');
    const newCache = join(root, 'new');
    const affected = JSON.parse(readFileSync(new URL('../../docs/tiingo2-surgical/factor_affected30.json',
      import.meta.url), 'utf8'));
    for (const cache of [oldCache, newCache]) {
      mkdirSync(join(cache, 'tiingo/daily'), { recursive: true });
      for (const ticker of affected.tickers) {
        const bars = ['2026-10-01', '2026-10-02'].map((date, at) => ({
          date, open: 10 + at, high: 11 + at, low: 9 + at, close: 10 + at,
          volume: 1000, adjustedOpen: 10 + at, adjustedHigh: 11 + at,
          adjustedLow: 9 + at, adjustedClose: 10 + at, adjustedVolume: 1000,
          splitFactor: 1, dividend: 0,
        }));
        if (cache === newCache && ticker === 'ADTN') bars[1].adjustedClose = 10.9;
        writeFileSync(join(cache, 'tiingo/daily/ref_' + ticker + '.json'), JSON.stringify({
          securityId: 'ref_' + ticker, provider: 'tiingo', adjustmentStatus: 'adjusted', bars,
        }));
      }
    }
    const reportPath = join(root, 'report.json');
    execFileSync(process.execPath, [new URL('../../scripts/market/inspect-adjustment-caches.mjs',
      import.meta.url).pathname, '--old-cache', oldCache, '--new-cache', newCache,
      '--affected', new URL('../../docs/tiingo2-surgical/factor_affected30.json',
        import.meta.url).pathname, '--out', reportPath]);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(report.count, 30);
    const changed = report.rows.find((row) => row.ticker === 'ADTN').transition.changes;
    assert.equal(changed.raw.count, 0);
    assert.equal(changed.adjusted.count, 1);
    assert.equal(changed.actions.count, 0);
    for (const row of report.rows.filter((item) => item.ticker !== 'ADTN')) {
      assert.equal(row.transition.changes.adjusted.count, 0, row.ticker);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
