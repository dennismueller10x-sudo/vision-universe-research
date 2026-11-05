/**
 * Supertrader – Export der veröffentlichten Research-Kandidaten als Screener-Kriterien (Neustart, Plan §7 Z5).
 *
 * Liest ausschließlich den bereits veröffentlichten Stand supertrader/data/sf-candidates/index.json (Erzeuger:
 * product/build-candidates.mjs, Workflow supertrader-sf8-candidates.yml) und formt ihn je Ticker in Spalten um. Kein
 * Fachmodell, keine Neuberechnung, keine neue Datei: der Screener-Erzeuger (scripts/screener/build-universe.mjs) ruft
 * screenerColumns() auf und übernimmt die Spalten. Stufen und Methoden bleiben Research (LIVE_NOT_APPROVED,
 * DIAGNOSTIC_NOT_CERTIFIED); VALIDATED_TRADE_SIGNAL kommt nie vor.
 *
 *   import { screenerColumns } from './scripts/supertrader/source-faithful/product/screener-export.mjs';
 *   const sf = screenerColumns(JSON.parse(fs.readFileSync('supertrader/data/sf-candidates/index.json', 'utf8')));
 *   sf.byTicker.get('MGRC') // { methods: ['C01'], v1: ['C01'], research: [], stage: 'CONFIRMED_RESEARCH_SETUP', ... }
 */
export const SCREENER_EXPORT_VERSION = 'sf-screener-export-1.0.0';
export const INDEX_SCHEMA = 'supertrader-sf8-candidates-1.0.0';
/** V1 = Top 5 (Neustart 04.11.2026, READING-DECISIONS-2026-11-04.json); die übrigen acht sind „in Forschung“. */
export const V1_METHODS = Object.freeze(['C01', 'C02', 'C03', 'C08', 'C12']);
export const STAGE_ORDER = Object.freeze(['CHART_CANDIDATE', 'CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN']);
export const LABEL = 'Research, keine Empfehlung';

const rank = (s) => STAGE_ORDER.indexOf(s);

/**
 * index: veröffentlichter Kandidatenstand. Ergebnis: { meta, criteria, byTicker: Map(ticker -> Spalten) }.
 * Fail closed: falsches Schema, gesperrte Stufe, unbekannte Methode oder Stufe -> Fehler (der Screener baut dann ohne
 * Supertrader-Spalten, nie mit geratenen Werten).
 */
export function screenerColumns(index) {
  if (!index || index.schema !== INDEX_SCHEMA) throw new Error('SF_SCREENER_EXPORT_SCHEMA');
  if (index.status?.validatedTradeSignal !== 'LOCKED_FOR_ALL_13') throw new Error('SF_SCREENER_EXPORT_STATUS');
  const methods = new Map((index.strategies || []).map((s) => [s.candidateId, s]));
  const byTicker = new Map();
  for (const r of index.candidates || []) {
    if (!methods.has(r.c)) throw new Error(`SF_SCREENER_EXPORT_UNKNOWN_METHOD ${r.c}`);
    if (rank(r.s) < 0) throw new Error(`SF_SCREENER_EXPORT_STAGE ${r.s}`);
    const t = String(r.t);
    const x = byTicker.get(t) || { methods: [], v1: [], research: [], stage: null, stageByMethod: {} };
    if (!x.methods.includes(r.c)) {
      x.methods.push(r.c);
      (V1_METHODS.includes(r.c) ? x.v1 : x.research).push(r.c);
    }
    if (!x.stageByMethod[r.c] || rank(r.s) > rank(x.stageByMethod[r.c])) x.stageByMethod[r.c] = r.s;
    if (x.stage === null || rank(r.s) > rank(x.stage)) x.stage = r.s;
    byTicker.set(t, x);
  }
  for (const x of byTicker.values()) { x.methods.sort(); x.v1.sort(); x.research.sort(); }
  return {
    meta: {
      version: SCREENER_EXPORT_VERSION, source: 'supertrader/data/sf-candidates/index.json', asOf: index.asOf, nextSession: index.nextSession,
      label: LABEL, liveReadiness: index.status.liveReadiness, certification: index.status.certification, tickers: byTicker.size, candidates: (index.candidates || []).length,
    },
    // Kriterien für die Oberfläche: Methode (je Kandidat-ID), V1 ja/nein, höchste Stufe
    criteria: {
      methods: [...methods.values()].map((s) => ({ id: s.candidateId, name: s.name, v1: V1_METHODS.includes(s.candidateId), status: V1_METHODS.includes(s.candidateId) ? 'V1' : 'IN_FORSCHUNG' })),
      stages: STAGE_ORDER.map((id) => ({ id, name: index.stageLabels?.[id]?.name ?? id, step: index.stageLabels?.[id]?.step ?? rank(id) + 1 })),
    },
    byTicker,
  };
}
