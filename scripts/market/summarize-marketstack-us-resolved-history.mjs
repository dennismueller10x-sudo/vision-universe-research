/** Private bounded alias history/actions -> public diagnostic metadata only.
 * No raw prices, volumes, action amounts, canonical writes or Tiingo-equivalence
 * claims. Historical dates do not use the current active freshness cutoff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluateLatestObservation } from './benchmark-marketstack-us-latest.mjs';
const day = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const d = value.slice(0, 10), parsed = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === d ? d : null;
};
const countBy = rows => rows.reduce((out, r) => { out[r.status] = (out[r.status] || 0) + 1; return out; }, {});
const raws = e => Array.isArray(e.data) ? e.data : Array.isArray(e.data?.data) ? e.data.data : [];
const complete = e => {
  const p = e.data?.pagination || e.pagination;
  return e.ok === true && p && ['offset', 'count', 'total', 'limit'].every(k => Number.isInteger(p[k]) && p[k] >= 0) &&
    p.offset === 0 && p.count === raws(e).length && p.total === p.count && p.limit >= p.count;
};
const window = e => {
  const from = day(e?.params?.date_from), to = day(e?.params?.date_to);
  return from && to && from <= to ? { from, to } : null;
};
const inWindow = (value, e) => { const d = day(value), w = window(e); return d && w && d >= w.from && d <= w.to; };
const finiteValue = value => ['number', 'string'].includes(typeof value) && value !== '' && Number.isFinite(Number(value));
export function summarizeResolvedUSHistory(resolved, probes, today) {
  if (!Array.isArray(resolved?.rows) || !Array.isArray(probes) || day(today) !== today) throw new Error('Resolved identities, probes and UTC date required');
  const endpoints = probes.flatMap(p => (p.endpoints || []).map(e => ({ ...e, runId: p.run?.runId || null })));
  const rows = resolved.rows.filter(r => r.acceptedIdentity).map(row => {
    const c = row.acceptedIdentity;
    const matching = endpoint => endpoints.filter(e => e.endpoint?.replace(/^\//, '') === endpoint &&
      e.params?.exchange === c.mic && String(e.params?.symbols || '') === c.symbol);
    const history = matching('eod').at(-1), splits = matching('splits').at(-1), dividends = matching('dividends').at(-1);
    const dates = new Set(), rejected = [], barsByDay = new Map(); let duplicateDates = 0;
    const strictOHLCBoundaryViolations = { total: 0, withinOneBasisPointOfClose: 0, aboveOneBasisPointOfClose: 0, aboveOnePercentOfClose: 0 };
    if (history?.ok) for (const raw of raws(history)) {
      if (raw.symbol !== c.symbol) { rejected.push({ date: day(raw.date), status: 'SYMBOL_MISMATCH' }); continue; }
      const checked = evaluateLatestObservation({ securityId: row.securityId, ticker: row.ticker, providerSymbol: c.symbol,
        mic: c.mic, expectedCurrency: 'USD', instrumentType: row.baselineInstrumentType || 'PREFERRED', activeStatus: 'INACTIVE' }, raw, today);
      const d = day(raw.date); if (dates.has(d)) duplicateDates++; dates.add(d);
      if (!inWindow(raw.date, history)) rejected.push({ date: d, status: 'OUTSIDE_REQUESTED_WINDOW_OR_INVALID_WINDOW' });
      else if (checked.validLatest) barsByDay.set(d, raw); else {
        rejected.push({ date: d, status: checked.status });
        if (checked.status === 'INVALID_OHLC' && ['open', 'high', 'low', 'close'].every(k => finiteValue(raw[k])) && Number(raw.close) > 0) {
          const [o, h, l, c] = ['open', 'high', 'low', 'close'].map(k => Number(raw[k]));
          const excess = Math.max(Math.max(o, c, l) - h, l - Math.min(o, c, h), 0);
          if (excess > 0) { const relative = excess / c; strictOHLCBoundaryViolations.total++;
            strictOHLCBoundaryViolations[relative <= 0.0001 ? 'withinOneBasisPointOfClose' : 'aboveOneBasisPointOfClose']++;
            if (relative > 0.01) strictOHLCBoundaryViolations.aboveOnePercentOfClose++; }
        }
      }
    }
    const action = (endpoint, type) => {
      if (!endpoint) return { status: 'NOT_TESTED', observations: 0, complete: false };
      if (!endpoint.ok) return { status: 'REQUEST_FAILED', observations: 0, complete: false };
      const values = raws(endpoint), seen = new Set();
      const eodObservedDates = new Set(history?.ok ? raws(history).filter(r => r.symbol === c.symbol && r.exchange === c.mic && inWindow(r.date, history) &&
        finiteValue(type === 'splits' ? r.split_factor : r.dividend) &&
        (type === 'splits' ? Number(r.split_factor) > 0 && Number(r.split_factor) !== 1 : Number(r.dividend) > 0)).map(r => day(r.date)) : []);
      const endpointDates = new Set(values.filter(r => r.symbol === c.symbol && inWindow(r.date, endpoint)).map(r => day(r.date)));
      const eodObservedEventsAbsentFromCompleteEndpoint = complete(endpoint) && window(endpoint) && window(history) &&
        endpoint.params.date_from <= history.params.date_from && endpoint.params.date_to >= history.params.date_to ?
        [...eodObservedDates].filter(d => !endpointDates.has(d)).length : null;
      let duplicates = 0, mismatches = 0, overlaps = 0, missingIdentity = 0, unverifiedExchange = 0, invalidValueOrCurrency = 0, unverifiedValue = 0, unknownCurrency = 0;
      for (const raw of values) {
        const d = day(raw.date), key = d; if (seen.has(key)) duplicates++; seen.add(key);
        if (raw.symbol !== c.symbol || !inWindow(raw.date, endpoint) || raw.exchange && raw.exchange !== c.mic) missingIdentity++;
        if (!raw.exchange) unverifiedExchange++;
        const amount = type === 'splits' ? raw.split_factor : raw.dividend;
        if (amount === null || amount === undefined) unverifiedValue++;
        else if (!finiteValue(amount) || (type === 'splits' ? Number(amount) <= 0 : Number(amount) < 0)) invalidValueOrCurrency++;
        const currencies = [raw.currency, raw.price_currency, raw.dividend_currency].filter(v => v !== null && v !== undefined && v !== '');
        if (!currencies.length) unknownCurrency++;
        if (currencies.some(v => v !== 'USD')) invalidValueOrCurrency++;
        const bar = barsByDay.get(d);
        if (bar) { const a = type === 'splits' ? raw.split_factor : raw.dividend; const b = type === 'splits' ? bar.split_factor : bar.dividend;
          if (finiteValue(a) && finiteValue(b)) { overlaps++; if (Math.abs(Number(a) - Number(b)) > 1e-8) mismatches++; } }
      }
      return { status: !window(endpoint) || duplicates || missingIdentity || invalidValueOrCurrency ? 'QUALITY_REJECTED_ROWS_PRESENT' :
        eodObservedEventsAbsentFromCompleteEndpoint > 0 ? 'CROSS_ENDPOINT_CONSISTENCY_REJECTED' :
        !complete(endpoint) ? 'PARTIAL_PAGE' : unverifiedExchange || unverifiedValue ? 'PARTIAL_ACTION_METADATA' : 'COMPLETE_BOUNDED_WINDOW_RESPONSE', observations: values.length,
        complete: Boolean(complete(endpoint)), qualityValidated: Boolean(window(endpoint) && complete(endpoint) && !duplicates && !missingIdentity && !unverifiedExchange && !unverifiedValue && !invalidValueOrCurrency && !eodObservedEventsAbsentFromCompleteEndpoint), duplicateDates: duplicates, invalidDateOrExchange: missingIdentity, unverifiedExchange, unverifiedValue, invalidValueOrCurrency,
        eodObservedEventDates: eodObservedDates.size, eodObservedEventsAbsentFromCompleteEndpoint,
        consistencyStatus: eodObservedEventsAbsentFromCompleteEndpoint > 0 ? 'EOD_OBSERVED_ACTIONS_ABSENT_FROM_COMPLETE_ENDPOINT_RESPONSE' : 'NO_PROVEN_CROSS_ENDPOINT_CONTRADICTION',
        eodActionAmountsTrusted: false, currencyState: unknownCurrency ? 'PARTIAL_OR_UNKNOWN' : values.length ? 'USD_OBSERVED' : 'NO_EVENTS', unknownCurrencyObservations: unknownCurrency,
        sameDateBarOverlaps: overlaps, amountDisagreementCount: mismatches,
        firstDate: [...seen].filter(Boolean).sort().at(0) || null, lastDate: [...seen].filter(Boolean).sort().at(-1) || null,
        sourceRunId: endpoint.runId || null, requestedFrom: endpoint.params?.date_from || null, requestedTo: endpoint.params?.date_to || null,
        valuesPublished: false, adjustmentApplied: false };
    };
    const validDates = [...barsByDay.keys()].filter(Boolean).sort();
    return { securityId: row.securityId, ticker: row.ticker, providerSymbol: c.symbol, mic: c.mic,
      identityBasis: c.identityBasis, history: { status: !history ? 'NOT_TESTED' : !history.ok ? 'REQUEST_FAILED' :
        !window(history) || rejected.length || duplicateDates ? 'QUALITY_REJECTED_ROWS_PRESENT' :
        !validDates.length ? 'NO_HISTORY_RETURNED' : complete(history) ? 'VALIDATED_BOUNDED_WINDOW' : 'PARTIAL_PAGE',
        complete: Boolean(history && complete(history)), requestedFrom: history?.params?.date_from || null,
        requestedTo: history?.params?.date_to || null, returnedRows: history ? raws(history).filter(r => r.symbol === c.symbol).length : 0,
        acceptedDates: validDates.length, rejectedRows: rejected.length, rejectionsByStatus: countBy(rejected), duplicateDates, strictOHLCBoundaryViolations,
        firstAcceptedDate: validDates.at(0) || null, lastAcceptedDate: validDates.at(-1) || null,
        sourceRunId: history?.runId || null, adjustmentBasis: 'UNVERIFIED', priceValuesPublished: false },
      splits: action(splits, 'splits'), dividends: action(dividends, 'dividends'), fullHistoryDepthProven: false,
      tiingoEquivalentProven: false, canonicalWrites: 0 };
  });
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), scope: 'RESOLVED_US_ALIASES_BOUNDED_HISTORY_ACTION_METADATA',
    protectedBaselineSource: resolved.protectedBaselineSource, asOfDate: today,
    totals: { resolvedIdentities: rows.length, historyBoundedWindowValidated: rows.filter(r => r.history.status === 'VALIDATED_BOUNDED_WINDOW').length,
      historyRejectedRows: rows.reduce((n, r) => n + r.history.rejectedRows, 0),
      historyAcceptedDates: rows.reduce((n, r) => n + r.history.acceptedDates, 0),
      historyStrictOHLCViolationsAboveOnePercent: rows.reduce((n, r) => n + r.history.strictOHLCBoundaryViolations.aboveOnePercentOfClose, 0),
      actionEndpointObservations: rows.reduce((n, r) => n + r.splits.observations + r.dividends.observations, 0),
      dividendEventsObservedInEOD: rows.reduce((n, r) => n + (r.dividends.eodObservedEventDates || 0), 0),
      dividendEventsAbsentFromCompleteEndpoint: rows.reduce((n, r) => n + (r.dividends.eodObservedEventsAbsentFromCompleteEndpoint || 0), 0),
      canonicalWrites: 0, fullHistoryOrTiingoEquivalenceClaims: 0 }, rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.probes) throw new Error('--probes=private-probe-paths required');
  const load = p => JSON.parse(readFileSync(resolve(p)));
  const result = summarizeResolvedUSHistory(load(args.resolved || 'reports/marketstack/us_marketstack_resolved_matches.json'),
    args.probes.split(',').map(load), args.today || new Date().toISOString().slice(0, 10));
  writeFileSync(resolve(args.out || 'reports/marketstack/us_marketstack_resolved_history_quality.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.totals));
}
