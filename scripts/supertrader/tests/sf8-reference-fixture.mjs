// Supertrader 8.0 – Testhilfe: veröffentlichte Tagesreihe (Form discover-series-1.1.0) aus Tagesbalken, gerundet mit
// der Rundungsregel der Veröffentlichung (quant/engines/published-close.js#roundClose). Nur für Tests (V4).
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PublishedClose = createRequire(import.meta.url)(path.join(ROOT, 'quant/engines/published-close.js'));

export function referenceFromBars(sec, over = {}) {
  const bars = sec.bars || [];
  return {
    schemaVersion: PublishedClose.SCHEMA, status: 'CALCULATED', source: 'tiingo', provider: 'tiingo', dataMode: 'real',
    priceSeriesType: PublishedClose.BASIS, currency: 'USD', grain: 'daily', publishBasis: 'fixture',
    securityId: sec.id, ticker: sec.ticker, instrumentId: sec.ticker, asOf: bars.at(-1)?.date ?? null,
    points: bars.map((b) => [b.date, PublishedClose.roundClose(b.close)]), ...over,
  };
}
