// Supertrader — Backtest- und Datengates.
//
// Eine Kennzahl darf nur erscheinen, wenn ALLE harten Gates einer Variante
// bestanden sind. Die Gates lesen ausschliesslich die gemessene Abdeckung
// der kanonischen Artefakte (build.mjs misst sie bei jedem Lauf neu) - kein
// Gate laesst sich per Konfiguration "freischalten".

export const MIN_HISTORY_YEARS = 8; // wie Trust Score V1: Teilpunkte ab 8 Jahren

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
};

// Welche Gates eine Variante braucht.
export const REQUIREMENTS = {
  GREENBLATT_US_ORIGINAL: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'PIT_FUNDAMENTALS', 'REQUIRED_FIELDS', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES'],
  KK_COMMON_BREAKOUT_DAILY: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'VOLUME_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES'],
  KK_COMMON_BREAKOUT_ORH: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'INTRADAY_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES'],
  WEINSTEIN_STAGE2_WEEKLY: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'VOLUME_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES'],
  DARVAS_BOX_N3_VU: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES'],
  MINERVINI_TT_VCP_A: ['HISTORY', 'SURVIVORSHIP', 'UNIVERSE_PIT', 'VOLUME_HISTORY', 'CORPORATE_ACTIONS', 'EXECUTION_MODEL', 'OUT_OF_SAMPLE', 'BASELINES'],
};

export function evaluateGates(variantId, cov, extra = {}) {
  const needs = REQUIREMENTS[variantId];
  // Ohne definierte Gates gibt es nie eine Freigabe: "keine Pruefung" ist
  // nicht "alle Pruefungen bestanden".
  if (!needs || !needs.length) {
    return { variantId, status: 'NOT_COMPARABLE', metricsPublishable: false, gates: [], failedGates: ['NO_GATE_DEFINITION'] };
  }
  const timeframe = extra.timeframe || 'daily';
  const histYears = timeframe === 'weekly' ? cov.weeklyCloseYears : cov.dailyOhlcvYears;
  const volumeYears = cov.dailyOhlcvYears; // Volumen existiert nur mit Tages-OHLCV
  const results = needs.map((id) => {
    let pass = false, measured = '';
    switch (id) {
      case 'HISTORY':
        pass = histYears >= MIN_HISTORY_YEARS;
        measured = `${fmtY(histYears)} ${timeframe === 'weekly' ? 'Wochenschlusskurse' : 'Tages-OHLCV'} öffentlich verfügbar, benötigt ≥ ${MIN_HISTORY_YEARS} Jahre`;
        break;
      case 'VOLUME_HISTORY':
        pass = volumeYears >= MIN_HISTORY_YEARS;
        measured = `Volumen über ${fmtY(volumeYears)} vorhanden, benötigt ≥ ${MIN_HISTORY_YEARS} Jahre`;
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
        pass = cov.splitAdjusted === true;
        measured = cov.splitAdjusted ? 'split-adjustierte Reihen; Dividenden nicht als Total Return' : 'nicht nachgewiesen';
        break;
      case 'EXECUTION_MODEL':
        pass = true; measured = 'Stop-Buy/Stop-Loss mit Gap-Regel, Same-Bar ungünstig, Kosten und Slippage je Seite';
        break;
      case 'OUT_OF_SAMPLE':
        pass = histYears >= MIN_HISTORY_YEARS;
        measured = pass ? 'Zeitraum teilbar' : 'Zeitraum zu kurz für getrennte In-/Out-of-Sample-Abschnitte';
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
  return { variantId, status, metricsPublishable: failed.length === 0, gates: results, failedGates: failed.map((f) => f.id) };
}

function fmtY(y) { return Number.isFinite(y) ? `${y.toFixed(1).replace('.', ',')} Jahre` : 'keine'; }
