/**
 * Supertrader 8.0 – Datenqualitätsvertrag je Titel und Strategie für die Kandidatenerkennung auf aktuellen Tagesreihen.
 *
 * Grundsatz: fail closed für die betroffene AUSSAGE, nicht für die ganze Plattform.
 *  - FAIL       der Titel wird nicht normal bewertet (kein Kandidat); der Grund wird gespeichert.
 *  - CAP        der Titel darf erkannt werden, aber höchstens bis zur genannten Stufe (z. B. CHART_CANDIDATE).
 *  - INFO       Kennzeichnung ohne Stufenwirkung (z. B. ADR-Listing).
 * Die Prüfungen erfinden keine Werte: was sich nicht prüfen lässt, ist ein CAP oder FAIL, nie ein PASS.
 *
 * V4-D1-Quarantäne (integrity/discontinuity.mjs, unverändert): DQ-K5 / DQ-K3 über die Tagesbalken im 400-Tage-Rückblick.
 * Das Tagesfenster (270 Sitzungen) deckt den Rückblick nicht ganz ab. Der Rest wird mit den Wochenschlüssen derselben
 * Preiswahrheit geprüft (Wochenrelation ≥ 3 oder ≤ 1/3). Das ist KEINE Obermenge der Tagesregel: ein Sprung, der sich
 * innerhalb derselben Woche umkehrt, bleibt unsichtbar; erkannt werden bleibende Niveausprünge (nicht erklärte Splits,
 * der Kern von V4-D1) im Rest des Rückblicks (heute 11 von 400 Tagen, Abweichung in der Doku §2). Fehlt die Wochenreihe,
 * ist sie nicht split-adjustiert/echt, oder endet sie vor dem Tagesfenster, ist
 * der Rückblick UNVOLLSTÄNDIG und der Titel bleibt CHART_CANDIDATE (CAP). Eine Wochenauffälligkeit ist kein
 * DQ-K-Flag des Vertrags, sondern eine eigene Sperre dieser Stufe (CAP CHART_CANDIDATE).
 */
import { fin } from '../common/series.mjs';
import { flagDiscontinuities, sessionRatio, DQ_VERSION, EXPOSURE_LOOKBACK_DAYS } from '../integrity/discontinuity.mjs';
import { eligibleAtPriorSession, RESEARCH_UNIVERSE } from '../common/series.mjs';
import { STAGE, STAGE_ORDER } from './candidate-contract.mjs';

export const DQ_CONTRACT_VERSION = 'sf8-data-quality-1.0.0';
export const DQ_STATUS = Object.freeze({ PASS: 'PASS', INFO: 'INFO', CAP: 'CAP', FAIL: 'FAIL' });
/** Wochenrelation des Rückblicks vor dem Tagesfenster: gleiche Schwelle wie DQ-K3 (bleibende Sprünge, keine Korrektur). */
export const WEEKLY_LOOKBACK_K = 3;
/** Fehlende XNYS-Sitzungen im Tagesfenster, ab denen ein Titel nicht mehr bewertet wird (lückenhafte Fenster). */
export const MAX_MISSING_SESSIONS = 5;

/**
 * Datenbedarf je Strategie (aus den Engine-Konstanten abgeleitet, dokumentiert in der Integrationsmatrix).
 * minBars = Sitzungen bis zum Stichtag, die die Erkennung der Engine mindestens lesen muss.
 */
export const STRATEGY_DATA_NEEDS = Object.freeze({
  SF_TURTLE_S1: { minBars: 76, interval: 'DAILY', intraday: 'NOT_REQUIRED', benchmark: false, fundamentals: false, crossSection: false, why: '55-Tage-Failsafe + N(20) + Vortag' },
  SF_TURTLE_S2: { minBars: 76, interval: 'DAILY', intraday: 'NOT_REQUIRED', benchmark: false, fundamentals: false, crossSection: false, why: '55-Tage-Kanal + N(20) + Vortag' },
  SF_DARVAS_BOX: { minBars: 30, interval: 'DAILY', intraday: 'NOT_REQUIRED', benchmark: false, fundamentals: false, crossSection: false, why: 'Box mit 3-Tage-Bestätigung; Allzeithoch nur in der verfügbaren Historie prüfbar' },
  SF_WEINSTEIN_INVESTOR: { minBars: 160, interval: 'WEEKLY_FROM_DAILY', intraday: 'NOT_REQUIRED', benchmark: 'EVIDENCE', fundamentals: false, crossSection: false, why: 'MA30w + Basis; Branchen-Stage und Marktbreite ohne Daten' },
  SF_WEINSTEIN_TRADER: { minBars: 160, interval: 'WEEKLY_FROM_DAILY', intraday: 'NOT_REQUIRED', benchmark: 'EVIDENCE', fundamentals: false, crossSection: false, why: 'MA30w steigend + letztes Swing-Hoch' },
  SF_MINERVINI_SEPA_VCP: { minBars: 252, interval: 'DAILY', intraday: 'NOT_REQUIRED', benchmark: false, fundamentals: 'MANUAL_ONLY', crossSection: false, why: 'MA200 + 21 Sitzungen Steigung, 52-Wochen-Hoch/-Tief; IBD-Relative-Stärke ohne Daten' },
  SF_MINERVINI_POWER_PLAY: { minBars: 41, interval: 'DAILY', intraday: 'NOT_REQUIRED', benchmark: false, fundamentals: false, crossSection: false, why: '+100 % in < 40 Sitzungen; Startvolumen braucht 50 Sitzungen davor (Evidenz)' },
  SF_KK_BREAKOUT: { minBars: 127, interval: 'DAILY', intraday: 'ORH_DATA_BLOCKED_NOT_ESSENTIAL', benchmark: false, fundamentals: false, crossSection: true, why: '10-Tage-Konsolidierung + 63 Sitzungen Vorlauf; 6-Monats-Momentum (126) für die Rangfolge' },
  SF_KK_EPISODIC_PIVOT: { minBars: 64, interval: 'DAILY', intraday: 'DATA_BLOCKED', benchmark: false, fundamentals: false, crossSection: false, why: 'Gap am Stichtag, 63 Sitzungen Vorlauf; Katalysator und Intraday-Volumen ohne Daten' },
  SF_KK_PARABOLIC_SHORT: { minBars: 31, interval: 'DAILY', intraday: 'DATA_BLOCKED', benchmark: false, fundamentals: false, crossSection: false, why: 'Aufwärtsserie + ADR20 + MA10; Einstieg, Stop und Leihbarkeit ohne Daten' },
  SF_MOKA_POCKET_PIVOT: { minBars: 51, interval: 'DAILY', intraday: 'NOT_REQUIRED', benchmark: false, fundamentals: 'MANUAL_ONLY', crossSection: false, why: '10-Tage-Abwärtsvolumen + MA50-Kontext' },
  SF_MOKA_BUYABLE_GAP_UP: { minBars: 52, interval: 'DAILY', intraday: 'NOT_REQUIRED', benchmark: false, fundamentals: 'MANUAL_ONLY', crossSection: false, why: 'ATR40 + 50-Tage-Volumen + MA50 am Vortag' },
  SF_RASCHKE_HOLY_GRAIL: { minBars: 60, interval: 'DAILY', intraday: 'NOT_REQUIRED', benchmark: false, fundamentals: false, crossSection: false, why: 'ADX(14) Wilder + EMA20' },
});

const check = (id, status, detail = null, caps = null) => ({ id, status, ...(caps ? { caps } : {}), ...(detail !== null ? { detail } : {}) });
const minStage = (a, b) => (a === null || b === null ? null : STAGE_ORDER[Math.min(STAGE_ORDER.indexOf(a), STAGE_ORDER.indexOf(b))]);
const lookbackStart = (asOf, cal) => cal.addDays(asOf, -EXPOSURE_LOOKBACK_DAYS);

/** DQ-K5 / DQ-K3 der Tagesbalken mit Datum im Rückblick [asOf − 400 Tage, asOf]; je Sitzung das stärkste Flag. */
export function quarantinedSessions(bars, asOf, cal) {
  const from = lookbackStart(asOf, cal), k5 = new Set(flagDiscontinuities(bars, 5)), out = [];
  for (const i of flagDiscontinuities(bars, 3)) {
    const d = bars[i].date;
    if (d >= from && d <= asOf) out.push({ date: d, flag: k5.has(i) ? 'DQ-K5' : 'DQ-K3' });
  }
  return out;
}

/** Wochenrelationen im Teil des Rückblicks vor dem ersten Tagesbalken (bleibende Niveausprünge, siehe Kopf). */
export function weeklyLookbackCheck(weekly, firstDailyDate, asOf, cal) {
  const from = lookbackStart(asOf, cal);
  if (firstDailyDate <= from) return { status: 'NOT_NEEDED', from, to: firstDailyDate };
  if (!Array.isArray(weekly) || !weekly.length) return { status: 'INCOMPLETE', from, to: firstDailyDate, reason: 'NO_WEEKLY_SERIES' };
  // die Woche vor dem Rückblicksbeginn als Referenz, dann jede Woche bis zum ersten Tagesbalken
  const w = weekly.filter((p) => fin(p.close) && p.close > 0);
  const startIdx = w.findIndex((p) => p.date >= from);
  if (startIdx < 1) return { status: 'INCOMPLETE', from, to: firstDailyDate, reason: 'WEEKLY_SERIES_DOES_NOT_COVER_LOOKBACK' };
  const hits = [];
  for (let k = startIdx; k < w.length && w[k - 1].date < firstDailyDate; k++) {
    const r = w[k].close / w[k - 1].close;
    if (r >= WEEKLY_LOOKBACK_K || r <= 1 / WEEKLY_LOOKBACK_K) hits.push({ date: w[k].date, ratio: r });
  }
  // die Reihe muss bis an das Tagesfenster heranreichen (eine Woche Spielraum), sonst ist der Rest ungeprüft
  const lastWeekly = w.at(-1).date, coverLimit = new Date(Date.parse(`${firstDailyDate}T00:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10);
  if (lastWeekly < coverLimit) return { status: 'INCOMPLETE', from, to: firstDailyDate, reason: 'WEEKLY_SERIES_ENDS_BEFORE_DAILY_WINDOW' };
  return { status: hits.length ? 'WEEKLY_DISCONTINUITY' : 'COVERED', from, to: firstDailyDate, hits };
}

/**
 * Titelbezogene Prüfung am Marktstichtag (strategieunabhängig). Liefert status, checks, quarantinedSessions und die
 * höchste zulässige Stufe aus Datensicht (null = keine normale Bewertung).
 */
export function assessSecurity(security, { asOf, calendar, weekly = null, continuity = null }) {
  const bars = security.bars, checks = [], m = security.meta || {};
  const last = bars.at(-1)?.date ?? null;
  let cap = STAGE.MODELED_TRADE_PLAN, fail = false;
  const capTo = (stage) => { cap = minStage(cap, stage); };

  // Identität (ADR-001) und Instrumenttyp
  if (m.instrumentType && m.instrumentType !== 'EQUITY_COMMON') { checks.push(check('IDENTITY_INSTRUMENT_TYPE', DQ_STATUS.FAIL, m.instrumentType)); fail = true; }
  else if (!m.instrumentType) { checks.push(check('IDENTITY_INSTRUMENT_TYPE', DQ_STATUS.CAP, 'NOT_IN_SECURITY_MASTER', STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  else checks.push(check('IDENTITY_INSTRUMENT_TYPE', DQ_STATUS.PASS));
  if (m.activeStatus && m.activeStatus !== 'ACTIVE') { checks.push(check('IDENTITY_ACTIVE', DQ_STATUS.FAIL, m.activeStatus)); fail = true; }
  else if (!m.activeStatus) { checks.push(check('IDENTITY_ACTIVE', DQ_STATUS.CAP, 'NOT_IN_SECURITY_MASTER', STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  // Mantelgesellschaft: Kursmuster spiegeln den Treuhandwert, keine Unternehmensentwicklung (nur Namenshinweis)
  if (m.spacHint) { checks.push(check('IDENTITY_SPAC_NAME_HINT', DQ_STATUS.CAP, 'Name deutet auf eine Mantelgesellschaft (SPAC); Kursmuster ohne Aussagekraft für die Methoden', STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  if (m.adrHint) checks.push(check('IDENTITY_ADR_LISTING', DQ_STATUS.INFO, 'US-Listing eines ADR: nur die US-Reihe wird verwendet, keine Kombination mit dem Heimatlisting'));
  const lc = continuity?.bySecurityId?.get(security.id) ?? null;
  if (lc) {
    const inLookback = lc.keptFrom && lc.keptFrom >= lookbackStart(asOf, calendar);
    checks.push(check('IDENTITY_LISTING_CONTINUITY', inLookback ? DQ_STATUS.CAP : DQ_STATUS.INFO, { keptFrom: lc.keptFrom ?? null, gapDays: lc.gapDays ?? null }, inLookback ? STAGE.CHART_CANDIDATE : null));
    if (inLookback) capTo(STAGE.CHART_CANDIDATE);
  }

  // Aktualität
  if (!last) { checks.push(check('FRESHNESS', DQ_STATUS.FAIL, 'NO_BARS')); return finish(); }
  if (last !== asOf) {
    const lag = calendar.sessionsBetween(calendar.addDays(last, 1), asOf).length;
    checks.push(check('FRESHNESS', DQ_STATUS.FAIL, { lastBar: last, asOf, sessionsBehind: lag })); fail = true;
  } else checks.push(check('FRESHNESS', DQ_STATUS.PASS, { lastBar: last }));

  // OHLCV-Plausibilität (nichts wird repariert)
  // Eröffnung und Schluss innerhalb der Spanne, Tief > 0, Datum streng aufsteigend und eindeutig (die Engines lesen open
  // und arbeiten über Indizes)
  const inRange = (x, b) => x <= b.high * (1 + 1e-9) && x >= b.low * (1 - 1e-9);
  let bad = 0, order = 0;
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k];
    if (![b.open, b.high, b.low, b.close, b.volume].every(fin) || b.high < b.low || !(b.low > 0) || !inRange(b.close, b) || !inRange(b.open, b) || b.volume < 0) bad++;
    if (k > 0 && !(b.date > bars[k - 1].date)) order++;
  }
  if (bad || order) { checks.push(check('OHLCV_INTEGRITY', DQ_STATUS.FAIL, { invalidBars: bad, dateOrderViolations: order })); fail = true; } else checks.push(check('OHLCV_INTEGRITY', DQ_STATUS.PASS));

  // fehlende / zusätzliche Handelstage gegen XNYS
  const have = new Set(bars.map((b) => b.date)), sessions = calendar.sessionsBetween(bars[0].date, last);
  const missing = sessions.filter((d) => !have.has(d)), extra = bars.filter((b) => !calendar.isSession(b.date)).map((b) => b.date);
  if (!calendar.inCoverage(bars[0].date) || !calendar.inCoverage(last)) { checks.push(check('CALENDAR_COVERAGE', DQ_STATUS.CAP, 'OUTSIDE_CALENDAR_COVERAGE', STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  if (missing.length > MAX_MISSING_SESSIONS || extra.length) { checks.push(check('SESSIONS', DQ_STATUS.FAIL, { missing: missing.length, extra: extra.length, firstMissing: missing.slice(0, 3) })); fail = true; }
  else if (missing.length) { checks.push(check('SESSIONS', DQ_STATUS.CAP, { missing: missing.length, dates: missing }, STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  else checks.push(check('SESSIONS', DQ_STATUS.PASS, { sessions: sessions.length }));

  // Adjustierung (ADR-002): die Materialisierung muss split-adjustiert und abgeglichen sein
  if (m.adjustmentStatus && m.adjustmentStatus !== 'adjusted') { checks.push(check('ADJUSTMENT', DQ_STATUS.FAIL, m.adjustmentStatus)); fail = true; }
  else if (m.caReconciliation && m.caReconciliation !== 'PASS') { checks.push(check('ADJUSTMENT', DQ_STATUS.FAIL, { caReconciliation: m.caReconciliation })); fail = true; }
  else if (!m.adjustmentStatus || !m.caReconciliation) { checks.push(check('ADJUSTMENT', DQ_STATUS.CAP, 'RECONCILIATION_UNKNOWN', STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  else checks.push(check('ADJUSTMENT', DQ_STATUS.PASS, { splitEvents: m.splitEvents ?? null }));

  // V4-D1-Quarantäne im Rückblick (Tagesbalken) + Wochenprüfung des Rests
  const q = quarantinedSessions(bars, asOf, calendar);
  if (q.length) { checks.push(check('QUARANTINE_V4_D1', DQ_STATUS.CAP, { policy: DQ_VERSION, sessions: q }, STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  else checks.push(check('QUARANTINE_V4_D1', DQ_STATUS.PASS, { policy: DQ_VERSION }));
  const wk = weeklyLookbackCheck(weekly, bars[0].date, asOf, calendar);
  if (wk.status === 'INCOMPLETE') { checks.push(check('QUARANTINE_LOOKBACK_COVERAGE', DQ_STATUS.CAP, wk, STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  else if (wk.status === 'WEEKLY_DISCONTINUITY') { checks.push(check('QUARANTINE_LOOKBACK_COVERAGE', DQ_STATUS.CAP, wk, STAGE.CHART_CANDIDATE)); capTo(STAGE.CHART_CANDIDATE); }
  else checks.push(check('QUARANTINE_LOOKBACK_COVERAGE', DQ_STATUS.PASS, wk));

  // Liquidität: Forschungsuniversum #705 (Messkonvention aller Lifecycles, keine Strategieregel). Ohne sie modelliert
  // kein Lifecycle einen Plan; Chart- und Setup-Aussagen bleiben möglich.
  const liquid = eligibleAtPriorSession(bars, bars.length, RESEARCH_UNIVERSE);
  if (!liquid) { checks.push(check('LIQUIDITY_RESEARCH_UNIVERSE', DQ_STATUS.CAP, { universe: RESEARCH_UNIVERSE.id, basis: 'ADJUSTED_CLOSE (kein Rohkurs im Tagesfenster)' }, STAGE.CONFIRMED_RESEARCH_SETUP)); capTo(STAGE.CONFIRMED_RESEARCH_SETUP); }
  else checks.push(check('LIQUIDITY_RESEARCH_UNIVERSE', DQ_STATUS.PASS, { universe: RESEARCH_UNIVERSE.id }));
  return finish();

  function finish() {
    const status = fail || checks.some((c) => c.status === DQ_STATUS.FAIL) ? DQ_STATUS.FAIL : checks.some((c) => c.status === DQ_STATUS.CAP) ? DQ_STATUS.CAP : DQ_STATUS.PASS;
    return { version: DQ_CONTRACT_VERSION, securityId: security.id, ticker: security.ticker, asOf, status, maxStage: status === DQ_STATUS.FAIL ? null : cap, checks, quarantinedSessions: quarantinedSessions(bars, asOf, calendar), lookbackDays: EXPOSURE_LOOKBACK_DAYS };
  }
}

/** Strategiebezogene Prüfung: genug Historie für die Erkennung der Engine. */
export function assessStrategyHistory(strategyId, bars) {
  const need = STRATEGY_DATA_NEEDS[strategyId];
  if (!need) return check('STRATEGY_KNOWN', DQ_STATUS.FAIL, strategyId);
  return bars.length >= need.minBars ? check('HISTORY_FOR_STRATEGY', DQ_STATUS.PASS, { bars: bars.length, minBars: need.minBars }) : check('HISTORY_FOR_STRATEGY', DQ_STATUS.FAIL, { bars: bars.length, minBars: need.minBars });
}

export { sessionRatio };
