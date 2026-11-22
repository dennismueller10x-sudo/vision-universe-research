/* =========================================================================
   VU Technical Intelligence — Leitmaerkte fuer Elliott (Elliott-Neustart Schritt 2, Owner 22.11.2026)

   Indizes (ueber ETFs: kein lizenzierter Indexkurs ohne Zukauf), Krypto, Edelmetalle und Energie aus den
   vorhandenen Multi-Asset-Reihen (quant/data/market/multi-asset/series, Datenzweig marketPulse). Keine neue
   Quelle, kein neuer Anbieter. Dieselbe Produktanalyse wie fuer Aktien (Wochenschluss), eigene Ablage
   v3/markets/<ID>.json.gz, damit Aktien-Shards, Registry-Identitaet und Discover-Reihen unberuehrt bleiben.

   ID: eigenes Kuerzel je Markt. WTI und BRENT heissen USOIL/UKOIL, weil „WTI“ eine Aktie ist (W&T Offshore).
   Nikkei 225 (FRED, CITATION_REQUIRED) und Reihen ohne Datei bleiben aussen vor.
   ========================================================================= */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, weeklySeriesFromPoints } from "./ti-data.mjs";

export const MARKETS_VERSION = "elliott-markets-1.0.0";
/** Reihenfolge = Anzeige auf der Elliott-Startseite. group: index | crypto | metal | energy. */
export const MARKETS = [
  { id: "SPY", src: "SPY", name: "S&P 500", via: "SPDR S&P 500 ETF (SPY)", group: "index" },
  { id: "QQQ", src: "QQQ", name: "Nasdaq 100", via: "Invesco QQQ (QQQ)", group: "index" },
  { id: "DIA", src: "DIA", name: "Dow Jones", via: "SPDR Dow Jones ETF (DIA)", group: "index" },
  { id: "IWM", src: "IWM", name: "Russell 2000", via: "iShares Russell 2000 ETF (IWM)", group: "index" },
  { id: "FEZ", src: "FEZ", name: "Euro Stoxx 50", via: "SPDR Euro Stoxx 50 ETF (FEZ, in USD)", group: "index" },
  { id: "URTH", src: "URTH", name: "MSCI World", via: "iShares MSCI World ETF (URTH)", group: "index" },
  { id: "EEM", src: "EEM", name: "Schwellenländer", via: "iShares MSCI Emerging Markets ETF (EEM)", group: "index" },
  { id: "BTCUSD", src: "BTCUSD", name: "Bitcoin", via: "BTC/USD", group: "crypto" },
  { id: "ETHUSD", src: "ETHUSD", name: "Ethereum", via: "ETH/USD", group: "crypto" },
  { id: "SOLUSD", src: "SOLUSD", name: "Solana", via: "SOL/USD", group: "crypto" },
  { id: "XRPUSD", src: "XRPUSD", name: "XRP", via: "XRP/USD", group: "crypto" },
  { id: "XAUUSD", src: "XAUUSD", name: "Gold", via: "Gold in USD je Unze", group: "metal" },
  { id: "XAGUSD", src: "XAGUSD", name: "Silber", via: "Silber in USD je Unze", group: "metal" },
  { id: "USOIL", src: "WTI", name: "Öl WTI", via: "WTI Spot in USD je Barrel (EIA)", group: "energy" },
  { id: "UKOIL", src: "BRENT", name: "Öl Brent", via: "Brent Spot in USD je Barrel (EIA)", group: "energy" },
  { id: "NATGAS", src: "NATGAS", name: "Erdgas", via: "Henry Hub Spot in USD je MMBtu (EIA)", group: "energy" }
];
export const MARKET_IDS = new Set(MARKETS.map((m) => m.id));
export const MARKETS_DIR = "quant/data/market/multi-asset/series";

/** ISO-Woche (Montag als Wochenbeginn) eines Datums JJJJ-MM-TT, als Schluessel des Montags. */
function weekKey(iso) {
  const d = new Date(iso + "T00:00:00Z"), wd = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - wd * 86400000).toISOString().slice(0, 10);
}
/** Tagesbeobachtungen -> Wochenschluesse: letzte Beobachtung Montag bis Freitag je Woche (Wochenenden, z. B. Krypto,
    zaehlen nicht: derselbe Wochenschluss wie bei Aktien). Nur endliche, positive Werte. */
export function weeklyPoints(points) {
  const out = [];
  for (const p of points || []) {
    if (!Array.isArray(p) || typeof p[0] !== "string" || !(typeof p[1] === "number" && Number.isFinite(p[1]) && p[1] > 0)) continue;
    const wd = new Date(p[0] + "T00:00:00Z").getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const k = weekKey(p[0]);
    if (out.length && out[out.length - 1].k === k) out[out.length - 1] = { k, p: [p[0], p[1]] };
    else if (!out.length || out[out.length - 1].k < k) out.push({ k, p: [p[0], p[1]] });
  }
  return out.map((x) => x.p);
}

/** Wochenserie eines Marktes (oder null, wenn die Reihe fehlt). */
export function marketSeries(m, root = ROOT) {
  const f = join(root, MARKETS_DIR, m.src + ".json");
  if (!existsSync(f)) return null;
  const j = JSON.parse(readFileSync(f, "utf8"));
  if (j.valueSemantics && j.valueSemantics !== "PRICE") return null;
  const series = weeklySeriesFromPoints(weeklyPoints(j.points), m.id);
  series.corporateActions = null;
  return { series, source: { file: MARKETS_DIR + "/" + m.src + ".json", provider: j.source || null, attribution: j.attribution || null, to: j.to || null, currency: j.currency || "USD" } };
}
