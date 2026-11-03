/** Offline refinement of provider-absent Europe sessions by market-wide date
 * clusters, plus a bounded alternate-route probe plan. No provider IO, no price,
 * no session recovery, no quarantine release and no gate change. A cluster
 * describes how the provider's omission is distributed; it is not a cause. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { estimateCredits } = require('../../providers/marketstack/client.js');
const { contract: coverageContract } = require('../../providers/marketstack/endpoint-coverage.js');

export const CLUSTER_VERSION = 'vu-europe-gap-date-clusters-1';
export const POLICY = Object.freeze({
  marketWideShare: 0.9, minimumEligible: 5, partialShare: 0.2, partialMinimumMissing: 3,
  maxProbeRequests: 50, symbolsPerBatch: 100,
  probeRoutes: Object.freeze(['EOD_DATE', 'EXCHANGE_EOD_DATE', 'TICKER_EOD_DATE'])
});
const PROVIDER_ABSENT = 'PROVIDER_MISSING_DAY';
const sha = text => createHash('sha256').update(text).digest('hex');
const validDay = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
  && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
const check = (ok, code) => { if (!ok) throw new Error(code); };

/** Classify each provider-absent (security, date) by the share of the MIC's
 * securities, inside their returned raw span, that are provider-absent on it. */
export function classifyGapDates({ gaps, inventory, policy = POLICY } = {}) {
  check(Array.isArray(gaps?.rows) && Array.isArray(inventory?.rows), 'GAPS_AND_INVENTORY_REQUIRED');
  const securities = new Map();
  for (const row of inventory.rows) {
    check(!securities.has(row.securityId), 'DUPLICATE_INVENTORY_SECURITY');
    check(/^[A-Z0-9]{4}$/.test(row.mic || '') && validDay(row.firstRawDate) && validDay(row.lastRawDate), 'INVENTORY_SPAN_REQUIRED');
    securities.set(row.securityId, row);
  }
  const absent = new Map(), otherCause = new Map(), lastObserved = new Map(), seen = new Set();
  let providerAbsent = 0;
  const causeCounts = {};
  for (const row of gaps.rows) {
    const sec = securities.get(row.securityId);
    check(sec, 'GAP_SECURITY_OUTSIDE_INVENTORY');
    for (const gap of row.gaps || []) for (const cause of gap.causes || []) {
      check(validDay(cause.date), 'INVALID_GAP_DATE');
      const id = row.securityId + '|' + cause.date;
      check(!seen.has(id), 'DUPLICATE_GAP_SESSION'); seen.add(id);
      causeCounts[cause.classification] = (causeCounts[cause.classification] || 0) + 1;
      const key = sec.mic + '|' + cause.date;
      if (cause.classification === PROVIDER_ABSENT) {
        providerAbsent++;
        if (!absent.has(key)) absent.set(key, []);
        absent.get(key).push(row.securityId);
        if (validDay(gap.from) && gap.from < cause.date) lastObserved.set(id, gap.from);
      } else otherCause.set(key, (otherCause.get(key) || 0) + 1);
    }
  }
  const byMic = new Map();
  for (const sec of securities.values()) { if (!byMic.has(sec.mic)) byMic.set(sec.mic, []); byMic.get(sec.mic).push(sec); }
  const clusters = [...absent.entries()].map(([key, ids]) => {
    const [mic, date] = key.split('|');
    const eligible = byMic.get(mic).filter(s => s.firstRawDate <= date && s.lastRawDate >= date).length;
    const missing = ids.length, share = eligible ? missing / eligible : 1;
    const classification = eligible < policy.minimumEligible ? 'SMALL_MIC_UNDETERMINED'
      : share >= policy.marketWideShare ? 'MARKET_WIDE_PROVIDER_DATE_OMISSION'
        : share >= policy.partialShare && missing >= policy.partialMinimumMissing ? 'PARTIAL_MARKET_PROVIDER_DATE_OMISSION'
          : 'SECURITY_SPECIFIC_PROVIDER_OMISSION';
    return { mic, date, classification, providerAbsent: missing, eligible, otherRecordedGapCause: otherCause.get(key) || 0,
      eligibleWithoutRecordedGap: Math.max(0, eligible - missing - (otherCause.get(key) || 0)),
      missingShare: Math.round(share * 10000) / 10000,
      // Every eligible security absent: indistinguishable from an unrecorded
      // closure until an official exchange calendar is checked for this date.
      calendarRecheck: eligible >= policy.minimumEligible && missing + (otherCause.get(key) || 0) >= eligible,
      securityIds: ids.slice().sort() };
  }).sort((a, b) => b.providerAbsent - a.providerAbsent || a.date.localeCompare(b.date) || a.mic.localeCompare(b.mic));
  // Several national markets absent on the same date is reviewer context
  // against a local holiday; it is never treated as calendar proof.
  const wideByDate = new Map();
  for (const c of clusters) if (c.classification === 'MARKET_WIDE_PROVIDER_DATE_OMISSION') wideByDate.set(c.date, (wideByDate.get(c.date) || 0) + 1);
  for (const c of clusters) c.marketWideMicsSameDate = wideByDate.get(c.date) || 0;
  const totals = {};
  for (const c of clusters) {
    const t = totals[c.classification] ||= { micDates: 0, sessions: 0, dates: new Set() };
    t.micDates++; t.sessions += c.providerAbsent; t.dates.add(c.date);
  }
  const summary = Object.fromEntries(Object.entries(totals).sort().map(([k, v]) => [k, { micDates: v.micDates, sessions: v.sessions, distinctDates: v.dates.size }]));
  check(Object.values(summary).reduce((n, v) => n + v.sessions, 0) === providerAbsent, 'CLUSTER_RECONCILIATION_FAILED');
  const recheck = clusters.filter(c => c.calendarRecheck);
  const calendarRecheck = { micDates: recheck.length, sessions: recheck.reduce((n, c) => n + c.providerAbsent, 0),
    dates: recheck.map(c => c.mic + ':' + c.date).sort() };
  return { schema: CLUSTER_VERSION, policy, causeCounts, providerAbsentSessions: providerAbsent, summary, calendarRecheck, clusters,
    lastObservedBefore: lastObserved, securities,
    recoveredSessions: 0, syntheticBars: 0, quarantineReleased: 0, causeEstablished: false };
}

function route(kind, mic, symbol, date) {
  if (kind === 'EOD_DATE') return { endpoint: '/eod/' + date, params: { symbols: symbol, exchange: mic } };
  if (kind === 'EXCHANGE_EOD_DATE') return { endpoint: '/exchanges/' + mic + '/eod/' + date, params: { symbols: symbol } };
  return { endpoint: '/tickers/' + symbol + '/eod/' + date, params: {} };
}
const request = (purpose, r) => ({ purpose, ...r, estimatedCredits: estimateCredits(r.endpoint, r.params) });

/** At most POLICY.maxProbeRequests single-symbol requests: three documented
 * action-route checks and, per selected market-wide cluster, each untried
 * date-scoped route for the absent date and for that symbol's last observed
 * date (positive route control). Never used for production data. */
export function buildRouteProbePlan(result, { policy = POLICY } = {}) {
  const actionProbes = [
    request('ACTION_ROUTE_US_POSITIVE_CONTROL', { endpoint: '/splits', params: { symbols: 'AAPL', date_from: '2020-08-24', date_to: '2020-09-04' } }),
    request('ACTION_ROUTE_TICKER_SCOPED_EUROPE', { endpoint: '/tickers/EUZ.DE/splits', params: { date_from: '2025-08-01', date_to: '2025-08-31' } }),
    request('ACTION_ROUTE_TICKER_SCOPED_EUROPE', { endpoint: '/tickers/AI.PA/splits', params: { date_from: '2019-10-01', date_to: '2019-10-15' } })
  ];
  const perCluster = policy.probeRoutes.length * 2;
  const capacity = Math.floor((policy.maxProbeRequests - actionProbes.length) / perCluster);
  const wide = result.clusters.filter(c => c.classification === 'MARKET_WIDE_PROVIDER_DATE_OMISSION').slice();
  // One cluster per MIC first (largest), then the largest remaining dates.
  const chosen = [], mics = new Set(), dates = new Set();
  // Prefer dates where some eligible security did deliver (the provider holds
  // the session, so a closure is excluded), then dates absent on several
  // national markets at once, then single-market dates needing a calendar check.
  const rank = c => !c.calendarRecheck ? 0 : c.marketWideMicsSameDate >= 3 ? 1 : 2;
  wide.sort((a, b) => rank(a) - rank(b) || b.providerAbsent - a.providerAbsent || a.date.localeCompare(b.date) || a.mic.localeCompare(b.mic));
  for (const c of wide) if (!mics.has(c.mic) && chosen.length < capacity) { chosen.push(c); mics.add(c.mic); dates.add(c.mic + c.date); }
  for (const c of wide) if (!dates.has(c.mic + c.date) && chosen.length < capacity) { chosen.push(c); dates.add(c.mic + c.date); }
  const probes = chosen.map(c => {
    const candidates = c.securityIds.map(id => ({ id, sec: result.securities.get(id), control: result.lastObservedBefore.get(id + '|' + c.date) }))
      .filter(x => x.control && /^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(x.sec.ticker || ''))
      .sort((a, b) => a.sec.firstRawDate.localeCompare(b.sec.firstRawDate) || a.id.localeCompare(b.id));
    const pick = candidates[0];
    if (!pick) return { mic: c.mic, date: c.date, skipped: 'NO_SYMBOL_WITH_OBSERVED_CONTROL_DATE', requests: [] };
    const requests = policy.probeRoutes.flatMap(kind => [
      request('GAP_ROUTE_TARGET', { route: kind, ...route(kind, c.mic, pick.sec.ticker, c.date) }),
      request('GAP_ROUTE_POSITIVE_CONTROL', { route: kind, ...route(kind, c.mic, pick.sec.ticker, pick.control) })]);
    return { mic: c.mic, date: c.date, clusterSessions: c.providerAbsent, eligible: c.eligible, calendarRecheck: c.calendarRecheck, securityId: pick.id,
      symbol: pick.sec.ticker, controlDate: pick.control, requests };
  });
  const all = [...actionProbes, ...probes.flatMap(p => p.requests)];
  check(all.length <= policy.maxProbeRequests, 'PROBE_PLAN_EXCEEDS_REQUEST_CAP');
  // Full follow-up only if a route recovers targets AND its control returns
  // the already approved bar unchanged: batch absent symbols per MIC-date.
  const followUp = wide.reduce((n, c) => ({ requests: n.requests + Math.ceil(c.providerAbsent / policy.symbolsPerBatch),
    conservativeCredits: n.conservativeCredits + c.providerAbsent }), { requests: 0, conservativeCredits: 0 });
  return { schema: CLUSTER_VERSION + '-probe-plan', requestCap: policy.maxProbeRequests, requests: all.length,
    estimatedCredits: all.reduce((n, r) => n + r.estimatedCredits, 0), creditSemantics: 'CONSERVATIVELY_RESERVED_NOT_OBSERVED_BILLING',
    actionProbes, clusterProbes: probes, coverageContractSha256: coverageContract.source.sha256,
    decisionRule: {
      recoveredOnlyIf: 'TARGET_ROW_EXACT_SYMBOL_MIC_DATE_AND_CONTROL_ROW_EQUALS_APPROVED_RAW_BAR',
      emptyTargetMeans: 'ROUTE_DOES_NOT_RECOVER_THIS_CLUSTER_NO_ABSENCE_PROOF',
      admission: 'EXISTING_QUALITY_IDENTITY_AND_CALENDAR_GATES_UNCHANGED'
    },
    followUpIfConfirmed: { scope: 'MARKET_WIDE_PROVIDER_DATE_OMISSION', micDates: wide.length,
      sessions: wide.reduce((n, c) => n + c.providerAbsent, 0), ...followUp, batchSize: policy.symbolsPerBatch },
    executed: false, providerRequests: 0 };
}

export function serialise(result) {
  const { lastObservedBefore, securities, ...rest } = result;
  return rest;
}

function safeOut(out) {
  check(typeof out === 'string' && isAbsolute(out), 'ABSOLUTE_OUTPUT_DIRECTORY_REQUIRED');
  const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  const target = resolve(out), rel = relative(root, existsSync(target) ? realpathSync(target) : target);
  const inside = rel && !rel.startsWith('..') && !isAbsolute(rel);
  check(!inside || rel.startsWith('docs/reports/'), 'OUTPUT_INSIDE_REPOSITORY_DATA_REFUSED');
  return target;
}

export function writeOutputs({ gapsPath, inventoryPath, out }) {
  const gapsBytes = readFileSync(gapsPath), inventoryBytes = readFileSync(inventoryPath);
  const result = classifyGapDates({ gaps: JSON.parse(gapsBytes), inventory: JSON.parse(inventoryBytes) });
  const plan = buildRouteProbePlan(result);
  const sources = { gapsSha256: sha(gapsBytes), inventorySha256: sha(inventoryBytes) };
  const dir = safeOut(out); mkdirSync(dir, { recursive: true });
  const files = { 'europe_gap_date_clusters.json': { ...serialise(result), sources }, 'europe_gap_route_probe_plan.json': { ...plan, sources } };
  const manifest = {};
  for (const [name, body] of Object.entries(files)) {
    const text = JSON.stringify(body, null, 1) + '\n';
    writeFileSync(join(dir, name), text); manifest[name] = sha(text);
  }
  return { result, plan, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.split(/=(.*)/s).slice(0, 2)));
  check(args['--gaps'] && args['--inventory'] && args['--out'], 'USAGE: --gaps=<classification.json> --inventory=<inventory.json> --out=<absolute dir>');
  const { result, plan, manifest } = writeOutputs({ gapsPath: args['--gaps'], inventoryPath: args['--inventory'], out: args['--out'] });
  console.log(JSON.stringify({ providerAbsentSessions: result.providerAbsentSessions, summary: result.summary,
    calendarRecheck: { micDates: result.calendarRecheck.micDates, sessions: result.calendarRecheck.sessions },
    probeRequests: plan.requests, followUp: plan.followUpIfConfirmed, manifest }, null, 1));
}
