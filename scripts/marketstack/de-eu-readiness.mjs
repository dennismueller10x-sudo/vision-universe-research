#!/usr/bin/env node
/**
 * Private, deterministic DE/EU diagnostics. No provider calls, adjustments,
 * production builders, rankings or strategy rules live here.
 *
 * evaluateListingReadiness({listing, history, asOf, verifiedWindow, metadata})
 * listing: {companyId, securityId, listingId, isin, mic, currency, indices}
 * history: {bars:[{date,open,high,low,close,volume}], source, apiVersion,
 *   sourceEvidence:[], adjustmentStatus:{verified,priceSeriesType,evidence:[]},
 *   quality:{issues:[{cause,fields:[],start,end,evidence:[]}]}}
 * verifiedWindow: {start,end,evidence:[]} — a documented contiguous window,
 * not an intersection of the days a provider happened to return.
 * metadata: {identityVerified,identityEvidence:[],currencyVerified,
 *   currencyEvidence:[],quoteUnit:'MAJOR',referenceVerified,referenceEvidence:[],
 *   calendar:{verified,mic,expectedSessions:[],expectedLastSession,evidence:[]},
 *   volume:{verified,unit:'SHARES',adjustmentBasis:'SPLIT_ADJUSTED',evidence:[]},
 *   rights:{privateDevelopment,publicDisplay,evidence:[]},
 *   productIntegration:{search|detail|watchlist|screener:{verified,evidence:[]}},
 *   fundamentals:{verified,companyId,period,filingDate,evidence:[]},
 *   shareBasis:{verified,evidence:[]}, fx:{verified,asOf,evidence:[]},
 *   quant:{policyEligible}}
 *
 * All READY decisions concern the named function and window only. Evidence is
 * supplied by the caller; this evaluator does not certify source documents.
 * A technical READY is never a full Quant score or a public display licence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CanonicalBars from '../../quant/engines/technical/canonical-bars.js';
import Features from '../../quant/engines/technical/feature-store.js';
import Momentum from '../../quant/engines/technical/momentum-engine.js';
import Volatility from '../../quant/engines/technical/volatility-engine.js';
import Volume from '../../quant/engines/technical/volume-engine.js';
import methodology from '../../quant/methodology/technical-v1.json' with { type: 'json' };
import {assertPrivateOutput} from './private-output.mjs';

export const SCHEMA_VERSION = 'de-eu-readiness-1.0.0';
export const STATUSES = ['READY', 'PARTIAL', 'BLOCKED', 'NOT_TESTED', 'NOT_APPLICABLE'];
const numeric = (v) => typeof v === 'number' && Number.isFinite(v);
const evidence = (v) => Array.isArray(v) && v.length > 0 && v.every((e) => typeof e === 'string' && e.trim());
const verified = (v) => v?.verified === true && evidence(v.evidence);
const unique = (v) => [...new Set(v)];
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const orderedDates = (ds) => ds.every((d, i) => validDate(d) && (i === 0 || d > ds[i - 1]));
const pricesValid = (b) => ['open', 'high', 'low', 'close'].every((k) => numeric(b[k]) && b[k] > 0)
  && b.high >= Math.max(b.open, b.close, b.low) && b.low <= Math.min(b.open, b.close, b.high);
const overlap = (issue, window) => (!issue.start || issue.start <= window.end) && (!issue.end || issue.end >= window.start);

function decision(status, causes, window, refs, nextStep, value) {
  const out = { status, causes: unique(causes), window, evidence: unique(refs), nextStep };
  if (value !== undefined) out.value = value;
  return out;
}

export function evaluateListingReadiness(input) {
  const { listing = {}, history = {}, asOf, verifiedWindow, metadata = {} } = input || {};
  if (!validDate(asOf)) throw new Error('A fixed YYYY-MM-DD asOf is required');
  if (history.bars !== undefined && !Array.isArray(history.bars)) throw new Error('history.bars must be an array');
  const allBars = history.bars || [];
  const datedBars = allBars.filter((b) => validDate(b?.date) && b.date <= asOf);
  const datesValid = allBars.every((b) => validDate(b?.date)) && orderedDates(datedBars.map((b) => b.date));
  const rawWindow = { start: datedBars[0]?.date || null, end: datedBars.at(-1)?.date || null, asOf, bars: datedBars.length };
  const hasWindow = validDate(verifiedWindow?.start) && validDate(verifiedWindow?.end)
    && verifiedWindow.start <= verifiedWindow.end && verifiedWindow.end <= asOf && evidence(verifiedWindow.evidence);
  const bars = hasWindow ? datedBars.filter((b) => b.date >= verifiedWindow.start && b.date <= verifiedWindow.end) : [];
  const window = { start: hasWindow ? verifiedWindow.start : null, end: hasWindow ? verifiedWindow.end : null, asOf, bars: bars.length };
  const refs = unique([...(history.sourceEvidence || []), ...(hasWindow ? verifiedWindow.evidence : [])]);
  const baseCauses = [];
  if (!listing.securityId || !listing.listingId || !listing.isin || !listing.mic
      || metadata.identityVerified !== true || !evidence(metadata.identityEvidence)) baseCauses.push('MAPPING_ERROR');
  if (!listing.currency || metadata.currencyVerified !== true || !evidence(metadata.currencyEvidence)
      || metadata.quoteUnit !== 'MAJOR') baseCauses.push('MISSING_FX_OR_SHARE_BASIS');
  if (!history.source || !history.apiVersion || !evidence(history.sourceEvidence)) baseCauses.push('PROVIDER_PROVENANCE_UNVERIFIED');
  if (metadata.rights?.privateDevelopment !== true || !evidence(metadata.rights.evidence)) baseCauses.push('RIGHTS_UNCONFIRMED');
  refs.push(...(metadata.identityEvidence || []), ...(metadata.currencyEvidence || []), ...(metadata.rights?.evidence || []));
  const issues = Array.isArray(history.quality?.issues) ? history.quality.issues : [];
  const barIdentityConsistent = (b) => ['securityId', 'listingId', 'isin', 'mic', 'currency']
    .every((k) => b[k] === undefined || b[k] === listing[k]);
  refs.push(...issues.flatMap((i) => Array.isArray(i.evidence) ? i.evidence : []));
  const issueCauses = (fields, w) => issues.filter((i) => overlap(i, w)
    && (!Array.isArray(i.fields) || !i.fields.length || i.fields.some((f) => fields.includes(f))))
    .map((i) => i.cause || 'PROVIDER_DATA_DEFECT');

  const functions = {};
  const closeCauses = [...baseCauses, ...issueCauses(['close', 'date', 'identity', 'currency'], rawWindow)];
  if (!datesValid) closeCauses.push('PROVIDER_DATA_DEFECT');
  if (!datedBars.length) closeCauses.push('MISSING_HISTORY');
  if (datedBars.some((b) => !numeric(b.close) || b.close <= 0)) closeCauses.push('PROVIDER_DATA_DEFECT');
  if (datedBars.some((b) => !barIdentityConsistent(b))) closeCauses.push('MAPPING_ERROR');
  functions.privateCloseChart = decision(closeCauses.length ? 'BLOCKED' : 'READY', closeCauses,
    rawWindow, refs, closeCauses.length ? 'Validate the named close series, identity, currency and private-use permission.' : null,
    closeCauses.length ? undefined : { basis: history.adjustmentStatus?.priceSeriesType || 'UNKNOWN', mode: 'PRIVATE_DEVELOPMENT_ONLY' });

  const calendar = metadata.calendar || {};
  const calendarVerified = verified(calendar) && calendar.mic === listing.mic
    && Array.isArray(calendar.expectedSessions) && calendar.expectedSessions.length > 0 && orderedDates(calendar.expectedSessions)
    && validDate(calendar.expectedLastSession) && calendar.expectedLastSession <= asOf;
  const latest = datedBars.at(-1);
  const latestCauses = [...baseCauses];
  if (!latest) latestCauses.push('MISSING_HISTORY');
  if (!datesValid || (latest && (!numeric(latest.close) || latest.close <= 0))) latestCauses.push('PROVIDER_DATA_DEFECT');
  if (latest && ['open', 'high', 'low'].every((f) => latest[f] !== undefined && latest[f] !== null) && !pricesValid(latest)) latestCauses.push('PROVIDER_DATA_DEFECT');
  if (latest && !barIdentityConsistent(latest)) latestCauses.push('MAPPING_ERROR');
  if (latest) latestCauses.push(...issueCauses(['open', 'high', 'low', 'close', 'date', 'identity', 'currency'], { start: latest.date, end: latest.date }));
  if (!calendarVerified) latestCauses.push('MISSING_CALENDAR_BASIS');
  const stale = calendarVerified && latest && latest.date < calendar.expectedLastSession;
  if (calendarVerified && latest && latest.date > calendar.expectedLastSession) latestCauses.push('PROVIDER_DATA_DEFECT');
  functions.latestEod = decision(latestCauses.length ? 'BLOCKED' : stale ? 'PARTIAL' : 'READY',
    stale ? [...latestCauses, 'STALE_EOD'] : latestCauses,
    { start: latest?.date || null, end: latest?.date || null, asOf, bars: latest ? 1 : 0 }, [...refs, ...(calendar.evidence || [])],
    latestCauses.length ? 'Validate the latest EOD bar and the last completed local session.' : stale ? 'Refresh only missing completed sessions.' : null,
    latestCauses.length ? undefined : { date: latest.date, dataKind: 'EOD', freshness: stale ? 'STALE' : 'CURRENT_COMPLETED_SESSION', expectedLastSession: calendar.expectedLastSession });

  const technicalCauses = [...baseCauses];
  if (!hasWindow) technicalCauses.push('UNVERIFIED_TIME_WINDOW');
  if (!bars.length) technicalCauses.push('MISSING_HISTORY');
  if (!calendarVerified) technicalCauses.push('MISSING_CALENDAR_BASIS');
  if (!orderedDates(bars.map((b) => b.date))) technicalCauses.push('PROVIDER_DATA_DEFECT');
  const missingOhlcFields = ['open', 'high', 'low', 'close'].filter((f) => bars.some((b) => b[f] === undefined || b[f] === null));
  if (missingOhlcFields.length) technicalCauses.push('MISSING_HISTORY');
  if (bars.some((b) => ['open', 'high', 'low', 'close'].every((f) => b[f] !== undefined && b[f] !== null) && !pricesValid(b))) technicalCauses.push('PROVIDER_DATA_DEFECT');
  if (bars.some((b) => !barIdentityConsistent(b))) technicalCauses.push('MAPPING_ERROR');
  if (calendarVerified && hasWindow) {
    const expected = calendar.expectedSessions.filter((d) => d >= window.start && d <= window.end);
    const actual = bars.map((b) => b.date);
    if (!expected.length || expected.length !== actual.length || expected.some((d, i) => d !== actual[i])) technicalCauses.push('MISSING_HISTORY');
  }
  const adjustment = history.adjustmentStatus || {};
  if (!verified(adjustment) || adjustment.priceSeriesType !== methodology.priceSeries.technical) technicalCauses.push('UNKNOWN_ADJUSTMENT_BASIS');
  technicalCauses.push(...issueCauses(['open', 'high', 'low', 'close', 'date', 'identity', 'currency', 'adjustment'], window));
  const technicalRefs = [...refs, ...(calendar.evidence || []), ...(adjustment.evidence || [])];
  let series, features, lastFeatures;
  if (!technicalCauses.length) {
    // createSeries preserves null volume and input order. fromRows would coerce
    // null to zero and silently sort/deduplicate; diagnostics must not do that.
    series = CanonicalBars.createSeries({ instrumentId: listing.instrumentId || listing.securityId, exchange: listing.mic,
      currency: listing.currency, source: history.source, sourceRevision: history.sourceRevision || null,
      timeframe: '1D', sessionType: 'REGULAR', priceSeriesType: adjustment.priceSeriesType },
    { timestamps: bars.map((b) => b.date), ...Object.fromEntries(['open', 'high', 'low', 'close', 'volume'].map((f) => [f, bars.map((b) => b[f] ?? null)])) });
    // Volume defects are independently gated below. They must not disable a
    // close-only SMA, but no volume-dependent result is released from them.
    const priceOnlyCheck = CanonicalBars.validateSeries(CanonicalBars.createSeries(series,
      { ...series, volume: bars.map(() => null) }));
    if (!priceOnlyCheck.valid) technicalCauses.push('ADAPTER_BUG');
    else { features = Features.computeFeatures(series, methodology.features); lastFeatures = features.last(); }
  }
  const feature = (name, keys, minimum, extraCauses = [], extraRefs = []) => {
    const causes = [...technicalCauses, ...extraCauses];
    if (bars.length > 0 && bars.length < minimum) causes.push('SHORT_HISTORY');
    const vals = Object.fromEntries(keys.map((k) => [k, lastFeatures?.[k] ?? null]));
    const complete = keys.every((k) => numeric(vals[k]));
    if (!causes.length && !complete) causes.push('MISSING_HISTORY');
    functions[name] = decision(causes.length ? 'BLOCKED' : 'READY', causes, window,
      [...technicalRefs, ...extraRefs, `quant/engines/technical/feature-store.js#${Features.FEATURE_VERSION}`, `quant/methodology/technical-v1.json#${methodology.methodologyVersion}`],
      causes.length ? 'Resolve the recorded cause for this function and contiguous window; do not fill missing sessions.' : null,
      causes.length ? undefined : vals);
  };
  feature('priceChange', ['returns'], 2);
  for (const p of methodology.features.smaPeriods) feature(`sma${p}`, [`sma${p}`], p);
  feature('range52w', ['high52w', 'low52w', 'distanceTo52wHigh', 'distanceTo52wLow'], methodology.features.yearWindow);
  for (const [h, p] of Object.entries(methodology.features.momentumHorizons)) feature(`momentum${h}`, [`momentum${h}`], p + 1);
  feature('realizedVolatility20d', ['realizedVol'], methodology.features.realizedVolWindow + 1);
  feature('realizedVolatility60d', ['realizedVolLong'], methodology.features.realizedVolLongWindow + 1);
  feature('atr14', ['atr', 'atrPct'], methodology.features.atrPeriod);

  const volumeMetadata = metadata.volume || {};
  const volumeCauses = [];
  if (!verified(volumeMetadata) || volumeMetadata.unit !== 'SHARES' || volumeMetadata.adjustmentBasis !== 'SPLIT_ADJUSTED') volumeCauses.push('UNVERIFIED_VOLUME_BASIS');
  volumeCauses.push(...issueCauses(['volume'], window));
  if (bars.some((b) => !numeric(b.volume) || b.volume < 0)) volumeCauses.push('PROVIDER_DATA_DEFECT');
  feature('relativeVolume', ['averageVolume', 'relativeVolume'], methodology.features.volumeWindow + 1, volumeCauses, volumeMetadata.evidence || []);
  feature('volumeTrend', ['volumeTrend'], methodology.features.volumeLongWindow + 1, volumeCauses, volumeMetadata.evidence || []);
  const engineResult = (name, prereqs, run, engineRef) => {
    const decisions = prereqs.map((p) => functions[p]);
    const causes = unique(decisions.flatMap((d) => d.causes));
    if (causes.length) functions[name] = decision('BLOCKED', causes, window, technicalRefs, 'Resolve the individual input-function blockers before running this engine.');
    else functions[name] = decision('READY', [], window, [...technicalRefs, engineRef], null, run());
  };
  // Require every input horizon: the unchanged Momentum engine can otherwise
  // emit a partial weighted composite. A partial composite is no full score.
  engineResult('momentumEngine', ['momentum1M', 'momentum3M', 'momentum6M', 'momentum12M', 'realizedVolatility60d'],
    () => Momentum.analyzeMomentum(series, features, methodology.momentum), `quant/engines/technical/momentum-engine.js#${Momentum.ENGINE_VERSION}`);
  if (functions.momentumEngine.status === 'READY' && functions.momentumEngine.value.coverage < 1) {
    functions.momentumEngine.status = 'PARTIAL'; functions.momentumEngine.causes = ['INSUFFICIENT_ENGINE_INPUT'];
    functions.momentumEngine.nextStep = 'Use the verified individual horizon returns; no complete momentum composite is available.';
    functions.momentumEngine.value = { horizons: functions.momentumEngine.value.horizons, state: 'UNDETERMINED', coverage: functions.momentumEngine.value.coverage };
  }
  feature('volatilityPercentiles', ['atrPctPercentile', 'bollingerWidthPercentile'], methodology.features.yearWindow);
  engineResult('volatilityEngine', ['atr14', 'realizedVolatility20d', 'realizedVolatility60d', 'volatilityPercentiles'],
    () => Volatility.analyzeVolatility(series, features, methodology.volatility), `quant/engines/technical/volatility-engine.js#${Volatility.ENGINE_VERSION}`);
  engineResult('volumeEngine', ['relativeVolume', 'volumeTrend'],
    () => Volume.analyzeVolume(series, features, methodology.volume), `quant/engines/technical/volume-engine.js#${Volume.ENGINE_VERSION}`);

  const memberships = listing.indexMemberships || listing.indices;
  const referenceCauses = metadata.referenceVerified === true && evidence(metadata.referenceEvidence)
    && Array.isArray(memberships) && memberships.length ? [] : ['REFERENCE_UNRESOLVED'];
  functions.indexRegionFilters = decision(referenceCauses.length ? 'BLOCKED' : 'READY', referenceCauses, null,
    metadata.referenceEvidence || [], referenceCauses.length ? 'Provide evidenced index membership and keep issuer domicile distinct from MIC.' : null);
  for (const name of ['search', 'detail', 'watchlist', 'screener']) {
    const integration = metadata.productIntegration?.[name];
    const causes = unique([...baseCauses.filter(c => c !== 'PROVIDER_PROVENANCE_UNVERIFIED'), ...(!verified(integration) ? ['PRODUCT_INTEGRATION_MISSING'] : [])]);
    functions[name] = decision(causes.length ? 'BLOCKED' : 'READY', causes, rawWindow, [...refs, ...(integration?.evidence || [])],
      causes.length ? `Validate ${name} through the actual central loader and UI on this listing.` : null);
  }
  functions.publicDisplay = decision(metadata.rights?.publicDisplay === true && evidence(metadata.rights.evidence) ? 'NOT_TESTED' : 'BLOCKED',
    metadata.rights?.publicDisplay === true && evidence(metadata.rights.evidence) ? [] : ['RIGHTS_UNCONFIRMED'], null,
    metadata.rights?.evidence || [], 'Apply the existing release and rights gates; private readiness does not authorise publication.');

  const fundamentals = metadata.fundamentals || {};
  const fundamentalsValid = verified(fundamentals) && listing.companyId && fundamentals.companyId === listing.companyId
    && validDate(fundamentals.period) && validDate(fundamentals.filingDate) && fundamentals.period <= fundamentals.filingDate && fundamentals.filingDate <= asOf;
  functions.fundamentalInputs = decision(fundamentalsValid ? 'PARTIAL' : 'BLOCKED', fundamentalsValid ? [] : ['MISSING_FUNDAMENTALS'],
    fundamentalsValid ? { period: fundamentals.period, filingDate: fundamentals.filingDate, asOf } : null, fundamentals.evidence || [],
    fundamentalsValid ? 'Run the unchanged factor-specific input/PIT contract; matched company facts alone are not a complete Quant score.' : 'Supply canonical facts for this exact company, filing date and period.');
  const quantCauses = ['PRODUCT_INTEGRATION_MISSING'];
  if (!fundamentalsValid) quantCauses.push('MISSING_FUNDAMENTALS');
  if (!verified(metadata.shareBasis) || (listing.currency !== 'USD' && (!verified(metadata.fx) || metadata.fx.asOf !== asOf))) quantCauses.push('MISSING_FX_OR_SHARE_BASIS');
  if (metadata.quant?.policyEligible === false) quantCauses.push('CURRENT_POLICY_INELIGIBLE');
  functions.quantFullScore = decision('BLOCKED', quantCauses, window, [...technicalRefs, ...(fundamentals.evidence || [])],
    'Satisfy the existing full-factor contract in an explicit EU population; preserve US scores, missing factors and weights.');

  const strategyCauses = [...technicalCauses, ...volumeCauses];
  if (bars.length < 253) strategyCauses.push(bars.length ? 'SHORT_HISTORY' : 'MISSING_HISTORY');
  // Read-only contract audit: dollarVolume() multiplies native close * shares.
  // Every live strategy has dollar liquidity / price thresholds. A documented
  // FX rate alone cannot make a native-EUR context acceptable to those engines.
  if (listing.currency !== 'USD') strategyCauses.push('MISSING_FX_OR_SHARE_BASIS');
  functions.supertraderInputs = decision(strategyCauses.length ? 'BLOCKED' : 'NOT_TESTED', strategyCauses, window,
    [...technicalRefs, ...(volumeMetadata.evidence || []), 'scripts/supertrader/engine/indicators.mjs#dollarVolume', 'scripts/supertrader/build.mjs#LIVE_ENGINES'],
    strategyCauses.length ? 'Validate volume, contiguous adjusted history and the existing monetary/cross-section/weekly input contract in an isolated EU context.' : 'Execute unchanged strategies in an isolated EU context with explicit cross-section and weekly calendars.');
  functions.supertrader = decision('BLOCKED', unique([...strategyCauses, 'PRODUCT_INTEGRATION_MISSING']), window,
    ['scripts/supertrader/build.mjs#loadUniverse', 'scripts/supertrader/build.mjs#loadBars'],
    'A separate Supertrader-only integration must supply the EU context; do not add EU listings to US live universes.');
  functions.diagnosticBacktest = decision('NOT_TESTED', unique(strategyCauses), window,
    [...technicalRefs, 'scripts/supertrader/engine/gates.mjs#evaluateGates'],
    'Run a bounded diagnosis only after input blockers pass. Today’s index members are not historical PIT membership.');
  functions.publishedBacktest = decision('BLOCKED', ['CURRENT_POLICY_INELIGIBLE', ...(metadata.rights?.publicDisplay === true ? [] : ['RIGHTS_UNCONFIRMED'])], window,
    ['scripts/supertrader/engine/gates.mjs#REQUIREMENTS'],
    'Meet unchanged historical membership, survivorship, corporate actions, execution and rights gates before publishing performance.');

  return { schemaVersion: SCHEMA_VERSION, securityId: listing.securityId || null, listingId: listing.listingId || null,
    companyId: listing.companyId || null, isin: listing.isin || null, mic: listing.mic || null, currency: listing.currency || null,
    asOf, mode: 'PRIVATE_DEVELOPMENT_DIAGNOSTIC', inputSummary: { totalBars: allBars.length, futureBarsExcluded: allBars.filter((b) => validDate(b?.date) && b.date > asOf).length,
      declaredWindow: window, adjustmentBasis: adjustment.priceSeriesType || 'UNKNOWN', dataHash: series?.dataHash || null,
      ignoredHistoryOutsideVerifiedWindow: datedBars.length - bars.length, missingOhlcFields }, functions };
}

export function evaluateUniverseReadiness(inputs) {
  if (!Array.isArray(inputs)) throw new Error('Readiness universe input must be an array');
  for (const key of ['listingId', 'securityId']) {
    const ids = inputs.map((i) => i.listing?.[key]).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new Error(`MAPPING_ERROR: duplicate ${key}; preserve distinct local/ADR identities`);
  }
  return { schemaVersion: SCHEMA_VERSION, mode: 'PRIVATE_DEVELOPMENT_DIAGNOSTIC', listings: inputs.map(evaluateListingReadiness) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [key, ...value] = a.replace(/^--/, '').split('='); return [key, value.join('=')]; }));
  if (!args.input || !args.out) throw new Error('Usage: node scripts/marketstack/de-eu-readiness.mjs --input=/private/inputs.json --out=/private/de_eu_product_readiness.json');
  const out = path.resolve(args.out);
  assertPrivateOutput(out,{allowCache:true});
  const rel = path.relative(path.resolve(fileURLToPath(new URL('../..', import.meta.url))), out).split(path.sep).join('/');
  // In-repository output is restricted to the established excluded market
  // cache. A random root JSON file may be copied into the public release.
  const outsideRepository = rel === '..' || rel.startsWith('../');
  if ((!outsideRepository && !rel.startsWith('.market-cache/')) || /(^|\/)(_site|dist|public|release)(\/|$)/.test(out.split(path.sep).join('/'))) throw new Error('Refusing to write diagnostics into production/public data paths');
  const input = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const result = Array.isArray(input) ? evaluateUniverseReadiness(input) : evaluateListingReadiness(input);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
}
