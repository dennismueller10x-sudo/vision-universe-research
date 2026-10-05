/* OHLC-Bausteine fuer die Elliott-Datenstudie (Mission VI §17–§29, §86–§89). Keine Engine-Aenderung: die Varianten
   veraendern nur den EINGANG von elliott-3.2.2.

   Kurswelt: SPLIT_ADJUSTED fuer Open, High, Low und Close gemeinsam (Canonical.fromPriceBars aus Rohkurs + splitFactor —
   nie bereinigter Schluss mit unbereinigtem Hoch/Tief, §26).
   Wochen (§27): Open = Open des ersten Handelstags, High = Maximum, Low = Minimum, Close = Schluss des letzten Handelstags,
   Volumen = Summe; nur ABGESCHLOSSENE Wochen bis zum Stichtag (§88/§89). Wochenenden sind keine Luecken (§28).
   HL-Pfad ("Monowellen", Neely, Mastering Elliott Wave Kap. 2/3: Hoch und Tief jeder Periode in der Reihenfolge ihres
   Auftretens): je Bar zwei Punkte. Die Reihenfolge innerhalb der Bar ist ohne Intraday-Daten unbekannt — Annahme:
   Schluss >= Eroeffnung → erst Tief, dann Hoch; sonst erst Hoch, dann Tief. Diese Annahme ist offengelegt und wird im
   Bericht als Unsicherheit gefuehrt. */
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";
const require = createRequire(import.meta.url);
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));

/** Tiingo-/golden-Format {date, open, high, low, close, volume, splitFactor, dividend} → split-bereinigte OHLC-Zeilen. */
export function splitAdjustedRows(bars) {
  const actions = [];
  for (const b of bars) if (b.splitFactor !== undefined && b.splitFactor !== 1) actions.push({ type: "split", exDate: b.date, ratio: b.splitFactor });
  const w = Canonical.fromPriceBars(bars, actions, { instrumentId: "X", source: "licensed-eod", currency: "USD", exchange: "US" });
  const s = w.SPLIT_ADJUSTED;
  return s.timestamps.map((t, i) => ({ date: String(t).slice(0, 10), open: s.open[i], high: s.high[i], low: s.low[i], close: s.close[i], volume: s.volume[i] }));
}
/** Krypto (bereits ohne Splits). */
export function plainRows(bars) { return bars.map((b) => ({ date: String(b.date).slice(0, 10), open: +b.open, high: +b.high, low: +b.low, close: +b.close, volume: b.volume ?? null })); }

const isoWeekKey = (d) => { const t = new Date(d + "T00:00:00Z"), day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day); return t.toISOString().slice(0, 10); };
/** Wochen-OHLC; letzte Woche nur, wenn sie bis `cutoff` abgeschlossen ist (weekEndOk(lastDateOfWeek, cutoff)). */
export function weeklyOHLC(rows, { cutoff = null, completeWeekEnd = null } = {}) {
  const out = [], byWeek = new Map();
  for (const r of rows) {
    if (cutoff && r.date > cutoff) continue;
    const k = isoWeekKey(r.date); let w = byWeek.get(k);
    if (!w) { w = { date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0, first: r.date, last: r.date }; byWeek.set(k, w); out.push(w); }
    else { w.high = Math.max(w.high, r.high); w.low = Math.min(w.low, r.low); w.close = r.close; w.last = r.date; w.date = r.date; w.volume = (w.volume || 0) + (r.volume || 0); }
  }
  if (out.length && completeWeekEnd && out[out.length - 1].last > completeWeekEnd) out.pop();
  return out.map((w) => ({ date: w.date, open: w.open, high: w.high, low: w.low, close: w.close, volume: w.volume }));
}
/** HL-Pfad: zwei Punkte je Bar (Zeitstempel T08/T16 desselben Tages), Wert = Tief/Hoch in angenommener Reihenfolge. */
export function hlPath(rows) {
  const out = [];
  for (const r of rows) {
    const upBar = r.close >= r.open, a = upBar ? r.low : r.high, b = upBar ? r.high : r.low;
    out.push({ timestamp: r.date + "T08:00:00Z", date: r.date, open: a, high: a, low: a, close: a, volume: null });
    out.push({ timestamp: r.date + "T16:00:00Z", date: r.date, open: b, high: b, low: b, close: b, volume: null });
  }
  return out;
}
export function seriesOf(rows, tf, { closeOnly = false, id = "X" } = {}) {
  const rr = closeOnly ? rows.map((r) => ({ timestamp: r.timestamp, date: r.date, open: r.close, high: r.close, low: r.close, close: r.close, volume: null })) : rows;
  return Canonical.fromRows(rr, { instrumentId: id, exchange: "X", currency: "USD", timeframe: tf, priceSeriesType: "SPLIT_ADJUSTED", source: "ohlc-study",
    meta: { closeOnly: closeOnly || rr.every((x) => x.high === x.close && x.low === x.close) } });
}
