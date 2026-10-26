/**
 * Supertrader 8.0 – Kandidatenerkennung der 13 Source-faithful-Strategien am Stichtag (letzter Tagesbalken).
 *
 * Keine zweite Engine: jeder Detektor ruft ausschließlich die bestehenden, unveränderten Screens bzw. die
 * Lifecycle-Adapter der Research-Läufe auf (methods/*, research/*-lifecycle.mjs) – mit deren REFERENZ-Konfiguration.
 * Ein Detektor liefert nur, was die Engine am Stichtag aus den Balken 0..asOf sagt:
 *  - detected / patternId / patternRuleIds  das mechanische Chartmuster (nur SOURCE_EXACT / SOURCE_DERIVED-Regeln);
 *  - setupRules                              jede mechanische Setup-/Filter-/Einstiegsregel des Vertrags mit met true/false;
 *  - ambiguousReadings                       die gewählte Lesart jeder SOURCE_AMBIGUOUS-Regel (Research-Referenz);
 *  - plan                                    NUR wenn der Research-Lifecycle selbst eine Order für die Folgesitzung
 *                                            bildet (eligibility ohne Blocker); sonst null mit planBlockers;
 *  - features / levels                       Zahlen, die die Engine ausweist (Pivot, Trigger, Box, Volumen …).
 * Welche Stufe daraus wird, entscheidet records.mjs gegen Vertrag, Readiness und Datenqualität – nie der Detektor.
 *
 * "Nächste Sitzung": Engines, die eine Entscheidung für die Sitzung NACH dem Stichtag treffen (Weinstein: Woche W+1,
 * Parabolic Short: Handelstag t+1), lesen von dieser Sitzung nur Datum bzw. Wochenschlüssel. Dafür wird ein Platzhalter
 * ohne Kurswerte (NaN) angehängt; Test SF8-NEXT-SESSION-PLACEHOLDER-NO-LOOKAHEAD weist nach, dass das Ergebnis mit
 * dem echten Folgebalken identisch ist.
 */
import { fin, smaAt, priorHigh } from '../common/series.mjs';
import { fractionFor } from '../methods/darvas.mjs';
import { turtleN, createBreakoutTracker, entryTrigger, PARAMS as TUR_PARAMS } from '../methods/turtle.mjs';
import { trendTemplate, vcpEvidence, rsProxy } from '../methods/minervini.mjs';
import { pocketPivotAt, gapUpAt, sellGuideEvidence } from '../methods/morales-kacher.mjs';
import { adr20, momentumRanks, breakoutEvidence, epGapEvidence, parabolicEvidence } from '../methods/kullamagi.mjs';
import { investorScreen, traderScreen } from '../methods/weinstein.mjs';
import { DARVAS_ADAPTER, DARVAS_REFERENCE_CONFIG, DARVAS_MODEL_ASSUMPTIONS } from '../research/darvas-lifecycle.mjs';
import { KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, KK_MODEL_ASSUMPTIONS } from '../research/kk-breakout-lifecycle.mjs';
import { POCKET_PIVOT_ADAPTER, BUYABLE_GAP_UP_ADAPTER, PP_REFERENCE_CONFIG, BGU_REFERENCE_CONFIG, MOKA_MODEL_ASSUMPTIONS } from '../research/moka-lifecycle.mjs';
import { HOLY_GRAIL_RESEARCH_ADAPTER, HG_REFERENCE_CONFIG } from '../research/holy-grail-lifecycle.mjs';
import { sepaSetupAt, powerPlaySetupAt, entryEligibility, REFERENCE_CONFIG as MIN_REFERENCE_CONFIG, MODEL_ASSUMPTIONS as MIN_MODEL_ASSUMPTIONS } from '../research/minervini-lifecycle.mjs';
import { epChartCandidate, EP_REFERENCE_CONFIG } from '../research/kk-ep-lifecycle.mjs';
import { psChartCandidate, PS_REFERENCE_CONFIG } from '../research/kk-ps-study.mjs';

export const DETECTORS_VERSION = 'sf8-detectors-1.0.0';
/** KK-SF-BO-MOMENTUM "top 1-2 %": gelesen als bestes 1/3/6-Monats-Perzentil >= 98 (äußere Grenze der Quelle, 2 %). */
export const KK_MOMENTUM_TOP_PERCENTILE = 98;

const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const pct = (a, b) => (fin(a) && fin(b) && b !== 0 ? a / b - 1 : null);
const maOf = (MA, id) => MA.find((m) => m.id === id);
const assumption = (ruleId, ma) => ({ ruleId, assumption: `${ma.id}: ${ma.reference}` });

/** Platzhalter der Folgesitzung: nur Datum, keine Kurswerte (siehe Kopf). */
export const withNextSession = (bars, nextDate) => [...bars, { date: nextDate, open: NaN, high: NaN, low: NaN, close: NaN, volume: NaN, placeholder: true }];
const isoWeekKey = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };

/** Beschreibende Trend-, Volumen- und Volatilitätsmerkmale (gleich für alle Strategien, nur Anzeige / Sortierung). */
export function commonFeatures(bars) {
  const i = bars.length - 1, c = bars[i].close;
  const vol50 = (() => { if (i < 50) return null; let s = 0; for (let k = i - 50; k < i; k++) s += bars[k].volume; return s > 0 ? s / 50 : null; })();
  const dv20 = (() => { if (i < 19) return null; let s = 0; for (let k = i - 19; k <= i; k++) s += bars[k].close * bars[k].volume; return s / 20; })();
  let hi = -Infinity, lo = Infinity; for (let k = Math.max(0, i - 251); k <= i; k++) { hi = Math.max(hi, bars[k].high); lo = Math.min(lo, bars[k].low); }
  const ma50 = smaAt(bars, i, 50), ma200 = smaAt(bars, i, 200), ma50Prior = smaAt(bars, i - 20, 50);
  return {
    close: c, change1d: i >= 1 ? r4(pct(c, bars[i - 1].close)) : null,
    ma50: r4(ma50), ma200: r4(ma200), vsMa50: r4(pct(c, ma50)), vsMa200: r4(pct(c, ma200)), ma50Rising20d: fin(ma50) && fin(ma50Prior) ? ma50 > ma50Prior : null,
    ret63: i >= 63 ? r4(pct(c, bars[i - 63].close)) : null, ret126: i >= 126 ? r4(pct(c, bars[i - 126].close)) : null,
    high252: r4(hi), low252: r4(lo), belowHigh252: r4(1 - c / hi), windowSessions: Math.min(252, i + 1),
    volumeVs50d: vol50 ? r4(bars[i].volume / vol50) : null, dollarVolume20d: dv20 ? Math.round(dv20) : null, adr20: r4(adr20(bars, i + 1)),
  };
}

const NONE = (strategyId, why, extra = {}) => ({ strategyId, detected: false, why, ...extra });

// ------------------------------------------------------------------ C01 / C02 Turtle
/**
 * Muster: der Einstieg der Quelle (TUR-SF-ENTRY) hat am Stichtag ausgelöst (Hoch >= Vorperiodenhoch + Tick), für S1 mit
 * dem Filterzustand vor dem Stichtag (Referenz-Lesart openBreakout = SKIP) inkl. 55-Tage-Failsafe.
 * Kein Plan: der Einstieg der Quelle liegt INTRADAY am Stichtag (TUR-SF-ENTRY); ein EOD-Produkt kann ihn nicht für die
 * Folgesitzung modellieren, ohne eine neue Einstiegsregel einzuführen (Owner-Entscheidung O-1, Doku §6).
 */
function detectTurtle(system) {
  const strategyId = system === 'S1' ? 'SF_TURTLE_S1' : 'SF_TURTLE_S2';
  return (sec, ctx) => {
    const bars = sec.bars, i = bars.length - 1, N = turtleN(bars);
    if (!fin(N[i - 1])) return NONE(strategyId, 'N_NOT_AVAILABLE');
    let before = null;
    if (system === 'S1') {
      const tr = createBreakoutTracker(bars, N, TUR_PARAMS, { entryBarOrder: 'PESSIMISTIC' });
      for (let k = 1; k < i; k++) { tr.resolve(k); tr.start(k); }
      const pre = tr.outcome(), res = tr.resolve(i);
      before = res && res.atOpen ? res.outcome : pre;
    }
    const e = entryTrigger(bars, i, system, before, TUR_PARAMS, { openBreakout: 'SKIP' });
    if (!e) return NONE(strategyId, 'NO_BREAKOUT_AT_ASOF');
    if (e.path === 'SKIPPED_BY_FILTER') return NONE(strategyId, 'S1_FILTER_SKIPPED_NO_FAILSAFE', { filterOutcomeBefore: before });
    const S = TUR_PARAMS[system], n = N[i - 1], trigger = e.trigger;
    const liquid = ctx.dq.checks.find((c) => c.id === 'LIQUIDITY_RESEARCH_UNIVERSE')?.status === 'PASS';
    const setupRules = system === 'S1'
      ? [{ ruleId: 'TUR-SF-ENTRY', met: true }, { ruleId: 'TUR-SF-S1-FILTER', met: true }, { ruleId: 'TUR-SF-FAILSAFE', met: true }, { ruleId: 'TUR-SF-CONSISTENT', met: true }, { ruleId: 'TUR-SF-MARKETS', met: liquid }]
      : [{ ruleId: 'TUR-SF-ENTRY', met: true }, { ruleId: 'TUR-SF-S2-NOSKIP', met: true }, { ruleId: 'TUR-SF-CONSISTENT', met: true }, { ruleId: 'TUR-SF-MARKETS', met: liquid }];
    return {
      strategyId, detected: true,
      patternId: e.path === 'FAILSAFE_55' ? 'TURTLE_S1_FAILSAFE_55D_BREAKOUT' : system === 'S1' ? 'TURTLE_S1_20D_BREAKOUT' : 'TURTLE_S2_55D_BREAKOUT',
      patternRuleIds: e.path === 'FAILSAFE_55' ? ['TUR-SF-ENTRY', 'TUR-SF-FAILSAFE', 'TUR-SF-S1-FILTER'] : system === 'S1' ? ['TUR-SF-ENTRY', 'TUR-SF-S1-FILTER'] : ['TUR-SF-ENTRY', 'TUR-SF-S2-NOSKIP'],
      setupRules,
      ambiguousReadings: system === 'S1' ? [{ ruleId: 'TUR-SF-S1-OPEN-BREAKOUT', reading: 'MA-TUR-S1-OPEN-BREAKOUT reference openBreakout=SKIP' }, { ruleId: 'TUR-SF-FAILSAFE-EXIT', reading: "MA-TUR-FAILSAFE-EXIT reference failsafeExit='10D'" }] : [],
      levels: { trigger: r4(trigger), channelDays: e.path === 'FAILSAFE_55' ? 55 : S.entry, stopReference: r4(trigger - TUR_PARAMS.stopN * n), exitChannelDays: S.exit },
      features: { path: e.path, filterOutcomeBefore: before, N: r4(n), nPct: r4(n / bars[i].close), closeVsTrigger: r4(pct(bars[i].close, trigger)), breakoutAtOpen: bars[i].open >= trigger },
      pivot: { level: r4(trigger), kind: 'CHANNEL_BREAKOUT_LEVEL', distance: r4(pct(bars[i].close, trigger)) },
      plan: null, planBlockers: ['TURTLE_ENTRY_IS_INTRADAY_ON_ASOF_NOT_MODELLED_FOR_NEXT_SESSION'],
    };
  };
}

// ------------------------------------------------------------------ C03 Darvas
function detectDarvas(sec, ctx) {
  const strategyId = 'SF_DARVAS_BOX', bars = sec.bars, i = bars.length - 1;
  const prep = DARVAS_ADAPTER.prepare(sec, DARVAS_REFERENCE_CONFIG);
  const setup = prep ? DARVAS_ADAPTER.signalAt(prep, i) : null;
  if (!setup) return NONE(strategyId, 'NO_COMPLETE_BOX_AT_ASOF');
  const el = DARVAS_ADAPTER.eligibility({ ctx: prep, setup, bars, i, cfg: DARVAS_REFERENCE_CONFIG });
  const frac = fractionFor(bars[i]), level = el.order?.level ?? setup.top + frac; // DAR-SF-ENTRY: Top + Bruchteil (Engine)
  // DAR-Q9 Allzeithoch: Tageshochs des Fensters (Engine) UND alle Wochenschlüsse der langen Reihe (Obermenge der Prüfung
  // auf der verfügbaren Historie); ohne Wochenreihe ist das Kriterium nicht prüfbar und gilt als nicht erfüllt
  const weeklyMax = Array.isArray(ctx.weekly) && ctx.weekly.length ? Math.max(...ctx.weekly.filter((p) => p.date < bars[0].date && fin(p.close)).map((p) => p.close), -Infinity) : null;
  const athDaily = !el.blockers.some((b) => b.code === 'NOT_ALL_TIME_HIGH_IN_HISTORY');
  const athLong = weeklyMax === null ? null : level > weeklyMax;
  // DAR-SF-ATH ist ein Quellfilter: ohne Allzeithoch im Tagesfenster ist es kein Darvas-Kandidat (nur eine Box)
  if (!athDaily) return NONE(strategyId, 'BOX_NOT_AT_ALL_TIME_HIGH_IN_WINDOW');
  const ath = athLong === true;
  const plan = ath && el.order ? {
    lifecycleKey: 'DARVAS', variantId: 'REF',
    entry: { type: 'BUY_STOP_NEXT_SESSION', trigger: el.order.level }, stop: el.order.stop,
    sizing: { method: 'WEIGHT_0.10 (MA-DAR-SIZING)', riskFraction: DARVAS_REFERENCE_CONFIG.sizing.weight * (1 - el.order.stop / el.order.level) }, // ungerundet: Vertrag verlangt > 0
    exitRuleIds: ['DAR-SF-STOP-INIT', 'DAR-SF-STOP-RAISE', 'DAR-SF-PROTECT'],
    modelAssumptions: [...['DAR-SF-SELECTION', 'DAR-SF-VOLUME', 'DAR-SF-MARKET'].map((r) => assumption(r, maOf(DARVAS_MODEL_ASSUMPTIONS, 'MA-DAR-MANUAL-SUBSTITUTE'))), assumption('DAR-SF-SIZING', maOf(DARVAS_MODEL_ASSUMPTIONS, 'MA-DAR-SIZING'))],
    declaredDataExceptions: [],
  } : null;
  return {
    strategyId, detected: true, patternId: 'DARVAS_COMPLETE_BOX_AT_HIGH', patternRuleIds: ['DAR-SF-TOP', 'DAR-SF-BOTTOM', 'DAR-SF-ATH'],
    setupRules: [
      { ruleId: 'DAR-SF-TOP', met: true }, { ruleId: 'DAR-SF-BOTTOM', met: true }, { ruleId: 'DAR-SF-TOP-EXCEEDED', met: true }, { ruleId: 'DAR-SF-BOX-FAIL', met: true },
      { ruleId: 'DAR-SF-NO-WAIT', met: true }, { ruleId: 'DAR-SF-ENTRY', met: el.order !== null }, { ruleId: 'DAR-SF-ATH', met: ath },
    ],
    ambiguousReadings: [{ ruleId: 'DAR-SF-BOTTOM-START', reading: `MA-DAR-BOTTOM-START reference ${DARVAS_REFERENCE_CONFIG.bottomSearchStart}` }],
    levels: { top: r4(setup.top), bottom: r4(setup.bottom), trigger: r4(level), stopReference: r4(setup.top - frac), box: { from: setup.topDate, to: bars[i].date, top: r4(setup.top), bottom: r4(setup.bottom) } },
    features: { boxDepth: r4(1 - setup.bottom / setup.top), boxTopDate: setup.topDate, boxBottomDate: setup.bottomDate, boxCompleteDate: setup.completeDate, closeVsTop: r4(pct(bars[i].close, setup.top)), allTimeHighDailyWindow: athDaily, allTimeHighWeeklyLong: athLong, allTimeHighStatus: athLong === null ? 'NOT_CHECKABLE_NO_LONG_SERIES' : 'ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED' },
    pivot: { level: r4(level), kind: 'BOX_TOP_PLUS_FRACTION', distance: r4(pct(bars[i].close, level)) },
    plan, planBlockers: plan ? [] : [...el.blockers.map((b) => b.code), ...(athLong === null ? ['ATH_NOT_CHECKABLE_NO_LONG_SERIES'] : athLong === false ? ['NOT_ALL_TIME_HIGH_LONG_HISTORY'] : [])].filter((x, k, a) => a.indexOf(x) === k),
  };
}

// ------------------------------------------------------------------ C04 / C05 Weinstein (wöchentlich)
/**
 * Quellen-Screens investorScreen / traderScreen (methods/weinstein.mjs, unverändert) auf der letzten ABGESCHLOSSENEN
 * Woche: Ausbruch über den Widerstand bei bestandenem MA30w-Tor. Endet die Woche am Stichtag (nächste Sitzung in einer
 * neuen ISO-Woche), macht der Platzhalter der Folgesitzung diese Woche für die Engine "abgeschlossen".
 */
function detectWeinstein(kind) {
  const strategyId = kind === 'INVESTOR' ? 'SF_WEINSTEIN_INVESTOR' : 'SF_WEINSTEIN_TRADER';
  const screen = kind === 'INVESTOR' ? investorScreen : traderScreen;
  return (sec, ctx) => {
    const i = sec.bars.length - 1, weekEnds = isoWeekKey(ctx.nextSession) !== isoWeekKey(sec.bars[i].date);
    const bars = weekEnds ? withNextSession(sec.bars, ctx.nextSession) : sec.bars;
    const rec = screen({ ...sec, bars }, { bench: ctx.benchWeekly ?? null })[0];
    if (!rec) return NONE(strategyId, 'NO_BREAKOUT_IN_LAST_COMPLETE_WEEK');
    const ev = Object.fromEntries(rec.machineScreenEvidence.map((e) => [e.ruleId, e.value])), close = sec.bars[i].close;
    const ma30w = ev['WEIN-SF-MA-GATE']?.ma30w ?? null, rs = ev['WEIN-SF-RS'], vol = ev['WEIN-SF-VOLUME'], mkt = ev['WEIN-SF-MARKET'];
    return {
      strategyId, detected: true, patternId: kind === 'INVESTOR' ? 'WEINSTEIN_STAGE2_BASE_BREAKOUT_WEEK' : 'WEINSTEIN_STAGE2_CONTINUATION_BREAKOUT_WEEK',
      patternRuleIds: ['WEIN-SF-MA-GATE', 'WEIN-SF-ORDER', kind === 'INVESTOR' ? 'WEIN-SF-INV-BREAKOUT' : 'WEIN-SF-TR-CONT'],
      setupRules: [{ ruleId: 'WEIN-SF-MA-GATE', met: true }, { ruleId: 'WEIN-SF-ORDER', met: true }, { ruleId: kind === 'INVESTOR' ? 'WEIN-SF-INV-BREAKOUT' : 'WEIN-SF-TR-CONT', met: true }],
      ambiguousReadings: [],
      levels: { resistance: r4(rec.buyStop.resistance), trigger: r4(rec.buyStop.level), stopReference: r4(rec.proposedStop.level), ma30w: r4(ma30w), breakoutWeek: rec.asOfWeek, breakoutDay: rec.asOf },
      features: { breakoutWeek: rec.asOfWeek, breakoutDay: rec.asOf, ma30w: r4(ma30w), closeVsMa30w: r4(pct(close, ma30w)), ma30wSlope4w: r4(ev['WEIN-SF-STAGE']?.maSlope4w ?? null), baseWeeks: ev['WEIN-SF-STAGE']?.baseOrConsolidationWeeks ?? null, proposedStopRiskPct: r4(rec.proposedStop.riskPct), riskGuide15pct: rec.proposedStop.riskGuide15pct, rsNormalised: r4(rs?.normalisedLevel ?? null), rsImproving: rs?.improving ?? null, volumeConfirmedAny: vol?.anyAlternative ?? null, overheadDistance: r4(ev['WEIN-SF-OVERHEAD']?.distancePct ?? null), spyAboveMa30w: mkt?.spyAboveMa30w ?? null, groupStage: 'DATA_BLOCKED', marketBreadth: 'DATA_BLOCKED' },
      pivot: { level: r4(rec.buyStop.level), kind: 'WEEKLY_RESISTANCE_PLUS_TICK (WEIN-SF-ORDER)', distance: r4(pct(close, rec.buyStop.level)) },
      plan: null, planBlockers: ['STRATEGY_CEILING_CHART_CANDIDATE'],
    };
  };
}

// ------------------------------------------------------------------ C06 Minervini SEPA / VCP
function detectSepa(sec) {
  const strategyId = 'SF_MINERVINI_SEPA_VCP', bars = sec.bars, i = bars.length - 1;
  const tt = trendTemplate(bars, i);
  if (!tt.pass) return NONE(strategyId, tt.status);
  const setup = sepaSetupAt(sec, i), vcp = vcpEvidence(bars, i);
  const pivotLevel = setup.state === 'SETUP_DETECTED' ? setup.pivot : null;
  return {
    strategyId, detected: true, patternId: 'MINERVINI_TREND_TEMPLATE_1_7',
    patternRuleIds: ['MIN-SF-PROCESS', 'MIN-SF-TT-1', 'MIN-SF-TT-2', 'MIN-SF-TT-3', 'MIN-SF-TT-4', 'MIN-SF-TT-5', 'MIN-SF-TT-6', 'MIN-SF-TT-7'],
    setupRules: [{ ruleId: 'MIN-SF-PROCESS', met: true }, ...Object.entries(tt.criteria).map(([ruleId, met]) => ({ ruleId, met }))],
    ambiguousReadings: [],
    levels: { pivot: r4(pivotLevel), stopReference: r4(setup.stopStructure ?? null), ma50: r4(tt.values.ma50), ma150: r4(tt.values.ma150), ma200: r4(tt.values.ma200) },
    features: { pctAboveLow52w: r4(tt.values.pctAboveLow), pctBelowHigh52w: r4(tt.values.pctBelowHigh), ma200OneMonthAgo: r4(tt.values.ma200OneMonthAgo), vcpProxyState: setup.state, vcpFootprint: setup.footprint ?? null, baseLengthSessions: vcp.baseLengthSessions ?? null, largestCorrection: r4(vcp.largestCorrection ?? null), rangesContracting: vcp.rangesContracting ?? null, rs: rsProxy(null).status, translationUnverified: true },
    pivot: pivotLevel ? { level: r4(pivotLevel), kind: 'VCP_PROXY_PIVOT (MA-MIN-SEPA-PIVOT)', distance: r4(pct(bars[i].close, pivotLevel)) } : null,
    plan: null, planBlockers: ['STRATEGY_CEILING_CHART_CANDIDATE'],
  };
}

// ------------------------------------------------------------------ C07 Minervini Power Play
function detectPowerPlay(sec) {
  const strategyId = 'SF_MINERVINI_POWER_PLAY', bars = sec.bars, i = bars.length - 1;
  const setup = powerPlaySetupAt(sec, i);
  if (!['CONFIRMED_MECHANICAL_SETUP', 'MANUAL_REVIEW_SETUP'].includes(setup.state) || !fin(setup.pivot)) return NONE(strategyId, setup.state);
  const el = entryEligibility({ strategy: 'POWER_PLAY', setup, bars, k: bars.length, cfg: MIN_REFERENCE_CONFIG });
  const confirmed = setup.state === 'CONFIRMED_MECHANICAL_SETUP';
  const MA = (id) => maOf(MIN_MODEL_ASSUMPTIONS, id);
  const plan = confirmed && el.order ? {
    lifecycleKey: 'MINERVINI_POWER_PLAY', variantId: 'REF',
    entry: { type: 'BUY_STOP_LIMIT_NEXT_SESSION', trigger: el.order.level }, stop: el.order.stop,
    sizing: { method: 'RISK_0.0125 (MA-MIN-RISK-FRACTION)', riskFraction: MIN_REFERENCE_CONFIG.riskFraction },
    exitRuleIds: ['MIN-SF-PP-STOP', 'MIN-SF-PP-EXIT'],
    modelAssumptions: [assumption('MIN-SF-PP-ENTRY', MA('MA-MIN-ORDER-TYPE')), assumption('MIN-SF-PP-STOP', MA('MA-MIN-STOP-PLACEMENT')), assumption('MIN-SF-PP-SIZE', MA('MA-MIN-RISK-FRACTION')), assumption('MIN-SF-PP-EXIT', MA('MA-MIN-EXIT-POLICY'))],
    declaredDataExceptions: [], limit: el.order.limit,
  } : null;
  return {
    strategyId, detected: true, patternId: 'MINERVINI_POWER_PLAY_FLAG', patternRuleIds: ['MIN-SF-PP-RUNUP', 'MIN-SF-PP-CORRECTION'],
    setupRules: [{ ruleId: 'MIN-SF-PP-RUNUP', met: true }, { ruleId: 'MIN-SF-PP-CORRECTION', met: true }, { ruleId: 'MIN-SF-PP-TIGHT', met: confirmed }],
    ambiguousReadings: [],
    levels: { pivot: r4(setup.pivot), stopReference: r4(setup.stopStructure), limit: r4(el.order?.limit ?? null) },
    features: { correction: r4(setup.correction), consolidationSessions: setup.consolidationSessions, startVolumeVs50d: r4(setup.startVolumeVs50d), reviewReasons: setup.reasons, plannedLossAtPivot: r4(el.plannedLossAtPivot), translationUnverified: true },
    pivot: { level: r4(setup.pivot), kind: 'RUN_UP_HIGH (MA-MIN-PP-PIVOT)', distance: r4(pct(bars[i].close, setup.pivot)) },
    plan, planBlockers: plan ? [] : [...(confirmed ? [] : ['MANUAL_REVIEW_SETUP']), ...el.blockers.map((b) => b.code)],
  };
}

// ------------------------------------------------------------------ C08 Kullamägi Breakout (täglich)
function detectKkBreakout(sec, ctx) {
  const strategyId = 'SF_KK_BREAKOUT', bars = sec.bars, i = bars.length - 1;
  const m = ctx.momentum?.get(sec.id) ?? null;
  const momentumMet = fin(m?.bestPercentile) && m.bestPercentile >= KK_MOMENTUM_TOP_PERCENTILE;
  if (!momentumMet) return NONE(strategyId, 'NOT_IN_MOMENTUM_TOP_2PCT', { bestPercentile: m?.bestPercentile ?? null });
  const prep = KK_BREAKOUT_ADAPTER.prepare(sec, KK_REFERENCE_CONFIG), setup = prep ? KK_BREAKOUT_ADAPTER.signalAt(prep, i) : null;
  const el = setup ? KK_BREAKOUT_ADAPTER.eligibility({ setup, bars, i, cfg: KK_REFERENCE_CONFIG }) : null;
  const MA = (id) => maOf(KK_MODEL_ASSUMPTIONS, id);
  const plan = el?.order ? {
    lifecycleKey: 'KK_BREAKOUT', variantId: 'REF',
    entry: { type: 'ON_OPEN_NEXT_SESSION (reference = as-of close)', trigger: bars[i].close }, stop: el.order.stop,
    sizing: { method: 'RISK_0.005 (MA-KK-RISK-FRACTION)', riskFraction: KK_REFERENCE_CONFIG.sizing.riskFraction },
    exitRuleIds: ['KK-SF-BO-STOP', 'KK-SF-STOPMARKET', 'KK-SF-BO-PARTIAL', 'KK-SF-BO-TRAIL'],
    modelAssumptions: [assumption('KK-SF-SIZE', MA('MA-KK-RISK-FRACTION')), assumption('KK-SF-BO-SETUP', MA('MA-KK-SETUP-PROXY')), assumption('KK-SF-BO-ENTRY', MA('MA-KK-ENTRY-TIMING')), assumption('KK-SF-BO-PARTIAL', MA('MA-KK-EXIT-POLICY')), assumption('KK-SF-BO-TRAIL', MA('MA-KK-EXIT-POLICY'))],
    declaredDataExceptions: [], maxPlannedLoss: el.order.maxPlannedLoss ?? null,
  } : null;
  const ev = breakoutEvidence(bars, i);
  return {
    strategyId, detected: true, patternId: 'KK_MOMENTUM_LEADER_TOP_2PCT', patternRuleIds: ['KK-SF-BO-MOMENTUM'],
    setupRules: [{ ruleId: 'KK-SF-BO-MOMENTUM', met: true }],
    ambiguousReadings: [],
    levels: { breakoutLevel: r4(setup?.level ?? priorHigh(bars, bars.length, 10)), stopReference: r4(setup ? bars[i].low : null) },
    features: { momentum: { p1m: r4(m.p1m), p3m: r4(m.p3m), p6m: r4(m.p6m), best: r4(m.bestPercentile), r1m: r4(m.r1m), r3m: r4(m.r3m), r6m: r4(m.r6m) }, breakoutToday: !!setup, setupProxy: KK_REFERENCE_CONFIG.setupProxy, priorMove63: r4(ev.priorMove.r63), higherLows: ev.higherLows, ma10Rising: ev.risingMA.ma10, ma20Rising: ev.risingMA.ma20, adr20: r4(ev.adr20) },
    pivot: { level: r4(setup?.level ?? priorHigh(bars, bars.length, 10)), kind: setup ? 'CONSOLIDATION_10_LEVEL (MA-KK-SETUP-PROXY), broken at as-of close' : '10-SESSION HIGH (evidence, MA-KK-SETUP-PROXY window)', distance: r4(pct(bars[i].close, setup?.level ?? priorHigh(bars, bars.length, 10))) },
    plan, planBlockers: plan ? [] : setup ? el.blockers.map((b) => b.code) : ['NO_SETUP_PROXY_BREAKOUT_AT_ASOF'],
  };
}

// ------------------------------------------------------------------ C09 Episodic Pivot (Chart-Modell)
function detectEp(sec) {
  const strategyId = 'SF_KK_EPISODIC_PIVOT', bars = sec.bars, i = bars.length - 1;
  const c = epChartCandidate(bars, i, EP_REFERENCE_CONFIG);
  if (!c) return NONE(strategyId, 'NO_GAP_10PCT_AT_ASOF');
  const ev = epGapEvidence(bars, i);
  return {
    strategyId, detected: true, patternId: 'KK_EP_CHART_GAP_10PCT', patternRuleIds: ['KK-SF-EP-GAP', 'KK-SF-ADR'],
    setupRules: [{ ruleId: 'KK-SF-EP-GAP', met: true }], ambiguousReadings: [{ ruleId: 'KK-SF-EP-EXIT', reading: 'not modelled (chart candidate only)' }],
    levels: { gapDayLow: r4(bars[i].low), priorClose: r4(bars[i - 1].close) },
    features: { gap: r4(c.gap), priorRun63: r4(c.priorRun63), priorRange63: r4(c.priorRange63), adr20: r4(c.adr20), dailyVolumeVs50d: r4(ev.dailyVolumeVs50d), catalyst: 'DATA_BLOCKED (nicht verifiziert, nicht erfunden)', intradayVolume: 'DATA_BLOCKED', entryOpeningRange: 'DATA_BLOCKED', model: 'CHART_MODEL_NOT_ORIGINAL_EP' },
    pivot: { level: r4(bars[i].low), kind: 'GAP_DAY_LOW (evidence)', distance: r4(pct(bars[i].close, bars[i].low)) },
    plan: null, planBlockers: ['STRATEGY_CEILING_CHART_CANDIDATE', 'KK-SF-EP-CATALYST:DATA_BLOCKED', 'KK-SF-EP-ENTRY:DATA_BLOCKED'],
  };
}

// ------------------------------------------------------------------ C10 Parabolic Short (Chart-Modell)
function detectPs(sec, ctx) {
  const strategyId = 'SF_KK_PARABOLIC_SHORT', i = sec.bars.length - 1;
  const bars = withNextSession(sec.bars, ctx.nextSession);
  const c = psChartCandidate(bars, i + 1, PS_REFERENCE_CONFIG); // Handelstag t = Folgesitzung, entschieden am Schluss von asOf
  if (!c) return NONE(strategyId, 'NO_PARABOLIC_STREAK_AT_ASOF');
  const ev = parabolicEvidence(sec.bars, i);
  return {
    strategyId, detected: true, patternId: 'KK_PS_CHART_PARABOLIC_STREAK', patternRuleIds: ['KK-SF-ADR'],
    setupRules: [], ambiguousReadings: [],
    levels: { ma10: r4(smaAt(sec.bars, i, 10)), ma20: r4(smaAt(sec.bars, i, 20)) },
    features: { direction: 'SHORT_RESEARCH_MODEL', upStreak: c.upStreak, streakReturnSum: r4(c.streakReturnSum), accelerating: c.accelerating, adr20: r4(c.adr20), distanceToMA10: r4(c.distanceToMA10), distanceToMA20: r4(c.distanceToMA20), streakReturns: ev.streakReturns.map(r4), borrow: 'DATA_BLOCKED (keine Aussage zur Leihbarkeit)', entry: 'DATA_BLOCKED (Intraday)', model: 'CHART_MODEL_NOT_EXECUTABLE' },
    pivot: null,
    plan: null, planBlockers: ['STRATEGY_CEILING_CHART_CANDIDATE', 'KK-SF-PS-BORROW:DATA_BLOCKED', 'SHORT_NOT_IN_PRODUCT_CONTRACT'],
  };
}

// ------------------------------------------------------------------ C11 Pocket Pivot
function detectPocketPivot(sec) {
  const strategyId = 'SF_MOKA_POCKET_PIVOT', bars = sec.bars, i = bars.length - 1;
  const r = pocketPivotAt(bars, i);
  if (r.status !== 'VOLUME_SIGNATURE') return NONE(strategyId, r.status);
  const prep = POCKET_PIVOT_ADAPTER.prepare(sec, PP_REFERENCE_CONFIG), proxy = prep ? POCKET_PIVOT_ADAPTER.signalAt(prep, i) : null;
  const guide = sellGuideEvidence(bars, i), c = bars[i].close;
  return {
    strategyId, detected: true, patternId: 'MOKA_POCKET_PIVOT_VOLUME_SIGNATURE', patternRuleIds: ['MOKA-SF-PP-VOLUME'],
    setupRules: [{ ruleId: 'MOKA-SF-PP-VOLUME', met: true }],
    ambiguousReadings: [{ ruleId: 'MOKA-SF-EXIT-VIOLATION', reading: `MA-MOKA-VIOLATION-READING reference ${PP_REFERENCE_CONFIG.violationReading}` }],
    levels: { ma10: r4(guide.ma10), ma50: r4(guide.ma50), signalDayLow: r4(bars[i].low) },
    features: { volume: r.volume, maxDownVolume: r.maxDownVolume, volumeVsMaxDown: r4(r.volume / r.maxDownVolume), downDays: r.downDays, pctFrom10DMA: r4(pct(c, smaAt(bars, i, 10))), pctFrom50DMA: r4(pct(c, smaAt(bars, i, 50))), pctFrom200DMA: r4(pct(c, smaAt(bars, i, 200))), contextProxyMa50: !!proxy, sellGuide: guide.readings[PP_REFERENCE_CONFIG.violationReading]?.proposedGuide ?? null, stop: 'NOT_IN_SOURCE (MOKA-SF-PP-STOP manuell)' },
    pivot: null,
    plan: null, planBlockers: ['STRATEGY_CEILING_CONFIRMED_RESEARCH_SETUP', 'MOKA-SF-PP-STOP:NO_SOURCE_STOP'],
  };
}

// ------------------------------------------------------------------ C12 Buyable Gap-Up
function detectBgu(sec) {
  const strategyId = 'SF_MOKA_BUYABLE_GAP_UP', bars = sec.bars, i = bars.length - 1;
  const r = gapUpAt(bars, i);
  if (!['GAP_AND_STANDARD_VOLUME', 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW', 'GAP_VOLUME_WINDOW_UNAVAILABLE_REVIEW'].includes(r.status)) return NONE(strategyId, r.status ?? 'NO_GAP');
  const prep = BUYABLE_GAP_UP_ADAPTER.prepare(sec, BGU_REFERENCE_CONFIG), setup = prep ? BUYABLE_GAP_UP_ADAPTER.signalAt(prep, i) : null;
  const el = setup ? BUYABLE_GAP_UP_ADAPTER.eligibility({ setup, bars, i, cfg: BGU_REFERENCE_CONFIG }) : null;
  const volumeMet = r.status === 'GAP_AND_STANDARD_VOLUME';
  const MA = (id) => maOf(MOKA_MODEL_ASSUMPTIONS, id);
  const plan = volumeMet && el?.order && el.order.stop < bars[i].close ? {
    lifecycleKey: 'BUYABLE_GAP_UP', variantId: 'REF',
    entry: { type: 'ON_OPEN_NEXT_SESSION (reference = as-of close)', trigger: bars[i].close }, stop: el.order.stop,
    sizing: { method: 'RISK_0.01 (MA-MOKA-SIZING)', riskFraction: BGU_REFERENCE_CONFIG.sizing.riskFraction },
    exitRuleIds: ['MOKA-SF-BGU-SELLGUIDE', 'MOKA-SF-EXIT-MA', 'MOKA-SF-EXIT-VIOLATION'],
    modelAssumptions: [assumption('MOKA-SF-BGU-MEGA', MA('MA-MOKA-MANUAL-SUBSTITUTE')), assumption('MOKA-SF-BGU-CONTEXT', MA('MA-MOKA-CONTEXT-PROXY')), assumption('MOKA-SF-BGU-SELLGUIDE', MA('MA-MOKA-BGU-STOP')), assumption('MOKA-SF-BGU-SIZE', MA('MA-MOKA-SIZING')), assumption('MOKA-SF-EXIT-MA', MA('MA-MOKA-SELL-GUIDE'))],
    declaredDataExceptions: [],
  } : null;
  return {
    strategyId, detected: true, patternId: 'MOKA_BUYABLE_GAP_UP', patternRuleIds: ['MOKA-SF-BGU-GAP'],
    setupRules: [{ ruleId: 'MOKA-SF-BGU-GAP', met: true }, { ruleId: 'MOKA-SF-BGU-VOLUME', met: volumeMet }],
    ambiguousReadings: [{ ruleId: 'MOKA-SF-BGU-VOLWINDOW', reading: 'MA-MOKA-BGU-VOLWINDOW 50 sessions (owner decision D-BGU-VOLWINDOW)' }, { ruleId: 'MOKA-SF-EXIT-VIOLATION', reading: `MA-MOKA-VIOLATION-READING reference ${BGU_REFERENCE_CONFIG.violationReading}` }],
    levels: { gapDayLow: r4(bars[i].low), priorClose: r4(bars[i - 1].close), stopReference: r4(bars[i].low) },
    features: { gapInAtr: r4(r.gapInAtr), gap: r4(r.gap), gapPct: r4(r.gap / bars[i - 1].close), atr40: r4(r.atr40), volumeRatio50: r4(r.volumeRatio), volumeStatus: r.status, contextProxyMa50: !!setup, closeVsGapLow: r4(pct(bars[i].close, bars[i].low)) },
    pivot: { level: r4(bars[i].low), kind: 'GAP_DAY_LOW (MOKA12-007 Risikoreferenz)', distance: r4(pct(bars[i].close, bars[i].low)) },
    plan, planBlockers: plan ? [] : [...(volumeMet ? [] : [r.status]), ...(setup ? [] : ['CONTEXT_PROXY_MA50_NOT_MET']), ...(el?.blockers ?? []).map((b) => b.code)],
  };
}

// ------------------------------------------------------------------ C13 Holy Grail
function detectHolyGrail(sec) {
  const strategyId = 'SF_RASCHKE_HOLY_GRAIL', bars = sec.bars, i = bars.length - 1;
  const prep = HOLY_GRAIL_RESEARCH_ADAPTER.prepare(sec, HG_REFERENCE_CONFIG), setup = prep ? HOLY_GRAIL_RESEARCH_ADAPTER.signalAt(prep, i) : null;
  if (!setup) return NONE(strategyId, 'NO_EMA20_PULLBACK_WITH_ADX_ABOVE_30');
  const el = HOLY_GRAIL_RESEARCH_ADAPTER.eligibility({ setup, bars, i, cfg: HG_REFERENCE_CONFIG });
  return {
    strategyId, detected: true, patternId: 'RASCHKE_HOLY_GRAIL_EMA20_PULLBACK', patternRuleIds: ['RAS-SF-ADX', 'RAS-SF-PULLBACK'],
    setupRules: [{ ruleId: 'RAS-SF-ADX', met: true }, { ruleId: 'RAS-SF-PULLBACK', met: true }, { ruleId: 'RAS-SF-ENTRY', met: el.order !== null }],
    ambiguousReadings: [{ ruleId: 'RAS-SF-SIZE', reading: 'not disclosed in the sources: no size is shown' }],
    levels: { trigger: r4(el.order?.level ?? null), ema20: r4(setup.ema20), impulseHigh: r4(setup.impulseHigh), swingLow: r4(setup.swingLow) },
    features: { adx: r4(setup.adx), adxAbove30Since: setup.evidence.adxAbove30Since, closeVsEma20: r4(pct(bars[i].close, setup.ema20)), impulseHighDate: setup.impulseHighDate, entrySource: 'W-RAS97 (Sekundärquelle, D-RAS97)', trailing: 'NOT_IN_SOURCE' },
    pivot: el.order ? { level: r4(el.order.level), kind: 'TOUCH_BAR_HIGH_PLUS_TICK (W-RAS97)', distance: r4(pct(bars[i].close, el.order.level)) } : null,
    plan: null, planBlockers: ['STRATEGY_CEILING_CONFIRMED_RESEARCH_SETUP', 'RAS-SF-TRAILING:NOT_IN_SOURCE'],
  };
}

/** Strategie -> Detektor (Reihenfolge C01 … C13). */
export const DETECTORS = Object.freeze({
  SF_TURTLE_S1: detectTurtle('S1'), SF_TURTLE_S2: detectTurtle('S2'), SF_DARVAS_BOX: detectDarvas,
  SF_WEINSTEIN_INVESTOR: detectWeinstein('INVESTOR'), SF_WEINSTEIN_TRADER: detectWeinstein('TRADER'),
  SF_MINERVINI_SEPA_VCP: detectSepa, SF_MINERVINI_POWER_PLAY: detectPowerPlay,
  SF_KK_BREAKOUT: detectKkBreakout, SF_KK_EPISODIC_PIVOT: detectEp, SF_KK_PARABOLIC_SHORT: detectPs,
  SF_MOKA_POCKET_PIVOT: detectPocketPivot, SF_MOKA_BUYABLE_GAP_UP: detectBgu, SF_RASCHKE_HOLY_GRAIL: detectHolyGrail,
});

/** KK-005-Querschnitt am Stichtag über alle bewertbaren Titel (Rangfolge, kein Ausschluss). */
export function momentumIndex(securities, asOf) {
  return new Map(momentumRanks(securities, asOf).map((r) => [r.id, r]));
}
