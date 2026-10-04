/* Signal- und Setup-Backtest (signal-backtest-1.0.0): Regeln, PIT,
   Vertrauensregel und die veroeffentlichten Studien. Geprueft wird gegen
   die Artefakte im Repository, nicht gegen eingefrorene Zahlen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const SB = require("../engines/signal-backtest.js");
const json = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const signal = json("quant/data/product/signal-backtest-v1.json");
const setup = json("quant/data/product/setup-backtest-v1.json");
const readiness = json("quant/data/product/backtest-readiness-v2.json");

function series(n, f) { return Float64Array.from({ length: n }, (_, i) => f(i)); }

test("jede Regel liest nur bis zur Signalwoche: die Zukunft zu verändern ändert nichts", () => {
  const c = series(200, (i) => 100 + 20 * Math.sin(i / 9) + i * 0.1);
  for (const rule of SB.RULES) {
    for (let i = 60; i < 150; i++) {
      const before = rule.detect(c, i, rule.params);
      const forged = Float64Array.from(c); for (let j = i + 1; j < forged.length; j++) forged[j] = j % 2 ? 1e6 : 1e-3;
      assert.equal(rule.detect(forged, i, rule.params), before, rule.id + " at " + i);
      assert.equal(rule.detect(c.slice(0, i + 1), i, rule.params), before, rule.id + " cut at " + i);
    }
  }
});

test("Momentum-Regel entspricht der Tagesdefinition: Wechsel über null", () => {
  const c = series(80, (i) => (i < 60 ? 100 - i * 0.5 : 70 + (i - 60) * 5));
  const ev = SB.detectEvents(c, SB.RULE_BY_ID.MOMENTUM_IMPROVED);
  assert.equal(ev.length, 1);
  const i = ev[0];
  assert.ok(SB.retOver(c, i, 26) >= 0 && SB.retOver(c, i - 1, 26) < 0);
});

test("Ergebnis liest strikt nach dem Einstieg und zieht die Reibung ab", () => {
  const c = series(40, (i) => 100 + i);
  const o = SB.outcome(c, 10, 4);
  assert.ok(Math.abs(o.grossRet - (114 / 110 - 1)) < 1e-12);
  assert.ok(o.ret < o.grossRet);
  assert.equal(SB.outcome(c, 38, 4), null);
});

test("Vertrauensregel: PIT oder Look-ahead fallen -> NOT_READY; ohne Gesamtrendite höchstens LIMITED", () => {
  const all = Object.fromEntries(SB.TRUST_CHECKS.map((c) => [c.id, { state: "PASS" }]));
  const big = { n: 5000, titles: 500 };
  assert.equal(SB.trustState(all, big), "ROBUST");
  assert.equal(SB.trustState({ ...all, pit: { state: "FAIL" } }, big), "NOT_READY");
  assert.equal(SB.trustState({ ...all, lookahead: { state: "FAIL" } }, big), "NOT_READY");
  assert.equal(SB.trustState({ ...all, returnBasis: { state: "FAIL" } }, big), "LIMITED");
  assert.equal(SB.trustState({ ...all, survivorship: { state: "FAIL" } }, big), "LIMITED");
  assert.equal(SB.trustState({ ...all, parameterStability: { state: "FAIL" } }, big), "USABLE");
  assert.equal(SB.trustState(all, { n: 50, titles: 5 }), "NOT_READY");
  assert.equal(SB.trustState(all, { n: 500, titles: 50 }), "LIMITED");
  assert.equal(SB.displayAllowed("NOT_READY"), false);
  assert.equal(SB.displayAllowed("LIMITED", "NOT_CERTIFIED"), false);
  assert.equal(SB.displayAllowed("LIMITED", "CERTIFIED"), true);
});

test("Signal-Studie ist veröffentlichbar und trägt Renditebasis, Prüfungen und Stufe je Regel", () => {
  assert.deepEqual(SB.studyViolations(signal), []);
  assert.equal(signal.rules.length, SB.RULES.length);
  /* Die Basis ist eine Messung der Pipeline, kein fester Wert: Gesamtrendite
     nur, wenn Titel (>= 95 %) und SPY-Benchmark sie auf derselben Wochenachse
     tragen - dann mit Vorher/Nachher gegen Kursrendite. Sonst Kursrendite
     und ein nicht bestandener Basis-Check. Nie gemischt. */
  const tr = signal.returnType === "TOTAL_RETURN";
  assert.ok(["TOTAL_RETURN", "SPLIT_ADJUSTED_PRICE"].includes(signal.returnType));
  if (tr) {
    assert.equal(signal.source.spyTotalReturn.state, "PASS", "Gesamtrendite ohne bestaetigten SPY-Vergleich");
    assert.ok(signal.source.totalReturnCoverage.share >= 0.95);
    assert.match(signal.source.benchmark, /BENCHMARK_REFERENCE/);
    assert.equal(signal.returnBasisComparison.compared, true);
    assert.deepEqual(signal.returnBasisComparison.rules.map((c) => c.id), signal.rules.map((r) => r.id));
  } else if (signal.source.spyTotalReturn) {
    assert.equal(signal.returnBasisComparison.compared, false);
  }
  for (const r of signal.rules) {
    assert.equal(r.returnType, signal.returnType, r.id);
    assert.equal(r.checks.pit.state, "PASS", r.id);
    assert.equal(r.checks.lookahead.state, "PASS", r.id);
    assert.equal(r.checks.returnBasis.state, tr ? "PASS" : "FAIL", r.id + ": Basis-Check folgt der Basis");
    assert.equal(r.checks.survivorship.state, "FAIL", "today's universe only");
    assert.ok(!["USABLE", "ROBUST"].includes(r.trust), r.id + " may not exceed LIMITED");
    assert.equal(r.trust, SB.trustState(r.checks, r.sample));
    assert.match(r.display.sentence, /-mal historisch beobachtet/);
    for (const h of SB.HORIZONS) assert.ok(r.horizons[h.id].n > 0, r.id + " " + h.id);
    assert.ok(r.path.median.length === 53 && r.distribution.events.length > 0);
  }
  assert.ok(signal.withoutHistory.every((w) => w.trust === "NOT_READY" && w.reason));
});

test("Setup-Backtest: PIT durch exakte Nachrechnung veröffentlichter Stände belegt, Freigabe nur nach Regel", () => {
  assert.deepEqual(SB.studyViolations(setup), []);
  assert.ok(setup.parity.checked > 0);
  assert.equal(setup.parity.mismatches, 0);
  assert.equal(setup.pitViolations, 0);
  for (const r of setup.rules) {
    assert.equal(r.checks.pit.state, "PASS");
    assert.equal(r.trust, SB.trustState(r.checks, r.sample));
    assert.equal(r.display.allowed, SB.displayAllowed(r.trust, setup.certification));
    if (r.sample.titles < SB.TRUST_RULE.sample.LIMITED.titles) assert.equal(r.trust, "NOT_READY");
    if (setup.certification !== "CERTIFIED") assert.equal(r.display.allowed, false, "Setup-Methodik sperrt Ausgangszahlen bis zur Zertifizierung");
  }
});

test("Setup-Wiederholung nutzt dieselbe Zeilenprojektion wie die Setup-Beobachtung", async () => {
  const replay = await import("../../scripts/quant/replay-setup-history.mjs");
  const source = readFileSync(new URL("scripts/quant/build-setup-observations.mjs", root), "utf8");
  for (const [field, read] of Object.entries(replay.ROW_SOURCES)) {
    const body = read.toString().replace(/\s+/g, " ");
    assert.ok(source.replace(/\s+/g, " ").includes(field + ": " + body), field);
  }
  const { transitionType } = await import("../../scripts/quant/build-setup-backtest.mjs");
  assert.equal(transitionType("WATCH", "CONFIRMED"), "SETUP_CONFIRMED");
  assert.equal(transitionType("NO_SETUP", "SETUP_FORMING"), "SETUP_NEW");
  assert.equal(transitionType("CONFIRMED", "WATCH"), "SETUP_WEAKENED");
  assert.equal(transitionType("WATCH", "NO_SETUP"), null);
});

test("Vertragsausstieg nutzt die Marken der vorigen Beobachtung (Setup-Pfadregeln 1 und 2)", async () => {
  const { contractExit } = await import("../../scripts/quant/build-setup-backtest.mjs");
  const obs = [["d0", "CONFIRMED", 90, 120], ["d1", "CONFIRMED", 95, 125], ["d2", "WATCH", 80, 130]];
  const idx = { d0: 0, d1: 1, d2: 2 };
  assert.deepEqual(contractExit(obs, 0, (d) => idx[d], [100, 89, 100], 1, 126), { kind: "INVALIDATION", at: 2 });
  assert.deepEqual(contractExit(obs, 0, (d) => idx[d], [100, 121, 100], 1, 126), { kind: "TARGET", at: 2 });
  assert.deepEqual(contractExit(obs, 0, (d) => idx[d], [100, 100, 100], 1, 126), { kind: "TIME_EXIT", at: 127 });
});

test("Bestandsaufnahme: jede Backtest-Art A–F mit gemessenen Gates; Strategie-Backtest geschlossen", () => {
  assert.deepEqual(readiness.kinds.map((k) => k.id), ["A", "B", "C", "D", "E", "F"]);
  for (const k of readiness.kinds) {
    assert.ok(["PUBLISHED", "WITHHELD"].includes(k.decision), k.id);
    assert.ok(k.gates.length && k.gates.every((g) => g.value !== undefined));
    if (k.decision === "WITHHELD") assert.ok(k.reasons.length, k.id + " withheld without reason");
  }
  const d = readiness.kinds.find((k) => k.id === "D");
  assert.equal(d.decision, "WITHHELD");
  assert.ok(d.reasons.includes("HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING"));
  assert.equal(readiness.returnContract.backtestPortfolioBenchmark, "TOTAL_RETURN");
});

test("Replay-Dateien enthalten keine Kursreihe (Rohkurse bleiben runner-privat)", async () => {
  const { readdirSync } = await import("node:fs");
  const { gunzipSync } = await import("node:zlib");
  const dir = new URL("quant/data/product/setup-replay-v1/", root);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json.gz"));
  assert.ok(files.length > 0);
  for (const f of files) {
    const r = JSON.parse(gunzipSync(readFileSync(new URL(f, dir))).toString("utf8"));
    assert.equal(r.priceSource, "RUNTIME_ONLY", f);
    for (const k of ["daily", "bars", "closes", "prices"]) assert.ok(!(k in r), f + " enthaelt " + k);
    assert.deepEqual(r.columns, ["date", "setupState", "invalidationPrice", "exitPrice"]);
  }
});

test("Paritaet: fortgeschriebene Staende eines festgehaltenen Schnappschusses sind ausgenommen, gezaehlt und bleiben es", async () => {
  /* Gemessen 04.10.2026: sechs Titel (AMC, CHPT, EJH, LGHL, VEEE, VIVO) mit
     Datenqualitaet "large_move" behielten ihren Technik-Schnappschuss vom
     10.09.; die Setup-Historie schrieb ihn unter jedem neuen Stichtag fort,
     die Nachrechnung des Stichtags traf ihn nicht (33 "Abweichungen"). */
  const { carriedForwardKeys } = await import("../../scripts/quant/build-setup-backtest.mjs");
  const c = carriedForwardKeys(new Map([["AMC", "2026-09-10"], ["AAPL", "2026-10-02"]]), [["CHPT", "2026-09-24"]]);
  assert.equal(c.isCarried("AMC", "2026-09-10"), false, "der Schnappschuss-Tag selbst wird nachgerechnet");
  assert.equal(c.isCarried("AMC", "2026-09-24"), true);
  assert.equal(c.isCarried("AAPL", "2026-10-02"), false, "ein frischer Titel wird nachgerechnet");
  assert.equal(c.isCarried("AAPL", "2026-09-24"), false);
  assert.equal(c.isCarried("CHPT", "2026-09-24"), true, "einmal erkannt bleibt ausgenommen, auch wenn der Titel wieder frisch ist");
  assert.equal(c.isCarried("CHPT", "2026-09-25"), false, "nur die belegten Stichtage");
  assert.equal(c.isCarried("NEU", "2026-09-24"), false, "ohne Schnappschuss kein Ausnahmegrund");
  assert.deepEqual(c.list(), [["AMC", "2026-09-24"], ["CHPT", "2026-09-24"]]);
  const src = readFileSync(new URL("scripts/quant/build-setup-backtest.mjs", root), "utf8");
  assert.match(src, /excludedCarriedForward: parityCarried, carriedForward: carried\.list\(\)/, "die Ausnahme steht im Artefakt");
  assert.match(src, /fortgeschriebene Stände eines festgehaltenen Schnappschusses/, "und im Text der PIT-Pruefung");
});
