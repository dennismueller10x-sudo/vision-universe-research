/**
 * Supertrader 8.0 – reproduzierbare Sortierung der Kandidaten JE STRATEGIE (kein globaler Score, keine Gewichte,
 * keine Gewinnwahrscheinlichkeit). Jede Sortierung ist eine lexikografische Folge offen benannter Schlüssel; Gleichstand
 * entscheidet immer der Ticker. Die Schlüssel werden im Ergebnis mitgeliefert, damit die Oberfläche umsortieren kann.
 */
import { STAGE_ORDER } from './candidate-contract.mjs';
import { catalogOf } from './catalog.mjs';

export const RANKING_VERSION = 'sf8-ranking-1.0.0';

/** Sortierschlüssel: Name -> { key(view), dir } ; null-Werte immer zuletzt. */
export const SORT_KEYS = Object.freeze({
  stage: { label: 'Research-Stufe', dir: 'desc', key: (v) => STAGE_ORDER.indexOf(v.stage) },
  pivot: { label: 'Abstand zur Chartmarke (absolut)', dir: 'asc', key: (v) => (v.pivot && Number.isFinite(v.pivot.distance) ? Math.abs(v.pivot.distance) : null) },
  volume: { label: 'Volumen ggü. 50-Tage-Schnitt', dir: 'desc', key: (v) => v.trend?.volumeVs50d ?? null },
  momentum: { label: 'bestes 1/3/6-Monats-Perzentil', dir: 'desc', key: (v) => v.features?.momentum?.best ?? null },
  // Owner-Entscheidung 28.10.2026: eine Kontraktion allein ist kein bestätigtes VCP; der Schlüssel ordnet nur nach vorhandenem Pivot
  setupState: { label: 'Pivot vorhanden (VCP nicht bestätigt)', dir: 'asc', key: (v) => (v.features?.vcpProxyState === undefined ? null : v.features.vcpProxyState === 'SETUP_DETECTED' ? 0 : 1) },
  streak: { label: 'Länge der Aufwärtsserie', dir: 'desc', key: (v) => v.features?.upStreak ?? null },
  trend: { label: '63-Tage-Rendite', dir: 'desc', key: (v) => v.trend?.ret63 ?? null },
  dataQuality: { label: 'Datenqualität', dir: 'asc', key: (v) => (v.dataQuality?.status === 'PASS' ? 0 : 1) },
  // Owner-Entscheidung 28.10.2026: ohne öffentliche Chartmarke ordnen Weinstein C04/C05 nach Stufe, Datenqualität und Name
  ticker: { label: 'Name (Ticker, alphabetisch)', dir: 'asc', key: (v) => v.ticker },
});

function cmpBy(name) {
  const k = SORT_KEYS[name];
  return (a, b) => {
    const x = k.key(a), y = k.key(b);
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    const c = x < y ? -1 : 1;
    return k.dir === 'asc' ? c : -c;
  };
}

/** Sortiert die Ansichten einer Strategie nach ihrer Default-Folge und vergibt rank 1..n (stabil, deterministisch). */
export function rankStrategy(strategyId, views) {
  const order = [...(catalogOf(strategyId)?.defaultSort ?? ['stage', 'ticker'])];
  if (!order.includes('ticker')) order.push('ticker');
  const cmps = order.map(cmpBy);
  const sorted = [...views].sort((a, b) => { for (const c of cmps) { const r = c(a, b); if (r) return r; } return 0; });
  sorted.forEach((v, k) => { v.rank = k + 1; v.sortKeys = Object.fromEntries(Object.entries(SORT_KEYS).map(([n, s]) => [n, s.key(v) ?? null])); });
  return { order, views: sorted };
}
