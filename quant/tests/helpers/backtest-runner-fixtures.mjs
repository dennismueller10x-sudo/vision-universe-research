// Synthetic, deterministic inputs for the research backtest runner tests (test seam options.deps).
// Nothing here is real market data; the runner cannot tell, so these tests check mechanics, contracts and gates only.
import crypto from 'node:crypto';

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export const TICKERS = ['SYNA', 'SYNB', 'SYNC', 'SYND', 'SYNE', 'SYNF'];

function fridays(from, to) {
  const out = []; let t = Date.parse(from + 'T00:00:00Z');
  while (t <= Date.parse(to + 'T00:00:00Z')) { out.push(new Date(t).toISOString().slice(0, 10)); t += 7 * 86400000; }
  return out;
}
function walk(seed, n, drift) {
  let x = seed >>> 0 || 1, p = 20 + (seed % 50);
  const out = [];
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const u = x / 4294967296 - 0.5;
    p = Math.max(0.5, p * (1 + drift + 0.09 * u + 0.04 * Math.sin(i / (9 + seed % 7))));
    out.push(Math.round(p * 10000) / 10000);
  }
  return out;
}
export function syntheticWorld({ to = '2026-10-23', extraTicker = null } = {}) {
  const calendar = fridays('2000-01-07', to);
  const docs = new Map();
  const tickers = extraTicker ? [...TICKERS, extraTicker] : TICKERS;
  tickers.forEach((t, k) => {
    const id = 'ref_' + t, closes = walk(1000 + 97 * k, calendar.length, (k - 2) * 0.0006);
    const points = calendar.map((d, i) => [d, closes[i]]);
    docs.set(id, { securityId: id, ticker: t, listingId: 'tiingo:NASDAQ:' + t + ':2000-01-07', listingStart: '2000-01-07', identityHash: sha('identity|' + id), masterGeneratedAt: '2026-10-01T00:00:00Z',
      asOf: to, points, sourceBytesHash: sha(JSON.stringify(points)), corporateActionQuality: { status: 'CLEAN', items: [] }, corporateActions: { splits: [] }, warnings: ['SYNTHETIC_TEST_FIXTURE'] });
  });
  const spy = walk(7, calendar.length, 0.0012);
  const benchmark = { byDate: new Map(calendar.map((d, i) => [d, spy[i]])), provenance: { sourceBytesHash: sha('spy-fixture'), sourcePath: 'fixture' } };
  const frameIds = [...docs.keys()].sort();
  const summary = { calendar, frameIds, frameSize: frameIds.length, populationHash: sha('population|' + frameIds.join(',') + '|' + to),
    inputHashes: { calendarHash: sha(calendar.join(',')), calendarLength: calendar.length, sourceManifestHash: sha('manifest'), masterHash: sha('master'), registers: {}, pointsHashRoot: sha('points') },
    dataQuality: { warnings: ['SYNTHETIC_TEST_FIXTURE'] } };
  const population = () => ({ summary, frameSet: new Set(frameIds), docOf: id => { const d = docs.get(id); if (!d) throw Error('SERIES_FILE_MISSING'); return d; },
    tryLoad: id => docs.has(id) ? { doc: docs.get(id) } : { error: 'SERIES_FILE_MISSING' } });
  return { calendar, docs, benchmark, population };
}
export function baseSpec(kind, extra = {}) {
  return { schemaVersion: 'backtest-runner-spec-1.0.0', id: 'test-' + kind.toLowerCase(), version: '1.0.0', registeredAt: '2026-10-29T00:00:00Z', kind, asOf: '2024-12-31',
    window: { from: '2015-01-01', to: '2019-12-31' }, population: { profile: 'V10_PRIMARY', tickers: TICKERS }, costs: { feeBps: 5, slippageBps: 5 }, benchmark: 'SPY', ...extra };
}
export const NEAR_HIGH = { id: 'NEAR_HIGH', version: '1.0.0', terms: [{ feature: 'distanceTo52wHigh', operator: 'gte', value: -0.05 }] };
export function fakeCertified(kind, gateState = 'PASS') {
  return { schemaVersion: 'backtest-certification-1.0.0', asOf: '2026-10-29', kinds: [{ id: kind, label: kind, tier: 'TESTED', gates: [{ id: 'pit', label: 'pit', category: 'HARD', state: gateState, value: null, required: null, reason: gateState === 'PASS' ? null : 'PIT' }],
    trust: 'USABLE', published: true, ownerApproval: { required: false, given: false }, minimumTrust: 'USABLE', status: 'CERTIFIED', readiness: 'CERTIFICATION_READY', reason: null, blockers: [] }] };
}
