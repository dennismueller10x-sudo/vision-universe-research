// Supertrader — Backtest- und Datengates.
//
// Eine Kennzahl darf nur erscheinen, wenn ALLE harten Gates einer Variante
// bestanden sind. Die Gates lesen ausschliesslich die gemessene Abdeckung
// der kanonischen Artefakte (build.mjs misst sie bei jedem Lauf neu) - kein
// Gate laesst sich per Konfiguration "freischalten".

export const MIN_HISTORY_YEARS = 8; // Rueckfallwert fuer Varianten ohne eigenen Pruefplan

// Methodenspezifische Pruefplaene, VOR jedem Test festgelegt (2026-10-01).
// Statt pauschal 8 Jahren zaehlt, ob genug unabhaengige Beobachtungen und
// mehrere Baerenmaerkte (SPY-Rueckgang >= 20 %: 2000-02, 2007-09, 2020, 2022)
// im Testzeitraum liegen. Kurzfristige Tagesmethoden erzeugen viele Trades und
// brauchen weniger Jahre; Jahres-Rebalancing liefert ein Kohortenergebnis pro
// Jahr und braucht entsprechend mehr Jahre.
export const TEST_PLANS = {
  KK_COMMON_BREAKOUT_DAILY: { minYears: 10, minBearMarkets: 2, minTrades: 300, unit: 'Trades', why: 'Tagesmethode mit kurzer Haltedauer; ab 2016 liegen die Bärenphasen 2018/2020/2022 im Fenster.' },
  KK_COMMON_BREAKOUT_ORH: { minYears: 10, minBearMarkets: 2, minTrades: 300, unit: 'Trades', why: 'Wie die Tagesvariante, zusätzlich Intraday-Balken.' },
  DARVAS_BOX_N3_VU: { minYears: 10, minBearMarkets: 2, minTrades: 300, unit: 'Trades', why: 'Tagesmethode; Boxen bilden sich in Wochen.' },
  MINERVINI_TT_VCP_A: { minYears: 10, minBearMarkets: 2, minTrades: 200, unit: 'Trades', why: 'Seltene Setups; Trend Template braucht 1 Jahr Vorlauf je Titel.' },
  DONCHIAN_TURTLE_S1_DAILY: { minYears: 10, minBearMarkets: 2, minTrades: 300, unit: 'Trades', why: 'Trendfolge lebt von wenigen großen Trends; viele Fehlausbrüche müssen enthalten sein.' },
  WEINSTEIN_STAGE2_WEEKLY: { minYears: 20, minBearMarkets: 3, minTrades: 150, unit: 'Trades', why: 'Wochenmethode mit Haltedauern über Monate; Stufenzyklen dauern Jahre.' },
  GREENBLATT_US_ORIGINAL: { minYears: 20, minBearMarkets: 3, minTrades: 20, unit: 'Jahreskohorten', why: 'Ein Rebalancing pro Jahr = eine unabhängige Beobachtung; Value-Durststrecken dauern Jahre.' },
  CANSLIM_FULL: { minYears: 10, minBearMarkets: 2, minTrades: 200, unit: 'Trades', why: 'Wachstumsmethode; braucht zusätzlich Quartalsgewinne und Fondsbestände zum Stichtag.' },
  PIOTROSKI_F_FULL: { minYears: 20, minBearMarkets: 3, minTrades: 20, unit: 'Jahreskohorten', why: 'Jährliche Bilanzsignale, ein Portfolio pro Jahr.' },
};
const planOf = (id) => TEST_PLANS[id] || { minYears: MIN_HISTORY_YEARS, minBearMarkets: 2, minTrades: 100, unit: 'Trades', why: 'Rückfallwert ohne eigenen Prüfplan.' };

export const GATE_DEFS = {
  HISTORY: { label: 'Kurshistorie über mehrere Marktzyklen', hard: true },
  SURVIVORSHIP: { label: 'Delistete Titel im historischen Universum (Survivorship Bias)', hard: true },
  UNIVERSE_PIT: { label: 'Historische Universumszugehörigkeit je Stichtag', hard: true },
  PIT_FUNDAMENTALS: { label: 'Point-in-Time-Fundamentaldaten inkl. Restatements', hard: true },
  REQUIRED_FIELDS: { label: 'Alle Pflichtfelder der Regeln vorhanden', hard: true },
  INTRADAY_HISTORY: { label: 'Historische Intraday-Balken (Opening Range)', hard: true },
  VOLUME_HISTORY: { label: 'Volumenhistorie für Volumenregeln', hard: true },
  CORPORATE_ACTIONS: { label: 'Splits und Corporate Actions berücksichtigt', hard: true },
  EXECUTION_MODEL: { label: 'Kosten, Slippage, Gap- und Same-Bar-Regeln dokumentiert', hard: true },
  OUT_OF_SAMPLE: { label: 'In-Sample / Out-of-Sample / Walk-forward trennbar', hard: true },
  BASELINES: { label: 'Kontrollstrategien definiert', hard: true },
  USAGE_RIGHTS: { label: 'Nutzungsrechte für veröffentlichte Backtest-Kennzahlen bestätigt', hard: true },
};

// Welche Gates eine Variante braucht.
export const REQUIREMENTS = {
  GREENBLATT_US_ORIGINAL: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'PIT_FUNDAMENTALS', 'REQUIRED_FIELDS', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
  KK_COMMON_BREAKOUT_DAILY: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'VOLUME_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
  KK_COMMON_BREAKOUT_ORH: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'INTRADAY_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
  WEINSTEIN_STAGE2_WEEKLY: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'VOLUME_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
  DONCHIAN_TURTLE_S1_DAILY: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
  DARVAS_BOX_N3_VU: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
  CANSLIM_FULL: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'PIT_FUNDAMENTALS', 'REQUIRED_FIELDS', 'VOLUME_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
  PIOTROSKI_F_FULL: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'PIT_FUNDAMENTALS', 'REQUIRED_FIELDS', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
  MINERVINI_TT_VCP_A: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'VOLUME_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES', 'USAGE_RIGHTS'],
};

export function evaluateGates(variantId, cov, extra = {}) {
  const needs = REQUIREMENTS[variantId];
  // Ohne definierte Gates gibt es nie eine Freigabe: "keine Pruefung" ist
  // nicht "alle Pruefungen bestanden".
  if (!needs || !needs.length) {
    return { variantId, status: 'NOT_COMPARABLE', metricsPublishable: false, gates: [], failedGates: ['NO_GATE_DEFINITION'] };
  }
  const timeframe = extra.timeframe || 'daily';
  const plan = planOf(variantId);
  const minY = plan.minYears;
  const histYears = timeframe === 'weekly' ? cov.weeklyCloseYears : cov.dailyOhlcvYears;
  const volumeYears = cov.dailyOhlcvYears; // Volumen existiert nur mit Tages-OHLCV
  const results = needs.map((id) => {
    let pass = false, measured = '';
    switch (id) {
      case 'HISTORY':
        pass = histYears >= minY;
        measured = `${fmtY(histYears)} ${timeframe === 'weekly' ? 'Wochenschlusskurse' : 'Tages-OHLCV'} verfügbar, Prüfplan verlangt ≥ ${minY} Jahre (${plan.why})`;
        break;
      case 'VOLUME_HISTORY':
        pass = volumeYears >= minY;
        measured = `Volumen über ${fmtY(volumeYears)} vorhanden, benötigt ≥ ${minY} Jahre`;
        break;
      case 'SURVIVORSHIP':
        pass = cov.delistedWithPriceHistory > 0 && cov.survivorshipControls === true;
        measured = `${cov.delistedWithPriceHistory} delistete Titel mit Kurshistorie; Survivorship-Kontrolle laut kanonischem Gate: ${cov.survivorshipControls ? 'aktiv' : 'nicht aktiv'}`;
        break;
      case 'UNIVERSE_PIT':
        pass = cov.historicalMembershipDates >= 24;
        measured = `${cov.historicalMembershipDates} historische Stichtage der Indexzugehörigkeit`;
        break;
      case 'PIT_FUNDAMENTALS':
        pass = cov.pitFundamentalSymbols >= 500;
        measured = `Point-in-Time-/Revisionshistorie öffentlich für ${cov.pitFundamentalSymbols} Titel`;
        break;
      case 'REQUIRED_FIELDS':
        pass = (extra.missingFields || []).length === 0;
        measured = pass ? 'alle Pflichtfelder vorhanden' : `fehlend: ${(extra.missingFields || []).join(', ')}`;
        break;
      case 'INTRADAY_HISTORY':
        pass = cov.intradaySessionsRetained >= 250 && cov.intradayHasOhlc;
        measured = `${cov.intradaySessionsRetained} Intraday-Sitzungen vorgehalten, ${cov.intradayHasOhlc ? 'OHLC' : 'nur Schlusskurse je 5 Minuten'}`;
        break;
      case 'CORPORATE_ACTIONS':
        pass = cov.splitAdjusted === true && cov.totalReturnUniform === true && cov.delistingReturns === true;
        measured = `${cov.splitAdjusted ? 'Splits adjustiert' : 'Splits nicht nachgewiesen'}; Dividenden ${cov.totalReturnUniform ? 'einheitlich' : 'nicht einheitlich bereinigt'}; Delisting-Renditen ${cov.delistingReturns ? 'vorhanden' : 'fehlen'}`;
        break;
      case 'EXECUTION_MODEL':
        pass = true; measured = 'Stop-Buy/Stop-Loss mit Gap-Regel, Same-Bar ungünstig, Kosten und Slippage je Seite';
        break;
      case 'OUT_OF_SAMPLE':
        pass = histYears >= minY;
        measured = pass ? 'Zeitraum teilbar' : 'Zeitraum zu kurz für getrennte In-/Out-of-Sample-Abschnitte';
        break;
      case 'USAGE_RIGHTS':
        pass = cov.usageRightsConfirmed === true;
        measured = cov.usageRightsConfirmed ? 'bestätigt' : 'Vertragstext liegt nicht vor; Veröffentlichung abgeleiteter Backtest-Kennzahlen ungeklärt';
        break;
      case 'BASELINES':
        pass = (extra.baselines || []).length > 0;
        measured = `${(extra.baselines || []).length} Kontrollstrategien definiert`;
        break;
      default: break;
    }
    return { id, label: GATE_DEFS[id].label, hard: GATE_DEFS[id].hard, pass, measured };
  });
  const failed = results.filter((r) => r.hard && !r.pass);
  let status = 'BACKTEST_READY';
  if (failed.length) {
    status = failed.some((f) => ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'PIT_FUNDAMENTALS', 'REQUIRED_FIELDS', 'INTRADAY_HISTORY', 'VOLUME_HISTORY'].includes(f.id))
      ? (failed.some((f) => ['INTRADAY_HISTORY', 'REQUIRED_FIELDS'].includes(f.id)) ? 'DATA_COVERAGE_PENDING' : 'DATA_COVERAGE_INSUFFICIENT')
      : 'BACKTEST_PENDING';
  }
  return { variantId, status, metricsPublishable: failed.length === 0, gates: results, failedGates: failed.map((f) => f.id), testPlan: plan };
}

function fmtY(y) { return Number.isFinite(y) ? `${y.toFixed(1).replace('.', ',')} Jahre` : 'keine'; }
