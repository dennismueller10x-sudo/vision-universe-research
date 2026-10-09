/* Explore Elliott (Projection Engine 1.2.0, ti-projection.mjs#exploreCandidatesFor): weitere regelkonforme Lesarten,
   die mindestens eine Produkt-Leitplanke verfehlen. Nie Hauptlesart, nie regulaere Alternative, hoechstens 3, saubere Daten. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PJ = require("../engines/technical/projection/elliott-projection.js");
const Pt = require("../engines/technical/elliott/patterns.js");

const LABELS = { IMPULSE: ["1", "2", "3", "4", "5"], LEADING_DIAGONAL: ["1", "2", "3", "4", "5"], ZIGZAG: ["A", "B", "C"], FLAT: ["A", "B", "C"] };
function count(pattern, prices, o = {}) {
  const waves = [];
  for (let k = 1; k < prices.length; k++) waves.push({ label: LABELS[pattern][k - 1], fromTime: "2020-0" + (o.m || 1) + "-" + String(k).padStart(2, "0"), toTime: "2020-0" + (o.m || 1) + "-" + String(k + 1).padStart(2, "0"), fromPrice: prices[k - 1], toPrice: prices[k], status: o.complete || k < prices.length - 1 ? "CONFIRMED" : "DEVELOPING" });
  const up = prices[1] > prices[0];
  return { pattern, patternName: pattern, variant: null, direction: up ? "UP" : "DOWN", complete: !!o.complete, currentWave: o.complete ? { label: "nach", role: "COMPLETE" } : { label: LABELS[pattern][waves.length - 1], wave: waves.length },
           nextMove: o.nextMove || null, waves, invalidation: o.invalidation === undefined ? { price: prices[0], direction: up ? "below" : "above", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } : o.invalidation,
           revision: o.revision || null, persistenceKey: o.key === undefined ? null : o.key, ruleAudit: { validity: "VALID", openRules: [], hardRules: ["W2_NOT_BEYOND_W1_ORIGIN"] }, countQuality: null };
}
const corr = () => Object.assign(count("FLAT", [30, 20, 29, 21], { complete: true, nextMove: "UP", invalidation: null, revision: { price: 21, direction: "below", ruleId: "PATTERN_END" } }), { persistenceKey: "FLAT|30|-1" });
function E(primary, o = {}) { return { engineVersion: "elliott-3.2.2", ruleSetVersion: "elliott-rules-3.1.0", applicability: { abstain: !!o.abstain, level: "LOW" }, primary, alternatives: o.alternatives || [], higherDegree: null, dataQuality: o.dataQuality || { suspectedSplits: 0 } }; }
const ctx = (c, o = {}) => Object.assign({ close: c, asOf: "2020-02-01", timeframe: "1W", trend: { state: "UP" }, structureVote: 1, rs: { rank: 0.5, rankPrev: 0.5, universe: 100 } }, o);
const G = (failed) => { const g = { G2: { passed: true, value: 1, threshold: 1 }, G3: { passed: true, value: 4, threshold: 3 }, G4: { passed: true, value: 40, threshold: 26 }, G5: { passed: true, value: 1, threshold: 0.5 } };
  failed.forEach((k) => { g[k].passed = false; g[k].value = k === "G2" ? 0.4 : k === "G3" ? 1.8 : k === "G4" ? 12 : 0.2; }); return g; };
const item = (c, failed, rank = 43, pool = 171) => ({ count: c, rank, pool, gates: G(failed), failed });
const withExplore = (e, items) => Object.assign(e, { explore: { version: "explore-elliott-1.0.0", items } });

test("X-1 · G2-Kandidat erscheint in Explore: regelkonform, Leitplanke G2 verfehlt, klar beschriftet, nie Haupt- oder reguläre Alternative", () => {
  const p = PJ.build(withExplore(E(corr(), { abstain: true }), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(22));
  assert.equal(p.explore.length, 1);
  const x = p.explore[0];
  assert.equal(x.source, "EXPLORE"); assert.equal(x.role, "EXPLORE"); assert.equal(x.type, "WAVE_3");
  assert.equal(x.headline, "Weitere Elliott-Lesart"); assert.equal(x.label, "Mögliche Welle 3 · Wochenchart");
  assert.equal(x.exploreStatus.label, "Explorativ"); assert.equal(x.exploreStatus.text, "Nicht als reguläre Alternative freigegeben");
  assert.equal(x.clarity.label, "Niedrig");
  assert.equal(x.hardRules.status, "PASSED"); assert.equal(x.qualityGates.status, "FAILED"); assert.deepEqual(x.qualityGates.failed, ["G2"]);
  assert.equal(x.qualityGates.reasons[0].title, "Grad-Zuordnung uneindeutig");
  assert.equal(p.consumerVisible, false, "Explore macht keine Hauptprojektion sichtbar"); assert.equal(p.status, "ABSTAIN");
  assert.equal(p.motiveAlternative, null); assert.ok(!(p.alternative && p.alternative.source === "EXPLORE"));
});

test("X-2 · Rang wird angezeigt (nie als Wahrscheinlichkeit), verfehlte Leitplanken in Kundensprache", () => {
  const x = PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G3", "G5"], 96, 171)]), ctx(22)).explore[0];
  assert.equal(x.pool.text, "Rang 97 von 171 gültigen Interpretationen");
  assert.deepEqual(x.qualityGates.reasons.map((r) => r.title), ["Struktur zu verrauscht", "Gegen aktuellen Trend"]);
  assert.equal(PJ.GATE_DE.G4.title, "Struktur für den Wochenchart noch zu kurz");
  const txt = JSON.stringify(x);
  assert.ok(!/wahrscheinlich|Wahrscheinlichkeit|Trefferquote|Kaufen|Strong Buy|High Confidence|Expected Return|Likely Target/i.test(txt.replace(/keine Wahrscheinlichkeit/g, "")));
});

test("X-3 · Hauptlesart und reguläre Alternative bleiben byte-gleich; Explore ersetzt sie nie", () => {
  const alt = Object.assign(count("ZIGZAG", [30, 20, 27], { invalidation: { price: 30, direction: "above", ruleId: "B_NOT_BEYOND_A_ORIGIN", kind: "HARD_RULE" } }), { persistenceKey: "ZIGZAG|30|-1" });
  const base = PJ.build(E(corr(), { alternatives: [alt] }), ctx(22));
  const ex = PJ.build(withExplore(E(corr(), { alternatives: [alt] }), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(22));
  assert.deepEqual(ex.primary, base.primary); assert.deepEqual(ex.alternative, base.alternative); assert.deepEqual(ex.motiveAlternative, base.motiveAlternative);
  assert.equal(ex.status, base.status); assert.equal(ex.consumerVisible, base.consumerVisible); assert.equal(ex.explore.length, 1);
  /* gleiche Thesenkennung wie die angezeigte Alternative → keine weitere Lesart */
  const dup = PJ.build(withExplore(E(corr(), { alternatives: [alt] }), [item(Object.assign({}, alt), ["G2"])]), ctx(22));
  assert.equal(dup.explore.length, 0); assert.ok(dup.guardrails.flags.some((f) => f.code === "EXPLORE_DUPLICATE"));
});

test("X-4 · Höchstens drei, keine nahezu gleichen Leitern", () => {
  const its = [1, 2, 3, 4, 5].map((m) => item(count("IMPULSE", [10 + m * 0.01, 30 + m * 0.01, 16], { m }), ["G2"], 10 + m));
  const p = PJ.build(withExplore(E(corr()), its), ctx(22));
  assert.ok(p.explore.length <= 3);
  assert.equal(p.explore.length, 1, "gleiche Richtung, gleicher Typ, Leiter innerhalb 10 % → nur eine");
  const mix = [item(count("IMPULSE", [10, 30, 16]), ["G2"]), item(count("ZIGZAG", [30, 20, 27], { m: 2, invalidation: { price: 30, direction: "above", ruleId: "B_NOT_BEYOND_A_ORIGIN", kind: "HARD_RULE" } }), ["G4"]),
               item(count("IMPULSE", [40, 20, 32], { m: 3, invalidation: { price: 40, direction: "above", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } }), ["G5"]), item(count("IMPULSE", [12, 40, 20], { m: 4 }), ["G3"])];
  const q = PJ.build(withExplore(E(corr()), mix), ctx(22));
  assert.ok(q.explore.length <= 3 && q.explore.length >= 2);
  assert.deepEqual(q.explore.map((t) => t.slot), q.explore.map((_, k) => k + 1));
  assert.equal(new Set(q.explore.map((t) => t.key)).size, q.explore.length, "keine Dubletten");
});

test("X-5 · Projektionsleiter unverändert: dieselbe Formel wie für jede These (keine zweite Methodik)", () => {
  const c = count("IMPULSE", [10, 30, 16]);
  const x = PJ.build(withExplore(E(corr()), [item(c, ["G2"])]), ctx(22)).explore[0];
  const ref = PJ.ladder(PJ.geometry(c), 22).zones;
  assert.deepEqual(x.zones.map((z) => [z.tier, z.low, z.high]), ref.map((z) => [z.tier, z.low, z.high]));
  assert.equal(x.zones[0].relationId, "W3_BASE");
  assert.equal(x.invalidation.price, 10);
});

test("X-6 · Ungültige, ausgeschöpfte oder grenzenlose Kandidaten erscheinen nie", () => {
  const inv = PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(9));   // Schluss unter dem Ursprung
  assert.equal(inv.explore.length, 0);
  const done = PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(200));  // alle Zonen erreicht
  assert.equal(done.explore.length, 0);
  const noInv = PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16], { invalidation: null }), ["G2"])]), ctx(22));
  assert.equal(noInv.explore.length, 0);
  const negInv = PJ.build(withExplore(E(corr()), [item(count("FLAT", [20, 30, 12], { invalidation: { price: -1, direction: "above", ruleId: "FLAT_B_NOT_EXCESSIVE", kind: "HARD_RULE" } }), ["G4"])]), ctx(25));
  assert.equal(negInv.explore.length, 0, "Invalidation unter null ist keine gültige Grenze");
});

test("X-7 · Schlechte Daten blockieren Explore (strukturell großzügiger, bei Daten nie): Split ungeklärt, tote Reihe", () => {
  const its = [item(count("IMPULSE", [10, 30, 16]), ["G3"])];
  const split = PJ.build(withExplore(E(corr(), { dataQuality: { suspectedSplits: 1 } }), its), ctx(22));
  assert.equal(split.status, "DATA_INVALID"); assert.equal(split.explore.length, 0);
  const unres = PJ.build(withExplore(E(corr(), { dataQuality: { suspectedSplits: 1, splitResolution: "UNRESOLVED" } }), its), ctx(22));
  assert.equal(unres.status, "DATA_INVALID");
  const dead = PJ.build(withExplore(E(corr()), its), ctx(22, { stalePriceBars: 6 }));
  assert.equal(dead.explore.length, 0);
});

test("X-8 · OSCR-Regression: Split-Verdacht, den der Kapitalmaßnahmen-Beleg als echte Bewegung auflöst, sperrt nicht mehr", () => {
  const its = [item(count("IMPULSE", [10, 30, 16]), ["G3"])];
  const ok = PJ.build(withExplore(E(corr(), { abstain: true, dataQuality: { suspectedSplits: 1, splitResolution: "RESOLVED" } }), its), ctx(22));
  assert.notEqual(ok.status, "DATA_INVALID");
  assert.ok(ok.guardrails.flags.some((f) => f.code === "SPLIT_SUSPICION_RESOLVED"));
  assert.equal(ok.explore.length, 1);
});

test("X-9 · Rollenwechsel bewahrt die Geschichte: EXPLORE → MOTIVE_ALTERNATIVE → ALTERNATIVE, gleiche These, Ereignisse nur angehängt", () => {
  const c = count("IMPULSE", [10, 30, 16]);
  const ex = PJ.build(withExplore(E(corr()), [item(c, ["G2"])]), ctx(22)).explore[0];
  const e2 = E(corr()); e2.hiddenMotive = { count: c, rank: 5, pool: 90 };
  const mv = PJ.build(e2, ctx(22)).motiveAlternative;
  const al = PJ.build(E(corr(), { alternatives: [c] }), ctx(22)).alternative;
  assert.equal(ex.key, mv.key); assert.equal(mv.key, al.key);
  const bars = { t: ["2020-02-01", "2020-02-08", "2020-02-15"], c: [22, 23, 24] }, meta = (role) => ({ id: "X|1W|" + ex.key, symbol: "X", timeframe: "1W", role, versions: { projection: PJ.VERSION } });
  const e0 = PJ.advanceLifecycle(null, ex, bars, "2020-02-01", meta("EXPLORE"));
  const e1 = PJ.advanceLifecycle(e0, mv, bars, "2020-02-08", meta("MOTIVE_ALTERNATIVE"));
  const e3 = PJ.advanceLifecycle(e1, al, bars, "2020-02-15", meta("ALTERNATIVE"));
  assert.equal(e3.id, e0.id); assert.equal(e3.role, "ALTERNATIVE"); assert.equal(e3.createdAt, "2020-02-01");
  assert.deepEqual(e3.events.slice(0, e0.events.length), e0.events, "frühere Ereignisse unverändert");
  assert.deepEqual(e3.events.filter((x) => x.type === "ROLE_CHANGED").map((x) => [x.from, x.to]), [["EXPLORE", "MOTIVE_ALTERNATIVE"], ["MOTIVE_ALTERNATIVE", "ALTERNATIVE"]]);
  assert.deepEqual(e3.revisions[0], e0.revisions[0], "eingefrorene Revision unverändert");
  assert.equal(PJ.STATE_DE.ROLE_CHANGED, "Rolle gewechselt");
});

/* ---------------- Auswahl auf echten Reihen (unveränderte Engine, Kandidatenpool) ---------------- */
async function realSeries(t, until) {
  const { readJson, weeklySeriesFromPoints } = await import("../../scripts/technical/lib/ti-data.mjs");
  const { analyzeProduct } = await import("../../scripts/technical/lib/ti-product.mjs");
  const j = readJson(new URL("../data/market/discover-series-long/ref_" + t + ".json", import.meta.url).pathname), cut = j.points.filter((p) => p[0] <= until);
  const series = weeklySeriesFromPoints(cut, t); series.corporateActions = j.corporateActions || null;
  return { series, out: analyzeProduct(series, { symbol: t }) };
}

test("X-10 · Echte Reihen: jede ausgewählte Lesart erfüllt alle Regeln, kein Schluss jenseits der harten Grenze, nie schon angezeigt, ≤ 3, Rang in der besseren Hälfte", async () => {
  const L = await import("../../scripts/technical/lib/ti-projection.mjs");
  const { PRODUCT_METHODOLOGY } = await import("../../scripts/technical/lib/ti-product.mjs");
  let seen = 0;
  for (const t of ["VTEX", "PLTR", "CGC", "XPEV"]) {
    const { series, out } = await realSeries(t, "2026-10-02");
    const pool = L.candidatePool(series, out, PRODUCT_METHODOLOGY), mc = L.motiveCandidateFor(series, out, PRODUCT_METHODOLOGY, pool);
    const X = L.exploreCandidatesFor(series, out, PRODUCT_METHODOLOGY, pool, mc, L.dataIntegrity(series, out, L.splitResolutionFor(series, out)));
    assert.notEqual(X.reason, "IDENTITY_MISMATCH", t);
    assert.ok(X.items.length <= L.EXPLORE.max, t);
    const E0 = out.res.methods.elliott, shown = [E0.primary].concat(E0.alternatives || []).map((c) => c.pattern + "|" + c.waves[0].fromTime + "|" + c.waves.map((w) => w.toTime).join(","));
    for (const it of X.items) {
      seen++;
      const c = it.count, legs = c.waves.map((w) => ({ fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status, duration: 1 }));
      assert.equal(Pt.evaluate(c.pattern, legs).valid, true, t + " harte Regeln");
      assert.ok(c.invalidation && c.invalidation.price > 0, t + " gültige Invalidation");
      const from = series.timestamps.indexOf(c.waves[0].fromTime);
      assert.ok(!series.close.slice(from + 1).some((v) => (c.invalidation.direction === "below" ? v < c.invalidation.price - 1e-3 : v > c.invalidation.price + 1e-3)), t + " Grenze nie verletzt");
      assert.ok(!shown.includes(c.pattern + "|" + c.waves[0].fromTime + "|" + c.waves.map((w) => w.toTime).join(",")), t + " nicht schon angezeigt");
      assert.ok(it.failed.length >= 1, t + " mindestens eine Leitplanke verfehlt");
      assert.ok((it.rank + 1) / it.pool <= L.EXPLORE.rankHalf, t + " Rang in der besseren Hälfte");
    }
    assert.equal(new Set(X.items.map((it) => it.count.pattern + "|" + it.count.waves[0].fromTime + "|" + it.count.direction)).size, X.items.length, t + " keine gleichen Anker");
  }
  assert.ok(seen >= 1, "mindestens eine Explore-Lesart in der Stichprobe");
});

test("X-11 · Motiv-Alternative unverändert durch den gemeinsamen Kandidatenpool (gleiches Ergebnis mit und ohne übergebenen Pool)", async () => {
  const L = await import("../../scripts/technical/lib/ti-projection.mjs");
  const { PRODUCT_METHODOLOGY } = await import("../../scripts/technical/lib/ti-product.mjs");
  for (const t of ["VTEX", "SE"]) {
    const { series, out } = await realSeries(t, "2026-10-02");
    assert.deepEqual(L.motiveCandidateFor(series, out, PRODUCT_METHODOLOGY), L.motiveCandidateFor(series, out, PRODUCT_METHODOLOGY, L.candidatePool(series, out, PRODUCT_METHODOLOGY)), t);
  }
});

test("X-12 · Falsche Wertpapierart passiert G6 nicht; Tagesreihe ohne Explore", async () => {
  const L = await import("../../scripts/technical/lib/ti-projection.mjs");
  const { PRODUCT_METHODOLOGY } = await import("../../scripts/technical/lib/ti-product.mjs");
  const { series, out } = await realSeries("VTEX", "2026-10-02");
  const fake = Object.assign(Object.create(Object.getPrototypeOf(series)), series, { instrumentId: "ZZZZNOTASTOCK" });
  const X = L.exploreCandidatesFor(fake, out, PRODUCT_METHODOLOGY, L.candidatePool(series, out, PRODUCT_METHODOLOGY), null, { status: "CLEAN", reasons: [] });
  assert.equal(X.reason, "G6_INSTRUMENT"); assert.equal(X.items.length, 0);
  assert.equal(L.exploreCandidatesFor(Object.assign({}, series, { timeframe: "1D" }), out, PRODUCT_METHODOLOGY, null, null, null).reason, "NOT_WEEKLY");
  const blocked = L.exploreCandidatesFor(series, out, PRODUCT_METHODOLOGY, L.candidatePool(series, out, PRODUCT_METHODOLOGY), null, { status: "BLOCKED", reasons: ["SPLIT_UNRESOLVED"] });
  assert.equal(blocked.reason, "DATA_SPLIT_UNRESOLVED"); assert.equal(blocked.items.length, 0);
});

test("X-13 · Datenintegrität: ungeklärter Split, Lücken, tote Reihe, nicht positive Preise sperren", async () => {
  const L = await import("../../scripts/technical/lib/ti-projection.mjs");
  const fakeOut = (dq, rq) => ({ res: { methods: { elliott: { dataQuality: dq } }, dataQuality: rq || {} } });
  const s = { close: [1, 2, 3], timestamps: ["a", "b", "c"], length: 3 };
  assert.equal(L.dataIntegrity(s, fakeOut({ gaps: 0, maxGapBars: 0 }), { status: "CLEAN", items: [] }).status, "CLEAN");
  assert.deepEqual(L.dataIntegrity(s, fakeOut({}), { status: "UNRESOLVED" }).reasons, ["SPLIT_UNRESOLVED"]);
  assert.equal(L.dataIntegrity(s, fakeOut({}), { status: "RESOLVED" }).status, "CLEAN_AFTER_SPLIT_RESOLUTION");
  assert.deepEqual(L.dataIntegrity(s, fakeOut({ maxGapBars: 5 })).reasons, ["HISTORY_GAPS"]);
  assert.deepEqual(L.dataIntegrity(s, fakeOut({}, { stalePriceBars: 8 })).reasons, ["STALE_OR_PINNED"]);
  assert.ok(L.dataIntegrity({ close: [1, -2, 3], timestamps: [], length: 3 }, fakeOut({})).reasons.includes("NON_POSITIVE_PRICE"));
});

test("X-14 · Lebenszyklus-Store: Explore-Thesen werden verfolgt, nur bei Datenproblem zurückgehalten", async () => {
  const L = await import("../../scripts/technical/lib/ti-projection.mjs");
  const proj = PJ.build(withExplore(E(corr(), { abstain: true }), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(22));
  assert.deepEqual(L.displayedTheses(proj).map((x) => x[0]), ["EXPLORE"]);
  const a = L.advanceStore(null, [{ symbol: "X", tf: "1W", proj, bars: { t: ["2020-02-01"], c: [22] }, asOf: "2020-02-01" }], { projection: PJ.VERSION });
  const e = Object.values(a.store.theses)[0];
  assert.equal(e.role, "EXPLORE"); assert.equal(e.state, "DEVELOPING");
  const b = L.advanceStore(a.store, [{ symbol: "X", tf: "1W", proj, bars: { t: ["2020-02-01", "2020-02-08"], c: [22, 23] }, asOf: "2020-02-08" }], { projection: PJ.VERSION });
  assert.ok(!Object.values(b.store.theses)[0].events.some((x) => x.type === "WITHHELD"), "Enthaltung der Hauptzählung hält Explore nicht zurück");
});

test("X-15 · Wiedergabe: gleiche Eingabe → byte-gleiche Explore-Ausgabe", () => {
  const mk = () => PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G2", "G4"])]), ctx(22));
  assert.equal(JSON.stringify(mk()), JSON.stringify(mk()));
  assert.equal(PJ.VERSION, "elliott-projection-1.2.0");
});
