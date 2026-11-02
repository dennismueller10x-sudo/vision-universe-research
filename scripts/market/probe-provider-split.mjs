/* =========================================================================
   VISION UNIVERSE — scripts/market/probe-provider-split.mjs

   Gezielte, nur lesende Anbieterabfrage zur Klaerung einer vermuteten
   Kapitalmassnahme (Owner-Freigabe 30.10.2026, GIBO). GENAU EINE Anfrage
   an Tiingo (Tagesbalken eines Kuerzels in einem Datumsfenster); gibt die
   Rohspalten aus, die die Split-Bereinigung liest (splitFactor, open, close,
   volume, adjClose). Schreibt nichts ins Repository, keine Ablage, keinen
   Cache; der Schluessel wird nie ausgegeben.
   Aufruf: TIINGO_API_KEY=... node scripts/market/probe-provider-split.mjs GIBO 2026-06-15 2026-07-10 [out.json]
   ========================================================================= */
import { writeFileSync } from "node:fs";

const [ticker, from, to, out] = process.argv.slice(2);
if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker || "") || !/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) {
  console.error("Aufruf: probe-provider-split.mjs <TICKER> <von> <bis> [out.json]"); process.exit(2);
}
const key = process.env.TIINGO_API_KEY;
if (!key) { console.error("TIINGO_API_KEY fehlt"); process.exit(2); }
const url = "https://api.tiingo.com/tiingo/daily/" + encodeURIComponent(ticker.toLowerCase()) + "/prices?startDate=" + from + "&endDate=" + to + "&format=json";
const res = await fetch(url, { headers: { Authorization: "Token " + key, "Content-Type": "application/json" } });
console.log("Anfragen: 1 · HTTP " + res.status + " · " + ticker + " " + from + ".." + to);
if (!res.ok) process.exit(1);
const rows = await res.json();
const pick = rows.map((r) => ({ date: String(r.date).slice(0, 10), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, splitFactor: r.splitFactor, adjClose: r.adjClose, divCash: r.divCash }));
for (const r of pick) console.log([r.date, "O", r.open, "H", r.high, "L", r.low, "C", r.close, "V", r.volume, "split", r.splitFactor, "adjC", r.adjClose].join(" "));
const splits = pick.filter((r) => r.splitFactor !== 1);
console.log("splitFactor != 1: " + (splits.length ? splits.map((r) => r.date + " " + r.splitFactor).join(", ") : "keiner"));
if (out) writeFileSync(out, JSON.stringify({ ticker, from, to, requestedAt: new Date().toISOString(), requests: 1, rows: pick }, null, 1));
