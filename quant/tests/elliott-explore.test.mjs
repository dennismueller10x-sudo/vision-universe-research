/* Explore Highlights und Candidate Explorer (Projection Engine 1.3.0): ti-projection.mjs#exploreCandidatesFor liefert den
   unveraenderten Pool regelkonformer Kandidaten, die Kuratierung (explore-curation.js) waehlt in Projection.build aus.
   Nie Hauptlesart, nie regulaere Alternative; Highlights hoechstens 2; Candidate Explorer nachrangig und technisch; saubere Daten. */
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
const item = (c, failed, rank = 5, pool = 171) => ({ count: c, rank, pool, gates: G(failed), failed });
const withExplore = (e, items) => Object.assign(e, { explore: { version: "explore-pool-1.0.0", items } });

const ALT = () => Object.assign(count("ZIGZAG", [30, 20, 27], { invalidation: { price: 30, direction: "above", ruleId: "B_NOT_BEYOND_A_ORIGIN", kind: "HARD_RULE" } }), { persistenceKey: "ZIGZAG|30|-1" });

test("X-1 · G2-Kandidat mit gutem Rang wird Highlight: regelkonform, Leitplanke G2 verfehlt, klar beschriftet, nie Haupt- oder reguläre Alternative", () => {
  const p = PJ.build(withExplore(E(corr(), { abstain: true }), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(22));
  assert.equal(p.exploreHighlights.length, 1); assert.equal(p.exploreCandidates.length, 0);
  const x = p.exploreHighlights[0];
  assert.equal(x.source, "EXPLORE"); assert.equal(x.role, "EXPLORE_HIGHLIGHT"); assert.equal(x.type, "WAVE_3");
  assert.equal(x.headline, "Explorative Elliott-Chance"); assert.equal(x.subline, "Regelkonforme alternative Lesart"); assert.equal(x.label, "Mögliche Welle 3 · Wochenchart");
  assert.equal(x.exploreStatus.label, "Explorativ"); assert.equal(x.exploreStatus.text, "Nicht als reguläre Alternative freigegeben");
  assert.equal(x.clarity.label, "Niedrig");
  assert.equal(x.hardRules.status, "PASSED"); assert.equal(x.qualityGates.status, "FAILED"); assert.deepEqual(x.qualityGates.failed, ["G2"]);
  assert.equal(x.qualityGates.reasons[0].title, "Grad-Zuordnung uneindeutig");
  assert.equal(x.curation.tier, "HIGHLIGHT"); assert.equal(x.curation.failedSet, "G2"); assert.match(x.curation.text, /Rang 6 von 171/); assert.match(x.curation.text, /keine Wahrscheinlichkeit/);
  assert.equal(p.consumerVisible, false, "Explore macht keine Hauptprojektion sichtbar"); assert.equal(p.status, "ABSTAIN");
  assert.equal(p.motiveAlternative, null); assert.ok(!(p.alternative && p.alternative.source === "EXPLORE"));
});

test("X-1b · Struktur-Leitplanke verfehlt (G3) → nur Candidate Explorer: schlank, nachrangig, mit Zonen und Invalidation, ohne Fahrplan", () => {
  const p = PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G3"])]), ctx(22));
  assert.equal(p.exploreHighlights.length, 0); assert.equal(p.exploreCandidates.length, 1);
  const x = p.exploreCandidates[0];
  assert.equal(x.role, "EXPLORE_CANDIDATE"); assert.equal(x.headline, "Technische Elliott-Lesart"); assert.equal(x.visibility, "EXPLORE_CANDIDATES_1.0.0");
  assert.deepEqual(x.curation.notHighlight, ["STRUCTURE_GATE_FAILED"]); assert.equal(x.curation.tier, "CANDIDATE");
  assert.ok(x.zones.length >= 1 && x.invalidation.price === 10 && x.anchorWaves.length === 2);
  assert.ok(!("roadmap" in x) && !("signature" in x) && !("lifecycle" in x), "schlank: kein Fahrplan, kein Fingerabdruck, kein Lebenszyklus");
  assert.ok(JSON.stringify(x).length < 4000, "klein genug fuer 6 je Titel");
  assert.equal(x.exploreStatus.label, "Explorativ");
});

test("X-2 · Rang wird angezeigt (nie als Wahrscheinlichkeit), verfehlte Leitplanken in Kundensprache", () => {
  const p = PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G3", "G5"], 96, 171)]), ctx(22));
  const x = p.exploreCandidates[0];
  assert.equal(x.pool.text, "Rang 97 von 171 gültigen Interpretationen");
  assert.deepEqual(x.qualityGates.failed, ["G3", "G5"]);
  assert.equal(PJ.GATE_DE.G3.title, "Struktur zu verrauscht"); assert.equal(PJ.GATE_DE.G5.title, "Gegen aktuellen Trend");
  assert.equal(PJ.GATE_DE.G4.title, "Struktur für den Wochenchart noch zu kurz");
  const h = PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G5"])]), ctx(22)).exploreHighlights[0];
  assert.deepEqual(h.qualityGates.reasons.map((r) => r.title), ["Gegen aktuellen Trend"]);
  const txt = JSON.stringify([x, h]);
  assert.ok(!/wahrscheinlich|Trefferquote|Kaufen|Strong Buy|High Confidence|Expected Return|Likely Target/i.test(txt.replace(/keine Wahrscheinlichkeit/g, "")));
});

test("X-3 · Hauptlesart, reguläre Alternative und Motiv-Alternative bleiben byte-gleich; Explore ersetzt sie nie", () => {
  const alt = ALT();
  const base = PJ.build(E(corr(), { alternatives: [alt] }), ctx(22));
  const ex = PJ.build(withExplore(E(corr(), { alternatives: [alt] }), [item(count("IMPULSE", [10, 30, 16]), ["G2"]), item(count("IMPULSE", [12, 40, 20], { m: 2 }), ["G3"], 30)]), ctx(22));
  assert.equal(JSON.stringify(ex.primary), JSON.stringify(base.primary)); assert.equal(JSON.stringify(ex.alternative), JSON.stringify(base.alternative)); assert.equal(JSON.stringify(ex.motiveAlternative), JSON.stringify(base.motiveAlternative));
  assert.equal(ex.status, base.status); assert.equal(ex.consumerVisible, base.consumerVisible); assert.equal(ex.exploreHighlights.length + ex.exploreCandidates.length, 2);
  assert.equal(JSON.stringify(ex.highUpside), JSON.stringify(base.highUpside));
  /* gleiche Thesenkennung wie die angezeigte Alternative → keine weitere Lesart */
  const dup = PJ.build(withExplore(E(corr(), { alternatives: [alt] }), [item(Object.assign({}, alt), ["G2"])]), ctx(22));
  assert.equal(dup.exploreHighlights.length + dup.exploreCandidates.length, 0); assert.ok(dup.exploreDiagnostics.some((f) => f.code === "EXPLORE_DUPLICATE"));
  assert.ok(!dup.guardrails.flags.some((f) => /^EXPLORE/.test(f.code)), "Explore-Diagnose nie in den Hinweisen der Hauptprojektion");
  assert.deepEqual(dup.guardrails, PJ.build(E(corr(), { alternatives: [alt] }), ctx(22)).guardrails, "Hinweise der Hauptprojektion unverändert");
});

test("X-4 · Höchstens zwei Highlights, keine nahezu gleichen Leitern, keine Dubletten", () => {
  const its = [1, 2, 3, 4, 5].map((m) => item(count("IMPULSE", [10 + m * 0.01, 30 + m * 0.01, 16], { m }), ["G2"], 3 + m));
  const p = PJ.build(withExplore(E(corr()), its), ctx(22));
  assert.equal(p.exploreHighlights.length, 1, "gleiche Richtung, gleicher Typ, Leiter innerhalb 10 % → nur eine");
  assert.equal(p.exploreHighlights.length + p.exploreCandidates.length, 1);
  const mix = [item(count("IMPULSE", [10, 30, 16]), ["G2"]), item(ALT(), ["G5"], 4),
               item(count("IMPULSE", [40, 20, 32], { m: 3, invalidation: { price: 40, direction: "above", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } }), ["G5"], 8), item(count("IMPULSE", [12, 40, 20], { m: 4 }), ["G3"], 6)];
  const q = PJ.build(withExplore(E(corr()), mix), ctx(22));
  assert.ok(q.exploreHighlights.length <= PJ.EXPLORE_MAX && q.exploreHighlights.length >= 1 && PJ.EXPLORE_MAX === 2);
  assert.deepEqual(q.exploreHighlights.map((t) => t.slot), q.exploreHighlights.map((_, k) => k + 1));
  const all = q.exploreHighlights.concat(q.exploreCandidates);
  assert.equal(new Set(all.map((t) => t.key)).size, all.length, "keine Dubletten über beide Ebenen");
  if (q.exploreHighlights.length === 2) assert.ok(q.exploreHighlights[0].direction !== q.exploreHighlights[1].direction || q.exploreHighlights[0].type !== q.exploreHighlights[1].type);
});

test("X-5 · Projektionsleiter unverändert: dieselbe Formel wie für jede These (keine zweite Methodik)", () => {
  const c = count("IMPULSE", [10, 30, 16]);
  const x = PJ.build(withExplore(E(corr()), [item(c, ["G2"])]), ctx(22)).exploreHighlights[0];
  const ref = PJ.ladder(PJ.geometry(c), 22).zones;
  assert.deepEqual(x.zones.map((z) => [z.tier, z.low, z.high]), ref.map((z) => [z.tier, z.low, z.high]));
  assert.equal(x.zones[0].relationId, "W3_BASE");
  assert.equal(x.invalidation.price, 10);
  const y = PJ.build(withExplore(E(corr()), [item(c, ["G3"])]), ctx(22)).exploreCandidates[0];
  assert.deepEqual(y.zones.map((z) => [z.tier, z.low, z.high]), ref.map((z) => [z.tier, z.low, z.high]), "Candidate Explorer rechnet dieselben Zonen");
});

test("X-6 · Ungültige, ausgeschöpfte oder grenzenlose Kandidaten erscheinen nie (weder Highlight noch Candidate Explorer)", () => {
  const none = (p) => p.exploreHighlights.length + p.exploreCandidates.length;
  assert.equal(none(PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(9))), 0, "Schluss unter dem Ursprung");
  assert.equal(none(PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(200))), 0, "alle Zonen erreicht");
  assert.equal(none(PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16], { invalidation: null }), ["G2"])]), ctx(22))), 0, "ohne Invalidation");
  assert.equal(none(PJ.build(withExplore(E(corr()), [item(count("FLAT", [20, 30, 12], { invalidation: { price: -1, direction: "above", ruleId: "FLAT_B_NOT_EXCESSIVE", kind: "HARD_RULE" } }), ["G4"])]), ctx(25))), 0, "Invalidation unter null");
});

test("X-7 · Schlechte Daten blockieren Explore (strukturell großzügiger, bei Daten nie): Split ungeklärt, tote Reihe", () => {
  const its = [item(count("IMPULSE", [10, 30, 16]), ["G2"])];
  const split = PJ.build(withExplore(E(corr(), { dataQuality: { suspectedSplits: 1 } }), its), ctx(22));
  assert.equal(split.status, "DATA_INVALID"); assert.equal(split.exploreHighlights.length + split.exploreCandidates.length, 0);
  const unres = PJ.build(withExplore(E(corr(), { dataQuality: { suspectedSplits: 1, splitResolution: "UNRESOLVED" } }), its), ctx(22));
  assert.equal(unres.status, "DATA_INVALID");
  const dead = PJ.build(withExplore(E(corr()), its), ctx(22, { stalePriceBars: 6 }));
  assert.equal(dead.exploreHighlights.length + dead.exploreCandidates.length, 0);
});

test("X-8 · OSCR-Regression: Split-Verdacht, den der Kapitalmaßnahmen-Beleg als echte Bewegung auflöst, sperrt nicht mehr", () => {
  const its = [item(count("IMPULSE", [10, 30, 16]), ["G2"])];
  const ok = PJ.build(withExplore(E(corr(), { abstain: true, dataQuality: { suspectedSplits: 1, splitResolution: "RESOLVED" } }), its), ctx(22));
  assert.notEqual(ok.status, "DATA_INVALID");
  assert.ok(ok.guardrails.flags.some((f) => f.code === "SPLIT_SUSPICION_RESOLVED"));
  assert.equal(ok.exploreHighlights.length, 1);
});

test("X-9 · Rollenwechsel bewahrt die Geschichte: EXPLORE_HIGHLIGHT → MOTIVE_ALTERNATIVE → ALTERNATIVE, gleiche These, Ereignisse nur angehängt", () => {
  const c = count("IMPULSE", [10, 30, 16]);
  const ex = PJ.build(withExplore(E(corr()), [item(c, ["G2"])]), ctx(22)).exploreHighlights[0];
  const e2 = E(corr()); e2.hiddenMotive = { count: c, rank: 5, pool: 90 };
  const mv = PJ.build(e2, ctx(22)).motiveAlternative;
  const al = PJ.build(E(corr(), { alternatives: [c] }), ctx(22)).alternative;
  assert.equal(ex.key, mv.key); assert.equal(mv.key, al.key);
  const bars = { t: ["2020-02-01", "2020-02-08", "2020-02-15"], c: [22, 23, 24] }, meta = (role) => ({ id: "X|1W|" + ex.key, symbol: "X", timeframe: "1W", role, versions: { projection: PJ.VERSION } });
  const e0 = PJ.advanceLifecycle(null, ex, bars, "2020-02-01", meta("EXPLORE_HIGHLIGHT"));
  const e1 = PJ.advanceLifecycle(e0, mv, bars, "2020-02-08", meta("MOTIVE_ALTERNATIVE"));
  const e3 = PJ.advanceLifecycle(e1, al, bars, "2020-02-15", meta("ALTERNATIVE"));
  assert.equal(e3.id, e0.id); assert.equal(e3.role, "ALTERNATIVE"); assert.equal(e3.createdAt, "2020-02-01");
  assert.deepEqual(e3.events.slice(0, e0.events.length), e0.events, "frühere Ereignisse unverändert");
  assert.deepEqual(e3.events.filter((x) => x.type === "ROLE_CHANGED").map((x) => [x.from, x.to]), [["EXPLORE_HIGHLIGHT", "MOTIVE_ALTERNATIVE"], ["MOTIVE_ALTERNATIVE", "ALTERNATIVE"]]);
  assert.deepEqual(e3.revisions[0], e0.revisions[0], "eingefrorene Revision unverändert");
  assert.equal(PJ.STATE_DE.ROLE_CHANGED, "Rolle gewechselt");
});

test("X-9b · Bestand der breiten Fassung (Rolle EXPLORE) wird Highlight: Rollenwechsel angehängt, Geschichte und Revision unverändert", () => {
  const c = count("IMPULSE", [10, 30, 16]);
  const hl = PJ.build(withExplore(E(corr()), [item(c, ["G2"])]), ctx(22)).exploreHighlights[0];
  const bars = { t: ["2020-02-01", "2020-02-08"], c: [22, 23] }, meta = (role) => ({ id: "X|1W|" + hl.key, symbol: "X", timeframe: "1W", role, versions: { projection: PJ.VERSION } });
  const old = PJ.advanceLifecycle(null, hl, bars, "2020-02-01", meta("EXPLORE"));      // so stand es im Bestand (Registry 1.4.0 / Projection 1.2.0)
  const next = PJ.advanceLifecycle(old, hl, bars, "2020-02-08", meta("EXPLORE_HIGHLIGHT"));
  assert.equal(next.role, "EXPLORE_HIGHLIGHT"); assert.deepEqual(next.events.slice(0, old.events.length), old.events);
  assert.deepEqual(next.events.filter((x) => x.type === "ROLE_CHANGED").map((x) => [x.from, x.to]), [["EXPLORE", "EXPLORE_HIGHLIGHT"]]);
  assert.deepEqual(next.revisions, old.revisions); assert.equal(old.role, "EXPLORE", "der alte Eintrag wird nie mutiert");
});

test("X-9c · Nicht mehr Highlight: Rollenwechsel zum Candidate Explorer + NOT_PROMOTED + Archiv, nicht \"Zählung verschwunden\"; Geschichte bleibt", () => {
  const hl = PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G2"])]), ctx(22)).exploreHighlights[0];
  const bars = { t: ["2020-02-01", "2020-02-08"], c: [22, 23] }, base = { id: "X|1W|" + hl.key, symbol: "X", timeframe: "1W", versions: { projection: PJ.VERSION } };
  const e0 = PJ.advanceLifecycle(null, hl, bars, "2020-02-01", { ...base, role: "EXPLORE_HIGHLIGHT" });
  const frozen = JSON.stringify(e0);
  const e1 = PJ.advanceLifecycle(e0, null, bars, "2020-02-08", { ...base, role: "EXPLORE_HIGHLIGHT", demotedTo: "EXPLORE_CANDIDATE" });
  assert.equal(JSON.stringify(e0), frozen, "der Vorgängereintrag wird nie mutiert");
  assert.deepEqual(e1.events.slice(0, e0.events.length), e0.events);
  assert.deepEqual(e1.events.slice(e0.events.length).map((x) => x.type), ["ROLE_CHANGED", "NOT_PROMOTED", "ARCHIVED"]);
  assert.ok(!e1.events.some((x) => x.type === "RELABELLED"), "die Zählung besteht weiter → kein RELABELLED");
  assert.equal(e1.role, "EXPLORE_CANDIDATE"); assert.equal(e1.state, "ARCHIVED"); assert.deepEqual(e1.revisions, e0.revisions);
  assert.equal(PJ.STATE_DE.NOT_PROMOTED, "Nicht mehr als Highlight gezeigt");
  /* ohne Rollenwechsel-Angabe bleibt das alte Verhalten (Zählung weg → RELABELLED) */
  const gone = PJ.advanceLifecycle(e0, null, bars, "2020-02-08", { ...base, role: "EXPLORE_HIGHLIGHT" });
  assert.ok(gone.events.some((x) => x.type === "RELABELLED"));
});

/* ---------------- Auswahl auf echten Reihen (unveränderte Engine, Kandidatenpool) ---------------- */
async function realSeries(t, until) {
  const { readJson, weeklySeriesFromPoints } = await import("../../scripts/technical/lib/ti-data.mjs");
  const { analyzeProduct } = await import("../../scripts/technical/lib/ti-product.mjs");
  const j = readJson(new URL("../data/market/discover-series-long/ref_" + t + ".json", import.meta.url).pathname), cut = j.points.filter((p) => p[0] <= until);
  const series = weeklySeriesFromPoints(cut, t); series.corporateActions = j.corporateActions || null;
  return { series, out: analyzeProduct(series, { symbol: t }) };
}

test("X-10 · Echte Reihen: jeder Kandidat erfüllt alle Regeln, kein Schluss jenseits der harten Grenze, nie schon angezeigt, Rang in der besseren Hälfte; die Kuratierung wählt nur daraus", async () => {
  const L = await import("../../scripts/technical/lib/ti-projection.mjs");
  const { PRODUCT_METHODOLOGY } = await import("../../scripts/technical/lib/ti-product.mjs");
  const Cur = require("../engines/technical/projection/explore-curation.js");
  let seen = 0;
  for (const t of ["VTEX", "PLTR", "CGC", "XPEV"]) {
    const { series, out } = await realSeries(t, "2026-10-02");
    const pool = L.candidatePool(series, out, PRODUCT_METHODOLOGY), mc = L.motiveCandidateFor(series, out, PRODUCT_METHODOLOGY, pool);
    const X = L.exploreCandidatesFor(series, out, PRODUCT_METHODOLOGY, pool, mc, L.dataIntegrity(series, out, L.splitResolutionFor(series, out)));
    assert.notEqual(X.reason, "IDENTITY_MISMATCH", t);
    assert.equal(X.items.length, X.eligible, t + " alle zulässigen Kandidaten, keine Auswahl in dieser Stufe");
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
    /* gleiche Anker kommen im Pool vor (verschiedene spaetere Pivots); die Projection Engine dedupliziert sie ueber die Thesenkennung (X-4) */
    /* Rang aufsteigend (Reihenfolge des Pools bleibt unverändert) */
    assert.deepEqual(X.items.map((it) => it.rank), X.items.map((it) => it.rank).slice().sort((a, b) => a - b), t + " Poolreihenfolge");
    /* Kuratierung auf dem echten Pool: nur Auswahl, Richtlinie eingehalten */
    const cands = X.items.map((it, k) => ({ id: "c" + k, type: PJ.geometry(it.count).type, pattern: it.count.pattern, variant: it.count.variant, direction: it.count.direction, failed: it.failed, rank: it.rank, pool: it.pool, w1Weeks: it.gates.G4.value, mid: null, ctx: {} }));
    const cur = Cur.curate(cands);
    assert.ok(cur.highlights.length <= 2, t);
    for (const h of cur.highlights) { assert.ok(Cur.POLICY.highlight.allowedFailedSets.includes(Cur.failedSet(h)), t); assert.ok(Cur.rankPct(h) <= Cur.POLICY.highlight.rankMax[h.type], t); }
    assert.ok(cur.candidates.length <= Cur.POLICY.candidates.max, t);
  }
  assert.ok(seen >= 1, "mindestens ein Kandidat in der Stichprobe");
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

test("X-14 · Lebenszyklus-Store: Highlights werden verfolgt, der Candidate Explorer nicht; bei Datenproblem nur zurückgehalten, bei Herabstufung als Rollenwechsel archiviert", async () => {
  const L = await import("../../scripts/technical/lib/ti-projection.mjs");
  const proj = PJ.build(withExplore(E(corr(), { abstain: true }), [item(count("IMPULSE", [10, 30, 16]), ["G2"]), item(count("IMPULSE", [12, 40, 20], { m: 2 }), ["G3"], 30)]), ctx(22));
  assert.equal(proj.exploreHighlights.length, 1); assert.equal(proj.exploreCandidates.length, 1);
  assert.deepEqual(L.displayedTheses(proj).map((x) => x[0]), ["EXPLORE_HIGHLIGHT"], "nur Highlights sind angezeigte Thesen");
  const a = L.advanceStore(null, [{ symbol: "X", tf: "1W", proj, bars: { t: ["2020-02-01"], c: [22] }, asOf: "2020-02-01" }], { projection: PJ.VERSION });
  const before = JSON.stringify(a.store);
  const ents = Object.values(a.store.theses);
  assert.equal(ents.length, 1, "Candidate Explorer erzeugt keinen Store-Eintrag");
  assert.equal(ents[0].role, "EXPLORE_HIGHLIGHT"); assert.equal(ents[0].state, "DEVELOPING");
  const b = L.advanceStore(a.store, [{ symbol: "X", tf: "1W", proj, bars: { t: ["2020-02-01", "2020-02-08"], c: [22, 23] }, asOf: "2020-02-08" }], { projection: PJ.VERSION });
  assert.ok(!Object.values(b.store.theses)[0].events.some((x) => x.type === "WITHHELD"), "Enthaltung der Hauptzählung hält Explore nicht zurück");
  /* Herabstufung: dieselbe These steht jetzt nur noch im Candidate Explorer */
  const hlKey = proj.exploreHighlights[0].key, demoted = { ...proj, exploreHighlights: [], exploreCandidates: [{ key: hlKey }] };
  const c = L.advanceStore(a.store, [{ symbol: "X", tf: "1W", proj: demoted, bars: { t: ["2020-02-01", "2020-02-08"], c: [22, 23] }, asOf: "2020-02-08" }], { projection: PJ.VERSION });
  const e = Object.values(c.store.theses)[0];
  assert.equal(e.state, "ARCHIVED"); assert.equal(e.role, "EXPLORE_CANDIDATE"); assert.deepEqual(e.events.slice(-3).map((x) => x.type), ["ROLE_CHANGED", "NOT_PROMOTED", "ARCHIVED"]);
  assert.equal(JSON.stringify(a.store), before, "Vorgänger-Store unverändert");
  /* Bestand mit alter Rolle EXPLORE: wird bei erneuter Anzeige als Highlight umgewidmet, nicht neu angelegt */
  const legacy = JSON.parse(JSON.stringify(a.store)); Object.values(legacy.theses)[0].role = "EXPLORE";
  const d = L.advanceStore(legacy, [{ symbol: "X", tf: "1W", proj, bars: { t: ["2020-02-01", "2020-02-08"], c: [22, 23] }, asOf: "2020-02-08" }], { projection: PJ.VERSION });
  assert.equal(Object.keys(d.store.theses).length, 1); assert.equal(Object.values(d.store.theses)[0].role, "EXPLORE_HIGHLIGHT");
});

test("X-15 · Wiedergabe: gleiche Eingabe → byte-gleiche Explore-Ausgabe", () => {
  const mk = () => PJ.build(withExplore(E(corr()), [item(count("IMPULSE", [10, 30, 16]), ["G2"]), item(count("IMPULSE", [12, 40, 20], { m: 2 }), ["G2", "G4"], 30)]), ctx(22));
  assert.equal(JSON.stringify(mk()), JSON.stringify(mk()));
  assert.equal(PJ.VERSION, "elliott-projection-1.3.0");
});

test("X-16 · Registry-Schnappschuss mit nur geeigneten Kandidaten liefert byte-gleiche Highlights wie der ganze Pool (auch bei gleicher Thesenkennung)", async () => {
  const L = await import("../../scripts/technical/lib/ti-projection.mjs");
  /* zwei Zaehlungen mit derselben Thesenkennung (gleicher Ursprung): die besser platzierte ist nicht geeignet (G3), die schlechter platzierte schon (G5) */
  const shadow = item(count("IMPULSE", [10, 30, 16]), ["G3"], 1), real = item(count("IMPULSE", [10, 30, 18]), ["G5"], 6);
  const other = item(count("IMPULSE", [40, 20, 32], { m: 3, invalidation: { price: 40, direction: "above", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } }), ["G2"], 9);
  const weak = item(count("IMPULSE", [12, 40, 20], { m: 4 }), ["G3", "G4"], 2);
  const all = [shadow, real, other, weak];
  const full = PJ.build(withExplore(E(corr()), all), ctx(22)), slimmed = PJ.build(withExplore(E(corr()), L.highlightEligibleItems(all)), ctx(22));
  assert.ok(full.exploreHighlights.length >= 1);
  assert.equal(JSON.stringify(slimmed.exploreHighlights), JSON.stringify(full.exploreHighlights));
  assert.equal(full.exploreHighlights[0].qualityGates.failed.join(), "G5", "bei gleicher Kennung gewinnt die geeignete Zählung");
  assert.ok(L.highlightEligibleItems(all).length < all.length);
  assert.equal(JSON.stringify(slimmed.primary), JSON.stringify(full.primary));
});
