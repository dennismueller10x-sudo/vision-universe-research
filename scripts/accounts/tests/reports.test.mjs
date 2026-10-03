import test from "node:test";
import assert from "node:assert/strict";
import {
  newsEvents, hedgeFundEvents, quantEvents, analystEvents, signalEvents, snapshotState,
  buildDigests, composeReport, reportDue, reportWindowStart, renderReportEmail
} from "../symbol-digest.mjs";
import { loadSources, run } from "../run-watchlist-reports.mjs";

const asOf = "2026-10-05";

test("News: nur Meldungen mit gueltigem Ticker", () => {
  const e = newsEvents({ updated_at: "2026-10-05T08:00:00Z", items: [
    { symbol: "pltr", title: "Palantir gewinnt Auftrag", why_it_matters: "Wichtig", source: "Reuters", source_url: "https://example.com" },
    { symbol: null, title: "Weltmaerkte" }, { symbol: "BAD TICKER", title: "x" }] }, { asOf });
  assert.equal(e.length, 1);
  assert.equal(e[0].ticker, "PLTR");
  assert.equal(e[0].detail, "Wichtig");
});

test("Hedgefonds: nur neue 13F-Meldungen seit dem letzten Lauf, keine Optionen, keine Kleinstpositionen", () => {
  const fund = { name: "Akre Capital Management", manager: "Chuck Akre", slug: "akre", filedDate: "2026-10-04", reportDate: "2026-09-30",
    trades: { new: [{ ticker: "NVDA", valueUSD: 5e7 }], added: [{ ticker: "MA", valueUSD: 5e7, deltaPct: 12.5 }],
      reduced: [{ ticker: "AAPL", valueUSD: 10 }], sold: [{ ticker: "TSLA", prevValueUSD: 2e7, putCall: "PUT" }, { ticker: "MSFT", prevValueUSD: 2e7 }] } };
  const e = hedgeFundEvents([fund], { asOf, since: "2026-10-03" });
  assert.deepEqual(e.map((x) => x.ticker).sort(), ["MA", "MSFT", "NVDA"]);
  assert.match(e.find((x) => x.ticker === "MA").title, /aufgestockt \(\+12\.5 % Stück\)/);
  assert.equal(e.find((x) => x.ticker === "NVDA").severity, "high");
  assert.equal(hedgeFundEvents([fund], { asOf, since: "2026-10-04" }).length, 0, "schon gemeldet");
  assert.equal(hedgeFundEvents([{ ...fund, stale: true }], { asOf, since: "2026-10-01" }).length, 0);
  assert.equal(hedgeFundEvents([{ ...fund, filedDate: "2026-09-01" }], { asOf }).length, 0, "aelter als 7 Tage beim ersten Lauf");
});

test("Quant, Analysten, Signale: nur echte Aenderungen gegenueber dem letzten Stand", () => {
  const scores = { symbols: { NVDA: { fundamental_score_beta: 87, quality: 96, growth: 99, value: 54, risk: 48, data_as_of: "2026-10-04" } } };
  const ratings = { provider: "Finnhub", symbols: { NVDA: { consensus_label: "buy" } } };
  const signals = { asOf, bySymbol: { NVDA: [{ strategyId: "DARVAS_BOX", state: "ENTRY_READY" }, { strategyId: "DARVAS_BOX", state: "WATCH" }] } };
  const previous = { NVDA: { quant: { fundamental_score_beta: 80, quality: 95, growth: 99, value: 54, risk: 48 }, consensus: "strong_buy", signals: { DARVAS_BOX: ["SETUP"] } } };

  const q = quantEvents(scores, previous, { asOf });
  assert.equal(q.length, 1, "nur der Score mit >= 5 Punkten");
  assert.equal(q[0].title, "VU Fundamental Score steigt: 80 → 87");
  assert.equal(quantEvents(scores, {}, { asOf }).length, 0, "ohne Vorstand keine Aenderung");

  const a = analystEvents(ratings, previous, { asOf });
  assert.equal(a[0].title, "Analystenkonsens: Starker Kauf → Kauf");

  const s = signalEvents(signals, previous, { asOf });
  assert.equal(s.length, 1);
  assert.match(s[0].title, /DARVAS BOX: Einstieg bereit/);
  assert.equal(signalEvents(signals, {}, { asOf }).length, 0, "erster Lauf meldet keine Signale");

  const state = snapshotState({ scores, ratings, signals });
  assert.deepEqual(state.NVDA.signals, { DARVAS_BOX: ["ENTRY_READY"] });
  // Mit dem eigenen Stand verglichen gibt es nichts Neues.
  assert.equal(buildDigests({ asOf, scores, ratings, signals, previous: state }).length, 0);
});

test("Bericht: Watchlist-Tickers, Dubletten ueber Tage entfernt, Reihenfolge nach Wichtigkeit", () => {
  const digests = [
    { ticker: "PLTR", digest_date: "2026-10-04", items: [{ kind: "news", title: "A", severity: "notable" }] },
    { ticker: "PLTR", digest_date: "2026-10-05", items: [{ kind: "news", title: "A", severity: "notable" }, { kind: "hedgefund", title: "B", severity: "high" }] },
    { ticker: "AAPL", digest_date: "2026-10-05", items: [{ kind: "news", title: "C", severity: "info" }] }
  ];
  const r = composeReport({ tickers: ["pltr", "NVDA", "PLTR"], digests, reportDate: asOf, frequency: "weekly" });
  assert.deepEqual(r.tickers, ["NVDA", "PLTR"]);
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.items[0].items.map((e) => e.title), ["B", "A"]);
  assert.equal(r.eventCount, 2);
  assert.equal(composeReport({ tickers: ["NVDA"], digests, reportDate: asOf, frequency: "daily" }).empty, true);
});

test("Faelligkeit und Zeitraum", () => {
  assert.equal(reportDue("daily", "2026-10-07"), true);
  assert.equal(reportDue("weekly", "2026-10-05"), true, "Montag");
  assert.equal(reportDue("weekly", "2026-10-06"), false);
  assert.equal(reportDue("off", "2026-10-05"), false);
  assert.equal(reportWindowStart("weekly", "2026-10-05"), "2026-09-29");
  assert.equal(reportWindowStart("daily", "2026-10-05"), "2026-10-05");
});

test("E-Mail: Inhalte werden maskiert, nur https-Links", () => {
  const report = composeReport({ tickers: ["PLTR"], reportDate: asOf, frequency: "daily", digests: [{ ticker: "PLTR", digest_date: asOf,
    items: [{ kind: "news", title: "<script>alert(1)</script>", severity: "high", url: "javascript:alert(1)" }] }] });
  const mail = renderReportEmail(report, { displayName: "<b>Anna</b>" });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(!mail.html.includes("javascript:"));
  assert.ok(mail.html.includes("&lt;b&gt;Anna"));
  assert.match(mail.subject, /Tagesbericht · 1 Ereignis auf/);
  assert.match(mail.html, /Keine Anlageberatung/);
});

test("Echte Repository-Daten: Quellen lesbar, Probelauf ohne Zugangsdaten", async () => {
  const sources = await loadSources();
  assert.ok(sources.funds.length > 0, "Hedgefonds-Dateien");
  assert.ok(sources.scores && sources.scores.symbols, "fundamental_scores");
  assert.ok(sources.signals && sources.signals.bySymbol, "supertrader signals");
  const lines = [];
  const result = await run({ date: "2026-10-05", dryRun: true, log: (l) => lines.push(l) });
  assert.match(lines[0], /"mode":"DRY_RUN"/);
  for (const d of result.digests) for (const e of d.items) {
    assert.ok(e.title && e.kind && e.ticker === d.ticker);
  }
  const off = [];
  assert.equal(await run({ date: "2026-10-05", env: {}, log: (l) => off.push(l) }), null);
  assert.match(off[0], /NOT_CONFIGURED/);
});
