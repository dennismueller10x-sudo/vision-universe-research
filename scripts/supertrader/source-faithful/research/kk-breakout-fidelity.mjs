/**
 * Supertrader – C08 Kullamägi Breakout, Treue-Variante FID-1 (Forschung, nicht zertifiziert; C08-Treueprüfung 05.11.2026).
 *
 * Neue Regelversion NEBEN der Referenz (research/kk-breakout-lifecycle.mjs bleibt unverändert und gepinnt, ebenso die
 * sf5-Variantenregistrierung in SF6-PAPER-2027). Sie schließt drei Lücken der Referenz gegenüber der veröffentlichten
 * Methode (qullamaggie.com „3 timeless setups“, Interview Chat with Traders, Stream-Mitschriften; Quellen im Bericht
 * docs/research/supertrader/C08-TREUE.md):
 *  FID-MOMENTUM  nur die stärksten 2 % nach 1-, 3- oder 6-Monats-Rendite (KK-005: „top 1–2 %“), Querschnitt aller Titel
 *                mit Rohkurs >= 5 USD am Tag des Setups (VU-Universumsgrenze); bestPercentile wie methods/kullamagi.mjs.
 *  FID-MARKET    Einstieg nur, wenn der Markt-Index am Setup-Schluss SMA10 > SMA20 hat und beide steigen (seine Regel 2023
 *                für IWM; der Snapshot führt nur SPY, deshalb SPY als deklarierter Ersatz).
 *  FID-ENTRY     Kauf-Stopp am vorab bekannten Ausbruchsniveau (höchstes Hoch der 10 Sitzungen vor dem Kauftag), Füllung
 *                max(Eröffnung, Niveau) am Ausbruchstag selbst, statt am Open nach dem Ausbruchsschluss. Initialrisiko
 *                höchstens 1 ADR20 (KK-012: Stopp nicht weiter als die ADR): Stopp = Niveau x (1 - ADR20); eine Eröffnung
 *                so weit über dem Niveau, dass das Risiko über 1 ADR stiege, wird nicht gekauft („nicht kaufen, wenn schon
 *                mehr als ATR gestiegen“). Ab dem Schluss des Kauftags gilt der Stopp am Tagestief (KK-012), falls höher.
 * Unverändert aus der Referenz: Setup-Proxy CONSOLIDATION_10 (Vorlauf >= 30 % in 63 Sitzungen, MA10/20 steigend),
 * Teilverkauf 1/3 nach 3 Sitzungen mit Breakeven, Rest am ersten Schluss unter MA10 (KK-013/014), Risiko 0,5 %, Kappe.
 * FID-2 (vor dem ersten Lauf festgelegt, unabhängige Prüfung Strang E, PR #1417) ergänzt FID-1 um:
 *  FID2-QUALITY  Setup-Qualität: höhere Tiefs (Tief der letzten 5 Sitzungen der Konsolidierung > Tief der ersten 5) und
 *                enger werdende Spanne (Spanne der letzten 5 < Spanne der ersten 5) („orderly pullback, higher lows,
 *                tightening“, 3-Setups-Artikel); die Fünfer-Teilung ist eine VU-Konvention.
 *  FID2-ADR      Risiko gleich normiert wie ADR20 (Hoch/Tief - 1, relativ zum Tief): Stopp = Niveau / (1 + ADR20).
 *  FID2-TRAIL    Rest am ersten Schluss unter MA10 bei schnellen, unter MA20 bei langsamen Titeln („10-day for fast,
 *                20-day for slower movers“, Interview); schnell = ADR20 beim Einstieg >= 5 % (VU-Konvention, sein Beispiel
 *                „5 % ADR“).
 * FID-2L (vor dem ersten Lauf von FID-2L festgelegt; Wunsch der Steuerung 05.11.2026): FID-2 plus Liquiditätsgrenze.
 *  Eine feste Dollarvolumen-Schwelle steht in seinem Material nicht („preferably liquid“, „enough liquidity“, Streams und
 *  Interview); belegt ist nur „nie mehr als 1 % des Tagesvolumens einer Aktie“ (Stream 1, Mitschrift Retail Trader's
 *  Repository). Abgeleitete Konvention: bei der Positionskappe von 25 % auf 100.000 USD Startkapital muss der
 *  20-Tage-Durchschnitt des Dollarvolumens (Rohkurs x Rohvolumen, Sitzungen vor dem Kauftag) mindestens 2,5 Mio. USD
 *  betragen. Deshalb eine eigene, gekennzeichnete Variante, nicht Teil von FID-2.
 * FID-3 (vor dem ersten Lauf von FID-3 festgelegt, nach der Diagnose der goldenen Trades 05.11.2026, Läufe 42040595941
 *  und 42043947326): FID-1 plus Auswahl. Vier belegte Trades (KOD, JMIA, ZM, PDD) waren erkannt und ausgelöst, wurden aber
 *  mangels freien Kapitals abgelehnt, weil die Engine die Orders in neutraler Zufallsreihenfolge füllt. Kullamägi hält
 *  wenige, konzentrierte Positionen in den stärksten Titeln („top 1–2 %“, „only the strongest stocks“). Regel: an jedem
 *  Tag werden höchstens 3 neue Kauf-Stopps scharfgestellt, die Setups mit dem höchsten besten 1/3/6-Monats-Perzentil
 *  (Gleichstand: securityId aufsteigend). Die Zahl 3 ist eine VU-Konvention. Momentum-Schwelle (2 %), Preisgrenze (5 USD),
 *  Setup, Stopp und Ausstieg bleiben wie FID-1; nichts davon ist an die 16 Beispiele angepasst.
 * FID-4 (vorregistriert in certification/C08-FID4-PREREGISTRATION.json, Steuerung 05.11.2026, Weg a): FID-3 mit
 *  Kullamägis Positionsgröße: 1 % Risiko je Trade, Kappe 25 % je Position, höchstens 5 offene Positionen. Die letzte
 *  Fassung für C08; danach keine weiteren Varianten.
 * Bewertet wird nur auf DEV; der HOLDOUT 2008–2015 wird später einmalig mit dieser festgeschriebenen Regel geprüft.
 */
import { fin, smaAt, priorHigh } from '../common/series.mjs';
import { adr20, KK_PARAMS } from '../methods/kullamagi.mjs';
import { eligibilityResult, STUDY_LABEL } from './lifecycle-engine.mjs';
import { KK_SETUP_PROXIES, KK_EXIT_POLICIES, KK_OPEN_MANUAL_DECISIONS } from './kk-breakout-lifecycle.mjs';

export const KK_FIDELITY_VERSION = 'kk-breakout-fidelity-1.4.0';
export const KK_FIDELITY_VARIANTS = Object.freeze({ 'FID-1': Object.freeze({ quality: false, adrNorm: 'ENTRY', trail: 'MA10' }), 'FID-2': Object.freeze({ quality: true, adrNorm: 'LOW', trail: 'TEMPO', fastAdrPct: 5 }), 'FID-2L': Object.freeze({ quality: true, adrNorm: 'LOW', trail: 'TEMPO', fastAdrPct: 5, minAdv20Usd: 2.5e6 }), 'FID-3': Object.freeze({ quality: false, adrNorm: 'ENTRY', trail: 'MA10', dailyTop: 3 }), 'FID-4': Object.freeze({ quality: false, adrNorm: 'ENTRY', trail: 'MA10', dailyTop: 3, riskFraction: 0.01, maxPositionWeight: 0.25, maxOpenPositions: 5 }) });

/** Konfiguration und Portfolio-Grenzen je Variante (FID-4 ändert nur Risiko, Kappe und Positionszahl). */
export function kkFidelityConfigFor(variant) {
  const V = KK_FIDELITY_VARIANTS[variant];
  return V.riskFraction ? Object.freeze({ ...KK_FIDELITY_CONFIG, sizing: Object.freeze({ mode: 'RISK', riskFraction: V.riskFraction }) }) : KK_FIDELITY_CONFIG;
}
export function kkFidelityPolicyFor(variant, base) {
  const V = KK_FIDELITY_VARIANTS[variant];
  return { ...base, ...(V.maxPositionWeight ? { maxPositionWeight: V.maxPositionWeight } : {}), ...(V.maxOpenPositions ? { maxOpenPositions: V.maxOpenPositions } : {}) };
}
export const KK_FIDELITY_RULES = Object.freeze({
  id: 'FID-1', momentumTopPct: 2, universeMinRawClose: 5, marketSma: [10, 20], marketSlopeSessions: 5,
  setupProxy: 'CONSOLIDATION_10', exitPolicy: 'PARTIAL3_THIRD_BE_MA10', riskFraction: 0.005, maxRiskAdr: 1,
});
export const KK_FIDELITY_CONFIG = Object.freeze({ manualSubstitute: 'ACCEPT_AS_MODEL_ASSUMPTION', setupProxy: 'CONSOLIDATION_10', entryTiming: 'BUY_STOP_LEVEL', exitPolicy: 'PARTIAL3_THIRD_BE_MA10', intrabarOrder: 'PESSIMISTIC', sizing: Object.freeze({ mode: 'RISK', riskFraction: 0.005 }) });

/** Querschnitt: je Datum die Titel mit bestPercentile >= 100 - topPct (1/3/6 Monate, Rohkurs >= Grenze). */
export function momentumRanks(securities, { minRawClose = KK_FIDELITY_RULES.universeMinRawClose, P = KK_PARAMS } = {}) {
  const byDate = new Map();
  for (const s of securities) {
    const b = s.bars;
    for (let i = 0; i < b.length; i++) {
      const c = b[i].close, rc = b[i].rawClose ?? c;
      if (!fin(c) || !(rc >= minRawClose)) continue;
      const ret = (n) => (i >= n && b[i - n].close > 0 ? c / b[i - n].close - 1 : null);
      (byDate.get(b[i].date) || byDate.set(b[i].date, []).get(b[i].date)).push([s.id, ret(P.momentumSessions.m1), ret(P.momentumSessions.m3), ret(P.momentumSessions.m6)]);
    }
  }
  const ranks = new Map();
  for (const [date, rows] of byDate) {
    const best = new Map();
    for (const k of [1, 2, 3]) {
      const v = rows.filter((r) => r[k] !== null).sort((a, z) => a[k] - z[k]);
      v.forEach((r, j) => { const p = v.length > 1 ? (j / (v.length - 1)) * 100 : null; if (p !== null) best.set(r[0], Math.max(best.get(r[0]) ?? -1, p)); });
    }
    ranks.set(date, best);
  }
  return ranks;
}
export function momentumLeaders(securities, { topPct = KK_FIDELITY_RULES.momentumTopPct, minRawClose = KK_FIDELITY_RULES.universeMinRawClose, P = KK_PARAMS, ranks = null } = {}) {
  const R = ranks ?? momentumRanks(securities, { minRawClose, P }), leaders = new Map();
  for (const [date, best] of R) { const set = new Set(); for (const [id, p] of best) if (p >= 100 - topPct) set.add(id); leaders.set(date, set); }
  return leaders;
}

/** FID-3: je Datum die höchstens dailyTop Titel mit Setup (Regeln der Variante), Führer und offenem Markt, nach bestem
 *  Perzentil absteigend, Gleichstand securityId aufsteigend. */
export function dailySelection(ds, { leaders, market, ranks, variant = 'FID-3', proxy = KK_SETUP_PROXIES.CONSOLIDATION_10 }) {
  const V = KK_FIDELITY_VARIANTS[variant];
  if (!V || !V.dailyTop) throw new Error(`NO_DAILY_TOP ${variant}`);
  const byDate = new Map();
  for (const sec of ds.securities) {
    const bars = sec.bars;
    for (let i = 0; i < bars.length; i++) {
      const d = bars[i].date;
      if (!market.has(d) || !leaders.get(d)?.has(sec.id)) continue;
      if (!kkFidelitySetupAt(bars, i, proxy, { quality: V.quality, minAdv20Usd: V.minAdv20Usd ?? null })) continue;
      (byDate.get(d) || byDate.set(d, []).get(d)).push([sec.id, ranks.get(d)?.get(sec.id) ?? -1]);
    }
  }
  const sel = new Map();
  for (const [d, rows] of byDate) sel.set(d, new Set(rows.sort((a, z) => z[1] - a[1] || (a[0] < z[0] ? -1 : a[0] > z[0] ? 1 : 0)).slice(0, V.dailyTop).map((r) => r[0])));
  return sel;
}

/** Marktfilter je Datum: SMA10 > SMA20 und beide steigend (5 Sitzungen) am Schluss des Datums. */
export function marketOn(benchmark, { sma = KK_FIDELITY_RULES.marketSma, slope = KK_FIDELITY_RULES.marketSlopeSessions } = {}) {
  const on = new Set(), bars = benchmark;
  for (let i = 0; i < bars.length; i++) {
    const a = smaAt(bars, i, sma[0]), b = smaAt(bars, i, sma[1]), a0 = smaAt(bars, i - slope, sma[0]), b0 = smaAt(bars, i - slope, sma[1]);
    if (fin(a) && fin(b) && fin(a0) && fin(b0) && a > b && a > a0 && b > b0) on.add(bars[i].date);
  }
  return on;
}

/** Setup am Schluss i für einen Kauf-Stopp in i+1: Konsolidierung noch nicht gebrochen, Niveau = Hoch der 10 Sitzungen bis i. */
/** 20-Tage-Durchschnitt des Dollarvolumens (Rohkurs x Rohvolumen) der Sitzungen i-19 .. i. */
export function adv20Usd(bars, i, n = 20) {
  if (i < n - 1) return null;
  let s = 0; for (let k = i - n + 1; k <= i; k++) { const b = bars[k], v = (b.rawClose ?? b.close) * (b.rawVolume ?? b.volume); if (!fin(v)) return null; s += v; }
  return s / n;
}
export function kkFidelitySetupAt(bars, i, proxy = KK_SETUP_PROXIES.CONSOLIDATION_10, { quality = false, minAdv20Usd = null } = {}) {
  if (minAdv20Usd !== null) { const a = adv20Usd(bars, i); if (!(fin(a) && a >= minAdv20Usd)) return null; }
  const W = proxy.window, b = bars[i];
  if (i < W + proxy.priorMoveSessions + 1 || !fin(b?.close) || !fin(b.low)) return null;
  const level = priorHigh(bars, i + 1, W); // höchstes Hoch der Sitzungen i-W+1 .. i, am Schluss i bekannt
  if (!fin(level) || !(b.close <= level)) return null;
  const s = i + 1 - W;
  let lo = Infinity; for (let k = s - proxy.priorMoveSessions; k < s; k++) { const l = bars[k]?.low; if (!fin(l)) return null; lo = Math.min(lo, l); }
  const base = bars[s].close; if (!fin(base) || !(lo > 0)) return null;
  const priorMove = base / lo - 1;
  if (!(priorMove >= proxy.priorMove)) return null;
  const rising = (n) => { const a = smaAt(bars, i, n), c = smaAt(bars, i - 5, n); return fin(a) && fin(c) ? a > c : null; };
  if (proxy.maRising && !(rising(10) === true && rising(20) === true)) return null;
  if (quality) {
    // FID2-QUALITY: Konsolidierung = Sitzungen s .. i (W Sitzungen); erste und letzte fünf
    const lowOf = (a, z) => { let v = Infinity; for (let k = a; k <= z; k++) { const l = bars[k].low; if (!fin(l)) return null; v = Math.min(v, l); } return v; };
    const highOf = (a, z) => { let v = -Infinity; for (let k = a; k <= z; k++) { const h = bars[k].high; if (!fin(h)) return null; v = Math.max(v, h); } return v; };
    const h = Math.floor(W / 2), l1 = lowOf(s, s + h - 1), l2 = lowOf(i - h + 1, i), r1 = highOf(s, s + h - 1) - l1, r2 = highOf(i - h + 1, i) - l2;
    if (![l1, l2, r1, r2].every(fin) || !(l2 > l1) || !(r2 < r1)) return null;
  }
  const adrNext = adr20(bars, i + 1);
  if (!fin(adrNext)) return null;
  return { i, date: b.date, level, priorMove, adr20: adrNext };
}

/** Adapter für research/lifecycle-engine.mjs; leaders und market kommen aus momentumLeaders / marketOn (Querschnitt). */
export function createKkFidelityAdapter({ leaders, market, variant = 'FID-1', selection = null }) {
  const V = KK_FIDELITY_VARIANTS[variant];
  if (!V) throw new Error(`UNKNOWN_FID_VARIANT ${variant}`);
  if (V.dailyTop && !selection) throw new Error(`SELECTION_REQUIRED ${variant}`);
  return Object.freeze({
    strategy: `KK_BREAKOUT_${variant.replace('-', '')}`, version: KK_FIDELITY_VERSION, methodVersion: KK_FIDELITY_VERSION, label: STUDY_LABEL.MODEL,
    sourceMaxPositionWeight: KK_PARAMS.overnightCap,
    validateConfig: (cfg) => (cfg.entryTiming === 'BUY_STOP_LEVEL' && KK_EXIT_POLICIES[cfg.exitPolicy] && KK_SETUP_PROXIES[cfg.setupProxy] ? [] : ['FID_CONFIG']),
    prepareKey: (cfg) => `${cfg.setupProxy}|${variant}`,
    closeEntry: () => false,
    prepare(security, cfg) {
      const proxy = KK_SETUP_PROXIES[cfg.setupProxy], bars = security.bars, setups = new Map();
      for (let i = 0; i < bars.length; i++) {
        const d = bars[i].date;
        if (!market.has(d) || !leaders.get(d)?.has(security.id)) continue;
        if (V.dailyTop && !selection.get(d)?.has(security.id)) continue;
        const s = kkFidelitySetupAt(bars, i, proxy, { quality: V.quality, minAdv20Usd: V.minAdv20Usd ?? null }); if (s) setups.set(i, s);
      }
      return setups.size ? { setups, bars } : null;
    },
    signalAt(ctx, i) { return ctx.setups.get(i) ?? null; },
    eligibility({ setup, bars, i }) {
      const a = (KK_FIDELITY_RULES.maxRiskAdr * setup.adr20) / 100;
      const stop = V.adrNorm === 'LOW' ? setup.level / (1 + a) : setup.level * (1 - a);
      const maxLoss = V.adrNorm === 'LOW' ? 1 - 1 / (1 + a) : a;
      return eligibilityResult({ strategy: `KK_BREAKOUT_${variant.replace('-', '')}`, bars, i, blockers: [], openManualDecisions: KK_OPEN_MANUAL_DECISIONS,
        order: { type: 'BUY_STOP', level: setup.level, stop, maxPlannedLoss: maxLoss, rule: `FID-ENTRY Kauf-Stopp am Niveau, Risiko <= 1 ADR20 (${V.adrNorm})` }, extra: { adr20: setup.adr20 } });
    },
    onClose(pos, ctx, i, api, cfg) {
      const P = KK_EXIT_POLICIES[cfg.exitPolicy], bars = ctx.bars, c = bars[i].close;
      const after = i - pos.entryIndex;
      if (after === 0 && fin(bars[i].low)) api.raiseStop(bars[i].low, 'KK-012-LOD'); // Stopp am Tagestief ab der Folgesitzung
      if (after === 0) { const ad = adr20(bars, i); pos.state.trailMa = V.trail === 'TEMPO' ? (fin(ad) && ad >= V.fastAdrPct ? 10 : 20) : P.trailMa; }
      if (!fin(c)) return;
      if (P.partialAfter && !pos.state.partialDone && after >= P.partialAfter) {
        pos.state.partialDone = true;
        if (c > pos.entry) { api.scheduleExit(P.partialFraction, 'KK_PARTIAL_AFTER_DAYS'); api.raiseStop(pos.entry, 'KK-013-BREAKEVEN'); }
      }
      if (P.partialAfter && after < P.partialAfter) return;
      const n = pos.state.trailMa ?? P.trailMa, m = smaAt(bars, i, n);
      if (fin(m) && c < m) api.scheduleExit(1, `KK_TRAIL_CLOSE_BELOW_MA${n}`);
    },
  });
}

/** Diagnose (verändert keine Regel): erster nicht erfüllter Schritt von kkFidelitySetupAt am Schluss i, oder 'OK'.
 *  Muss Schritt für Schritt kkFidelitySetupAt folgen; der Test ST-FID-EXPLAIN prüft die Gleichheit. */
export function kkFidelitySetupExplain(bars, i, proxy = KK_SETUP_PROXIES.CONSOLIDATION_10, { quality = false, minAdv20Usd = null } = {}) {
  if (minAdv20Usd !== null) { const a = adv20Usd(bars, i); if (!(fin(a) && a >= minAdv20Usd)) return { step: 'LIQUIDITY', adv20Usd: a }; }
  const W = proxy.window, b = bars[i];
  if (i < W + proxy.priorMoveSessions + 1 || !fin(b?.close) || !fin(b.low)) return { step: 'HISTORY' };
  const level = priorHigh(bars, i + 1, W);
  if (!fin(level) || !(b.close <= level)) return { step: 'CLOSE_ABOVE_LEVEL', level, close: b.close };
  const s = i + 1 - W;
  let lo = Infinity; for (let k = s - proxy.priorMoveSessions; k < s; k++) { const l = bars[k]?.low; if (!fin(l)) return { step: 'HISTORY' }; lo = Math.min(lo, l); }
  const base = bars[s].close; if (!fin(base) || !(lo > 0)) return { step: 'HISTORY' };
  const priorMove = base / lo - 1;
  if (!(priorMove >= proxy.priorMove)) return { step: 'PRIOR_MOVE', priorMove };
  const rising = (n) => { const a = smaAt(bars, i, n), c = smaAt(bars, i - 5, n); return fin(a) && fin(c) ? a > c : null; };
  if (proxy.maRising && !(rising(10) === true && rising(20) === true)) return { step: 'MA_NOT_RISING', ma10: rising(10), ma20: rising(20), priorMove };
  if (quality) {
    const lowOf = (a, z) => { let v = Infinity; for (let k = a; k <= z; k++) { const l = bars[k].low; if (!fin(l)) return null; v = Math.min(v, l); } return v; };
    const highOf = (a, z) => { let v = -Infinity; for (let k = a; k <= z; k++) { const h = bars[k].high; if (!fin(h)) return null; v = Math.max(v, h); } return v; };
    const h = Math.floor(W / 2), l1 = lowOf(s, s + h - 1), l2 = lowOf(i - h + 1, i), r1 = highOf(s, s + h - 1) - l1, r2 = highOf(i - h + 1, i) - l2;
    if (![l1, l2, r1, r2].every(fin) || !(l2 > l1) || !(r2 < r1)) return { step: 'QUALITY', higherLows: l2 > l1, tightening: r2 < r1, priorMove };
  }
  const adrNext = adr20(bars, i + 1);
  if (!fin(adrNext)) return { step: 'ADR' };
  return { step: 'OK', level, priorMove, adr20: adrNext };
}

/** Bestes 1/3/6-Monats-Perzentil eines Titels an ausgewählten Daten (gleiche Rechnung wie momentumLeaders). */
export function momentumPercentileAt(securities, id, dates, { minRawClose = KK_FIDELITY_RULES.universeMinRawClose, P = KK_PARAMS } = {}) {
  const want = new Set(dates), rows = new Map();
  for (const s of securities) {
    const b = s.bars;
    for (let i = 0; i < b.length; i++) {
      if (!want.has(b[i].date)) continue;
      const c = b[i].close, rc = b[i].rawClose ?? c;
      if (!fin(c) || !(rc >= minRawClose)) continue;
      const ret = (n) => (i >= n && b[i - n].close > 0 ? c / b[i - n].close - 1 : null);
      (rows.get(b[i].date) || rows.set(b[i].date, []).get(b[i].date)).push([s.id, ret(P.momentumSessions.m1), ret(P.momentumSessions.m3), ret(P.momentumSessions.m6)]);
    }
  }
  const out = {};
  for (const d of dates) {
    const r = rows.get(d) || []; let best = null;
    for (const k of [1, 2, 3]) { const v = r.filter((x) => x[k] !== null).sort((a, z) => a[k] - z[k]); const j = v.findIndex((x) => x[0] === id); if (j >= 0 && v.length > 1) best = Math.max(best ?? -1, (j / (v.length - 1)) * 100); }
    out[d] = { eligible: r.some((x) => x[0] === id), bestPercentile: best, crossSection: r.length };
  }
  return out;
}

/** Je goldenem Trade und Variante: im Universum?, und für jede Sitzung im Fenster ±8 Tage Rohkurs, Momentum-Perzentil,
 *  Marktfilter, erster nicht erfüllter Setup-Schritt und ob der Folgetag das Niveau erreicht. Keine Renditezahlen. */
export function goldenDiagnose(ds, { leaders, market, golden = KK_GOLDEN_TRADES, proxy = KK_SETUP_PROXIES.CONSOLIDATION_10, topPct = KK_FIDELITY_RULES.momentumTopPct } = {}) {
  const tickerOf = (id) => String(id).split('#')[0].split(':')[2];
  return golden.map((g) => {
    const secs = ds.securities.filter((s) => tickerOf(s.id) === g.ticker);
    const lo = new Date(Date.parse(g.date) - 8 * 864e5).toISOString().slice(0, 10), hi = new Date(Date.parse(g.date) + 8 * 864e5).toISOString().slice(0, 10);
    if (!secs.length) return { ...g, inUniverse: false };
    return { ...g, inUniverse: true, securities: secs.map((s) => {
      const b = s.bars, idx = []; for (let i = 0; i < b.length; i++) if (b[i].date >= lo && b[i].date <= hi) idx.push(i);
      const mom = momentumPercentileAt(ds.securities, s.id, idx.map((i) => b[i].date));
      return { id: s.id, firstBar: b[0]?.date ?? null, lastBar: b[b.length - 1]?.date ?? null, barsInWindow: idx.length, sessions: idx.map((i) => {
        const d = b[i].date, out = { date: d, rawClose: b[i].rawClose ?? b[i].close, momentum: mom[d], leader: !!leaders?.get(d)?.has(s.id), marketOn: market ? market.has(d) : null, topPct };
        for (const [v, V] of Object.entries(KK_FIDELITY_VARIANTS)) out[v] = kkFidelitySetupExplain(b, i, proxy, { quality: V.quality, minAdv20Usd: V.minAdv20Usd ?? null }).step;
        const lvl = priorHigh(b, i + 1, proxy.window); out.nextDayReachesLevel = i + 1 < b.length && fin(lvl) ? b[i + 1].high >= lvl : null;
        return out;
      }) };
    }) };
  });
}

/** R-Verteilung geschlossener Trades (R = Gewinn / anfängliches Risiko): Trefferquote, mittleres Gewinner-R, Anteil > 5 R, Haltedauer. */
export function rDistribution(trades) {
  const closed = trades.filter((t) => t.status === 'CLOSED' && fin(t.pnl) && t.initialRiskAmount > 0);
  const r = closed.map((t) => ({ r: t.pnl / t.initialRiskAmount, held: t.heldSessions ?? null }));
  const win = r.filter((x) => x.r > 0), med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  return {
    closed: r.length, hitRate: r.length ? win.length / r.length : null,
    avgWinR: win.length ? win.reduce((a, x) => a + x.r, 0) / win.length : null, avgLossR: r.length - win.length ? r.filter((x) => x.r <= 0).reduce((a, x) => a + x.r, 0) / (r.length - win.length) : null,
    shareAbove5R: r.length ? r.filter((x) => x.r > 5).length / r.length : null, maxR: r.length ? Math.max(...r.map((x) => x.r)) : null,
    medianHeldWinners: med(win.map((x) => x.held).filter(fin)), medianHeldAll: med(r.map((x) => x.held).filter(fin)),
    expectancyR: r.length ? r.reduce((a, x) => a + x.r, 0) / r.length : null,
  };
}

/** Goldene Trades: Kauf der Engine im Fenster [Datum − 5, Datum + 5] Sitzungen für den Ticker, mit Ausstieg und R. */
export function goldenTradeCheck(trades, golden) {
  const tickerOf = (id) => String(id).split('#')[0].split(':')[2];
  return golden.map((g) => {
    const lo = new Date(Date.parse(g.date) - 8 * 864e5).toISOString().slice(0, 10), hi = new Date(Date.parse(g.date) + 8 * 864e5).toISOString().slice(0, 10);
    const hit = trades.filter((t) => tickerOf(t.id) === g.ticker && t.entryDate >= lo && t.entryDate <= hi);
    return { ...g, taken: hit.length > 0, trades: hit.map((t) => ({ entryDate: t.entryDate, exitDate: t.exitDate ?? null, exitReason: t.exitReason ?? null, r: t.initialRiskAmount > 0 && fin(t.pnl) ? t.pnl / t.initialRiskAmount : null, heldSessions: t.heldSessions ?? null })) };
  });
}

/** Öffentlich dokumentierte Breakout-Trades im DEV-Fenster (Stream-Mitschriften Dritter, siehe Bericht; Datum teils geschätzt). */
export const KK_GOLDEN_TRADES = Object.freeze([
  { ticker: 'KOD', date: '2019-12-24', source: 'Stream 27.12.2019 (Mitschrift), ~70 USD' },
  { ticker: 'FCEL', date: '2020-02-10', source: 'Stream 61–65 (Mitschrift)' },
  { ticker: 'OCGN', date: '2019-12-30', source: 'Stream 27.12.2019 ff. (Mitschrift), unter 1 USD' },
  { ticker: 'DT', date: '2020-01-06', source: 'Stream 41–45 (Mitschrift)' },
  { ticker: 'JCP', date: '2020-01-07', source: 'Stream 41–45 (Mitschrift)' },
  { ticker: 'JMIA', date: '2020-01-17', source: 'Stream 51–55 (Mitschrift)' },
  { ticker: 'JAGX', date: '2020-01-17', source: 'Stream 51–55 (Mitschrift)' },
  { ticker: 'ETCG', date: '2020-02-06', source: 'Stream 61–65 (Mitschrift)' },
  { ticker: 'ROKU', date: '2020-02-14', source: 'Stream 66–70 (Mitschrift), nahe Quartalszahlen' },
  { ticker: 'DXCM', date: '2020-02-14', source: 'Stream 66–70 (Mitschrift), Grenzfall EP' },
  { ticker: 'ZM', date: '2020-02-13', source: 'Stream 76–80 (Mitschrift)' },
  { ticker: 'AMC', date: '2021-06-03', source: 'Stream 03.06.2021 (Mitschrift), ORH' },
  { ticker: 'BB', date: '2021-06-03', source: 'Stream 03.06.2021 (Mitschrift), ORH' },
  { ticker: 'FCX', date: '2023-01-05', source: 'Stream 26.01.2023 (Mitschrift), ~39,30 USD' },
  { ticker: 'PDD', date: '2023-01-23', source: 'Stream 26.01.2023 (Mitschrift), ~94 USD' },
  { ticker: 'RGTI', date: '2023-06-06', source: 'Stream 08.06.2023 (Mitschrift), ~0,96 USD' },
]);
