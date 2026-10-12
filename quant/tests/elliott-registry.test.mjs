/* Elliott Prospective Registry auf main: Setup-Definitionen (Library V1), Kausalitaet, Unveraenderlichkeit,
   Revisionen, Auswertung nur abgelaufener Horizonte. Aus quant/tests/elliott-setups-mission10.test.mjs des
   Forschungsbranches ohne die Einstufung der historischen Evidenz (decide-setups, bleibt Forschung). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Lib = await import(join(ROOT, "scripts/technical/elliott-setups/setup-library.mjs"));
const Led = await import(join(ROOT, "scripts/technical/elliott-registry/ledger.mjs"));
const Reg = await import(join(ROOT, "scripts/technical/elliott-registry/register.mjs"));
const Ver = await import(join(ROOT, "scripts/technical/elliott-registry/verify.mjs"));
const Ev = await import(join(ROOT, "scripts/technical/elliott-registry/evaluate-registry.mjs"));
const Pv = await import(join(ROOT, "scripts/technical/elliott-registry/product-view.mjs"));
const { loadWeekly } = await import(join(ROOT, "scripts/technical/lib/ti-data.mjs"));
const Core = await import(join(ROOT, "scripts/technical/hsab/lib/replay-core.mjs"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));

const wave = (label, from, to) => ({ label, toPrice: to, fromPrice: from });
const zone = (phase, lo, hi, w) => ({ phase, kind: "TARGET", zoneLow: lo, zoneHigh: hi, weight: w, relations: [phase] });

test("M10-L1 Familien aus der Primaerzaehlung; Extension ist kein Setup; Spec-Hash stabil", () => {
  assert.equal(Lib.familyOf({ pattern: "IMPULSE", complete: false, currentWave: { label: "2" } }), "S1_EARLY_WAVE3");
  assert.equal(Lib.familyOf({ pattern: "IMPULSE", complete: false, currentWave: { label: "3" } }), "S1_EARLY_WAVE3");
  assert.equal(Lib.familyOf({ pattern: "IMPULSE", complete: false, currentWave: { label: "4" } }), "S2_WAVE4_TO_5");
  assert.equal(Lib.familyOf({ pattern: "IMPULSE", complete: false, currentWave: { label: "5" } }), null);
  assert.equal(Lib.familyOf({ pattern: "ZIGZAG", complete: true }), "S3_CORRECTION_COMPLETE");
  assert.equal(Lib.familyOf({ pattern: "ZIGZAG", complete: false, currentWave: { label: "C" } }), null);
  assert.equal(Lib.familyOf({ pattern: "TRIANGLE", complete: true }), "S4_TRIANGLE_THRUST");
  assert.equal(Lib.SPEC.families.length, 4); assert.equal(Lib.SPEC.rejected[0].family, "F");
  assert.match(Lib.SPEC_SHA256, /^[0-9a-f]{64}$/);
});

test("M10-L2 Niveaus, Projektion und Varianten: logisches UND, keine Gewichte", () => {
  const E = { primary: { pattern: "ZIGZAG", complete: true, direction: "DOWN", nextMove: "UP", persistenceKey: "ZIGZAG|10|-1", currentWave: { label: "nach C" },
    waves: [wave("A", 120, 100), wave("B", 100, 110), wave("C", 110, 90)], projection: { zones: [zone("AFTER_CORRECTION", 118, 122, 1), zone("AFTER_CORRECTION", 150, 155, 0.6)] } },
    applicability: { level: "MODERATE", abstain: false }, alternatives: [], higherDegree: { current: { direction: 1 } } };
  const o = Lib.classify(E, { px: 100, atr: 4, trend: 1, rsQ: 0.85, msVote: 0.4 });
  assert.equal(o.status, "QUALIFIED"); assert.equal(o.dir, 1);
  assert.equal(o.levels.invalidation, 90); assert.equal(o.levels.confirmation, 110); assert.equal(o.levels.confirmationState, "PENDING");
  assert.equal(o.projection.primary.low, 118); assert.equal(o.projection.extended.low, 150);
  assert.deepEqual(o.variants, { ENGINE_PRIMARY: true, PURE: true, PURE_RS: true, CONFIRMED: true, PURE_HD: true });
  assert.equal(o.geometry.kT, 4.5); assert.equal(o.geometry.kI, 2.5);
  /* eine fehlende Bestaetigung kippt CONFIRMED, nicht PURE */
  const o2 = Lib.applyConfirmations({ ...o }, { trend: 1, rsQ: 0.85, msVote: -0.2 });
  assert.equal(o2.variants.CONFIRMED, false); assert.equal(o2.variants.PURE_RS, true);
  /* Enthaltung der Engine: nicht angezeigt → nur ENGINE_PRIMARY */
  const o3 = Lib.classify({ ...E, applicability: { level: "LOW", abstain: true } }, { px: 100, atr: 4, trend: 1, rsQ: 0.85, msVote: 0.4 });
  assert.equal(o3.variants.PURE, false); assert.equal(o3.variants.ENGINE_PRIMARY, true);
  /* Kurs schon jenseits der Invalidation bzw. alle Zonen schon erreicht */
  assert.equal(Lib.classify(E, { px: 89, atr: 4, trend: 1, rsQ: 0.5, msVote: 0 }).status, "ALREADY_INVALID_OR_UNDEFINED");
  assert.equal(Lib.classify(E, { px: 160, atr: 4, trend: 1, rsQ: 0.5, msVote: 0 }).status, "NO_PROJECTION_BEYOND_PRICE");
});

test("M10-L3 Klassifikation auf echter Zaehlung ist kausal (Praefix-Identitaet)", () => {
  const s = loadWeekly("ref_MSFT"), P = Core.prepareSeries(s);
  for (const t of [400, 900, s.length - 30]) {
    const E = EV3.analyzeElliottV3({ series: s, features: P.main.features, pivots: P.main.pivots, asOfIndex: t, barsPerYear: P.main.profile.barsPerYear, previous: null, methodology: { elliottEngine: "v3" } });
    const cut = { ...s, length: t + 1, timestamps: s.timestamps.slice(0, t + 1), open: s.open.slice(0, t + 1), high: s.high.slice(0, t + 1), low: s.low.slice(0, t + 1), close: s.close.slice(0, t + 1), volume: s.volume ? s.volume.slice(0, t + 1) : s.volume };
    const Pc = Core.prepareSeries(cut);
    const Ec = EV3.analyzeElliottV3({ series: cut, features: Pc.main.features, pivots: Pc.main.pivots, asOfIndex: t, barsPerYear: Pc.main.profile.barsPerYear, previous: null, methodology: { elliottEngine: "v3" } });
    const ctx = { px: s.close[t], atr: P.main.features.columns.atr[t], trend: 1, rsQ: 0.5, msVote: 0 };
    assert.equal(JSON.stringify(Lib.classify(E, ctx)), JSON.stringify(Lib.classify(Ec, { ...ctx, atr: Pc.main.features.columns.atr[t] })));
  }
});

test("M10-R1 Ledger: Hash-Kette, Manipulation wird erkannt, nur anhaengen gegenueber frueherer Fassung", () => {
  const dir = mkdtempSync(join(tmpdir(), "m10-led-"));
  Led.append(dir, [], [{ type: "RUN", id: "RUN-1", week: "2026-09-25", recordedAt: "x", payload: { a: 1 } }, { type: "EVENT", id: "e1", week: "2026-09-25", recordedAt: "x", payload: { s: "A", price: 10 } }]);
  let lines = Led.readLedger(dir); assert.equal(Led.verifyChain(lines, JSON.parse(readFileSync(join(dir, "HEAD.json"), "utf8"))).ok, true);
  Led.append(dir, lines, [{ type: "REVISION", id: "r1", ref: "e1", week: "2026-10-02", recordedAt: "y", payload: { type: "CONFIRMED" } }]);
  lines = Led.readLedger(dir); assert.equal(lines.length, 3); assert.equal(Led.verifyChain(lines, null).ok, true);
  /* ein bestehender Eintrag wird nachtraeglich geaendert → Kette bricht */
  const raw = readFileSync(join(dir, "ledger.jsonl"), "utf8").replace('"price":10', '"price":11'); writeFileSync(join(dir, "ledger.jsonl"), raw);
  assert.equal(Led.verifyChain(Led.readLedger(dir), null).ok, false);
  assert.equal(Led.canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
});

test("M10-R2 Kalender: nur abgeschlossene Wochen, Reihe muss den Freitag abdecken", () => {
  assert.equal(Reg.lastCompletedFriday("2026-10-07"), "2026-10-02");
  assert.equal(Reg.lastCompletedFriday("2026-10-02"), "2026-09-25");   // Freitag selbst ist noch nicht abgeschlossen
  assert.equal(Reg.lastCompletedFriday("2026-10-03"), "2026-10-02");
  const pts = [["2026-09-18", 10], ["2026-09-25", 11], ["2026-10-01", 12]];
  assert.equal(Reg.cutIndex(pts, "2026-10-01", "2026-10-02"), -1);    // Woche 40 in den Daten unvollstaendig
  assert.equal(Reg.cutIndex(pts, "2026-10-01", "2026-09-25"), 1);
  assert.equal(Reg.cutIndex(pts, "2026-10-02", "2026-10-02"), 2);
});

test("M10-R3 Revisionen: Bestaetigung, Ziel, Invalidation in zeitlicher Reihenfolge; Ereignis bleibt unveraendert", () => {
  const ev = { id: "e", payload: { dir: 1, registeredBarDate: "2026-01-02", persistenceKey: "K", levels: { invalidation: 90, confirmation: 105, confirmationState: "PENDING" }, projection: { primary: { low: 120, high: 122 }, extended: { low: 150, high: 155 } } } };
  const frozen = JSON.stringify(ev);
  const rv = Reg.revisionsFor(ev, [100, 106, 121, 95, 89, 160], ["2026-01-09", "2026-01-16", "2026-01-23", "2026-01-30", "2026-02-06", "2026-02-13"], "K", new Set());
  assert.deepEqual(rv.map((x) => x.type), ["CONFIRMED", "TARGET_REACHED", "INVALIDATED"]);
  assert.equal(rv[2].barDate, "2026-02-06");
  assert.equal(JSON.stringify(ev), frozen);
  const rl = Reg.revisionsFor(ev, [100], ["2026-01-09"], "K2", new Set()); assert.deepEqual(rl.map((x) => x.type), ["RELABELED"]);
});

test("M10-R4 Registrierung, Idempotenz, nur vorwaerts, Pruefung und Auswertung nur abgelaufener Horizonte", async () => {
  const w = mkdtempSync(join(tmpdir(), "m10-w-")), reg = mkdtempSync(join(tmpdir(), "m10-r-"));
  for (const id of ["ref_AAPL", "ref_MSFT", "ref_JPM", "ref_XOM"]) writeFileSync(join(w, id + ".json"), readFileSync(join(ROOT, "quant/data/market/discover-series-long", id + ".json")));
  const r1 = await Reg.register({ weeklyDir: w, registry: reg, week: "2026-06-05", workers: 1, productView: false });
  assert.equal(r1.analysed, 4);
  const again = await Reg.register({ weeklyDir: w, registry: reg, week: "2026-06-05", workers: 1, productView: false }); assert.equal(again.skipped, "WEEK_ALREADY_REGISTERED");
  await Reg.register({ weeklyDir: w, registry: reg, week: "2026-09-25", workers: 1, productView: false });
  await assert.rejects(Reg.register({ weeklyDir: w, registry: reg, week: "2026-07-03", workers: 1, productView: false }), /nur vorwaerts/);
  assert.equal(Ver.verifyRegistry(reg).ok, true);
  const e = Ev.evaluateRegistry({ weeklyDir: w, registry: reg, asOf: "2026-10-07" });
  for (const k of Object.keys(e.horizons)) assert.ok(/\|3M$/.test(k), "nur 3M ist abgelaufen: " + k);
  for (const [k, v] of Object.entries(e.pending)) assert.ok(v.firstEvaluableWeek > "2026-10-02", k);
  /* Snapshot nachtraeglich veraendert → Pruefung schlaegt fehl */
  appendFileSync(join(reg, "snapshots", "2026-06-05.jsonl.gz"), "x");
  assert.equal(Ver.verifyRegistry(reg).ok, false);
});

test("M10-R5 Ein Titel ohne Wochenreihe (aus dem Produkt gefallen) beendet den Lauf nicht; sein Ereignis bleibt offen, nichts wird veraendert", async () => {
  const w = mkdtempSync(join(tmpdir(), "m10-w5-")), reg = mkdtempSync(join(tmpdir(), "m10-r5-"));
  for (const id of ["ref_AAPL", "ref_MSFT", "ref_JPM", "ref_XOM"]) writeFileSync(join(w, id + ".json"), readFileSync(join(ROOT, "quant/data/market/discover-series-long", id + ".json")));
  await Reg.register({ weeklyDir: w, registry: reg, week: "2026-06-05", workers: 1, productView: false });
  /* offenes Ereignis eines Titels, dessen Wochenreihe es nicht mehr gibt (kein File im Wochenverzeichnis) */
  const payload = { symbol: "ref_GONE", timeframe: "1W", setupType: "S1", registeredWeek: "2026-06-05", registeredBarDate: "2026-06-05" };
  Led.append(reg, Led.readLedger(reg), [{ type: "EVENT", id: Led.eventId(payload), week: "2026-06-05", recordedAt: "2026-06-06T00:00:00.000Z", payload }]);
  const before = readFileSync(join(reg, "ledger.jsonl"), "utf8");
  const r2 = await Reg.register({ weeklyDir: w, registry: reg, week: "2026-09-25", workers: 1, productView: false });
  assert.ok(r2.openWithoutSeries >= 1, "Ereignis ohne Reihe wird gezaehlt, nicht als Fehler gewertet");
  const after = readFileSync(join(reg, "ledger.jsonl"), "utf8");
  assert.ok(after.startsWith(before), "nur angehaengt");
  assert.equal(Ver.verifyRegistry(reg).ok, true);
});

test("M10-R6 Vollvergleich der Explore Highlights: gleich, abweichend, fehlender Titel, Zeitausnahme", () => {
  const pubK = new Map([["AAA", ["K1"]], ["BBB", ["K2", "K3"]], ["CCC", ["K4"]], ["DDD", ["K5"]]]);
  const asOf = new Map([["AAA", "2026-10-09"], ["BBB", "2026-10-09"], ["CCC", "2026-10-09"], ["DDD", "2026-10-02"], ["EEE", "2026-10-09"]]);
  const same = new Map([["AAA", { d: "2026-10-09", keys: ["K1"] }], ["BBB", { d: "2026-10-09", keys: ["K2", "K3"] }], ["CCC", { d: "2026-10-09", keys: ["K4"] }], ["DDD", { d: "2026-10-02", keys: ["K5"] }]]);
  const a = Pv.compareHighlights(pubK, same, asOf); assert.equal(a.ok, true); assert.equal(a.identical, 4); assert.equal(a.different.length, 0);
  /* ein Titel fehlt im Register (z. B. Reihe endet vor der Woche): Abweichung, nicht still uebergangen */
  const missing = new Map(same); missing.delete("CCC");
  const b = Pv.compareHighlights(pubK, missing, asOf); assert.equal(b.ok, false); assert.deepEqual(b.different.map((x) => [x.t, x.reason]), [["CCC", "NOT_IN_REGISTRY_UNIVERSE"]]);
  /* Register hat ein Highlight, das das Produkt nicht zeigt */
  const extra = new Map(same); extra.set("EEE", { d: "2026-10-09", keys: ["K9"] });
  const c = Pv.compareHighlights(pubK, extra, asOf); assert.equal(c.ok, false); assert.deepEqual(c.different.map((x) => x.t), ["EEE"]);
  /* andere Schluessel bei gleichem Stand */
  const diff = new Map(same); diff.set("BBB", { d: "2026-10-09", keys: ["K2"] });
  assert.equal(Pv.compareHighlights(pubK, diff, asOf).ok, false);
  /* Zeitausnahme: anderer Stand der letzten Bar → ausgewiesen, keine Abweichung */
  const timing = new Map(same); timing.set("AAA", { d: "2026-10-02", keys: ["KX"] });
  const d = Pv.compareHighlights(pubK, timing, asOf); assert.equal(d.ok, true); assert.deepEqual(d.timing.map((x) => x.t), ["AAA"]);
});

test("M10-R7 lastBarUpTo: Reihe darf vor der Woche enden (Produktsicht), nie danach", async () => {
  const pts = [["2026-09-18", 1], ["2026-09-25", 2], ["2026-10-01", 3], ["2026-10-14", 4]];
  assert.equal(Reg.lastBarUpTo(pts, "2026-10-09"), 2, "letzte Bar der Woche 2026-10-02 (Donnerstag 01.10.)");
  assert.equal(Reg.lastBarUpTo(pts, "2026-09-25"), 1);
  assert.equal(Reg.lastBarUpTo(pts, "2026-09-11"), -1);
  assert.equal(Reg.cutIndex(pts, "2026-10-01", "2026-10-09"), -1, "strenge Regel der zustandslosen Sicht bleibt");
});
