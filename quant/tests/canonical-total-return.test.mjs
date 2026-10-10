/* =========================================================================
   KANONISCHE GESAMTRENDITE (canonical-total-return-1.0.0) - Owner-
   Entscheidung 03.10.2026, Option (a): Gesamtrendite aus Rohkurs,
   Splitfaktor und Bardividende; adjustedClose nur noch Gegenprobe.

   Die Anbieterspalte baut der Test selbst nach Anbieterkonvention
   (Rueckwaertsfaktor (1 - s*D/P_vor)/s). Jeder Pflichtfall der
   Owner-Liste hat einen eigenen Test; jede Sabotage muss rot werden.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { confirmedPayload, confirmedReport } from "./helpers/confirmed-golden-evidence.mjs";

const require = createRequire(import.meta.url);
const CTR = require("../engines/canonical-total-return.js");
const OK = { identity: { state: "CONFIRMED", via: "test" } };

/* Werktage ab 2024-01-02, Rohkurs aus Tagesrenditen, Ereignisse je Index. */
function series(n, { moves = () => 0.001, events = {}, start = 100 } = {}) {
  const bars = []; let t = Date.parse("2024-01-02T00:00:00Z"), close = start;
  for (let i = 0; i < n; i++) {
    while ([0, 6].includes(new Date(t).getUTCDay())) t += 864e5;
    const e = events[i] || {}, s = e.split || 1, D = e.dividend || 0;
    if (i) close = (close * (1 + moves(i))) / s - D;   // Markt bewegt, dann Split und Abschlag
    bars.push({ date: new Date(t).toISOString().slice(0, 10), close, splitFactor: s, dividend: D });
    t += 864e5;
  }
  return bars;
}
/* Anbieterspalte nach Anbieterkonvention (Tiingo: f_(t-1)/f_t = P_t/(s(P_t+D_t))); skip: Ereignisse, die der Anbieter nicht kennt. */
function withProvider(bars, { skip = new Set(), extra = {} } = {}) {
  const n = bars.length, f = new Array(n); f[n - 1] = 1;
  for (let i = n - 1; i > 0; i--) {
    const b = bars[i], s = skip.has(i) ? 1 : b.splitFactor, D = skip.has(i) ? 0 : b.dividend;
    let m = b.close / (s * (b.close + D));
    if (extra[i]) m *= extra[i];
    f[i - 1] = f[i] * m;
  }
  return bars.map((b, i) => ({ ...b, adjustedClose: b.close * f[i] }));
}
const ret = (a, i) => a[i] / a[i - 1] - 1;
const close = (x, y, eps = 1e-9) => Math.abs(x - y) <= eps;

test("CTR1 Aktie ohne Dividende: Gesamtrendite = Kursrendite, Anbieter MATCH", () => {
  const r = CTR.reconstruct(withProvider(series(300)), OK);
  assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED");
  for (let i = 1; i < 300; i++) assert.ok(close(r.tr[i], r.priceReturnIndex[i], 1e-6));
  assert.equal(r.crossCheck.state, "MATCH");
  assert.ok(r.crossCheck.maxAbsDailyDiff < 1e-9);
  assert.equal(r.contract, "canonical-total-return-1.0.0");
});

test("CTR2 normale Dividende: Ex-Tag reinvestiert, Kursrendite ohne Ausschuettung", () => {
  const bars = withProvider(series(300, { events: { 100: { dividend: 0.5 } } }));
  const r = CTR.reconstruct(bars, OK);
  assert.equal(r.events.dividends, 1);
  const exp = (bars[100].close + 0.5) / bars[99].close - 1;
  assert.ok(close(ret(r.tr, 100), exp, 1e-9));
  assert.ok(close(ret(r.priceReturnIndex, 100), bars[100].close / bars[99].close - 1, 1e-9));
  assert.ok(ret(r.tr, 100) > ret(r.priceReturnIndex, 100), "mit Ausschuettung hoeher");
  assert.equal(r.crossCheck.dividendParity, 1);
  assert.equal(r.crossCheck.state, "MATCH");
  assert.ok(r.crossCheck.maxAbsDailyDiff < 1e-9, "gleiche Konvention wie der Anbieter: keine Abweichung");
});

test("CTR3 Sonderdividende: gezaehlt, gleich gerechnet", () => {
  const bars = withProvider(series(300, { events: { 150: { dividend: 15 } } }));
  const r = CTR.reconstruct(bars, OK);
  assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(r.events.specialDividends, 1);
  assert.ok(close(ret(r.tr, 150), (bars[150].close + 15) / bars[149].close - 1, 1e-9));
  assert.equal(r.crossCheck.dividendParity, 1);
});

test("CTR4 Split 4:1 und CTR5 Reverse Split 1:10: Index stetig", () => {
  for (const s of [4, 0.1]) {
    const bars = withProvider(series(300, { events: { 120: { split: s } } }));
    const r = CTR.reconstruct(bars, OK);
    assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED");
    assert.ok(close(ret(r.tr, 120), 0.001, 1e-9), "Splittag traegt nur die Marktbewegung");
    assert.equal(s > 1 ? r.events.splits : r.events.reverseSplits, 1);
    assert.equal(r.crossCheck.splitParity, 1);
    assert.equal(r.crossCheck.state, "MATCH");
  }
});

test("CTR6 Split + Dividende am selben Tag: Dividende je neuer Aktie", () => {
  const bars = withProvider(series(300, { events: { 130: { split: 2, dividend: 0.4 } } }));
  const r = CTR.reconstruct(bars, OK);
  assert.equal(r.events.splitWithDividend, 1);
  assert.ok(close(ret(r.tr, 130), (2 * (bars[130].close + 0.4)) / bars[129].close - 1, 1e-9));
  assert.equal(r.crossCheck.splitParity, 1);
  assert.equal(r.crossCheck.dividendParity, 1);
});

test("CTR7 fehlende Dividende: Anbieter kennt sie, wir nicht -> UNAVAILABLE", () => {
  const truth = series(300, { events: { 90: { dividend: 0.8 } } });
  const provider = withProvider(truth);
  const ours = provider.map((b, i) => (i === 90 ? { ...b, dividend: 0 } : b));
  const r = CTR.reconstruct(ours, OK);
  assert.equal(r.state, "TOTAL_RETURN_UNAVAILABLE");
  assert.equal(r.reason, "DIVIDEND_MISSING");
  assert.equal(r.bucket, "REJECTED_DIVIDEND_GAP");
  assert.equal(r.tr, null, "keine scheinbare Reihe");
  const nul = CTR.reconstruct(provider.map((b, i) => (i === 10 ? { ...b, dividend: null } : b)), OK);
  assert.equal(nul.reason, "DIVIDEND_FIELD_MISSING");
});

test("CTR8 fehlender Split: Anbieter splittet, Feld sagt 1 -> UNAVAILABLE; ohne Anbieter Verdacht", () => {
  const provider = withProvider(series(300, { events: { 200: { split: 3 } } }));
  const ours = provider.map((b, i) => (i === 200 ? { ...b, splitFactor: 1 } : b));
  const r = CTR.reconstruct(ours, OK);
  assert.equal(r.reason, "SPLIT_MISSING");
  assert.equal(r.bucket, "REJECTED_SPLIT_GAP");
  const bare = ours.map(({ adjustedClose, ...b }) => b);
  assert.equal(CTR.reconstruct(bare, OK).reason, "SPLIT_SUSPECTED");
  assert.equal(CTR.reconstruct(provider.map((b, i) => (i === 5 ? { ...b, splitFactor: null } : b)), OK).reason, "SPLIT_FACTOR_FIELD_MISSING");
  /* Ein echter Kurssturz ohne Split, den der Anbieter nicht als Split fuehrt, bleibt Markt. */
  const crash = withProvider(series(300, { moves: (i) => (i === 50 ? -0.5 : 0.001) }));
  assert.equal(CTR.reconstruct(crash, OK).state, "TOTAL_RETURN_RECONSTRUCTED");
});

test("CTR9 Kuerzel-Wiederverwendung: unsichere Identitaet -> REJECTED_IDENTITY", () => {
  const bars = withProvider(series(100));
  for (const opts of [{}, { identity: { state: "UNCERTAIN", reason: "TICKER_REUSE" } }]) {
    const r = CTR.reconstruct(bars, opts);
    assert.equal(r.reason, "IDENTITY_UNCERTAIN");
    assert.equal(r.bucket, "REJECTED_IDENTITY");
  }
});

test("CTR10 Relisting: Luecke ueber 365 Tage in der Reihe -> LISTING_DISCONTINUITY; jüngstes Listing allein geht", () => {
  const a = series(100), b = series(100, { start: 20 }).map((x) => ({ ...x, date: String(Number(x.date.slice(0, 4)) + 3) + x.date.slice(4) }));
  const joined = withProvider(a.concat(b));
  const r = CTR.reconstruct(joined, OK);
  assert.equal(r.reason, "LISTING_DISCONTINUITY");
  assert.equal(r.bucket, "REJECTED_IDENTITY");
  assert.equal(CTR.reconstruct(withProvider(b), OK).state, "TOTAL_RETURN_RECONSTRUCTED");
});

test("CTR11 SPY: dieselbe Engine, Rolle BENCHMARK_REFERENCE, identische Zahlen", () => {
  const bars = withProvider(series(400, { events: { 60: { dividend: 1.5 }, 250: { dividend: 1.6 } } }));
  const spy = CTR.reconstruct(bars, { ...OK, role: "BENCHMARK_REFERENCE" });
  const stock = CTR.reconstruct(bars, OK);
  assert.equal(spy.role, "BENCHMARK_REFERENCE");
  assert.equal(spy.benchmarkContract, CTR.BENCHMARK_CONTRACT);
  assert.deepEqual(Array.from(spy.tr), Array.from(stock.tr));
});

test("CTR12 Anbieter widerspricht: verpasste Dividende und Abruf-Naht -> Kanon gewinnt", () => {
  const truth = series(300, { events: { 80: { dividend: 0.7 } } });
  const missed = CTR.reconstruct(withProvider(truth, { skip: new Set([80]) }), OK);
  assert.equal(missed.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(missed.crossCheck.providerMissed, 1);
  assert.equal(missed.crossCheck.state, "CONFLICT_CANONICAL_WINS");
  const stitched = CTR.reconstruct(withProvider(series(300), { extra: { 150: 1.02 } }), OK);
  assert.equal(stitched.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(stitched.crossCheck.providerStitch, 1);
  /* Datumsversatz: Anbieter verbucht die Dividende einen Tag spaeter. */
  const shifted = withProvider(truth, { skip: new Set([80]), extra: { 81: 1 - 0.7 / truth[80].close } });
  const s = CTR.reconstruct(shifted, OK);
  assert.equal(s.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(s.crossCheck.dateShift, 1);
});

test("CTR13 widerspruechliche Ereignisse, Luecken, Delisting", () => {
  const base = withProvider(series(200));
  const bad = (i, patch) => CTR.reconstruct(base.map((b, j) => (j === i ? { ...b, ...patch } : b)), OK);
  assert.equal(bad(50, { dividend: -1 }).reason, "CORPORATE_ACTION_CONTRADICTED");
  assert.equal(bad(50, { dividend: 1000 }).reason, "CORPORATE_ACTION_CONTRADICTED");
  assert.equal(bad(50, { splitFactor: 0 }).reason, "CORPORATE_ACTION_CONTRADICTED");
  assert.equal(bad(50, { splitFactor: 2 }).reason, "CORPORATE_ACTION_CONTRADICTED", "Split ohne Kurssprung");
  /* Luecke: mit Gegenprobe erlaubt und gezaehlt, ohne Gegenprobe nicht. */
  const gap = base.filter((_, i) => i < 60 || i > 70);
  const g = CTR.reconstruct(gap, OK);
  assert.equal(g.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(g.tradingGaps, 1);
  assert.equal(CTR.reconstruct(gap.map(({ adjustedClose, ...b }) => b), OK).reason, "TRADING_GAP_UNVERIFIED");
  const d = CTR.reconstruct(base, { ...OK, delisted: true });
  assert.equal(d.terminal, "DELISTING_PROCEEDS_UNKNOWN");
  assert.equal(d.last, base[base.length - 1].date);
  assert.equal(CTR.reconstruct(base, { ...OK, asOf: "2026-01-01", maxStaleDays: 10 }).reason, "STALE");
});

test("CTR14 Zusammenfassung: Abdeckung, Gruende, Anbieter-Abweichung", () => {
  const rs = [
    CTR.reconstruct(withProvider(series(200, { events: { 50: { dividend: 0.5 } } })), OK),
    CTR.reconstruct(withProvider(series(200, { events: { 50: { dividend: 0.5 } } }), { skip: new Set([50]) }), OK),
    CTR.reconstruct(withProvider(series(200)), {})
  ];
  const s = CTR.summarize(rs);
  assert.equal(s.TOTAL_RETURN_RECONSTRUCTED, 2);
  assert.equal(s.REJECTED_IDENTITY, 1);
  assert.equal(s.crossCheck.matchingTitles, 1);
  assert.equal(s.crossCheck.conflictingTitles, 1);
  assert.equal(s.crossCheck.dividendEvents, 2);
  assert.equal(s.crossCheck.dividendParity, 1);
  assert.ok(s.crossCheck.maxAbsError > 0.001, "verpasste Dividende ist als Abweichung sichtbar");
});

test("CTR15 Sabotage: Engine ohne Dividende oder ohne Split faellt in CTR2/CTR4 auf", () => {
  /* Die Sabotage wird hier unabhaengig nachgerechnet: eine Gesamtrendite,
     die die Dividende nicht traegt, ist am Ex-Tag gleich der Kursrendite -
     genau das schliesst CTR2 aus. */
  const bars = withProvider(series(300, { events: { 100: { dividend: 0.5 }, 200: { split: 2 } } }));
  const r = CTR.reconstruct(bars, OK);
  const noDiv = (bars[100].close) / bars[99].close - 1;
  const noSplit = bars[200].close / bars[199].close - 1;
  assert.notEqual(Math.round(ret(r.tr, 100) * 1e9), Math.round(noDiv * 1e9));
  assert.notEqual(Math.round(ret(r.tr, 200) * 1e6), Math.round(noSplit * 1e6));
  /* Die Engine liest adjustedClose nur zur Gegenprobe: dieselben Rohdaten
     mit verfaelschter Anbieterspalte geben dieselbe Reihe. */
  const garbage = bars.map((b) => ({ ...b, adjustedClose: b.close }));
  const g = CTR.reconstruct(garbage, OK);
  assert.deepEqual(Array.from(g.tr), Array.from(r.tr));
});

test("CTR16 schleichende Drift: viele kleine fehlende Ausschuettungen summieren sich zu DIVIDEND_MISSING", () => {
  const bars = series(300);
  const n = bars.length, f = new Array(n); f[n - 1] = 1;
  for (let i = n - 1; i > 0; i--) f[i - 1] = f[i] * (i % 21 === 0 ? 1 - 0.0008 : 1);   /* 0,08 % je Monat, unter der Rauschschwelle */
  const drift = bars.map((b, i) => ({ ...b, adjustedClose: b.close * f[i] }));
  const r = CTR.reconstruct(drift, OK);
  assert.equal(r.reason, "DIVIDEND_MISSING");
  /* Gegenprobe: dieselben Ausschuettungen in unseren Daten -> rekonstruiert. */
  const own = drift.map((b, i) => (i % 21 === 0 && i ? { ...b, dividend: 0.0008 * drift[i - 1].close } : b));
  const ok = CTR.reconstruct(own, OK);
  assert.equal(ok.state, "TOTAL_RETURN_RECONSTRUCTED", JSON.stringify(ok.crossCheck));
});

test("CTR17 Backtesting-Seite nennt die Renditebasis im Klartext, ohne interne Codes", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/page-backtest.js", import.meta.url), "utf8");
  assert.match(src, /"Renditebasis: " \+ \(tr \? "Gesamtrendite mit Dividenden \(selbst berechnet\)" : "Nur Kursrendite, ohne Dividenden"\)/);
  assert.match(src, /main\.append\(returnBasisLine\(signal\)\)/);
  assert.doesNotMatch(src, /text: [^,]*"CANONICAL_TOTAL_RETURN"/, "der Code steht nie als Text auf der Seite");
});

test("CTR18 bestätigtes Tiingo-Messintervall: Rekonstruktion = Anbieter, jede Dividende und jeder Split paritaetisch", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../data/market/golden-preview/daily/", import.meta.url);
  let div = 0, split = 0;
  for (const f of readdirSync(dir)) {
    const ticker = JSON.parse(readFileSync(new URL(f, dir), "utf8")).ticker;
    const bars = confirmedPayload(ticker).bars;
    const r = CTR.reconstruct(bars, OK);
    assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED", f);
    assert.equal(r.crossCheck.state, "MATCH", f);
    assert.ok(r.crossCheck.maxAbsDailyDiff < 1e-6 && r.crossCheck.maxLevelDiff < 1e-6, f);
    assert.equal(r.crossCheck.dividendParity, r.crossCheck.dividendEvents, f);
    assert.equal(r.crossCheck.splitParity, r.crossCheck.splitEvents, f);
    div += r.crossCheck.dividendEvents; split += r.crossCheck.splitEvents;
  }
  assert.ok(div >= 200 && split >= 3, "die Probe traegt echte Ereignisse");
});


test("CTR19 pinned actual provider conflict remains explicit and canonical cash-return construction remains correct", async () => {
  const {readFileSync} = await import("node:fs");
  const payload = JSON.parse(readFileSync(new URL("./fixtures/jpm-observed-provider-conflict.json", import.meta.url), "utf8"));
  const r = CTR.reconstruct(payload.bars, OK);
  assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED");
  // This observed event is evidence of a conflict, never a MATCH exemption.
  const i = payload.bars.findIndex((b) => b.date.slice(0,10) === "2026-10-06");
  assert.ok(i > 0);
  assert.equal(payload.bars[i].dividend, 1.65);
  const bar = payload.bars[i], previous = payload.bars[i-1];
  const canonicalGross = (bar.close + bar.dividend) * bar.splitFactor / previous.close;
  const providerGross = bar.adjustedClose / previous.adjustedClose;
  assert.ok(Math.abs(canonicalGross / providerGross - 1) > 0.004);
  assert.ok(Math.abs(r.tr[i] / r.tr[i-1] - canonicalGross) < 1e-9);
  assert.equal(r.crossCheck.state, "CONFLICT_CANONICAL_WINS");
  assert.equal(r.crossCheck.providerMissed, 1);
  assert.equal(r.crossCheck.dividendParity, r.crossCheck.dividendEvents - 1);
  assert.equal(r.crossCheck.splitParity, r.crossCheck.splitEvents);
  assert.ok(bar.date.slice(0,10) > confirmedReport.series.find((s) => s.ticker === "JPM").to);
});
