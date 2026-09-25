/* Market Pulse: deskriptiv, deterministisch, ohne Score (Markets 2.0 Methodik). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MP = require("../engines/multi-asset/market-pulse.js");
const CFG = require("../config/market-pulse.json");
const root = new URL("../../", import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

/* Reihe aus Tagesrenditen; Datum laufend (Werktage egal fuer die Engine). */
function series(n, step, start = 100) {
  const out = []; let v = start; const d = new Date("2020-01-01T00:00:00Z");
  for (let i = 0; i < n; i++) { out.push([d.toISOString().slice(0, 10), v]); v *= 1 + (typeof step === "function" ? step(i) : step); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const up = series(300, 0.001), down = series(300, -0.001);
const names = { SPY: "S&P 500", QQQ: "Nasdaq 100", DIA: "Dow Jones", IWM: "Russell 2000" };

test("Signale: 50/200-Tage-Linie, Renditen, Schwankung nur mit ausreichender Historie", () => {
  const s = MP.seriesSignals(up);
  assert.equal(s.above50, true); assert.equal(s.above200, true);
  assert.ok(s.ret["6M"] > 0 && s.vol20 >= 0);
  const kurz = MP.seriesSignals(series(120, 0.001));
  assert.equal(kurz.sma200, null); assert.equal(kurz.above200, null);
});

test("Trend: Mehrheitsregel 3 von 4, sonst gemischt; Tracker sind ETF-Kurse", () => {
  const all = (s) => ({ SPY: MP.seriesSignals(s), QQQ: MP.seriesSignals(s), DIA: MP.seriesSignals(s), IWM: MP.seriesSignals(s) });
  assert.equal(MP.trend(all(up), names, CFG.trend).state, "POSITIVE");
  assert.equal(MP.trend(all(down), names, CFG.trend).state, "NEGATIVE");
  const mixed = { SPY: MP.seriesSignals(up), QQQ: MP.seriesSignals(up), DIA: MP.seriesSignals(down), IWM: MP.seriesSignals(down) };
  const t = MP.trend(mixed, names, CFG.trend);
  assert.equal(t.state, "MIXED");
  assert.match(t.methodology, /ETF-Kurse, keine Indexstände/);
  assert.equal(t.evidence.length, 4);
  assert.equal(MP.trend({ SPY: MP.seriesSignals(up) }, names, CFG.trend).state, "UNAVAILABLE");
});

test("Risiko: Grenzfaelle an den kalibrierten Schwellen und Konventionen", () => {
  const base = { vol20: 10, drawdown52w: -1, asOf: "2026-09-24" };
  assert.equal(MP.risk(base, CFG.risk).state, "NORMAL");
  assert.equal(MP.risk({ ...base, vol20: CFG.risk.vol20.elevated }, CFG.risk).state, "ELEVATED");
  assert.equal(MP.risk({ ...base, vol20: CFG.risk.vol20.high }, CFG.risk).state, "HIGH");
  assert.equal(MP.risk({ ...base, drawdown52w: -10 }, CFG.risk).state, "ELEVATED");
  assert.equal(MP.risk({ ...base, drawdown52w: -20 }, CFG.risk).state, "HIGH");
  assert.equal(MP.risk({ ...base, drawdown52w: -9.99 }, CFG.risk).state, "NORMAL");
});

test("Breite: 50 %-Mehrheit definitorisch, veraltete Daten ergeben keinen Zustand, Nenner sichtbar", () => {
  const b = (m50, m200, asOf = "2026-09-24") => MP.breadth({ universe: { label: "Test" }, asOf, expectedAsOf: "2026-09-24",
    above50: { matched: m50, evaluated: 100 }, above200: { matched: m200, evaluated: 100 } });
  assert.equal(b(60, 55).state, "BROAD");
  assert.equal(b(40, 45).state, "NARROW");
  assert.equal(b(50, 60).state, "MIXED", "genau 50 % ist keine Mehrheit");
  const alt = b(60, 60, "2026-09-18");
  assert.equal(alt.state, "NOT_CURRENT");
  assert.equal(alt.raw.state, "BROAD");
  assert.ok(alt.evidence.every((e) => e.current === false));
  assert.match(alt.evidence[0].text, /60 von 100/);
});

test("Cross Asset: beschreibt Gleichlauf, bewertet nicht, behauptet keine Ursache", () => {
  const m = (change, ratio, kind = "PERCENT") => ({ change, ratio, kind, to: "2026-09-24" });
  const c = MP.crossAsset({ EQUITY: m(3, 1.5), US10Y: m(40, 1.8, "BP"), GOLD: m(1, 0.3), OIL: m(2, 0.2), BTC: m(5, 0.4), EURUSD: m(0.2, 0.1) }, CFG.crossAsset);
  assert.equal(c.state, "OBSERVED");
  assert.deepEqual(c.observations.map((o) => o.id), ["EQUITIES_AND_YIELDS_UP"]);
  const texts = JSON.stringify(c);
  assert.doesNotMatch(texts, /weil|wegen|führt zu|bearish|bullish|risk-on|risk-off|Risiko steigt/i);
  const ruhig = MP.crossAsset({ EQUITY: m(0.5, 0.2), US10Y: m(3, 0.2, "BP"), GOLD: m(1, 0.3) }, CFG.crossAsset);
  assert.equal(ruhig.state, "CALM");
  const g = MP.crossAsset({ EQUITY: m(0.5, 0.2), US10Y: m(3, 0.2, "BP"), GOLD: m(6, 1.4) }, CFG.crossAsset);
  assert.deepEqual(g.observations.map((o) => o.id), ["GOLD_UP"], "steigendes Gold ist nur 'gestiegen', nicht 'risk-off'");
});

test("Schlagzeile: aus TREND und BREADTH (plus RISK), MOMENTUM nie Teil der Basis, kein Score", () => {
  const h = MP.headline({ TREND: { state: "POSITIVE" }, BREADTH: { state: "NARROW" }, MOMENTUM: { state: "FALLING" }, RISK: { state: "ELEVATED" } });
  assert.equal(h.text, "Aufwärtstrend – aber nur wenige Aktien tragen ihn · Schwankungen erhöht");
  assert.deepEqual(h.basis, ["TREND", "BREADTH", "RISK"]);
  assert.equal(MP.headline({ TREND: { state: "POSITIVE" }, BREADTH: { state: "NOT_CURRENT" } }).text, "Aufwärtstrend bei den großen US-Markt-Trackern");
  assert.equal(MP.headline({ TREND: { state: "UNAVAILABLE" } }).state, "UNAVAILABLE");
});

test("Determinismus: gleiche Daten, gleiche Aussage", () => {
  const sigs = { SPY: MP.seriesSignals(up), QQQ: MP.seriesSignals(down), DIA: MP.seriesSignals(up), IWM: MP.seriesSignals(up) };
  assert.deepEqual(MP.trend(sigs, names, CFG.trend), MP.trend(sigs, names, CFG.trend));
  assert.deepEqual(MP.momentum(sigs, names), MP.momentum(sigs, names));
});

test("Markt jetzt: nur aktuelle Werte, keine Stufenreihen, hoechstens zwei je Gruppe, Renditen ohne Kursfarbe", () => {
  const rec = (vol) => Array.from({ length: 40 }, (_, i) => ["2026-08-" + String(i % 28 + 1).padStart(2, "0"), 100 * (1 + vol * (i % 2 ? 1 : -1))]);
  const mk = (sym, cls, change, fresh, extra = {}) => ({
    instrument: { symbol: sym, assetClass: cls, nameDe: sym },
    quote: { state: "AVAILABLE", change: extra.bp ? { semantics: "BASIS_POINTS", basisPoints: change } : { semantics: "PERCENT_OF_VALUE", percent: change },
             changeReferenceDate: "2026-09-23", asOf: "2026-09-24" },
    data: { freshness: { state: fresh } },
    history: { representation: extra.steps ? "STEPS" : "OBSERVATIONS", recent: extra.recent || rec(0.01) },
    tracker: extra.tracker || null
  });
  const out = MP.marketNow([
    mk("BTCUSD", "CRYPTO", 9, "CURRENT"), mk("ETHUSD", "CRYPTO", 8, "CURRENT"), mk("SOLUSD", "CRYPTO", 7, "CURRENT"),
    mk("XAUUSD", "PRECIOUS_METAL", 5, "STALE"),
    mk("FED_TARGET", "RATE", 25, "CURRENT", { steps: true, bp: true }),
    mk("US10Y", "YIELD", 60, "CURRENT", { bp: true, recent: Array.from({ length: 40 }, (_, i) => ["d" + i, 4 + (i % 2) * 0.1]) }),
    mk("QQQ", "ETF", 4, "LAST_SESSION", { tracker: { displayMarketName: "Nasdaq 100" } })
  ], CFG.marketNow, "2026-09-25T08:00:00Z");
  const syms = out.map((x) => x.symbol);
  assert.ok(!syms.includes("XAUUSD"), "veraltete Werte nicht");
  assert.ok(!syms.includes("FED_TARGET"), "Stufenreihen nicht");
  assert.equal(out.filter((x) => x.group === "krypto").length, 2);
  const y = out.find((x) => x.symbol === "US10Y");
  assert.equal(y.direction, "neutral"); assert.match(y.value, /bp$/); assert.match(y.title, /Rendite steigt/);
  const q = out.find((x) => x.symbol === "QQQ");
  assert.equal(q.title.startsWith("Nasdaq 100"), true); assert.equal(q.tracker, "QQQ"); assert.equal(q.session, "LAST_SESSION");
  assert.deepEqual(out, MP.marketNow([...[
    mk("BTCUSD", "CRYPTO", 9, "CURRENT"), mk("ETHUSD", "CRYPTO", 8, "CURRENT"), mk("SOLUSD", "CRYPTO", 7, "CURRENT"),
    mk("XAUUSD", "PRECIOUS_METAL", 5, "STALE"), mk("FED_TARGET", "RATE", 25, "CURRENT", { steps: true, bp: true }),
    mk("US10Y", "YIELD", 60, "CURRENT", { bp: true, recent: Array.from({ length: 40 }, (_, i) => ["d" + i, 4 + (i % 2) * 0.1]) }),
    mk("QQQ", "ETF", 4, "LAST_SESSION", { tracker: { displayMarketName: "Nasdaq 100" } })
  ]], CFG.marketNow, "2026-09-25T08:00:00Z"));
  const alt = mk("EURUSD", "FX", 3, "CURRENT"); alt.quote.observationDate = "2026-09-21";
  assert.equal(MP.marketNow([alt], CFG.marketNow, "2026-09-25T08:00:00Z").length, 0, "Beobachtung vom Wochenanfang ist nicht 'jetzt'");
  const wochenende = mk("QQQ", "ETF", 3, "LAST_SESSION"); wochenende.quote.observationDate = "2026-09-25";
  assert.equal(MP.marketNow([wochenende], CFG.marketNow, "2026-09-28T13:00:00Z").length, 1, "Freitag bleibt am Montag sichtbar");
});

test("Kalibrierung: Konfiguration reproduziert die Perzentile, alle Phasenpruefungen bestanden", () => {
  const cal = json("quant/data/market/intelligence/market-pulse-calibration.json");
  assert.equal(cal.methodVersion, MP.METHOD_VERSION);
  assert.equal(CFG.risk.vol20.elevated, cal.risk.vol20.p75);
  assert.equal(CFG.risk.vol20.high, cal.risk.vol20.p90);
  assert.equal(CFG.risk.vol20.median, cal.risk.vol20.median);
  assert.equal(CFG.risk.vol20.samples, cal.risk.vol20.samples);
  assert.equal(CFG.risk.vol20.calibratedFrom, cal.risk.vol20.calibratedFrom);
  assert.equal(cal.phasesPassed, cal.phasesTotal);
  assert.ok(cal.phasesTotal >= 10);
  const t = cal.stateFrequency.trend;
  assert.ok(t.POSITIVE < 90 && t.NEGATIVE > 5, "keine Dauerampel");
  assert.equal(cal.breadth.state, "NOT_CALIBRATED");
});

test("Artefakt: fuenf Dimensionen mit Methodik, Evidenz je Zustand, kein Regime, kein Score, keine Sektoren ohne Grundlage", () => {
  const p = "quant/data/market/intelligence/market-pulse.json";
  assert.ok(existsSync(new URL(p, root)));
  const r = json(p);
  assert.equal(r.kind, "DESCRIPTIVE_MARKET_PULSE");
  assert.equal(r.notes.macroRegime, "NOT_CERTIFIED");
  assert.match(r.notes.quantMarketRegime, /FAIL_CLOSED/);
  assert.deepEqual(Object.keys(r.dimensions), ["TREND", "BREADTH", "MOMENTUM", "RISK", "CROSS_ASSET"]);
  for (const d of Object.values(r.dimensions)) {
    assert.ok(d.methodology && d.methodology.length > 40, d.id + " Methodik");
    if (d.state !== "UNAVAILABLE") assert.ok(d.evidence.length > 0, d.id + " Evidenz");
  }
  const raw = JSON.stringify(r);
  assert.doesNotMatch(raw, /\/100|Score:|apikey|token=/i);
  assert.equal(r.sectors.state, "NOT_IMPLEMENTED");
  if (r.movers.gainers) for (const m of [...r.movers.gainers, ...r.movers.losers]) assert.deepEqual(Object.keys(m).sort(), ["changePercent", "name", "symbol"]);
});
