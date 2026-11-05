/**
 * Supertrader – C06 Minervini SEPA/VCP und C07 Power Play: Treueprüfung (Forschung, nicht zertifiziert; 05.11.2026).
 * Schritt 1 wie bei C08: die REFERENZ (research/minervini-lifecycle.mjs REFERENCE_CONFIG, minervini-execution.mjs, beide
 * gepinnt in SF6-PAPER-2027 und unverändert) auf DEV gegen öffentlich belegte Trades messen, ohne Regeländerung.
 * Je goldenem Trade: im Universum?, Setup-Tage der Referenz im Fenster ±8 Tage, Orderablehnungen mit Grund, Trades mit R.
 * Quellen: Minervinis eigene X-Posts (@markminervini, Status-ID im Feld source); Datum aus der Status-ID bzw. dem Text
 * zurückgerechnet. Der Setup-Typ ist nur bei GRAY und RBLX im Post genannt, sonst eine Annahme. X lieferte die Posts
 * nicht im Volltext (HTTP 402); belegt über Suchtreffer, die Charts sind nicht gesichtet.
 */
import { fin } from '../common/series.mjs';
import { sepaSetupSeries, powerPlaySetupSeries } from './minervini-lifecycle.mjs';
import { createRsPercentileProxy } from './minervini-components.mjs';

export const MINERVINI_FIDELITY_VERSION = 'minervini-fidelity-1.1.0';

/** FID-1 (vorregistriert in certification/C06-C07-FID1-PREREGISTRATION.json): RS-Gate 70, je Tag höchstens 3 neue
 *  Kauf-Stopps nach RS-Perzentil, Ausstieg FREEROLL_2R; sonst die Referenz. */
export const MINERVINI_FID1 = Object.freeze({ rsMin: 70, dailyTop: 3, exitPolicy: 'FREEROLL_2R' });

export const MINERVINI_GOLDEN_TRADES = Object.freeze([
  { ticker: 'MTLS', date: '2019-01-08', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1082650684594548737 (08.01.2019): "moving into new high ground today - I have a position"; Ausbruchstag genau' },
  { ticker: 'ACAD', date: '2019-10-21', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1186675011664465920 (22.10.2019): "$ACAD (which I bought yesterday morning)"; genau' },
  { ticker: 'SGEN', date: '2020-04-16', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1260376656000188418 (13.05.2020): "Bought $SGEN on 4/16... textbook."; genau' },
  { ticker: 'VAPO', date: '2020-04-24', setup: 'POWER_PLAY', setupStated: false, source: 'X @markminervini 1275927229550211072 (24.06.2020): "bought perfectly ... up 100% in just a couple months ... Power Play setups"; Kaufdatum geschätzt (±4 Wochen)' },
  { ticker: 'TNDM', date: '2020-06-30', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1278004425764868099 (30.06.2020): "big breakout from a large base - I have a position"; Ausbruchstag genau' },
  { ticker: 'AEM', date: '2020-09-14', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1305508439528017922 (14.09.2020): "$AEM breaking out! I have a position."; Ausbruchstag genau' },
  { ticker: 'AMZN', date: '2020-10-08', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1315721815222878209 (12.10.2020): "Bought $AMZN on Thursday"; genau' },
  { ticker: 'GRAY', date: '2020-11-23', setup: 'POWER_PLAY', setupStated: true, source: 'X @markminervini 1331251565978660871 (24.11.2020): "Yesterday ... I bought $GRAY from a textbook Power Play"; genau (IPO 09/2020)' },
  { ticker: 'PENN', date: '2020-12-08', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1336343967210876930 (08.12.2020): "could breakout of a base here - we have a position"; Pivot-Tag genau' },
  { ticker: 'DECK', date: '2021-04-12', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1381655133780578304 (12.04.2021): "trying to breakout - I have a position"; Pivot-Tag genau' },
  { ticker: 'RBLX', date: '2021-04-12', setup: 'SEPA', setupStated: true, source: 'X @markminervini 1383499038046097411 (17.04.2021): "Textbook Low Cheat entry from a Primary Base"; geschätzt (±1 Woche)' },
  { ticker: 'MU', date: '2024-04-26', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1795475913833845049 (28.05.2024): "the $MU position since I bought and posted it on Apr. 26"; genau' },
  { ticker: 'RNA', date: '2024-11-13', setup: 'SEPA', setupStated: false, source: 'X @markminervini 1856764704234041720 (13.11.2024): "We bought $RNA this morning"; genau' },
]);

const tickerOf = (id) => String(id).split('#')[0].split(':')[2];
const shift = (d, days) => new Date(Date.parse(d) + days * 864e5).toISOString().slice(0, 10);

/** R-Verteilung geschlossener Trades (gleiche Rechnung wie kk-breakout-fidelity#rDistribution). */
export function rDistributionMin(trades) {
  const closed = trades.filter((t) => t.status === 'CLOSED' && fin(t.pnl) && t.initialRiskAmount > 0), r = closed.map((t) => t.pnl / t.initialRiskAmount), win = r.filter((x) => x > 0);
  return { closed: r.length, hitRate: r.length ? win.length / r.length : null, avgWinR: win.length ? win.reduce((a, x) => a + x, 0) / win.length : null, avgLossR: r.length - win.length ? r.filter((x) => x <= 0).reduce((a, x) => a + x, 0) / (r.length - win.length) : null, shareAbove5R: r.length ? r.filter((x) => x > 5).length / r.length : null, maxR: r.length ? Math.max(...r) : null, expectancyR: r.length ? r.reduce((a, x) => a + x, 0) / r.length : null };
}

/** Zustand der Referenz-Setup-Reihe am Schluss i (nur Balken bis i, gezählt ab diesem Datum: genau ein Zustand). */
export function setupStateAt(strategy, security, i) {
  const fn = strategy === 'POWER_PLAY' ? powerPlaySetupSeries : sepaSetupSeries, bars = security.bars;
  const r = fn({ ...security, bars: bars.slice(0, i + 1) }, { from: bars[i].date });
  const states = Object.keys(r.counts);
  return states.length === 1 ? states[0] : states.join('|') || null;
}

/** Je goldenem Trade (nur gleicher Strategie): Universum, Setup-Tage, Ablehnungen, Trades mit R. Keine Renditezahlen der Strategie. */
export function minerviniGoldenDiagnose(ds, { strategy, setupIndex, run, golden = MINERVINI_GOLDEN_TRADES, tol = 8 }) {
  return golden.filter((g) => g.setup === strategy).map((g) => {
    const lo = shift(g.date, -tol), hi = shift(g.date, tol), inWin = (d) => d >= lo && d <= hi, mine = (id) => tickerOf(id) === g.ticker;
    const secs = ds.securities.filter((s) => mine(s.id));
    if (!secs.length) return { ...g, inUniverse: false, taken: false };
    const setupDays = [];
    for (const s of secs) { const m = setupIndex.index.get(s.id); if (!m) continue; for (const [i, st] of m) { const d = s.bars[i]?.date ?? st?.date; if (d && inWin(d)) setupDays.push({ date: d, state: st?.state ?? null, pivot: fin(st?.pivot) ? st.pivot : st?.pivot?.level ?? null }); } }
    const trades = run.trades.filter((t) => mine(t.id) && inWin(t.entryDate)).map((t) => ({ entryDate: t.entryDate, entryBasis: t.entryBasis ?? null, exitDate: t.exitDate ?? null, exitReason: t.exitReason ?? null, r: t.initialRiskAmount > 0 && fin(t.pnl) ? t.pnl / t.initialRiskAmount : null }));
    return {
      ...g, inUniverse: true, taken: trades.length > 0,
      securities: secs.map((s) => ({ id: s.id, firstBar: s.bars[0]?.date ?? null, lastBar: s.bars[s.bars.length - 1]?.date ?? null, barsBeforeDate: s.bars.filter((b) => b.date < g.date).length,
        sessions: s.bars.map((b, i) => [b, i]).filter(([b]) => inWin(b.date)).map(([b, i]) => ({ date: b.date, close: b.rawClose ?? b.close, high: b.high, state: setupStateAt(strategy, s, i) })) })),
      setupDays, rejections: run.rejections.filter((r) => mine(r.id) && inWin(r.date)).map((r) => ({ date: r.date, reason: r.reason })), trades,
    };
  });
}

/** FID-1-Auswahl: aus dem Referenz-Setup-Index je Datum nur Setups mit RS-Perzentil >= rsMin, davon die dailyTop mit dem
 *  höchsten Perzentil (Gleichstand securityId aufsteigend). Der Referenz-Index bleibt unverändert. */
export function selectSetupIndex(ds, setupIndex, { rsMin = MINERVINI_FID1.rsMin, dailyTop = MINERVINI_FID1.dailyTop, rs = createRsPercentileProxy(ds) } = {}) {
  const byDate = new Map(), sec = new Map(ds.securities.map((s) => [s.id, s]));
  for (const [id, m] of setupIndex.index) {
    const s = sec.get(id); if (!s) continue;
    for (const [i, rec] of m) {
      const d = s.bars[i]?.date; if (!d) continue;
      const p = rs.at(id, d)?.proxy?.vuPercentile;
      if (!(Number.isFinite(p) && p >= rsMin)) continue;
      (byDate.get(d) || byDate.set(d, []).get(d)).push([id, i, rec, p]);
    }
  }
  const index = new Map(); let kept = 0;
  for (const rows of byDate.values()) for (const [id, i, rec] of rows.sort((a, z) => z[3] - a[3] || (a[0] < z[0] ? -1 : a[0] > z[0] ? 1 : 0)).slice(0, dailyTop)) { (index.get(id) || index.set(id, new Map()).get(id)).set(i, rec); kept++; }
  return { strategy: setupIndex.strategy, index, counts: { ...setupIndex.counts, FID1_SELECTED: kept }, selection: { rsMin, dailyTop } };
}
