#!/usr/bin/env node
/* =========================================================================
   SETUP OUTCOMES - Ergebnisse aus VEROEFFENTLICHTEN Setup-Staenden.

   Quelle der Zustaende ist ausschliesslich die veroeffentlichte Historie
   (setup-observation-history). Jeder Stand wird gegen seinen contentHash
   geprueft; ein veraenderter Stand bricht den Lauf ab. Rekonstruierte
   Zustaende (setup-replay-v1) werden hier nicht gelesen.

   Vertrag: quant/methodology/setup-backtest-contract-v1.json
     Ereignisse  SETUP_CONFIRMED, SETUP_NEW, SETUP_WEAKENED
     Einstieg    NEXT_CLOSE (Standard) und SIGNAL_CLOSE (Vergleich)
     Ausstieg    Invalidierung > Ziel 1 > Gegensignal > 126 Handelstage
     Horizonte   21 / 63 / 126 / 252 Handelstage
     Kosten      LOW / BASE / HIGH je Runde

   Kurse nur zur Laufzeit (scripts/quant/lib/daily-prices.mjs): in der
   Pipeline die kanonische Historie mit Gesamtrendite, lokal die
   oeffentliche Jahresreihe (nur Kurs) - die Renditebasis steht im Artefakt.

   Schreibt quant/data/product/setup-outcomes-v1.json (nur abgeleitete
   Zustaende und Aggregate, keine Kursreihe).
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dailyOf } from "./lib/daily-prices.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SB = require(join(ROOT, "quant/engines/signal-backtest.js"));
const CONTRACT = JSON.parse(readFileSync(join(ROOT, "quant/methodology/setup-backtest-contract-v1.json"), "utf8"));
const HIST = join(ROOT, "quant/data/product/setup-observation-history/setup-mapping-1.0.0");
const OUT = join(ROOT, "quant/data/product/setup-outcomes-v1.json");
export const OUTCOMES_SCHEMA = "setup-outcomes-1.0.0";

const UP = { NO_SETUP: 0, WATCH: 1, SETUP_FORMING: 2, CONFIRMED: 3 };
export function transitionType(a, b) {
  if (!(a in UP) || !(b in UP) || a === b) return null;
  if (b === "CONFIRMED") return "SETUP_CONFIRMED";
  if (b === "SETUP_FORMING" && UP[a] < UP.SETUP_FORMING) return "SETUP_NEW";
  if (UP[a] >= UP.SETUP_FORMING && UP[b] < UP[a]) return "SETUP_WEAKENED";
  return null;
}
export function snapshotHash(snapshot) {
  const body = { ...snapshot };
  delete body.contentHash;
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 32);
}
const costRate = (s) => (s.commissionBps + s.spreadBps + s.slippageBps) / 10000;

/* Vertragsausstieg. levelsBefore(d) liefert die Marken des zuletzt VOR dem
   Tag d veroeffentlichten Stands; weakenedOn(d) ob an d ein Abstieg
   veroeffentlicht wurde. Ausstieg jeweils zum naechsten Schlusskurs. */
export function contractExit({ dates, close }, e, levelsBefore, weakenedOn, maxHold) {
  for (let d = e + 1; d < dates.length && d - e <= maxHold; d++) {
    const lv = levelsBefore(dates[d]);
    const inv = lv && lv[1] !== null && close[d] < lv[1];
    const tgt = lv && lv[2] !== null && close[d] >= lv[2];
    if (inv) return d + 1 < dates.length ? { kind: "INVALIDATION", at: d + 1 } : { kind: "INCOMPLETE", at: null };
    if (tgt) return d + 1 < dates.length ? { kind: "TARGET", at: d + 1 } : { kind: "INCOMPLETE", at: null };
    if (weakenedOn(dates[d])) return d + 1 < dates.length ? { kind: "OPPOSITE_SIGNAL", at: d + 1 } : { kind: "INCOMPLETE", at: null };
  }
  return e + maxHold < dates.length ? { kind: "TIME_EXIT", at: e + maxHold } : { kind: "PENDING", at: null };
}

function main() {
  const argv = process.argv.slice(2);
  const wi = argv.indexOf("--work-dir"), workDir = wi >= 0 ? argv[wi + 1] : null;
  const files = readdirSync(HIST).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort();
  const snaps = files.map((f) => {
    const s = JSON.parse(gunzipSync(readFileSync(join(HIST, f))).toString("utf8"));
    if (s.contentHash !== snapshotHash(s)) throw Error("PUBLISHED_SNAPSHOT_ALTERED " + f);
    if (s.asOf !== f.slice(0, 10)) throw Error("SNAPSHOT_DATE_MISMATCH " + f);
    return { date: s.asOf, rows: s.rows };
  });
  const dates = snaps.map((s) => s.date);
  const gaps = dates.slice(1).map((d, i) => Math.round((Date.parse(d) - Date.parse(dates[i])) / 86400000));

  /* Kennung je Kuerzel aus den Setup-Shards. */
  const secOf = {};
  for (const f of readdirSync(join(ROOT, "quant/data/product/setup-observations-v1")).filter((x) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(x))) {
    for (const [t, v] of Object.entries(JSON.parse(gunzipSync(readFileSync(join(ROOT, "quant/data/product/setup-observations-v1", f))).toString("utf8")).instruments || {})) secOf[t] = v.securityId;
  }

  /* Ereignisse, Lebensdauern. */
  const events = [], runs = { completed: {}, open: {} };
  const perTicker = {};
  for (let i = 0; i < snaps.length; i++) for (const [t, row] of Object.entries(snaps[i].rows)) (perTicker[t] = perTicker[t] || []).push([snaps[i].date, row[0], row[1], row[2]]);
  for (const [t, list] of Object.entries(perTicker)) {
    let start = list[0];
    for (let k = 1; k < list.length; k++) {
      const type = transitionType(list[k - 1][1], list[k][1]);
      if (type) events.push({ ticker: t, type, date: list[k][0], from: list[k - 1][1], to: list[k][1] });
      if (list[k][1] !== list[k - 1][1]) {
        const days = Math.round((Date.parse(list[k][0]) - Date.parse(start[0])) / 86400000);
        (runs.completed[start[1]] = runs.completed[start[1]] || []).push(days);
        start = list[k];
      }
    }
    (runs.open[start[1]] = runs.open[start[1]] || 0); runs.open[start[1]]++;
  }

  /* Kurse (nur Laufzeit). Eine Basis fuer alle: Gesamtrendite, wenn jede
     benoetigte Reihe sie hat, sonst Kurs. */
  const priceCache = {};
  const priceOf = (t) => (t in priceCache ? priceCache[t] : (priceCache[t] = secOf[t] ? dailyOf(secOf[t], workDir, { allowPublicPriceOnly: true }) : null));
  const eventTickers = [...new Set(events.map((e) => e.ticker))];
  const universe = Object.keys(perTicker);
  for (const t of universe) priceOf(t);
  const withPrices = universe.filter((t) => priceCache[t]);
  const allTR = withPrices.length > 0 && withPrices.every((t) => priceCache[t].totalReturn);
  const returnType = allTR ? "TOTAL_RETURN" : "SPLIT_ADJUSTED_PRICE";
  const retSeries = (p) => (allTR ? p.tr : p.close);
  const H = CONTRACT.horizons, BASE = CONTRACT.costs.scenarios.find((s) => s.isDefault);
  const idxOnOrAfter = (p, d, strictlyAfter) => { for (let i = 0; i < p.dates.length; i++) if (strictlyAfter ? p.dates[i] > d : p.dates[i] >= d) return i; return -1; };

  /* Marktbasis je Einstiegstag: alle Titel des Universums, passiv, ohne Kosten. */
  const baseCache = {};
  function baseFor(date, variant, h) {
    const key = date + "|" + variant + "|" + h.id;
    if (key in baseCache) return baseCache[key];
    const r = [];
    for (const t of withPrices) {
      const p = priceCache[t], e = variant === "NEXT_CLOSE" ? idxOnOrAfter(p, date, true) : idxOnOrAfter(p, date, false);
      if (e < 0 || (variant === "SIGNAL_CLOSE" && p.dates[e] !== date)) continue;
      const s = retSeries(p);
      if (e + h.tradingDays < p.dates.length && s[e] > 0 && s[e + h.tradingDays] > 0) r.push(s[e + h.tradingDays] / s[e] - 1);
    }
    return (baseCache[key] = r.length >= 30 ? { median: SB.median(r), positiveShare: r.filter((x) => x > 0).length / r.length, n: r.length } : null);
  }

  const levelsIndex = {};
  for (const [t, list] of Object.entries(perTicker)) levelsIndex[t] = list;
  const study = {};
  for (const type of CONTRACT.events.map((e) => e.id)) {
    const evs = events.filter((e) => e.type === type);
    const byVariant = {};
    for (const variant of CONTRACT.entry.variants.map((v) => v.id)) {
      const hz = {};
      for (const h of H) {
        const rets = [], ex = [], dd = [], status = { COMPLETED: 0, PENDING: 0, INCOMPLETE: 0, NO_PRICES: 0 }, rows = [];
        for (const ev of evs) {
          const p = priceOf(ev.ticker);
          if (!p) { status.NO_PRICES++; continue; }
          const e = variant === "NEXT_CLOSE" ? idxOnOrAfter(p, ev.date, true) : idxOnOrAfter(p, ev.date, false);
          if (e < 0) { status.PENDING++; continue; }
          const s = retSeries(p);
          if (e + h.tradingDays >= p.dates.length) {
            /* Reihe endet vor dem Horizont: noch offen, ausser sie endet vor dem letzten Stichtag (Delisting/Datenende). */
            if (p.dates[p.dates.length - 1] < dates[dates.length - 1]) status.INCOMPLETE++; else status.PENDING++;
            continue;
          }
          const o = SB.outcome(s, e, h.tradingDays);
          if (!o) { status.INCOMPLETE++; continue; }
          status.COMPLETED++;
          const net = (s[e + h.tradingDays] / s[e]) * (1 - costRate(BASE)) - 1;
          rets.push(net); dd.push(o.maxDrawdown);
          const b = baseFor(ev.date, variant, h);
          if (b) ex.push(net - b.median);
          rows.push({ date: ev.date, net, b });
        }
        const sum = rets.length ? SB.summarize(rets) : null;
        const matchedBase = rows.filter((r) => r.b);
        hz[h.id] = { tradingDays: h.tradingDays, status, summary: sum,
          baseRate: matchedBase.length ? { positiveShare: SB.round(SB.mean(matchedBase.map((r) => r.b.positiveShare))), median: SB.round(SB.median(matchedBase.map((r) => r.b.median))), matched: matchedBase.length } : null,
          medianExcess: ex.length ? SB.round(SB.median(ex)) : null, typicalDrawdown: dd.length ? SB.round(SB.median(dd)) : null };
      }
      byVariant[variant] = hz;
    }
    /* Vertragsausstieg (nur Einstiegsereignisse, Standardvariante). */
    let trades = null;
    if (type !== "SETUP_WEAKENED") {
      const kinds = { INVALIDATION: [], TARGET: [], OPPOSITE_SIGNAL: [], TIME_EXIT: [] }, other = { PENDING: 0, INCOMPLETE: 0, NO_PRICES: 0 };
      for (const ev of evs) {
        const p = priceOf(ev.ticker);
        if (!p) { other.NO_PRICES++; continue; }
        const e = idxOnOrAfter(p, ev.date, true);
        if (e < 0) { other.PENDING++; continue; }
        const list = levelsIndex[ev.ticker];
        const levelsBefore = (d) => { let last = null; for (const x of list) { if (x[0] < d) last = x; else break; } return last ? [last[1], last[2], last[3]] : null; };
        const weakenedOn = (d) => { const i = list.findIndex((x) => x[0] === d); return i > 0 && transitionType(list[i - 1][1], list[i][1]) === "SETUP_WEAKENED"; };
        const x = contractExit(p, e, levelsBefore, weakenedOn, CONTRACT.exit.timeExit.tradingDays);
        if (x.kind === "PENDING" || x.kind === "INCOMPLETE") { other[x.kind]++; continue; }
        const s = retSeries(p);
        kinds[x.kind].push({ ret: (s[x.at] / s[e]) * (1 - costRate(BASE)) - 1, days: x.at - e });
      }
      const all = Object.values(kinds).flat();
      trades = { completed: all.length, ...other,
        byExit: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { n: v.length, medianReturn: SB.round(SB.median(v.map((x) => x.ret))), medianDays: SB.median(v.map((x) => x.days)) }])),
        summary: all.length ? SB.summarize(all.map((x) => x.ret)) : null, medianHoldingDays: all.length ? SB.median(all.map((x) => x.days)) : null,
        costSensitivity: all.length ? Object.fromEntries(CONTRACT.costs.scenarios.map((sc) => [sc.id, SB.round(SB.median(all.map((x) => (1 + x.ret) / (1 - costRate(BASE)) * (1 - costRate(sc)) - 1)))])) : null };
    }
    const n6 = byVariant.NEXT_CLOSE.m6, c6 = byVariant.SIGNAL_CLOSE.m6;
    const divergence = n6.summary && c6.summary ? Math.abs(n6.summary.median - c6.summary.median) : null;
    const completedDates = [...new Set(evs.map((e) => e.date))];
    study[type] = { events: evs.length, titles: new Set(evs.map((e) => e.ticker)).size, eventDates: completedDates.length, variants: byVariant, contractTrades: trades,
      variantDivergenceM6: divergence === null ? null : SB.round(divergence), variantGate: divergence === null ? "NOT_MEASURABLE_YET" : divergence > CONTRACT.entry.variantDivergenceGate.maxAbsDifference ? CONTRACT.entry.variantDivergenceGate.onExceed : "PASS" };
  }

  const reversal = (() => {
    let cand = 0, rev = 0;
    for (const list of Object.values(perTicker)) for (let k = 1; k + 1 < list.length; k++) if (list[k][1] !== list[k - 1][1]) { cand++; if (list[k + 1][1] !== list[k][1]) rev++; }
    return { candidates: cand, reversals: rev, share: cand ? SB.round(rev / cand) : null };
  })();

  const out = {
    schemaVersion: OUTCOMES_SCHEMA, contract: CONTRACT.methodologyVersion, generatedAt: new Date().toISOString(), asOf: dates[dates.length - 1],
    source: { states: "setup-observation-history (veröffentlicht, contentHash geprüft)", reconstructed: false, priceSource: workDir ? "kanonische Historie (runner-privat, nur Laufzeit)" : "öffentliche Jahresreihe (nur Kurs, nur Laufzeit)" },
    returnType, history: { dates: dates.length, from: dates[0], to: dates[dates.length - 1], spanDays: dates.length > 1 ? Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000) : 0,
      medianGapDays: gaps.length ? SB.median(gaps) : null, maxGapDays: gaps.length ? Math.max(...gaps) : null, titlesLatest: Object.keys(snaps[snaps.length - 1].rows).length, contentHashVerified: snaps.length },
    transitions: Object.fromEntries(Object.keys(study).map((k) => [k, study[k].events])), reversalNextSnapshot: reversal,
    lifetimes: Object.fromEntries(Object.entries(runs.completed).map(([s, v]) => [s, { completedRuns: v.length, medianDays: SB.median(v) }])), openRuns: runs.open,
    universeWithPrices: withPrices.length, eventTickersWithoutPrices: eventTickers.filter((t) => !priceCache[t]).length,
    events: events.map((e) => [e.ticker, e.type, e.date]),
    study
  };
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  console.log("dates", dates.length, "span", out.history.spanDays, "events", events.length, "returnType", returnType, "priced", withPrices.length);
  for (const [k, v] of Object.entries(study)) console.log(k, "events", v.events, "m1", JSON.stringify(v.variants.NEXT_CLOSE.m1.status), "m6", JSON.stringify(v.variants.NEXT_CLOSE.m6.status), "trades", v.contractTrades ? v.contractTrades.completed : "-");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
