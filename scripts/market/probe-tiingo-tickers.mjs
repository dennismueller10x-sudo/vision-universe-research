#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — probe-tiingo-tickers.mjs

   Fuehrt Tiingo einen Ticker, und seit wann bis wann? (Tickerwechsel, Boersenwechsel, Anbieterluecken;
   Steuerung 17.11.2026, erster Fall TCBI -> TXCP an der Texas Stock Exchange.)

   Je Ticker zwei Anfragen: /tiingo/daily/<t> (Metadaten) und /tiingo/daily/<t>/prices ab --since (Tageskerzen).
   Ausgegeben werden NUR Metadaten (Name, Boerse, Start, Ende) und Zaehlungen (Kerzen, erste und letzte Sitzung) -
   keine Kurse: die Weitergabe von Anbieterkursen ist nicht Teil dieses Abrufs. Schreibt nichts ins Repository.

   Ausfuehren (Schluessel nur aus der Umgebung):
     TIINGO_API_KEY=... TICKERS="TXCP,TCBI" node scripts/market/probe-tiingo-tickers.mjs [--since JJJJ-MM-TT] [--out bericht.json]
   ========================================================================= */
import { writeFileSync } from "node:fs";

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;
export const MAX_TICKERS = 25;

/** Tickerliste aus der Umgebung: Komma oder Leerzeichen, gross, eindeutig, gueltig, hoechstens MAX_TICKERS. */
export function parseTickers(text) {
  const list = [...new Set(String(text || "").split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const bad = list.filter((t) => !TICKER.test(t));
  if (bad.length) throw new Error("UNGUELTIGE_TICKER: " + bad.join(", "));
  if (!list.length) throw new Error("KEINE_TICKER");
  if (list.length > MAX_TICKERS) throw new Error("ZU_VIELE_TICKER: " + list.length + " > " + MAX_TICKERS);
  return list;
}

/** Bericht je Ticker aus den zwei Antworten (testbar ohne Netz). Keine Kurse im Ergebnis. */
export function summarize(ticker, meta, prices) {
  const out = { ticker, known: meta.status === 200, metaStatus: meta.status, pricesStatus: prices.status };
  if (meta.status === 200 && meta.body && typeof meta.body === "object") {
    out.name = meta.body.name ?? null; out.exchange = meta.body.exchangeCode ?? null;
    out.startDate = meta.body.startDate ?? null; out.endDate = meta.body.endDate ?? null;
  }
  const rows = prices.status === 200 && Array.isArray(prices.body) ? prices.body : [];
  const dates = rows.map((r) => String(r.date || "").slice(0, 10)).filter(Boolean).sort();
  out.bars = rows.length; out.firstSession = dates[0] || null; out.lastSession = dates.at(-1) || null;
  return out;
}

async function get(url, key) {
  const r = await fetch(url, { headers: { Authorization: "Token " + key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) });
  let body = null; try { body = await r.json(); } catch (e) { body = null; }
  return { status: r.status, body };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const key = process.env.TIINGO_API_KEY;
  if (!key) { console.log("Kein TIINGO_API_KEY - kein Abruf."); process.exitCode = 2; return; }
  const tickers = parseTickers(process.env.TICKERS);
  const since = arg("--since", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("--since JJJJ-MM-TT");
  const base = "https://api.tiingo.com/tiingo/daily/";
  const report = { checkedAt: new Date().toISOString(), since, results: [] };
  for (const t of tickers) {
    const sym = encodeURIComponent(t.toLowerCase());
    const meta = await get(base + sym, key);
    const prices = await get(base + sym + "/prices?startDate=" + since, key);
    const s = summarize(t, meta, prices);
    report.results.push(s);
    console.log([t.padEnd(8), s.known ? "bekannt" : "unbekannt(" + s.metaStatus + ")", s.exchange || "-", (s.startDate || "-").slice(0, 10) + ".." + (s.endDate || "-").slice(0, 10),
      "Kerzen seit " + since + ": " + s.bars + (s.bars ? " (" + s.firstSession + " .. " + s.lastSession + ")" : ""), s.name || ""].join("  "));
  }
  if (arg("--out")) writeFileSync(arg("--out"), JSON.stringify(report, null, 1) + "\n");
}

if (process.argv[1] && process.argv[1].endsWith("probe-tiingo-tickers.mjs")) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
