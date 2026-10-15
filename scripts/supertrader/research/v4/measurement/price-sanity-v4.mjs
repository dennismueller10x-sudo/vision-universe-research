/**
 * V4 price-sanity classification for adjusted price levels above 1e6 (V3 adversarial finding A9, R10 census: 74 securities).
 *
 * No clamping. Each affected security is classified from its own raw bars and declared corporate-action fields.
 * Only classes that prove a data defect lead to an exclusion, and that exclusion is a counted data quarantine
 * from the first defective event; genuine adjusted levels (serial reverse splits) stay in the universe.
 * A pre-registered sensitivity without all affected securities is reported regardless of the class.
 */
export const PRICE_SANITY_V4_VERSION = '1.0.0';
export const ADJUSTED_LEVEL_THRESHOLD = 1e6; // the V3 R10 census threshold, unchanged
export const GENUINE_RAW_NOMINAL_FLOOR = 1e5; // raw quotes above this are only plausible for a handful of US issues
// A declared split must move the raw quote: the raw close after the event must lie within a factor of 2 of
// (raw close before / split ratio). A factor of 2 tolerates ordinary one-day moves around the event.
export const SPLIT_CONSISTENCY_BAND = 2;
// An undeclared raw jump of at least this ratio in one session (in either direction) is a unit or scale change.
export const UNIT_JUMP_RATIO = 50;
const US_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'NYSE MKT', 'NYSE ARCA', 'AMEX', 'BATS', 'NYSEAMERICAN', 'NYSE AMERICAN', 'CBOE', 'IEX', 'NMS', 'NGM', 'NCM', 'NYQ', 'NAS']);

export const PRICE_SANITY_CLASSES = Object.freeze([
  'GENUINE_HIGH_NOMINAL_PRICE',
  'GENUINE_ADJUSTED_LEVEL_SERIAL_REVERSE_SPLITS',
  'SPLIT_ARTIFACT',
  'UNIT_ISSUE',
  'CURRENCY_ISSUE',
  'STALE_OR_UNADJUSTED',
  'TICKER_IDENTITY',
  'SOURCE_ERROR',
]);
const DEFECT_CLASSES = new Set(['SPLIT_ARTIFACT', 'UNIT_ISSUE', 'CURRENCY_ISSUE', 'STALE_OR_UNADJUSTED', 'TICKER_IDENTITY', 'SOURCE_ERROR']);
export const isDefectClass = (c) => DEFECT_CLASSES.has(c);

export function exchangeOf(security) {
  const id = security?.listing?.id;
  if (typeof id !== 'string') return null;
  const parts = id.split(':');
  return parts.length >= 4 ? parts[1].toUpperCase() : null;
}

/**
 * Classifies one security. Bars must carry rawClose/close/splitFactor/volume (canonical V3 bar shape).
 * Returns null when the adjusted level never exceeds the threshold.
 */
export function classifyPriceLevel(security) {
  const bars = security?.bars ?? [];
  const maxAdjusted = bars.reduce((m, b) => Math.max(m, Number.isFinite(b.close) ? b.close : 0), 0);
  if (!(maxAdjusted > ADJUSTED_LEVEL_THRESHOLD)) return null;
  const evidence = { maxAdjusted, maxRaw: bars.reduce((m, b) => Math.max(m, b.rawClose ?? 0), 0), declaredSplits: 0, inconsistentSplits: 0, undeclaredUnitJumps: 0, reverseSplits: 0, firstDefectDate: null };
  let firstDefect = null;
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1], b = bars[i];
    if (!(prev.rawClose > 0 && b.rawClose > 0)) continue;
    const declared = Number.isFinite(b.splitFactor) && b.splitFactor > 0 && b.splitFactor !== 1;
    if (declared) {
      evidence.declaredSplits++;
      if (b.splitFactor < 1) evidence.reverseSplits++;
      const expected = prev.rawClose / b.splitFactor, ratio = b.rawClose / expected;
      if (!(ratio <= SPLIT_CONSISTENCY_BAND && ratio >= 1 / SPLIT_CONSISTENCY_BAND)) { evidence.inconsistentSplits++; firstDefect ??= { date: b.date, cls: 'SPLIT_ARTIFACT' }; }
    } else {
      const jump = b.rawClose / prev.rawClose;
      if (jump >= UNIT_JUMP_RATIO || jump <= 1 / UNIT_JUMP_RATIO) { evidence.undeclaredUnitJumps++; firstDefect ??= { date: b.date, cls: 'UNIT_ISSUE' }; }
    }
  }
  const exchange = exchangeOf(security);
  let cls;
  if (security.listing?.reusedLater === true && firstDefect) cls = 'TICKER_IDENTITY';
  else if (firstDefect) cls = firstDefect.cls;
  else if (exchange && !US_EXCHANGES.has(exchange)) cls = 'CURRENCY_ISSUE';
  else if (evidence.maxRaw >= GENUINE_RAW_NOMINAL_FLOOR && evidence.declaredSplits === 0) cls = 'GENUINE_HIGH_NOMINAL_PRICE';
  else if (evidence.reverseSplits > 0) cls = 'GENUINE_ADJUSTED_LEVEL_SERIAL_REVERSE_SPLITS';
  else if (evidence.maxRaw > ADJUSTED_LEVEL_THRESHOLD) cls = 'STALE_OR_UNADJUSTED';
  else cls = 'SOURCE_ERROR';
  evidence.firstDefectDate = firstDefect?.date ?? null;
  return { id: security.id, cls, defect: isDefectClass(cls), exchange, evidence };
}

/** Census over a dataset: counts by class (public) and the defect quarantine list (private). */
export function priceSanityCensus(securities) {
  const rows = securities.map(classifyPriceLevel).filter(Boolean);
  const byClass = Object.fromEntries(PRICE_SANITY_CLASSES.map((c) => [c, rows.filter((r) => r.cls === c).length]));
  return {
    schema: 'supertrader-v4-price-sanity-census-1.0.0', version: PRICE_SANITY_V4_VERSION, threshold: ADJUSTED_LEVEL_THRESHOLD,
    affected: rows.length, byClass, defectQuarantined: rows.filter((r) => r.defect).length,
    privateRows: rows,
  };
}

/** Applies the defect quarantine: bars from the first defective event onward are cut, a data quarantine is recorded. */
export function applyPriceSanityQuarantine(data, census) {
  const defects = new Map(census.privateRows.filter((r) => r.defect).map((r) => [r.id, r]));
  let quarantined = 0, removed = 0;
  const securities = [];
  for (const s of data.securities) {
    const row = defects.get(s.id);
    if (!row) { securities.push(s); continue; }
    const cut = row.evidence.firstDefectDate ? s.bars.findIndex((b) => b.date >= row.evidence.firstDefectDate) : 0;
    const bars = cut < 0 ? s.bars : s.bars.slice(0, cut);
    if (bars.length < 2) { removed++; continue; }
    quarantined++;
    const from = s.dataQuarantine?.from && s.dataQuarantine.from < (row.evidence.firstDefectDate ?? bars.at(-1).date) ? s.dataQuarantine.from : (row.evidence.firstDefectDate ?? bars.at(-1).date);
    securities.push({ ...s, bars, dataQuarantine: { from, observedAt: row.evidence.firstDefectDate ?? from, reason: 'V4_PRICE_SANITY_' + row.cls, confidence: 'LOW' } });
  }
  return { data: { ...data, securities }, audit: { quarantined, removedInsufficientBars: removed } };
}
