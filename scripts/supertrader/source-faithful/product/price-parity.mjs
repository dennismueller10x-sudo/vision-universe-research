/**
 * Supertrader 8.0 – zentraler Preisabgleich der Research-Kurse (Aktivierungsvoraussetzung V4, ADR-002).
 *
 * Die Kandidaten rechnen auf den Tagesbalken der technischen Materialisierung (technical-signals-v1, split-adjustiert).
 * Die EINE veröffentlichte Preiswahrheit ist der letzte Punkt der Discover-Tagesreihe
 * (quant/data/market/discover-series/<securityId>.json), gelesen ausschließlich über quant/engines/published-close.js
 * (lastPoint, roundClose). Dieser Abgleich bildet keinen eigenen Kurs und keine eigene Adjustierung.
 *
 * Preisidentität am Stichtag (entscheidet über die Bewertung, FAIL = der Titel wird nicht bewertet):
 *   - Referenzreihe vorhanden, Vertrag von published-close.js erfüllt (echt, Tiingo, SPLIT_ADJUSTED, daily, Währung);
 *   - Identität: securityId der Reihe = core/identity.js-Bildung des Titels, Ticker und Instrument = US-Listing des Titels,
 *     Währung USD (ein ADR wird nie mit dem Heimatlisting verglichen);
 *   - Datum: Stand der Reihe = Stichtag der Kandidaten (weder älter noch neuer – eine neuere Reihe kann seitdem
 *     nachadjustiert sein, ein Vergleich wäre nicht zeitgleich);
 *   - Schluss: roundClose(Schluss am Stichtag) === veröffentlichter Schluss. KEINE Toleranz: die einzige Umformung ist
 *     die Rundungsregel der Veröffentlichung selbst.
 *
 * Rohkurs und adjustierter Kurs: Am letzten Balken sind split-adjustierter und roher Schluss derselbe Wert (Normierung
 * auf den jüngsten Stand, published-close.js). Deshalb ist der gezeigte Schluss am Stichtag der Rohkurs. Frühere Balken
 * sind adjustiert und dürfen sich vom Rohkurs unterscheiden.
 *
 * Verlauf (CAP CHART_CANDIDATE, wenn ungeklärt – Muster, Pivots und Pläne lesen die Historie):
 *   - jede gemeinsame Sitzung muss gleich sein (nach roundClose);
 *   - LEGITIM ist allein die Rundung eines split-adjustierten Werts: die Abweichung ist GENAU eine halbe Rundungseinheit
 *     der Veröffentlichung UND nach dem Datum liegt im Fenster ein Split (Kapitalmaßnahme der Materialisierung). Der
 *     adjustierte Wert endet dann auf einer halben Einheit (z. B. 14,93 / 2 = 7,465), die Erzeuger runden ihn verschieden;
 *   - jede andere Abweichung und jede Sitzung, die nur eine der beiden Reihen hat, ist UNGEKLÄRT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, SOURCES } from './eod-adapter.mjs';

const require = createRequire(import.meta.url);
export const PublishedClose = require(path.join(ROOT, 'quant/engines/published-close.js'));
const Identity = require(path.join(ROOT, 'core/identity.js'));

export const PRICE_PARITY_VERSION = 'sf8-price-parity-1.0.0';
export const PRICE_PARITY = Object.freeze({
  PASS: 'PASS',
  REFERENCE_MISSING: 'PRICE_REFERENCE_MISSING',
  REFERENCE_INVALID: 'PRICE_REFERENCE_INVALID',
  REFERENCE_STALE: 'PRICE_REFERENCE_STALE',
  REFERENCE_AHEAD: 'PRICE_REFERENCE_AHEAD',
  IDENTITY_MISMATCH: 'PRICE_IDENTITY_MISMATCH',
  CLOSE_MISMATCH: 'PRICE_CLOSE_MISMATCH',
});
export const HISTORY_PARITY = Object.freeze({ PASS: 'PASS', ADJUSTMENT_ROUNDING: 'ADJUSTMENT_ROUNDING', UNEXPLAINED: 'UNEXPLAINED' });

/** Referenzreihe eines Titels (nur lesen); null, wenn keine Datei existiert oder sie nicht lesbar ist. */
export function loadPriceReference(securityId, { root = ROOT } = {}) {
  const p = path.join(root, SOURCES.priceReference, `${securityId}.json`);
  if (!fs.existsSync(p)) return null;
  // vorhanden, aber unlesbar ist eine vertragswidrige Referenz, keine fehlende (Review LOW 8)
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { unreadable: true, source: `${SOURCES.priceReference}/${securityId}.json` }; }
}

/** Rundungseinheit der Veröffentlichung für einen Wert (roundClose: ab 1 $ Cent, darunter vier signifikante Stellen). */
export function roundingUnit(x) {
  if (!(x > 0)) return null;
  return x >= 1 ? 0.01 : Number(`1e${Math.floor(Math.log10(x)) - 3}`);
}

const splitDates = (meta) => (meta?.corporateActions || []).filter((c) => (c.flags || []).includes('SPLIT')).map((c) => c.date).sort();

/**
 * Abgleich eines Titels. `security` = Research-Form ({ id, ticker, bars, meta }), `reference` = geladene Discover-Reihe
 * oder null. Rein, deterministisch.
 */
export function priceParity(security, reference, asOf) {
  const bars = security.bars || [], last = bars.at(-1) ?? null;
  const out = (status, detail = {}) => ({ version: PRICE_PARITY_VERSION, status, ...detail });
  if (!reference) return out(PRICE_PARITY.REFERENCE_MISSING, { source: `${SOURCES.priceReference}/${security.id}.json` });
  if (reference.unreadable) return out(PRICE_PARITY.REFERENCE_INVALID, { source: reference.source ?? null, reason: 'UNREADABLE' });
  let expectedId = null; try { expectedId = Identity.securityIdForTicker(security.ticker); } catch { expectedId = null; }
  const idFields = { securityId: reference.securityId ?? null, ticker: reference.ticker ?? null, instrumentId: reference.instrumentId ?? null, currency: reference.currency ?? null };
  if (!expectedId || security.id !== expectedId || reference.securityId !== expectedId || reference.ticker !== security.ticker || reference.instrumentId !== security.ticker || reference.currency !== 'USD') {
    return out(PRICE_PARITY.IDENTITY_MISMATCH, { expected: { securityId: expectedId, ticker: security.ticker, currency: 'USD' }, reference: idFields });
  }
  if (typeof reference.asOf === 'string' && reference.asOf > asOf) return out(PRICE_PARITY.REFERENCE_AHEAD, { referenceAsOf: reference.asOf, asOf });
  const lp = PublishedClose.lastPoint(reference, asOf);
  if (!lp) return out(PRICE_PARITY.REFERENCE_INVALID, { referenceAsOf: reference.asOf ?? null, schema: reference.schemaVersion ?? null, referenceStatus: reference.status ?? null, basis: reference.priceSeriesType ?? null });
  if (lp.date < asOf) return out(PRICE_PARITY.REFERENCE_STALE, { referenceDate: lp.date, asOf });
  if (!last || last.date !== asOf) return out(PRICE_PARITY.REFERENCE_STALE, { referenceDate: lp.date, lastBar: last?.date ?? null, asOf });
  const shown = PublishedClose.roundClose(last.close);
  if (shown !== lp.close) return out(PRICE_PARITY.CLOSE_MISMATCH, { date: asOf, close: last.close, rounded: shown, published: lp.close });
  return out(PRICE_PARITY.PASS, { date: asOf, close: lp.close, basis: lp.basis, history: historyParity(bars, reference, splitDates(security.meta)) });
}

/** Verlauf: gemeinsame Sitzungen gleich, Rundung nach Split legitim, sonst ungeklärt (siehe Kopf). */
export function historyParity(bars, reference, splits = []) {
  const pts = (reference.points || []).map((p) => (Array.isArray(p) ? [String(p[0]).slice(0, 10), p[1]] : [String(p.date).slice(0, 10), p.close]));
  if (!pts.length || !bars.length) return { status: HISTORY_PARITY.UNEXPLAINED, compared: 0, reason: 'NO_OVERLAP' };
  const from = pts[0][0] > bars[0].date ? pts[0][0] : bars[0].date;
  const ref = new Map(pts.filter(([d]) => d >= from)), own = new Map(bars.filter((b) => b.date >= from).map((b) => [b.date, b.close]));
  const onlyReference = [...ref.keys()].filter((d) => !own.has(d)), onlyBars = [...own.keys()].filter((d) => !ref.has(d));
  let compared = 0, rounding = 0; const unexplained = [];
  for (const [d, c] of own) {
    if (!ref.has(d)) continue;
    compared++;
    const p = ref.get(d), r = PublishedClose.roundClose(c);
    if (r === p) continue;
    const unit = roundingUnit(c), splitAfter = splits.some((s) => s > d);
    // genau eine halbe Rundungseinheit: der adjustierte Wert endet auf einer halben Einheit (7,465), die beiden Erzeuger
    // runden den Gleichstand verschieden. In Millionstel Einheiten gemessen, ohne Gleitkomma-Rest. Gemessen 26.10.2026:
    // alle 1.330 Abweichungen vor einem Split liegen genau dort; jede andere Größe ist ungeklärt (Review LOW 7).
    if (unit !== null && typeof p === 'number' && Math.round((Math.abs(p - c) / unit) * 1e6) === 500000 && splitAfter) { rounding++; continue; }
    unexplained.push({ date: d, close: c, published: p });
  }
  const status = unexplained.length || onlyReference.length || onlyBars.length ? HISTORY_PARITY.UNEXPLAINED : rounding ? HISTORY_PARITY.ADJUSTMENT_ROUNDING : HISTORY_PARITY.PASS;
  return { status, compared, adjustmentRounding: rounding, unexplained: unexplained.slice(0, 5), unexplainedCount: unexplained.length, onlyReference: onlyReference.slice(0, 5), onlyBars: onlyBars.slice(0, 5) };
}

/**
 * Nur für historische Wiederholungen (`--as-of`): die Referenzreihe endet am Stichtag. Beide Reihen sind dann auf den
 * HEUTIGEN Stand adjustiert (gleiche Basis), der Vergleich bleibt zeitgleich; der gezeigte Schluss ist aber ein
 * adjustierter Wert, kein Rohkurs (docs/SUPERTRADER_8_PRICE_PARITY_V4.md). Der Tageslauf nutzt das nie.
 */
export function truncateReference(reference, asOf) {
  if (!reference || !Array.isArray(reference.points)) return reference;
  const points = reference.points.filter((p) => String(Array.isArray(p) ? p[0] : p.date).slice(0, 10) <= asOf);
  const lastDate = points.length ? String(Array.isArray(points.at(-1)) ? points.at(-1)[0] : points.at(-1).date).slice(0, 10) : null;
  return { ...reference, points, asOf: lastDate, to: lastDate, replayTruncatedTo: asOf };
}
