/* TECHNICAL INTELLIGENCE — Produktschicht API v3 (scripts/technical/lib/ti-product.mjs)
   Datenvertrag, zwei Ebenen (Strukturklarheit ≠ Evidenz), Persistenz-Replay, Neuzuordnung. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadGoldenDaily } from "../../scripts/technical/lib/ti-data.mjs";
import { analyzeProduct, elliottReplay, transition, clarityOf, evidenceBadge, overlaysOf, elliottTransparency, REPLAY_STEPS } from "../../scripts/technical/lib/ti-product.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const EV2 = require("../engines/technical/elliott/elliott-v2.js");
const NVDA = loadGoldenDaily("NVDA");

test("PR-1 · Datenvertrag: Zonen, Ungueltig-Linien und Pfade je Szenario; Korridor waechst mit dem Abstand", () => {
  const { res } = analyzeProduct(NVDA, { symbol: "NVDA" });
  const ov = overlaysOf(res);
  assert.ok(ov.zones.length >= 1);
  ov.zones.forEach((z) => assert.ok(z.low < z.high && ["PRIMARY", "ALTERNATIVE", "TAIL"].includes(z.scenario)));
  ov.invalidations.forEach((x) => assert.ok(["above", "below"].includes(x.direction) && x.basis === "CLOSE"));
  ov.projectedPaths.forEach((p) => { assert.equal(p.points[0].step, 0); for (let k = 2; k < p.points.length; k++) assert.ok(p.points[k].half >= p.points[k - 1].half); });
  assert.ok(/ohne Zeitangabe/.test(ov.note));
});

test("PR-2 · Zwei Ebenen: Strukturklarheit ist keine Wahrscheinlichkeit; Evidenz-Status nie 'bestaetigt' ohne Test", () => {
  const { res } = analyzeProduct(NVDA, { symbol: "NVDA" });
  const c = clarityOf(res);
  assert.ok(["CLEAR", "MODERATE", "AMBIGUOUS"].includes(c.level) && /nicht die Wahrscheinlichkeit/.test(c.note));
  assert.equal(clarityOf({ confidence: { agreement: "HIGH" }, outlook: { label: "MIXED" } }).level, "AMBIGUOUS");
  assert.equal(evidenceBadge({ confidence: { empirical: null } }).level, "NO_DATA");
  assert.equal(evidenceBadge({ confidence: { empirical: { status: "OK", n: 100, liftCiLow: -0.01 } } }).level, "NOT_ESTABLISHED");
  assert.equal(evidenceBadge({ confidence: { empirical: { status: "OK", n: 100, liftCiLow: 0.01 } } }).level, "EXPERIMENTAL");
});

test("PR-3 · Persistenz-Replay: kausal (vergiftete Zukunft nach dem letzten Bar egal), Neuzuordnungs-Risiko definiert", () => {
  const t = NVDA.length - 40;
  const cut = Canonical.slice(NVDA, t);
  const a = analyzeProduct(cut, { symbol: "NVDA" });
  const patches = []; for (let k = t + 1; k < NVDA.length; k++) patches.push({ index: k, open: 1, high: 9999, low: 0.5, close: 1, volume: 1 });
  const b = analyzeProduct(Canonical.slice(Canonical.revise(NVDA, patches, "poison"), t), { symbol: "NVDA" });
  const strip = (r) => { const o = JSON.parse(JSON.stringify(r.res)); delete o.diagnostics.computeMs; delete o.dataQuality.dataVersion; return JSON.stringify(o); };
  assert.equal(strip(a), strip(b));
  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(a.replay.relabelingRisk) && a.replay.steps === REPLAY_STEPS);
  const tr = elliottTransparency(a.res, a.replay);
  assert.ok(tr === null || (tr.ruleViolations === 0 && tr.relabeling.risk === a.replay.relabelingRisk));
});

test("PR-4 · Uebergaenge: gleiche Lesart, Neuzuordnung, Neustart nach Abschluss oder Bruch", () => {
  const prev = { key: "IMPULSE|10|1", complete: false, inv: 100, invDir: "below" };
  assert.equal(transition(prev, { key: "IMPULSE|10|1" }, 120), "SAME");
  assert.equal(transition(prev, { key: "ZIGZAG|12|-1" }, 120), "RELABEL");
  assert.equal(transition(prev, { key: "ZIGZAG|12|-1" }, 95), "RESET");
  assert.equal(transition(Object.assign({}, prev, { complete: true }), { key: "ZIGZAG|12|-1" }, 120), "RESET");
});

test("PR-5 · Erkennungsverzug liest nur bis asOf bestaetigte Pivots (Review-Fix)", () => {
  const Ctx = require("../engines/technical/ti/context.js");
  const P = Ctx.prepare(NVDA);
  for (const t of [1200, 1800, 2400]) {
    const E = EV2.analyzeElliottV2({ series: NVDA, features: P.features, pivots: P.pivots, asOfIndex: t });
    const d = E.primary && E.primary.detection;
    if (d && d.earliestConfirmIndex !== null) assert.ok(d.earliestConfirmIndex <= t, "t=" + t);
  }
});

test("PR-6 · Replay-Zustaende: jeder Schritt bekommt nur den Vortageszustand", () => {
  const Ctx = require("../engines/technical/ti/engine.js");
  const P = Ctx.prepare(NVDA);
  const rep = elliottReplay(NVDA, P, 6, 4);
  const ts = Object.keys(rep.states).map(Number).sort((x, y) => x - y);
  assert.equal(rep.states[ts[0]], null);
  ts.slice(1).forEach((t) => assert.ok(rep.states[t] === null || typeof rep.states[t].key === "string"));
});
