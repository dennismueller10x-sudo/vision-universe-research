#!/usr/bin/env node
/* =========================================================================
   BACKTEST READINESS v2 - gemessen, je Backtest-Art getrennt.

   Erst messen, dann entscheiden: jede Datenbasis wird aus den Dateien im
   Repository gezaehlt (nicht aus Dokumentation). Jede Backtest-Art bekommt
   ihre eigenen Gates mit gemessenem Wert und eine Entscheidung:

     PUBLISHED  Ergebnisse sichtbar, mit Vertrauensstufe und Vorbehalten
     WITHHELD   nicht freigegeben, Grund gemessen

     A  Rueckblick derselben Aktie
     B  Setup-Backtest
     C  Signal-Backtest
     D  Strategie-Backtest
     E  Faktor-/Ranking-Backtest
     F  Marktweites Muster

   Schreibt quant/data/product/backtest-readiness-v2.json.
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = (...p) => join(ROOT, ...p);
const json = (p) => JSON.parse(readFileSync(P(p), "utf8"));
const gz = (p) => JSON.parse(gunzipSync(readFileSync(P(p))).toString("utf8"));
const list = (p, re) => (existsSync(P(p)) ? readdirSync(P(p)).filter((f) => re.test(f)).sort() : []);
const dates = (files) => files.map((f) => f.slice(0, 10));
const daysBetween = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0);

/* ---------- Bestand ---------- */
const setupDates = dates(list("quant/data/product/setup-observation-history/setup-mapping-1.0.0", /\.json\.gz$/));
const factorIndex = json("quant/data/product/factor-evidence-history/index.json");
const factorDates = Object.values(factorIndex.series).flat().sort();
const regimeDates = dates(list("quant/data/product/market-regime-history", /^\d{4}-\d{2}-\d{2}\.json$/));
const patternHoldDates = dates(list("quant/data/product/radar-history/pattern-holds", /\.json\.gz$/));
const membership = Object.fromEntries(["SP500", "NDX", "DJIA"].map((ix) => [ix, dates(list("quant/data/market/index-membership/history/" + ix, /\.json$/))]));
const strategyIndex = gz("quant/data/product/strategy-index-v1.json.gz");
const strategyHistory = strategyIndex.historicalEvidence || {};
const strategyProfiles = json("quant/methodology/strategies-v1.json");
const rebalance = [...new Set((JSON.stringify(strategyProfiles).match(/"rebalance":"[a-z]+"/g) || []).map((x) => x.split('"')[3]))];

const longIndex = json("quant/data/market/discover-series-long/index.json");
let longFirst = null, longEndedEarly = 0;
for (const f of list("quant/data/market/discover-series-long", /^ref_.*\.json$/)) {
  const j = json("quant/data/market/discover-series-long/" + f);
  if (!longFirst || j.from < longFirst) longFirst = j.from;
  if (j.to < "2026-03-01") longEndedEarly++;
}
const golden = list("quant/data/market/golden-preview/daily", /\.json$/).map((f) => {
  const j = json("quant/data/market/golden-preview/daily/" + f);
  return { ticker: j.ticker, from: j.bars[0].date, to: j.bars.at(-1).date, bars: j.bars.length,
    splits: j.bars.filter((b) => b.splitFactor !== 1).length, dividends: j.bars.filter((b) => b.dividend > 0).length,
    totalReturn: j.bars.every((b) => b.adjustedClose > 0) };
});
const dailyShort = list("quant/data/market/discover-series", /^ref_.*\.json$/).length;
const spy = json("quant/data/market/multi-asset/series/SPY.json");
const fundamentals = json("quant/data/fundamentals/backtest-readiness.json");
const pattern = existsSync(P("quant/data/product/pattern-research-v1/study.json")) ? json("quant/data/product/pattern-research-v1/study.json") : null;
const patternMethod = json("quant/methodology/pattern-research-v1.json");
const evidence = json("quant/data/product/evidence-status-v1.json");
const signal = existsSync(P("quant/data/product/signal-backtest-v1.json")) ? json("quant/data/product/signal-backtest-v1.json") : null;
const setup = existsSync(P("quant/data/product/setup-backtest-v1.json")) ? json("quant/data/product/setup-backtest-v1.json") : null;
const returnSemantics = json("quant/methodology/return-semantics-v1.json");
const backtestModule = returnSemantics.modules.find((m) => m.id === "backtest");

const assets = [
  { id: "setupObservations", label: "Setup-Beobachtungen und Wechsel", count: setupDates.length, from: setupDates[0] || null, to: setupDates.at(-1) || null, spanDays: daysBetween(setupDates[0], setupDates.at(-1)),
    replay: setup ? { titles: setup.source.titles.length, observations: setup.source.titles.reduce((s, t) => s + t.observations, 0), from: setup.source.titles.map((t) => t.from).sort()[0] } : null },
  { id: "factorSnapshots", label: "Faktor-Snapshots", count: factorDates.length, from: factorDates[0] || null, to: factorDates.at(-1) || null, spanDays: daysBetween(factorDates[0], factorDates.at(-1)) },
  { id: "strategyAssignments", label: "Strategie-Zuordnungen und Wechsel", count: strategyHistory.published || 0, from: strategyHistory.from || null, to: strategyHistory.to || null, spanDays: daysBetween(strategyHistory.from, strategyHistory.to) },
  { id: "membershipSnapshots", label: "Index-Zugehörigkeit (historisch)", count: Math.min(...Object.values(membership).map((d) => d.length)), byIndex: Object.fromEntries(Object.entries(membership).map(([k, v]) => [k, v.length])), from: Object.values(membership).flat().sort()[0] || null },
  { id: "priceSplitAdjusted", label: "Kurshistorie splitbereinigt", weekly: { titles: longIndex.count, from: longFirst, grain: "WEEKLY", endedBeforeMarch2026: longEndedEarly }, daily: { titlesFullHistory: golden.length, titlesLastYear: dailyShort } },
  { id: "priceTotalReturn", label: "Kurshistorie Gesamtrendite", weekly: { titles: 0, reason: "TOTAL_RETURN_SERIES_NOT_PUBLISHED" }, daily: { titles: golden.filter((g) => g.totalReturn).length, tickers: golden.map((g) => g.ticker) } },
  { id: "regimeHistory", label: "Marktphasen-Historie", count: regimeDates.length, from: regimeDates[0] || null, derivable: { from: spy.from, source: "SPY täglich (Kurs)" } },
  { id: "patternObservations", label: "Muster-Beobachtungen", studyFindings: pattern ? (pattern.findings || []).length : null, robust: pattern ? (pattern.findings || []).filter((f) => f.verdict === "ROBUST").length : null, matchSnapshots: patternHoldDates.length },
  { id: "technicalStates", label: "Technische Zustände", publishedSnapshots: 1, reconstructible: { titles: golden.length, method: "PIT-Wiederholung der technischen Auswertung" } },
  { id: "levels", label: "Einstieg, Invalidierung, Ziele", publishedSnapshots: setupDates.length, reconstructible: { titles: golden.length } },
  { id: "corporateActions", label: "Corporate Actions", titles: golden.length, splits: golden.reduce((s, g) => s + g.splits, 0), dividends: golden.reduce((s, g) => s + g.dividends, 0), universe: "nur im privaten Historienspeicher" },
  { id: "benchmark", label: "Vergleichsindex", series: "SPY", from: spy.from, to: spy.to, basis: "SPLIT_ADJUSTED_PRICE", totalReturn: false, reason: (returnSemantics.modules.find((m) => m.id === "benchmark") || {}).activation?.reason || null },
  { id: "costs", label: "Kosten und Slippage", roundTripBps: patternMethod.frictions.roundTripBps, slippageBps: patternMethod.frictions.slippageBps },
  { id: "pitFundamentals", label: "Fundamentaldaten point-in-time", ready: fundamentals.BACKTEST_PIT_FUNDAMENTAL_READY, of: fundamentals.denominator.PRODUCT_TITLES },
  { id: "survivorship", label: "Überlebende-Kontrolle", delistedInUniverse: 0, membershipSnapshots: Math.min(...Object.values(membership).map((d) => d.length)), state: "NOT_CONTROLLED" }
];

/* ---------- Je Backtest-Art ---------- */
const gate = (id, label, pass, value, reason) => ({ id, label, state: pass ? "PASS" : "FAIL", value, reason: pass ? null : reason });
const ruleSummary = (study) => study ? study.rules.map((r) => ({ id: r.id, trust: r.trust, n: r.sample.n, titles: r.sample.titles, displayAllowed: r.display.allowed, returnType: r.returnType })) : [];
const replayKind = evidence.kinds.find((k) => k.id === "HISTORICAL_REPLAY");
const membershipMin = assets.find((a) => a.id === "membershipSnapshots").count;
const kinds = [
  { id: "A", key: "SAME_STOCK_REPLAY", label: "Rückblick derselben Aktie", returnType: "SPLIT_ADJUSTED_PRICE",
    gates: [gate("history", "Wochenhistorie", longIndex.count > 0, longIndex.count + " Titel seit " + longFirst, "NO_HISTORY"),
      gate("episodes", "abgeschlossene Fälle je Zeitraum", true, "Zahlen ab 10 Fällen, breit ab 30", null),
      gate("pit", "nur Daten bis zum Fall", true, "historical-cases liest nur bis zum Stichtag", null)],
    decision: replayKind && replayKind.state === "PUBLISHED" ? "PUBLISHED" : "WITHHELD", note: "Kein Backtest, sondern dieselbe Lage derselben Aktie in der Vergangenheit; Zahlen nur ab 10 abgeschlossenen Fällen." },
  { id: "B", key: "SETUP_BACKTEST", label: "Setup-Backtest", returnType: setup ? setup.returnType : null,
    gates: [gate("pit", "Point-in-Time-Wiederholung", !!setup && setup.pitViolations === 0 && setup.parity.checked > 0 && setup.parity.mismatches === 0, setup ? setup.parity.checked + " veröffentlichte Stände exakt nachgerechnet, " + setup.pitViolations + " Verstöße" : "keine Wiederholung", "PIT_NOT_PROVEN"),
      gate("history", "Titel mit voller Tageshistorie", golden.length >= 20, golden.length + " Titel im Repository (nötig 20)", "DAILY_HISTORY_ONLY_IN_PRIVATE_STORE"),
      gate("totalReturn", "Gesamtrendite", golden.every((g) => g.totalReturn), "Gesamtrendite für " + golden.filter((g) => g.totalReturn).length + " Titel", "TOTAL_RETURN_MISSING"),
      gate("survivorship", "Überlebende-Kontrolle", false, "handverlesene, heute gelistete Titel", "HAND_PICKED_SURVIVORS")],
    rules: ruleSummary(setup) },
  { id: "C", key: "SIGNAL_BACKTEST", label: "Signal-Backtest", returnType: signal ? signal.returnType : null,
    gates: [gate("pit", "Point-in-Time", !!signal && signal.rules.every((r) => r.checks.pit.state === "PASS"), signal ? "abgeschnittene und verfälschte Zukunft je Regel geprüft" : "keine Studie", "PIT_NOT_PROVEN"),
      gate("history", "Wochenhistorie", longIndex.count >= 1000, longIndex.count + " Titel seit " + longFirst, "HISTORY_TOO_SHORT"),
      gate("totalReturn", "Gesamtrendite", false, "nur splitbereinigter Kurs", "TOTAL_RETURN_SERIES_NOT_PUBLISHED"),
      gate("survivorship", "Überlebende-Kontrolle", false, "heute gelistetes Universum, " + longEndedEarly + " früh endende Reihen", "TODAYS_UNIVERSE_ONLY")],
    rules: ruleSummary(signal) },
  { id: "D", key: "STRATEGY_BACKTEST", label: "Strategie-Backtest", returnType: backtestModule.basis,
    gates: [gate("membership", "historische Index-Zugehörigkeit", membershipMin >= 24, membershipMin + " Stichtage je Index (nötig 24 Monatsstände)", "HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING"),
      gate("totalReturn", "Gesamtrendite des Universums", false, "nur " + golden.length + " Titel mit Gesamtrendite", "TOTAL_RETURN_SERIES_NOT_PUBLISHED"),
      gate("pitFactors", "Faktorhistorie point-in-time", factorDates.length >= 24, factorDates.length + " Faktor-Snapshots seit " + factorDates[0], "FACTOR_HISTORY_TOO_SHORT"),
      gate("rebalance", "Rebalancing-Vertrag", rebalance.length > 0, "Profile: " + rebalance.join(", "), "NO_REBALANCE_CONTRACT"),
      gate("costs", "Kosten", true, patternMethod.frictions.roundTripBps + " + " + patternMethod.frictions.slippageBps + " bps", null),
      gate("benchmark", "Vergleichsindex mit Gesamtrendite", false, "SPY nur als Kurs", "NO_INDEX_LEVEL_SERIES_PUBLISHED")],
    note: "Bleibt geschlossen, bis die Index-Zugehörigkeit historisch vorliegt. Das heutige Universum wird nie eingesetzt." },
  { id: "E", key: "FACTOR_RANKING_BACKTEST", label: "Faktor-/Ranking-Backtest", returnType: "TOTAL_RETURN",
    gates: [gate("factorHistory", "Faktorhistorie", factorDates.length >= 24, factorDates.length + " Snapshots über " + daysBetween(factorDates[0], factorDates.at(-1)) + " Tage", "FACTOR_HISTORY_TOO_SHORT"),
      gate("pitFundamentals", "Fundamentaldaten datierbar", fundamentals.BACKTEST_PIT_FUNDAMENTAL_READY > 0, fundamentals.BACKTEST_PIT_FUNDAMENTAL_READY + " von " + fundamentals.denominator.PRODUCT_TITLES + " Titeln", "PIT_FUNDAMENTALS_MISSING"),
      gate("survivorship", "Überlebende-Kontrolle", false, "keine historische Zugehörigkeit", "HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING")],
    note: "Ranking-Snapshots gibt es erst seit " + factorDates[0] + ". Eine Rückrechnung der Faktoren aus PIT-Fundamentaldaten wäre ein eigener Methodikschritt." },
  { id: "F", key: "MARKET_PATTERN_BACKTEST", label: "Marktweites Muster", returnType: "SPLIT_ADJUSTED_PRICE",
    gates: [gate("study", "Musterstudie mit Out-of-Sample", !!pattern, pattern ? (pattern.findings || []).length + " Befunde, davon " + (pattern.findings || []).filter((f) => f.verdict === "ROBUST").length + " robust" : "keine Studie", "NO_STUDY"),
      gate("backtestGate", "Backtest-Freigabe der Studie", pattern ? pattern.backtest !== "NOT_CERTIFIED" : false, pattern && pattern.backtest === "NOT_CERTIFIED" ? "als Häufigkeitsauswertung freigegeben, nicht als Backtest" : "freigegeben", "STUDY_DECLARES_BACKTEST_NOT_CERTIFIED"),
      gate("survivorship", "Überlebende-Kontrolle", false, "Überlebenden-Effekt teilweise nicht quantifiziert", "PRESENT_AND_UNQUANTIFIED_IN_PART")],
    note: "Veröffentlicht als bedingte Häufigkeiten (Marktmuster), nicht als Backtest." }
];
for (const k of kinds) {
  if (k.decision) continue;
  if (k.rules) {
    const shown = k.rules.filter((r) => r.displayAllowed);
    k.decision = shown.length ? "PUBLISHED" : "WITHHELD";
    k.trust = k.rules.length ? k.rules.map((r) => r.trust).sort((a, b) => ["NOT_READY", "LIMITED", "USABLE", "ROBUST"].indexOf(b) - ["NOT_READY", "LIMITED", "USABLE", "ROBUST"].indexOf(a))[0] : "NOT_READY";
  } else k.decision = "WITHHELD";
  k.reasons = k.gates.filter((g) => g.state === "FAIL").map((g) => g.reason);
}
for (const k of kinds) if (!k.reasons) k.reasons = k.gates.filter((g) => g.state === "FAIL").map((g) => g.reason);

const out = {
  schemaVersion: "backtest-readiness-2.0.0", generatedAt: new Date().toISOString(),
  returnContract: { technicalSetupMomentum: "SPLIT_ADJUSTED_PRICE", backtestPortfolioBenchmark: backtestModule.basis, source: "quant/methodology/return-semantics-v1.json" },
  assets, kinds,
  levers: [
    { id: "dailyHistoryInPipeline", plain: "Setup-Wiederholung im Pipeline-Lauf mit dem privaten Historienspeicher (--source .market-cache/tiingo/daily)", unlocks: ["B"] },
    { id: "weeklyTotalReturn", plain: "Wöchentliche Gesamtrendite-Reihen neben den splitbereinigten veröffentlichen", unlocks: ["C"] },
    { id: "delistedTitles", plain: "Delistete Titel mit Kurshistorie in das Studienuniversum aufnehmen", unlocks: ["B", "C", "F"] },
    { id: "membershipHistory", plain: "Monatliche historische Index-Zugehörigkeit (≥ 24 Stände)", unlocks: ["D", "E"] }
  ]
};
writeFileSync(P("quant/data/product/backtest-readiness-v2.json"), JSON.stringify(out, null, 1) + "\n");
for (const k of kinds) console.log(k.id, k.key.padEnd(24), k.decision.padEnd(9), k.trust || "", "|", k.reasons.join(", ") || "–");
