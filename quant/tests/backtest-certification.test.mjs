/* Backtest-Zertifizierung: Status-Regel, Strategie-/Faktor-Engine und
   Sabotage-Gegenproben. Ein gruener Guard zaehlt nur, wenn die Sabotage
   ihn rot werden laesst. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const C = require("../engines/backtest-certification.js");
const PB = require("../engines/profile-backtest.js");
const SB = require("../engines/signal-backtest.js");
const json = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const contract = json("quant/methodology/strategy-backtest-contract-v1.json");

const g = (cat, pass, id) => C.gate(id || cat.toLowerCase(), id || cat, cat, pass, null);

test("Status folgt den Gates: HARD vor HISTORY vor Zertifizierung", () => {
  assert.equal(C.classify({ gates: [g("HARD", false), g("HISTORY", false)], trust: "ROBUST", published: true }).status, "WITHHELD");
  assert.equal(C.classify({ gates: [g("HARD", true), g("HISTORY", false)], trust: "ROBUST", published: true }).status, "COLLECTING_HISTORY");
  assert.equal(C.classify({ gates: [g("HARD", true), g("STRUCTURAL", false)], trust: "LIMITED", published: true }).status, "LIMITED");
  assert.equal(C.classify({ gates: [g("HARD", true), g("STRUCTURAL", false)], trust: "LIMITED", published: false }).status, "WITHHELD");
  const ok = C.classify({ gates: [g("HARD", true), g("QUALITY", true)], trust: "USABLE", published: true });
  assert.deepEqual([ok.status, ok.readiness], ["CERTIFIED", "CERTIFICATION_READY"]);
  const owner = C.classify({ gates: [g("HARD", true)], trust: "USABLE", published: true, ownerApproval: { required: true, given: false } });
  assert.deepEqual([owner.status, owner.readiness, owner.reason], ["WITHHELD", "OWNER_APPROVAL_REQUIRED", "OWNER_APPROVAL_REQUIRED"]);
  /* Vertrauen unter der Schwelle zertifiziert nie, auch mit allen Gates. */
  assert.equal(C.classify({ gates: [g("HARD", true)], trust: "LIMITED", published: true }).status, "LIMITED");
});

test("Sabotage: ein Artefakt, das CERTIFIED behauptet, obwohl ein Gate offen ist, faellt durch", () => {
  const doc = json("quant/data/product/backtest-certification-v1.json");
  assert.deepEqual(C.certificationViolations(doc), []);
  const forged = JSON.parse(JSON.stringify(doc));
  const k = forged.kinds.find((x) => x.gates.some((y) => y.state === "FAIL"));
  k.status = "CERTIFIED"; k.readiness = "CERTIFICATION_READY";
  assert.ok(C.certificationViolations(forged).length > 0, "eine gefaelschte Zertifizierung muss erkannt werden");
});

test("Veroeffentlichter Stand: keine Art ist zertifiziert, ohne dass jedes Gate besteht", () => {
  const doc = json("quant/data/product/backtest-certification-v1.json");
  assert.deepEqual(doc.kinds.map((k) => k.id), ["SAME_STOCK_REPLAY", "PATTERN_EVIDENCE", "SIGNAL_BACKTEST", "SETUP_BACKTEST", "STRATEGY_BACKTEST", "FACTOR_RANKING_BACKTEST"]);
  for (const k of doc.kinds) for (const x of [k].concat(k.rules || [])) {
    assert.ok(C.STATUSES.includes(x.status), x.id);
    if (x.status === "CERTIFIED") assert.ok(x.gates.every((y) => y.state === "PASS"), x.id);
    if (x.status !== "CERTIFIED") assert.ok(x.reason, x.id + " ohne Grund");
  }
  const setup = doc.kinds.find((k) => k.id === "SETUP_BACKTEST");
  assert.equal(setup.ownerApproval.required, true, "die Setup-Methodik verlangt eine Owner-Freigabe");
  assert.ok(setup.gates.some((x) => x.id === "publishedOnly" && x.state === "PASS"), "nur veroeffentlichte Zustaende");
  const strat = doc.kinds.find((k) => k.id === "STRATEGY_BACKTEST");
  assert.notEqual(strat.status, "CERTIFIED");
  assert.equal(doc.survivorship.gate, "PASS");
  assert.equal(doc.survivorship.control, "FAIL");
});

/* ---------- Strategie-/Faktor-Engine an Fixtures ---------- */
function calendar(from, n) { const out = []; let d = new Date(from + "T00:00:00Z"); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); } return out; }
const days = calendar("2024-01-02", 260);
function series(drift, end) { const ds = end ? days.filter((d) => d <= end) : days; return { dates: ds, tr: ds.map((_, i) => 100 * Math.pow(1 + drift, i)) }; }
const tickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"];
const prices = { AAA: series(0.002), BBB: series(0.001), CCC: series(0.0005), DDD: series(-0.0005), EEE: series(0.0015, "2024-05-15"), FFF: series(0.0001) };
const benchmark = series(0.0007);
const profile = { profileId: "fixture", conditions: [{ id: "quality", operator: "gte", value: 50, weight: 1 }] };
const membership = [{ asOf: "2023-12-29", members: tickers }];
const snaps = ["2023-12-29", "2024-01-31", "2024-02-29", "2024-03-29", "2024-04-30", "2024-05-31", "2024-06-28", "2024-07-31", "2024-08-30", "2024-09-30", "2024-10-31", "2024-11-29"]
  .map((asOf) => ({ asOf, rows: { AAA: { quality: 80 }, BBB: { quality: 70 }, CCC: { quality: 60 }, DDD: { quality: 40 }, EEE: { quality: 90 }, FFF: {} } }));
const membershipMonthly = snaps.map((s) => ({ asOf: s.asOf, members: tickers }));
const base = { contract, profile, membership: membershipMonthly, snapshots: snaps, prices, benchmark, from: "2024-01-02", to: days[days.length - 1] };

test("Engine: Auswahl ohne Ersatzwerte, deterministische Gleichstaende, Delisting gezaehlt", () => {
  const r = PB.run(base);
  assert.ok(r.rebalances >= 10);
  assert.ok(r.delistedExits >= 1, "EEE endet im Mai und muss als Delisting gezaehlt werden");
  assert.equal(PB.select(profile, tickers, snaps[0].rows, 30).includes("FFF"), false, "fehlender Wert erfuellt keine Bedingung");
  assert.deepEqual(PB.select({ conditions: [{ id: "q", operator: "gte", value: 0, weight: 1 }] }, ["ZZZ", "AAA"], { ZZZ: { q: 1 }, AAA: { q: 1 } }, 30), ["AAA", "ZZZ"]);
  assert.ok(r.metrics.cagr !== null && r.metrics.maxDrawdown <= 0);
});

test("Kosten: HIGH < BASE < LOW", () => {
  const v = (id) => { const r = PB.run({ ...base, costScenario: id }); return r.equity[r.equity.length - 1][1]; };
  assert.ok(v("HIGH") < v("BASE") && v("BASE") < v("LOW"));
});

test("Sabotage Look-ahead: ein Snapshot aus der Zukunft aendert nichts", () => {
  const clean = PB.run(base);
  /* Hellseherischer Stand, datiert AM Rebalancing-Tag: DDD wird zum Spitzenreiter. */
  const leak = snaps.concat(PB.monthlyDates(days, base.from, base.to).map((d) => ({ asOf: d, rows: { DDD: { quality: 99 }, AAA: { quality: 10 } } })));
  const dirty = PB.run({ ...base, snapshots: leak });
  assert.deepEqual(dirty.equity.slice(-1), clean.equity.slice(-1), "ein Stand vom Termin selbst darf nicht gelesen werden");
});

test("Sabotage Survivorship: ohne historische Zugehoerigkeit bricht der Lauf ab, statt das heutige Universum zu nehmen", () => {
  assert.throws(() => PB.run({ ...base, membership: [{ asOf: "2026-09-26", members: tickers }] }), /MEMBERSHIP_STALE/);
  assert.throws(() => PB.run({ ...base, membership: [{ asOf: "2023-06-30", members: tickers }] }), /MEMBERSHIP_STALE/);
});

test("Faktor-Quintile: monotoner Faktor ergibt positives Top minus Bottom; Zukunft ausgeschlossen", () => {
  const many = {}, rows = {}, mem = [];
  for (let i = 0; i < 50; i++) { const t = "T" + i; many[t] = series(0.00002 * i); rows[t] = { momentum: i }; mem.push(t); }
  const q = PB.quintiles({ contract, membership: snaps.map((s) => ({ asOf: s.asOf, members: mem })), snapshots: snaps.map((s) => ({ asOf: s.asOf, rows })), prices: many, benchmark, factorId: "momentum" });
  assert.ok(q.periods.length > 0 && q.meanTopMinusBottom > 0);
  assert.equal(q.topTurnover, 0);
});

test("Historienabdeckung misst Monate, Luecken und Alter", () => {
  const c = PB.historyCoverage(["2026-09-15", "2026-09-26"], "2026-10-01");
  assert.deepEqual([c.snapshots, c.months, c.maxGapDays, c.staleDays], [2, 1, 11, 5]);
});

/* ---------- Signal-Studie: Sabotage der Renditebasis und des PIT ---------- */
test("Sabotage Renditebasis: eine Basis behaupten, die der Check nicht traegt, faellt durch", () => {
  const s = json("quant/data/product/signal-backtest-v1.json");
  assert.deepEqual(SB.studyViolations(s), []);
  /* Basisunabhaengig: die jeweils andere Basis behaupten - Kursrendite als
     Gesamtrendite ausgeben oder umgekehrt -, ohne den Check anzupassen. */
  const other = s.returnType === "TOTAL_RETURN" ? "SPLIT_ADJUSTED_PRICE" : "TOTAL_RETURN";
  const forged = JSON.parse(JSON.stringify(s));
  forged.rules[0].returnType = other;
  assert.ok(SB.studyViolations(forged).some((e) => /returnType/.test(e)));
  /* Und der Check allein gekippt: Basis und Check widersprechen sich. */
  const flipped = JSON.parse(JSON.stringify(s));
  flipped.rules[0].checks.returnBasis.state = flipped.rules[0].checks.returnBasis.state === "PASS" ? "FAIL" : "PASS";
  assert.ok(SB.studyViolations(flipped).some((e) => /returnBasis/.test(e)));
});

test("Sabotage Look-ahead: eine Regel, die in die Zukunft schaut, wird vom PIT-Nachweis erkannt", () => {
  const leaky = { id: "LEAK", params: {}, detect: (c, i) => c[i + 1] > c[i] };
  const c = Float64Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 3) * 10);
  let mismatch = 0;
  for (let i = 60; i < 110; i++) if (leaky.detect(c, i) !== leaky.detect(c.slice(0, i + 1), i)) mismatch++;
  assert.ok(mismatch > 0, "der Abschneide-Test muss eine schauende Regel entlarven");
  for (const rule of SB.RULES) for (let i = 60; i < 110; i++) assert.equal(rule.detect(c, i, rule.params), rule.detect(c.slice(0, i + 1), i, rule.params));
});

test("Sabotage Survivorship: hohe Vertrauensstufe ohne Kontrolle wird abgelehnt", () => {
  const s = json("quant/data/product/signal-backtest-v1.json");
  const forged = JSON.parse(JSON.stringify(s));
  forged.rules[0].trust = "USABLE";
  assert.ok(SB.studyViolations(forged).length > 0);
});

test("Signal-Studie: Base Rate derselben Woche und unabhaengige Faelle je Regel", () => {
  const s = json("quant/data/product/signal-backtest-v1.json");
  assert.equal(s.regime.used, false);
  for (const r of s.rules) {
    const m = r.horizons.m6;
    assert.ok(m.baseRate && typeof m.baseRate.deltaPositiveShare === "number" && Array.isArray(m.baseRate.ci), r.id);
    assert.ok(Math.abs(m.positiveShare - m.baseRate.matchedPositiveShare - m.baseRate.deltaPositiveShare) < 1e-3, r.id + " Delta = Quote - Base Rate");
    assert.ok(r.independence.effectiveN > 0 && r.independence.effectiveN < r.sample.n, r.id + " effektive Fallzahl kleiner als Rohzahl");
    assert.ok(m.costSensitivity.HIGH.median <= m.costSensitivity.BASE.median && m.costSensitivity.BASE.median <= m.costSensitivity.LOW.median, r.id);
    assert.equal(r.parameterStability.entryDelay.length, 3);
    assert.equal(r.checks.regimeDiversity.reason, "REGIME_HISTORY_NOT_CERTIFIED");
  }
});

test("Woechentliche Gesamtrendite: letzter Handelstag der Woche, Dividenden enthalten", async () => {
  const { weekKey, weeklyFromDaily } = await import("../../scripts/quant/lib/weekly-total-return.mjs");
  const { fromBars } = await import("../../scripts/quant/lib/daily-prices.mjs");
  assert.equal(weekKey("2026-09-28"), "2026-10-02");
  assert.equal(weekKey("2026-10-02"), "2026-10-02");
  const d = fromBars(json("quant/data/market/golden-preview/daily/ref_JPM.json"));
  assert.ok(d.totalReturn);
  const keys = [...new Set(d.dates.map(weekKey))].sort(), idx = new Map(keys.map((k, i) => [k, i]));
  const tr = weeklyFromDaily(d.dates, d.tr, idx, keys.length), px = weeklyFromDaily(d.dates, d.close, idx, keys.length);
  const first = tr.findIndex((v) => v > 0), last = tr.length - 1;
  assert.ok(tr[last] / tr[first] > px[last] / px[first], "eine Dividendenaktie hat ueber Jahre mehr Gesamt- als Kursrendite");
  /* Ohne Dividende in einer Woche sind Gesamt- und Kursrendite dieser Woche gleich. */
  const bars = json("quant/data/market/golden-preview/daily/ref_JPM.json").bars;
  const divWeeks = new Set(bars.filter((b) => b.dividend > 0).map((b) => weekKey(b.date)));
  let checked = 0;
  for (let w = first + 1; w < tr.length && checked < 50; w++) {
    if (divWeeks.has(keys[w]) || !(tr[w - 1] > 0) || !(tr[w] > 0)) continue;
    assert.ok(Math.abs(tr[w] / tr[w - 1] - px[w] / px[w - 1]) < 1e-6, keys[w]);
    checked++;
  }
  assert.ok(checked >= 50);
});

test("Sabotage Datenschutz: eine Kursreihe in einem Artefakt wird gefunden, ein Beschreibungstext nicht", async () => {
  const { hasPriceKeys } = await import("../../scripts/quant/lib/privacy-scan.mjs");
  assert.equal(hasPriceKeys({ source: { priceSource: "kanonische Historie" } }), false);
  assert.equal(hasPriceKeys({ source: { prices: "Beschreibung" } }), false);
  assert.equal(hasPriceKeys({ x: [{ daily: { rows: [["2026-01-02", 100]] } }] }), true);
  assert.equal(hasPriceKeys({ bars: [] }), true);
  const outcomes = json("quant/data/product/setup-outcomes-v1.json");
  assert.equal(hasPriceKeys(outcomes), false);
  assert.equal(outcomes.source.reconstructed, false);
});

test("Setup-Ergebnisse: nur veroeffentlichte, unveraenderte Staende; Vertragsausstieg nach Prioritaet", async () => {
  const { contractExit, snapshotHash, transitionType } = await import("../../scripts/quant/build-setup-outcomes.mjs");
  const o = json("quant/data/product/setup-outcomes-v1.json");
  assert.equal(o.history.contentHashVerified, o.history.dates);
  const s = { asOf: "2026-01-01", rows: { A: ["WATCH", 1, 2] } }; s.contentHash = snapshotHash(s);
  assert.equal(snapshotHash({ ...s, rows: { A: ["CONFIRMED", 1, 2] } }) === s.contentHash, false, "ein veraenderter Stand hat einen anderen Hash");
  assert.equal(transitionType("WATCH", "CONFIRMED"), "SETUP_CONFIRMED");
  const p = { dates: ["d0", "d1", "d2", "d3"], close: [100, 89, 130, 100] };
  /* Marken des Stands VOR dem Tag: Invalidierung 90, Ziel 120. Am selben Tag gilt die Invalidierung. */
  const lv = () => ["CONFIRMED", 90, 120];
  assert.deepEqual(contractExit(p, 0, lv, () => false, 126), { kind: "INVALIDATION", at: 2 });
  assert.deepEqual(contractExit({ dates: p.dates, close: [100, 121, 100, 100] }, 0, lv, () => false, 126), { kind: "TARGET", at: 2 });
  assert.deepEqual(contractExit({ dates: p.dates, close: [100, 100, 100, 100] }, 0, lv, (d) => d === "d1", 126), { kind: "OPPOSITE_SIGNAL", at: 2 });
  assert.deepEqual(contractExit({ dates: p.dates, close: [100, 100, 100, 100] }, 0, lv, () => false, 2), { kind: "TIME_EXIT", at: 2 });
  assert.deepEqual(contractExit({ dates: p.dates, close: [100, 100, 100, 100] }, 0, lv, () => false, 126), { kind: "PENDING", at: null });
});
