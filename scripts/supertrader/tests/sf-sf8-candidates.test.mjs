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
import { rawTickAdjusted } from '../source-faithful/common/series.mjs';
import { DETECTORS, withNextSession, KK_MOMENTUM_INTERPRETATION, momentumIndex, commonFeatures } from '../source-faithful/product/detectors.mjs';
import { assessSecurity } from '../source-faithful/product/data-quality.mjs';
import { detectionReach, STRUCTURE_LEVELS, ORDER_DERIVED_FEATURES, ORDER_DERIVED_BY_METHOD, ORDER_DERIVED_SUBFIELDS_BY_METHOD, TREND_HIDDEN_BY_METHOD, planView, chartMarks, publicFeatures, publicTrend } from '../source-faithful/product/records.mjs';
import { rankStrategy, SORT_KEYS as RANK_SORT_KEYS } from '../source-faithful/product/ranking.mjs';
import { STRATEGY_CATALOG, RULE_LABELS } from '../source-faithful/product/catalog.mjs';
import { validateCandidateRecord, loadSf6Readiness, stageCeilings, ruleClasses, STAGE_ORDER } from '../source-faithful/product/candidate-contract.mjs';
import { psChartCandidate, PS_REFERENCE_CONFIG } from '../source-faithful/research/kk-ps-study.mjs';
import { investorScreen, traderScreen, weeklyBars } from '../source-faithful/methods/weinstein.mjs';
import { CONTRACTS } from '../source-faithful/registry.mjs';
import { referenceFromBars } from './sf8-reference-fixture.mjs';
import { sepaSetupAt, entryEligibility, REFERENCE_CONFIG as MIN_REFERENCE_CONFIG, MODEL_ASSUMPTIONS as MIN_MODEL_ASSUMPTIONS } from '../source-faithful/research/minervini-lifecycle.mjs';
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
  // Golden Case C07 unterhalb von MODELED (Owner 28.10.2026): Power Play als Chart-Kandidat (manuelle Prüfung) und als bestätigtes Setup
  WDAY: ['C05:CHART_CANDIDATE',  'C07:CHART_CANDIDATE'],
  MGLD: ['C03:CHART_CANDIDATE',  'C06:CHART_CANDIDATE',  'C07:CONFIRMED_RESEARCH_SETUP'],
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
// Chartstruktur der Golden Cases unterhalb von MODELED: Methode:Marken:Art der Chartmarke -> Anzahl (Stand 28.10.2026)
const GOLDEN_STRUCTURE_SHOWN = {
  'C01:channelDays+exitChannelDays:-': 6, 'C02:channelDays+exitChannelDays:-': 5, 'C03:bottom+box+top:BOX_TOP': 5,
  'C04:breakoutDay+breakoutWeek+ma30w:-': 5, 'C05:breakoutDay+breakoutWeek+ma30w:-': 6,
  'C06:ma150+ma200+ma50:-': 9, 'C07:-:-': 2, 'C08:breakoutLevel:CONSOLIDATION_10_LEVEL': 2, 'C09:gapDayLow+priorClose:GAP_DAY_LOW': 2,
  'C10:ma10+ma20:-': 1, 'C11:ma10+ma50:-': 7, 'C12:gapDayLow+priorClose:GAP_DAY_LOW': 2, 'C13:ema20:-': 3,
};

test('SF8-DESCRIPTIVE-NOT-ORDER: closeVsGapLow nur beschreibend; Turtle-N unterhalb von MODELED nicht mehr veröffentlicht (Owner 28.10.)', () => {
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
    // Owner-Entscheidung 28.10.2026: die frühere Ausnahme für N gilt nicht mehr (Trigger − 2·N = Stopreferenz)
    for (const k of ['N', 'nPct']) assert.ok(!(k in v.features), `${v.ticker}: ${k} unterhalb von MODELED`);
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
      assert.equal(f.closeVsGapLow, 0.05);
      // Turtle: N und nPct entfallen unterhalb von MODELED (Owner 28.10.2026); die Methode des Gaps behält ihre Kennzahl
      if (/TURTLE|C01/.test(strategyId)) assert.ok(!('N' in f) && !('nPct' in f), `${strategyId} ${stage}: N`); else assert.equal(f.N, 0.4);
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
// Strukturmarken unterhalb von MODELED (Owner-Entscheidung 28.10.2026), unabhängig von records.mjs#STRUCTURE_LEVELS festgeschrieben:
// Box, Widerstand, Konsolidierungshoch, Gap-Tief, gleitende Durchschnitte. Nicht: C06/C07-Pivot (= Einstiegsorder), C13 swingLow
// (= Stop) und impulseHigh, C11 signalDayLow. Eine neue Marke ist eine fachliche Änderung mit eigenem Review.
const EXPECTED_STRUCTURE = {
  C01: ['channelDays', 'exitChannelDays'], C02: ['channelDays', 'exitChannelDays'], C03: ['top', 'bottom', 'box'],
  C04: ['ma30w', 'breakoutWeek', 'breakoutDay'], C05: ['ma30w', 'breakoutWeek', 'breakoutDay'],
  C06: ['ma50', 'ma150', 'ma200'], C07: [], C08: ['breakoutLevel'], C09: ['gapDayLow', 'priorClose'],
  C10: ['ma10', 'ma20'], C11: ['ma10', 'ma50'], C12: ['gapDayLow', 'priorClose'], C13: ['ema20'],
};
const EXPECTED_MARK = { C03: ['top', 'BOX_TOP'], C08: ['breakoutLevel', 'CONSOLIDATION_10_LEVEL'], C09: ['gapDayLow', 'GAP_DAY_LOW'], C12: ['gapDayLow', 'GAP_DAY_LOW'] };
function shapeFindings(v) {
  const out = [];
  for (const k of Object.keys(v)) if (!VIEW_KEYS.includes(k)) out.push(`Feld ${k}`);
  for (const [o, keys] of [['trend', TREND_KEYS], ['sortKeys', SORT_KEYS]]) for (const [k, x] of Object.entries(v[o] ?? {})) if (!keys.includes(k) || !prim(x)) out.push(`${o}.${k}`);
  for (const [k, x] of Object.entries(v.features ?? {})) {
    if (!(DESCRIPTIVE_FEATURES[v.candidateId] ?? []).includes(k)) out.push(`features.${k}`);
    else if (!primOrList(x) && !(FEATURE_OBJECTS[k] && Object.entries(x).every(([j, y]) => FEATURE_OBJECTS[k].includes(j) && primOrList(y)))) out.push(`features.${k} (Form)`);
  }
  // Marken nur aus der unabhängig festgeschriebenen Strukturtabelle; die Chartmarke ist genau die Strukturmarke ihrer Art
  for (const [k, x] of Object.entries(v.levels ?? {})) {
    if (!(EXPECTED_STRUCTURE[v.candidateId] ?? []).includes(k)) out.push(`levels.${k}`);
    else if (!prim(x) && !(k === 'box' && x && typeof x === 'object' && Object.entries(x).every(([j, y]) => ['from', 'to', 'top', 'bottom'].includes(j) && prim(y)))) out.push(`levels.${k} (Form)`);
  }
  if (v.pivot !== null) {
    const mark = EXPECTED_MARK[v.candidateId];
    if (!mark) out.push('pivot ohne Strukturmarke');
    else if (Object.keys(v.pivot).some((k) => !['level', 'kind', 'distance'].includes(k)) || v.pivot.kind !== mark[1] || v.pivot.level !== v.levels?.[mark[0]]) out.push(`pivot ${JSON.stringify(v.pivot)}`);
  }
  if (v.plan !== null) out.push('plan');
  // Zahlen nur in den Zahlenfeldern; in Codes, Gründen und Datenqualität steht keine Zahl (auch kein gerundeter Preis)
  const hasNum = (x) => typeof x === 'number' || (x && typeof x === 'object' && Object.values(x).some(hasNum));
  for (const [k, x] of Object.entries(v)) if (!['close', 'rank', 'features', 'trend', 'sortKeys', 'levels', 'pivot'].includes(k) && hasNum(x)) out.push(`Zahl in ${k}`);
  const { companyName, features, trend, sortKeys, levels, pivot, ...texts } = v;
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
    [avbc, (v) => { v.levels = { ...v.levels, box: { ...v.levels.box, protective: 20.75 } }; }], [avbc, (v) => { v.pivot = { ...v.pivot, level: 22.9065 }; }],
    [avbc, (v) => { v.levels = { ...v.levels, trigger: 22.9065 }; }], [avbc, (v) => { v.pivot = { ...v.pivot, kind: 'BOX_TOP_PLUS_FRACTION' }; }], [avbc, (v) => { v.pivot = { ...v.pivot, stop: 20.75 }; }],
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
    const lv = det.levels ?? {}, pl = det.plan ?? {};
    // Order-Größen jeder Quelle: Trigger, Stop-/Risikoreferenz, Limit, der Plan (entry.trigger, stop, limit), die Detektor-Marke
    // (bei C01–C07, C10, C11, C13 der Orderpreis), der Minervini-Pivot (= Einstiegsorder) und Holy-Grail swingLow/impulseHigh
    const orderMark = ['C08', 'C09', 'C12'].includes(v.candidateId) ? null : det.pivot?.level;
    out.set(v.recordId, [lv.trigger, lv.stopReference, lv.limit, pl.entry?.trigger, pl.trigger, typeof pl.stop === 'object' ? pl.stop?.initial : pl.stop, pl.limit, orderMark,
      ['C06', 'C07'].includes(v.candidateId) ? lv.pivot : null, v.candidateId === 'C13' ? lv.swingLow : null, v.candidateId === 'C13' ? lv.impulseHigh : null,
      ...ORDER_DERIVED_FEATURES.map((k) => det.features?.[k])].filter((x) => Number.isFinite(x) && x !== 0));
  }
  return out;
}
const numbersOf = (x, p = '') => (x && typeof x === 'object' ? Object.entries(x).flatMap(([k, y]) => numbersOf(y, `${p}.${k}`)) : typeof x === 'number' ? [[p, x]] : []);
// Einzige benannte Ausnahme (Owner-Entscheidung 28.10.2026): das Gap-Tief von EP und BGU ist zugleich Chartstruktur und die
// Risikoreferenz der Quelle (KK-034 Tagestief, MOKA12-007). Es erscheint als „Gap-Tief“ (GAP_DAY_LOW), nie als Stop und ohne
// Plan; der Stop selbst (levels.stopReference) bleibt unveröffentlicht. Jede andere Übereinstimmung ist ein Fehler.
const GAP_LOW_STRUCTURE = (v, p) => ['C09', 'C12'].includes(v.candidateId) && (p === '.levels.gapDayLow' || (p === '.pivot.level' && v.pivot?.kind === 'GAP_DAY_LOW' && v.pivot.level === v.levels?.gapDayLow));
// Keine weitere Ausnahme (Owner-Entscheidung 28.10.2026): das 52-Wochen-Hoch fällt bei SEPA, Power Play und Holy Grail oft mit der
// Einstiegsmarke zusammen und ist dort unterhalb von MODELED ausgeblendet (records.mjs#TREND_HIDDEN_BY_METHOD).
const DESCRIPTIVE_COINCIDENCE = () => false;
function orderValueLeaks(vs, ov) {
  const out = [];
  for (const v of vs) for (const [p, x] of numbersOf(v)) if (p !== '.close' && p !== '.trend.close' && !GAP_LOW_STRUCTURE(v, p) && !DESCRIPTIVE_COINCIDENCE(v, p)) for (const o of ov.get(v.recordId) ?? []) if (Math.abs(x - o) < 1e-9) out.push(`${v.candidateId} ${v.ticker} ${p} = ${o}`);
  return out;
}

test('SF8-NO-ORDER-VALUE-BELOW-MODEL: keine veröffentlichte Zahl unterhalb von MODELED gleicht einer Order-Größe der Detektoren', () => {
  const ov = detectorOrderValues(), below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN');
  assert.ok([...below].filter((v) => (ov.get(v.recordId) ?? []).length).length >= 30, 'die Gegenprobe hat Order-Größen');
  assert.deepEqual(orderValueLeaks(below, ov), []);
  // Gegenproben: echter Preis unter erlaubtem Namen (N1, N5) oder als ganze Zahl in einer Kennzahl
  const acva = below.find((v) => v.candidateId === 'C06' && v.ticker === 'ACVA'), avbc = below.find((v) => v.candidateId === 'C03');
  const wenn = below.find((v) => v.candidateId === 'C12' && v.ticker === 'WENN');
  for (const [base, mut] of [[acva, (v, o) => { v.features.ma200OneMonthAgo = o[0]; }], [avbc, (v, o) => { v.trend.high252 = o[0]; }], [avbc, (v, o) => { v.sortKeys.trend = o[o.length - 1]; }],
    [avbc, (v, o) => { v.levels.top = o[0]; v.pivot.level = o[0]; }],
    // Owner-Entscheidung 28.10.: käme das 52-Wochen-Hoch bei SEPA zurück, gliche es dem Pivot (= Einstieg)
    ...[['C06', 'ACVA'], ['C06', 'SLAB'], ['C06', 'BIO-B'], ['C07', 'MGLD'], ['C13', 'BIO-B']].map(([c, t]) => [below.find((x) => x.candidateId === c && x.ticker === t),
      (v) => { v.trend.high252 = commonFeatures(securities().find((x) => x.ticker === v.ticker).bars).high252; }]), [wenn, (v, o) => { v.levels.priorClose = v.levels.gapDayLow; }], [wenn, (v, o) => { v.pivot = { ...v.pivot, kind: 'GAP_DAY_LOW_STOP' }; }]]) {
    const v = structuredClone(base); mut(v, ov.get(v.recordId)); assert.notDeepEqual(orderValueLeaks([v], ov), [], mut.toString());
  }
  // jede Zahl unterhalb von MODELED ist eingefroren: eine neue oder geänderte Zahl (auch ein Preis in einer Liste, N2) ist eine
  // fachliche Änderung der Ansichten und braucht einen eigenen PR mit Vorher/Nachher-Vergleich
  const sorted = [...below].sort((a, b) => (a.recordId < b.recordId ? -1 : 1));
  assert.equal(sorted.length, 55);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex'), '1718d7fce55cc9acc4a9db590ea1593b2b490614e1cd51ad9af99d5aff12ee85');
});

// Review B1/N1 (28.10.2026): das ausgeblendete 52-Wochen-Hoch darf sich auch nicht aus einem veröffentlichten Abstand
// zurückrechnen lassen (close / (1 − x), low252 / (1 − x) usw.; r4-Rundung reicht dafür, also relative Toleranz 2e-4)
function highDerivations(v, hi) {
  const nums = numbersOf(v).filter(([p, x]) => !/Date|date|Sessions|sessions|olume|contractions/.test(p) && Number.isFinite(x));
  const anchors = nums.filter(([p, x]) => x > 0 && /^\.trend\.(close|low252|ma\d+)$|^\.levels\./.test(p));
  const out = [];
  for (const [p, x] of nums) {
    if (Math.abs(x - hi) / hi < 2e-4) out.push(`${p} = Hoch`);
    if (!(x > 0 && x < 1)) continue;
    for (const [ap, a] of anchors) for (const [f, c] of [['/(1-x)', a / (1 - x)], ['*(1+x)', a * (1 + x)]]) if (Math.abs(c - hi) / hi < 2e-4) out.push(`${ap}${f} mit x = ${p}`);
  }
  return out;
}
test('SF8-HIGH252-NOT-DERIVABLE: SEPA, Power Play, Holy Grail unterhalb von MODELED: das 52-Wochen-Hoch ist weder Zahl noch Abstand', () => {
  const secs = securities(), below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN' && ['C06', 'C07', 'C13'].includes(v.candidateId));
  assert.ok(below.filter((v) => v.candidateId === 'C06').length >= 3);
  const hiOf = (v) => commonFeatures(secs.find((x) => x.ticker === v.ticker).bars).high252;
  assert.deepEqual(below.flatMap((v) => highDerivations(v, hiOf(v)).map((d) => `${v.candidateId} ${v.ticker} ${d}`)), []);
  for (const v of below.filter((x) => x.candidateId === 'C06')) {
    for (const k of ['pctBelowHigh52w', 'largestCorrection']) assert.ok(!(k in v.features), `${v.ticker} ${k}`);
    assert.ok(!v.features.vcpFootprint || !('depths' in v.features.vcpFootprint), `${v.ticker} vcpFootprint.depths`);
    assert.ok(['pctAboveLow52w', 'vcpProxyState', 'rangesContracting'].every((k) => k in v.features), `${v.ticker} Beschreibung bleibt`);
  }
  // Gegenproben: der Detektorwert pctBelowHigh52w fiele in jeder SEPA-Ansicht auf
  const det = (v) => { const s = secs.find((x) => x.ticker === v.ticker); return DETECTORS[v.strategyId](s, { dq: { status: 'PASS', checks: [] }, weekly: WEEKLY.get(s.id) ?? null, momentum: null, nextSession: CAL.nextSession(F.asOf), benchWeekly: null, asOf: F.asOf, listingStart: s.meta?.listingStart ?? null }); };
  const c06 = below.filter((v) => v.candidateId === 'C06');
  for (const v of c06) { const w = structuredClone(v); w.features.pctBelowHigh52w = det(v).features.pctBelowHigh52w; assert.notDeepEqual(highDerivations(w, hiOf(v)), [], `${v.ticker} pctBelowHigh52w`); }
  // Basistief am 52-Wochen-Tief (im vollen Lauf 22 von 668 SEPA-Ansichten): die Tiefe ergäbe mit low252 das Hoch
  for (const v of c06) {
    const hi = hiOf(v), depth = 1 - v.trend.low252 / hi;
    for (const set of [(w) => { w.features.largestCorrection = depth; }, (w) => { w.features.vcpFootprint = { ...(w.features.vcpFootprint ?? {}), depths: [depth] }; }]) {
      const w = structuredClone(v); set(w); assert.notDeepEqual(highDerivations(w, hi), [], `${v.ticker} ${set}`);
    }
  }
});

// Owner-Entscheidung 28.10.2026 (Rückrechenbarkeit): auch zusammen mit den öffentlichen Tageskursen darf kein veröffentlichtes Feld
// einen Einstieg, Stop oder Orderparameter ergeben. Durchsucht werden features, trend, levels, pivot und sortKeys samt Listen:
// - Ganzzahl mit Fensternamen (…Sessions, …Days, …Weeks × 5, …Length, …Window, …Bars): Fenster ± 1, endend am Stichtag oder Vortag;
// - Datum: Hoch/Tief an dem Tag, höchstes Hoch/tiefstes Tief seitdem;
// - Volumenquote (Name mit Volume/Vs50d/Ratio): ein Tag, dessen Volumen genau diese Quote zum Schnitt der 50 Sitzungen davor hat,
//   oder (unter features, dort auch gerundet) ein Fenster, dessen Durchschnittsvolumen genau diese Quote zum 50-Tage-Schnitt vor dem Stichtag hat; nur ein eindeutiger
//   Treffer zählt (Fingerabdruck), daraus Hoch/Tief am Anfang und Ende, höchstes Hoch seitdem, tiefstes Tief danach.
// Verglichen wird auf ± 1 Tick (Kaufstopps liegen einen Tick über einer Marke). Ein Treffer zählt nur, wenn ein Fenster ohne das
// Feld (2–6 Sitzungen, 252) denselben Wert nicht schon liefert, und nur für Order-Größen, die nicht schon als zulässige Struktur
// (± 1 Tick) unter einem vom Owner zugelassenen Strukturschlüssel veröffentlicht sind (STRUCTURE_ORDER_ANCHORS: Box, Widerstand,
// Konsolidierungshoch, Gap-Tief, Chartmarke; eigene Owner-Entscheidungen, eigene Tests), nicht schon neben einem Durchschnitt. Zur Vergleichs-
// basis gehören auch Stichtag und Vortag (öffentlich bekannt) und die Kanallängen der Turtle-Regel (Regelparameter der Quelle,
// 20/55 bzw. 10/20 Tage, im Katalog veröffentlicht: der Trigger folgt aus der Regel, nicht aus dem Feld; Owner-Punkt).
const STRUCTURE_ORDER_ANCHORS = { C03: ['levels.top', 'levels.bottom', 'levels.box.top', 'levels.box.bottom', 'pivot.level'], C08: ['levels.breakoutLevel', 'pivot.level'], C09: ['levels.gapDayLow', 'pivot.level'], C12: ['levels.gapDayLow', 'pivot.level'] };
const BAR_BASELINE = [2, 3, 4, 5, 6, 252], RULE_PARAMETERS = new Set(['levels.channelDays', 'levels.exitChannelDays']), WINDOW_NAME = /(sessions|days|weeks|length|window|bars)$/i, VOLUME_NAME = /(volume|vs50d|ratio)/i;
function barReconstructions(v, bars, orderValues) {
  const i = bars.length - 1, tick = rawTickAdjusted(bars[i]);
  const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= tick + 1e-9 * Math.max(1, Math.abs(b));
  const hi = (a, z) => Math.max(...bars.slice(a, z + 1).map((b) => b.high)), lo = (a, z) => Math.min(...bars.slice(a, z + 1).map((b) => b.low));
  const windows = (n) => [i, i - 1].flatMap((end) => [-1, 0, 1].flatMap((d) => { const a = Math.max(0, end - (n + d) + 1); return a <= end ? [hi(a, end), lo(a, end)] : []; }));
  const fromDay = (k) => { const out = [bars[k].high, bars[k].low]; for (const end of [i, i - 1]) if (k <= end) { out.push(hi(k, end), lo(k, end)); let p = k; for (let j = k; j <= end; j++) if (bars[j].high > bars[p].high) p = j; if (p < end) out.push(lo(p + 1, end)); } return out; };
  const avg = (a, z) => { let t = 0; for (let j = a; j <= z; j++) t += bars[j].volume; return t / (z - a + 1); };
  const ratioMatch = (x) => { const d = Math.round(x * 1e4) / 1e4 === x ? 5e-5 : 1e-9 * Math.max(1, x); return (r) => Math.abs(r - x) <= d; };
  const fingerprints = (x, windowsToo) => {
    const hit = ratioMatch(x), days = [], wins = [];
    // beide Lesarten der Tagesquote: Volumen des Tages bzw. des Folgetages gegen die 50 Sitzungen davor (Power-Play-Start)
    for (let k = 50; k <= i; k++) { const base = avg(k - 50, k - 1); if (base > 0 && (hit(bars[k].volume / base) || (k < i && hit(bars[k + 1].volume / base)))) days.push(k); }
    // Fenstersuche für Kennzahlen unter features (auch gerundet: ein eindeutiger Treffer trifft dort Pivot und Stop); trend und
    // sortKeys tragen nur die allgemeine Tagesquote des Stichtags
    const v50 = i >= 50 && windowsToo ? avg(i - 50, i - 1) : 0;
    if (v50 > 0) for (let a = Math.max(0, i - 251); a <= i; a++) { let t = 0; for (let z = a; z <= i; z++) { t += bars[z].volume; if (z > a && hit(t / (z - a + 1) / v50)) wins.push([a, z]); } }
    return [...(days.length === 1 ? fromDay(days[0]).concat(days[0] > 0 ? fromDay(days[0] - 1) : []) : []), ...(wins.length === 1 ? [bars[wins[0][0]].high, bars[wins[0][1]].low, hi(...wins[0]), lo(...wins[0])] : [])];
  };
  const leaves = (o, p) => (Array.isArray(o) ? o.flatMap((x, j) => leaves(x, `${p}[${j}]`)) : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, x]) => leaves(x, `${p}.${k}`)) : [[p, o]]);
  const published = [...leaves(v.features ?? {}, 'features'), ...leaves(v.trend ?? {}, 'trend'), ...leaves(v.levels ?? {}, 'levels'), ...leaves(v.pivot ?? {}, 'pivot'), ...leaves(v.sortKeys ?? {}, 'sortKeys')];
  const anchors = STRUCTURE_ORDER_ANCHORS[v.candidateId] ?? [];
  const structure = published.filter(([p]) => anchors.includes(p)).map(([, x]) => x).filter(Number.isFinite);
  const guarded = orderValues.filter((o) => !structure.some((x) => near(x, o)));
  const baseline = [...BAR_BASELINE.flatMap(windows), ...fromDay(i), ...fromDay(i - 1)], out = [];
  for (const [p, x] of published) {
    if (RULE_PARAMETERS.has(p)) continue;
    const key = p.replace(/\[\d+\]$/, '').split('.').pop();
    let cands = [];
    if (Number.isInteger(x) && x >= 2 && WINDOW_NAME.test(key)) cands = /weeks/i.test(key) ? windows(x * 5) : x <= 400 ? windows(x) : [];
    else if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) { const k = bars.findIndex((b) => b.date === x); if (k >= 0) cands = fromDay(k); }
    else if (Number.isFinite(x) && !Number.isInteger(x) && x > 0 && x < 100 && VOLUME_NAME.test(key)) cands = fingerprints(x, p.startsWith('features.'));
    for (const o of guarded) if (cands.some((c) => near(c, o)) && !baseline.some((c) => near(c, o))) out.push(`${p} → ${o}`);
  }
  return [...new Set(out)];
}
test('SF8-NO-BAR-RECONSTRUCTION: kein veröffentlichtes Feld ergibt mit den Tageskursen Einstieg, Stop oder Order (Owner 28.10.)', () => {
  const ov = detectorOrderValues(), secs = securities(), barsOf = (v) => secs.find((x) => x.ticker === v.ticker).bars.filter((b) => b.date <= F.asOf);
  const below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN' && (ov.get(v.recordId) ?? []).length);
  assert.ok(['C04', 'C05', 'C06', 'C07', 'C13'].every((c) => below.some((v) => v.candidateId === c)), 'Golden Cases decken Weinstein, SEPA, Power Play und Holy Grail ab');
  assert.deepEqual(below.flatMap((v) => barReconstructions(v, barsOf(v), ov.get(v.recordId)).map((d) => `${v.candidateId} ${v.ticker} ${d}`)), []);
  // Gegenproben: das ungekürzte Detektorfeld fiele auf (je Methode in mindestens einer Ansicht)
  const det = (v) => { const s = secs.find((x) => x.ticker === v.ticker); return DETECTORS[v.strategyId](s, { dq: { status: 'PASS', checks: [] }, weekly: WEEKLY.get(s.id) ?? null, momentum: null, nextSession: CAL.nextSession(F.asOf), benchWeekly: null, asOf: F.asOf, listingStart: s.meta?.listingStart ?? null }); };
  for (const [c, put] of [['C04', (w, f) => { w.features.baseWeeks = f.baseWeeks; }], ['C05', (w, f) => { w.features.baseWeeks = f.baseWeeks; }], ['C06', (w, f) => { w.features.baseLengthSessions = f.baseLengthSessions; }], ['C06', (w, f) => { w.features.vcpFootprint = { ...w.features.vcpFootprint, baseSessions: f.vcpFootprint?.baseSessions }; }],
    ['C07', (w, f) => { w.features.consolidationSessions = f.consolidationSessions; }], ['C07', (w, f) => { w.features.startVolumeVs50d = f.startVolumeVs50d; }],
    ['C06', (w, f) => { w.features.vcpFootprint = { ...w.features.vcpFootprint, lastContractionVolumeVs50d: f.vcpFootprint?.lastContractionVolumeVs50d }; }],
    // Review 28.10.: auch auf 4 Stellen gerundet bleibt das Fenster eindeutig (Rundung schützt nicht)
    ['C06', (w, f) => { w.features.vcpFootprint = { ...w.features.vcpFootprint, lastContractionVolumeVs50d: Math.round(f.vcpFootprint?.lastContractionVolumeVs50d * 1e4) / 1e4 }; }], ['C13', (w, f) => { w.features.impulseHighDate = f.impulseHighDate; }], ['C13', (w, f) => { w.features.adxAbove30Since = f.adxAbove30Since; }]]) {
    const leaks = below.filter((v) => v.candidateId === c).filter((v) => { const w = structuredClone(v); put(w, det(v).features ?? {}); return barReconstructions(w, barsOf(v), ov.get(v.recordId)).length; });
    assert.ok(leaks.length >= 1, `${c} ${put}`);
  }
});

// Owner-Entscheidungen 28.10.2026 (Weinstein, Turtle): adversarial gegen die öffentlichen Tages- und Wochenkurse.
// Geprüft wird der direkte Anker: keine veröffentlichte Zahl x zeigt – selbst, ± 1 Tick oder als Quote zu einem öffentlichen
// Bezugskurs, auf den sich die veröffentlichten Quoten beziehen (Schluss am Stichtag: k / (1 + x), k · (1 + x)) – auf
// Widerstand, Trigger oder Stopreferenz (Weinstein) bzw. ergibt als N/nPct den Stop (Turtle: Trigger − 2·x, − 2·x·Schluss).
// Ausgenommen sind Zielwerte, die schon allgemeine Chartinformation sind (52-Wochen-Hoch, Stichtag und Vortag, ± 1 Tick).
// Review 28.10.: zusätzlich die Suche über alle früheren Wochenhochs r als möglichen Widerstand – ein Feld ist ein Anker, wenn es
// als Quote des nächsthöheren Wochenhochs zu max(Eröffnung am Ausbruchstag, r + Tick) genau einen Kandidaten übrig lässt und das
// der echte Widerstand ist (so fiel overheadDistance auf; geprüft werden die strategiebezogenen Kennzahlen unter features).
// Was die öffentliche Regel allein aus den Kursen ergibt (Weinstein: letztes Wochen-Swinghoch bzw. Basisbeginn; Turtle:
// Kanalhoch + Tick, N aus den Kursen), ist Regelwissen ohne Feld und nicht Gegenstand dieses Tests (Owner-Bericht).
function weinsteinTurtleLeaks(v, bars, det) {
  const i = bars.length - 1, tick = rawTickAdjusted(bars[i]), lv = det.levels ?? {}, out = [];
  const exact = (c, t) => Number.isFinite(c) && Number.isFinite(t) && [t - tick, t, t + tick].some((u) => Math.abs(c - u) <= 5e-5 * Math.abs(u) + 1e-9);
  const leaves = (o, p) => (Array.isArray(o) ? o.flatMap((x, j) => leaves(x, `${p}[${j}]`)) : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, x]) => leaves(x, `${p}.${k}`)) : [[p, o]]);
  const nums = [...leaves(v.features ?? {}, 'features'), ...leaves(v.trend ?? {}, 'trend'), ...leaves(v.levels ?? {}, 'levels'), ...leaves(v.pivot ?? {}, 'pivot'), ...leaves(v.sortKeys ?? {}, 'sortKeys')].filter(([, x]) => Number.isFinite(x));
  const general = [Math.max(...bars.slice(Math.max(0, i - 251)).map((b) => b.high)), bars[i].high, bars[i].low, bars[i].close, ...(i > 0 ? [bars[i - 1].high, bars[i - 1].low, bars[i - 1].close] : [])];
  if (['C04', 'C05'].includes(v.candidateId)) {
    const targets = [['Widerstand', lv.resistance], ['Trigger', lv.trigger], ['Stop', lv.stopReference]].filter(([, t]) => Number.isFinite(t) && !general.some((g) => exact(g, t)));
    const refs = [bars[i].close];
    for (const [p, x] of nums) {
      const cands = [x, ...(Math.abs(x) < 1 && !Number.isInteger(x) && x !== 0 ? refs.flatMap((r) => [r / (1 + x), r * (1 + x)]) : [])];
      for (const [name, t] of targets) if (cands.some((c) => exact(c, t))) out.push(`${p} → ${name}`);
    }
    const wk = weeklyBars(bars), w = wk.findIndex((b) => b.key === (v.levels ?? {}).breakoutWeek), bd = bars.find((b) => b.date === (v.levels ?? {}).breakoutDay);
    if (w > 0 && bd && Number.isFinite(lv.resistance) && !general.some((g) => exact(g, lv.resistance))) {
      const wt = rawTickAdjusted(wk[w - 1]), highs = [...new Set(wk.slice(0, w).map((b) => b.high))].sort((a, b) => a - b);
      const r4 = (y) => Math.round(y * 1e4) / 1e4;
      for (const [p, x] of nums) {
        if (Number.isInteger(x) || !p.startsWith('features.')) continue;
        // je Kandidat r: nächsthöheres Wochenhoch h, Quote h / max(Eröffnung, r + Tick) − 1 auf 4 Stellen (Form der Überkopf-Distanz);
        // enger als eine Suche über viele Quoten, die mehrere Kandidaten übrig ließe (Review 28.10.: Erkennung 149 → 238 von 422)
        const hit = highs.filter((r, j) => highs[j + 1] !== undefined && r4(highs[j + 1] / Math.max(bd.open, r + wt) - 1) === x);
        if (hit.length === 1 && Math.abs(hit[0] - lv.resistance) < 1e-9) out.push(`${p} → Widerstand (eindeutig über die Wochenhochs)`);
      }
    }
  }
  if (['C01', 'C02'].includes(v.candidateId) && Number.isFinite(lv.trigger) && Number.isFinite(lv.stopReference)) for (const [p, x] of nums) {
    if (p.startsWith('levels.channelDays') || p.startsWith('levels.exitChannelDays')) continue;
    if ([lv.trigger - 2 * x, lv.trigger - 2 * x * bars[i].close].some((c) => exact(c, lv.stopReference))) out.push(`${p} → Stop (Trigger − 2·x)`);
  }
  return [...new Set(out)];
}
test('SF8-WEINSTEIN-TURTLE-ADVERSARIAL: kein Feld ergibt mit Wochen- oder Tageskursen den Weinstein- oder Turtle-Stop (Owner 28.10.)', () => {
  const secs = securities(), below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN' && ['C01', 'C02', 'C04', 'C05'].includes(v.candidateId));
  const det = (v) => { const s = secs.find((x) => x.ticker === v.ticker); return DETECTORS[v.strategyId](s, { dq: { status: 'PASS', checks: [] }, weekly: WEEKLY.get(s.id) ?? null, momentum: null, nextSession: CAL.nextSession(F.asOf), benchWeekly: null, asOf: F.asOf, listingStart: s.meta?.listingStart ?? null }); };
  const barsOf = (v) => secs.find((x) => x.ticker === v.ticker).bars.filter((b) => b.date <= F.asOf);
  assert.ok(['C01', 'C02', 'C04', 'C05'].every((c) => below.some((v) => v.candidateId === c)));
  for (const v of below.filter((x) => ['C04', 'C05'].includes(x.candidateId))) { assert.ok(!('resistance' in v.levels), `${v.ticker} levels.resistance`); assert.equal(v.pivot, null, `${v.ticker} Chartmarke`); }
  for (const v of below.filter((x) => ['C01', 'C02'].includes(x.candidateId))) for (const k of ['N', 'nPct']) assert.ok(!(k in v.features), `${v.ticker} ${k}`);
  for (const v of below.filter((x) => ['C04', 'C05'].includes(x.candidateId))) assert.ok(!('overheadDistance' in v.features), `${v.ticker} overheadDistance`);
  assert.deepEqual(below.flatMap((v) => weinsteinTurtleLeaks(v, barsOf(v), det(v)).map((d) => `${v.candidateId} ${v.ticker} ${d}`)), []);
  // Gegenproben: der genaue Widerstand bzw. N, wieder eingesetzt, fiele auf
  for (const [c, put] of [['C04', (w, d) => { w.levels.resistance = d.levels.resistance; }], ['C05', (w, d) => { w.levels.resistance = d.levels.resistance; }], ['C04', (w, d) => { w.pivot = { level: d.levels.resistance, kind: 'WEEKLY_RESISTANCE', distance: 0 }; }],
    // overheadDistance = nächsthöheres Wochenhoch / max(Eröffnung, Trigger) − 1: der Detektorwert, wieder eingesetzt
    ['C04', (w, d) => { w.features.overheadDistance = d.features.overheadDistance; }], ['C05', (w, d) => { w.features.overheadDistance = d.features.overheadDistance; }],
    ['C01', (w, d) => { w.features.N = d.features.N; }], ['C02', (w, d) => { w.features.nPct = d.features.nPct; }]]) {
    const hits = below.filter((v) => v.candidateId === c).filter((v) => { const d = det(v), w = structuredClone(v); put(w, d); return weinsteinTurtleLeaks(w, barsOf(v), d).length; });
    assert.ok(hits.length >= 1, `${c} ${put}`);
  }
});

// Owner-Freigabe 28.10.2026 (Weinstein): ohne öffentliche Chartmarke ordnen C04/C05 nach Stufe, Datenqualität und Name; die
// Sortierung „Abstand zur Chartmarke“ bietet die Vorschau nur an, wenn eine Ansicht der Strategie eine Marke hat. Keine Gewichtung.
test('SF8-WEINSTEIN-SORT: C04/C05 nach Name sortiert, ohne Sortierung nach einer fehlenden Chartmarke (Owner 28.10.)', () => {
  for (const c of ['C04', 'C05']) {
    const cat = STRATEGY_CATALOG.find((x) => x.candidateId === c);
    assert.deepEqual(cat.defaultSort, ['stage', 'dataQuality', 'ticker'], c);
    const vs = views().filter((v) => v.candidateId === c);
    assert.ok(vs.length > 0 && vs.every((v) => v.pivot === null && v.sortKeys.pivot === null), `${c} ohne Chartmarke`);
    // Reihenfolge = Stufe absteigend, Datenqualität, Ticker – dieselbe wie zuvor mit dem (überall leeren) Chartmarken-Schlüssel
    const { views: ranked } = rankStrategy(cat.strategyId, vs.map((v) => structuredClone(v)));
    const expect = [...vs].sort((a, b) => STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage) || (a.dataQuality?.status === 'PASS' ? 0 : 1) - (b.dataQuality?.status === 'PASS' ? 0 : 1) || (a.ticker < b.ticker ? -1 : 1));
    assert.deepEqual(ranked.map((v) => v.ticker), expect.map((v) => v.ticker), c);
  }
  assert.equal(RANK_SORT_KEYS.ticker.label, 'Name (Ticker, alphabetisch)');
  const ui = fs.readFileSync(path.join(ROOT, 'supertrader/assets/sf-research.js'), 'utf8');
  assert.match(ui, /k !== 'pivot' \|\| views\.some\(function \(v\) \{ return v\.sortKeys && v\.sortKeys\.pivot !== null/, 'Sortierung nach Chartmarke nur mit Marke');
  assert.match(ui, /k !== 'ticker' \|\| !ownKey/, 'die Methodenreihenfolge nennt den Namen, wenn er der eigentliche Schlüssel ist');
  // Darvas behält die Sortierung nach seiner Box-Obergrenze
  assert.deepEqual(STRATEGY_CATALOG.find((x) => x.candidateId === 'C03').defaultSort, ['stage', 'dataQuality', 'pivot', 'ticker']);
});

// Owner-Entscheidung 28.10.2026 (SEPA): eine einzelne Kontraktion reicht nicht, um ein bestätigtes VCP oder einen modellierten Plan
// zu behaupten; keine neue Mindestzahl als Originalregel. Geprüft wird, dass die bestehende Einstufung das schon trägt.
test('SF8-SEPA-ONE-CONTRACTION: eine Kontraktion hebt nichts an – Stufe, Lebenszyklus und Beschriftung (Owner 28.10.)', () => {
  // 1. Die Stufenobergrenze der Strategie ist CHART_CANDIDATE: kein bestätigtes Setup, kein modellierter Plan, unabhängig vom VCP
  assert.equal(CEIL.get('SF_MINERVINI_SEPA_VCP'), 'CHART_CANDIDATE');
  const c06 = views().filter((v) => v.candidateId === 'C06');
  assert.ok(c06.length > 0 && c06.every((v) => v.stage === 'CHART_CANDIDATE' && v.plan === null));
  // 2. Im Research-Lebenszyklus ist „≥ 2 Kontraktionen“ eine ausgewiesene Modellannahme (keine Originalregel: Zahl typisch, keine
  //    Grenze, MIN-VCP-02/03); die Referenzkonfiguration blockiert ein Setup mit einer Kontraktion mit VCP_PROXY_NOT_MET
  const ma = MIN_MODEL_ASSUMPTIONS.find((m) => m.id === 'MA-MIN-SEPA-SETUP-PROXY');
  assert.match(ma.reference, />= 2 contractions/); assert.match(ma.why, /typical, not limits/);
  assert.equal(MIN_REFERENCE_CONFIG.sepaSetupProxy, 'VCP_FOOTPRINT_STRICT');
  const secs = securities();
  for (const v of c06.filter((x) => x.features?.vcpProxyState === 'SETUP_DETECTED')) {
    const sec = secs.find((x) => x.ticker === v.ticker), bars = sec.bars.filter((b) => b.date <= F.asOf), setup = sepaSetupAt({ ...sec, bars }, bars.length - 1);
    assert.equal(setup.state, 'SETUP_DETECTED', v.ticker);
    if (setup.footprint.contractions < 2) {
      assert.equal(setup.vcpProxyStrict, false, `${v.ticker}: eine Kontraktion erfüllt den strengen Proxy nicht`);
      const e = entryEligibility({ strategy: 'SEPA', setup, bars, k: bars.length });
      assert.ok(e.blockers.some((b) => b.code === 'VCP_PROXY_NOT_MET'), `${v.ticker}: ${e.blockers.map((b) => b.code)}`);
    }
  }
  // synthetisch, unabhängig von den Golden Cases: genau eine Kontraktion
  const one = { state: 'SETUP_DETECTED', pivot: 10, stopStructure: 9.5, vcpProxyStrict: false, footprint: { contractions: 1 } };
  const bars = Array.from({ length: 60 }, (_, k) => ({ date: `2026-01-${String(k + 1).padStart(2, '0')}`, open: 9.8, high: 9.9, low: 9.7, close: 9.8, volume: 1e6 }));
  assert.ok(entryEligibility({ strategy: 'SEPA', setup: one, bars, k: bars.length }).blockers.some((b) => b.code === 'VCP_PROXY_NOT_MET'));
  // 3. Die Ansicht behauptet kein VCP: der Sortierschlüssel ordnet nur nach vorhandenem Pivot und sagt das
  assert.equal(RANK_SORT_KEYS.setupState.label, 'Pivot vorhanden (VCP nicht bestätigt)');
  assert.doesNotMatch(RANK_SORT_KEYS.setupState.label, /VCP[- ]?(Proxy )?(erkannt|bestätigt)(?! )/);
});

test('SF8-READINGS-PINNED: die Lesarten je Strategie (index/summary) sind feste Konfigurationstexte ohne Preis; die Vorschau zeigt nur die Regel', () => {
  // vierte Nachprüfung (M2): readings stammen aus der ersten Erkennung je Strategie und werden strategieweit veröffentlicht
  const READINGS = {
    C01: [{ ruleId: 'TUR-SF-S1-OPEN-BREAKOUT', reading: 'MA-TUR-S1-OPEN-BREAKOUT reference openBreakout=SKIP' }, { ruleId: 'TUR-SF-FAILSAFE-EXIT', reading: "MA-TUR-FAILSAFE-EXIT reference failsafeExit='10D'" }],
    C02: [], C03: [{ ruleId: 'DAR-SF-BOTTOM-START', reading: 'MA-DAR-BOTTOM-START reference AFTER_TOP_DAY' }], C04: [], C05: [], C06: [], C07: [], C08: [],
    C09: [{ ruleId: 'KK-SF-EP-EXIT', reading: 'not modelled (chart candidate only)' }], C10: [],
    C11: [{ ruleId: 'MOKA-SF-EXIT-VIOLATION', reading: 'MA-MOKA-VIOLATION-READING reference LATER_DAYS' }],
    C12: [{ ruleId: 'MOKA-SF-BGU-VOLWINDOW', reading: 'MA-MOKA-BGU-VOLWINDOW 50 sessions (owner decision D-BGU-VOLWINDOW)' }, { ruleId: 'MOKA-SF-EXIT-VIOLATION', reading: 'MA-MOKA-VIOLATION-READING reference LATER_DAYS' }],
    C13: [{ ruleId: 'RAS-SF-SIZE', reading: 'not disclosed in the sources: no size is shown' }],
  };
  assert.deepEqual(Object.fromEntries(RES.strategies.map((s) => [s.candidateId, s.readings])), READINGS);
  // auch aus jeder anderen Erkennung: die Lesart hängt nie vom Titel ab (sonst trüge sie einen Preis des ersten Titels)
  const secs = securities();
  for (const v of views()) {
    const s = secs.find((x) => x.ticker === v.ticker);
    const det = DETECTORS[v.strategyId](s, { dq: { status: 'PASS', checks: [] }, weekly: WEEKLY.get(s.id) ?? null, momentum: null, nextSession: CAL.nextSession(F.asOf), benchWeekly: null, asOf: F.asOf, listingStart: s.meta?.listingStart ?? null });
    if (det.detected) assert.deepEqual(det.ambiguousReadings, READINGS[v.candidateId], `${v.candidateId} ${v.ticker}`);
  }
  const ui = fs.readFileSync(path.join(ROOT, 'supertrader/assets/sf-research.js'), 'utf8');
  assert.deepEqual([...ui.matchAll(/readings[^;\n]{0,80}/g)].map((m) => m[0]).filter((x) => /\.reading\b/.test(x)), [], 'die Vorschau zeigt nur die ruleId einer Lesart');
});

test('SF8-STRUCTURE-MARKS: unterhalb von MODELED Chartstruktur je Methode (Box, Widerstand, Gap-Tief), nie eine Einstiegs-, Stop- oder Ordermarke', async () => {
  // Gegenstück im Core (DQ-SF8-4): Strukturtabellen gleich; Sperrlisten des Core nie strenger als der Erzeuger (sonst wäre die
  // Ausgabe rot), jede Seite schreibt ihre Listen zusätzlich fest. So bleibt jeder Zwischenstand (Erzeuger zuerst, Core danach) grün.
  const { default: DQ } = await import('../../../core/data-quality.js');
  // alle oder keine: ein umbenannter Export schaltet den Abgleich nicht still ab (Review N2)
  const coreKeys = ['SF8_TREND_HIDDEN', 'SF8_FEATURES_HIDDEN', 'SF8_SUBFIELDS_HIDDEN', 'SF8_PIVOT_LEVEL'], present = coreKeys.filter((k) => k in DQ);
  assert.ok(present.length === 0 || present.length === coreKeys.length, `Core-Vertrag unvollständig: ${present.join(', ')}`);
  if (present.length) {
    const plain = (o) => JSON.parse(JSON.stringify(o));
    const within = (core, prod, name) => { for (const [c, ks] of Object.entries(core)) for (const k of Array.isArray(ks) ? ks : Object.keys(ks)) {
      if (Array.isArray(ks)) assert.ok((prod[c] ?? []).includes(k), `${name}: Core sperrt ${c} ${k}, der Erzeuger nicht`);
      else for (const j of ks[k]) assert.ok((prod[c]?.[k] ?? []).includes(j), `${name}: Core sperrt ${c} ${k}.${j}, der Erzeuger nicht`);
    } };
    within(plain(DQ.SF8_SUBFIELDS_HIDDEN), plain(ORDER_DERIVED_SUBFIELDS_BY_METHOD), 'SF8_SUBFIELDS_HIDDEN');
    // Strukturmarken und Chartmarken: was der Erzeuger zeigt, muss der Core erlauben (der Core ist nie strenger)
    for (const [c, ks] of Object.entries(EXPECTED_STRUCTURE)) for (const k of ks) assert.ok((DQ.SF8_STRUCTURE_LEVELS[c] ?? []).includes(k), `Core erlaubt ${c} levels.${k} nicht`);
    for (const [c, [lvl, kind]] of Object.entries(EXPECTED_MARK)) { assert.equal(DQ.SF8_PIVOT_LEVEL[c], lvl, `Core ${c} Chartmarke`); assert.equal(DQ.SF8_PIVOT_KINDS[c], kind, `Core ${c} Markenart`); }
    within(plain(DQ.SF8_FEATURES_HIDDEN), plain(ORDER_DERIVED_BY_METHOD), 'SF8_FEATURES_HIDDEN');
    assert.deepEqual(plain(DQ.SF8_TREND_HIDDEN), plain(TREND_HIDDEN_BY_METHOD));
  }
  // Korrektur 28.10.2026: chartMarks las die nach Cxx geschlüsselten Tabellen mit der strategyId und fand nie eine Marke.
  assert.deepEqual(Object.fromEntries(Object.entries(STRUCTURE_LEVELS).map(([c, ks]) => [c, [...ks]])), EXPECTED_STRUCTURE, 'Produkttabelle = festgeschriebene Strukturtabelle');
  const below = views().filter((v) => v.stage !== 'MODELED_TRADE_PLAN');
  // Golden Cases: welche Methode zeigt unterhalb von MODELED welche Marke (Änderung = fachliche Änderung mit Vorher/Nachher)
  const shown = {};
  for (const v of below) {
    const key = `${v.candidateId}:${Object.keys(v.levels).sort().join('+') || '-'}:${v.pivot ? v.pivot.kind : '-'}`;
    shown[key] = (shown[key] || 0) + 1;
  }
  assert.deepEqual(shown, GOLDEN_STRUCTURE_SHOWN);
  // Darvas: Box-Obergrenze als Chartmarke, Box und Unterkante als Struktur, nie Trigger (Obergrenze + Bruchteil) oder Stop
  const avbc = below.find((v) => v.candidateId === 'C03' && v.ticker === 'AVBC');
  assert.equal(avbc.pivot.kind, 'BOX_TOP'); assert.equal(avbc.pivot.level, avbc.levels.top); assert.equal(avbc.levels.box.top, avbc.levels.top);
  assert.ok(avbc.levels.bottom < avbc.levels.top && !('trigger' in avbc.levels) && !('stopReference' in avbc.levels));
  // Buyable Gap-Up: Gap-Tief als Chartstruktur (Art GAP_DAY_LOW), der Stop der Quelle (stopReference) bleibt unveröffentlicht
  for (const v of below.filter((x) => x.candidateId === 'C12')) {
    assert.equal(v.pivot.kind, 'GAP_DAY_LOW', v.ticker); assert.equal(v.pivot.level, v.levels.gapDayLow, v.ticker);
    assert.ok(!('stopReference' in v.levels) && v.plan === null, v.ticker);
  }
  // Methoden, deren einzige Marke die Order ist, oder deren Pivot/Swing-Tief der Orderpreis ist: keine Chartmarke
  for (const v of below.filter((x) => ['C01', 'C02', 'C06', 'C07', 'C10', 'C11', 'C13'].includes(x.candidateId))) {
    assert.equal(v.pivot, null, `${v.candidateId} ${v.ticker}`);
    for (const k of ['pivot', 'swingLow', 'impulseHigh', 'signalDayLow', 'trigger', 'stopReference', 'limit']) assert.ok(!(k in v.levels), `${v.candidateId} ${v.ticker} ${k}`);
  }
  // Power Play (C07) unterhalb von MODELED: der Pivot ist die Einstiegsorder (order.level = pivot), also weder Marke noch
  // Abstand dazu; der geplante Verlust am Pivot (plannedLossAtPivot) bleibt eine order-abgeleitete Kennzahl
  const c07 = below.filter((v) => v.candidateId === 'C07');
  assert.deepEqual(c07.map((v) => `${v.ticker}:${v.stage}`).sort(), ['MGLD:CONFIRMED_RESEARCH_SETUP', 'WDAY:CHART_CANDIDATE']);
  for (const v of c07) {
    assert.deepEqual(v.levels, {}); assert.equal(v.pivot, null); assert.equal(v.sortKeys.pivot, null);
    // die Korrekturtiefe ist rechnerisch der geplante Verlust am Pivot (1 - Stop / Pivot): wie plannedLossAtPivot ausgeblendet
    for (const k of ['plannedLossAtPivot', 'correction']) assert.ok(!(k in v.features), `${v.ticker} ${k}`);
  }
  assert.deepEqual(ORDER_DERIVED_BY_METHOD, { C01: ['N', 'nPct'], C02: ['N', 'nPct'], C04: ['baseWeeks', 'overheadDistance'], C05: ['baseWeeks', 'overheadDistance'], C06: ['pctBelowHigh52w', 'largestCorrection', 'baseLengthSessions'], C07: ['correction', 'consolidationSessions', 'startVolumeVs50d'], C13: ['impulseHighDate', 'adxAbove30Since'] });
  assert.deepEqual(ORDER_DERIVED_SUBFIELDS_BY_METHOD, { C06: { vcpFootprint: ['depths', 'baseSessions', 'lastContractionVolumeVs50d'] } });
  // Owner-Entscheidung 28.10.2026: SEPA, Power Play, Holy Grail ohne 52-Wochen-Hoch (und ohne den Abstand dazu) unterhalb von MODELED
  assert.deepEqual(TREND_HIDDEN_BY_METHOD, { C06: ['high252', 'belowHigh252'], C07: ['high252', 'belowHigh252'], C13: ['high252', 'belowHigh252'] });
  for (const v of below) {
    const hidden = ['C06', 'C07', 'C13'].includes(v.candidateId);
    for (const k of ['high252', 'belowHigh252']) assert.equal(k in v.trend, !hidden, `${v.candidateId} ${v.ticker} trend.${k}`);
  }
  // in MODELED und bei allen anderen Methoden bleibt die allgemeine Trendübersicht vollständig
  const full = { close: 10, high252: 12, belowHigh252: 0.1667, ret63: 0.1 };
  assert.deepEqual(publicTrend({ strategyId: 'SF_MINERVINI_SEPA_VCP' }, 'MODELED_TRADE_PLAN', full), full);
  assert.deepEqual(publicTrend({ strategyId: 'SF_DARVAS_BOX' }, 'CHART_CANDIDATE', full), full);
  assert.deepEqual(publicTrend({ strategyId: 'SF_RASCHKE_HOLY_GRAIL' }, 'CONFIRMED_RESEARCH_SETUP', full), { close: 10, ret63: 0.1 });
  // Katalog: das Gap-Tief ist Chartstruktur, kein bestätigter Stop; die Risikoreferenz gehört nur zum modellierten Ablauf
  const bgu = STRATEGY_CATALOG.find((c) => c.candidateId === 'C12');
  assert.match(bgu.short, /Gap-Tief ist Chartstruktur, kein bestätigter Stop/); assert.doesNotMatch(bgu.short, /Risikoreferenz/);
  assert.match(RULE_LABELS['MOKA-SF-BGU-SELLGUIDE'], /nur im modellierten Ablauf/);
  // fail closed: eine unbekannte Strategie bekommt keine Marke
  assert.deepEqual(chartMarks({ strategyId: 'SF_UNKNOWN', levels: { top: 9 } }, 'CHART_CANDIDATE', 10), { pivot: null, levels: {} });
  // die Kandidaten-ID ergibt sich aus dem Vertrag, nicht aus dem Namen: alle 13 strategyIds finden ihre Tabelle
  for (const c of CONTRACTS) assert.ok(c.candidateId in EXPECTED_STRUCTURE, c.strategyId);
});

test('SF8-UI-ORDER-MARKS-ONLY-IN-PLAN: Einstieg, Stop und Limit zeichnet die Vorschau nur aus v.plan', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'supertrader/assets/sf-research.js'), 'utf8');
  const draw = ui.slice(ui.indexOf('function drawChart('), ui.indexOf('/* ================================================================ API */'));
  assert.ok(draw.length > 200, 'drawChart gefunden');
  // jede Marke des Charts ist genau eine dieser Zeilen; Einstieg und Stop nur im Zweig `if (v.plan)`, aus v.plan
  const pushes = draw.split('\n').filter((l) => /levels\.push\(/.test(l));
  assert.equal(pushes.length, 2, pushes.join('\n'));
  assert.match(pushes[0], /^\s*if \(structOf\(v\.pivot\)\) levels\.push\(\{ id: 'pivot', label: 'Chartstruktur: ' \+ STRUCT_TXT\[v\.pivot\.kind\], value: v\.pivot\.level, color: 'var\(--chart-box-base\)'/);
  // die Beschriftung der Struktur kommt aus einer festen Tabelle ohne Orderwort, nicht in der Farbe des Triggers
  const structTable = ui.slice(ui.indexOf('var STRUCT_TXT = {'), ui.indexOf('function structOf('));
  assert.ok(structTable.length > 20);
  // wörtlich festgeschrieben (Review: ein Etikett wie „Gap-Tief (Ausstieg)“ darf nicht durchgehen); nur belegte Strukturarten
  assert.match(structTable, /^var STRUCT_TXT = \{ BOX_TOP: 'Box-Obergrenze', CONSOLIDATION_10_LEVEL: 'Konsolidierungshoch \(10 Tage\)', GAP_DAY_LOW: 'Gap-Tief' \};\s*\/\/[^\n]*\n\s*$/);
  assert.deepEqual([...structTable.matchAll(/'([^'\\]*)'/g)].map((m) => m[1]).filter((x) => /Stop|Einstieg|Limit|Order|Kauf|Verkauf|Trigger|Risiko|Pivot|Ausstieg|Exit|Verlust|Ziel/i.test(x)), []);
  assert.deepEqual(Object.keys(EXPECTED_MARK).map((c) => EXPECTED_MARK[c][1]).filter((k, i, a) => a.indexOf(k) === i).sort(), ['BOX_TOP', 'CONSOLIDATION_10_LEVEL', 'GAP_DAY_LOW']);
  // eine Engine-Marke des modellierten Ablaufs (z. B. RUN_UP_HIGH = Einstieg) wird nie als Chartstruktur gezeigt
  assert.match(ui, /function structOf\(p\) \{ return p && fin\(p\.level\) && STRUCT_TXT\[p\.kind\] \? p : null; \}/);
  assert.doesNotMatch(pushes[0], /chart-trigger|chart-entry|chart-stop/);
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
  assert.match(card, /pair\('Chartstruktur', usd\(p\.level\), STRUCT_TXT\[p\.kind\] \+ ' · ' \+ pct\(p\.distance, 1, true\)\)/);
  assert.match(card, /var p = structOf\(v\.pivot\)/);
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
