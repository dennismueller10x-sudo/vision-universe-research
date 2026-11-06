#!/usr/bin/env node
/* Analysten-Konsens fuer das Produktuniversum (Strang A, 06.11.2026).

   Quelle (kostenlos, Messung Lauf 42159861609): Finnhub /stock/recommendation - Einstufungs-Zaehlung je Monat
   (strongBuy, buy, hold, sell, strongSell). Kursziele gibt es kostenlos nur fuer eine kleine Liste grosser Titel
   (FMP /stable/price-target-consensus, sonst HTTP 402); sie werden genau dort gefuehrt und sonst als
   NO_FREE_SOURCE benannt. Kein eigenes Urteil: gespeichert wird die Zaehlung mit Quelle und Stand.

   Rotation: je Lauf die faelligsten Titel (nie abgefragt zuerst, dann der aelteste Abruf), Drossel je Minute.
   FMP wird je Titel hoechstens alle 30 Tage gefragt; ein 402 merkt sich der Eintrag (targetState PAYWALLED).

   Ausgabe (--out, Standard dashboard/data/analysts):
     shards/<shardKey>.json   Eintraege je Titel (core/identity.js#shardKey), Schluessel securityId
     summary.json             Abdeckung: Titel, mit Einstufung, mit Kursziel, Median Analysten, aeltester Abruf

   Aufruf: node scripts/analysts/fetch-consensus.mjs [--out <dir>] [--max-titles 1000] [--per-minute 55]
           [--fmp-max 200] [--max-minutes 40] [--today YYYY-MM-DD]
   Schluessel: FINNHUB_API_KEY (Kopf X-Finnhub-Token), FMP_API_KEY (optional; Abfrageparameter, nie ausgegeben). */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolveProductUniverse } from "../market/universe-source.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Identity = require(join(ROOT, "core", "identity.js"));
export const SCHEMA = "vu-analyst-consensus-1";
export const HISTORY = 6;
export const FMP_RETRY_DAYS = 30;
const COUNTS = ["strongBuy", "buy", "hold", "sell", "strongSell"];

/** Finnhub-Antwort -> Eintrag ohne Urteil (Zaehlung der neuesten Periode, Verlauf bis HISTORY). */
export function fromRecommendation(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.period)))
    .sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, HISTORY)
    .map((r) => Object.assign({ period: r.period }, Object.fromEntries(COUNTS.map((k) => [k, Math.max(0, Math.trunc(Number(r[k]) || 0))]))));
  const latest = list[0];
  const analysts = latest ? COUNTS.reduce((s, k) => s + latest[k], 0) : 0;
  return analysts > 0
    ? { ratingsState: "AVAILABLE", asOf: latest.period, analysts, counts: Object.fromEntries(COUNTS.map((k) => [k, latest[k]])), history: list }
    : { ratingsState: "NO_COVERAGE", asOf: null, analysts: 0, counts: null, history: [] };
}

/** FMP-Antwort -> Kursziel oder null. */
export function fromTarget(body) {
  const x = Array.isArray(body) ? body[0] : body;
  if (!x || !Number.isFinite(x.targetConsensus)) return null;
  const n = (v) => (Number.isFinite(v) ? v : null);
  return { consensus: x.targetConsensus, median: n(x.targetMedian), high: n(x.targetHigh), low: n(x.targetLow), source: "FMP" };
}

/** Faellige Titel: nie abgefragt zuerst (alphabetisch), dann aeltester Abruf. */
export function due(securities, entries, limit) {
  const rank = (s) => { const e = entries[s.securityId]; return e && e.fetchedAt ? e.fetchedAt : ""; };
  return securities.slice().sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0)).slice(0, limit);
}

/** Soll FMP fuer diesen Eintrag gefragt werden? Nur mit Einstufungen und hoechstens alle FMP_RETRY_DAYS Tage. */
export function wantsTarget(entry, today) {
  if (!entry || entry.ratingsState !== "AVAILABLE") return false;
  if (!entry.targetCheckedAt) return true;
  return (Date.parse(today) - Date.parse(entry.targetCheckedAt)) / 86400000 >= FMP_RETRY_DAYS;
}

/** Kursziel-Kandidaten: faellig (wantsTarget), meiste Analysten zuerst, bei Gleichstand Ticker. */
export function targetCandidates(entries, today, limit) {
  return Object.values(entries).filter((e) => wantsTarget(e, today))
    .sort((a, b) => (b.analysts || 0) - (a.analysts || 0) || (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0)).slice(0, limit);
}

export function summarize(entries, universeSize, today) {
  const list = Object.values(entries);
  const withRatings = list.filter((e) => e.ratingsState === "AVAILABLE");
  const withTarget = list.filter((e) => e.targetState === "AVAILABLE");
  const a = withRatings.map((e) => e.analysts).sort((x, y) => x - y);
  const fetched = list.map((e) => e.fetchedAt).filter(Boolean).sort();
  const share = (n) => (universeSize ? Math.round((n / universeSize) * 1000) / 1000 : 0);
  return { schema: SCHEMA + "-summary", generatedAt: today, source: "Finnhub (Einstufungen), FMP (Kursziele, nur freie Liste)",
    counts: { universe: universeSize, fetched: list.length, withRatings: withRatings.length, withTarget: withTarget.length,
      shareRatings: share(withRatings.length), shareTarget: share(withTarget.length),
      medianAnalysts: a.length ? a[Math.floor((a.length - 1) / 2)] : null },
    oldestFetch: fetched[0] || null, newestFetch: fetched[fetched.length - 1] || null };
}

function readEntries(dir) {
  const out = {};
  const sd = join(dir, "shards");
  if (!existsSync(sd)) return out;
  for (const f of readdirSync(sd).filter((x) => x.endsWith(".json"))) Object.assign(out, JSON.parse(readFileSync(join(sd, f), "utf8")).entries || {});
  return out;
}
function writeJson(p, v) { writeFileSync(p + ".tmp", JSON.stringify(v)); renameSync(p + ".tmp", p); }

export function writeAll(dir, entries, universe, today) {
  const ids = new Set(universe.map((s) => s.securityId));
  const shards = {};
  for (const [id, e] of Object.entries(entries)) {
    if (!ids.has(id)) continue;                             // Titel ausserhalb des Produktuniversums fallen weg
    (shards[Identity.shardKey(e.ticker)] ||= {})[id] = e;
  }
  mkdirSync(join(dir, "shards"), { recursive: true });
  const keys = Object.keys(shards).sort();
  for (const k of keys) {
    const sorted = Object.fromEntries(Object.keys(shards[k]).sort().map((id) => [id, shards[k][id]]));
    writeJson(join(dir, "shards", k + ".json"), { schema: SCHEMA, shard: k, entries: sorted });
  }
  for (const f of readdirSync(join(dir, "shards"))) if (f.endsWith(".json") && !keys.includes(f.slice(0, -5))) writeJson(join(dir, "shards", f), { schema: SCHEMA, shard: f.slice(0, -5), entries: {} });
  const kept = Object.fromEntries(Object.entries(entries).filter(([id]) => ids.has(id)));
  const summary = Object.assign(summarize(kept, universe.length, today), { shards: keys });
  writeJson(join(dir, "summary.json"), summary);
  return summary;
}

async function main(argv) {
  const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, "")] = argv[i + 1];
  const dir = o.out || join(ROOT, "dashboard", "data", "analysts");
  const maxTitles = Number(o["max-titles"] || 1000), perMinute = Number(o["per-minute"] || 55);
  const fmpMax = Number(o["fmp-max"] || 200), deadline = Date.now() + Number(o["max-minutes"] || 40) * 60000;
  const today = o.today || new Date().toISOString().slice(0, 10);
  const FINNHUB = process.env.FINNHUB_API_KEY || "", FMP = process.env.FMP_API_KEY || "";
  if (!FINNHUB) { console.error("FINNHUB_API_KEY fehlt - kein Lauf, keine Ersatzdaten."); process.exit(2); }
  const scrub = (s) => [FINNHUB, FMP].filter(Boolean).reduce((t, k) => t.split(k).join("***"), String(s));
  const universe = resolveProductUniverse(ROOT).securities.map((s) => ({ securityId: s.securityId, ticker: s.ticker }));
  const entries = readEntries(dir);
  const gap = Math.ceil(60000 / perMinute);
  let last = 0, calls = 0, fmpCalls = 0, rateLimited = 0, failed = 0, done = 0;
  const get = async (url, headers) => {
    const wait = last + gap - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now(); calls++;
    try { const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) }); let body = null; try { body = await res.json(); } catch { body = null; } return { status: res.status, body }; }
    catch (e) { return { status: 0, body: null }; }
  };
  for (const s of due(universe, entries, maxTitles)) {
    if (Date.now() > deadline) break;
    const r = await get(`https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(s.ticker)}`, { "X-Finnhub-Token": FINNHUB });
    if (r.status === 429) { rateLimited++; await new Promise((res) => setTimeout(res, 30000)); continue; }
    if (r.status !== 200) { failed++; continue; }
    const prev = entries[s.securityId] || {};
    const e = Object.assign({ securityId: s.securityId, ticker: s.ticker, source: "Finnhub", fetchedAt: today },
      fromRecommendation(r.body), { target: prev.target || null, targetState: prev.targetState || "NOT_CHECKED", targetCheckedAt: prev.targetCheckedAt || null });
    entries[s.securityId] = e; done++;
  }
  /* Kursziele danach und gezielt: die freie FMP-Liste fuehrt grosse Titel, also zuerst die mit den meisten Analysten
     (ueber alle Eintraege, nicht nur diesen Lauf). Ein 429 beendet FMP fuer diesen Lauf (Tageskontingent 250). */
  let fmpStop = null;
  const fmpStatus = {};
  if (FMP) for (const e of targetCandidates(entries, today, fmpMax)) {
    if (Date.now() > deadline) { fmpStop = "TIME"; break; }
    fmpCalls++;
    const t = await get(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${encodeURIComponent(e.ticker)}&apikey=${encodeURIComponent(FMP)}`, {});
    fmpStatus[t.status] = (fmpStatus[t.status] || 0) + 1;
    if (t.status === 429) { fmpStop = "QUOTA"; break; }
    if (t.status === 200) { const tg = fromTarget(t.body); e.target = tg; e.targetState = tg ? "AVAILABLE" : "NO_TARGET"; e.targetCheckedAt = today; }
    else if (t.status === 402 || t.status === 403) { e.target = null; e.targetState = "NO_FREE_SOURCE"; e.targetCheckedAt = today; }
  }
  const summary = writeAll(dir, entries, universe, today);
  console.log(scrub(JSON.stringify({ run: { titles: done, calls, fmpCalls, fmpStatus, fmpStop, rateLimited, failed }, counts: summary.counts, oldestFetch: summary.oldestFetch }, null, 1)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => { console.error("ABBRUCH: " + e.message); process.exitCode = 1; });
}
