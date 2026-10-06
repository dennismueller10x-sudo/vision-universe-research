// Supertrader — laufendes Modellportfolio je Methode (Runde 7).
//
// Wendet dieselbe Portfoliologik wie die interne Pruefung (validation/
// portfolio.mjs runPortfolioTR) auf das LIVE-Protokoll an: 100.000 USD
// Startkapital ab dem ersten Modelleinstieg, Positionsgroesse aus Risiko je
// Trade und Stopabstand, Hoechstgrenzen je Position und Anzahl, gleichzeitige
// Einstiege nach relativer Staerke (ab R10; Turtle alphabetisch), Gebuehren 1 bp je Seite. Was keinen Platz bekommt,
// wird als „nicht übernommen“ mit Grund gezeigt - nicht verschwiegen.
//
// Veroeffentlicht werden Zusammensetzung, Gewichte, Cash, Stops und die
// Ergebnisse einzelner abgeschlossener Trades (wie im Protokoll). Eine
// Gesamtrendite oder Kurve des Modellportfolios wird bis zur Klaerung der
// Rechte an abgeleiteten Kennzahlen NICHT veroeffentlicht.
import { runPortfolioTR } from './validation/portfolio.mjs';
import { PORTFOLIO_DEFAULTS } from './engine/backtest.mjs';

export const MODEL_PORTFOLIO_VERSION = 'supertrader-model-portfolio-1.1.0';
const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);

// Runde 10 (PREREGISTRATION-R10-FIXES K3): gleichzeitige Einstiege nach relativer Staerke am Vortag,
// geprueft an Pruefmenge und Vollportfolio. Turtle: alphabetisch (VU-eigen; die Turtle Rules nennen den
// Staerke-Rang, Forschungsversion 2.1.0 ging nicht live).
// Migration Phase 1: ehrliche Herkunft je Portfolioangabe (nur Anzeige; die Werte ändert das nicht).
// Quelle der Einordnung: fidelity/portfolio-policy.mjs (Layer C) und R15-RULE-PROVENANCE.json.
export const PORTFOLIO_SOURCE_TEXT = Object.freeze({
  MOMENTUM_BREAKOUT: 'Kullamägi: Risiko meist 0,3–0,5 % und Positionen meist 10–20 % (FAQ 5–25 %), nie über 30 % über Nacht. Höchstzahl 10, keine Hebelnutzung und der Rang nach relativer Stärke sind VU-eigen (Kullamägi nutzt Margin).',
  WEINSTEIN_STAGE: 'Bisherige VU-Anpassung, keine Weinstein-Regel: Standardwerte des Modellportfolios (0,5 % Risiko, 20 % je Position, 10 Plätze). Die 0,5 % stammen aus Kullamägis Risikospanne und wurden still geerbt; Weinstein nennt keine Größenregel.',
  DARVAS_BOX: 'Darvas (TIME 1959): höchstens fünf bis sechs Aktien gleichzeitig. Höchstgewicht 1/6 und Rang nach relativer Stärke sind VU. Das Risiko von 0,5 % je Trade stammt aus Kullamägis Risikospanne (keine Darvas-Regel); die Marktampel (keine neue Position bei SPY unter GD 200) stammt aus einer TraderFox-Variante, nicht von Darvas.',
  MINERVINI_VCP: 'Minervini (eigene Beiträge auf X): Ø 1,25 % Risiko, 25 % je Position bei 5 % Stop; 8–10 Positionen (Höchstzahl 10 ist VU), Risikohalbierung nach Verlustserie als VU-Formalisierung der progressiven Exposition. Startquote und Aufstocken fehlen.',
  DONCHIAN_TURTLE: 'Turtle Rules: Unit = 1 % des Kontos je N, Stop 2N (= 2 % Risiko), notionelles Konto −20 % je 10 % Verlust. VU: eine Unit je Aktie, höchstens 12 Titel ohne Hebel, kein Gewichtsdeckel je Aktie, alphabetische Auswahl bei gleichzeitigen Signalen. Das Original handelte gehebelte Futures mit Korrelationsgrenzen und Aufstocken.',
});
export const RANK_RS = new Set(['MOMENTUM_BREAKOUT', 'WEINSTEIN_STAGE', 'DARVAS_BOX', 'MINERVINI_VCP']);
export function portfolioConfig(engine) {
  const c = engine.portfolio ? { ...PORTFOLIO_DEFAULTS, ...engine.portfolio } : { ...PORTFOLIO_DEFAULTS, source: 'VU-Standard: keine belegte Positionsgrößenregel der Methode' };
  if (!c.priority) c.priority = RANK_RS.has(engine.id) ? 'RS' : 'ALPHA';
  return c;
}

// signals: alle Ledger-Signale (open + closed) einer Methode; barsOf(symbol) -> {date[], close[]}.
// marketOk: Map(Datum -> SPY ueber GD 200 am Vortag) fuer Methoden mit Marktampel (Runde 12).
export function buildModelPortfolio({ engine, signals, barsOf, calendar, asOf, rsOf = null, marketOk = null }) {
  const cfg = portfolioConfig(engine);
  const entered = signals.filter((s) => s.entry && s.entry.date && Number.isFinite(s.entry.price) && Number.isFinite(s.initialStop));
  const base = { schema: MODEL_PORTFOLIO_VERSION, strategyId: engine.id, currentVersion: engine.version, asOf,
    config: { initialEquity: cfg.initialEquity, riskPerTrade: cfg.riskPerTrade, maxPositionPct: cfg.maxPositionPct, maxPositions: cfg.maxPositions, progressive: cfg.progressive || null, source: PORTFOLIO_SOURCE_TEXT[engine.id] || cfg.source || null, simultaneousEntries: cfg.priority === 'RS' ? 'nach relativer Stärke am Vortag (Gleichstand alphabetisch)' : 'alphabetisch nach Symbol (VU-eigen, ökonomisch bedeutungslos; die Turtle Rules kaufen bei gleichzeitigen Signalen die stärksten Märkte zuerst)', priority: cfg.priority, costs: '1 bp Gebühr je Seite; Einstiegspreise enthalten bereits 10 bp Slippage', marketFilter: !!cfg.marketFilter },
    publication: 'Zusammensetzung und Einzeltrades. Gesamtrendite und Kurve werden bis zur Klärung der Rechte an abgeleiteten Kennzahlen nicht veröffentlicht.' };
  if (!entered.length) return { ...base, startDate: null, cashPct: 1, investedPct: 0, positions: [], closed: [], notTaken: [], note: 'Noch kein Modelleinstieg dieser Methode im Live-Protokoll.' };
  const start = entered.map((s) => s.entry.date).sort()[0];
  const cal = calendar.filter((d) => d >= start && d <= asOf);
  const trades = entered.map((s) => {
    const b = barsOf(s.symbol);
    const marks = new Map();
    if (b) for (let i = 0; i < b.date.length; i++) if (b.date[i] >= s.entry.date && b.date[i] <= asOf) marks.set(b.date[i], b.close[i]);
    return { id: s.id, listingId: s.symbol, rsAtEntry: rsOf ? rsOf(s.symbol, s.entry.date) : null, entry: { date: s.entry.date, price: s.entry.price }, initialStop: s.initialStop,
      exits: (s.exits || []).filter((x) => x.date <= asOf).map((x) => ({ date: x.date, price: x.price, fraction: x.fraction, ruleId: x.ruleId })), terminal: null, marks, divs: new Map(), sig: s };
  });
  const run = runPortfolioTR(trades, cal, cfg, { dividends: false, commissionBps: 1, marketOk });
  const last = run.equity[run.equity.length - 1];
  const eq = last ? last.equity : cfg.initialEquity;
  const positions = run.taken.filter((p) => p.remainingFraction > 1e-9).map((p) => {
    const s = p.tr.sig, px = p.last ?? p.tr.entry.price, value = p.shares * px;
    return { symbol: s.symbol, signalId: s.id, version: s.version, state: s.state, entryDate: s.entry.date, entryPrice: r4(s.entry.price), shares: r4(p.shares),
      initialWeightPct: r4((p.entryShares * s.entry.price) / p.eqAtEntry), initialRiskPct: r4(((s.entry.price - s.initialStop) * p.entryShares) / p.eqAtEntry),
      weightPct: r4(value / eq), lastPrice: r4(px), stop: r4(s.stop), riskToStopPct: r4(Number.isFinite(s.stop) ? Math.max(0, (px - s.stop) * p.shares) / eq : null),
      partialSold: (s.exits || []).length > 0 };
  }).sort((a, b) => b.weightPct - a.weightPct);
  const closed = run.taken.filter((p) => p.remainingFraction <= 1e-9).map((p) => {
    const s = p.tr.sig, lx = (s.exits || [])[s.exits.length - 1];
    return { symbol: s.symbol, signalId: s.id, version: s.version, entryDate: s.entry.date, exitDate: lx?.date || null, exitRuleId: lx?.ruleId || null, returnPct: r4(p.returnPct) };
  }).sort((a, b) => (b.exitDate || '').localeCompare(a.exitDate || ''));
  const notTaken = run.skipped.map((x) => { const t = trades.find((y) => y.id === x.id); return { symbol: t.listingId, signalId: x.id, entryDate: t.entry.date, reason: x.reason }; });
  const invested = positions.reduce((a, p) => a + p.weightPct, 0);
  return { ...base, startDate: start, cashPct: r4(Math.max(0, 1 - invested)), investedPct: r4(invested), openCount: positions.length, positions, closed, notTaken,
    note: notTaken.length ? `${notTaken.length} Modelleinstiege bekamen keinen Platz (Höchstzahl oder Kapital) und stehen nur im Protokoll.` : null };
}
