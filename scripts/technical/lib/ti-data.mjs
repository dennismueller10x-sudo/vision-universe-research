/* VU Technical Intelligence — Datenlader fuer Build, Evidence und Tests.

   Zwei Eingangsformen, beide vendor-neutral uebersetzt:
     1. Tagesbalken (Rohkurs + splitFactor + dividend je Bar, Format der
        kanonischen Historie bzw. golden-preview) → SPLIT_ADJUSTED via
        Canonical.fromPriceBars (Splits aus den Bars rekonstruiert, die
        bereinigte Spalte des Anbieters wird nicht gelesen).
     2. Wochenschluesse (discover-series-long: [[datum, close], …],
        split-bereinigt) → Serie mit O=H=L=C. Kein Volumen, keine Spanne:
        alle Engines laufen, Volumen-/Spannen-Befunde sind UNAVAILABLE. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));

export function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }

export function dailySeriesFromPayload(payload, instrumentId) {
  const bars = payload.bars || [];
  const actions = [];
  for (const b of bars) {
    if (b.splitFactor !== undefined && b.splitFactor !== 1) actions.push({ type: "split", exDate: b.date, ratio: b.splitFactor });
    if (Number.isFinite(b.dividend) && b.dividend > 0) actions.push({ type: "dividend", exDate: b.date, amount: b.dividend });
  }
  const worlds = Canonical.fromPriceBars(bars, actions, { instrumentId: instrumentId || payload.ticker, source: payload.provider ? "licensed-eod" : "unknown",
    sourceRevision: payload.updatedAt || payload.last || null, currency: payload.currency || "USD", exchange: payload.exchange || "US" });
  return worlds.SPLIT_ADJUSTED;
}

export function weeklySeriesFromPoints(points, instrumentId) {
  const rows = points.filter((p) => Array.isArray(p) && Number.isFinite(p[1]) && p[1] > 0)
    .map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null }));
  return Canonical.fromRows(rows, { instrumentId, exchange: "US", currency: "USD", timeframe: "1W", priceSeriesType: "SPLIT_ADJUSTED",
    source: "weekly-close", sourceRevision: rows.length ? rows[rows.length - 1].date : null, meta: { closeOnly: true } });
}

export function loadGoldenDaily(ticker) {
  return dailySeriesFromPayload(readJson(join(ROOT, "quant/data/market/golden-preview/daily/ref_" + ticker + ".json")), ticker);
}
export function loadWeekly(securityId) {
  const j = readJson(join(ROOT, "quant/data/market/discover-series-long", securityId + ".json"));
  return weeklySeriesFromPoints(j.points || [], j.ticker || securityId);
}

/* ---- Elliott 4.0 (Elliott-Neustart Schritt 3, Owner 22.11.2026): Wochenkerzen als Seitenkanal fuer Elliott.
   Quelle: quant/data/product/technical-signals-v1/<Shard>.json.gz → history.weekly (Hoch/Tief/Eroeffnung, split-bereinigt,
   dieselben Wochendaten wie discover-series-long). Die Serie selbst bleibt die Schlusskurs-Reihe (Preiswahrheit, ATR, Szenarien
   unveraendert); nur series.extremes = { open, high, low } kommt hinzu. Elliott (elliott-v3.js, cfg.extremes) legt Wellenenden
   damit an Hoch und Tief; das Chartbild zeigt Kerzen. Fehlt die Kerze einer Woche oder passt sie nicht zum Schluss, gilt dort der
   Schlusskurs (O=H=L=C). Unter 80 % Abdeckung kein Seitenkanal. */
import { existsSync as _exists } from "node:fs";
import { gunzipSync as _gunzip } from "node:zlib";
const Identity = require(join(ROOT, "core/identity.js"));
export const SIGNALS_DIR = "quant/data/product/technical-signals-v1";
const _signalShards = new Map();
function _signalShard(key, root) {
  const f = join(root, SIGNALS_DIR, key + ".json.gz");
  if (!_signalShards.has(f)) {
    let v = null; try { if (_exists(f)) v = JSON.parse(_gunzip(readFileSync(f)).toString("utf8")).instruments || null; } catch { v = null; }
    _signalShards.set(f, v);
    if (_signalShards.size > 4) _signalShards.delete(_signalShards.keys().next().value);   // Speicher: Titel kommen sortiert, wenige Shards genuegen
  }
  return _signalShards.get(f);
}
/** Wochenkerzen eines Titels aus der Materialisierung (oder null). Shard wie die Materialisierung: Identity.shardKey, Vorzugsaktien „X-“. */
export function weeklyBarsFor(ticker, root = ROOT) {
  const t = String(ticker || "").toUpperCase();
  for (const key of [Identity.shardKey(t), t.charAt(0) + "-"]) {
    const ins = _signalShard(key, root), w = ins && ins[t] && ins[t].history && ins[t].history.weekly;
    if (w && Array.isArray(w.timestamps) && Array.isArray(w.high) && Array.isArray(w.low)) return w;
  }
  return null;
}
/** Haengt series.extremes an (gleiche Laenge wie die Serie) oder laesst die Serie unveraendert. Gibt die Abdeckung zurueck. */
export function attachWeeklyExtremes(series, ticker, root = ROOT) {
  const w = weeklyBarsFor(ticker, root);
  if (!w || !series || !series.length) return 0;
  const at = new Map(w.timestamps.map((d, i) => [d, i]));
  const n = series.length, open = new Array(n), high = new Array(n), low = new Array(n);
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const c = series.close[i], k = at.get(series.timestamps[i]);
    const h = k === undefined ? null : w.high[k], l = k === undefined ? null : w.low[k], o = k === undefined ? null : w.open && w.open[k];
    /* Kerze passt zum Schluss: Schluss liegt (mit 0,5 % Rundungsspiel) zwischen Tief und Hoch */
    if (Number.isFinite(h) && Number.isFinite(l) && l > 0 && h >= l && c <= h * 1.005 && c >= l * 0.995) {
      high[i] = Math.max(h, c); low[i] = Math.min(l, c); open[i] = Number.isFinite(o) ? Math.min(high[i], Math.max(low[i], o)) : c; hit++;
    } else { high[i] = c; low[i] = c; open[i] = c; }
  }
  const cov = hit / n;
  if (cov >= 0.8) series.extremes = { open, high, low, coverage: Math.round(cov * 1000) / 1000, source: SIGNALS_DIR };
  return cov;
}
