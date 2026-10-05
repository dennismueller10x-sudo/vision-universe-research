#!/usr/bin/env node
/* Mission VII — Metadaten-Abgleich fuer Konsens-Faelle (OHNE Inhalte, ohne Labels).

   Fuer jeden der 78 eingefrorenen Faelle werden in den vorhandenen, vollstaendigen Stichprobenrahmen ANDERER Quellenfamilien
   Beitraege gesucht, die dasselbe Instrument (Titel-Alias) im selben Zeitfenster behandeln. Gelesen werden je Fall nur die
   Fallkennung (Quelle|Symbol|Datum|Nr. aus dem Manifest) und – nur fuer geoeffnete Faelle – der Zeitrahmen. Holdout-Zeilen werden
   nie geparst; fuer sie gilt das weite Fenster.

   Fenster (vorab, Nachtrag 7): Tag ±5 Handelstage, sonst ±10; Woche/Monat (und Holdouts, Zeitrahmen versiegelt) ±10, sonst ±20.
   Handelstage: US-Boersenkalender (Mo–Fr) fuer Aktien/ETFs, Kalendertage fuer Krypto (24/7).
   Unabhaengig: andere Quellenfamilie (source-registry sourceFamily); gleiche Familie zaehlt nie.
   Keine Erfolgssuche: Titel werden nur auf Instrument-Aliase geprueft, nicht auf Inhalt.

   node scripts/technical/practitioner/consensus-match.mjs [--out FILE] */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PV1 = join(ROOT, "quant/data/technical-intelligence/practitioner-v1");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };

/* Titel-Aliase je vuSymbol (Wortgrenzen, Gross/Klein egal). Vorab festgelegt; nur Instrumentnamen, keine Inhaltswoerter. */
export const ALIASES = {
  BTCUSD: ["BTC", "BTCUSD", "BTCUSDT", "Bitcoin"], SPY: ["SPY", "SPX", "S&P 500", "S&P500", "SP500", "ES_F", "ES1!", "US500"], QQQ: ["QQQ", "NDX", "Nasdaq", "Nasdaq 100", "Nasdaq-100", "NQ", "NQ1!", "US100"],
  IWM: ["IWM", "Russell", "RUT", "Russell 2000", "RTY"], XAUUSD: ["Gold", "XAUUSD", "XAU", "GLD", "GC1!"], NVDA: ["NVDA", "Nvidia"], TSLA: ["TSLA", "Tesla"], AMD: ["AMD"], MSFT: ["MSFT", "Microsoft"],
  GOOGL: ["GOOGL", "GOOG", "Alphabet", "Google"], COIN: ["COIN", "Coinbase"], MSTR: ["MSTR", "MicroStrategy", "Strategy"], PLTR: ["PLTR", "Palantir"], HOOD: ["HOOD", "Robinhood"], TSM: ["TSM", "TSMC", "Taiwan Semiconductor"],
  ASML: ["ASML"], LLY: ["LLY", "Eli Lilly", "Lilly"], UNH: ["UNH", "UnitedHealth"], DIS: ["DIS", "Disney"], KO: ["KO", "Coca-Cola", "Coca Cola"], MCD: ["MCD", "McDonald's", "McDonalds"], NKE: ["NKE", "Nike"],
  COST: ["COST", "Costco"], V: ["Visa"], JNJ: ["JNJ", "Johnson & Johnson"], F: ["Ford"], CAT: ["CAT", "Caterpillar"], AXP: ["AXP", "American Express"], NEE: ["NEE", "NextEra"], RCL: ["RCL", "Royal Caribbean"],
  ABNB: ["ABNB", "Airbnb"], ZM: ["ZM", "Zoom"], FCX: ["FCX", "Freeport"], PHM: ["PHM", "PulteGroup", "Pulte"], OLN: ["OLN", "Olin"], HL: ["Hecla"], RGLD: ["RGLD", "Royal Gold"], HSY: ["HSY", "Hershey"],
  DXCM: ["DXCM", "Dexcom"], RBLX: ["RBLX", "Roblox"], NU: ["Nu Holdings", "Nubank"], QS: ["QuantumScape"], GPN: ["GPN", "Global Payments"], IT: ["Gartner"]
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const aliasRe = (sym) => new RegExp("(^|[^A-Za-z0-9])(" + (ALIASES[sym] || [sym]).map(esc).join("|") + ")(?=$|[^A-Za-z0-9])", ALIASES[sym] && sym.length > 2 ? "i" : "");
/* Kurze Ticker (≤ 2 Zeichen oder Woerter wie "V", "F", "IT", "KO", "CAT") nur ueber eindeutige Namen; Gross/Klein relevant fuer Ticker. */
export function titleMatches(sym, title) {
  const al = ALIASES[sym] || [sym];
  return al.some((a) => {
    const ci = /[a-z]/.test(a) || a.length > 3;   // Namen und lange Ticker case-insensitiv, kurze Ticker exakt
    return new RegExp("(^|[^A-Za-z0-9])" + esc(a) + "(?=$|[^A-Za-z0-9])", ci ? "i" : "").test(title);
  });
}
const CRYPTO = new Set(["BTCUSD"]);
export function tradingDaysBetween(a, b, crypto) {
  const t0 = Date.parse(a + "T00:00:00Z"), t1 = Date.parse(b + "T00:00:00Z");
  if (crypto) return Math.round((t1 - t0) / 864e5);
  const s = Math.sign(t1 - t0); let n = 0;
  for (let t = t0; s > 0 ? t < t1 : t > t1; t += s * 864e5) { const d = new Date(t + s * 864e5).getUTCDay(); if (d !== 0 && d !== 6) n += s; }
  return n;
}
export const WINDOWS = { "1D": [5, 10], "1W": [10, 20], "1M": [10, 20], SEALED: [10, 20] };

export function loadFrames() {
  const reg = JSON.parse(readFileSync(join(PV1, "source-registry.json"), "utf8"));
  const fam = Object.fromEntries((reg.sources || reg).map((s) => [s.sourceId, s.sourceFamily || s.sourceId]));
  /* alle Rahmen aus frames/ (Nachtrag 5) und consensus/frames/ (Nachtrag 7 b: weitere qualifizierte TradingView-Autoren) */
  const dirs = [join(PV1, "frames"), join(PV1, "consensus/frames")].filter((d) => existsSync(d));
  const files = dirs.flatMap((d) => readdirSync(d).filter((x) => x.endsWith(".json")).map((x) => join(d, x)));
  const items = [];
  for (const path of files) {
    const f = basename(path, ".json");
    if (!fam[f]) fam[f] = f;   // neue TradingView-Autoren: eigene Familie tv-<autor>
    const j = JSON.parse(readFileSync(path, "utf8"));
    for (const it of j.items) items.push({ sourceId: f, family: fam[f] || f, url: it[0], date: String(it[1]).slice(0, 10), title: it[2], meta: it[3] || null, access: /hkcm/.test(f) ? "YOUTUBE_BLOCKED" : "PUBLIC" });
  }
  return { items, fam };
}
export function matchCase(c, items, fam) {
  const [sourceId, sym, date] = c.caseId.split("|"), own = fam[sourceId] || sourceId, crypto = CRYPTO.has(sym);
  const w = WINDOWS[c.sealed ? "SEALED" : c.timeframe] || WINDOWS["1W"];
  /* TradingView: das Symbol steht im Pfad /chart/<SYMBOL>/ — zaehlt wie ein Titel-Alias */
  const symOf = (u) => { const m = /\/chart\/([^/]+)\//.exec(u || ""); return m ? m[1] : ""; };
  const cands = items.filter((it) => it.family !== own && (titleMatches(sym, it.title) || titleMatches(sym, symOf(it.url)))).map((it) => Object.assign({}, it, { lag: tradingDaysBetween(date, it.date, crypto) }));
  let used = w[0], hits = cands.filter((x) => Math.abs(x.lag) <= w[0]);
  if (!hits.length) { used = w[1]; hits = cands.filter((x) => Math.abs(x.lag) <= w[1]); }
  /* je Fremdfamilie die zeitlich naechste Fundstelle (bei Gleichstand die fruehere) */
  const byFam = {};
  for (const h of hits.sort((a, b) => Math.abs(a.lag) - Math.abs(b.lag) || a.lag - b.lag)) if (!byFam[h.family]) byFam[h.family] = h;
  return { caseId: c.caseId, sealed: c.sealed, timeframe: c.sealed ? "SEALED" : c.timeframe, windowTradingDays: used, windowRule: w, candidatesInWindow: hits.length, families: Object.keys(byFam).length,
           nearestPerFamily: Object.values(byFam).map((h) => ({ sourceId: h.sourceId, family: h.family, url: h.url, date: h.date, title: h.title, lag: h.lag, access: h.access, meta: h.meta })) };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const man = JSON.parse(readFileSync(join(PV1, "freeze/PRACTITIONER_REFERENCE_V1.manifest.json"), "utf8")), byCase = man.splits.byCase;
  const open = new Set(Object.keys(byCase).filter((c) => !byCase[c].startsWith("HOLDOUT")));
  const tf = {};
  for (const line of readFileSync(join(PV1, "freeze/PRACTITIONER_REFERENCE_V1.jsonl"), "utf8").split("\n")) {
    const m = /"caseId":"([^"]+)"/.exec(line); if (!m || !open.has(m[1])) continue;   // Holdout-Zeilen nie parsen
    const r = JSON.parse(line); if (r.viewKind !== "LATER_REVISION") tf[r.caseId] = r.timeframe;
  }
  const { items, fam } = loadFrames();
  const cases = Object.keys(byCase).sort().map((c) => matchCase({ caseId: c, sealed: !open.has(c), timeframe: tf[c] }, items, fam));
  const out = { schemaVersion: "vu-consensus-match-1.0.0", generatedAt: new Date().toISOString(), freezeSha256: man.sha256, windows: WINDOWS, frames: [...new Set(items.map((x) => x.sourceId))],
    note: "Nur Metadaten (Titel, Datum, Quelle). Keine Inhalte gelesen. Holdout-Faelle: nur Fallkennung, Ergebnisse versiegelt bis zur Freigabe.", cases };
  const f = arg("out", join(PV1, "consensus/match-candidates.json")); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(out, null, 1) + "\n");
  const by = (a, g) => a.reduce((o, x) => { const k = g(x); o[k] = (o[k] || 0) + 1; return o; }, {});
  console.log(JSON.stringify({ cases: cases.length, withAny: cases.filter((x) => x.families > 0).length, familiesHist: by(cases, (x) => x.families), window: by(cases, (x) => x.windowTradingDays),
    openWithAny: cases.filter((x) => !x.sealed && x.families > 0).length, sealedWithAny: cases.filter((x) => x.sealed && x.families > 0).length,
    accessiblePublic: cases.filter((x) => x.nearestPerFamily.some((h) => h.access === "PUBLIC")).length, famHits: by(cases.flatMap((x) => x.nearestPerFamily), (h) => h.family + ":" + h.access) }, null, 1));
}
