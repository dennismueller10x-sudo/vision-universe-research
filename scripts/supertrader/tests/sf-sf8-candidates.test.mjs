// Supertrader 8.0 – Kandidaten-Pipeline (Phasen B / C): Golden Cases auf eingefrorenen echten Reihen
// (fixtures/sf8-golden-bars.json), Negativfälle, Stufen, Determinismus, Lookahead-Schutz, Referenzschutz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runPipeline, writeOutputs, truncateTo, diffAgainst, OUTPUT_SCHEMA } from '../source-faithful/product/build-candidates.mjs';
import { createCalendar } from '../source-faithful/product/eod-adapter.mjs';
import { DETECTORS, withNextSession, KK_MOMENTUM_INTERPRETATION, momentumIndex } from '../source-faithful/product/detectors.mjs';
import { assessSecurity } from '../source-faithful/product/data-quality.mjs';
import { detectionReach, STRUCTURE_LEVELS, ORDER_DERIVED_FEATURES, planView, chartMarks, publicFeatures } from '../source-faithful/product/records.mjs';
import { rankStrategy } from '../source-faithful/product/ranking.mjs';
import { STRATEGY_CATALOG, RULE_LABELS } from '../source-faithful/product/catalog.mjs';
import { validateCandidateRecord, loadSf6Readiness, stageCeilings, ruleClasses, STAGE_ORDER } from '../source-faithful/product/candidate-contract.mjs';
import { psChartCandidate, PS_REFERENCE_CONFIG } from '../source-faithful/research/kk-ps-study.mjs';
import { investorScreen, traderScreen } from '../source-faithful/methods/weinstein.mjs';
import { CONTRACTS } from '../source-faithful/registry.mjs';
import { referenceFromBars } from './sf8-reference-fixture.mjs';
import { truncateReference } from '../source-faithful/product/price-parity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const F = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/sf8-golden-bars.json'), 'utf8'));
const CAL = createCalendar();
const READINESS = loadSf6Readiness();
const CEIL = new Map(stageCeilings(READINESS).map((c) => [c.strategyId, c.maxStage]));
const securities = () => F.securities.map((s) => ({ id: s.id, ticker: s.ticker, terminal: null, meta: structuredClone(s.meta), bars: s.cols.d.map((d, k) => ({ date: d, open: s.cols.o[k], high: s.cols.h[k], low: s.cols.l[k], close: s.cols.c[k], volume: s.cols.v[k] })) }));
const WEEKLY = new Map(F.securities.map((s) => [s.id, s.weekly.map(([date, close]) => ({ date, close }))]));
// veröffentlichte Preiswahrheit (V4) aus den eingefrorenen, unveränderten Reihen; Abweichungen testet sf-sf8-price-parity
const REFERENCE = new Map(securities().map((s) => [s.id, referenceFromBars(s)]));
const refAt = (asOf) => (id) => truncateReference(REFERENCE.get(id) ?? null, asOf);
const run = (secs = securities(), asOf = F.asOf) => runPipeline({ securities: secs, asOf, calendar: CAL, continuity: { bySecurityId: new Map() }, weeklyOf: (id) => WEEKLY.get(id) ?? null, priceReferenceOf: refAt(asOf), readiness: READINESS });
const RES = run();
const views = () => RES.strategies.flatMap((s) => s.detail.views);
const records = () => RES.strategies.flatMap((s) => s.detail.records);
const find = (t, c) => views().find((v) => v.ticker === t && v.candidateId === c);

// Golden Cases: erkannte Strategien und Stufe je Titel am Stichtag der Fixture (2026-10-23). Eine Änderung hier ist eine
// fachliche Änderung der Erkennung und braucht einen eigenen PR mit Vorher/Nachher-Vergleich.
const GOLDEN = {
  BOLT: ['C01:CONFIRMED_RESEARCH_SETUP',  'C02:CONFIRMED_RESEARCH_SETUP',  'C08:CHART_CANDIDATE',  'C09:CHART_CANDIDATE',  'C11:CONFIRMED_RESEARCH_SETUP',  'C12:MODELED_TRADE_PLAN'],
  NATH: ['C01:CONFIRMED_RESEARCH_SETUP',  'C02:CONFIRMED_RESEARCH_SETUP',  'C04:CHART_CANDIDATE',  'C05:CHART_CANDIDATE',  'C11:CONFIRMED_RESEARCH_SETUP'],
  JAKK: ['C01:CONFIRMED_RESEARCH_SETUP',  'C02:CONFIRMED_RESEARCH_SETUP',  'C06:CHART_CANDIDATE',  'C08:CHART_CANDIDATE',  'C11:CONFIRMED_RESEARCH_SETUP',  'C12:MODELED_TRADE_PLAN'],
  AAPL: ['C01:CONFIRMED_RESEARCH_SETUP',  'C02:CONFIRMED_RESEARCH_SETUP',  'C06:CHART_CANDIDATE'],
  AVBC: ['C01:CONFIRMED_RESEARCH_SETUP',  'C02:CONFIRMED_RESEARCH_SETUP',  'C03:CHART_CANDIDATE',  'C05:CHART_CANDIDATE',  'C06:CHART_CANDIDATE',  'C11:CONFIRMED_RESEARCH_SETUP'],
  UWMC: ['C01:CHART_CANDIDATE',  'C10:CHART_CANDIDATE',  'C11:CONFIRMED_RESEARCH_SETUP'],
  SLAB: ['C03:CHART_CANDIDATE',  'C06:CHART_CANDIDATE'],
  NX: ['C03:CHART_CANDIDATE',  'C04:CHART_CANDIDATE'],
  WENN: ['C03:CHART_CANDIDATE',  'C12:CHART_CANDIDATE'],
  HLN: ['C04:CHART_CANDIDATE',  'C05:CHART_CANDIDATE'],
  SLN: ['C04:CHART_CANDIDATE',  'C05:CHART_CANDIDATE',  'C06:CHART_CANDIDATE',  'C07:MODELED_TRADE_PLAN'],
  BRZE: ['C04:CHART_CANDIDATE',  'C05:CHART_CANDIDATE',  'C07:MODELED_TRADE_PLAN',  'C11:CONFIRMED_RESEARCH_SETUP'],
  ACVA: ['C06:CHART_CANDIDATE'],
  MSFT: ['C06:CHART_CANDIDATE',  'C13:CONFIRMED_RESEARCH_SETUP'],
  "BIO-B": ['C06:CHART_CANDIDATE',  'C13:CONFIRMED_RESEARCH_SETUP'],
  MYND: ['C09:CHART_CANDIDATE',  'C11:CONFIRMED_RESEARCH_SETUP',  'C12:CONFIRMED_RESEARCH_SETUP'],
  CCZ: ['C13:CONFIRMED_RESEARCH_SETUP'],
};

test('SF8-GOLDEN: erkannte Strategien und Stufen je Titel (eingefrorene echte Reihen)', () => {
  const got = {};
  for (const c of RES.index.candidates) (got[c.t] ||= []).push(`${c.c}:${c.s}`);
  for (const k of Object.keys(got)) got[k].sort();
  assert.deepEqual(got, GOLDEN);
});

test('SF8-GOLDEN-LEVELS: modellierte Pläne mit den Marken der Research-Lifecycles (Folgesitzung, Stop unter Einstieg)', () => {
  const sln = find('SLN', 'C07'), bolt = find('BOLT', 'C12'), slab = find('SLAB', 'C03');
  assert.equal(sln.plan.entryType, 'BUY_STOP_LIMIT_NEXT_SESSION'); assert.ok(sln.plan.limit >= sln.plan.trigger); assert.equal(sln.plan.riskFraction, 0.0125);
  assert.equal(sln.plan.earliestSession, '2026-10-26');
  assert.equal(bolt.plan.stop, F.securities.find((s) => s.ticker === 'BOLT').cols.l.at(-1), 'BGU-Stop = Gap-Tag-Tief (MA-MOKA-BGU-STOP)');
  for (const v of views().filter((x) => x.plan)) { assert.ok(v.plan.stop < v.plan.trigger, v.ticker); assert.ok(v.plan.earliestSession > v.asOf); assert.equal(v.plan.hypothetical, true); }
  // Darvas: Allzeithoch nur mit Tageshochs über die ganze Listing-Historie belegbar (Review M4) -> sonst CHART
  assert.equal(slab.stage, 'CHART_CANDIDATE'); assert.equal(slab.features.allTimeHighStatus, 'NOT_VERIFIABLE_WITHOUT_LONG_DAILY_HIGHS');
  assert.ok(slab.notMet.includes('DAR-SF-ATH'));
});

test('SF8-DARVAS-ATH: deckt das Tagesfenster die ganze Listing-Historie ab, trägt die Engine das Allzeithoch bis zum Plan', () => {
  const s = securities().find((x) => x.ticker === 'SLAB');
  const dq = { checks: [{ id: 'LIQUIDITY_RESEARCH_UNIVERSE', status: 'PASS' }] };
  const young = DETECTORS.SF_DARVAS_BOX(s, { dq, weekly: [], listingStart: s.bars[0].date });
  assert.equal(young.setupRules.find((r) => r.ruleId === 'DAR-SF-ATH').met, true); assert.ok(young.plan);
  const old = DETECTORS.SF_DARVAS_BOX(s, { dq, weekly: [], listingStart: '1999-01-04' });
  assert.equal(old.setupRules.find((r) => r.ruleId === 'DAR-SF-ATH').met, false); assert.equal(old.plan, null);
  const higherBefore = DETECTORS.SF_DARVAS_BOX(s, { dq, weekly: [{ date: '2020-01-03', close: 1e6 }], listingStart: s.bars[0].date });
  assert.equal(higherBefore.setupRules.find((r) => r.ruleId === 'DAR-SF-ATH').met, false, 'Wochenschluss darüber widerlegt das Allzeithoch');
});

test('SF8-NEGATIVE: DQ-FAIL-Titel (veraltet, Kurslücken) liefern keinen Kandidaten; Quarantäne-Titel höchstens CHART', () => {
  assert.equal(RES.index.dataQuality.FAIL, 2);
  for (const t of ['AL', 'ACA']) assert.ok(!RES.index.candidates.some((c) => c.t === t), t);
  for (const v of views().filter((x) => x.dataQuality.quarantinedSessions.length)) assert.equal(v.stage, 'CHART_CANDIDATE');
  // O-5: der Name allein sperrt nicht; SEC-SIC 6770 schon
  const wenn = F.securities.find((s) => s.ticker === 'WENN').meta;
  for (const v of views().filter((x) => x.ticker === 'WENN')) assert.ok(wenn.secBlankCheck ? v.dataQuality.notPass.some((n) => n.id === 'IDENTITY_SEC_BLANK_CHECK') && v.stage === 'CHART_CANDIDATE' : v.dataQuality.notPass.some((n) => n.id === 'IDENTITY_SPAC_NAME_HINT' && n.status === 'INFO'));
});

test('SF8-STAGES: jeder Datensatz besteht den Produktvertrag; keine Stufe über Readiness- oder DQ-Grenze; VALIDATED nie', () => {
  assert.ok(records().length > 0);
  for (const r of records()) {
    const v = validateCandidateRecord(r, { readiness: READINESS });
    assert.ok(v.ok, `${r.strategyId} ${r.security.ticker}: ${v.errors.join(',')}`);
    assert.ok(STAGE_ORDER.indexOf(r.stage) <= STAGE_ORDER.indexOf(CEIL.get(r.strategyId)));
    assert.notEqual(r.stage, 'VALIDATED_TRADE_SIGNAL');
    assert.deepEqual(r.status, { liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED', tradability: 'NO_STATEMENT' });
  }
  assert.equal(RES.index.counts.validatedTradeSignal, 0);
  // heute nur Strategien mit eigenem Lifecycle-Plan für die Folgesitzung; Turtle ausdrücklich nicht (Owner-Entscheidung O-1)
  const modeled = new Set(records().filter((r) => r.stage === 'MODELED_TRADE_PLAN').map((r) => r.candidateId));
  for (const c of modeled) assert.ok(['C03', 'C07', 'C08', 'C12'].includes(c), c);
  for (const v of views()) assert.ok(STAGE_ORDER.indexOf(v.stage) <= STAGE_ORDER.indexOf(v.ceiling));
});

test('SF8-NO-FICTITIOUS-PLAN: Pläne nur in MODELED; Turtle (O-1), EP, PS, Pocket Pivot, Holy Grail, Weinstein, SEPA nie mit Plan', () => {
  for (const v of views()) {
    if (v.stage !== 'MODELED_TRADE_PLAN') assert.equal(v.plan, null, `${v.candidateId} ${v.ticker}`);
    else assert.ok(v.plan.modelAssumptions.length > 0);
  }
  for (const v of views().filter((x) => ['C01', 'C02', 'C04', 'C05', 'C06', 'C09', 'C10', 'C11', 'C13'].includes(x.candidateId))) assert.equal(v.plan, null);
  const ps = views().filter((v) => v.candidateId === 'C10');
  assert.ok(ps.length && ps.every((v) => v.features.direction === 'SHORT_RESEARCH_MODEL' && /DATA_BLOCKED/.test(v.features.borrow)));
  assert.ok(views().filter((v) => v.candidateId === 'C09').every((v) => /DATA_BLOCKED/.test(v.features.catalyst)));
  for (const t of views().filter((v) => v.candidateId === 'C01')) assert.ok(t.why.some((w) => w.code === 'PLAN_NOT_MODELLED' || w.code.startsWith('DATA_') || w.code === 'SETUP_RULE_NOT_MET'), t.ticker);
});

// Owner-Entscheidung 28.10.2026 (Review HIGH 1): closeVsGapLow (C12) und Turtle-N/nPct (C01/C02) dürfen als beschreibende
// Research- bzw. Chartkennzahlen auch unterhalb von MODELED erscheinen – aber nie als Einstiegs-, Stop- oder Orderparameter.
test('SF8-DESCRIPTIVE-NOT-ORDER: closeVsGapLow und Turtle-N nur beschreibend, nie als Einstieg, Stop oder Order', () => {
  const ORDERISH = /trigger|stop|limit|entry|plannedloss|risk/i;
  const below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN');
  const c12 = below.filter((v) => v.candidateId === 'C12'), turtle = below.filter((v) => ['C01', 'C02'].includes(v.candidateId));
  assert.ok(c12.length > 0 && turtle.length > 0, 'Golden Cases decken C12 und Turtle unterhalb von MODELED ab');
  for (const v of [...c12, ...turtle]) {
    const where = `${v.candidateId} ${v.ticker} ${v.stage}`;
    // nur unter features, als Zahl, ohne Plan und ohne Order-/Stop-/Limitmarke
    assert.equal(v.plan, null, where);
    assert.ok(!Object.keys(v.levels).some((k) => ORDERISH.test(k)), `${where}: ${Object.keys(v.levels)}`);
    assert.ok(!Object.keys(v.features).some((k) => ORDERISH.test(k) && typeof v.features[k] === 'number'), where);
    // weder Sortierschlüssel noch Chartmarke: die Kennzahl ist kein Preis, an dem gehandelt würde
    for (const k of ['closeVsGapLow', 'N', 'nPct']) assert.ok(!(k in (v.sortKeys || {})), `${where}: ${k} als Sortierschlüssel`);
    if (v.pivot) assert.doesNotMatch(v.pivot.kind, ORDERISH, where);
    assert.doesNotMatch(JSON.stringify([v.why, v.planBlockers, v.interpretations]), /closeVsGapLow|nPct|"N"|\d[.,]\d/, where);
  }
  for (const v of c12) {
    assert.equal(typeof v.features.closeVsGapLow, 'number', `${v.ticker}: beschreibend vorhanden`);
    assert.ok(Math.abs(v.features.closeVsGapLow) < 1, `${v.ticker}: Verhältnis, kein Preis`);
    assert.ok(!('stopReference' in v.levels), `${v.ticker}: keine Risikoreferenz unterhalb MODELED`);
  }
  for (const v of turtle) {
    assert.equal(typeof v.features.N, 'number', `${v.ticker}: N beschreibend vorhanden`);
    assert.equal(v.pivot, null, `${v.ticker}: Turtle ohne Chartmarke (die einzige Marke der Quelle ist die Order)`);
    assert.ok(!('closeVsTrigger' in v.features), `${v.ticker}: kein Abstand zur Einstiegsorder`);
  }
  // C01/C02 bilden nach O-1 nie einen Plan: N kann nirgends zu einem Stop (Einstieg - 2N) werden
  assert.ok(views().filter((v) => ['C01', 'C02'].includes(v.candidateId)).every((v) => v.stage !== 'MODELED_TRADE_PLAN' && v.plan === null));
  // erst im modellierten Ablauf ist der Stop ein Orderparameter – und dort steht er im Plan, nicht in den Kennzahlen
  for (const v of views().filter((x) => x.candidateId === 'C12' && x.stage === 'MODELED_TRADE_PLAN')) {
    assert.ok(v.plan && Number.isFinite(v.plan.stop?.initial ?? v.plan.stop), `${v.ticker}: Stop im Plan`);
  }
  // direkt an der Ansichtsbildung, unabhängig vom Schlüssel der Strukturtabelle (SF_… bzw. Cxx): eine Risikoreferenz oder
  // ein Trigger gelangt unterhalb von MODELED nie in die Marken; die beschreibende Kennzahl bleibt eine Kennzahl
  for (const strategyId of ['SF_MOKA_BUYABLE_GAP_UP', 'C12', 'SF_TURTLE_S1', 'C01']) {
    const det = { strategyId, levels: { gapDayLow: 9, priorClose: 8, stopReference: 9, trigger: 10, limit: 11 }, pivot: { level: 9, kind: 'GAP_DAY_LOW (MOKA12-007 Risikoreferenz)' }, features: { closeVsGapLow: 0.05, N: 0.4, nPct: 0.04, closeVsTrigger: 0.01 } };
    for (const stage of ['CHART_CANDIDATE', 'CONFIRMED_RESEARCH_SETUP']) {
      const m = chartMarks(det, stage, 10);
      assert.ok(!Object.keys(m.levels).some((k) => ORDERISH.test(k)), `${strategyId} ${stage}: ${Object.keys(m.levels)}`);
      if (m.pivot) { assert.doesNotMatch(m.pivot.kind, ORDERISH, `${strategyId} ${stage}`); assert.ok(Object.values(m.levels).includes(m.pivot.level), `${strategyId} ${stage}: Chartmarke ist eine Strukturmarke`); }
      const f = publicFeatures(det, stage);
      assert.ok(!('closeVsTrigger' in f), `${strategyId} ${stage}: Abstand zur Order entfällt`);
      assert.equal(f.closeVsGapLow, 0.05); assert.equal(f.N, 0.4);
    }
  }
  // Oberfläche und Beschriftungen: keine Kennzahl wird als Einstieg, Stop oder Order beschriftet oder gezeichnet
  const ui = fs.readFileSync(path.join(ROOT, 'supertrader/assets/sf-research.js'), 'utf8');
  assert.doesNotMatch(ui, /closeVsGapLow|nPct|features\.N\b|\.features\b/, 'die Vorschau liest diese Kennzahlen nicht');
  for (const [id, label] of Object.entries(RULE_LABELS)) if (/closeVsGapLow|nPct/.test(id)) assert.doesNotMatch(label, /Stop|Einstieg|Order|Kauf/i, id);
});

// Beschreibende Kennzahlen je Methode, die unterhalb von MODELED erscheinen dürfen (Owner-Entscheidung 28.10.2026).
// Allowlist statt Namens-Sperrliste: ein umbenannter Orderpreis (orderPrice, buyPoint, channelHigh) fällt auf. Dieselbe
// Tabelle prüft core/data-quality.js (DQ-SF8-4, SF8_DESCRIPTIVE_FEATURES); eine neue Kennzahl ist eine fachliche Änderung.
const DESCRIPTIVE_FEATURES = {
  C01: ['path', 'filterOutcomeBefore', 'N', 'nPct', 'breakoutAtOpen'],
  C03: ['boxDepth', 'boxTopDate', 'boxBottomDate', 'boxCompleteDate', 'closeVsTop', 'allTimeHighDailyWindow', 'allTimeHighWeeklyCloses', 'listingCoveredByDailyHighs', 'allTimeHighStatus'],
  C04: ['breakoutWeek', 'breakoutDay', 'ma30w', 'closeVsMa30w', 'ma30wSlope4w', 'baseWeeks', 'rsNormalised', 'rsImproving', 'volumeConfirmedAny', 'overheadDistance', 'spyAboveMa30w', 'groupStage', 'marketBreadth'],
  C06: ['pctAboveLow52w', 'pctBelowHigh52w', 'ma200OneMonthAgo', 'vcpProxyState', 'vcpFootprint', 'baseLengthSessions', 'largestCorrection', 'rangesContracting', 'rs', 'translationUnverified'],
  C07: ['correction', 'consolidationSessions', 'startVolumeVs50d', 'reviewReasons', 'translationUnverified'],
  C08: ['momentum', 'momentumInterpretation', 'setupProxy', 'priorMove', 'higherLows', 'ma10Rising', 'ma20Rising', 'adr20'],
  C09: ['gap', 'priorRun63', 'priorRange63', 'adr20', 'dailyVolumeVs50d', 'catalyst', 'intradayVolume', 'entryOpeningRange', 'model'],
  C10: ['direction', 'upStreak', 'streakReturnSum', 'accelerating', 'adr20', 'distanceToMA10', 'distanceToMA20', 'streakReturns', 'borrow', 'entry', 'model'],
  C11: ['volume', 'maxDownVolume', 'volumeVsMaxDown', 'downDays', 'pctFrom10DMA', 'pctFrom50DMA', 'pctFrom200DMA', 'contextProxyMa50', 'stop'],
  C12: ['gapInAtr', 'gap', 'gapPct', 'atr40', 'volumeRatio50', 'volumeStatus', 'contextProxyMa50', 'closeVsGapLow'],
  C13: ['adx', 'adxAbove30Since', 'closeVsEma20', 'impulseHighDate', 'entrySource', 'trailing'],
};
DESCRIPTIVE_FEATURES.C02 = DESCRIPTIVE_FEATURES.C01; DESCRIPTIVE_FEATURES.C05 = DESCRIPTIVE_FEATURES.C04;
// oberste Schlüssel jedes `features: { … }` im Detektor-Quelltext (verschachtelte Objekte wie momentum zählen als ein Schlüssel)
function featureBlocks(src) {
  const out = [];
  for (let at = src.indexOf('features: {'); at >= 0; at = src.indexOf('features: {', at + 1)) {
    let i = src.indexOf('{', at) + 1, depth = 1, key = '', keys = [], expectKey = true;
    for (; depth > 0; i++) {
      const ch = src[i];
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
      else if (depth === 1 && ch === ',') expectKey = true;
      else if (depth === 1 && expectKey && ch === ':') { keys.push(key.trim()); key = ''; expectKey = false; continue; }
      if (depth === 1 && expectKey && /[\w\s]/.test(ch)) key += ch;
      else if (depth === 1 && expectKey && ch === ',') key = '';
    }
    out.push(keys);
  }
  return out;
}

test('SF8-DESCRIPTIVE-ALLOWLIST: unterhalb von MODELED nur die beschreibenden Kennzahlen der Detektoren (keine umbenannten Orderpreise)', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-faithful/product/detectors.mjs'), 'utf8');
  const blocks = featureBlocks(src).map((ks) => ks.filter((k) => !ORDER_DERIVED_FEATURES.includes(k)));
  // Quelltextreihenfolge der Detektoren: Turtle, Darvas, Weinstein, SEPA, Power Play, KK, EP, PS, Pocket Pivot, BGU, Holy Grail
  const order = ['C01', 'C03', 'C04', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13'];
  assert.deepEqual(blocks, order.map((c) => DESCRIPTIVE_FEATURES[c]), 'eine neue Detektor-Kennzahl braucht eine fachliche Freigabe und einen Eintrag in beiden Tabellen');
  // jede Kennzahl ohne Order-Wortteil ist eine Zahl, ein Datum, ein Wahrheitswert oder ein Statustext; mit Order-Wortteil nur ein Statustext
  for (const v of views().filter((x) => x.stage !== 'MODELED_TRADE_PLAN')) {
    const allowed = DESCRIPTIVE_FEATURES[v.candidateId];
    for (const [k, x] of Object.entries(v.features)) {
      assert.ok(allowed.includes(k), `${v.candidateId} ${v.ticker}: features.${k} ist keine beschreibende Kennzahl`);
      if (k.split(/(?=[A-Z])/).some((w) => ['stop', 'entry', 'trailing', 'limit', 'trigger'].includes(w.toLowerCase()))) assert.equal(typeof x, 'string', `${v.candidateId} ${v.ticker}: ${k} nur als Statustext`);
    }
  }
  // dieselbe Tabelle im Core-DQ, sobald er sie trägt (eigener PR)
  const { default: DQ } = await import('../../../core/data-quality.js');
  if (DQ.SF8_DESCRIPTIVE_FEATURES) assert.deepEqual(Object.fromEntries(Object.entries(DQ.SF8_DESCRIPTIVE_FEATURES).map(([c, ks]) => [c, [...ks]])), Object.fromEntries(Object.keys(DQ.SF8_DESCRIPTIVE_FEATURES).map((c) => [c, DESCRIPTIVE_FEATURES[c]])));
});

// Form der ganzen Ansicht unterhalb von MODELED (zweite unabhängige Nachprüfung, 28.10.): nicht nur features, sondern auch
// oberste Felder, trend, sortKeys, verschachtelte Werte, Marken und Texte. Dieselben Tabellen prüft DQ-SF8-4 im Core.
const VIEW_KEYS = ['strategyId', 'candidateId', 'ticker', 'securityId', 'companyName', 'exchange', 'shard', 'stage', 'reach', 'ceiling', 'asOf', 'close', 'recordId', 'pattern', 'met', 'pending', 'interpretations', 'notMet', 'pivot', 'levels', 'features', 'trend', 'plan', 'planBlockers', 'why', 'dataQuality', 'blockReasons', 'rank', 'sortKeys'];
const TREND_KEYS = ['close', 'change1d', 'ma50', 'ma200', 'vsMa50', 'vsMa200', 'ma50Rising20d', 'ret63', 'ret126', 'high252', 'low252', 'belowHigh252', 'windowSessions', 'volumeVs50d', 'dollarVolume20d', 'adr20'];
const SORT_KEYS = ['stage', 'pivot', 'volume', 'momentum', 'setupState', 'streak', 'trend', 'dataQuality', 'ticker'];
const FEATURE_OBJECTS = { momentum: ['p1m', 'p3m', 'p6m', 'best', 'r1m', 'r3m', 'r6m'], vcpFootprint: ['contractions', 'depths', 'contractingLeftToRight', 'lastContractionVolumeVs50d', 'baseSessions'] };
const prim = (x) => x === null || ['string', 'number', 'boolean'].includes(typeof x);
const primOrList = (x) => prim(x) || (Array.isArray(x) && x.every(prim));
function shapeFindings(v) {
  const out = [];
  for (const k of Object.keys(v)) if (!VIEW_KEYS.includes(k)) out.push(`Feld ${k}`);
  for (const [o, keys] of [['trend', TREND_KEYS], ['sortKeys', SORT_KEYS]]) for (const [k, x] of Object.entries(v[o] ?? {})) if (!keys.includes(k) || !prim(x)) out.push(`${o}.${k}`);
  for (const [k, x] of Object.entries(v.features ?? {})) {
    if (!(DESCRIPTIVE_FEATURES[v.candidateId] ?? []).includes(k)) out.push(`features.${k}`);
    else if (!primOrList(x) && !(FEATURE_OBJECTS[k] && Object.entries(x).every(([j, y]) => FEATURE_OBJECTS[k].includes(j) && primOrList(y)))) out.push(`features.${k} (Form)`);
  }
  // unterhalb von MODELED trägt die Ansicht heute weder Marken noch Chartmarke (siehe SF8-STRUCTURE-MARKS-PINNED)
  if (Object.keys(v.levels ?? {}).length) out.push('levels');
  if (v.pivot !== null) out.push('pivot');
  if (v.plan !== null) out.push('plan');
  // Zahlen nur in den Zahlenfeldern; in Codes, Gründen und Datenqualität steht keine Zahl (auch kein gerundeter Preis)
  const hasNum = (x) => typeof x === 'number' || (x && typeof x === 'object' && Object.values(x).some(hasNum));
  for (const [k, x] of Object.entries(v)) if (!['close', 'rank', 'features', 'trend', 'sortKeys', 'levels', 'pivot'].includes(k) && hasNum(x)) out.push(`Zahl in ${k}`);
  const { companyName, features, trend, sortKeys, ...texts } = v;
  if (/\d[.,]\d|[$€]/.test(JSON.stringify(texts).replace(/"close":[\d.]+/, ''))) out.push('Preis im Text');
  for (const x of Object.values(features ?? {})) if (typeof x === 'string' && /\d[.,]\d|[$€]/.test(x)) out.push('Preis in einem Statustext');
  return out;
}

test('SF8-VIEW-SHAPE-BELOW-MODEL: die ganze Ansicht unterhalb von MODELED folgt der Allowlist; umbenannte Orderpreise werden rot', () => {
  const below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN');
  assert.ok(below.length > 40);
  for (const v of below) assert.deepEqual(shapeFindings(v), [], `${v.candidateId} ${v.ticker}`);
  // Gegenproben der Nachprüfung (A1–A8): jede Mutation einer echten Ansicht fällt auf
  const avbc = below.find((v) => v.candidateId === 'C03'), bolt = below.find((v) => v.candidateId === 'C08'), c13 = below.find((v) => v.candidateId === 'C13');
  const probes = [
    [avbc, (v) => { v.buyPoint = 22.9065; }], [avbc, (v) => { v.trend.buyPoint = 22.9065; }], [avbc, (v) => { v.sortKeys.entry = 22.9; }],
    [bolt, (v) => { v.features.momentum = { ...(v.features.momentum ?? {}), buyPoint: 4.68 }; }], [bolt, (v) => { v.features.priorMove = { stop: 4.1 }; }],
    [avbc, (v) => { v.levels = { top: 22.9, box: { top: 22.9, bottom: 20.75 } }; }], [avbc, (v) => { v.pivot = { level: 22.9065, kind: 'BOX_TOP', distance: 0.01 }; }],
    [avbc, (v) => { v.planBlockers = ['BUY_STOP_22.9065_STOP_20.75']; }], [avbc, (v) => { v.why = [{ code: 'SETUP', detail: 'Einstieg ab $23' }]; }],
    [c13, (v) => { v.features.trailing = 'TRAIL_41.20'; }], [avbc, (v) => { v.why = [...v.why, { code: 'SETUP', ref: 23 }]; }], [avbc, (v) => { v.dataQuality = { ...v.dataQuality, level: 22.9 }; }],
  ];
  for (const [base, mut] of probes) { const v = structuredClone(base); mut(v); assert.notDeepEqual(shapeFindings(v), [], mut.toString()); }
});

// Bedeutung der Werte, nicht nur ihre Namen (dritte Nachprüfung): die Detektoren laufen hier ein zweites Mal auf denselben
// eingefrorenen Reihen, und keine veröffentlichte Zahl unterhalb von MODELED darf einer ihrer Order-Größen gleichen (Trigger,
// Stop-/Risikoreferenz, Limit, Plan, order-abgeleitete Kennzahlen) – unter welchem Namen auch immer. Ausgenommen ist nur der
// veröffentlichte Schluss (ADR-002), der bei einem Ausbruch zum Schluss mit der Marke zusammenfallen kann.
function detectorOrderValues() {
  const secs = securities(), asOf = F.asOf, nextSession = CAL.nextSession(asOf), out = new Map();
  const dq = new Map(secs.map((s) => [s.id, assessSecurity(s, { asOf, calendar: CAL, weekly: WEEKLY.get(s.id) ?? null, continuity: { bySecurityId: new Map() }, priceReference: refAt(asOf)(s.id) ?? null })]));
  const ev = secs.filter((s) => dq.get(s.id).status !== 'FAIL');
  const momentum = momentumIndex(ev.filter((s) => dq.get(s.id).checks.some((c) => c.id === 'LIQUIDITY_RESEARCH_UNIVERSE' && c.status === 'PASS')), asOf);
  for (const v of views()) {
    const s = secs.find((x) => x.ticker === v.ticker);
    const det = DETECTORS[v.strategyId](s, { dq: dq.get(s.id), weekly: WEEKLY.get(s.id) ?? null, momentum, nextSession, benchWeekly: null, asOf, listingStart: s.meta?.listingStart ?? null });
    const lv = det.levels ?? {};
    out.set(v.recordId, [lv.trigger, lv.stopReference, lv.limit, det.plan?.trigger, det.plan?.stop, det.plan?.limit, ...ORDER_DERIVED_FEATURES.map((k) => det.features?.[k])].filter((x) => Number.isFinite(x) && x !== 0));
  }
  return out;
}
const numbersOf = (x, p = '') => (x && typeof x === 'object' ? Object.entries(x).flatMap(([k, y]) => numbersOf(y, `${p}.${k}`)) : typeof x === 'number' ? [[p, x]] : []);
function orderValueLeaks(vs, ov) {
  const out = [];
  for (const v of vs) for (const [p, x] of numbersOf(v)) if (p !== '.close' && p !== '.trend.close') for (const o of ov.get(v.recordId) ?? []) if (Math.abs(x - o) < 1e-9) out.push(`${v.candidateId} ${v.ticker} ${p} = ${o}`);
  return out;
}

test('SF8-NO-ORDER-VALUE-BELOW-MODEL: keine veröffentlichte Zahl unterhalb von MODELED gleicht einer Order-Größe der Detektoren', () => {
  const ov = detectorOrderValues(), below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN');
  assert.ok([...below].filter((v) => (ov.get(v.recordId) ?? []).length).length >= 30, 'die Gegenprobe hat Order-Größen');
  assert.deepEqual(orderValueLeaks(below, ov), []);
  // Gegenproben: echter Preis unter erlaubtem Namen (N1, N5) oder als ganze Zahl in einer Kennzahl
  const acva = below.find((v) => v.candidateId === 'C06' && v.ticker === 'ACVA'), avbc = below.find((v) => v.candidateId === 'C03');
  for (const [base, mut] of [[acva, (v, o) => { v.features.ma200OneMonthAgo = o[0]; }], [avbc, (v, o) => { v.trend.high252 = o[0]; }], [avbc, (v, o) => { v.sortKeys.trend = o[o.length - 1]; }]]) {
    const v = structuredClone(base); mut(v, ov.get(v.recordId)); assert.notDeepEqual(orderValueLeaks([v], ov), [], mut.toString());
  }
  // jede Zahl unterhalb von MODELED ist eingefroren: eine neue oder geänderte Zahl (auch ein Preis in einer Liste, N2) ist eine
  // fachliche Änderung der Ansichten und braucht einen eigenen PR mit Vorher/Nachher-Vergleich
  const sorted = [...below].sort((a, b) => (a.recordId < b.recordId ? -1 : 1));
  assert.equal(sorted.length, 50);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex'), '91be182a5ab9abece651959818717eda79615416927dc164f99276b1dd9a88fa');
});

test('SF8-STRUCTURE-MARKS-PINNED: unterhalb von MODELED heute keine Marken und keine Chartmarke (bekannter Schlüsselfehler, Owner-Entscheidung)', () => {
  // chartMarks liest STRUCTURE_LEVELS/STRUCTURE_MARK über det.strategyId (SF_…), die Tabellen sind nach Cxx geschlüsselt: unterhalb
  // von MODELED entstehen deshalb nie Strukturmarken. Die Korrektur zeigt Box, Widerstand und Gap-Tief (C12: zugleich die
  // Risikoreferenz MOKA12-007) als Chartlinie – eine fachliche Änderung der Ansichten mit Vorher/Nachher in einem eigenen PR.
  const below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN');
  assert.equal(below.filter((v) => Object.keys(v.levels).length || v.pivot).length, 0);
  assert.ok(!Object.keys(STRUCTURE_LEVELS).some((k) => k.startsWith('SF_')), 'Strukturtabelle weiter nach Cxx geschlüsselt');
});

test('SF8-UI-ORDER-MARKS-ONLY-IN-PLAN: Einstieg, Stop und Limit zeichnet die Vorschau nur aus v.plan', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'supertrader/assets/sf-research.js'), 'utf8');
  const draw = ui.slice(ui.indexOf('function drawChart('), ui.indexOf('/* ================================================================ API */'));
  assert.ok(draw.length > 200, 'drawChart gefunden');
  // jede Marke des Charts ist genau eine dieser Zeilen; Einstieg und Stop nur im Zweig `if (v.plan)`, aus v.plan
  const pushes = draw.split('\n').filter((l) => /levels\.push\(/.test(l));
  assert.equal(pushes.length, 2, pushes.join('\n'));
  assert.match(pushes[0], /^\s*if \(v\.pivot && fin\(v\.pivot\.level\)\) levels\.push\(\{ id: 'pivot', label: 'Chartmarke', value: v\.pivot\.level,/);
  assert.match(pushes[1], /^\s*if \(v\.plan\) \{ levels\.push\(\{ id: 'entry',[^}]*value: v\.plan\.trigger,[^}]*\}\); levels\.push\(\{ id: 'stop', label: 'Modell-Stop', value: v\.plan\.stop,[^}]*\}\); \}\s*$/);
  // keine Orderbeschriftung irgendwo im Chart außer im Planzweig; Beschriftungen nur als Literal (keine Konstante von außen)
  const drawNoPlan = draw.split('\n').filter((l) => !/^\s*if \(v\.plan\) \{/.test(l)).join('\n');
  assert.deepEqual([...drawNoPlan.matchAll(/'([^'\\]*)'/g)].map((m) => m[1]).filter((x) => !/^var\(--[a-z0-9-]+\)$/.test(x) && /Stop|Einstieg|Limit|Order|Kauf|Trigger|Risiko/i.test(x)), []);
  for (const m of drawNoPlan.matchAll(/label: ([^,}]+)/g)) assert.match(m[1].trim(), /^'[^']*'( \+ |$)|^m\[0\] \+ /, `Beschriftung ${m[1]}`);
  assert.doesNotMatch(draw, /markers: \[[^\]]/, 'keine Marker');
  for (const l of draw.split('\n').filter((x) => /overlays\.push\(/.test(x))) assert.match(l, /values: STChart\.sma\(bars\.close, (m\[0\]|150)\)/, l);
  // keine aus Kursbalken oder Kennzahlen errechnete Marke (Mutation M3b): Linien nur als gleitende Durchschnitte, Box nur aus levels.box
  assert.doesNotMatch(draw, /features|bars\.low\[|bars\.high\[|Math\.(min|max)\(/);
  // Kästen nur aus levels.box; die Karte außerhalb der Planansicht beschriftet nichts als Einstieg, Stop, Limit oder Order
  for (const l of draw.split('\n').filter((x) => /boxes\.push\(/.test(x))) assert.match(l, /^\s*if \(lv\.box && fin\(lv\.box\.top\)\) boxes\.push\(\{ from: lv\.box\.from, to: null, top: lv\.box\.top, bottom: lv\.box\.bottom,[^}]*label: 'Darvas-Box' \}\);\s*$/, l);
  const card = ui.slice(ui.indexOf('function card('), ui.indexOf('function planBlock('));
  assert.ok(card.length > 500, 'card gefunden');
  const literals = [...card.matchAll(/'([^'\\]*)'/g)].map((m) => m[1]);
  assert.deepEqual(literals.filter((x) => /Stop|Einstieg|Limit|Order|Kauf|Trigger|Risiko/i.test(x)), [], 'keine Orderbeschriftung in der Karte');
  assert.match(card, /pair\('Chartmarke', usd\(p\.level\)/);
  for (const m of card.matchAll(/(?<!function )pair\(([^,]+),/g)) assert.match(m[1].trim(), /^'[^']*'$/, `Kartenzeile ${m[1]}`);
  // die Planansicht ist nur über v.plan erreichbar
  const planUses = [...ui.matchAll(/planBlock\(/g)].length;
  assert.equal(planUses, 2, 'Definition und genau ein Aufruf');
  assert.match(ui, /v\.plan \? planBlock\(v, L\) : null|v\.plan && planBlock\(v, L\)/);
});

test('SF8-NO-ORDER-LEVELS-BELOW-MODEL: unterhalb von MODELED keine Order-, Stop- oder Limitmarke in der Ansicht (Review SF8-R2)', () => {
  let below = 0;
  for (const v of views()) {
    if (v.stage === 'MODELED_TRADE_PLAN') continue;
    below++;
    const lv = Object.keys(v.levels);
    assert.ok(lv.every((k) => STRUCTURE_LEVELS[v.candidateId].includes(k)), `${v.candidateId} ${v.ticker} ${lv}`);
    assert.ok(!lv.some((k) => /trigger|stop|limit/i.test(k)), `${v.candidateId} ${v.ticker}`);
    assert.ok(!Object.keys(v.features).some((k) => ORDER_DERIVED_FEATURES.includes(k)), `${v.candidateId} ${v.ticker}`);
    if (v.pivot) assert.doesNotMatch(v.pivot.kind, /PLUS|ORDER|TICK|FRACTION|Risiko/i, `${v.candidateId} ${v.ticker}`);
    if (['C01', 'C02', 'C13'].includes(v.candidateId)) assert.equal(v.pivot, null, 'einzige Marke der Quelle ist die Order');
  }
  assert.ok(below > 0);
  assert.doesNotMatch(JSON.stringify(views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN')), /"(trigger|stopReference|limit)":/);
});

test('SF8-C08-FILL-WINDOW: KK-Breakout NEXT_OPEN zeigt das Ausführungsfenster der Referenzregel (ADR20) unverändert', () => {
  const base = { entry: { type: 'ON_OPEN_NEXT_SESSION (reference = as-of close)' }, sizing: { method: 'RISK', riskFraction: 0.005 }, exitRuleIds: [], modelAssumptions: [], lifecycleKey: 'KK_BREAKOUT', variantId: 'REF' };
  // ZS am 23.10.2026: Schluss 255,15, Stop 234,19 (Tief des Ausbruchstags), ADR20 5,0647 % -> Eröffnung höchstens 246,05
  const zs = planView({ ...base, entry: { ...base.entry, trigger: 255.15 }, stop: 234.19, maxPlannedLoss: 0.0506469927499545 }, '2026-10-26');
  assert.deepEqual(zs.fillWindow, { above: 234.19, upTo: 246.0510, rule: 'NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX' });
  assert.equal(zs.referenceInFillWindow, false, 'zum Schlusskurs nach der Referenzregel nicht ausführbar');
  // PCOR: Schluss 63, Stop 61,725, ADR20 3,93 % -> ausführbar
  assert.equal(planView({ ...base, entry: { ...base.entry, trigger: 63 }, stop: 61.725, maxPlannedLoss: 0.0393 }, '2026-10-26').referenceInFillWindow, true);
  // ohne höchsten geplanten Verlust (z. B. BGU) kein Fenster
  const bgu = planView({ ...base, entry: { ...base.entry, trigger: 30.52 }, stop: 29.61 }, '2026-10-26');
  assert.equal(bgu.fillWindow, null); assert.equal(bgu.referenceInFillWindow, null);
  for (const v of views().filter((x) => x.plan && x.plan.maxPlannedLoss !== null)) {
    assert.ok(Math.abs(v.plan.fillWindow.upTo - v.plan.stop * (1 + v.plan.maxPlannedLoss)) < 1e-3, v.ticker);
  }
});

test('SF8-C08-STAGE: MODELED nur mit O-6-Lesart erfüllt, Setup-Proxy, Plan der Referenz; darunter höchstens CHART', () => {
  for (const v of views().filter((x) => x.candidateId === 'C08')) {
    const mom = v.features.momentum?.best ?? null;
    if (v.stage === 'MODELED_TRADE_PLAN') {
      assert.ok(mom >= 98, `${v.ticker} Momentum ${mom}`);
      assert.ok(v.met.includes('KK-SF-BO-MOMENTUM') && v.dataQuality.status === 'PASS');
      assert.equal(v.plan.lifecycle, 'KK_BREAKOUT/REF');
      assert.ok(v.plan.stop < v.plan.trigger && v.plan.fillWindow);
    } else if (mom !== null && mom >= 98 && v.stage === 'CONFIRMED_RESEARCH_SETUP') {
      assert.ok(v.planBlockers.length > 0, `${v.ticker}: bestätigt ohne Plan nur mit benanntem Plan-Blocker`);
    } else {
      assert.equal(v.stage, 'CHART_CANDIDATE', v.ticker);
      assert.ok(mom === null || mom < 98 || v.dataQuality.status !== 'PASS', v.ticker);
    }
  }
});

test('SF8-REACH: CONFIRMED nur bei vollständig erfüllten mechanischen Setup-Regeln; ohne mechanische Regel nie über CHART', () => {
  const det = { detected: true, setupRules: [{ ruleId: 'MOKA-SF-BGU-GAP', met: true }, { ruleId: 'MOKA-SF-BGU-VOLUME', met: false }], plan: null };
  assert.equal(detectionReach(det, ruleClasses('SF_MOKA_BUYABLE_GAP_UP')), 'CHART_CANDIDATE');
  assert.equal(detectionReach({ ...det, setupRules: [{ ruleId: 'MOKA-SF-BGU-GAP', met: true }] }, ruleClasses('SF_MOKA_BUYABLE_GAP_UP')), 'CHART_CANDIDATE', 'fehlende Regel = nicht erfüllt');
  assert.equal(detectionReach({ detected: true, setupRules: [], plan: null }, ruleClasses('SF_KK_PARABOLIC_SHORT')), 'CHART_CANDIDATE');
  assert.equal(detectionReach({ ...det, setupRules: det.setupRules.map((r) => ({ ...r, met: true })), plan: {} }, ruleClasses('SF_MOKA_BUYABLE_GAP_UP')), 'MODELED_TRADE_PLAN');
});

test('SF8-DETERMINISTIC: gleiche Eingabe -> bitgleiche Ausgabe, auch bei anderer Reihenfolge der Titel', () => {
  const a = JSON.stringify(run()), b = JSON.stringify(run([...securities()].reverse()));
  assert.equal(a, b);
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'sf8-out-')), dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sf8-out-'));
  writeOutputs(dir1, run()); writeOutputs(dir2, run());
  const digest = (d) => { const h = crypto.createHash('sha256'); const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else { h.update(path.relative(d, q)); h.update(fs.readFileSync(q)); } } }; walk(d); return h.digest('hex'); };
  assert.equal(digest(dir1), digest(dir2));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir1, 'index.json'), 'utf8')).schema, OUTPUT_SCHEMA);
  assert.ok(fs.existsSync(path.join(dir1, 'ticker', 'BO.json')) && fs.existsSync(path.join(dir1, 'records', 'C12.json')));
  for (const d of [dir1, dir2]) fs.rmSync(d, { recursive: true, force: true });
});

test('SF8-RANKING: je Strategie lückenlos 1..n, reproduzierbar, kein strategieübergreifender Score', () => {
  for (const s of RES.strategies) {
    assert.deepEqual(s.detail.views.map((v) => v.rank), s.detail.views.map((_, k) => k + 1));
    const again = rankStrategy(s.strategyId, [...s.detail.views].reverse().map((v) => ({ ...v })));
    assert.deepEqual(again.views.map((v) => v.ticker), s.detail.views.map((v) => v.ticker));
  }
  for (const v of views()) assert.equal(v.score, undefined);
  for (const c of STRATEGY_CATALOG) assert.equal(c.defaultSort[0], 'stage');
});

test('SF8-NEXT-SESSION-PLACEHOLDER-NO-LOOKAHEAD: Platzhalter der Folgesitzung = echter Folgebalken; Werte des Platzhalters ungelesen', () => {
  let compared = 0;
  for (const s of securities()) {
    for (let cut = s.bars.length - 40; cut < s.bars.length - 1; cut++) {
      const head = s.bars.slice(0, cut + 1), real = s.bars.slice(0, cut + 2), next = s.bars[cut + 1].date;
      const ph = withNextSession(head, next), loud = ph.map((b) => (b.placeholder ? { ...b, open: 1e9, high: 1e9, low: 1e9, close: 1e9, volume: 1e9 } : b));
      assert.deepEqual(psChartCandidate(ph, cut + 1, PS_REFERENCE_CONFIG), psChartCandidate(real, cut + 1, PS_REFERENCE_CONFIG));
      assert.deepEqual(psChartCandidate(loud, cut + 1, PS_REFERENCE_CONFIG), psChartCandidate(real, cut + 1, PS_REFERENCE_CONFIG));
      // Weinstein: nur relevant, wenn die Folgesitzung eine neue Woche beginnt (sonst kein Platzhalter)
      const wk = (d) => { const t = new Date(`${d}T00:00:00Z`); return new Date(t - ((t.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); };
      if (wk(next) !== wk(head.at(-1).date)) {
        for (const screen of [investorScreen, traderScreen]) {
          const a = screen({ ...s, bars: ph })[0] ?? null, b = screen({ ...s, bars: real })[0] ?? null, c = screen({ ...s, bars: loud })[0] ?? null;
          assert.deepEqual(a, b, `${s.ticker} ${head.at(-1).date}`); assert.deepEqual(c, b);
          compared++;
        }
      }
    }
  }
  assert.ok(compared > 50);
});

test('SF8-PIT-ASOF: --as-of schneidet; spätere Balken ändern einen früheren Stichtag nicht', () => {
  const D = F.securities[0].cols.d.at(-6);
  const base = runPipeline({ securities: truncateTo(securities(), D), asOf: D, calendar: CAL, continuity: { bySecurityId: new Map() }, weeklyOf: (id) => WEEKLY.get(id) ?? null, priceReferenceOf: refAt(D) });
  const tampered = securities().map((s) => ({ ...s, bars: s.bars.map((b) => (b.date > D ? { ...b, high: b.high * 3, close: b.close * 3 } : b)) }));
  // auch ein künftiger Wochenschluss (nach D) darf nichts ändern (Review L4)
  const weeklyFuture = (id) => [...(WEEKLY.get(id) ?? []), { date: '2026-10-30', close: 1e6 }];
  const again = runPipeline({ securities: truncateTo(tampered, D), asOf: D, calendar: CAL, continuity: { bySecurityId: new Map() }, weeklyOf: weeklyFuture, priceReferenceOf: refAt(D) });
  assert.equal(JSON.stringify(base), JSON.stringify(again));
  for (const r of base.strategies.flatMap((s) => s.detail.records)) { assert.equal(r.asOf, D); assert.equal(r.pit.lastBarDate, D); assert.equal(r.pit.usesFutureBars, false); }
});

test('SF8-DIFF: neue / entfallene / umgestufte Kandidaten nur gegen einen echten Vorlauf', () => {
  assert.deepEqual(diffAgainst(null, RES.index), { status: 'NO_PREVIOUS_RUN' });
  const prev = structuredClone(RES.index); prev.candidates = prev.candidates.slice(1).map((c, k) => (k === 0 ? { ...c, s: 'CHART_CANDIDATE' } : c));
  const d = diffAgainst(prev, RES.index);
  assert.equal(d.added.length, 1); assert.equal(d.removed.length, 0);
});

test('SF8-WORDING: keine Handelssignal-, Kauf- oder Validierungssprache in Katalog und Ansichten', () => {
  const txt = JSON.stringify(STRATEGY_CATALOG) + JSON.stringify(views().map((v) => ({ why: v.why, pivot: v.pivot, features: v.features })));
  assert.doesNotMatch(txt, /kaufsignal|kaufempfehlung|buy signal|\bkaufen\b|validiert|garantiert|trefferquote|win rate/i);
  for (const c of STRATEGY_CATALOG) assert.doesNotMatch(`${c.name} ${c.short} ${c.recognises}`, /signal|kauf|validiert/i, c.candidateId);
  assert.deepEqual(STRATEGY_CATALOG.map((c) => c.strategyId), CONTRACTS.map((c) => c.strategyId));
});

test('SF8-KK-MOMENTUM: O-6 – Perzentil >= 98 als gekennzeichnete Modell-Interpretation, nie Ausschluss, keine Originalregel', () => {
  assert.equal(KK_MOMENTUM_INTERPRETATION.gate, false); assert.equal(KK_MOMENTUM_INTERPRETATION.sourceRule, false); assert.equal(KK_MOMENTUM_INTERPRETATION.threshold, 98);
  const s = securities().find((x) => x.ticker === 'BOLT'), dq = { checks: [{ id: 'LIQUIDITY_RESEARCH_UNIVERSE', status: 'PASS' }] };
  const hi = DETECTORS.SF_KK_BREAKOUT(s, { momentum: new Map([[s.id, { bestPercentile: 99.1 }]]), dq });
  assert.equal(hi.setupRules[0].met, true); assert.equal(hi.setupRules[0].interpretation, 'MI-SF8-KK-MOMENTUM-P98'); assert.ok(hi.plan, 'Plan des KK-Lifecycles');
  const lo = DETECTORS.SF_KK_BREAKOUT(s, { momentum: new Map([[s.id, { bestPercentile: 97.9 }]]), dq });
  assert.equal(lo.detected, true, 'unter 98 bleibt der Titel Kandidat (kein Ausschluss)'); assert.equal(lo.setupRules[0].met, false); assert.equal(lo.plan, null);
  for (const v of views().filter((x) => x.candidateId === 'C08')) assert.deepEqual(v.interpretations.map((i) => i.id), ['MI-SF8-KK-MOMENTUM-P98']);
  // ohne Ausbruch kein Kandidat, ganz gleich wie hoch das Momentum ist
  const a = securities().find((x) => x.ticker === 'AAPL');
  assert.equal(DETECTORS.SF_KK_BREAKOUT(a, { momentum: new Map([[a.id, { bestPercentile: 100 }]]), dq }).detected, false);
});

test('SF8-PRODUCER-OUT: Producer verlangt --out und verweigert committete Datenbereiche', () => {
  const cli = path.join(ROOT, 'scripts/supertrader/source-faithful/product/build-candidates.mjs');
  assert.equal(spawnSync(process.execPath, [cli], { encoding: 'utf8' }).status, 2);
  for (const out of [path.join(ROOT, 'supertrader/data/sf8-test'), ROOT, path.join(ROOT, 'core')]) {
    const r = spawnSync(process.execPath, [cli, '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 2, out); assert.match(r.stderr, /REFUSED_OUT_INSIDE_COMMITTED_TREE/);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'supertrader/data/sf8-test')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'index.json')), false);
});

test('SF8-REFERENCE-PROTECTION: die Pipeline verändert keine Research-Artefakte, Readiness und Varianten', () => {
  const dir = path.join(ROOT, 'scripts/supertrader/source-faithful/artifacts');
  const snap = () => Object.fromEntries(fs.readdirSync(dir).sort().map((f) => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')]));
  const before = snap(); run(); assert.deepEqual(snap(), before);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'STRATEGY-SF6-READINESS.json'))).digest('hex').slice(0, 8), '4f9808aa');
});
