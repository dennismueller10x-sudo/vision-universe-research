/** Read-only real probe analysis. Never upgrades adjustment trust or changes data. */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import Adapter from '../../providers/marketstack/adapter.js';
import { EXCHANGE_MICS, comparePriceSeries, symbolVariants } from './benchmark-marketstack-us.mjs';
const dateOf = row => String(row.date || '').slice(0, 10);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const countBy = (rows, fn) => rows.reduce((out, row) => { const k = fn(row) || 'UNKNOWN'; out[k] = (out[k] || 0) + 1; return out; }, {});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function summarizeUSProbe(probe, options) {
  if (!Array.isArray(probe?.endpoints) || !options?.resolveReference) throw new Error('Probe and canonical reference resolver required');
  const measurements = [];
  for (const endpoint of probe.endpoints.filter(e => ['us-eod', 'us-qualified-eod', 'corporate-action-window'].includes(e.label))) {
    const symbol = endpoint.params.symbols;
    const sourceRows = endpoint.data?.data || [];
    const reference = options.resolveReference(symbol);
    const row = { symbol, kind: endpoint.label, from: endpoint.params.date_from, to: endpoint.params.date_to,
      checkedAt: endpoint.checkedAt, endpointSucceeded: endpoint.ok, providerBars: sourceRows.length,
      paginationComplete: endpoint.ok && sourceRows.length === endpoint.data?.pagination?.total,
      providerCurrencies: countBy(sourceRows, r => r.price_currency || 'ABSENT'),
      providerMics: countBy(sourceRows, r => r.exchange || 'ABSENT'),
      referenceSource: reference?.source || null, referenceBasis: reference?.basis || null,
      referenceSha256: reference?.sourceSha256 || null,
      status: !endpoint.ok ? 'ENDPOINT_ERROR' : !sourceRows.length ? 'EMPTY_RESPONSE' : !reference ? 'REFERENCE_UNAVAILABLE' : 'PENDING',
      anomalies: [], providerActionObservations: sourceRows.filter(r => (finite(r.split_factor) && r.split_factor !== 1) || (finite(r.dividend) && r.dividend !== 0))
        .map(r => ({ date: dateOf(r), splitFactor: r.split_factor ?? null, dividend: r.dividend ?? null })),
      acceptedBars: 0, comparison: null, adjustedDiagnostic: null };
    if (!reference || !sourceRows.length || !endpoint.ok) { measurements.push(row); continue; }
    const mapping = { securityId: reference.securityId, symbol, exchange: reference.mic, mic: reference.mic,
      currency: reference.currency, assetType: reference.assetType || 'equity' };
    const valid = []; const dates = new Set();
    for (const raw of sourceRows) {
      const result = Adapter.normalizeBar(reference.securityId, raw, mapping, { retrievedAt: endpoint.checkedAt });
      if (!result.ok) { row.anomalies.push({ date: dateOf(raw), reason: result.reason,
        reportedCurrency: raw.price_currency || null, reportedMic: raw.exchange || null }); continue; }
      if (dates.has(result.bar.date)) { row.anomalies.push({ date: result.bar.date, reason: 'duplicateCandle' }); continue; }
      dates.add(result.bar.date); valid.push(result.bar);
    }
    valid.sort((a, b) => a.date.localeCompare(b.date));
    row.acceptedBars = valid.length;
    row.currencyEvidence = sourceRows.some(r => !r.price_currency) ? 'PARTIAL_PROVIDER_METADATA_CANONICAL_MAPPING_REQUIRED' : 'EXPLICIT_PROVIDER_METADATA';
    row.status = row.anomalies.some(r => ['currencyMismatch', 'exchangeMismatch', 'symbolMismatch', 'assetTypeMismatch'].includes(r.reason))
      ? 'IDENTITY_BLOCKED' : row.anomalies.length ? 'QUALITY_PARTIAL' : 'IDENTITY_ACCEPTED';
    const referenceBars = reference.bars.filter(r => r.date >= row.from && r.date <= row.to);
    const candidate = { securityId: reference.securityId, mic: reference.mic, currency: reference.currency, bars: valid };
    const canonical = { securityId: reference.securityId, mic: reference.mic, currency: reference.currency, bars: referenceBars };
    if (reference.basis === 'RAW_OHLC') {
      row.comparison = comparePriceSeries(canonical, candidate);
      row.comparison.basis = 'RAW_OHLC_ACCEPTED_ROWS_ONLY';
      row.comparison.providerBasis = 'UNVERIFIED_PROVIDER_RAW_FIELDS';
      row.comparison.seriesRoutable = row.status === 'IDENTITY_ACCEPTED';
      // Diagnostic only. Canonical adjustedClose remains null on every normalized bar.
      const byDate = new Map(referenceBars.map(b => [b.date, b]));
      const observations = valid.filter(b => finite(b.adjustmentObservation?.close) && finite(byDate.get(b.date)?.adjustedClose))
        .map(b => { const observed = b.adjustmentObservation.close, trusted = byDate.get(b.date).adjustedClose;
          return { date: b.date, referenceAdjustedClose: trusted, providerObservedAdjustedClose: observed,
            relativeDifference: Math.abs(observed - trusted) / Math.max(Math.abs(observed), Math.abs(trusted), 1e-12) }; });
      row.adjustedDiagnostic = { trust: 'UNVERIFIED_OBSERVATION_ONLY', canonicalAdjustedClosePopulated: false,
        observationsCompared: observations.length, materialDifferences: observations.filter(r => r.relativeDifference > .01),
        maxRelativeDifference: observations.length ? Math.max(...observations.map(r => r.relativeDifference)) : null,
        interpretation: 'Different retrieval dates and adjustment methodologies remain possible; no source is adjudicated.' };
    } else if (reference.basis === 'SPLIT_ADJUSTED_CLOSE') {
      row.comparison = { basis: 'SPLIT_ADJUSTED_REFERENCE_VS_RAW_PROVIDER_DIAGNOSTIC', status: 'NON_EQUIVALENT_BASIS_DIAGNOSTIC_ONLY',
        datesCompared: 0, discrepancies: [], unavailable: [], missingCandidateDates: [], missingReferenceDates: [],
        seriesRoutable: false, adjustmentEquivalenceVerified: false };
      const b = new Map(valid.map(r => [r.date, r])); const a = new Map(referenceBars.map(r => [r.date, r]));
      for (const [date, left] of a) {
        const right = b.get(date); if (!right) { row.comparison.missingCandidateDates.push(date); continue; }
        if (!finite(left.close) || !finite(right.close)) continue;
        row.comparison.datesCompared++;
        const relativeDifference = Math.abs(left.close - right.close) / Math.max(Math.abs(left.close), Math.abs(right.close), 1e-12);
        if (relativeDifference > .005) row.comparison.discrepancies.push({ date, field: 'close', reference: left.close, candidate: right.close, relativeDifference });
      }
      row.comparison.missingReferenceDates = [...b.keys()].filter(d => !a.has(d));
    }
    const actions = probe.endpoints.filter(e => ['split-endpoint', 'dividend-endpoint'].includes(e.label) && e.params.symbols === symbol
      && e.params.date_from === row.from && e.params.date_to === row.to);
    row.corporateActionEndpoints = actions.map(e => ({ kind: e.label, ok: e.ok, count: e.data?.data?.length || 0,
      observations: (e.data?.data || []).map(r => ({ date: dateOf(r), symbol: r.symbol || null,
        splitFactor: r.split_factor ?? null, dividend: r.dividend ?? null })) }));
    if (reference.basis === 'RAW_OHLC') {
      const referenceActions = referenceBars.filter(b => b.splitFactor !== 1 || b.dividend !== 0);
      row.canonicalActionObservations = referenceActions.map(b => ({ date: b.date, splitFactor: b.splitFactor ?? null, dividend: b.dividend ?? null }));
      const acceptedDates = new Set(valid.map(b => b.date));
      row.canonicalActionsMissingAcceptedProviderDate = referenceActions.filter(b => !acceptedDates.has(b.date)).map(b => b.date);
      row.splitBasisReview = [];
      const canonicalByDate = new Map(referenceBars.map(b => [b.date, b]));
      for (const action of referenceActions.filter(b => finite(b.splitFactor) && b.splitFactor !== 1 && b.splitFactor > 0)) {
        for (const providerBar of valid.filter(b => b.date < action.date)) {
          const canonicalBar = canonicalByDate.get(providerBar.date); if (!canonicalBar) continue;
          const closeRatio = canonicalBar.close / providerBar.close;
          const volumeRatio = providerBar.volume / canonicalBar.volume;
          if (Math.abs(closeRatio - action.splitFactor) / action.splitFactor < .01)
            row.splitBasisReview.push({ date: providerBar.date, splitDate: action.date, splitRatio: action.splitFactor,
              reason: 'PROVIDER_RAW_PRICE_APPEARS_ALREADY_SPLIT_ADJUSTED', observedRatio: closeRatio });
          if (finite(volumeRatio) && Math.abs(volumeRatio - action.splitFactor) / action.splitFactor < .01)
            row.splitBasisReview.push({ date: providerBar.date, splitDate: action.date, splitRatio: action.splitFactor,
              reason: 'PROVIDER_RAW_VOLUME_APPEARS_ALREADY_SPLIT_ADJUSTED', observedRatio: volumeRatio });
        }
      }
      if (row.splitBasisReview.length) row.comparison.seriesRoutable = false;
    }
    measurements.push(row);
  }
  const sample = measurements.filter(r => r.kind === 'us-eod');
  const raw = sample.filter(r => r.comparison?.basis === 'RAW_OHLC_ACCEPTED_ROWS_ONLY');
  const diagnostic = sample.filter(r => r.comparison?.basis === 'SPLIT_ADJUSTED_REFERENCE_VS_RAW_PROVIDER_DIAGNOSTIC');
  const rawDiscrepancies = raw.flatMap(r => r.comparison.discrepancies.map(d => ({ symbol: r.symbol, ...d })));
  const qualified = measurements.filter(r => r.kind === 'us-qualified-eod');
  const historical = measurements.filter(r => r.kind === 'corporate-action-window' && r.comparison?.basis === 'RAW_OHLC_ACCEPTED_ROWS_ONLY');
  const historicalDiscrepancies = historical.flatMap(r => r.comparison.discrepancies.map(d => ({ symbol: r.symbol, ...d })));
  const intraday = probe.endpoints.filter(e => e.label === 'us-extended-hours').map(e => {
    const rows = e.data?.data || [], timestamps = rows.map(r => r.date).filter(Boolean).sort();
    return { symbol: e.params.symbols, interval: e.params.interval, afterHoursRequested: e.params.after_hours === true,
      checkedAt: e.checkedAt, ok: e.ok, bars: rows.length, mics: countBy(rows, r => r.exchange),
      firstTimestamp: timestamps[0] || null, lastTimestamp: timestamps.at(-1) || null,
      missingVolume: rows.filter(r => r.volume == null).length,
      classification: rows.length ? 'INTRADAY' : 'UNAVAILABLE', realtimeVerified: false,
      notes: 'Historical response only; no refresh, latency, spread, complete-session or realtime equivalence established.' };
  });
  const latestIntraday = probe.endpoints.filter(e => e.label === 'qualified-intraday').map(e => ({ symbol: e.params.symbols,
    requestedExchange: e.params.exchange, checkedAt: e.checkedAt, ok: e.ok, bars: e.data?.data?.length || 0,
    observations: (e.data?.data || []).map(r => ({ timestamp: r.date, exchange: r.exchange, close: r.close ?? null,
      providerLast: r.marketstack_last ?? null, volume: r.volume ?? null })),
    realtimeVerified: false, interpretation: 'Returned close and marketstack_last have different semantics; timestamp alone does not prove realtime equivalence.' }));
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), sourceRun: probe.run, sourceRuns: probe.runs || [probe.run],
    sourceProbe: options.sourceProbe || null, provider: 'marketstack', evidence: 'AUTHENTICATED_PROFESSIONAL_PROBE',
    tolerances: { rawOHLCRelative: .005, adjustedObservationRelative: .01, volumeRelative: .10 },
    summary: { symbolsAttempted: sample.length, symbolsWithPrices: sample.filter(r => r.providerBars > 0).length,
      emptySymbols: sample.filter(r => !r.providerBars).map(r => r.symbol), statusCounts: countBy(sample, r => r.status),
      identityAnomalies: sample.flatMap(r => r.anomalies).length, rawReferenceSymbols: raw.length,
      rawDatesCompared: raw.reduce((n, r) => n + r.comparison.datesCompared, 0),
      rawMaterialDiscrepancies: rawDiscrepancies.length, rawDiscrepanciesByField: countBy(rawDiscrepancies, r => r.field),
      splitAdjustedReferenceDiagnosticSymbols: diagnostic.length,
      diagnosticDatesCompared: diagnostic.reduce((n, r) => n + r.comparison.datesCompared, 0),
      diagnosticDiscrepancies: diagnostic.reduce((n, r) => n + r.comparison.discrepancies.length, 0) },
    qualifiedSummary: { symbolsAttempted: qualified.length, symbolsWithPrices: qualified.filter(r => r.providerBars > 0).length,
      statusCounts: countBy(qualified, r => r.status), rejectedIdentityRows: qualified.flatMap(r => r.anomalies).length,
      emptySymbols: qualified.filter(r => !r.providerBars).map(r => r.symbol),
      rawDatesCompared: qualified.filter(r => r.comparison?.basis === 'RAW_OHLC_ACCEPTED_ROWS_ONLY').reduce((n, r) => n + r.comparison.datesCompared, 0),
      rawMaterialDiscrepancies: qualified.filter(r => r.comparison?.basis === 'RAW_OHLC_ACCEPTED_ROWS_ONLY').reduce((n, r) => n + r.comparison.discrepancies.length, 0) },
    historicalSummary: { windowsWithRawReference: historical.length,
      datesCompared: historical.reduce((n, r) => n + r.comparison.datesCompared, 0),
      materialDiscrepancies: historicalDiscrepancies.length,
      discrepanciesByField: countBy(historicalDiscrepancies, r => r.field),
      qualityAnomalies: historical.flatMap(r => r.anomalies),
      splitBasisReview: historical.flatMap(r => (r.splitBasisReview || []).map(d => ({ symbol: r.symbol, ...d }))) },
    intraday, latestIntraday,
    limitations: ['A purposive 29-symbol probe is not a statistically representative complete-universe price benchmark.',
      'Currency and venue disagreements quarantine the entire series; accepted rows are reported only as isolated diagnostics.',
      'Discover-series references are split adjusted, so close agreement is not raw OHLC or total-return equivalence evidence.',
      'Historical adjusted prices remain unverified; observations never populate canonical adjustedClose.',
      'Sample endpoints establish returned windows only, not maximum history depth or complete corporate-action coverage.'],
    rawDiscrepancies, historicalDiscrepancies, measurements };
}

export function createReferenceResolver(root) {
  const read = path => JSON.parse(readFileSync(resolve(root, path)));
  const decisions = read('quant/data/market/security-master/eligibility.json').decisions;
  const byTicker = new Map(decisions.map(r => [r.ticker, r]));
  const testset = read('quant/config/tiingo-universe.json').securities;
  const scale = new Map(read('quant/data/market/scale/universe-FULL_UNIVERSE.json').securities.map(r => [r.securityId, r]));
  return symbol => {
    const decision = byTicker.get(symbol) || symbolVariants(symbol).map(s => byTicker.get(s)).find(Boolean);
    const fixtureIdentity = testset.find(r => r.ticker === symbol);
    const identity = decision || fixtureIdentity; if (!identity) return null;
    const securityId = identity.securityId || 'ref_' + identity.ticker;
    const isETF = identity.instrument_type === 'ETF' || fixtureIdentity?.tests?.includes('etf');
    const mic = identity.mic || EXCHANGE_MICS[identity.exchange]?.[0]; if (!mic) return null;
    const golden = 'quant/data/market/golden-preview/daily/' + securityId + '.json';
    if (existsSync(resolve(root, golden))) { const data = read(golden); return { ...data, mic, source: golden,
      sourceSha256: hash(readFileSync(resolve(root, golden))), basis: 'RAW_OHLC', assetType: 'equity' }; }
    const discover = 'quant/data/market/discover-series/' + securityId + '.json';
    if (!existsSync(resolve(root, discover))) {
      const currency = scale.get(securityId)?.currency; if (!currency) return null;
      return { securityId, mic, currency, bars: [],
        source: 'CANONICAL_IDENTITY_ONLY_NO_REFERENCE_PRICES', basis: 'NO_REFERENCE_PRICES', assetType: isETF ? 'etf' : 'equity' };
    }
    const data = read(discover);
    if (data.priceSeriesType !== 'SPLIT_ADJUSTED' || data.grain !== 'daily' || data.dataMode !== 'real') return null;
    return { securityId, mic, currency: data.currency, source: discover, basis: 'SPLIT_ADJUSTED_CLOSE',
      sourceSha256: hash(readFileSync(resolve(root, discover))),
      assetType: isETF ? 'etf' : 'equity', bars: data.points.map(([date, close]) => ({ date, close })) };
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.probe) throw new Error('Usage: --probe=probe.json [--root=repo] [--out=report.json]');
  const root = resolve(args.root || process.cwd()), bytes = readFileSync(resolve(args.probe));
  const primary = JSON.parse(bytes), inputs = [primary];
  const sources = [{ sha256: hash(bytes), path: args.probe }];
  for (const path of (args.supplement || '').split(',').filter(Boolean)) {
    const additional = readFileSync(resolve(path)); inputs.push(JSON.parse(additional)); sources.push({ sha256: hash(additional), path });
  }
  const combined = { ...primary, runs: inputs.map(p => p.run), endpoints: inputs.flatMap(p => p.endpoints) };
  const result = summarizeUSProbe(combined, { resolveReference: createReferenceResolver(root), sourceProbe: sources });
  const out = resolve(args.out || root + '/reports/marketstack/marketstack_us_data_quality.json');
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output: out, summary: result.summary }));
}
