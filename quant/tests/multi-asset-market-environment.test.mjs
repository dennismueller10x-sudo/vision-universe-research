/* Markets 3.0: Marktumfeld, "Was wuerde das Bild aendern", Vorher/Jetzt,
   Historie ohne Look-Ahead, Einordnung je Markt. Alles feste Regeln -
   gleiche Daten, gleiche Aussage; kein Score, keine Empfehlung. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MP = require("../engines/multi-asset/market-pulse.js");
const CFG = require("../config/market-pulse.json");
const root = new URL("../../", import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const E = CFG.environment;
const O = MP.STATE_ORDER;

const ADVICE = /\b(jetzt )?(kaufen|verkaufen|kauft|verkauft)\b|all-in|sollten Sie|Kaufsignal|Verkaufssignal|Portfolio auf/i;
const CAUSAL = /\bweil\b|\bwegen\b|führt zu|verursacht|Grund dafür/i;

const COMBOS = [];
for (const T of O.TREND) for (const M of O.MOMENTUM) for (const R of O.RISK) for (const B of [...O.BREADTH, "NOT_CURRENT"]) COMBOS.push({ TREND: T, MOMENTUM: M, RISK: R, BREADTH: B });

test("Entscheidungstabelle: jede Kombination hat genau eine Stufe 0..4, deterministisch", () => {
  assert.equal(COMBOS.length, 3 * 3 * 3 * 4);
  for (const c of COMBOS) {
    const l = MP.environmentLevel(c, E);
    assert.ok(Number.isInteger(l) && l >= 0 && l <= 4, JSON.stringify(c));
    assert.equal(l, MP.environmentLevel({ ...c }, E));
  }
  assert.equal(E.levels.length, 5);
  assert.deepEqual(E.levels.map((x) => x.id), ["DEFENSIVE", "CAUTIOUS", "SELECTIVE", "CONSTRUCTIVE", "BROADLY_CONSTRUCTIVE"]);
});

test("Monotonie: ein besserer Zustand einer Dimension senkt die Einordnung nie", () => {
  for (const c of COMBOS) {
    for (const k of ["TREND", "MOMENTUM", "RISK", "BREADTH"]) {
      const i = O[k].indexOf(c[k]);
      if (i === -1 || i === O[k].length - 1) continue;
      const besser = { ...c, [k]: O[k][i + 1] };
      assert.ok(MP.environmentLevel(besser, E) >= MP.environmentLevel(c, E), k + " " + JSON.stringify(c));
    }
  }
});

test("Fail closed: ohne Trend, Momentum oder Risiko keine Einordnung; fehlende Breite zaehlt weder dafuer noch dagegen", () => {
  for (const k of ["TREND", "MOMENTUM", "RISK"]) {
    assert.equal(MP.environmentLevel({ TREND: "POSITIVE", MOMENTUM: "RISING", RISK: "NORMAL", BREADTH: "BROAD", [k]: "UNAVAILABLE" }, E), null);
  }
  const env = MP.environment({ TREND: { state: "UNAVAILABLE" }, MOMENTUM: { state: "RISING" }, RISK: { state: "NORMAL" } }, E);
  assert.equal(env.state, "UNAVAILABLE"); assert.equal(env.level, null); assert.equal(env.investor, null);
  /* Breit konstruktiv nur mit aktueller breiter Beteiligung. */
  const gut = { TREND: "POSITIVE", MOMENTUM: "RISING", RISK: "NORMAL" };
  assert.equal(MP.environmentLevel({ ...gut, BREADTH: "BROAD" }, E), 4);
  assert.equal(MP.environmentLevel({ ...gut, BREADTH: "NOT_CURRENT" }, E), 3);
  assert.equal(MP.environmentLevel({ ...gut, BREADTH: "UNAVAILABLE" }, E), 3);
  /* Unbekannte Breite ist nie besser als bekannte breite und nie schlechter als bekannte schmale. */
  for (const c of COMBOS.filter((x) => x.BREADTH === "NOT_CURRENT")) {
    const u = MP.environmentLevel(c, E);
    assert.ok(u <= MP.environmentLevel({ ...c, BREADTH: "BROAD" }, E));
    assert.ok(u >= MP.environmentLevel({ ...c, BREADTH: "NARROW" }, E));
  }
  /* Cross Asset stimmt nicht mit ab. */
  const d = (st) => Object.fromEntries(Object.entries(st).map(([k, v]) => [k, { state: v, label: v, summary: "x" }]));
  const a = MP.environment(d({ ...gut, BREADTH: "MIXED", CROSS_ASSET: "OBSERVED" }), E);
  const b = MP.environment(d({ ...gut, BREADTH: "MIXED", CROSS_ASSET: "CALM" }), E);
  assert.equal(a.level, b.level);
  assert.equal(a.why.context.length, 1);
  assert.equal(a.counts.support + a.counts.neutral + a.counts.headwind + a.counts.open, 4, "vier stimmberechtigte Dimensionen, Cross Asset nur Kontext");
});

test("Risiko deckelt, Breite bestaetigt - Tabelle wie dokumentiert", () => {
  assert.equal(MP.environmentLevel({ TREND: "POSITIVE", MOMENTUM: "RISING", RISK: "ELEVATED", BREADTH: "BROAD" }, E), 2);
  assert.equal(MP.environmentLevel({ TREND: "POSITIVE", MOMENTUM: "RISING", RISK: "HIGH", BREADTH: "BROAD" }, E), 1);
  assert.equal(MP.environmentLevel({ TREND: "NEGATIVE", MOMENTUM: "FALLING", RISK: "NORMAL", BREADTH: "BROAD" }, E), 0);
  assert.equal(MP.environmentLevel({ TREND: "POSITIVE", MOMENTUM: "RISING", RISK: "NORMAL", BREADTH: "NARROW" }, E), 2);
  assert.equal(MP.environmentLevel({ TREND: "MIXED", MOMENTUM: "RISING", RISK: "NORMAL", BREADTH: "NOT_CURRENT" }, E), 2);
});

test("Sprache: keine Kauf-/Verkaufsaufforderung, keine Kausalbehauptung in Einordnung und Anlegertext", () => {
  const d = (st) => Object.fromEntries(Object.entries(st).map(([k, v]) => [k, { state: v, label: v, summary: "Zusammenfassung." }]));
  for (const c of COMBOS) {
    const env = MP.environment(d({ ...c, CROSS_ASSET: "CALM" }), E);
    const t = [env.statement, env.explanation, env.investor, ...Object.values(env.why).flat().map((x) => x.text)].join(" ");
    assert.doesNotMatch(t, ADVICE, JSON.stringify(c));
    assert.doesNotMatch(t, CAUSAL, JSON.stringify(c));
    assert.ok(env.statement.length > 10 && env.statement.length < 110, env.statement);
  }
  for (const l of E.levels) assert.doesNotMatch(l.investor, ADVICE);
  assert.match(E.disclaimer, /keine Anlageberatung/);
});

/* ---------------------------------------------------- Artefakt (echte Daten) */

const P = json("quant/data/market/intelligence/market-pulse.json");
const H = json("quant/data/market/intelligence/market-pulse-history.json");

test("Was wuerde das Bild aendern: jede Bedingung aendert die Einordnung tatsaechlich und nennt echte Schwellen", () => {
  const st = Object.fromEntries(["TREND", "MOMENTUM", "RISK", "BREADTH"].map((k) => [k, P.dimensions[k].state]));
  const jetzt = MP.environmentLevel(st, E);
  assert.equal(P.changes.level, jetzt);
  assert.equal(P.environment.level, jetzt);
  for (const [liste, richtung] of [[P.changes.better, 1], [P.changes.worse, -1]]) {
    for (const c of liste) {
      const l = MP.environmentLevel({ ...st, [c.dimension]: c.to }, E);
      assert.equal(l, c.level);
      assert.ok(richtung > 0 ? l > jetzt : l < jetzt, c.dimension + " -> " + c.to);
      assert.doesNotMatch(c.text, ADVICE);
      if (c.dimension === "RISK") assert.match(c.text, new RegExp(String(CFG.risk.vol20[c.to === "HIGH" ? "high" : "elevated"]).replace(".", ",")));
      if (c.dimension === "TREND") assert.match(c.text, new RegExp(CFG.trend.majority + " der "));
    }
  }
  /* Kontrafaktisch vollstaendig: jede Dimension mit einem einordnungsaendernden Nachbarzustand erscheint. */
  for (const k of ["TREND", "MOMENTUM", "RISK"]) {
    const aendert = O[k].filter((z) => z !== st[k]).some((z) => MP.environmentLevel({ ...st, [k]: z }, E) !== jetzt);
    assert.equal(aendert, [...P.changes.better, ...P.changes.worse].some((c) => c.dimension === k), k);
  }
});

test("Worauf es ankommt: hoechstens vier Punkte, jeder mit Begruendung und nur echten Maerkten", () => {
  const snap = json("quant/data/market/multi-asset/snapshot.json");
  const syms = new Set(snap.instruments.filter((c) => c.quote.state === "AVAILABLE").map((c) => c.instrument.symbol));
  assert.ok(P.whatMatters.length >= 1 && P.whatMatters.length <= CFG.whatMatters.max);
  for (const w of P.whatMatters) {
    assert.ok(w.title && w.why, JSON.stringify(w));
    for (const s of w.symbols) assert.ok(syms.has(s), s);
    assert.doesNotMatch(w.why + w.watch.join(" "), ADVICE);
  }
  assert.equal(new Set(P.whatMatters.map((w) => w.dimension)).size, P.whatMatters.length, "keine Dimension doppelt");
});

test("Vorher -> Jetzt: unveraendert, verbessert, verschlechtert, Zahl ohne Zustandswechsel", () => {
  const tag = (env, T, M, R, B, metrics = {}) => ({ date: "x", env, TREND: T, MOMENTUM: M, RISK: R, BREADTH: B, metrics });
  const a = tag(2, "MIXED", "RISING", "NORMAL", "NOT_CURRENT", { median3M: 1.8, vol20: 10 });
  const gleich = MP.compare(a, tag(2, "MIXED", "RISING", "NORMAL", "NOT_CURRENT", { median3M: 1.1, vol20: 12 }), E);
  assert.equal(gleich.biggest.change, "UNCHANGED");
  assert.match(gleich.biggest.text, /unverändert/);
  assert.equal(gleich.rows.find((r) => r.key === "MOMENTUM").delta, -0.7, "Zahlenbewegung sichtbar, aber keine Schlagzeile");
  const besser = MP.compare(a, tag(3, "POSITIVE", "RISING", "NORMAL", "NOT_CURRENT"), E);
  assert.equal(besser.biggest.key, "ENVIRONMENT"); assert.equal(besser.biggest.change, "BETTER");
  assert.match(besser.biggest.text, /Selektiv → Konstruktiv/); assert.match(besser.biggest.text, /Auslöser: Trend/);
  const schlechter = MP.compare(a, tag(2, "MIXED", "RISING", "ELEVATED", "NOT_CURRENT"), E);
  assert.equal(schlechter.biggest.key, "RISK"); assert.equal(schlechter.biggest.change, "WORSE");
  assert.equal(MP.compare(null, a, E).state, "UNAVAILABLE");
  /* Echter Artefaktstand: Vergleich mit der vorherigen Bewertung derselben Methode. */
  assert.equal(P.comparison.state, "AVAILABLE");
  assert.equal(P.comparison.currentDate, P.evaluation.dataAsOf);
  assert.ok(P.comparison.previousDate < P.comparison.currentDate);
});

test("Historie: point in time - jeder Tag aus Daten bis zu diesem Tag (Stichproben), Breite nur materialisiert", () => {
  assert.equal(H.method.history, "POINT_IN_TIME");
  assert.ok(H.days.length >= 250, "mindestens ein Jahr");
  const last = H.days[H.days.length - 1];
  assert.equal(last.origin, "LIVE");
  assert.equal(last.date, P.evaluation.dataAsOf);
  assert.equal(last.env, P.environment.level);
  const series = Object.fromEntries(CFG.trackers.symbols.map((s) => [s, json(`quant/data/market/multi-asset/series/${s}.json`).points]));
  const spy = series[CFG.risk.benchmark];
  const logDates = new Set(H.breadthLog.map((b) => b.asOf));
  const pct = (a, p) => a[Math.floor((p / 100) * (a.length - 1))];
  const r1 = (x) => Math.round(x * 10) / 10;
  const proben = [0, 37, 111, 180, H.days.length - 2].map((i) => H.days[i]);
  for (const d of proben) {
    /* Nur Daten bis einschliesslich d.date - alles Spaetere abgeschnitten. */
    const cut = Object.fromEntries(Object.entries(series).map(([s, p]) => [s, p.filter((x) => x[0] <= d.date).slice(-261)]));
    const sigs = Object.fromEntries(Object.entries(cut).map(([s, p]) => [s, MP.seriesSignals(p)]));
    assert.equal(MP.trend(sigs, {}, CFG.trend).state, d.TREND, d.date);
    assert.equal(MP.momentum(sigs, {}).state, d.MOMENTUM, d.date);
    const vols = [];
    const s = spy.filter((x) => x[0] <= d.date);
    for (let i = 21; i < s.length; i++) if (s[i][0] >= CFG.risk.vol20.calibratedFrom) vols.push(MP.seriesSignals(s.slice(i - 21, i + 1)).vol20);
    vols.sort((a, b) => a - b);
    const thr = { elevated: r1(pct(vols, 75)), high: r1(pct(vols, 90)) };
    assert.deepEqual(d.riskThresholds, thr, "Schwellen aus der Verteilung bis zum Tag");
    assert.equal(MP.risk(sigs[CFG.risk.benchmark], { ...CFG.risk, vol20: { ...CFG.risk.vol20, ...thr } }, "").state, d.RISK, d.date);
  }
  for (const d of H.days.slice(0, -1)) if (d.BREADTH) assert.ok(logDates.has(d.date), "Breite am " + d.date + " ohne materialisierte Messung");
  for (const d of H.days) assert.equal(d.env, MP.environmentLevel({ ...d, BREADTH: d.BREADTH || "UNKNOWN" }, E), d.date);
  /* Ereignisse nur bei echtem Zustandswechsel. */
  for (const e of H.events) { assert.notEqual(e.from, e.to); assert.ok(["BETTER", "WORSE"].includes(e.change)); }
});

test("Markt jetzt als Geschichten: gleiche Gruppe und Richtung gebuendelt, keine Ursache", () => {
  const it = (symbol, group, change, ratio, title) => ({ symbol, group, change, ratio, title, evidence: "Beleg.", asOf: "2026-09-24", session: "CURRENT" });
  const st = MP.marketNowStories([it("DE10Y", "renditen", 10, 2.4, "Bund 10J: Rendite steigt stark"), it("DE2Y", "renditen", 7, 2.1, "Bund 2J"),
                                 it("XAGUSD", "edelmetalle", 1.6, 1.2, "Silber deutlich höher"), it("BTCUSD", "krypto", -3, 1.1, "Bitcoin deutlich schwächer")]);
  assert.equal(st.length, 3);
  assert.equal(st[0].title, "Renditedruck nimmt zu");
  assert.equal(st[0].items.length, 2); assert.equal(st[0].direction, "neutral", "Renditen ohne Gewinn-/Verlustfarbe");
  assert.match(st[0].lead, /mehrere Laufzeiten/);
  assert.equal(st[1].title, "Silber deutlich höher", "eine einzelne Bewegung bleibt eine einzelne Bewegung");
  for (const s of st) { assert.doesNotMatch(s.title + s.lead + (s.why || ""), CAUSAL); assert.doesNotMatch(s.title + s.lead + (s.why || ""), ADVICE); assert.ok(s.asOf); }
  assert.deepEqual(st, MP.marketNowStories([it("DE10Y", "renditen", 10, 2.4, "Bund 10J: Rendite steigt stark"), it("DE2Y", "renditen", 7, 2.1, "Bund 2J"),
                                           it("XAGUSD", "edelmetalle", 1.6, 1.2, "Silber deutlich höher"), it("BTCUSD", "krypto", -3, 1.1, "Bitcoin deutlich schwächer")]));
});

test("Einordnung je Markt: Renditen in bp ohne Kursrisiko, Krypto 365 Tage, Rollen im Marktumfeld", () => {
  const I = P.instruments;
  for (const s of ["QQQ", "SPY", "DIA", "N225", "WTI", "XAUUSD", "BTCUSD", "US10Y", "DE10Y", "EURUSD"]) assert.ok(I[s], s);
  assert.equal(I.US10Y.kind, "YIELD");
  assert.equal(I.US10Y.vol20, undefined); assert.equal(I.US10Y.drawdown52w, undefined);
  assert.ok(Number.isFinite(I.US10Y.changes["1M"]));
  assert.equal(I.QQQ.kind, "PRICE"); assert.ok(["POSITIVE", "NEGATIVE", "MIXED"].includes(I.QQQ.trend));
  assert.ok(I.SPY.roles.some((r) => r.dimension === "RISK"));
  assert.ok(I.QQQ.roles.some((r) => r.dimension === "TREND"));
  assert.ok(!I.FED_TARGET, "Stufenreihen (Beschluesse) bekommen keine Kurskennzahlen");
  /* 20 Tagesrenditen annualisiert: Krypto mit 365, Aktien mit 252 Tagen. */
  const pts = Array.from({ length: 400 }, (_, i) => [new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), 100 * (1 + 0.01 * (i % 2))]);
  const a = MP.instrumentSignals(pts, "PRICE", 365), b = MP.instrumentSignals(pts, "PRICE", 252);
  assert.ok(Math.abs(a.vol20 / b.vol20 - Math.sqrt(365 / 252)) < 1e-3);
  assert.equal(MP.instrumentSignals(pts.slice(0, 10), "PRICE", 252), null, "zu kurze Reihe: keine Kennzahlen");
});

test("Artefakt: Marktumfeld, Bewertungszyklus, Messskalen - ohne Score, Zeitplan wie der Workflow", () => {
  assert.equal(P.environment.version, MP.ENVIRONMENT_VERSION);
  assert.ok(E.levels.some((l) => l.id === P.environment.state));
  assert.ok(P.environment.statement && P.environment.investor && P.environment.methodology);
  const wf = readFileSync(new URL(".github/workflows/multi-asset-data.yml", root), "utf8");
  assert.match(wf, new RegExp("cron: '" + CFG.evaluation.cron.replace(/\*/g, "\\*") + "'"), "Zeitplan in der Konfiguration = Workflow-Cron");
  assert.match(wf, /market-pulse-history\.json/, "Historie wird mit dem Lauf materialisiert");
  assert.equal(P.evaluation.schedule.cron, CFG.evaluation.cron);
  for (const [k, g] of Object.entries(P.gauges)) {
    assert.ok(g.value >= g.min && g.value <= g.max, k);
    assert.ok(g.valueText, k);
  }
  assert.equal(P.gauges.RISK.marks.find((m) => m.label === "erhöht").at, CFG.risk.vol20.elevated, "Skala nutzt die echte Schwelle");
  const raw = JSON.stringify(P);
  assert.doesNotMatch(raw, /\/100\b|Score:|score"\s*:\s*\d/i);
  assert.ok(existsSync(new URL(H.days.length ? "quant/data/market/intelligence/market-pulse-history.json" : "x", root)));
  const hraw = JSON.stringify(H);
  assert.doesNotMatch(hraw, /apikey|token=/i);
});
